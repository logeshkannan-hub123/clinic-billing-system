export const USER_ROLES = ["admin", "receptionist"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PAYMENT_METHODS = ["UPI", "CASH"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const BILL_STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "CANCELLED"] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const MEDICINE_CATEGORIES = ["MEDICINE", "INJECTION", "FLUID"] as const;
export type MedicineCategory = (typeof MEDICINE_CATEGORIES)[number];

export const MEDICINE_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type MedicineStatus = (typeof MEDICINE_STATUSES)[number];

export const AUDIT_EVENT_TYPES = [
  "storage_threshold_reached",
  "export_started",
  "export_completed",
  "export_failed",
  "notification_sent",
  "notification_failed",
  "bill_generated",
  "bill_cancelled",
  "payment_recorded",
  "login_succeeded",
  "login_failed",
  "logout",
  "account_created",
  "account_deactivated",
  "account_reactivated",
  "account_deleted",
  "password_reset",
  "bill_edited",
  "duplicate_bill_warning",
  "tax_settings_updated",
  "admin_settings_updated",
  "medicine_created",
  "medicine_updated",
  "medicine_status_changed",
  "medicine_deleted",
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const RECEIPT_PAPER_SIZES = ["A4", "A5", "THERMAL_80MM", "THERMAL_58MM"] as const;
export type ReceiptPaperSize = (typeof RECEIPT_PAPER_SIZES)[number];

export const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const TIME_FORMATS = ["12h", "24h"] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

// Config-driven, not a hard schema enum: extend this list to support new medicine
// units without a database migration.
export const MEDICINE_UNIT_TYPES = [
  "tablet",
  "capsule",
  "strip",
  "bottle",
  "syrup",
  "injection",
  "tube",
  "sachet",
  "ml",
  "mg",
  "unit",
  "vial",
  "ampoule",
  "piece",
] as const;
export type MedicineUnitType = (typeof MEDICINE_UNIT_TYPES)[number];
