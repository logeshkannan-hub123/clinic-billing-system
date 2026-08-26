import { describe, expect, it } from "vitest";
import {
  calculateBillStatusAfterPayment,
  calculateBillTotals,
  calculateCashApplication,
  calculateItemLineTotal,
} from "./billMath.js";

const NO_TAX = { taxEnabled: false, taxRateBasisPoints: null };

describe("calculateItemLineTotal", () => {
  it("multiplies quantity by unit price", () => {
    expect(calculateItemLineTotal(10, 200)).toBe(2000);
  });

  it("handles a zero unit price", () => {
    expect(calculateItemLineTotal(5, 0)).toBe(0);
  });
});

describe("calculateBillTotals — zero/normal values", () => {
  it("returns all zeros for no items and no consultation fee", () => {
    const totals = calculateBillTotals([], 0, NO_TAX);
    expect(totals).toEqual({
      itemLineTotalsInPaise: [],
      subtotalInPaise: 0,
      taxAmountInPaise: 0,
      roundingAdjustmentInPaise: 0,
      grandTotalInPaise: 0,
    });
  });

  it("sums multiple items plus consultation fee, no tax, exact rupee (no rounding needed)", () => {
    const totals = calculateBillTotals(
      [
        { quantity: 10, unitPriceInPaise: 200 }, // 2000
        { quantity: 2, unitPriceInPaise: 15000 }, // 30000
      ],
      50000,
      NO_TAX,
    );
    expect(totals.itemLineTotalsInPaise).toEqual([2000, 30000]);
    expect(totals.subtotalInPaise).toBe(82000);
    expect(totals.taxAmountInPaise).toBe(0);
    expect(totals.roundingAdjustmentInPaise).toBe(0);
    expect(totals.grandTotalInPaise).toBe(82000);
  });
});

describe("calculateBillTotals — whole-rupee rounding boundaries", () => {
  // consultationFeeInPaise alone drives the subtotal (no items, no tax), so
  // each case below isolates one exact remainder value against the ₹1 rule.
  const cases: Array<[preRoundTotal: number, expectedGrandTotal: number, expectedAdjustment: number]> = [
    [10000, 10000, 0], // remainder 0 — untouched
    [10001, 10000, -1], // remainder 1 — rounds down
    [10049, 10000, -49], // remainder 49 — rounds down (just under half)
    [10050, 10100, 50], // remainder 50 — exactly ₹0.50 rounds UP (confirmed rule)
    [10051, 10100, 49], // remainder 51 — rounds up
    [10099, 10100, 1], // remainder 99 — rounds up (just under next rupee)
  ];

  it.each(cases)(
    "preRoundTotal %i -> grandTotal %i (adjustment %i)",
    (preRoundTotal, expectedGrandTotal, expectedAdjustment) => {
      const totals = calculateBillTotals([], preRoundTotal, NO_TAX);
      expect(totals.grandTotalInPaise).toBe(expectedGrandTotal);
      expect(totals.roundingAdjustmentInPaise).toBe(expectedAdjustment);
    },
  );
});

describe("calculateBillTotals — tax", () => {
  it("applies 0% tax while enabled without changing the total", () => {
    const totals = calculateBillTotals([], 100000, { taxEnabled: true, taxRateBasisPoints: 0 });
    expect(totals.taxAmountInPaise).toBe(0);
    expect(totals.grandTotalInPaise).toBe(100000);
  });

  it("applies a typical tax rate (5%)", () => {
    const totals = calculateBillTotals([], 100000, { taxEnabled: true, taxRateBasisPoints: 500 });
    expect(totals.taxAmountInPaise).toBe(5000);
    expect(totals.grandTotalInPaise).toBe(105000);
  });

  it("applies 100% tax", () => {
    const totals = calculateBillTotals([], 50000, { taxEnabled: true, taxRateBasisPoints: 10000 });
    expect(totals.taxAmountInPaise).toBe(50000);
    expect(totals.grandTotalInPaise).toBe(100000);
  });

  it("rounds a fractional-paisa tax amount half-up before whole-rupee rounding", () => {
    // subtotal=1 paisa, rate=50% -> raw tax = 0.5 paisa -> rounds up to 1 paisa.
    const totals = calculateBillTotals([], 1, { taxEnabled: true, taxRateBasisPoints: 5000 });
    expect(totals.subtotalInPaise).toBe(1);
    expect(totals.taxAmountInPaise).toBe(1);
    // preRoundTotal = 2, remainder 2 (<50) -> rounds down to 0.
    expect(totals.grandTotalInPaise).toBe(0);
    expect(totals.roundingAdjustmentInPaise).toBe(-2);
  });

  it("ignores tax entirely when disabled, even if a rate were somehow present", () => {
    const totals = calculateBillTotals([], 100000, NO_TAX);
    expect(totals.taxAmountInPaise).toBe(0);
  });
});

describe("calculateCashApplication", () => {
  it("applies the full tendered amount and gives no change when under the due amount", () => {
    expect(calculateCashApplication(30000, 50000)).toEqual({
      appliedAmountInPaise: 30000,
      changeAmountInPaise: 0,
    });
  });

  it("applies the due amount exactly and gives no change on an exact tender", () => {
    expect(calculateCashApplication(50000, 50000)).toEqual({
      appliedAmountInPaise: 50000,
      changeAmountInPaise: 0,
    });
  });

  it("caps the applied amount at the due amount and returns the excess as change", () => {
    expect(calculateCashApplication(100000, 50000)).toEqual({
      appliedAmountInPaise: 50000,
      changeAmountInPaise: 50000,
    });
  });

  it("handles a zero due amount defensively (applies nothing, all of it is change)", () => {
    expect(calculateCashApplication(10000, 0)).toEqual({
      appliedAmountInPaise: 0,
      changeAmountInPaise: 10000,
    });
  });
});

describe("calculateBillStatusAfterPayment", () => {
  it("returns UNPAID for zero paid", () => {
    expect(calculateBillStatusAfterPayment(100000, 0)).toBe("UNPAID");
  });

  it("returns PARTIALLY_PAID for a partial amount", () => {
    expect(calculateBillStatusAfterPayment(100000, 40000)).toBe("PARTIALLY_PAID");
  });

  it("returns PAID for an exact payment", () => {
    expect(calculateBillStatusAfterPayment(100000, 100000)).toBe("PAID");
  });

  it("returns PAID defensively if somehow overpaid", () => {
    expect(calculateBillStatusAfterPayment(100000, 150000)).toBe("PAID");
  });
});
