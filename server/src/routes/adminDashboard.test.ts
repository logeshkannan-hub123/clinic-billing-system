import type { Express } from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { clearTestDb, connectTestDb, disconnectTestDb } from "../test/testDb.js";
import { getKolkataTodayIso } from "../utils/timezone.js";

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

function billPayload(overrides: Record<string, unknown> = {}) {
  return {
    patientName: "Asha Rao",
    patientPhone: "9876543210",
    items: [{ medicineName: "Paracetamol", unitType: "tablet", quantity: 10, unitPriceInPaise: 200 }],
    consultationFeeInPaise: 50000,
    ...overrides,
  };
}

describe("GET /api/admin/dashboard — authorization", () => {
  it("rejects unauthenticated access", async () => {
    const app = createApp();
    const res = await request(app).get("/api/admin/dashboard");
    expect(res.status).toBe(401);
  });

  it("rejects a receptionist", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent
      .post("/api/admin/receptionists")
      .send({ staffId: "S001", username: "reception1", password: "password123" });

    const receptionistAgent = request.agent(app);
    await receptionistAgent
      .post("/api/auth/login")
      .send({ username: "reception1", password: "password123" });

    const res = await receptionistAgent.get("/api/admin/dashboard");
    expect(res.status).toBe(403);
  });

  it("allows the admin", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.get("/api/admin/dashboard");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/dashboard — behavior", () => {
  it("defaults to today in Kolkata and reflects a bill created just now", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent.post("/api/bills").send(billPayload());

    const res = await adminAgent.get("/api/admin/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(getKolkataTodayIso());
    expect(res.body.generatedCount).toBe(1);
    expect(res.body.pendingCount).toBe(1);
  });

  it("accepts an explicit historical date with no data", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.get("/api/admin/dashboard").query({ date: "2020-01-01" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      date: "2020-01-01",
      revenueInPaise: 0,
      generatedCount: 0,
      paidCount: 0,
      pendingCount: 0,
      partiallyPaidCount: 0,
      cancelledCount: 0,
    });
  });

  it("reflects revenue and status after a payment", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent.post("/api/bills").send(billPayload());
    await adminAgent
      .post(`/api/bills/${createRes.body._id}/payments`)
      .send({ method: "UPI", amountInPaise: 52000 });

    const res = await adminAgent.get("/api/admin/dashboard");
    expect(res.body.revenueInPaise).toBe(52000);
    expect(res.body.paidCount).toBe(1);
    expect(res.body.pendingCount).toBe(0);
  });

  it("rejects a malformed date", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.get("/api/admin/dashboard").query({ date: "16-08-2026" });
    expect(res.status).toBe(400);
  });
});

describe("Existing GET /api/bills search remains functional alongside the new indexes", () => {
  it("still filters by status, date, and phone/name search", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent.post("/api/bills").send(billPayload());
    await adminAgent
      .post("/api/bills")
      .send(billPayload({ patientName: "Kiran Mehta", patientPhone: "9111111111" }));

    const byStatus = await adminAgent.get("/api/bills").query({ status: "UNPAID" });
    expect(byStatus.status).toBe(200);
    expect(byStatus.body.total).toBe(2);

    const byDate = await adminAgent.get("/api/bills").query({ date: getKolkataTodayIso() });
    expect(byDate.status).toBe(200);
    expect(byDate.body.total).toBe(2);

    const bySearch = await adminAgent.get("/api/bills").query({ search: "kiran" });
    expect(bySearch.status).toBe(200);
    expect(bySearch.body.total).toBe(1);

    // Receptionist can still reach the same endpoint (unchanged permissions).
    await adminAgent
      .post("/api/admin/receptionists")
      .send({ staffId: "S001", username: "reception1", password: "password123" });
    const receptionistAgent = request.agent(app);
    await receptionistAgent
      .post("/api/auth/login")
      .send({ username: "reception1", password: "password123" });
    const receptionistList = await receptionistAgent.get("/api/bills");
    expect(receptionistList.status).toBe(200);
  });
});
