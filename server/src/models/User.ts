import mongoose, {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
  type Model,
} from "mongoose";
import { USER_ROLES, type UserRole } from "./enums.js";

const userSchema = new Schema(
  {
    role: { type: String, enum: USER_ROLES, required: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    staffId: {
      type: String,
      unique: true,
      sparse: true,
      // MongoDB sparse indexes still index explicit nulls (only a truly missing
      // field is excluded), so normalize null -> undefined here. Otherwise a
      // second admin created with staffId explicitly set to null would collide
      // on this unique index.
      set: (value: string | null | undefined) => (value === null ? undefined : value),
      required: function (this: { role: UserRole }) {
        return this.role === "receptionist";
      },
    },
    isActive: { type: Boolean, required: true, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    // Bumped by resetReceptionistPassword/changeOwnPassword whenever this
    // user's password changes. requireAuth compares this against the value
    // stamped into the session at login time — a mismatch means the session
    // predates the password change, so every session issued before a
    // password reset is invalidated in one step, with no session-store scan.
    sessionVersion: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

// Partial unique index: only documents with role "admin" participate, so at
// most one admin can ever exist at the database layer — enforced atomically
// by MongoDB on insert, unlike a check-then-create existence test (which can
// race under concurrent first-time signups). Receptionists are unaffected
// since they never match the partialFilterExpression.
userSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: "admin" } },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export type UserHydratedDoc = HydratedDocument<UserDoc>;
export const UserModel: Model<UserDoc> = mongoose.models.User
  ? (mongoose.models.User as Model<UserDoc>)
  : model<UserDoc>("User", userSchema);
