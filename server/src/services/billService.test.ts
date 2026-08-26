import { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BillModel } from "../models/Bill.js";
import { PatientModel } from "../models/Patient.js";
import { PaymentModel } from "../models/Payment.js";
import { clearTestDb, connectTestDb, disconnectTestDb } from "../test/testDb.js";
import {
  BillNotCancellableError,
  BillNotEditableError,
  BillNotFoundError,
  BillNotPayableError,
  DuplicateBillWarningError,
  InvalidPaymentAmountError,
  MedicineInactiveError,
  MedicineNotFoundError,
  OverpaymentError,
  PartialPaymentsDisabledError,
  PaymentMethodDisabledError,
  cancelBill,
  createBill,
  editBill,
  getBillWithPayments,
  listBills,
  previewBill,
  recordPayment,
  type BillItemInput,
} from "./billService.js";
import { updateClinicSettings, updateTaxConfig } from "./clinicSettingsService.js";
import { createMedicine, setMedicineStatus, updateMedicine } from "./medicineService.js";

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

function oneItem(overrides: Partial<BillItemInput> = {}): BillItemInput[] {
  return [
    {
      medicineName: "Paracetamol",
      unitType: "tablet",
      quantity: 10,
      unitPriceInPaise: 200,
      ...overrides,
    },
  ];
}

function baseInput() {
  return {
    patientName: "Asha Rao",
    patientPhone: "9876543210",
    items: oneItem(),
    consultationFeeInPaise: 50000,
  };
}

describe("previewBill", () => {
  it("computes the same totals createBill would, without persisting anything", async () => {
    const preview = await previewBill({ items: oneItem(), consultationFeeInPaise: 50000 });
    expect(preview.subtotalInPaise).toBe(52000);
    expect(preview.grandTotalInPaise).toBe(52000);
    expect(preview.taxEnabled).toBe(false);
    expect(preview.taxAmountInPaise).toBe(0);

    expect(await BillModel.countDocuments()).toBe(0);
    expect(await PatientModel.countDocuments()).toBe(0);
    expect(await PaymentModel.countDocuments()).toBe(0);
  });

  it("respects the currently active tax configuration", async () => {
    await updateTaxConfig({ taxEnabled: true, taxRateBasisPoints: 500 }, actor.id);
    const preview = await previewBill({ items: oneItem(), consultationFeeInPaise: 50000 });
    expect(preview.taxEnabled).toBe(true);
    expect(preview.taxRateBasisPoints).toBe(500);
    expect(preview.taxAmountInPaise).toBe(2600); // 5% of 52000
    expect(preview.grandTotalInPaise).toBe(54600);
  });

  it("matches createBill's totals exactly for the same input", async () => {
    await updateTaxConfig({ taxEnabled: true, taxRateBasisPoints: 1250 }, actor.id);
    const input = { items: oneItem({ quantity: 7, unitPriceInPaise: 333 }), consultationFeeInPaise: 12345 };

    const preview = await previewBill(input);
    const bill = await createBill({ ...input, patientName: "Asha Rao", patientPhone: "9876543210" }, actor);

    expect(bill.subtotalInPaise).toBe(preview.subtotalInPaise);
    expect(bill.taxAmountInPaise).toBe(preview.taxAmountInPaise);
    expect(bill.roundingAdjustmentInPaise).toBe(preview.roundingAdjustmentInPaise);
    expect(bill.grandTotalInPaise).toBe(preview.grandTotalInPaise);
  });

  it("never creates database records even when called repeatedly", async () => {
    for (let i = 0; i < 5; i += 1) {
      await previewBill({ items: oneItem(), consultationFeeInPaise: 50000 });
    }
    expect(await BillModel.countDocuments()).toBe(0);
    expect(await PatientModel.countDocuments()).toBe(0);
  });
});

describe("createBill", () => {
  it("computes totals server-side and allocates a bill number", async () => {
    const bill = await createBill(baseInput(), actor);
    expect(bill.billNumber).toMatch(/^INV-\d{8}-\d{3}$/);
    expect(bill.subtotalInPaise).toBe(52000); // 2000 items + 50000 fee
    expect(bill.grandTotalInPaise).toBe(52000); // no tax, exact rupee
    expect(bill.status).toBe("UNPAID");
    expect(bill.createdBy.toString()).toBe(actor.id.toString());
  });

  it("reuses the same Patient across repeat bills for the same person", async () => {
    const first = await createBill(baseInput(), actor);
    const second = await createBill({ ...baseInput(), confirmDuplicate: true }, actor);
    expect(second.patientId.toString()).toBe(first.patientId.toString());
  });

  it("snapshots the current tax config onto the bill", async () => {
    await updateTaxConfig({ taxEnabled: true, taxRateBasisPoints: 500 }, actor.id);
    const bill = await createBill(baseInput(), actor);
    expect(bill.taxEnabled).toBe(true);
    expect(bill.taxRateBasisPoints).toBe(500);
    expect(bill.taxAmountInPaise).toBe(2600); // 5% of 52000
  });

  it("warns on a likely duplicate instead of creating a second bill", async () => {
    await createBill(baseInput(), actor);
    await expect(createBill(baseInput(), actor)).rejects.toBeInstanceOf(DuplicateBillWarningError);

    const count = await BillModel.countDocuments();
    expect(count).toBe(1);
  });

  it("creates the bill anyway once confirmDuplicate is set", async () => {
    const first = await createBill(baseInput(), actor);
    const second = await createBill({ ...baseInput(), confirmDuplicate: true }, actor);
    expect(second._id.toString()).not.toBe(first._id.toString());
    expect(second.billNumber).not.toBe(first.billNumber);

    const count = await BillModel.countDocuments();
    expect(count).toBe(2);
  });

  it("does not warn for a different patient even with the same amount", async () => {
    await createBill(baseInput(), actor);
    const bill = await createBill(
      { ...baseInput(), patientPhone: "9999999999" },
      actor,
    );
    expect(bill).toBeDefined();
  });

  it("allocates unique, gapless-per-day sequential bill numbers under real concurrency", async () => {
    const results = await Promise.all(
      Array.from({ length: 15 }, (_, index) =>
        createBill(
          { ...baseInput(), patientPhone: `90000000${String(index).padStart(2, "0")}` },
          actor,
        ),
      ),
    );

    const billNumbers = results.map((bill) => bill.billNumber);
    expect(new Set(billNumbers).size).toBe(15);

    const sequenceNumbers = billNumbers
      .map((number) => Number(number.split("-")[2]))
      .sort((a, b) => a - b);
    expect(sequenceNumbers).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });
});

describe("createBill — idempotency key", () => {
  it("replays the same bill for a repeated request carrying the same key, instead of creating a second one", async () => {
    const first = await createBill({ ...baseInput(), idempotencyKey: "attempt-1" }, actor);
    const replay = await createBill({ ...baseInput(), idempotencyKey: "attempt-1" }, actor);

    expect(replay._id.toString()).toBe(first._id.toString());
    expect(replay.billNumber).toBe(first.billNumber);
    expect(await BillModel.countDocuments()).toBe(1);
  });

  it("resolves a genuine double-click (two concurrent requests, same key) to exactly one bill", async () => {
    const results = await Promise.all([
      createBill({ ...baseInput(), idempotencyKey: "double-click-1" }, actor),
      createBill({ ...baseInput(), idempotencyKey: "double-click-1" }, actor),
    ]);

    expect(results[0]!._id.toString()).toBe(results[1]!._id.toString());
    expect(await BillModel.countDocuments()).toBe(1);
  });

  it("still allows two genuinely different bills when they carry different keys", async () => {
    const first = await createBill({ ...baseInput(), idempotencyKey: "key-a" }, actor);
    const second = await createBill(
      { ...baseInput(), patientPhone: "9111111111", idempotencyKey: "key-b" },
      actor,
    );

    expect(second._id.toString()).not.toBe(first._id.toString());
    expect(await BillModel.countDocuments()).toBe(2);
  });

  it("keeps working exactly as before when no key is supplied at all", async () => {
    const first = await createBill(baseInput(), actor);
    expect(first.idempotencyKey ?? null).toBeNull();
  });
});

describe("createBill — clinic settings integration", () => {
  it("skips the duplicate-bill check entirely when duplicateWarningEnabled is false", async () => {
    await updateClinicSettings({ billing: { duplicateWarningEnabled: false } }, actor.id);

    await createBill(baseInput(), actor);
    const second = await createBill(baseInput(), actor); // would normally warn — must not throw

    expect(second).toBeDefined();
    expect(await BillModel.countDocuments()).toBe(2);
  });

  it("still warns on a likely duplicate when duplicateWarningEnabled is true (default)", async () => {
    await createBill(baseInput(), actor);
    await expect(createBill(baseInput(), actor)).rejects.toBeInstanceOf(DuplicateBillWarningError);
  });

  it("uses the configured invoicePrefix for newly issued bills", async () => {
    await updateClinicSettings({ billing: { invoicePrefix: "CLN" } }, actor.id);
    const bill = await createBill(baseInput(), actor);
    expect(bill.billNumber).toMatch(/^CLN-\d{8}-\d{3}$/);
  });

  it("does not rewrite a bill number already issued before the prefix changed", async () => {
    const original = await createBill(baseInput(), actor); // default "INV" prefix
    expect(original.billNumber).toMatch(/^INV-/);

    await updateClinicSettings({ billing: { invoicePrefix: "CLN" } }, actor.id);

    const reloaded = await BillModel.findById(original._id).lean();
    expect(reloaded!.billNumber).toBe(original.billNumber);
    expect(reloaded!.billNumber).toMatch(/^INV-/);
  });
});

describe("editBill", () => {
  it("allows editing an UNPAID bill and recomputes totals", async () => {
    const bill = await createBill(baseInput(), actor);
    const edited = await editBill(
      bill._id.toString(),
      { ...baseInput(), items: oneItem({ quantity: 20 }) },
      actor,
    );
    expect(edited.subtotalInPaise).toBe(54000); // 20*200 + 50000
    expect(edited.billNumber).toBe(bill.billNumber); // identity preserved
  });

  it("uses the CURRENT tax config at edit time, not the original snapshot", async () => {
    const bill = await createBill(baseInput(), actor); // no tax yet
    await updateTaxConfig({ taxEnabled: true, taxRateBasisPoints: 1000 }, actor.id);

    const edited = await editBill(bill._id.toString(), baseInput(), actor);
    expect(edited.taxEnabled).toBe(true);
    expect(edited.taxAmountInPaise).toBe(5200); // 10% of 52000
  });

  it("rejects editing once the bill is PARTIALLY_PAID", async () => {
    const bill = await createBill(baseInput(), actor);
    await recordPayment(bill._id.toString(), { method: "CASH", tenderedAmountInPaise: 10000 }, actor);

    await expect(editBill(bill._id.toString(), baseInput(), actor)).rejects.toBeInstanceOf(
      BillNotEditableError,
    );
  });

  it("rejects editing once the bill is PAID", async () => {
    const bill = await createBill(baseInput(), actor);
    await recordPayment(bill._id.toString(), { method: "CASH", tenderedAmountInPaise: 52000 }, actor);

    await expect(editBill(bill._id.toString(), baseInput(), actor)).rejects.toBeInstanceOf(
      BillNotEditableError,
    );
  });

  it("rejects editing a nonexistent bill", async () => {
    await expect(
      editBill(new Types.ObjectId().toString(), baseInput(), actor),
    ).rejects.toBeInstanceOf(BillNotFoundError);
  });
});

describe("cancelBill", () => {
  it("cancels an UNPAID bill", async () => {
    const bill = await createBill(baseInput(), actor);
    const cancelled = await cancelBill(bill._id.toString(), actor);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledBy?.toString()).toBe(actor.id.toString());
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
  });

  it("rejects cancelling a PARTIALLY_PAID bill", async () => {
    const bill = await createBill(baseInput(), actor);
    await recordPayment(bill._id.toString(), { method: "CASH", tenderedAmountInPaise: 10000 }, actor);

    await expect(cancelBill(bill._id.toString(), actor)).rejects.toBeInstanceOf(
      BillNotCancellableError,
    );
  });

  it("rejects cancelling an already-CANCELLED bill", async () => {
    const bill = await createBill(baseInput(), actor);
    await cancelBill(bill._id.toString(), actor);

    await expect(cancelBill(bill._id.toString(), actor)).rejects.toBeInstanceOf(
      BillNotCancellableError,
    );
  });
});

describe("recordPayment — CASH", () => {
  it("applies tendered cash and gives no change for an exact payment", async () => {
    const bill = await createBill(baseInput(), actor); // due 52000
    const result = await recordPayment(
      bill._id.toString(),
      { method: "CASH", tenderedAmountInPaise: 52000 },
      actor,
    );
    expect(result.payment.amountInPaise).toBe(52000);
    expect(result.payment.changeAmountInPaise).toBe(0);
    expect(result.bill.status).toBe("PAID");
    expect(result.dueAmountInPaise).toBe(0);
  });

  it("caps applied amount at due and returns change for an over-tender", async () => {
    const bill = await createBill(baseInput(), actor); // due 52000
    const result = await recordPayment(
      bill._id.toString(),
      { method: "CASH", tenderedAmountInPaise: 60000 },
      actor,
    );
    expect(result.payment.amountInPaise).toBe(52000);
    expect(result.payment.changeAmountInPaise).toBe(8000);
    expect(result.bill.status).toBe("PAID");
  });

  it("allows a partial cash payment with no change, moving status to PARTIALLY_PAID", async () => {
    const bill = await createBill(baseInput(), actor); // due 52000
    const result = await recordPayment(
      bill._id.toString(),
      { method: "CASH", tenderedAmountInPaise: 20000 },
      actor,
    );
    expect(result.payment.amountInPaise).toBe(20000);
    expect(result.payment.changeAmountInPaise).toBe(0);
    expect(result.bill.status).toBe("PARTIALLY_PAID");
    expect(result.dueAmountInPaise).toBe(32000);
  });

  it("supports multiple partial cash payments reaching PAID", async () => {
    const bill = await createBill(baseInput(), actor); // due 52000
    await recordPayment(bill._id.toString(), { method: "CASH", tenderedAmountInPaise: 20000 }, actor);
    const final = await recordPayment(
      bill._id.toString(),
      { method: "CASH", tenderedAmountInPaise: 32000 },
      actor,
    );
    expect(final.bill.status).toBe("PAID");
    expect(final.dueAmountInPaise).toBe(0);

    const payments = await PaymentModel.find({ billId: bill._id });
    expect(payments).toHaveLength(2);
  });

  it("rejects a zero or negative tendered amount", async () => {
    const bill = await createBill(baseInput(), actor);
    await expect(
      recordPayment(bill._id.toString(), { method: "CASH", tenderedAmountInPaise: 0 }, actor),
    ).rejects.toBeInstanceOf(InvalidPaymentAmountError);
  });
});

describe("recordPayment — UPI", () => {
  it("applies the exact entered amount with an optional reference", async () => {
    const bill = await createBill(baseInput(), actor); // due 52000
    const result = await recordPayment(
      bill._id.toString(),
      { method: "UPI", amountInPaise: 52000, upiReference: "TXN123" },
      actor,
    );
    expect(result.payment.amountInPaise).toBe(52000);
    expect(result.payment.upiReference).toBe("TXN123");
    expect(result.bill.status).toBe("PAID");
  });

  it("allows a partial UPI payment without a reference", async () => {
    const bill = await createBill(baseInput(), actor); // due 52000
    const result = await recordPayment(
      bill._id.toString(),
      { method: "UPI", amountInPaise: 20000 },
      actor,
    );
    expect(result.bill.status).toBe("PARTIALLY_PAID");
    expect(result.payment.upiReference).toBeNull();
  });

  it("rejects a UPI amount exceeding the outstanding due amount", async () => {
    const bill = await createBill(baseInput(), actor); // due 52000
    await expect(
      recordPayment(bill._id.toString(), { method: "UPI", amountInPaise: 60000 }, actor),
    ).rejects.toBeInstanceOf(OverpaymentError);
  });
});

describe("recordPayment — payment-method settings integration", () => {
  it("rejects a CASH payment when payments.cashEnabled is false", async () => {
    const bill = await createBill(baseInput(), actor);
    await updateClinicSettings({ payments: { cashEnabled: false } }, actor.id);

    await expect(
      recordPayment(bill._id.toString(), { method: "CASH", tenderedAmountInPaise: 52000 }, actor),
    ).rejects.toBeInstanceOf(PaymentMethodDisabledError);
  });

  it("rejects a UPI payment when payments.upiEnabled is false", async () => {
    const bill = await createBill(baseInput(), actor);
    await updateClinicSettings({ payments: { upiEnabled: false } }, actor.id);

    await expect(
      recordPayment(bill._id.toString(), { method: "UPI", amountInPaise: 52000 }, actor),
    ).rejects.toBeInstanceOf(PaymentMethodDisabledError);
  });

  it("still allows the payment method that remains enabled", async () => {
    const bill = await createBill(baseInput(), actor);
    await updateClinicSettings({ payments: { upiEnabled: false } }, actor.id);

    const result = await recordPayment(
      bill._id.toString(),
      { method: "CASH", tenderedAmountInPaise: 52000 },
      actor,
    );
    expect(result.bill.status).toBe("PAID");
  });
});

describe("recordPayment — allowPartialPayments setting", () => {
  it("rejects a CASH payment that would leave a balance due when partial payments are disabled", async () => {
    const bill = await createBill(baseInput(), actor); // due 52000
    await updateClinicSettings({ billing: { allowPartialPayments: false } }, actor.id);

    await expect(
      recordPayment(bill._id.toString(), { method: "CASH", tenderedAmountInPaise: 20000 }, actor),
    ).rejects.toBeInstanceOf(PartialPaymentsDisabledError);
  });

  it("rejects a UPI payment that would leave a balance due when partial payments are disabled", async () => {
    const bill = await createBill(baseInput(), actor); // due 52000
    await updateClinicSettings({ billing: { allowPartialPayments: false } }, actor.id);

    await expect(
      recordPayment(bill._id.toString(), { method: "UPI", amountInPaise: 20000 }, actor),
    ).rejects.toBeInstanceOf(PartialPaymentsDisabledError);
  });

  it("still allows a full CASH payment (with change) when partial payments are disabled", async () => {
    const bill = await createBill(baseInput(), actor); // due 52000
    await updateClinicSettings({ billing: { allowPartialPayments: false } }, actor.id);

    const result = await recordPayment(
      bill._id.toString(),
      { method: "CASH", tenderedAmountInPaise: 60000 },
      actor,
    );
    expect(result.bill.status).toBe("PAID");
    expect(result.payment.changeAmountInPaise).toBe(8000);
  });

  it("still allows partial payments when the setting is left at its default (true)", async () => {
    const bill = await createBill(baseInput(), actor); // due 52000
    const result = await recordPayment(
      bill._id.toString(),
      { method: "CASH", tenderedAmountInPaise: 20000 },
      actor,
    );
    expect(result.bill.status).toBe("PARTIALLY_PAID");
  });
});

describe("recordPayment — terminal/error states", () => {
  it("rejects any payment against a CANCELLED bill", async () => {
    const bill = await createBill(baseInput(), actor);
    await cancelBill(bill._id.toString(), actor);

    await expect(
      recordPayment(bill._id.toString(), { method: "UPI", amountInPaise: 1000 }, actor),
    ).rejects.toBeInstanceOf(BillNotPayableError);
  });

  it("rejects any further payment against an already-PAID bill", async () => {
    const bill = await createBill(baseInput(), actor);
    await recordPayment(bill._id.toString(), { method: "UPI", amountInPaise: 52000 }, actor);

    await expect(
      recordPayment(bill._id.toString(), { method: "UPI", amountInPaise: 1 }, actor),
    ).rejects.toBeInstanceOf(BillNotPayableError);
  });

  it("rejects a payment against a nonexistent bill", async () => {
    await expect(
      recordPayment(new Types.ObjectId().toString(), { method: "UPI", amountInPaise: 1000 }, actor),
    ).rejects.toBeInstanceOf(BillNotFoundError);
  });
});

describe("recordPayment — concurrency (overpayment prevention)", () => {
  it("never allows two concurrent payments to jointly exceed the grand total", async () => {
    const bill = await createBill(baseInput(), actor); // due 52000

    // Two payments that are each individually valid (30000 <= 52000) but
    // would jointly overpay (60000 > 52000) if both were allowed through.
    const attempts = await Promise.allSettled([
      recordPayment(bill._id.toString(), { method: "UPI", amountInPaise: 30000 }, actor),
      recordPayment(bill._id.toString(), { method: "UPI", amountInPaise: 30000 }, actor),
    ]);

    const succeeded = attempts.filter((result) => result.status === "fulfilled");
    const failed = attempts.filter((result) => result.status === "rejected");

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(OverpaymentError);

    const payments = await PaymentModel.find({ billId: bill._id });
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amountInPaise, 0);
    expect(totalPaid).toBeLessThanOrEqual(52000);
    expect(totalPaid).toBe(30000);
  });

  it("lets two concurrent payments both succeed when they jointly fit exactly", async () => {
    const bill = await createBill(baseInput(), actor); // due 52000

    const attempts = await Promise.allSettled([
      recordPayment(bill._id.toString(), { method: "UPI", amountInPaise: 26000 }, actor),
      recordPayment(bill._id.toString(), { method: "UPI", amountInPaise: 26000 }, actor),
    ]);

    expect(attempts.every((result) => result.status === "fulfilled")).toBe(true);

    const payments = await PaymentModel.find({ billId: bill._id });
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amountInPaise, 0);
    expect(totalPaid).toBe(52000);

    const finalBill = await BillModel.findById(bill._id);
    expect(finalBill?.status).toBe("PAID");
  });
});

describe("listBills", () => {
  it("filters by status", async () => {
    const paid = await createBill(baseInput(), actor);
    await recordPayment(paid._id.toString(), { method: "UPI", amountInPaise: 52000 }, actor);
    await createBill({ ...baseInput(), patientPhone: "9111111111" }, actor); // stays UNPAID

    const { bills, total } = await listBills({ status: "PAID" });
    expect(total).toBe(1);
    expect(bills[0]!.status).toBe("PAID");
  });

  it("filters by phone/name search across both fields", async () => {
    await createBill(baseInput(), actor); // Asha Rao / 9876543210
    await createBill(
      { ...baseInput(), patientName: "Kiran Mehta", patientPhone: "9111111111" },
      actor,
    );

    const byPhone = await listBills({ search: "9876543210" });
    expect(byPhone.total).toBe(1);

    const byName = await listBills({ search: "kiran" });
    expect(byName.total).toBe(1);
  });

  it("paginates with limit/skip", async () => {
    for (let i = 0; i < 5; i += 1) {
      await createBill({ ...baseInput(), patientPhone: `900000000${i}` }, actor);
    }
    const page1 = await listBills({ limit: 2, skip: 0 });
    const page2 = await listBills({ limit: 2, skip: 2 });
    expect(page1.bills).toHaveLength(2);
    expect(page2.bills).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.bills[0]!._id.toString()).not.toBe(page2.bills[0]!._id.toString());
  });

  describe("dueAmountInPaise", () => {
    it("equals the full grand total for a bill with no payments", async () => {
      await createBill(baseInput(), actor);
      const { bills } = await listBills({});
      expect(bills[0]!.dueAmountInPaise).toBe(52000);
    });

    it("reflects the outstanding balance after a partial payment, computed from real payment records", async () => {
      const bill = await createBill(baseInput(), actor);
      await recordPayment(bill._id.toString(), { method: "CASH", tenderedAmountInPaise: 20000 }, actor);

      const { bills } = await listBills({ status: "PARTIALLY_PAID" });
      expect(bills).toHaveLength(1);
      expect(bills[0]!.dueAmountInPaise).toBe(32000); // 52000 - 20000
    });

    it("is zero once a bill is fully paid, even across multiple installments", async () => {
      const bill = await createBill(baseInput(), actor);
      await recordPayment(bill._id.toString(), { method: "CASH", tenderedAmountInPaise: 20000 }, actor);
      await recordPayment(bill._id.toString(), { method: "UPI", amountInPaise: 32000 }, actor);

      const { bills } = await listBills({ status: "PAID" });
      expect(bills[0]!.dueAmountInPaise).toBe(0);
    });

    it("computes each bill's due amount independently in the same page, not by client-supplied values", async () => {
      const untouched = await createBill(baseInput(), actor); // stays UNPAID, due 52000
      const partial = await createBill({ ...baseInput(), patientPhone: "9111111111" }, actor);
      await recordPayment(partial._id.toString(), { method: "CASH", tenderedAmountInPaise: 12000 }, actor);

      const { bills } = await listBills({});
      const byId = new Map(bills.map((bill) => [bill._id.toString(), bill.dueAmountInPaise]));
      expect(byId.get(untouched._id.toString())).toBe(52000);
      expect(byId.get(partial._id.toString())).toBe(40000); // 52000 - 12000
    });
  });
});

describe("getBillWithPayments", () => {
  it("returns the bill with its payment history", async () => {
    const bill = await createBill(baseInput(), actor);
    await recordPayment(bill._id.toString(), { method: "CASH", tenderedAmountInPaise: 20000 }, actor);

    const result = await getBillWithPayments(bill._id.toString());
    expect(result?.bill._id.toString()).toBe(bill._id.toString());
    expect(result?.payments).toHaveLength(1);
  });

  it("returns null for a nonexistent bill", async () => {
    expect(await getBillWithPayments(new Types.ObjectId().toString())).toBeNull();
  });
});

describe("Medicine-linked bill items", () => {
  async function seedMedicine(overrides: Record<string, unknown> = {}) {
    return createMedicine(
      {
        category: "MEDICINE",
        name: "Dolo 500",
        brandName: "Dolo",
        genericName: "Paracetamol",
        composition: "Paracetamol 500 mg",
        strength: "500 mg",
        billingUnit: "tablet",
        mrpInPaise: 350,
        sellingPriceInPaise: 300,
        ...overrides,
      },
      actor,
    );
  }

  it("resolves the full snapshot from the catalog, ignoring client-submitted descriptive fields/price", async () => {
    const medicine = await seedMedicine();
    const bill = await createBill(
      {
        ...baseInput(),
        items: [
          {
            medicineId: medicine._id.toString(),
            medicineName: "Something Else Entirely",
            unitType: "syrup",
            quantity: 2,
            unitPriceInPaise: 1, // stale/tampered — must be ignored
          },
        ],
      },
      actor,
    );

    const item = bill.items[0]!;
    expect(item.medicineName).toBe("Dolo 500");
    expect(item.unitType).toBe("tablet");
    expect(item.unitPriceInPaise).toBe(300);
    expect(item.lineTotalInPaise).toBe(600);
    expect(item.category).toBe("MEDICINE");
    expect(item.brandName).toBe("Dolo");
    expect(item.genericName).toBe("Paracetamol");
    expect(item.composition).toBe("Paracetamol 500 mg");
    expect(item.strength).toBe("500 mg");
    expect(item.mrpInPaise).toBe(350);
    expect(item.medicineId?.toString()).toBe(medicine._id.toString());
  });

  it("reflects the medicine's current price even if the client's request is stale", async () => {
    const medicine = await seedMedicine();
    await updateMedicinePrice(medicine._id.toString(), 500);

    const preview = await previewBill({
      items: [
        {
          medicineId: medicine._id.toString(),
          medicineName: "Dolo 500",
          unitType: "tablet",
          quantity: 1,
          unitPriceInPaise: 300, // the now-stale price the client last saw
        },
      ],
      consultationFeeInPaise: 0,
    });

    expect(preview.itemLineTotalsInPaise[0]).toBe(500);
  });

  it("rejects a bill referencing a nonexistent medicineId", async () => {
    await expect(
      createBill(
        {
          ...baseInput(),
          items: [
            {
              medicineId: new Types.ObjectId().toString(),
              medicineName: "Ghost",
              unitType: "tablet",
              quantity: 1,
              unitPriceInPaise: 100,
            },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(MedicineNotFoundError);
  });

  it("rejects a bill referencing an inactive medicine", async () => {
    const medicine = await seedMedicine();
    await setMedicineStatus(medicine._id.toString(), "INACTIVE", actor);

    await expect(
      createBill(
        {
          ...baseInput(),
          items: [
            {
              medicineId: medicine._id.toString(),
              medicineName: "Dolo 500",
              unitType: "tablet",
              quantity: 1,
              unitPriceInPaise: 300,
            },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(MedicineInactiveError);
  });

  it("editing an unrelated field keeps a since-deactivated medicine's line item intact", async () => {
    const medicine = await seedMedicine();
    const bill = await createBill(
      {
        ...baseInput(),
        items: [
          {
            medicineId: medicine._id.toString(),
            medicineName: "Dolo 500",
            unitType: "tablet",
            quantity: 2,
            unitPriceInPaise: 300,
          },
        ],
      },
      actor,
    );

    await setMedicineStatus(medicine._id.toString(), "INACTIVE", actor);

    // Same item, same quantity — only the consultation fee actually changes.
    // Must succeed even though the referenced medicine is now inactive.
    const edited = await editBill(
      bill._id.toString(),
      {
        ...baseInput(),
        items: [
          {
            medicineId: medicine._id.toString(),
            medicineName: "Dolo 500",
            unitType: "tablet",
            quantity: 2,
            unitPriceInPaise: 300,
          },
        ],
        consultationFeeInPaise: 10000,
      },
      actor,
    );

    expect(edited.consultationFeeInPaise).toBe(10000);
    const item = edited.items[0]!;
    expect(item.medicineId?.toString()).toBe(medicine._id.toString());
    expect(item.medicineName).toBe("Dolo 500");
    expect(item.unitPriceInPaise).toBe(300);
    expect(item.lineTotalInPaise).toBe(600);
  });

  it("still rejects newly increasing the quantity of a line item whose medicine is now inactive", async () => {
    const medicine = await seedMedicine();
    const bill = await createBill(
      {
        ...baseInput(),
        items: [
          {
            medicineId: medicine._id.toString(),
            medicineName: "Dolo 500",
            unitType: "tablet",
            quantity: 2,
            unitPriceInPaise: 300,
          },
        ],
      },
      actor,
    );

    await setMedicineStatus(medicine._id.toString(), "INACTIVE", actor);

    await expect(
      editBill(
        bill._id.toString(),
        {
          ...baseInput(),
          items: [
            {
              medicineId: medicine._id.toString(),
              medicineName: "Dolo 500",
              unitType: "tablet",
              quantity: 5, // actually changed — this line item is no longer "unchanged"
              unitPriceInPaise: 300,
            },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(MedicineInactiveError);
  });

  it("still rejects newly selecting an inactive medicine on an added line item", async () => {
    const active = await seedMedicine();
    const inactive = await seedMedicine({ name: "Crocin 650", brandName: "Crocin" });
    await setMedicineStatus(inactive._id.toString(), "INACTIVE", actor);

    const bill = await createBill(
      {
        ...baseInput(),
        items: [
          {
            medicineId: active._id.toString(),
            medicineName: "Dolo 500",
            unitType: "tablet",
            quantity: 1,
            unitPriceInPaise: 300,
          },
        ],
      },
      actor,
    );

    await expect(
      editBill(
        bill._id.toString(),
        {
          ...baseInput(),
          items: [
            {
              medicineId: active._id.toString(),
              medicineName: "Dolo 500",
              unitType: "tablet",
              quantity: 1,
              unitPriceInPaise: 300,
            },
            {
              medicineId: inactive._id.toString(),
              medicineName: "Crocin 650",
              unitType: "tablet",
              quantity: 1,
              unitPriceInPaise: 300,
            },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(MedicineInactiveError);
  });

  it("still creates a bill with legacy free-text items (no medicineId)", async () => {
    const bill = await createBill(baseInput(), actor);
    const item = bill.items[0]!;
    expect(item.medicineId).toBeNull();
    expect(item.medicineName).toBe("Paracetamol");
    expect(item.category).toBeNull();
  });

  it("re-resolves against the current catalog when editing an UNPAID bill", async () => {
    const medicine = await seedMedicine();
    const bill = await createBill(
      {
        ...baseInput(),
        items: [
          { medicineId: medicine._id.toString(), medicineName: "Dolo 500", unitType: "tablet", quantity: 1, unitPriceInPaise: 300 },
        ],
      },
      actor,
    );

    await updateMedicinePrice(medicine._id.toString(), 450);

    const edited = await editBill(
      bill._id.toString(),
      {
        ...baseInput(),
        items: [
          { medicineId: medicine._id.toString(), medicineName: "Dolo 500", unitType: "tablet", quantity: 1, unitPriceInPaise: 300 },
        ],
      },
      actor,
    );
    expect(edited.items[0]!.unitPriceInPaise).toBe(450);
  });

  async function updateMedicinePrice(id: string, sellingPriceInPaise: number) {
    await updateMedicine(id, { sellingPriceInPaise }, actor);
  }
});
