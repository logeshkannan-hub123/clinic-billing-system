import mongoose, { Schema, model, type Model } from "mongoose";

interface BillSequenceDoc {
  _id: string;
  seq: number;
}

const billSequenceSchema = new Schema<BillSequenceDoc>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

export const BillSequenceModel =
  (mongoose.models.BillSequence as Model<BillSequenceDoc>) ??
  model<BillSequenceDoc>("BillSequence", billSequenceSchema);

/**
 * Confirmed, documented business rule (docs/architecture/billing-workflow.md,
 * "Concurrency strategy" #1): bill numbers are unique and monotonic per day,
 * NOT required to be gapless. If the caller allocates a number here and then
 * fails to persist the bill (e.g. a transient DB error), that number is
 * simply skipped — matching how real invoicing systems handle voided
 * attempts. This is intentional, not a bug: `BillModel.create()` in
 * billService.ts is a single atomic document write, so a failure there can
 * never leave a half-written/misleading Bill behind — only the counter
 * advances, and the counter itself is never read back as if it were a count
 * of real bills.
 */
export async function getNextBillSequence(dateKey: string): Promise<number> {
  const updated = await BillSequenceModel.findByIdAndUpdate(
    dateKey,
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  ).lean();

  if (!updated) {
    throw new Error(`Failed to allocate bill sequence for ${dateKey}`);
  }

  return updated.seq;
}

/** `prefix` defaults to "INV" (the historical, hardcoded value) so any
 * existing caller keeps producing identical bill numbers. Only bills issued
 * *after* an Admin changes `billing.invoicePrefix` get the new prefix —
 * already-issued bill numbers are immutable and never rewritten. */
export function formatBillNumber(dateKey: string, seq: number, prefix = "INV"): string {
  return `${prefix}-${dateKey}-${String(seq).padStart(3, "0")}`;
}
