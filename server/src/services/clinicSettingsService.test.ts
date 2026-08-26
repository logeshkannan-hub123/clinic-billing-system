import { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb, disconnectTestDb } from "../test/testDb.js";
import {
  BothPaymentMethodsDisabledError,
  SettingsConflictError,
  getClinicSettings,
  getDisplaySettings,
  getCachedSessionTimeoutMinutes,
  getTaxConfig,
  loadSessionTimeoutCache,
  resetSessionTimeoutCacheForTests,
  updateClinicSettings,
  updateTaxConfig,
} from "./clinicSettingsService.js";

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("getTaxConfig", () => {
  it("defaults to tax disabled when never configured", async () => {
    expect(await getTaxConfig()).toEqual({ taxEnabled: false, taxRateBasisPoints: null });
  });
});

describe("updateTaxConfig", () => {
  it("enables tax with a rate", async () => {
    const updated = await updateTaxConfig(
      { taxEnabled: true, taxRateBasisPoints: 500 },
      new Types.ObjectId(),
    );
    expect(updated).toEqual({ taxEnabled: true, taxRateBasisPoints: 500 });
    expect(await getTaxConfig()).toEqual({ taxEnabled: true, taxRateBasisPoints: 500 });
  });

  it("clears the rate when disabling tax", async () => {
    await updateTaxConfig({ taxEnabled: true, taxRateBasisPoints: 500 }, new Types.ObjectId());
    const updated = await updateTaxConfig(
      { taxEnabled: false, taxRateBasisPoints: null },
      new Types.ObjectId(),
    );
    expect(updated).toEqual({ taxEnabled: false, taxRateBasisPoints: null });
  });

  it("forces the rate to null when disabling even if a rate is passed", async () => {
    const updated = await updateTaxConfig(
      { taxEnabled: false, taxRateBasisPoints: 500 },
      new Types.ObjectId(),
    );
    expect(updated.taxRateBasisPoints).toBeNull();
  });
});

describe("getClinicSettings", () => {
  it("returns documented defaults when never configured", async () => {
    const settings = await getClinicSettings();
    expect(settings.clinic.name).toBe("VMF HEALTH CARE");
    expect(settings.billing.invoicePrefix).toBe("INV");
    expect(settings.payments).toEqual({ cashEnabled: true, upiEnabled: true });
    expect(settings.security.sessionTimeoutMinutes).toBe(720);
  });

  it("is unaffected by tax settings and vice versa (same document, different fields)", async () => {
    await updateTaxConfig({ taxEnabled: true, taxRateBasisPoints: 500 }, new Types.ObjectId());
    await updateClinicSettings({ clinic: { name: "Test Clinic" } }, new Types.ObjectId());

    expect(await getTaxConfig()).toEqual({ taxEnabled: true, taxRateBasisPoints: 500 });
    expect((await getClinicSettings()).clinic.name).toBe("Test Clinic");
  });
});

describe("updateClinicSettings", () => {
  it("partially updates one section, leaving sibling fields and other sections untouched", async () => {
    await updateClinicSettings(
      { clinic: { name: "Original Name", doctorName: "Dr. Rao" } },
      new Types.ObjectId(),
    );

    const updated = await updateClinicSettings(
      { clinic: { name: "Renamed Clinic" } },
      new Types.ObjectId(),
    );

    expect(updated.clinic.name).toBe("Renamed Clinic");
    expect(updated.clinic.doctorName).toBe("Dr. Rao");
    expect(updated.billing.invoicePrefix).toBe("INV");
  });

  it("updates multiple sections in one call", async () => {
    const updated = await updateClinicSettings(
      {
        billing: { invoicePrefix: "CLN" },
        receipt: { paperSize: "THERMAL_80MM" },
      },
      new Types.ObjectId(),
    );
    expect(updated.billing.invoicePrefix).toBe("CLN");
    expect(updated.receipt.paperSize).toBe("THERMAL_80MM");
  });

  it("survives being read back after the update (persistence)", async () => {
    await updateClinicSettings({ clinic: { name: "Persisted Clinic" } }, new Types.ObjectId());
    expect((await getClinicSettings()).clinic.name).toBe("Persisted Clinic");
  });

  it("rejects disabling both payment methods at once", async () => {
    await expect(
      updateClinicSettings(
        { payments: { cashEnabled: false, upiEnabled: false } },
        new Types.ObjectId(),
      ),
    ).rejects.toBeInstanceOf(BothPaymentMethodsDisabledError);
  });

  it("allows disabling one payment method while the other stays enabled", async () => {
    const updated = await updateClinicSettings(
      { payments: { upiEnabled: false } },
      new Types.ObjectId(),
    );
    expect(updated.payments).toEqual({ cashEnabled: true, upiEnabled: false });
  });

  it("rejects the loser of two concurrent updates instead of one silently overwriting the other", async () => {
    // Establish the document first (version 0) so both concurrent calls
    // below read the *same* starting version — otherwise the first call
    // here would itself create the doc and this wouldn't test a real race.
    await updateClinicSettings({ clinic: { name: "Baseline" } }, new Types.ObjectId());

    const results = await Promise.allSettled([
      updateClinicSettings({ billing: { invoicePrefix: "AAA" } }, new Types.ObjectId()),
      updateClinicSettings({ clinic: { doctorName: "Dr. Winner" } }, new Types.ObjectId()),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    // Exactly one of the two concurrent writes must win — never both
    // silently applied (that would hide the race) and never both lost.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SettingsConflictError);

    // The loser's change must NOT be silently merged in behind the winner's
    // back — the document reflects exactly one of the two attempted patches.
    const final = await getClinicSettings();
    const invoicePrefixWon = final.billing.invoicePrefix === "AAA";
    const doctorNameWon = final.clinic.doctorName === "Dr. Winner";
    expect(invoicePrefixWon !== doctorNameWon).toBe(true);
  });

  it("refreshes the session-timeout cache when security is part of the update", async () => {
    resetSessionTimeoutCacheForTests();
    expect(getCachedSessionTimeoutMinutes()).toBe(720);

    await updateClinicSettings({ security: { sessionTimeoutMinutes: 30 } }, new Types.ObjectId());

    expect(getCachedSessionTimeoutMinutes()).toBe(30);
  });

  it("does not touch the session-timeout cache when security isn't part of the update", async () => {
    resetSessionTimeoutCacheForTests();
    await updateClinicSettings({ clinic: { name: "No Security Change" } }, new Types.ObjectId());
    expect(getCachedSessionTimeoutMinutes()).toBe(720);
  });
});

describe("getDisplaySettings", () => {
  it("exposes only the receptionist-facing subset, excluding security and billing internals", async () => {
    await updateClinicSettings(
      {
        clinic: { name: "Display Test Clinic" },
        billing: { invoicePrefix: "DSP", defaultConsultationFeeInPaise: 5000 },
        security: { sessionTimeoutMinutes: 60 },
      },
      new Types.ObjectId(),
    );

    const display = await getDisplaySettings();
    expect(display.clinic.name).toBe("Display Test Clinic");
    expect(display.defaultConsultationFeeInPaise).toBe(5000);
    expect(display.payments).toEqual({ cashEnabled: true, upiEnabled: true });
    expect((display as unknown as Record<string, unknown>).security).toBeUndefined();
    expect((display as unknown as Record<string, unknown>).invoicePrefix).toBeUndefined();
  });
});

describe("session-timeout cache", () => {
  beforeEach(() => {
    resetSessionTimeoutCacheForTests();
  });

  it("loadSessionTimeoutCache reads the persisted value on startup", async () => {
    await updateClinicSettings({ security: { sessionTimeoutMinutes: 45 } }, new Types.ObjectId());
    resetSessionTimeoutCacheForTests();
    expect(getCachedSessionTimeoutMinutes()).toBe(720);

    await loadSessionTimeoutCache();

    expect(getCachedSessionTimeoutMinutes()).toBe(45);
  });

  it("loadSessionTimeoutCache falls back to the default when unconfigured", async () => {
    await loadSessionTimeoutCache();
    expect(getCachedSessionTimeoutMinutes()).toBe(720);
  });
});
