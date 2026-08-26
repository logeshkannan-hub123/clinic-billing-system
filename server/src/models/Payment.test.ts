import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { PaymentModel } from "./Payment.js";

describe("Payment model", () => {
  it("passes validation with valid cash payment data", () => {
    const payment = new PaymentModel({
      billId: new Types.ObjectId(),
      method: "CASH",
      amountInPaise: 50000,
      tenderedAmountInPaise: 50000,
      changeAmountInPaise: 0,
      recordedBy: new Types.ObjectId(),
    });
    expect(payment.validateSync()).toBeUndefined();
  });

  it("rejects a zero amount", () => {
    const payment = new PaymentModel({
      billId: new Types.ObjectId(),
      method: "UPI",
      amountInPaise: 0,
      recordedBy: new Types.ObjectId(),
    });
    const error = payment.validateSync();
    expect(error?.errors.amountInPaise).toBeDefined();
  });

  it("rejects an invalid method", () => {
    const payment = new PaymentModel({
      billId: new Types.ObjectId(),
      method: "CARD",
      amountInPaise: 100,
      recordedBy: new Types.ObjectId(),
    });
    const error = payment.validateSync();
    expect(error?.errors.method).toBeDefined();
  });

  it("requires tenderedAmountInPaise for CASH payments", () => {
    const payment = new PaymentModel({
      billId: new Types.ObjectId(),
      method: "CASH",
      amountInPaise: 500,
      recordedBy: new Types.ObjectId(),
    });
    const error = payment.validateSync();
    expect(error?.errors.tenderedAmountInPaise).toBeDefined();
  });

  it("rejects tenderedAmountInPaise on a UPI payment", () => {
    const payment = new PaymentModel({
      billId: new Types.ObjectId(),
      method: "UPI",
      amountInPaise: 500,
      tenderedAmountInPaise: 500,
      recordedBy: new Types.ObjectId(),
    });
    const error = payment.validateSync();
    expect(error?.errors.tenderedAmountInPaise).toBeDefined();
  });

  it("rejects upiReference on a CASH payment", () => {
    const payment = new PaymentModel({
      billId: new Types.ObjectId(),
      method: "CASH",
      amountInPaise: 500,
      tenderedAmountInPaise: 500,
      changeAmountInPaise: 0,
      upiReference: "TXN123",
      recordedBy: new Types.ObjectId(),
    });
    const error = payment.validateSync();
    expect(error?.errors.upiReference).toBeDefined();
  });

  it("accepts a UPI payment with an optional reference", () => {
    const payment = new PaymentModel({
      billId: new Types.ObjectId(),
      method: "UPI",
      amountInPaise: 500,
      upiReference: "TXN123",
      recordedBy: new Types.ObjectId(),
    });
    expect(payment.validateSync()).toBeUndefined();
  });
});
