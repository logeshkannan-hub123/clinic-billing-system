export type UserRole = 'admin' | 'receptionist'

export interface CurrentUser {
  id: string
  username: string
  role: UserRole
  staffId?: string
}

export interface SetupStatus {
  adminExists: boolean
}

export type BillStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED'

export const MEDICINE_UNIT_TYPES = [
  'tablet',
  'capsule',
  'strip',
  'bottle',
  'syrup',
  'injection',
  'tube',
  'sachet',
  'ml',
  'mg',
  'unit',
  'vial',
  'ampoule',
  'piece',
] as const
export type MedicineUnitType = (typeof MEDICINE_UNIT_TYPES)[number]

/** What the client sends — no line total, no money field the server computes.
 * When `medicineId` is set, the server ignores medicineName/unitType/
 * unitPriceInPaise entirely and re-derives them from the live catalog record
 * — see billService.ts's `resolveItemsAgainstCatalog`. */
export interface BillItemInput {
  medicineId?: string
  medicineName: string
  unitType: string
  quantity: number
  unitPriceInPaise: number
}

/** What the server returns as part of a persisted Bill's items array —
 * catalog snapshot fields are `null` for legacy/free-text items that predate
 * the medicine catalog, or for items with no `medicineId`. */
export interface BillItem extends Omit<BillItemInput, 'medicineId'> {
  lineTotalInPaise: number
  medicineId: string | null
  category: MedicineCategory | null
  brandName: string | null
  genericName: string | null
  composition: string | null
  strength: string | null
  mrpInPaise: number | null
}

// ---------------------------------------------------------------------------
// Medicine / Injection / Fluid catalog — GET/POST /api/medicines,
// GET /api/medicines/search, PATCH /api/medicines/:id(/status)
// ---------------------------------------------------------------------------

export const MEDICINE_CATEGORIES = ['MEDICINE', 'INJECTION', 'FLUID'] as const
export type MedicineCategory = (typeof MEDICINE_CATEGORIES)[number]

export const MEDICINE_STATUSES = ['ACTIVE', 'INACTIVE'] as const
export type MedicineStatus = (typeof MEDICINE_STATUSES)[number]

export interface Medicine {
  _id: string
  category: MedicineCategory
  name: string
  brandName: string | null
  genericName: string
  composition: string
  strength: string | null
  billingUnit: string
  volume: number | null
  volumeUnit: string | null
  mrpInPaise: number
  sellingPriceInPaise: number
  status: MedicineStatus
  createdBy: string
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

/** GET /api/medicines/search — deliberately narrower than `Medicine`: no
 * mrpInPaise, no createdBy/updatedBy. Just what billing selection needs. */
export interface MedicineSearchResult {
  id: string
  category: MedicineCategory
  name: string
  brandName: string | null
  genericName: string
  composition: string
  strength: string | null
  billingUnit: string
  volume: number | null
  volumeUnit: string | null
  sellingPriceInPaise: number
}

export interface MedicineInput {
  category: MedicineCategory
  name: string
  brandName?: string | null
  genericName: string
  composition: string
  strength?: string | null
  billingUnit: string
  volume?: number | null
  volumeUnit?: string | null
  mrpInPaise: number
  sellingPriceInPaise: number
}

export type MedicineUpdateInput = Partial<MedicineInput>

export interface BillInput {
  patientName: string
  patientPhone: string
  items: BillItemInput[]
  consultationFeeInPaise: number
}

export interface Bill {
  _id: string
  billNumber: string
  patientId: string
  patientName: string
  patientPhone: string
  items: BillItem[]
  consultationFeeInPaise: number
  subtotalInPaise: number
  taxEnabled: boolean
  taxRateBasisPoints: number | null
  taxAmountInPaise: number
  roundingAdjustmentInPaise: number
  grandTotalInPaise: number
  status: BillStatus
  issuedAt: string
  createdBy: string
  cancelledBy: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Payment {
  _id: string
  billId: string
  method: 'CASH' | 'UPI'
  amountInPaise: number
  tenderedAmountInPaise: number | null
  changeAmountInPaise: number | null
  upiReference: string | null
  recordedBy: string
  createdAt: string
}

/** GET /api/bills list items only — server-computed from real payment
 * records (never from client input). Not present on a single-bill fetch
 * (GET /api/bills/:id), which returns a plain Bill instead. */
export interface BillListItem extends Bill {
  dueAmountInPaise: number
}

export interface BillListResult {
  bills: BillListItem[]
  total: number
}

export interface BillWithPayments {
  bill: Bill
  payments: Payment[]
}

export type RecordPaymentInput =
  | { method: 'CASH'; tenderedAmountInPaise: number }
  | { method: 'UPI'; amountInPaise: number; upiReference?: string }

export interface RecordPaymentResult {
  payment: Payment
  bill: { id: string; status: BillStatus }
  dueAmountInPaise: number
}

export interface DuplicateBillWarning {
  warning: 'possible_duplicate'
  existingBillId: string
  existingBillNumber: string
}

export interface PreviewBillInput {
  items: BillItemInput[]
  consultationFeeInPaise: number
}

export interface PreviewBillResult {
  itemLineTotalsInPaise: number[]
  subtotalInPaise: number
  taxEnabled: boolean
  taxRateBasisPoints: number | null
  taxAmountInPaise: number
  roundingAdjustmentInPaise: number
  grandTotalInPaise: number
}

export interface DashboardSummary {
  date: string
  revenueInPaise: number
  generatedCount: number
  paidCount: number
  pendingCount: number
  partiallyPaidCount: number
  cancelledCount: number
}

export interface TaxConfig {
  taxEnabled: boolean
  taxRateBasisPoints: number | null
}

// ---------------------------------------------------------------------------
// Admin Settings (extended clinic settings) — GET/PATCH /api/admin/clinic-settings
// and GET /api/settings/display. Kept entirely separate from `TaxConfig`
// above, which stays owned by the existing GET/PATCH /api/admin/settings.
// ---------------------------------------------------------------------------

export interface ClinicInfoSettings {
  name: string
  doctorName: string
  logoUrl: string | null
  phone: string
  email: string
  website: string
  address: string
  registrationNumber: string
  gstNumber: string
}

export interface BillingSettings {
  invoicePrefix: string
  allowPartialPayments: boolean
  duplicateWarningEnabled: boolean
  defaultConsultationFeeInPaise: number
}

export type ReceiptPaperSize = 'A4' | 'A5' | 'THERMAL_80MM' | 'THERMAL_58MM'

export interface ReceiptSettings {
  showLogo: boolean
  showClinicAddress: boolean
  showClinicPhone: boolean
  showDoctorName: boolean
  showTax: boolean
  showPaymentMethod: boolean
  showPaymentHistory: boolean
  paperSize: ReceiptPaperSize
  footerText: string
}

export interface PaymentSettings {
  cashEnabled: boolean
  upiEnabled: boolean
}

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
export type TimeFormat = '12h' | '24h'

export interface RegionalSettings {
  currencySymbol: string
  dateFormat: DateFormat
  timeFormat: TimeFormat
}

export interface SecuritySettings {
  sessionTimeoutMinutes: number
}

/** Full extended settings document — GET/PATCH /api/admin/clinic-settings, Admin-only. */
export interface ClinicSettings {
  clinic: ClinicInfoSettings
  billing: BillingSettings
  receipt: ReceiptSettings
  payments: PaymentSettings
  regional: RegionalSettings
  security: SecuritySettings
}

export type ClinicSettingsSection = keyof ClinicSettings

/** A PATCH body updates any subset of sections, each itself a partial. */
export type ClinicSettingsPatch = Partial<{
  clinic: Partial<ClinicInfoSettings>
  billing: Partial<BillingSettings>
  receipt: Partial<ReceiptSettings>
  payments: Partial<PaymentSettings>
  regional: Partial<RegionalSettings>
  security: Partial<SecuritySettings>
}>

/** Narrow, read-only projection — GET /api/settings/display, Admin or Receptionist.
 * Deliberately excludes `security` and the billing internals (`invoicePrefix`,
 * `duplicateWarningEnabled`) that only the Settings page itself needs. */
export interface DisplaySettings {
  clinic: ClinicInfoSettings
  receipt: ReceiptSettings
  payments: PaymentSettings
  defaultConsultationFeeInPaise: number
}

/** GET /api/admin/receptionists list item shape (hand-picked lean fields). */
export interface ReceptionistListItem {
  _id: string
  username: string
  staffId: string
  isActive: boolean
  createdAt: string
}

/** POST/PATCH .../receptionists mutation response shape (differently hand-picked). */
export interface ReceptionistMutationResult {
  id: string
  username: string
  staffId: string
  isActive: boolean
}
