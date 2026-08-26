import type { Types } from "mongoose";
import { AuditLogModel } from "../models/AuditLog.js";
import type { AuditEventType } from "../models/enums.js";

/**
 * Deliberately never throws. Every call site awaits this *after* its real
 * mutation has already committed (the bill/receptionist/settings write, etc.)
 * — if the audit write itself failed and this rethrew, the caller would 500
 * a request whose actual effect already succeeded, inviting a client retry
 * that duplicates the mutation (this is exactly what the audit flagged: a
 * mutation succeeding while the client is told it failed). A failure here is
 * logged loudly server-side instead, so it stays visible to operators
 * without misrepresenting the request's outcome to the caller.
 */
export async function recordAuditEvent(
  eventType: AuditEventType,
  options: { actorUserId?: Types.ObjectId | null; payload?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await AuditLogModel.create({
      eventType,
      actorUserId: options.actorUserId ?? null,
      payload: options.payload ?? {},
    });
  } catch (error) {
    console.error(`Failed to record audit event "${eventType}":`, error);
  }
}
