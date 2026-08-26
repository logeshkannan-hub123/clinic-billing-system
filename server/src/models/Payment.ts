import mongoose, {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
  type Model,
} from "mongoose";
import { PAYMENT_METHODS } from "./enums.js";
import { integerValidator, nullableNonNegativeIntegerValidator } from "./money.js";

interface PaymentLike {
  method: (typeof PAYMENT_METHODS)[number];
}

const paymentSchema = new Schema(
  {
    billId: { type: Schema.Types.ObjectId, ref: "Bill", required: true, index: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    amountInPaise: { type: Number, required: true, min: 1, validate: integerValidator },
    tenderedAmountInPaise: {
      type: Number,
      default: null,
      validate: [
        nullableNonNegativeIntegerValidator,
        {
          validator: function (this: PaymentLike, value: number | null) {
            return this.method === "CASH" ? value != null : value == null;
          },
          message:
            "{PATH} is required for CASH payments and must be left unset for UPI payments",
        },
      ],
    },
    changeAmountInPaise: {
      type: Number,
      default: null,
      validate: [
        nullableNonNegativeIntegerValidator,
        {
          validator: function (this: PaymentLike, value: number | null) {
            return this.method === "CASH" || value == null;
          },
          message: "{PATH} must be left unset for UPI payments",
        },
      ],
    },
    upiReference: {
      type: String,
      default: null,
      trim: true,
      validate: {
        validator: function (this: PaymentLike, value: string | null) {
          return this.method === "UPI" || !value;
        },
        message: "{PATH} must be left unset for CASH payments",
      },
    },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Powers the dashboard's per-day revenue aggregation.
paymentSchema.index({ createdAt: 1 });

export type PaymentDoc = InferSchemaType<typeof paymentSchema>;
export type PaymentHydratedDoc = HydratedDocument<PaymentDoc>;
export const PaymentModel =
  (mongoose.models.Payment as Model<PaymentDoc>) ?? model<PaymentDoc>("Payment", paymentSchema);
