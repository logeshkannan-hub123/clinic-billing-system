import type { Express } from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
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

describe("GET /api/settings/display", () => {
  it("rejects unauthenticated access", async () => {
    const app = createApp();
    expect((await request(app).get("/api/settings/display")).status).toBe(401);
  });

  it("is readable by an Admin", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.get("/api/settings/display");
    expect(res.status).toBe(200);
    expect(res.body.clinic.name).toBe("VMF HEALTH CARE");
  });

  it("is readable by a Receptionist", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent
      .post("/api/admin/receptionists")
      .send({ staffId: "S001", username: "reception1", password: "password123" });
    const receptionistAgent = request.agent(app);
    await receptionistAgent
      .post("/api/auth/login")
      .send({ username: "reception1", password: "password123" });

    const res = await receptionistAgent.get("/api/settings/display");
    expect(res.status).toBe(200);
    expect(res.body.clinic.name).toBe("VMF HEALTH CARE");
  });

  it("returns only the documented, safe subset — never security or billing internals", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent.patch("/api/admin/clinic-settings").send({
      billing: { invoicePrefix: "SEC", defaultConsultationFeeInPaise: 25000 },
      security: { sessionTimeoutMinutes: 60 },
    });

    const res = await adminAgent.get("/api/settings/display");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ["clinic", "defaultConsultationFeeInPaise", "payments", "receipt"].sort(),
    );
    expect(res.body.defaultConsultationFeeInPaise).toBe(25000);
    expect(res.body.security).toBeUndefined();
    expect(res.body.billing).toBeUndefined();
    expect(res.body.updatedBy).toBeUndefined();
  });

  it("reflects payment-method toggles so the billing UI can hide a disabled method", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent.patch("/api/admin/clinic-settings").send({ payments: { upiEnabled: false } });

    const res = await adminAgent.get("/api/settings/display");
    expect(res.body.payments).toEqual({ cashEnabled: true, upiEnabled: false });
  });
});
