import { BillModel } from "../models/Bill.js";
import type { BillStatus } from "../models/enums.js";
import { PaymentModel } from "../models/Payment.js";
import { getKolkataDayRangeUtc, getKolkataTodayIso } from "../utils/timezone.js";

export interface DashboardSummary {
  date: string;
  revenueInPaise: number;
  generatedCount: number;
  paidCount: number;
  pendingCount: number;
  partiallyPaidCount: number;
  cancelledCount: number;
}

type CountKey = "paidCount" | "pendingCount" | "partiallyPaidCount" | "cancelledCount";

// UNPAID's dashboard label is "pending" — matches the original card naming in
// requirements.md ("pending bills count"), not the internal status name.
const STATUS_COUNT_KEY: Record<BillStatus, CountKey> = {
  UNPAID: "pendingCount",
  PARTIALLY_PAID: "partiallyPaidCount",
  PAID: "paidCount",
  CANCELLED: "cancelledCount",
};

/**
 * Admin dashboard summary for one Kolkata calendar day (defaults to today).
 * Two aggregation queries total, regardless of data volume — no N+1.
 */
export async function getDashboardSummary(dateIso?: string): Promise<DashboardSummary> {
  const date = dateIso ?? getKolkataTodayIso();
  const { startUtc, endUtc } = getKolkataDayRangeUtc(date);

  const [statusCounts, revenueResult] = await Promise.all([
    BillModel.aggregate<{ _id: BillStatus; count: number }>([
      { $match: { issuedAt: { $gte: startUtc, $lt: endUtc } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    PaymentModel.aggregate<{ _id: null; totalInPaise: number }>([
      { $match: { createdAt: { $gte: startUtc, $lt: endUtc } } },
      { $group: { _id: null, totalInPaise: { $sum: "$amountInPaise" } } },
    ]),
  ]);

  const summary: DashboardSummary = {
    date,
    revenueInPaise: revenueResult[0]?.totalInPaise ?? 0,
    generatedCount: 0,
    paidCount: 0,
    pendingCount: 0,
    partiallyPaidCount: 0,
    cancelledCount: 0,
  };

  for (const entry of statusCounts) {
    summary[STATUS_COUNT_KEY[entry._id]] = entry.count;
    summary.generatedCount += entry.count;
  }

  return summary;
}
