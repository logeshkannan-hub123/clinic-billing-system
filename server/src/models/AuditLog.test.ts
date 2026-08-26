import { describe, expect, it } from "vitest";
import { AuditLogModel } from "./AuditLog.js";

describe("AuditLog model", () => {
  it("passes validation with a recognized event type", () => {
    const log = new AuditLogModel({
      eventType: "bill_generated",
      payload: { billNumber: "INV-20260815-001" },
    });
    expect(log.validateSync()).toBeUndefined();
  });

  it("rejects an unrecognized event type", () => {
    const log = new AuditLogModel({ eventType: "something_else" });
    const error = log.validateSync();
    expect(error?.errors.eventType).toBeDefined();
  });
});
