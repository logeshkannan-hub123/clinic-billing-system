import { Router } from "express";
import { Types } from "mongoose";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { DATE_FORMATS, RECEIPT_PAPER_SIZES, TIME_FORMATS } from "../models/enums.js";
import { recordAuditEvent } from "../services/auditLog.js";
import {
  BothPaymentMethodsDisabledError,
  SettingsConflictError,
  getClinicSettings,
  updateClinicSettings,
  type ClinicSettingsPatch,
} from "../services/clinicSettingsService.js";
import type { BillingSettings, ClinicInfo, PaymentMethodSettings, ReceiptSettings, RegionalSettings, SecuritySettings } from "../models/ClinicSettings.js";

const HTTP_URL_PATTERN = /^https?:\/\/[^\s]+$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVOICE_PREFIX_PATTERN = /^[A-Z0-9]{1,10}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseOptionalString(
  value: unknown,
  maxLength: number,
): { ok: true; value: string } | { ok: false } {
  if (typeof value !== "string" || value.length > maxLength) {
    return { ok: false };
  }
  return { ok: true, value: value.trim() };
}

function parseClinic(raw: unknown): { data: Partial<ClinicInfo> } | { error: string } {
  if (!isRecord(raw)) return { error: "clinic must be an object" };
  const data: Partial<ClinicInfo> = {};

  const stringFields: Array<[keyof ClinicInfo, number]> = [
    ["name", 200],
    ["doctorName", 150],
    ["phone", 30],
    ["address", 500],
    ["registrationNumber", 50],
    ["gstNumber", 50],
  ];
  for (const [field, maxLength] of stringFields) {
    if (raw[field] === undefined) continue;
    const parsed = parseOptionalString(raw[field], maxLength);
    if (!parsed.ok) return { error: `clinic.${field} must be a string of at most ${maxLength} characters` };
    (data as Record<string, string>)[field] = parsed.value;
  }

  if (raw.email !== undefined) {
    const parsed = parseOptionalString(raw.email, 200);
    if (!parsed.ok || (parsed.value !== "" && !EMAIL_PATTERN.test(parsed.value))) {
      return { error: "clinic.email must be a valid email address or an empty string" };
    }
    data.email = parsed.value;
  }

  if (raw.website !== undefined) {
    const parsed = parseOptionalString(raw.website, 500);
    if (!parsed.ok || (parsed.value !== "" && !HTTP_URL_PATTERN.test(parsed.value))) {
      return { error: "clinic.website must be a valid http(s) URL or an empty string" };
    }
    data.website = parsed.value;
  }

  if (raw.logoUrl !== undefined) {
    if (raw.logoUrl === null || raw.logoUrl === "") {
      data.logoUrl = null;
    } else if (
      typeof raw.logoUrl === "string" &&
      raw.logoUrl.length <= 500 &&
      HTTP_URL_PATTERN.test(raw.logoUrl)
    ) {
      data.logoUrl = raw.logoUrl.trim();
    } else {
      return { error: "clinic.logoUrl must be a valid http(s) URL or null" };
    }
  }

  return { data };
}

function parseBilling(raw: unknown): { data: Partial<BillingSettings> } | { error: string } {
  if (!isRecord(raw)) return { error: "billing must be an object" };
  const data: Partial<BillingSettings> = {};

  if (raw.invoicePrefix !== undefined) {
    if (typeof raw.invoicePrefix !== "string" || !INVOICE_PREFIX_PATTERN.test(raw.invoicePrefix)) {
      return { error: "billing.invoicePrefix must be 1-10 uppercase letters/digits" };
    }
    data.invoicePrefix = raw.invoicePrefix;
  }

  for (const field of ["allowPartialPayments", "duplicateWarningEnabled"] as const) {
    if (raw[field] === undefined) continue;
    if (typeof raw[field] !== "boolean") {
      return { error: `billing.${field} must be a boolean` };
    }
    data[field] = raw[field];
  }

  if (raw.defaultConsultationFeeInPaise !== undefined) {
    if (
      !Number.isInteger(raw.defaultConsultationFeeInPaise) ||
      (raw.defaultConsultationFeeInPaise as number) < 0
    ) {
      return { error: "billing.defaultConsultationFeeInPaise must be a non-negative integer" };
    }
    data.defaultConsultationFeeInPaise = raw.defaultConsultationFeeInPaise as number;
  }

  return { data };
}

function parseReceipt(raw: unknown): { data: Partial<ReceiptSettings> } | { error: string } {
  if (!isRecord(raw)) return { error: "receipt must be an object" };
  const data: Partial<ReceiptSettings> = {};

  const boolFields = [
    "showLogo",
    "showClinicAddress",
    "showClinicPhone",
    "showDoctorName",
    "showTax",
    "showPaymentMethod",
    "showPaymentHistory",
  ] as const;
  for (const field of boolFields) {
    if (raw[field] === undefined) continue;
    if (typeof raw[field] !== "boolean") {
      return { error: `receipt.${field} must be a boolean` };
    }
    data[field] = raw[field];
  }

  if (raw.paperSize !== undefined) {
    if (!(RECEIPT_PAPER_SIZES as readonly unknown[]).includes(raw.paperSize)) {
      return { error: `receipt.paperSize must be one of ${RECEIPT_PAPER_SIZES.join(", ")}` };
    }
    data.paperSize = raw.paperSize as ReceiptSettings["paperSize"];
  }

  if (raw.footerText !== undefined) {
    const parsed = parseOptionalString(raw.footerText, 300);
    if (!parsed.ok) return { error: "receipt.footerText must be a string of at most 300 characters" };
    data.footerText = parsed.value;
  }

  return { data };
}

function parsePayments(raw: unknown): { data: Partial<PaymentMethodSettings> } | { error: string } {
  if (!isRecord(raw)) return { error: "payments must be an object" };
  const data: Partial<PaymentMethodSettings> = {};

  for (const field of ["cashEnabled", "upiEnabled"] as const) {
    if (raw[field] === undefined) continue;
    if (typeof raw[field] !== "boolean") {
      return { error: `payments.${field} must be a boolean` };
    }
    data[field] = raw[field];
  }

  return { data };
}

function parseRegional(raw: unknown): { data: Partial<RegionalSettings> } | { error: string } {
  if (!isRecord(raw)) return { error: "regional must be an object" };
  const data: Partial<RegionalSettings> = {};

  if (raw.currencySymbol !== undefined) {
    if (typeof raw.currencySymbol !== "string" || raw.currencySymbol.length < 1 || raw.currencySymbol.length > 5) {
      return { error: "regional.currencySymbol must be a string of 1-5 characters" };
    }
    data.currencySymbol = raw.currencySymbol;
  }

  if (raw.dateFormat !== undefined) {
    if (!(DATE_FORMATS as readonly unknown[]).includes(raw.dateFormat)) {
      return { error: `regional.dateFormat must be one of ${DATE_FORMATS.join(", ")}` };
    }
    data.dateFormat = raw.dateFormat as RegionalSettings["dateFormat"];
  }

  if (raw.timeFormat !== undefined) {
    if (!(TIME_FORMATS as readonly unknown[]).includes(raw.timeFormat)) {
      return { error: `regional.timeFormat must be one of ${TIME_FORMATS.join(", ")}` };
    }
    data.timeFormat = raw.timeFormat as RegionalSettings["timeFormat"];
  }

  return { data };
}

function parseSecurity(raw: unknown): { data: Partial<SecuritySettings> } | { error: string } {
  if (!isRecord(raw)) return { error: "security must be an object" };
  const data: Partial<SecuritySettings> = {};

  if (raw.sessionTimeoutMinutes !== undefined) {
    if (
      !Number.isInteger(raw.sessionTimeoutMinutes) ||
      (raw.sessionTimeoutMinutes as number) < 15 ||
      (raw.sessionTimeoutMinutes as number) > 1440
    ) {
      return { error: "security.sessionTimeoutMinutes must be an integer between 15 and 1440" };
    }
    data.sessionTimeoutMinutes = raw.sessionTimeoutMinutes as number;
  }

  return { data };
}

/** Only known top-level sections are parsed; anything else in the body is
 * silently ignored — matching the existing tax-PATCH handler's own
 * convention of destructuring known fields rather than rejecting extras. */
function parsePatch(body: unknown): { data: ClinicSettingsPatch } | { error: string } {
  if (!isRecord(body)) {
    return { error: "Request body is required" };
  }

  const data: ClinicSettingsPatch = {};

  if (body.clinic !== undefined) {
    const parsed = parseClinic(body.clinic);
    if ("error" in parsed) return parsed;
    data.clinic = parsed.data;
  }
  if (body.billing !== undefined) {
    const parsed = parseBilling(body.billing);
    if ("error" in parsed) return parsed;
    data.billing = parsed.data;
  }
  if (body.receipt !== undefined) {
    const parsed = parseReceipt(body.receipt);
    if ("error" in parsed) return parsed;
    data.receipt = parsed.data;
  }
  if (body.payments !== undefined) {
    const parsed = parsePayments(body.payments);
    if ("error" in parsed) return parsed;
    data.payments = parsed.data;
  }
  if (body.regional !== undefined) {
    const parsed = parseRegional(body.regional);
    if ("error" in parsed) return parsed;
    data.regional = parsed.data;
  }
  if (body.security !== undefined) {
    const parsed = parseSecurity(body.security);
    if ("error" in parsed) return parsed;
    data.security = parsed.data;
  }

  return { data };
}

export function createAdminClinicSettingsRouter(): Router {
  const router = Router();

  router.use(requireAuth, requireRole("admin"));

  router.get("/", async (_req, res, next) => {
    try {
      const settings = await getClinicSettings();
      res.json(settings);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/", async (req, res, next) => {
    try {
      const parsed = parsePatch(req.body);
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const sections = Object.keys(parsed.data);
      const updated = await updateClinicSettings(parsed.data, new Types.ObjectId(req.user!.id));

      await recordAuditEvent("admin_settings_updated", {
        actorUserId: new Types.ObjectId(req.user!.id),
        payload: { sections, after: parsed.data },
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof BothPaymentMethodsDisabledError) {
        res.status(400).json({ error: "At least one payment method (cash or UPI) must remain enabled" });
        return;
      }
      if (error instanceof SettingsConflictError) {
        res.status(409).json({
          error: "Settings were changed by someone else just now. Reload and try again.",
        });
        return;
      }
      next(error);
    }
  });

  return router;
}
