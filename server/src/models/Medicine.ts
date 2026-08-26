import mongoose, {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
  type Model,
} from "mongoose";
import { MEDICINE_CATEGORIES, MEDICINE_STATUSES, MEDICINE_UNIT_TYPES } from "./enums.js";
import { integerValidator } from "./money.js";
import { maxLengthValidator } from "./settingsValidators.js";

const nullablePositiveNumberValidator = {
  validator: (value: number | null | undefined) =>
    value === null || value === undefined || (Number.isFinite(value) && value > 0),
  message: "{PATH} must be a positive number",
};

// Catalog/master data only — no batch, stock, expiry, or purchase fields.
// Future inventory features (Purchase → Batch → Stock) are expected to be
// separate collections referencing `medicineId`, the same way `Payment`
// references `Bill`, rather than fields bolted onto this model.
const medicineSchema = new Schema(
  {
    category: {
      type: String,
      enum: MEDICINE_CATEGORIES,
      required: true,
    },
    name: { type: String, required: true, trim: true, validate: maxLengthValidator(200) },
    brandName: { type: String, default: null, trim: true, validate: maxLengthValidator(200) },
    genericName: { type: String, required: true, trim: true, validate: maxLengthValidator(200) },
    composition: { type: String, required: true, trim: true, validate: maxLengthValidator(300) },
    strength: { type: String, default: null, trim: true, validate: maxLengthValidator(100) },
    billingUnit: {
      type: String,
      required: true,
      validate: {
        validator: (value: string) => (MEDICINE_UNIT_TYPES as readonly string[]).includes(value),
        message: "{PATH} is not a recognized medicine unit type",
      },
    },
    // Meaningful for FLUID only — enforced in medicineService, not here (see
    // the same "cross-field business rule lives in the service layer"
    // convention used by clinicSettingsService's payment-methods check).
    volume: { type: Number, default: null, validate: nullablePositiveNumberValidator },
    volumeUnit: { type: String, default: null, trim: true, validate: maxLengthValidator(20) },
    mrpInPaise: { type: Number, required: true, min: 0, validate: integerValidator },
    sellingPriceInPaise: { type: Number, required: true, min: 0, validate: integerValidator },
    status: { type: String, enum: MEDICINE_STATUSES, required: true, default: "ACTIVE" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Powers both the management page's category tabs and search's active-only
// filter — a single compound index matching the actual query shape, same
// reasoning as Bill.ts's { status, issuedAt } index.
medicineSchema.index({ status: 1, category: 1 });
medicineSchema.index({ name: 1 });

export type MedicineDoc = InferSchemaType<typeof medicineSchema>;
export type MedicineHydratedDoc = HydratedDocument<MedicineDoc>;
export const MedicineModel =
  (mongoose.models.Medicine as Model<MedicineDoc>) ?? model<MedicineDoc>("Medicine", medicineSchema);
