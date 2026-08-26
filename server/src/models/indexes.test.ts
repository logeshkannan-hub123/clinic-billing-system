import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectTestDb, disconnectTestDb } from "../test/testDb.js";
import { BillModel } from "./Bill.js";
import { MedicineModel } from "./Medicine.js";
import { PaymentModel } from "./Payment.js";

beforeAll(async () => {
  await connectTestDb();
  // .init() waits for background index building to finish, so the
  // assertions below are deterministic rather than racing index creation.
  await Promise.all([BillModel.init(), PaymentModel.init(), MedicineModel.init()]);
}, 60000);

afterAll(async () => {
  await disconnectTestDb();
});

interface IndexInfo {
  key: Record<string, unknown>;
  unique?: boolean;
}

function hasIndex(indexes: IndexInfo[], key: Record<string, number>): IndexInfo | undefined {
  return indexes.find((index) => {
    const indexKeys = Object.keys(index.key);
    const wantedKeys = Object.keys(key);
    return (
      indexKeys.length === wantedKeys.length &&
      wantedKeys.every((field) => index.key[field] === key[field])
    );
  });
}

describe("Bill indexes", () => {
  it("has a single-field index on issuedAt", async () => {
    const indexes = await BillModel.collection.indexes();
    expect(hasIndex(indexes, { issuedAt: 1 })).toBeDefined();
  });

  it("has a compound index on status + issuedAt (descending)", async () => {
    const indexes = await BillModel.collection.indexes();
    expect(hasIndex(indexes, { status: 1, issuedAt: -1 })).toBeDefined();
  });

  it("has a single-field index on patientPhone", async () => {
    const indexes = await BillModel.collection.indexes();
    expect(hasIndex(indexes, { patientPhone: 1 })).toBeDefined();
  });

  it("retains its unique index on billNumber", async () => {
    const indexes = await BillModel.collection.indexes();
    const billNumberIndex = hasIndex(indexes, { billNumber: 1 });
    expect(billNumberIndex?.unique).toBe(true);
  });
});

describe("Medicine indexes", () => {
  it("has a compound index on status + category", async () => {
    const indexes = await MedicineModel.collection.indexes();
    expect(hasIndex(indexes, { status: 1, category: 1 })).toBeDefined();
  });

  it("has a single-field index on name", async () => {
    const indexes = await MedicineModel.collection.indexes();
    expect(hasIndex(indexes, { name: 1 })).toBeDefined();
  });
});

describe("Payment indexes", () => {
  it("has a single-field index on createdAt", async () => {
    const indexes = await PaymentModel.collection.indexes();
    expect(hasIndex(indexes, { createdAt: 1 })).toBeDefined();
  });

  it("retains its index on billId", async () => {
    const indexes = await PaymentModel.collection.indexes();
    expect(hasIndex(indexes, { billId: 1 })).toBeDefined();
  });
});
