import type { Express } from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { AuditLogModel } from "../models/AuditLog.js";
import { BillModel } from "../models/Bill.js";
import { PatientModel } from "../models/Patient.js";
import { PaymentModel } from "../models/Payment.js";
import { clearTestDb, connectTestDb, disconnectTestDb } from "../test/testDb.js";

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

async function signUpAdmin(app: Express) {
  const agent = request.agent(app);
  await agent.post("/api/auth/signup").send({ username: "doctor", password: "password123" });
  return agent;
}

async function createReceptionistAgent(app: Express, adminAgent: request.Agent) {
  await adminAgent
    .post("/api/admin/receptionists")
    .send({ staffId: "S001", username: "reception1", password: "password123" });
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ username: "reception1", password: "password123" });
  return agent;
}

function billPayload(overrides: Record<string, unknown> = {}) {
  return {
    patientName: "Asha Rao",
    patientPhone: "9876543210",
    items: [{ medicineName: "Paracetamol", unitType: "tablet", quantity: 10, unitPriceInPaise: 200 }],
    consultationFeeInPaise: 50000,
    ...overrides,
  };
}

describe("Bill authorization", () => {
  it("rejects unauthenticated access to every bill endpoint", async () => {
    const app = createApp();
    expect((await request(app).post("/api/bills").send(billPayload())).status).toBe(401);
    expect((await request(app).get("/api/bills")).status).toBe(401);
  });

  it("allows both admin and receptionist to create bills", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const receptionistAgent = await createReceptionistAgent(app, adminAgent);

    expect((await adminAgent.post("/api/bills").send(billPayload())).status).toBe(201);
    expect(
      (await receptionistAgent.post("/api/bills").send(billPayload({ patientPhone: "9111111111" })))
        .status,
    ).toBe(201);
  });

  it("rejects a receptionist cancelling a bill (admin-only)", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const receptionistAgent = await createReceptionistAgent(app, adminAgent);

    const createRes = await adminAgent.post("/api/bills").send(billPayload());
    const res = await receptionistAgent.patch(`/api/bills/${createRes.body._id}/cancel`);
    expect(res.status).toBe(403);
  });

  it("allows admin to cancel a bill", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent.post("/api/bills").send(billPayload());

    const res = await adminAgent.patch(`/api/bills/${createRes.body._id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
  });
});

describe("POST /api/bills — validation", () => {
  it("rejects a missing patientName", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.post("/api/bills").send(billPayload({ patientName: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects an empty items array", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.post("/api/bills").send(billPayload({ items: [] }));
    expect(res.status).toBe(400);
  });

  it("rejects an unrecognized medicine unit type", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.post("/api/bills").send(
      billPayload({
        items: [{ medicineName: "X", unitType: "kg", quantity: 1, unitPriceInPaise: 100 }],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("ignores any client-sent totals and computes them server-side", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.post("/api/bills").send(
      billPayload({
        subtotalInPaise: 1,
        grandTotalInPaise: 1,
        taxAmountInPaise: 999999,
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.subtotalInPaise).toBe(52000);
    expect(res.body.grandTotalInPaise).toBe(52000);
    expect(res.body.taxAmountInPaise).toBe(0);
  });
});

describe("POST /api/bills — medicine catalog integration", () => {
  async function createCatalogMedicine(adminAgent: request.Agent, overrides: Record<string, unknown> = {}) {
    const res = await adminAgent.post("/api/medicines").send({
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
    });
    return res.body;
  }

  it("creates a bill referencing a catalog medicine, snapshotting its current price", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const medicine = await createCatalogMedicine(adminAgent);

    const res = await adminAgent.post("/api/bills").send(
      billPayload({
        items: [
          {
            medicineId: medicine._id,
            medicineName: "ignored",
            unitType: "syrup",
            quantity: 2,
            unitPriceInPaise: 1,
          },
        ],
      }),
    );

    expect(res.status).toBe(201);
    const item = res.body.items[0];
    expect(item.medicineName).toBe("Dolo 500");
    expect(item.unitType).toBe("tablet");
    expect(item.unitPriceInPaise).toBe(300);
    expect(item.lineTotalInPaise).toBe(600);
  });

  it("rejects a bill referencing a nonexistent medicineId", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.post("/api/bills").send(
      billPayload({
        items: [
          { medicineId: "64b000000000000000000000", medicineName: "X", unitType: "tablet", quantity: 1, unitPriceInPaise: 100 },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a bill referencing an inactive medicine", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const medicine = await createCatalogMedicine(adminAgent);
    await adminAgent.patch(`/api/medicines/${medicine._id}/status`).send({ status: "INACTIVE" });

    const res = await adminAgent.post("/api/bills").send(
      billPayload({
        items: [
          { medicineId: medicine._id, medicineName: "Dolo 500", unitType: "tablet", quantity: 1, unitPriceInPaise: 300 },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/bills/preview", () => {
  function previewPayload(overrides: Record<string, unknown> = {}) {
    return {
      items: [{ medicineName: "Paracetamol", unitType: "tablet", quantity: 10, unitPriceInPaise: 200 }],
      consultationFeeInPaise: 50000,
      ...overrides,
    };
  }

  it("rejects unauthenticated access", async () => {
    const app = createApp();
    const res = await request(app).post("/api/bills/preview").send(previewPayload());
    expect(res.status).toBe(401);
  });

  it("allows an admin", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.post("/api/bills/preview").send(previewPayload());
    expect(res.status).toBe(200);
    expect(res.body.subtotalInPaise).toBe(52000);
    expect(res.body.grandTotalInPaise).toBe(52000);
  });

  it("allows a receptionist", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const receptionistAgent = await createReceptionistAgent(app, adminAgent);
    const res = await receptionistAgent.post("/api/bills/preview").send(previewPayload());
    expect(res.status).toBe(200);
    expect(res.body.grandTotalInPaise).toBe(52000);
  });

  it("computes totals server-side and ignores any client-sent totals", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.post("/api/bills/preview").send(
      previewPayload({
        subtotalInPaise: 1,
        grandTotalInPaise: 1,
        taxAmountInPaise: 999999,
        roundingAdjustmentInPaise: -999999,
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body.subtotalInPaise).toBe(52000);
    expect(res.body.grandTotalInPaise).toBe(52000);
    expect(res.body.taxAmountInPaise).toBe(0);
    expect(res.body.roundingAdjustmentInPaise).toBe(0);
  });

  it("reflects the active tax configuration", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent.patch("/api/admin/settings").send({ taxEnabled: true, taxRateBasisPoints: 500 });

    const res = await adminAgent.post("/api/bills/preview").send(previewPayload());
    expect(res.body.taxEnabled).toBe(true);
    expect(res.body.taxAmountInPaise).toBe(2600);
    expect(res.body.grandTotalInPaise).toBe(54600);
  });

  it("creates no Bill, Patient, or Payment records", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent.post("/api/bills/preview").send(previewPayload());
    await adminAgent.post("/api/bills/preview").send(previewPayload({ patientPhone: "ignored-field" }));

    expect(await BillModel.countDocuments()).toBe(0);
    expect(await PatientModel.countDocuments()).toBe(0);
    expect(await PaymentModel.countDocuments()).toBe(0);
  });

  it("rejects invalid items the same way bill creation does", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.post("/api/bills/preview").send(previewPayload({ items: [] }));
    expect(res.status).toBe(400);
  });

  it("does not require patientName or patientPhone", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.post("/api/bills/preview").send({
      items: [{ medicineName: "Paracetamol", unitType: "tablet", quantity: 10, unitPriceInPaise: 200 }],
      consultationFeeInPaise: 50000,
    });
    expect(res.status).toBe(200);
  });
});

describe("Duplicate-bill warn-then-confirm flow", () => {
  it("warns on the second identical submission and requires explicit confirmation", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent.post("/api/bills").send(billPayload());

    const warnRes = await adminAgent.post("/api/bills").send(billPayload());
    expect(warnRes.status).toBe(409);
    expect(warnRes.body.warning).toBe("possible_duplicate");

    const confirmRes = await adminAgent
      .post("/api/bills")
      .send(billPayload({ confirmDuplicate: true }));
    expect(confirmRes.status).toBe(201);
  });
});

describe("PATCH /api/bills/:id — edit before payment", () => {
  it("allows editing while UNPAID", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent.post("/api/bills").send(billPayload());

    const editRes = await adminAgent
      .patch(`/api/bills/${createRes.body._id}`)
      .send(billPayload({ consultationFeeInPaise: 60000 }));
    expect(editRes.status).toBe(200);
    expect(editRes.body.subtotalInPaise).toBe(62000);
  });

  it("rejects editing after a payment has been recorded", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent.post("/api/bills").send(billPayload());
    await adminAgent
      .post(`/api/bills/${createRes.body._id}/payments`)
      .send({ method: "UPI", amountInPaise: 10000 });

    const editRes = await adminAgent.patch(`/api/bills/${createRes.body._id}`).send(billPayload());
    expect(editRes.status).toBe(409);
  });
});

describe("POST /api/bills/:id/payments", () => {
  it("records a CASH payment and derives change server-side", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent.post("/api/bills").send(billPayload()); // due 52000

    const res = await adminAgent
      .post(`/api/bills/${createRes.body._id}/payments`)
      .send({ method: "CASH", tenderedAmountInPaise: 60000 });
    expect(res.status).toBe(201);
    expect(res.body.payment.amountInPaise).toBe(52000);
    expect(res.body.payment.changeAmountInPaise).toBe(8000);
    expect(res.body.bill.status).toBe("PAID");
    expect(res.body.dueAmountInPaise).toBe(0);
  });

  it("rejects a UPI payment that would overpay", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent.post("/api/bills").send(billPayload()); // due 52000

    const res = await adminAgent
      .post(`/api/bills/${createRes.body._id}/payments`)
      .send({ method: "UPI", amountInPaise: 60000 });
    expect(res.status).toBe(409);
  });

  it("rejects an invalid method", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent.post("/api/bills").send(billPayload());

    const res = await adminAgent
      .post(`/api/bills/${createRes.body._id}/payments`)
      .send({ method: "CHEQUE", amountInPaise: 1000 });
    expect(res.status).toBe(400);
  });

  it("rejects a payment with a method the Admin has disabled in clinic settings", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent.patch("/api/admin/clinic-settings").send({ payments: { upiEnabled: false } });
    const createRes = await adminAgent.post("/api/bills").send(billPayload());

    const res = await adminAgent
      .post(`/api/bills/${createRes.body._id}/payments`)
      .send({ method: "UPI", amountInPaise: 52000 });
    expect(res.status).toBe(400);
  });

  it("rejects a partial payment when the Admin has disabled partial payments", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent
      .patch("/api/admin/clinic-settings")
      .send({ billing: { allowPartialPayments: false } });
    const createRes = await adminAgent.post("/api/bills").send(billPayload()); // due 52000

    const res = await adminAgent
      .post(`/api/bills/${createRes.body._id}/payments`)
      .send({ method: "CASH", tenderedAmountInPaise: 20000 });
    expect(res.status).toBe(409);
  });

  it("still allows a receptionist to record a payment with a method the Admin left enabled", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent.patch("/api/admin/clinic-settings").send({ payments: { upiEnabled: false } });
    const receptionistAgent = await createReceptionistAgent(app, adminAgent);
    const createRes = await adminAgent.post("/api/bills").send(billPayload());

    const res = await receptionistAgent
      .post(`/api/bills/${createRes.body._id}/payments`)
      .send({ method: "CASH", tenderedAmountInPaise: 52000 });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/bills and /api/bills/:id", () => {
  it("lists and retrieves bill detail with payment history", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent.post("/api/bills").send(billPayload());
    await adminAgent
      .post(`/api/bills/${createRes.body._id}/payments`)
      .send({ method: "UPI", amountInPaise: 20000 });

    const listRes = await adminAgent.get("/api/bills");
    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBe(1);
    // Server-computed from the real payment record (52000 grand total - 20000
    // paid), not something the client could have supplied.
    expect(listRes.body.bills[0].dueAmountInPaise).toBe(32000);

    const detailRes = await adminAgent.get(`/api/bills/${createRes.body._id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.bill._id).toBe(createRes.body._id);
    expect(detailRes.body.payments).toHaveLength(1);
  });

  it("returns 404 for a nonexistent bill", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.get("/api/bills/64b000000000000000000000");
    expect(res.status).toBe(404);
  });

  it("rejects a malformed date filter", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.get("/api/bills").query({ date: "15-08-2026" });
    expect(res.status).toBe(400);
  });

  it("rejects a non-numeric limit instead of passing NaN through to the query", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.get("/api/bills").query({ limit: "abc" });
    expect(res.status).toBe(400);
  });

  it("rejects a non-numeric skip instead of passing NaN through to the query", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.get("/api/bills").query({ skip: "xyz" });
    expect(res.status).toBe(400);
  });

  it("rejects a negative limit", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.get("/api/bills").query({ limit: "-5" });
    expect(res.status).toBe(400);
  });

  it("rejects a repeated limit query param (parsed as an array, not a number)", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.get("/api/bills?limit=1&limit=2");
    expect(res.status).toBe(400);
  });

  it("still accepts a well-formed limit/skip", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent.post("/api/bills").send(billPayload());
    const res = await adminAgent.get("/api/bills").query({ limit: "10", skip: "0" });
    expect(res.status).toBe(200);
  });
});

describe("Billing audit events", () => {
  it("records bill_generated, bill_edited, payment_recorded, and bill_cancelled", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);

    const createRes = await adminAgent.post("/api/bills").send(billPayload());
    const billId = createRes.body._id;

    await adminAgent
      .patch(`/api/bills/${billId}`)
      .send(billPayload({ consultationFeeInPaise: 60000 }));

    await adminAgent
      .post(`/api/bills/${billId}/payments`)
      .send({ method: "CASH", tenderedAmountInPaise: 30000 });

    // Cancellation isn't valid post-payment, so verify it on a second, untouched bill.
    const secondBillRes = await adminAgent
      .post("/api/bills")
      .send(billPayload({ patientPhone: "9222222222" }));
    await adminAgent.patch(`/api/bills/${secondBillRes.body._id}/cancel`);

    const eventTypes = (await AuditLogModel.find({}).lean()).map((event) => event.eventType);
    expect(eventTypes).toContain("bill_generated");
    expect(eventTypes).toContain("bill_edited");
    expect(eventTypes).toContain("payment_recorded");
    expect(eventTypes).toContain("bill_cancelled");
  });

  it("records duplicate_bill_warning when a duplicate is detected", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);

    await adminAgent.post("/api/bills").send(billPayload());
    await adminAgent.post("/api/bills").send(billPayload()); // trips the warning, not created

    const events = await AuditLogModel.find({ eventType: "duplicate_bill_warning" }).lean();
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ confirmed: false });
  });
});
