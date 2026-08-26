import { describe, expect, it } from "vitest";
import { CLINIC_SETTINGS_ID, ClinicSettingsModel } from "./ClinicSettings.js";

describe("ClinicSettings model", () => {
  it("passes validation when tax is disabled with no rate", () => {
    const settings = new ClinicSettingsModel({ _id: CLINIC_SETTINGS_ID, taxEnabled: false });
    expect(settings.validateSync()).toBeUndefined();
  });

  it("passes validation when tax is enabled with a rate", () => {
    const settings = new ClinicSettingsModel({
      _id: CLINIC_SETTINGS_ID,
      taxEnabled: true,
      taxRateBasisPoints: 500,
    });
    expect(settings.validateSync()).toBeUndefined();
  });

  it("rejects taxEnabled true without a rate", () => {
    const settings = new ClinicSettingsModel({ _id: CLINIC_SETTINGS_ID, taxEnabled: true });
    const error = settings.validateSync();
    expect(error?.errors.taxRateBasisPoints).toBeDefined();
  });

  it("rejects a rate set while taxEnabled is false", () => {
    const settings = new ClinicSettingsModel({
      _id: CLINIC_SETTINGS_ID,
      taxEnabled: false,
      taxRateBasisPoints: 500,
    });
    const error = settings.validateSync();
    expect(error?.errors.taxRateBasisPoints).toBeDefined();
  });

  it("rejects a rate above 10000 basis points", () => {
    const settings = new ClinicSettingsModel({
      _id: CLINIC_SETTINGS_ID,
      taxEnabled: true,
      taxRateBasisPoints: 20000,
    });
    const error = settings.validateSync();
    expect(error?.errors.taxRateBasisPoints).toBeDefined();
  });
});

describe("ClinicSettings extended sections — defaults", () => {
  it("applies documented defaults to every new section when unset", () => {
    const settings = new ClinicSettingsModel({ _id: CLINIC_SETTINGS_ID });
    expect(settings.validateSync()).toBeUndefined();
    expect(settings.clinic.name).toBe("VMF HEALTH CARE");
    expect(settings.clinic.logoUrl).toBeNull();
    expect(settings.billing.invoicePrefix).toBe("INV");
    expect(settings.billing.allowPartialPayments).toBe(true);
    expect(settings.billing.duplicateWarningEnabled).toBe(true);
    expect(settings.billing.defaultConsultationFeeInPaise).toBe(0);
    expect(settings.receipt.paperSize).toBe("A4");
    expect(settings.payments.cashEnabled).toBe(true);
    expect(settings.payments.upiEnabled).toBe(true);
    expect(settings.regional.currencySymbol).toBe("₹");
    expect(settings.regional.dateFormat).toBe("DD/MM/YYYY");
    expect(settings.regional.timeFormat).toBe("12h");
    expect(settings.security.sessionTimeoutMinutes).toBe(720);
  });
});

describe("ClinicSettings extended sections — validation", () => {
  it("rejects an invoicePrefix with lowercase or symbol characters", () => {
    const settings = new ClinicSettingsModel({
      _id: CLINIC_SETTINGS_ID,
      billing: { invoicePrefix: "inv-2" },
    });
    const error = settings.validateSync();
    expect(error?.errors["billing.invoicePrefix"]).toBeDefined();
  });

  it("rejects a logoUrl that isn't http(s)", () => {
    const settings = new ClinicSettingsModel({
      _id: CLINIC_SETTINGS_ID,
      clinic: { logoUrl: "javascript:alert(1)" },
    });
    const error = settings.validateSync();
    expect(error?.errors["clinic.logoUrl"]).toBeDefined();
  });

  it("rejects an invalid email shape", () => {
    const settings = new ClinicSettingsModel({
      _id: CLINIC_SETTINGS_ID,
      clinic: { email: "not-an-email" },
    });
    const error = settings.validateSync();
    expect(error?.errors["clinic.email"]).toBeDefined();
  });

  it("rejects a paperSize outside the enum", () => {
    const settings = new ClinicSettingsModel({
      _id: CLINIC_SETTINGS_ID,
      receipt: { paperSize: "LETTER" },
    });
    const error = settings.validateSync();
    expect(error?.errors["receipt.paperSize"]).toBeDefined();
  });

  it("rejects a sessionTimeoutMinutes outside 15-1440", () => {
    const tooLow = new ClinicSettingsModel({
      _id: CLINIC_SETTINGS_ID,
      security: { sessionTimeoutMinutes: 5 },
    });
    expect(tooLow.validateSync()?.errors["security.sessionTimeoutMinutes"]).toBeDefined();

    const tooHigh = new ClinicSettingsModel({
      _id: CLINIC_SETTINGS_ID,
      security: { sessionTimeoutMinutes: 5000 },
    });
    expect(tooHigh.validateSync()?.errors["security.sessionTimeoutMinutes"]).toBeDefined();
  });

  it("rejects a negative defaultConsultationFeeInPaise", () => {
    const settings = new ClinicSettingsModel({
      _id: CLINIC_SETTINGS_ID,
      billing: { defaultConsultationFeeInPaise: -100 },
    });
    const error = settings.validateSync();
    expect(error?.errors["billing.defaultConsultationFeeInPaise"]).toBeDefined();
  });

  it("rejects a clinic.name longer than 200 characters", () => {
    const settings = new ClinicSettingsModel({
      _id: CLINIC_SETTINGS_ID,
      clinic: { name: "a".repeat(201) },
    });
    const error = settings.validateSync();
    expect(error?.errors["clinic.name"]).toBeDefined();
  });
});
