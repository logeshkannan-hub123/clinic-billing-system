import type { BillStatus } from "../models/enums.js";

export interface BillItemInput {
  quantity: number;
  unitPriceInPaise: number;
}

export interface TaxConfig {
  taxEnabled: boolean;
  taxRateBasisPoints: number | null;
}

export interface BillTotals {
  itemLineTotalsInPaise: number[];
  subtotalInPaise: number;
  taxAmountInPaise: number;
  roundingAdjustmentInPaise: number;
  grandTotalInPaise: number;
}

export interface CashApplication {
  appliedAmountInPaise: number;
  changeAmountInPaise: number;
}

export function calculateItemLineTotal(quantity: number, unitPriceInPaise: number): number {
  return quantity * unitPriceInPaise;
}

/** Standard round-half-up to the nearest integer. */
function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/**
 * All bill money math in one place. Pure — no DB access — so every rounding
 * edge case can be tested directly, and so both bill creation and bill
 * editing can share exactly the same calculation.
 */
export function calculateBillTotals(
  items: BillItemInput[],
  consultationFeeInPaise: number,
  taxConfig: TaxConfig,
): BillTotals {
  const itemLineTotalsInPaise = items.map((item) =>
    calculateItemLineTotal(item.quantity, item.unitPriceInPaise),
  );
  const itemsTotalInPaise = itemLineTotalsInPaise.reduce((sum, lineTotal) => sum + lineTotal, 0);
  const subtotalInPaise = itemsTotalInPaise + consultationFeeInPaise;

  // taxRateBasisPoints can legitimately be 0 (0% tax while enabled) — must
  // check `!= null`, not truthiness, or a 0% rate would be skipped.
  const taxAmountInPaise =
    taxConfig.taxEnabled && taxConfig.taxRateBasisPoints != null
      ? roundHalfUp((subtotalInPaise * taxConfig.taxRateBasisPoints) / 10000)
      : 0;

  const preRoundTotalInPaise = subtotalInPaise + taxAmountInPaise;
  const remainder = preRoundTotalInPaise % 100;
  // Confirmed rule: round to the nearest whole rupee; exactly ₹0.50 rounds up.
  const roundedTotalInPaise =
    remainder === 0
      ? preRoundTotalInPaise
      : remainder < 50
        ? preRoundTotalInPaise - remainder
        : preRoundTotalInPaise + (100 - remainder);

  return {
    itemLineTotalsInPaise,
    subtotalInPaise,
    taxAmountInPaise,
    roundingAdjustmentInPaise: roundedTotalInPaise - preRoundTotalInPaise,
    grandTotalInPaise: roundedTotalInPaise,
  };
}

/**
 * CASH payments: the receptionist enters only what was physically handed
 * over (tendered). Everything else — what actually applies to the bill, and
 * how much change is owed — is derived from the bill's current due amount.
 */
export function calculateCashApplication(
  tenderedAmountInPaise: number,
  currentDueInPaise: number,
): CashApplication {
  return {
    appliedAmountInPaise: Math.min(tenderedAmountInPaise, currentDueInPaise),
    changeAmountInPaise: Math.max(0, tenderedAmountInPaise - currentDueInPaise),
  };
}

export function calculateBillStatusAfterPayment(
  grandTotalInPaise: number,
  totalPaidInPaise: number,
): Extract<BillStatus, "UNPAID" | "PARTIALLY_PAID" | "PAID"> {
  if (totalPaidInPaise <= 0) return "UNPAID";
  if (totalPaidInPaise >= grandTotalInPaise) return "PAID";
  return "PARTIALLY_PAID";
}
