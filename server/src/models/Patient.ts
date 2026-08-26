import mongoose, {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
  type Model,
} from "mongoose";

const patientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Lowercased/trimmed `name`, kept in sync by callers (findOrCreatePatient is
    // the only creation path). Backs the compound unique index below, which is
    // what makes concurrent-safe dedup possible — see patientService.ts.
    nameKey: { type: String, required: true },
    phone: { type: String, required: true, trim: true, index: true },
  },
  { timestamps: true },
);

// Same exact person (name+phone) can't be inserted twice, even under concurrent
// requests — MongoDB enforces this atomically at the storage layer. Different
// people sharing one phone (a household) remain allowed since nameKey differs.
patientSchema.index({ nameKey: 1, phone: 1 }, { unique: true });

export type PatientDoc = InferSchemaType<typeof patientSchema>;
export type PatientHydratedDoc = HydratedDocument<PatientDoc>;
export const PatientModel =
  (mongoose.models.Patient as Model<PatientDoc>) ?? model<PatientDoc>("Patient", patientSchema);
