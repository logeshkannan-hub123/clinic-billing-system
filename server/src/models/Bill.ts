import mongoose, {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { BILL_STATUSES, MEDICINE_UNIT_TYPES } from "./enums.js";
import { integerValidator, nullableBasisPointsValidator } from "./money.js";

interface BillItemLike {
  quantity: number;
  unitPriceInPaise: number;
}

interface BillLike {
  items: Array<{ lineTotalInPaise: number }>;
  consultationFeeInPaise: number;
  subtotalInPaise: number;
  taxEnabled: boolean;
  taxAmountInPaise: number;
  roundingAdjustmentInPaise: number;
  status: (typeof BILL_STATUSES)[number];
}

const billItemSchema = new Schema(
  {
    // Historical snapshot, not a live reference — never dereferenced to
    // recompute a past bill. `null` for bills created before the medicine
    // catalog existed, or (in principle) for any item not tied to a catalog
    // record; every other field below stays optional for the same reason.
    medicineId: { type: Schema.Types.ObjectId, ref: "Medicine", default: null },
    category: { type: String, default: null },
    brandName: { type: String, default: null },
    genericName: { type: String, default: null },
    composition: { type: String, default: null },
    strength: { type: String, default: null },
    mrpInPaise: { type: Number, default: null },
    medicineName: { type: String, required: true, trim: true },
    unitType: {
      type: String,
      required: true,
      validate: {
        validator: (value: string) => (MEDICINE_UNIT_TYPES as readonly string[]).includes(value),
        message: "{PATH} is not a recognized medicine unit type",
      },
    },
    quantity: { type: Number, required: true, min: 1, validate: integerValidator },
    unitPriceInPaise: { type: Number, required: true, min: 0, validate: integerValidator },
    lineTotalInPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: [
        integerValidator,
        {
          validator: function (this: BillItemLike, value: number) {
            return value === this.quantity * this.unitPriceInPaise;
          },
          message: "{PATH} must equal quantity × unitPriceInPaise",
        },
      ],
    },
  },
  { _id: false },
);

const billSchema = new Schema(
  {
    billNumber: { type: String, required: true, unique: true },
    // Client-generated, one per bill-creation *attempt* (not per bill) — a
    // double-click or a client retry after a lost response reuses the same
    // key, so the unique sparse index below turns a second insert attempt
    // into a detectable conflict rather than a second real bill. Omitted
    // entirely (not even `null`) for any caller that doesn't supply one —
    // deliberately no `default`, since a sparse index still indexes an
    // explicit `null` (only a truly *missing* field is excluded; same
    // gotcha already handled for `staffId` in User.ts), which would collide
    // every legacy/no-key bill against each other. See billService.createBill
    // for how a real conflict is resolved.
    idempotencyKey: { type: String },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    patientName: { type: String, required: true, trim: true },
    patientPhone: { type: String, required: true, trim: true },
    items: { type: [billItemSchema], default: [] },
    consultationFeeInPaise: { type: Number, required: true, min: 0, validate: integerValidator },
    subtotalInPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: [
        integerValidator,
        {
          validator: function (this: BillLike, value: number) {
            const itemsTotal = this.items.reduce((sum, item) => sum + item.lineTotalInPaise, 0);
            return value === itemsTotal + this.consultationFeeInPaise;
          },
          message: "{PATH} must equal item line totals + consultation fee",
        },
      ],
    },
    taxEnabled: { type: Boolean, required: true, default: false },
    taxRateBasisPoints: {
      type: Number,
      default: null,
      validate: [
        nullableBasisPointsValidator,
        {
          validator: function (this: BillLike, value: number | null) {
            return this.taxEnabled ? value !== null && value !== undefined : value == null;
          },
          message:
            "{PATH} must be set when taxEnabled is true, and left unset when taxEnabled is false",
        },
      ],
    },
    taxAmountInPaise: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: [
        integerValidator,
        {
          validator: function (this: BillLike, value: number) {
            return this.taxEnabled || value === 0;
          },
          message: "{PATH} must be 0 when taxEnabled is false",
        },
      ],
    },
    roundingAdjustmentInPaise: {
      type: Number,
      required: true,
      default: 0,
      validate: integerValidator,
    },
    grandTotalInPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: [
        integerValidator,
        {
          validator: function (this: BillLike, value: number) {
            return (
              value === this.subtotalInPaise + this.taxAmountInPaise + this.roundingAdjustmentInPaise
            );
          },
          message: "{PATH} must equal subtotal + tax + rounding adjustment",
        },
      ],
    },
    status: { type: String, enum: BILL_STATUSES, required: true, default: "UNPAID" },
    issuedAt: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      validate: {
        validator: function (this: BillLike, value: Types.ObjectId | null) {
          return this.status === "CANCELLED" ? value != null : value == null;
        },
        message: "{PATH} must be set only when status is CANCELLED",
      },
    },
    cancelledAt: {
      type: Date,
      default: null,
      validate: {
        validator: function (this: BillLike, value: Date | null) {
          return this.status === "CANCELLED" ? value != null : value == null;
        },
        message: "{PATH} must be set only when status is CANCELLED",
      },
    },
  },
  { timestamps: true },
);

// Powers the dashboard's per-day aggregation and GET /api/bills's `date` filter.
billSchema.index({ issuedAt: 1 });
// Powers status-filtered, most-recent-first list queries (dashboard drill-through
// and the generated-bills view) — a single compound index rather than two
// separate ones, matching the actual query shape.
billSchema.index({ status: 1, issuedAt: -1 });
// Helps the existing phone/name search (exact and prefix matches).
billSchema.index({ patientPhone: 1 });
// Sparse: only bills that actually supplied an idempotencyKey are indexed, so
// this never conflicts with the many existing/legacy bills that have none
// (all sharing the value `null` would otherwise collide on a non-sparse
// unique index). Atomically prevents two concurrent create attempts with the
// same key from both succeeding — see billService.createBill.
billSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export type BillDoc = InferSchemaType<typeof billSchema>;
export type BillHydratedDoc = HydratedDocument<BillDoc>;
export const BillModel =
  (mongoose.models.Bill as Model<BillDoc>) ?? model<BillDoc>("Bill", billSchema);
