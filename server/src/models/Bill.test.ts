import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { BillModel } from "./Bill.js";

function validBillData() {
  return {
    billNumber: "INV-20260815-001",
    patientId: new Types.ObjectId(),
    patientName: "Asha Rao",
    patientPhone: "9876543210",
    items: [
      {
        medicineName: "Paracetamol",
        unitType: "tablet",
        quantity: 10,
        unitPriceInPaise: 200,
        lineTotalInPaise: 2000,
      },
    ],
    consultationFeeInPaise: 50000,
    subtotalInPaise: 52000,
    taxEnabled: false,
    taxAmountInPaise: 0,
    roundingAdjustmentInPaise: 0,
    grandTotalInPaise: 52000,
    status: "UNPAID",
    issuedAt: new Date(),
    createdBy: new Types.ObjectId(),
  };
}

describe("Bill model", () => {
  it("passes validation with valid data", () => {
    const bill = new BillModel(validBillData());
    expect(bill.validateSync()).toBeUndefined();
  });

  it("rejects a non-integer money field", () => {
    const bill = new BillModel({ ...validBillData(), grandTotalInPaise: 520.5 });
    const error = bill.validateSync();
    expect(error?.errors.grandTotalInPaise).toBeDefined();
  });

  it("rejects an unrecognized medicine unit type", () => {
    const data = validBillData();
    data.items[0]!.unitType = "kg";
    const bill = new BillModel(data);
    const error = bill.validateSync();
    expect(error?.errors["items.0.unitType"]).toBeDefined();
  });

  it("rejects an invalid status", () => {
    const bill = new BillModel({ ...validBillData(), status: "REFUNDED" });
    const error = bill.validateSync();
    expect(error?.errors.status).toBeDefined();
  });

  it("rejects an item lineTotal that does not equal quantity × unitPrice", () => {
    const data = validBillData();
    data.items[0]!.lineTotalInPaise = 9999;
    const bill = new BillModel(data);
    const error = bill.validateSync();
    expect(error?.errors["items.0.lineTotalInPaise"]).toBeDefined();
  });

  it("rejects a subtotal that does not equal item totals plus consultation fee", () => {
    const bill = new BillModel({ ...validBillData(), subtotalInPaise: 999 });
    const error = bill.validateSync();
    expect(error?.errors.subtotalInPaise).toBeDefined();
  });

  it("rejects a grandTotal that does not equal subtotal + tax + rounding", () => {
    const bill = new BillModel({ ...validBillData(), grandTotalInPaise: 999 });
    const error = bill.validateSync();
    expect(error?.errors.grandTotalInPaise).toBeDefined();
  });

  it("rejects a nonzero taxAmount when taxEnabled is false", () => {
    const bill = new BillModel({ ...validBillData(), taxAmountInPaise: 100 });
    const error = bill.validateSync();
    expect(error?.errors.taxAmountInPaise).toBeDefined();
  });

  it("rejects taxEnabled true without a taxRateBasisPoints", () => {
    const bill = new BillModel({ ...validBillData(), taxEnabled: true });
    const error = bill.validateSync();
    expect(error?.errors.taxRateBasisPoints).toBeDefined();
  });

  it("accepts a consistent bill with tax enabled", () => {
    const data = validBillData();
    data.taxEnabled = true;
    (data as Record<string, unknown>).taxRateBasisPoints = 500; // 5%
    data.taxAmountInPaise = 2600; // 5% of 52000
    data.grandTotalInPaise = 54600; // subtotal + tax + rounding(0)
    const bill = new BillModel(data);
    expect(bill.validateSync()).toBeUndefined();
  });

  it("rejects a taxRateBasisPoints above 10000 (100%)", () => {
    const data = validBillData();
    data.taxEnabled = true;
    (data as Record<string, unknown>).taxRateBasisPoints = 20000;
    data.taxAmountInPaise = 2600;
    data.grandTotalInPaise = 54600;
    const bill = new BillModel(data);
    const error = bill.validateSync();
    expect(error?.errors.taxRateBasisPoints).toBeDefined();
  });

  it("rejects cancelledBy set while status is not CANCELLED", () => {
    const bill = new BillModel({ ...validBillData(), cancelledBy: new Types.ObjectId() });
    const error = bill.validateSync();
    expect(error?.errors.cancelledBy).toBeDefined();
  });

  it("rejects status CANCELLED without cancelledBy/cancelledAt", () => {
    const bill = new BillModel({ ...validBillData(), status: "CANCELLED" });
    const error = bill.validateSync();
    expect(error?.errors.cancelledBy).toBeDefined();
    expect(error?.errors.cancelledAt).toBeDefined();
  });

  it("accepts a cancelled bill with cancelledBy and cancelledAt set", () => {
    const bill = new BillModel({
      ...validBillData(),
      status: "CANCELLED",
      cancelledBy: new Types.ObjectId(),
      cancelledAt: new Date(),
    });
    expect(bill.validateSync()).toBeUndefined();
  });
});
