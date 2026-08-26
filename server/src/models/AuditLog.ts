import mongoose, { Schema, model, type InferSchemaType, type Model } from "mongoose";
import { AUDIT_EVENT_TYPES } from "./enums.js";

const auditLogSchema = new Schema(
  {
    eventType: { type: String, enum: AUDIT_EVENT_TYPES, required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    // Event-specific details only. Never store passwords, credentials, API keys,
    // or other secrets/PII here — callers writing audit events are responsible
    // for this; Mixed cannot enforce it at the schema level.
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel =
  (mongoose.models.AuditLog as Model<AuditLogDoc>) ?? model<AuditLogDoc>("AuditLog", auditLogSchema);
