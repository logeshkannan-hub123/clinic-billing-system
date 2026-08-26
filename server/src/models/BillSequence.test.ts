import { describe, expect, it } from "vitest";
import { formatBillNumber } from "./BillSequence.js";

describe("formatBillNumber", () => {
  it("zero-pads the sequence to 3 digits", () => {
    expect(formatBillNumber("20260815", 1)).toBe("INV-20260815-001");
    expect(formatBillNumber("20260815", 42)).toBe("INV-20260815-042");
  });

  it("does not truncate sequences beyond 3 digits", () => {
    expect(formatBillNumber("20260815", 1234)).toBe("INV-20260815-1234");
  });
});
