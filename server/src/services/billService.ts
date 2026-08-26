import mongoose, { Types } from "mongoose";
import { BillModel, type BillDoc, type BillHydratedDoc } from "../models/Bill.js";
import type { BillStatus, MedicineUnitType } from "../models/enums.js";
import { MedicineModel } from "../models/Medicine.js";
import { PaymentModel, type PaymentHydratedDoc } from "../models/Payment.js";
import { formatBillNumber, getNextBillSequence } from "../models/BillSequence.js";
import { getKolkataDateKey, getKolkataDayRangeUtc } from "../utils/timezone.js";
import { recordAuditEvent } from "./auditLog.js";
import {
  calculateBillStatusAfterPayment,
  calculateBillTotals,
  calculateCashApplication,
  type BillTotals,
} from "./billMath.js";
import { getClinicSettings, getTaxConfig } from "./clinicSettingsService.js";
import { findOrCreatePatient } from "./patientService.js";

const DUPLICATE_WINDOW_MS = 30_000;

export class BillNotFoundError extends Error {}
export class BillNotEditableError extends Error {}
export class BillNotCancellableError extends Error {}
export class BillNotPayableError extends Error {}
export class OverpaymentError extends Error {}
export class InvalidPaymentAmountError extends Error {}
export class PartialPaymentsDisabledError extends Error {}
export class PaymentMethodDisabledError extends Error {}
export class MedicineNotFoundError extends Error {}
export class MedicineInactiveError extends Error {}

export class DuplicateBillWarningError extends Error {
  existingBillId: string;
  existingBillNumber: string;

  constructor(existingBillId: string, existingBillNumber: string) {
    super("A similar bill was created moments ago");
    this.existingBillId = existingBillId;
    this.existingBillNumber = existingBillNumber;
  }
}

export interface BillItemInput {
  /** When set, this item's descriptive fields and price are never trusted
   * from the client — see `resolveItemsAgainstCatalog`. Absent for
   * historical/legacy items that predate the medicine catalog. */
  medicineId?: string;
  medicineName: string;
  unitType: MedicineUnitType | string;
  quantity: number;
  unitPriceInPaise: number;
}

export interface BillInput {
  patientName: string;
  patientPhone: string;
  items: BillItemInput[];
  consultationFeeInPaise: number;
}

export interface CreateBillInput extends BillInput {
  confirmDuplicate?: boolean;
  /** Client-generated, one per bill-creation attempt (see Bill.ts). When
   * present, `createBill` becomes idempotent on this key: a retried/raced
   * request with the same key returns the bill created by whichever request
   * won, instead of the heuristic duplicate-warning path ever getting a
   * chance to (or a second bill being created). Optional — omitting it keeps
   * exactly today's non-idempotent behavior, so legacy/test callers are
   * unaffected. */
  idempotencyKey?: string;
}

export interface Actor {
  id: Types.ObjectId;
}

interface ResolvedBillItem {
  medicineId: Types.ObjectId | null;
  category: string | null;
  brandName: string | null;
  genericName: string | null;
  composition: string | null;
  strength: string | null;
  mrpInPaise: number | null;
  medicineName: string;
  unitType: string;
  quantity: number;
  unitPriceInPaise: number;
}

/**
 * The single point where a submitted item either passes through as-is
 * (no `medicineId` — the legacy/ad-hoc shape) or is fully re-derived from
 * the live `Medicine` document (name, category, brand/generic/composition/
 * strength, unit, and — critically — price). Client-submitted values for
 * any of those fields are ignored once `medicineId` is present; only
 * `quantity` is taken from the caller. This is what makes the selling price
 * "locked" a real server-side guarantee rather than just a UI convention,
 * and it's why preview and actual bill creation can never disagree about
 * price — both call this same resolver against the same live data.
 */
async function resolveOneItemAgainstCatalog(item: BillItemInput): Promise<ResolvedBillItem> {
  if (!item.medicineId) {
    return {
      medicineId: null,
      category: null,
      brandName: null,
      genericName: null,
      composition: null,
      strength: null,
      mrpInPaise: null,
      medicineName: item.medicineName,
      unitType: item.unitType,
      quantity: item.quantity,
      unitPriceInPaise: item.unitPriceInPaise,
    };
  }

  if (!Types.ObjectId.isValid(item.medicineId)) {
    throw new MedicineNotFoundError();
  }
  const medicine = await MedicineModel.findById(item.medicineId);
  if (!medicine) {
    throw new MedicineNotFoundError();
  }
  if (medicine.status !== "ACTIVE") {
    throw new MedicineInactiveError();
  }

  return {
    medicineId: medicine._id,
    category: medicine.category,
    brandName: medicine.brandName ?? null,
    genericName: medicine.genericName,
    composition: medicine.composition,
    strength: medicine.strength ?? null,
    mrpInPaise: medicine.mrpInPaise,
    medicineName: medicine.name,
    unitType: medicine.billingUnit,
    quantity: item.quantity,
    unitPriceInPaise: medicine.sellingPriceInPaise,
  };
}

async function resolveItemsAgainstCatalog(items: BillItemInput[]): Promise<ResolvedBillItem[]> {
  const resolved: ResolvedBillItem[] = [];
  for (const item of items) {
    resolved.push(await resolveOneItemAgainstCatalog(item));
  }
  return resolved;
}

/**
 * Edit-only variant: every item is still resolved against the *live* catalog
 * first, same as create — so an active medicine's current price always flows
 * through on edit, same as before this function existed (an edit is not
 * expected to freeze prices; only creation-time snapshots are frozen). The
 * one difference: if that live resolution fails specifically because the
 * medicine is now INACTIVE, and the incoming item exactly matches one already
 * persisted on this bill (same medicineId and quantity — i.e. this line
 * genuinely isn't what the receptionist is trying to change), the stored
 * snapshot is reused instead of the edit failing outright. This is what lets
 * a bill keep an already-billed, since-deactivated medicine on an untouched
 * line item while the receptionist edits something unrelated (e.g. the
 * consultation fee) — deactivating a medicine must never retroactively block
 * edits to bills that don't actually touch that line item. A genuinely new
 * selection, or a changed quantity, on an inactive medicine still has no
 * matching "unchanged" fallback and correctly fails.
 */
async function resolveItemsForEdit(
  items: BillItemInput[],
  existingItems: ResolvedBillItem[],
): Promise<ResolvedBillItem[]> {
  const resolved: ResolvedBillItem[] = [];
  for (const item of items) {
    try {
      resolved.push(await resolveOneItemAgainstCatalog(item));
    } catch (error) {
      if (error instanceof MedicineInactiveError && item.medicineId) {
        const unchanged = existingItems.find(
          (existingItem) =>
            existingItem.medicineId?.toString() === item.medicineId &&
            existingItem.quantity === item.quantity,
        );
        if (unchanged) {
          resolved.push(unchanged);
          continue;
        }
      }
      throw error;
    }
  }
  return resolved;
}

function buildItemsWithLineTotals(items: ResolvedBillItem[], lineTotalsInPaise: number[]) {
  return items.map((item, index) => ({
    medicineId: item.medicineId,
    category: item.category,
    brandName: item.brandName,
    genericName: item.genericName,
    composition: item.composition,
    strength: item.strength,
    mrpInPaise: item.mrpInPaise,
    medicineName: item.medicineName,
    unitType: item.unitType,
    quantity: item.quantity,
    unitPriceInPaise: item.unitPriceInPaise,
    lineTotalInPaise: lineTotalsInPaise[index]!,
  }));
}

function isDuplicateKeyError(error: unknown, field: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000 &&
    Boolean((error as { keyPattern?: Record<string, unknown> }).keyPattern?.[field])
  );
}

export async function createBill(
  input: CreateBillInput,
  actor: Actor,
): Promise<BillHydratedDoc> {
  // Idempotent fast path: a retried/raced request carrying a key that
  // already produced a bill returns that same bill directly — skips patient
  // lookup, duplicate-warning, and sequence allocation entirely, so retrying
  // a request that actually succeeded server-side (but whose response was
  // lost — a timeout, a dropped connection) can never create a second bill.
  if (input.idempotencyKey) {
    const existingByKey = await BillModel.findOne({ idempotencyKey: input.idempotencyKey });
    if (existingByKey) {
      return existingByKey;
    }
  }

  const patient = await findOrCreatePatient(input.patientName, input.patientPhone);
  const resolvedItems = await resolveItemsAgainstCatalog(input.items);
  const taxConfig = await getTaxConfig();
  const totals = calculateBillTotals(resolvedItems, input.consultationFeeInPaise, taxConfig);
  const clinicSettings = await getClinicSettings();

  // Skipped entirely when an idempotencyKey is present: this heuristic exists
  // to warn a *human* who may be about to submit a second, separate bill for
  // the same patient/amount — it's not meant to second-guess a same-key
  // retry/double-click, which the idempotency mechanism above (and the
  // unique-index conflict handling below) already resolves deterministically
  // to a single bill without needing a confirmation round-trip.
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
  const possibleDuplicate =
    clinicSettings.billing.duplicateWarningEnabled && !input.idempotencyKey
      ? await BillModel.findOne({
          createdBy: actor.id,
          patientPhone: patient.phone,
          grandTotalInPaise: totals.grandTotalInPaise,
          status: { $ne: "CANCELLED" },
          createdAt: { $gte: since },
        }).sort({ createdAt: -1 })
      : null;

  if (possibleDuplicate && !input.confirmDuplicate) {
    await recordAuditEvent("duplicate_bill_warning", {
      actorUserId: actor.id,
      payload: { existingBillId: possibleDuplicate._id, confirmed: false },
    });
    throw new DuplicateBillWarningError(
      possibleDuplicate._id.toString(),
      possibleDuplicate.billNumber,
    );
  }

  const issuedAt = new Date();
  const dateKey = getKolkataDateKey(issuedAt);
  const seq = await getNextBillSequence(dateKey);
  const billNumber = formatBillNumber(dateKey, seq, clinicSettings.billing.invoicePrefix);

  let bill: BillHydratedDoc;
  try {
    bill = await BillModel.create({
      billNumber,
      patientId: patient._id,
      patientName: patient.name,
      patientPhone: patient.phone,
      items: buildItemsWithLineTotals(resolvedItems, totals.itemLineTotalsInPaise),
      consultationFeeInPaise: input.consultationFeeInPaise,
      subtotalInPaise: totals.subtotalInPaise,
      taxEnabled: taxConfig.taxEnabled,
      taxRateBasisPoints: taxConfig.taxEnabled ? taxConfig.taxRateBasisPoints : null,
      taxAmountInPaise: totals.taxAmountInPaise,
      roundingAdjustmentInPaise: totals.roundingAdjustmentInPaise,
      grandTotalInPaise: totals.grandTotalInPaise,
      status: "UNPAID",
      issuedAt,
      createdBy: actor.id,
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    // Lost the race: a concurrent request with the same idempotencyKey (e.g.
    // a genuine double-click that both reached this point before either
    // committed) already inserted first. MongoDB's unique index caught it
    // atomically — re-fetch and return that bill instead of erroring, so
    // both requests resolve to the same, single, real bill.
    if (input.idempotencyKey && isDuplicateKeyError(error, "idempotencyKey")) {
      const winner = await BillModel.findOne({ idempotencyKey: input.idempotencyKey });
      if (winner) return winner;
    }
    throw error;
  }

  await recordAuditEvent("bill_generated", {
    actorUserId: actor.id,
    payload: {
      billId: bill._id,
      billNumber: bill.billNumber,
      grandTotalInPaise: bill.grandTotalInPaise,
    },
  });

  if (possibleDuplicate && input.confirmDuplicate) {
    await recordAuditEvent("duplicate_bill_warning", {
      actorUserId: actor.id,
      payload: {
        billId: bill._id,
        existingBillId: possibleDuplicate._id,
        confirmed: true,
      },
    });
  }

  return bill;
}

export interface PreviewBillInput {
  items: BillItemInput[];
  consultationFeeInPaise: number;
}

export interface PreviewBillResult extends BillTotals {
  taxEnabled: boolean;
  taxRateBasisPoints: number | null;
}

/**
 * Pure calculation, no persistence: no Patient, Bill, or Payment is ever
 * created or modified. Reuses the same `billMath.ts` functions and the same
 * `ClinicSettings` read as `createBill`/`editBill`, so a preview and the bill
 * it previews are always computed identically.
 */
export async function previewBill(input: PreviewBillInput): Promise<PreviewBillResult> {
  const resolvedItems = await resolveItemsAgainstCatalog(input.items);
  const taxConfig = await getTaxConfig();
  const totals = calculateBillTotals(resolvedItems, input.consultationFeeInPaise, taxConfig);

  return {
    ...totals,
    taxEnabled: taxConfig.taxEnabled,
    taxRateBasisPoints: taxConfig.taxEnabled ? taxConfig.taxRateBasisPoints : null,
  };
}

export async function editBill(
  billId: string | undefined,
  input: BillInput,
  actor: Actor,
): Promise<BillHydratedDoc> {
  if (!billId || !Types.ObjectId.isValid(billId)) {
    throw new BillNotFoundError();
  }

  const existing = await BillModel.findById(billId).select("status items").lean();
  if (!existing) {
    throw new BillNotFoundError();
  }
  if (existing.status !== "UNPAID") {
    throw new BillNotEditableError();
  }

  const patient = await findOrCreatePatient(input.patientName, input.patientPhone);
  const existingResolvedItems: ResolvedBillItem[] = existing.items.map((item) => ({
    medicineId: item.medicineId ?? null,
    category: item.category ?? null,
    brandName: item.brandName ?? null,
    genericName: item.genericName ?? null,
    composition: item.composition ?? null,
    strength: item.strength ?? null,
    mrpInPaise: item.mrpInPaise ?? null,
    medicineName: item.medicineName,
    unitType: item.unitType,
    quantity: item.quantity,
    unitPriceInPaise: item.unitPriceInPaise,
  }));
  const resolvedItems = await resolveItemsForEdit(input.items, existingResolvedItems);
  const taxConfig = await getTaxConfig();
  const totals = calculateBillTotals(resolvedItems, input.consultationFeeInPaise, taxConfig);

  // Atomic conditional update: re-checks status === UNPAID at write time, not
  // just at the read above, so a payment/cancellation racing in between this
  // function's read and write can't be silently overwritten by a stale edit.
  const updated = await BillModel.findOneAndUpdate(
    { _id: billId, status: "UNPAID" },
    {
      $set: {
        patientId: patient._id,
        patientName: patient.name,
        patientPhone: patient.phone,
        items: buildItemsWithLineTotals(resolvedItems, totals.itemLineTotalsInPaise),
        consultationFeeInPaise: input.consultationFeeInPaise,
        subtotalInPaise: totals.subtotalInPaise,
        taxEnabled: taxConfig.taxEnabled,
        taxRateBasisPoints: taxConfig.taxEnabled ? taxConfig.taxRateBasisPoints : null,
        taxAmountInPaise: totals.taxAmountInPaise,
        roundingAdjustmentInPaise: totals.roundingAdjustmentInPaise,
        grandTotalInPaise: totals.grandTotalInPaise,
      },
    },
    { new: true },
  );

  if (!updated) {
    throw new BillNotEditableError();
  }

  await recordAuditEvent("bill_edited", {
    actorUserId: actor.id,
    payload: { billId: updated._id, billNumber: updated.billNumber },
  });

  return updated;
}

export async function cancelBill(
  billId: string | undefined,
  actor: Actor,
): Promise<BillHydratedDoc> {
  if (!billId || !Types.ObjectId.isValid(billId)) {
    throw new BillNotFoundError();
  }

  const existing = await BillModel.findById(billId).select("status").lean();
  if (!existing) {
    throw new BillNotFoundError();
  }
  if (existing.status !== "UNPAID") {
    throw new BillNotCancellableError();
  }

  const updated = await BillModel.findOneAndUpdate(
    { _id: billId, status: "UNPAID" },
    { $set: { status: "CANCELLED", cancelledBy: actor.id, cancelledAt: new Date() } },
    { new: true },
  );

  if (!updated) {
    throw new BillNotCancellableError();
  }

  await recordAuditEvent("bill_cancelled", {
    actorUserId: actor.id,
    payload: { billId: updated._id, billNumber: updated.billNumber },
  });

  return updated;
}

export type RecordPaymentInput =
  | { method: "CASH"; tenderedAmountInPaise: number }
  | { method: "UPI"; amountInPaise: number; upiReference?: string };

export interface RecordPaymentResult {
  payment: PaymentHydratedDoc;
  bill: BillHydratedDoc;
  dueAmountInPaise: number;
}

export async function recordPayment(
  billId: string | undefined,
  input: RecordPaymentInput,
  actor: Actor,
): Promise<RecordPaymentResult> {
  if (!billId || !Types.ObjectId.isValid(billId)) {
    throw new BillNotFoundError();
  }
  if (input.method === "CASH" && !(Number.isInteger(input.tenderedAmountInPaise) && input.tenderedAmountInPaise > 0)) {
    throw new InvalidPaymentAmountError();
  }
  if (input.method === "UPI" && !(Number.isInteger(input.amountInPaise) && input.amountInPaise > 0)) {
    throw new InvalidPaymentAmountError();
  }

  // Not bill-specific state, so no need to read it inside the transaction —
  // a payment method toggled off mid-flight is a low-stakes, non-money race
  // (unlike the balance check below, which genuinely needs transactional
  // freshness).
  const clinicSettings = await getClinicSettings();
  if (input.method === "CASH" && !clinicSettings.payments.cashEnabled) {
    throw new PaymentMethodDisabledError();
  }
  if (input.method === "UPI" && !clinicSettings.payments.upiEnabled) {
    throw new PaymentMethodDisabledError();
  }

  const session = await mongoose.startSession();
  try {
    let result: RecordPaymentResult | undefined;

    await session.withTransaction(async () => {
      const bill = await BillModel.findById(billId).session(session);
      if (!bill) {
        throw new BillNotFoundError();
      }
      if (bill.status !== "UNPAID" && bill.status !== "PARTIALLY_PAID") {
        throw new BillNotPayableError();
      }

      // Re-check the outstanding balance inside the transaction, against
      // whatever is currently committed — this is what actually prevents two
      // concurrent payments from jointly overpaying.
      const existingPayments = await PaymentModel.find({ billId: bill._id }).session(session);
      const totalPaidSoFarInPaise = existingPayments.reduce(
        (sum, payment) => sum + payment.amountInPaise,
        0,
      );
      const currentDueInPaise = bill.grandTotalInPaise - totalPaidSoFarInPaise;

      let paymentAttrs: {
        method: "CASH" | "UPI";
        amountInPaise: number;
        tenderedAmountInPaise: number | null;
        changeAmountInPaise: number | null;
        upiReference: string | null;
      };

      if (input.method === "CASH") {
        if (currentDueInPaise <= 0) {
          throw new BillNotPayableError();
        }
        const { appliedAmountInPaise, changeAmountInPaise } = calculateCashApplication(
          input.tenderedAmountInPaise,
          currentDueInPaise,
        );
        if (!clinicSettings.billing.allowPartialPayments && appliedAmountInPaise < currentDueInPaise) {
          throw new PartialPaymentsDisabledError();
        }
        paymentAttrs = {
          method: "CASH",
          amountInPaise: appliedAmountInPaise,
          tenderedAmountInPaise: input.tenderedAmountInPaise,
          changeAmountInPaise,
          upiReference: null,
        };
      } else {
        if (input.amountInPaise > currentDueInPaise) {
          throw new OverpaymentError();
        }
        if (!clinicSettings.billing.allowPartialPayments && input.amountInPaise < currentDueInPaise) {
          throw new PartialPaymentsDisabledError();
        }
        paymentAttrs = {
          method: "UPI",
          amountInPaise: input.amountInPaise,
          tenderedAmountInPaise: null,
          changeAmountInPaise: null,
          upiReference: input.upiReference?.trim() || null,
        };
      }

      const [payment] = await PaymentModel.create(
        [{ billId: bill._id, recordedBy: actor.id, ...paymentAttrs }],
        { session },
      );

      const newTotalPaidInPaise = totalPaidSoFarInPaise + paymentAttrs.amountInPaise;
      const newStatus: BillStatus = calculateBillStatusAfterPayment(
        bill.grandTotalInPaise,
        newTotalPaidInPaise,
      );
      bill.status = newStatus;
      await bill.save({ session });

      result = {
        payment: payment!,
        bill,
        dueAmountInPaise: bill.grandTotalInPaise - newTotalPaidInPaise,
      };
    });

    if (!result) {
      throw new Error("Payment transaction completed without a result");
    }

    await recordAuditEvent("payment_recorded", {
      actorUserId: actor.id,
      payload: {
        billId: result.bill._id,
        paymentId: result.payment._id,
        method: result.payment.method,
        amountInPaise: result.payment.amountInPaise,
        resultingStatus: result.bill.status,
      },
    });

    return result;
  } finally {
    await session.endSession();
  }
}

export interface ListBillsFilters {
  status?: BillStatus;
  dateIso?: string;
  search?: string;
  limit?: number;
  skip?: number;
}

export type BillListItem = BillDoc & {
  _id: Types.ObjectId;
  dueAmountInPaise: number;
};

export interface ListBillsResult {
  bills: BillListItem[];
  total: number;
}

export async function listBills(filters: ListBillsFilters): Promise<ListBillsResult> {
  const query: Record<string, unknown> = {};

  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.dateIso) {
    const { startUtc, endUtc } = getKolkataDayRangeUtc(filters.dateIso);
    query.issuedAt = { $gte: startUtc, $lt: endUtc };
  }
  if (filters.search) {
    const escaped = filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "i");
    query.$or = [{ patientPhone: pattern }, { patientName: pattern }];
  }

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const skip = Math.max(filters.skip ?? 0, 0);

  const [bills, total] = await Promise.all([
    BillModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    BillModel.countDocuments(query),
  ]);

  // One extra aggregate for the whole page — not one query per bill — so
  // this stays O(1) additional round-trips regardless of page size. Reuses
  // the same source of truth (`Payment.amountInPaise`) that `recordPayment`
  // itself sums from, rather than re-deriving payment totals a new way.
  const billIds = bills.map((bill) => bill._id);
  const paymentSums = await PaymentModel.aggregate<{ _id: Types.ObjectId; paidInPaise: number }>([
    { $match: { billId: { $in: billIds } } },
    { $group: { _id: "$billId", paidInPaise: { $sum: "$amountInPaise" } } },
  ]);
  const paidByBillId = new Map(paymentSums.map((row) => [row._id.toString(), row.paidInPaise]));

  const billsWithDue: BillListItem[] = bills.map((bill) => {
    const paidInPaise = paidByBillId.get(bill._id.toString()) ?? 0;
    return {
      ...bill.toObject(),
      dueAmountInPaise: bill.grandTotalInPaise - paidInPaise,
    } as BillListItem;
  });

  return { bills: billsWithDue, total };
}

export interface BillWithPayments {
  bill: BillHydratedDoc;
  payments: PaymentHydratedDoc[];
}

export async function getBillWithPayments(
  billId: string | undefined,
): Promise<BillWithPayments | null> {
  if (!billId || !Types.ObjectId.isValid(billId)) {
    return null;
  }
  const bill = await BillModel.findById(billId);
  if (!bill) {
    return null;
  }
  const payments = await PaymentModel.find({ billId: bill._id }).sort({ createdAt: 1 });
  return { bill, payments };
}
