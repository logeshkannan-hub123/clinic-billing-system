import type { Types } from "mongoose";
import {
  CLINIC_SETTINGS_ID,
  ClinicSettingsModel,
  SECURITY_SETTINGS_DEFAULTS,
  type BillingSettings,
  type ClinicInfo,
  type PaymentMethodSettings,
  type ReceiptSettings,
  type RegionalSettings,
  type SecuritySettings,
} from "../models/ClinicSettings.js";

export interface TaxConfig {
  taxEnabled: boolean;
  taxRateBasisPoints: number | null;
}

/** Thrown when a concurrent PATCH already changed the settings document
 * between this request's read and its write — see the `.save()` calls below.
 * Mapped to a 409 by the route layer, telling the caller to reload the
 * current settings and retry, rather than the two updates silently
 * clobbering each other. */
export class SettingsConflictError extends Error {}

function isVersionError(error: unknown): boolean {
  return error instanceof Error && error.name === "VersionError";
}

export async function getTaxConfig(): Promise<TaxConfig> {
  const settings = await ClinicSettingsModel.findById(CLINIC_SETTINGS_ID).lean();
  if (!settings) {
    return { taxEnabled: false, taxRateBasisPoints: null };
  }
  return { taxEnabled: settings.taxEnabled, taxRateBasisPoints: settings.taxRateBasisPoints };
}

export async function updateTaxConfig(
  input: TaxConfig,
  updatedBy: Types.ObjectId,
): Promise<TaxConfig> {
  // Load-then-save (rather than a raw upsert) so the schema's cross-field
  // validator (rate required iff enabled) runs against the full document,
  // not just the update payload.
  const settings =
    (await ClinicSettingsModel.findById(CLINIC_SETTINGS_ID)) ??
    new ClinicSettingsModel({ _id: CLINIC_SETTINGS_ID });

  settings.taxEnabled = input.taxEnabled;
  settings.taxRateBasisPoints = input.taxEnabled ? input.taxRateBasisPoints : null;
  settings.updatedBy = updatedBy;
  try {
    await settings.save();
  } catch (error) {
    if (isVersionError(error)) throw new SettingsConflictError();
    throw error;
  }

  return { taxEnabled: settings.taxEnabled, taxRateBasisPoints: settings.taxRateBasisPoints };
}

// ---------------------------------------------------------------------------
// Extended clinic settings (GET/PATCH /api/admin/clinic-settings). Same
// singleton document as the tax config above — a different set of fields on
// it, not a second document — so both endpoints stay in sync automatically.
// ---------------------------------------------------------------------------

export class BothPaymentMethodsDisabledError extends Error {}

export interface ClinicSettingsSections {
  clinic: ClinicInfo;
  billing: BillingSettings;
  receipt: ReceiptSettings;
  payments: PaymentMethodSettings;
  regional: RegionalSettings;
  security: SecuritySettings;
}

export type ClinicSettingsPatch = Partial<{
  clinic: Partial<ClinicInfo>;
  billing: Partial<BillingSettings>;
  receipt: Partial<ReceiptSettings>;
  payments: Partial<PaymentMethodSettings>;
  regional: Partial<RegionalSettings>;
  security: Partial<SecuritySettings>;
}>;

function toSections(
  settings: Pick<ClinicSettingsSections, keyof ClinicSettingsSections> | null,
): ClinicSettingsSections {
  // Mongoose applies schema defaults even on a brand-new, unsaved document,
  // so constructing one (never persisted) is a cheap way to read "what would
  // the defaults be" without duplicating the default values in a second place.
  // `.toObject()` is required here: spreading a live Mongoose (sub)document
  // with `{...doc}` only copies its internal bookkeeping properties, not the
  // getter-backed schema fields — only a plain object (from `.lean()` or
  // `.toObject()`) spreads correctly.
  const source = settings ?? new ClinicSettingsModel({ _id: CLINIC_SETTINGS_ID }).toObject();
  return {
    clinic: { ...source.clinic },
    billing: { ...source.billing },
    receipt: { ...source.receipt },
    payments: { ...source.payments },
    regional: { ...source.regional },
    security: { ...source.security },
  };
}

export async function getClinicSettings(): Promise<ClinicSettingsSections> {
  const settings = await ClinicSettingsModel.findById(CLINIC_SETTINGS_ID).lean();
  return toSections(settings);
}

/** Narrow, read-only projection for GET /api/settings/display — Admin *and*
 * Receptionist. Only the fields the billing/receipt UI actually needs to
 * render correctly; deliberately excludes `security`, `updatedBy`, and the
 * billing internals (`invoicePrefix`, `duplicateWarningEnabled`) that aren't
 * needed outside the Settings page itself. */
export interface DisplaySettings {
  clinic: ClinicInfo;
  receipt: ReceiptSettings;
  payments: PaymentMethodSettings;
  defaultConsultationFeeInPaise: number;
}

export async function getDisplaySettings(): Promise<DisplaySettings> {
  const sections = await getClinicSettings();
  return {
    clinic: sections.clinic,
    receipt: sections.receipt,
    payments: sections.payments,
    defaultConsultationFeeInPaise: sections.billing.defaultConsultationFeeInPaise,
  };
}

/**
 * Partial, per-section update. Each provided section is shallow-merged onto
 * the existing subdocument (fields not present in the patch are untouched);
 * sections not present in `patch` at all are left completely alone. The
 * caller (route layer) is responsible for validating `patch`'s shape/values
 * before calling this — this function trusts its input, matching the
 * existing `updateTaxConfig` pattern, with the schema's own validators as a
 * defense-in-depth backstop on `.save()`.
 */
export async function updateClinicSettings(
  patch: ClinicSettingsPatch,
  updatedBy: Types.ObjectId,
): Promise<ClinicSettingsSections> {
  const settings =
    (await ClinicSettingsModel.findById(CLINIC_SETTINGS_ID)) ??
    new ClinicSettingsModel({ _id: CLINIC_SETTINGS_ID });

  if (patch.clinic) Object.assign(settings.clinic, patch.clinic);
  if (patch.billing) Object.assign(settings.billing, patch.billing);
  if (patch.receipt) Object.assign(settings.receipt, patch.receipt);
  if (patch.payments) Object.assign(settings.payments, patch.payments);
  if (patch.regional) Object.assign(settings.regional, patch.regional);
  if (patch.security) Object.assign(settings.security, patch.security);
  settings.updatedBy = updatedBy;

  // Checked explicitly here (not left to the schema validator alone) so the
  // route layer can catch a specific, typed error and return a clean 400 —
  // matching this codebase's established convention (see billService.ts) of
  // never surfacing a raw Mongoose ValidationError as an API response.
  if (!settings.payments.cashEnabled && !settings.payments.upiEnabled) {
    throw new BothPaymentMethodsDisabledError();
  }

  try {
    await settings.save();
  } catch (error) {
    if (isVersionError(error)) throw new SettingsConflictError();
    throw error;
  }

  if (patch.security) {
    refreshSessionTimeoutCache(settings.security.sessionTimeoutMinutes);
  }

  return toSections(settings.toObject());
}

// ---------------------------------------------------------------------------
// Session-timeout cache — read on (almost) every request by the session
// middleware, so it's kept in-process and refreshed synchronously whenever
// `security.sessionTimeoutMinutes` changes, rather than re-querying MongoDB
// per request for a value that changes only when an Admin saves it.
// ---------------------------------------------------------------------------

let cachedSessionTimeoutMinutes = SECURITY_SETTINGS_DEFAULTS.sessionTimeoutMinutes;

export function getCachedSessionTimeoutMinutes(): number {
  return cachedSessionTimeoutMinutes;
}

function refreshSessionTimeoutCache(minutes: number): void {
  cachedSessionTimeoutMinutes = minutes;
}

/** Call once at process startup (after the DB connects) so the cache reflects
 * a value an Admin already saved in a previous process, rather than silently
 * resetting to the schema default on every server restart. Also exported for
 * tests to explicitly (re)sync the cache with a fresh test database. */
export async function loadSessionTimeoutCache(): Promise<void> {
  const settings = await ClinicSettingsModel.findById(CLINIC_SETTINGS_ID)
    .select("security")
    .lean();
  cachedSessionTimeoutMinutes =
    settings?.security?.sessionTimeoutMinutes ?? SECURITY_SETTINGS_DEFAULTS.sessionTimeoutMinutes;
}

/** Test-only: resets the in-process cache to the schema default, so tests
 * that don't explicitly load it don't leak a value set by an earlier test in
 * the same file (the cache is a module-level singleton, not per-test-db). */
export function resetSessionTimeoutCacheForTests(): void {
  cachedSessionTimeoutMinutes = SECURITY_SETTINGS_DEFAULTS.sessionTimeoutMinutes;
}
