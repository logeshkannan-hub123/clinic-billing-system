import mongoose, { Schema, model, type Model, type Types } from "mongoose";
import { DATE_FORMATS, RECEIPT_PAPER_SIZES, TIME_FORMATS } from "./enums.js";
import { integerValidator, nullableBasisPointsValidator } from "./money.js";
import {
  integerRangeValidator,
  invoicePrefixValidator,
  maxLengthValidator,
  nullableEmailValidator,
  nullableHttpUrlValidator,
} from "./settingsValidators.js";

export const CLINIC_SETTINGS_ID = "clinic";

// Defaults intentionally mirror current hardcoded behavior (client's
// CLINIC_NAME constant, the "INV" prefix in BillSequence.ts, the 12h session
// in session.ts) so introducing this document changes nothing for an existing
// deployment until an Admin explicitly edits a value.
export const CLINIC_INFO_DEFAULTS = {
  name: "VMF HEALTH CARE",
  doctorName: "",
  logoUrl: null,
  phone: "",
  email: "",
  website: "",
  address: "",
  registrationNumber: "",
  gstNumber: "",
};

export const BILLING_SETTINGS_DEFAULTS = {
  invoicePrefix: "INV",
  allowPartialPayments: true,
  duplicateWarningEnabled: true,
  defaultConsultationFeeInPaise: 0,
};

export const RECEIPT_SETTINGS_DEFAULTS = {
  showLogo: true,
  showClinicAddress: true,
  showClinicPhone: true,
  showDoctorName: true,
  showTax: true,
  showPaymentMethod: true,
  showPaymentHistory: true,
  paperSize: "A4" as const,
  footerText: "",
};

export const PAYMENT_SETTINGS_DEFAULTS = {
  cashEnabled: true,
  upiEnabled: true,
};

export const REGIONAL_SETTINGS_DEFAULTS = {
  currencySymbol: "₹",
  dateFormat: "DD/MM/YYYY" as const,
  timeFormat: "12h" as const,
};

export const SECURITY_SETTINGS_DEFAULTS = {
  sessionTimeoutMinutes: 720,
};

interface ClinicSettingsLike {
  taxEnabled: boolean;
  taxRateBasisPoints: number | null;
}

export interface ClinicInfo {
  name: string;
  doctorName: string;
  logoUrl: string | null;
  phone: string;
  email: string;
  website: string;
  address: string;
  registrationNumber: string;
  gstNumber: string;
}

export interface BillingSettings {
  invoicePrefix: string;
  allowPartialPayments: boolean;
  duplicateWarningEnabled: boolean;
  defaultConsultationFeeInPaise: number;
}

export interface ReceiptSettings {
  showLogo: boolean;
  showClinicAddress: boolean;
  showClinicPhone: boolean;
  showDoctorName: boolean;
  showTax: boolean;
  showPaymentMethod: boolean;
  showPaymentHistory: boolean;
  paperSize: (typeof RECEIPT_PAPER_SIZES)[number];
  footerText: string;
}

export interface PaymentMethodSettings {
  cashEnabled: boolean;
  upiEnabled: boolean;
}

export interface RegionalSettings {
  currencySymbol: string;
  dateFormat: (typeof DATE_FORMATS)[number];
  timeFormat: (typeof TIME_FORMATS)[number];
}

export interface SecuritySettings {
  sessionTimeoutMinutes: number;
}

export interface ClinicSettingsDoc extends ClinicSettingsLike {
  _id: string;
  updatedBy: Types.ObjectId | null;
  clinic: ClinicInfo;
  billing: BillingSettings;
  receipt: ReceiptSettings;
  payments: PaymentMethodSettings;
  regional: RegionalSettings;
  security: SecuritySettings;
}

const clinicInfoSchema = new Schema<ClinicInfo>(
  {
    name: { type: String, default: CLINIC_INFO_DEFAULTS.name, trim: true, validate: maxLengthValidator(200) },
    doctorName: { type: String, default: "", trim: true, validate: maxLengthValidator(150) },
    logoUrl: { type: String, default: null, validate: [nullableHttpUrlValidator, maxLengthValidator(500)] },
    phone: { type: String, default: "", trim: true, validate: maxLengthValidator(30) },
    email: { type: String, default: "", trim: true, validate: [nullableEmailValidator, maxLengthValidator(200)] },
    website: { type: String, default: "", trim: true, validate: [nullableHttpUrlValidator, maxLengthValidator(500)] },
    address: { type: String, default: "", trim: true, validate: maxLengthValidator(500) },
    registrationNumber: { type: String, default: "", trim: true, validate: maxLengthValidator(50) },
    gstNumber: { type: String, default: "", trim: true, validate: maxLengthValidator(50) },
  },
  { _id: false },
);

const billingSettingsSchema = new Schema<BillingSettings>(
  {
    invoicePrefix: {
      type: String,
      default: BILLING_SETTINGS_DEFAULTS.invoicePrefix,
      validate: invoicePrefixValidator,
    },
    allowPartialPayments: { type: Boolean, default: BILLING_SETTINGS_DEFAULTS.allowPartialPayments },
    duplicateWarningEnabled: { type: Boolean, default: BILLING_SETTINGS_DEFAULTS.duplicateWarningEnabled },
    defaultConsultationFeeInPaise: {
      type: Number,
      default: BILLING_SETTINGS_DEFAULTS.defaultConsultationFeeInPaise,
      min: 0,
      validate: integerValidator,
    },
  },
  { _id: false },
);

const receiptSettingsSchema = new Schema<ReceiptSettings>(
  {
    showLogo: { type: Boolean, default: RECEIPT_SETTINGS_DEFAULTS.showLogo },
    showClinicAddress: { type: Boolean, default: RECEIPT_SETTINGS_DEFAULTS.showClinicAddress },
    showClinicPhone: { type: Boolean, default: RECEIPT_SETTINGS_DEFAULTS.showClinicPhone },
    showDoctorName: { type: Boolean, default: RECEIPT_SETTINGS_DEFAULTS.showDoctorName },
    showTax: { type: Boolean, default: RECEIPT_SETTINGS_DEFAULTS.showTax },
    showPaymentMethod: { type: Boolean, default: RECEIPT_SETTINGS_DEFAULTS.showPaymentMethod },
    showPaymentHistory: { type: Boolean, default: RECEIPT_SETTINGS_DEFAULTS.showPaymentHistory },
    paperSize: { type: String, enum: RECEIPT_PAPER_SIZES, default: RECEIPT_SETTINGS_DEFAULTS.paperSize },
    footerText: { type: String, default: "", trim: true, validate: maxLengthValidator(300) },
  },
  { _id: false },
);

// "At least one payment method must remain enabled" is enforced explicitly in
// clinicSettingsService.updateClinicSettings (BothPaymentMethodsDisabledError),
// not as a schema-level validator here — Mongoose's TS typings don't expose a
// document-wide `validate` option on a subdocument schema, and the service
// layer is the primary validation point for this codebase's convention
// anyway (see billService.ts's own hand-rolled checks).
const paymentSettingsSchema = new Schema<PaymentMethodSettings>(
  {
    cashEnabled: { type: Boolean, default: PAYMENT_SETTINGS_DEFAULTS.cashEnabled },
    upiEnabled: { type: Boolean, default: PAYMENT_SETTINGS_DEFAULTS.upiEnabled },
  },
  { _id: false },
);

const regionalSettingsSchema = new Schema<RegionalSettings>(
  {
    currencySymbol: {
      type: String,
      default: REGIONAL_SETTINGS_DEFAULTS.currencySymbol,
      trim: true,
      validate: maxLengthValidator(5),
    },
    dateFormat: { type: String, enum: DATE_FORMATS, default: REGIONAL_SETTINGS_DEFAULTS.dateFormat },
    timeFormat: { type: String, enum: TIME_FORMATS, default: REGIONAL_SETTINGS_DEFAULTS.timeFormat },
  },
  { _id: false },
);

const securitySettingsSchema = new Schema<SecuritySettings>(
  {
    sessionTimeoutMinutes: {
      type: Number,
      default: SECURITY_SETTINGS_DEFAULTS.sessionTimeoutMinutes,
      validate: integerRangeValidator(15, 1440),
    },
  },
  { _id: false },
);

const clinicSettingsSchema = new Schema<ClinicSettingsDoc>(
  {
    _id: { type: String, required: true },
    taxEnabled: { type: Boolean, required: true, default: false },
    taxRateBasisPoints: {
      type: Number,
      default: null,
      validate: [
        nullableBasisPointsValidator,
        {
          validator: function (this: ClinicSettingsLike, value: number | null) {
            return this.taxEnabled ? value !== null && value !== undefined : value == null;
          },
          message:
            "{PATH} must be set when taxEnabled is true, and left unset when taxEnabled is false",
        },
      ],
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    clinic: { type: clinicInfoSchema, default: () => ({}) },
    billing: { type: billingSettingsSchema, default: () => ({}) },
    receipt: { type: receiptSettingsSchema, default: () => ({}) },
    payments: { type: paymentSettingsSchema, default: () => ({}) },
    regional: { type: regionalSettingsSchema, default: () => ({}) },
    security: { type: securitySettingsSchema, default: () => ({}) },
  },
  // `versionKey` defaults to true (the standard `__v` field) and
  // `optimisticConcurrency` is turned on explicitly — Mongoose's `__v` alone
  // only guards a narrow set of array operations; without this flag, two
  // concurrent plain-field `.save()` calls are NOT checked against each
  // other at all, and this singleton document (admins can PATCH it
  // concurrently — e.g. two browser tabs editing different sections at once)
  // would silently allow a lost update. With it on, `.save()` throws
  // Mongoose's VersionError on a real conflict — see
  // clinicSettingsService.ts's handling of that error.
  { timestamps: true, optimisticConcurrency: true },
);

export const ClinicSettingsModel =
  (mongoose.models.ClinicSettings as Model<ClinicSettingsDoc>) ??
  model<ClinicSettingsDoc>("ClinicSettings", clinicSettingsSchema);
