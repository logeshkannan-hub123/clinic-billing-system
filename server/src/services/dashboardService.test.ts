import { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BillModel, type BillHydratedDoc } from "../models/Bill.js";
import { PaymentModel } from "../models/Payment.js";
import { clearTestDb, connectTestDb, disconnectTestDb } from "../test/testDb.js";
import { getKolkataTodayIso } from "../utils/timezone.js";
import { cancelBill, createBill, recordPayment, type BillInput } from "./billService.js";
import { getDashboardSummary } from "./dashboardService.js";

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

const actor = { id: new Types.ObjectId() };

function billInput(overrides: Partial<BillInput> = {}): BillInput {
  return {
    patientName: "Asha Rao",
    patientPhone: "9876543210",
    items: [{ medicineName: "Paracetamol", unitType: "tablet", quantity: 10, unitPriceInPaise: 200 }],
    consultationFeeInPaise: 50000, // grandTotal 52000, no tax
    ...overrides,
  };
}

async function setIssuedAt(bill: BillHydratedDoc, date: Date): Promise<void> {
  await BillModel.findByIdAndUpdate(bill._id, { issuedAt: date });
}

async function setPaymentCreatedAt(paymentId: Types.ObjectId, date: Date): Promise<void> {
  // Mongoose's `timestamps` plugin marks `createdAt` immutable against normal
  // updates (findByIdAndUpdate silently no-ops on it) — bypass via the raw
  // driver collection, which has no notion of Mongoose-level immutability.
  // Test-fixture setup only; application code never does this.
  await PaymentModel.collection.updateOne({ _id: paymentId }, { $set: { createdAt: date } });
}

describe("getDashboardSummary — zero-data day", () => {
  it("returns all zeros when nothing happened that day", async () => {
    const summary = await getDashboardSummary("2020-01-01");
    expect(summary).toEqual({
      date: "2020-01-01",
      revenueInPaise: 0,
      generatedCount: 0,
      paidCount: 0,
      pendingCount: 0,
      partiallyPaidCount: 0,
      cancelledCount: 0,
    });
  });
});

describe("getDashboardSummary — default date", () => {
  it("defaults to today in Kolkata when no date is given", async () => {
    await createBill(billInput(), actor); // issuedAt = real "now"
    const summary = await getDashboardSummary();
    expect(summary.date).toBe(getKolkataTodayIso());
    expect(summary.generatedCount).toBe(1);
  });
});

describe("getDashboardSummary — explicit historical date", () => {
  it("returns data for a date other than today", async () => {
    const bill = await createBill(billInput(), actor);
    await setIssuedAt(bill, new Date("2026-08-16T10:00:00.000Z"));

    const summary = await getDashboardSummary("2026-08-16");
    expect(summary.generatedCount).toBe(1);

    const emptyDay = await getDashboardSummary("2026-08-17");
    expect(emptyDay.generatedCount).toBe(0);
  });
});

describe("getDashboardSummary — status counts, including cancelled", () => {
  it("counts each status correctly and sums them into generatedCount", async () => {
    const dayIso = "2026-08-16";
    const middayUtc = new Date("2026-08-16T10:00:00.000Z");

    const unpaid = await createBill(billInput({ patientPhone: "9000000001" }), actor);
    await setIssuedAt(unpaid, middayUtc);

    const paidBill = await createBill(billInput({ patientPhone: "9000000002" }), actor);
    await setIssuedAt(paidBill, middayUtc);
    await recordPayment(paidBill._id.toString(), { method: "UPI", amountInPaise: 52000 }, actor);

    const partiallyPaidBill = await createBill(billInput({ patientPhone: "9000000003" }), actor);
    await setIssuedAt(partiallyPaidBill, middayUtc);
    await recordPayment(
      partiallyPaidBill._id.toString(),
      { method: "UPI", amountInPaise: 10000 },
      actor,
    );

    const cancelledBill = await createBill(billInput({ patientPhone: "9000000004" }), actor);
    await setIssuedAt(cancelledBill, middayUtc);
    await cancelBill(cancelledBill._id.toString(), actor);

    const summary = await getDashboardSummary(dayIso);
    expect(summary.pendingCount).toBe(1);
    expect(summary.paidCount).toBe(1);
    expect(summary.partiallyPaidCount).toBe(1);
    expect(summary.cancelledCount).toBe(1);
    // generatedCount includes cancelled bills, per the confirmed decision.
    expect(summary.generatedCount).toBe(4);
  });

  it("excludes bills issued on other days", async () => {
    const bill = await createBill(billInput(), actor);
    await setIssuedAt(bill, new Date("2026-08-16T10:00:00.000Z"));

    const summary = await getDashboardSummary("2026-08-17");
    expect(summary.generatedCount).toBe(0);
  });
});

describe("getDashboardSummary — revenue", () => {
  it("sums multiple payments against the same bill on the selected day", async () => {
    const bill = await createBill(billInput(), actor); // due 52000
    const first = await recordPayment(
      bill._id.toString(),
      { method: "UPI", amountInPaise: 20000 },
      actor,
    );
    const second = await recordPayment(
      bill._id.toString(),
      { method: "CASH", tenderedAmountInPaise: 32000 },
      actor,
    );

    const targetDay = new Date("2026-08-16T10:00:00.000Z");
    await setPaymentCreatedAt(first.payment._id, targetDay);
    await setPaymentCreatedAt(second.payment._id, targetDay);

    const summary = await getDashboardSummary("2026-08-16");
    expect(summary.revenueInPaise).toBe(52000);
  });

  it("counts revenue by when the payment happened, not when the bill was issued", async () => {
    const bill = await createBill(billInput(), actor); // issued "now"
    const result = await recordPayment(
      bill._id.toString(),
      { method: "UPI", amountInPaise: 52000 },
      actor,
    );
    await setPaymentCreatedAt(result.payment._id, new Date("2026-08-16T10:00:00.000Z"));

    const summary = await getDashboardSummary("2026-08-16");
    expect(summary.revenueInPaise).toBe(52000);
    // The bill itself was issued "now" (a different day in this test), but
    // that must not affect revenue attribution.
  });

  it("excludes payments recorded on a different day", async () => {
    const bill = await createBill(billInput(), actor);
    const result = await recordPayment(
      bill._id.toString(),
      { method: "UPI", amountInPaise: 52000 },
      actor,
    );
    await setPaymentCreatedAt(result.payment._id, new Date("2026-08-16T10:00:00.000Z"));

    const summary = await getDashboardSummary("2026-08-17");
    expect(summary.revenueInPaise).toBe(0);
  });
});

describe("getDashboardSummary — Kolkata midnight boundary", () => {
  it("counts a bill issued at 23:59:59.999 IST toward that day, not the next", async () => {
    const bill = await createBill(billInput(), actor);
    await setIssuedAt(bill, new Date("2026-08-15T18:29:59.999Z")); // 23:59:59.999 IST, Aug 15

    const aug15 = await getDashboardSummary("2026-08-15");
    const aug16 = await getDashboardSummary("2026-08-16");
    expect(aug15.generatedCount).toBe(1);
    expect(aug16.generatedCount).toBe(0);
  });

  it("counts a bill issued at exactly 00:00:00.000 IST toward the next day", async () => {
    const bill = await createBill(billInput(), actor);
    await setIssuedAt(bill, new Date("2026-08-15T18:30:00.000Z")); // 00:00:00.000 IST, Aug 16

    const aug15 = await getDashboardSummary("2026-08-15");
    const aug16 = await getDashboardSummary("2026-08-16");
    expect(aug15.generatedCount).toBe(0);
    expect(aug16.generatedCount).toBe(1);
  });

  it("applies the same boundary to revenue via Payment.createdAt", async () => {
    const bill = await createBill(billInput(), actor);
    const result = await recordPayment(
      bill._id.toString(),
      { method: "UPI", amountInPaise: 52000 },
      actor,
    );
    await setPaymentCreatedAt(result.payment._id, new Date("2026-08-15T18:30:00.000Z"));

    const aug15 = await getDashboardSummary("2026-08-15");
    const aug16 = await getDashboardSummary("2026-08-16");
    expect(aug15.revenueInPaise).toBe(0);
    expect(aug16.revenueInPaise).toBe(52000);
  });

  it("keeps a payment one millisecond before midnight on the earlier day", async () => {
    const bill = await createBill(billInput(), actor);
    const result = await recordPayment(
      bill._id.toString(),
      { method: "UPI", amountInPaise: 52000 },
      actor,
    );
    await setPaymentCreatedAt(result.payment._id, new Date("2026-08-15T18:29:59.999Z"));

    const aug15 = await getDashboardSummary("2026-08-15");
    const aug16 = await getDashboardSummary("2026-08-16");
    expect(aug15.revenueInPaise).toBe(52000);
    expect(aug16.revenueInPaise).toBe(0);
  });
});
