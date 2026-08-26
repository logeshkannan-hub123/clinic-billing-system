import type { Express } from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { AuditLogModel } from "../models/AuditLog.js";
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

async function createReceptionistAgent(app: Express, adminAgent: ReturnType<typeof request.agent>) {
  await adminAgent
    .post("/api/admin/receptionists")
    .send({ staffId: "S001", username: "reception1", password: "password123" });
  const receptionistAgent = request.agent(app);
  await receptionistAgent
    .post("/api/auth/login")
    .send({ username: "reception1", password: "password123" });
  return receptionistAgent;
}

describe("Admin clinic-settings authorization", () => {
  it("rejects unauthenticated access to GET", async () => {
    const app = createApp();
    expect((await request(app).get("/api/admin/clinic-settings")).status).toBe(401);
  });

  it("rejects unauthenticated access to PATCH", async () => {
    const app = createApp();
    expect(
      (await request(app).patch("/api/admin/clinic-settings").send({ clinic: { name: "X" } })).status,
    ).toBe(401);
  });

  it("rejects a receptionist on GET", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const receptionistAgent = await createReceptionistAgent(app, adminAgent);
    expect((await receptionistAgent.get("/api/admin/clinic-settings")).status).toBe(403);
  });

  it("rejects a receptionist on PATCH", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const receptionistAgent = await createReceptionistAgent(app, adminAgent);
    expect(
      (await receptionistAgent.patch("/api/admin/clinic-settings").send({ clinic: { name: "X" } }))
        .status,
    ).toBe(403);
  });
});

describe("GET /api/admin/clinic-settings", () => {
  it("returns documented defaults when never configured", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.get("/api/admin/clinic-settings");
    expect(res.status).toBe(200);
    expect(res.body.clinic.name).toBe("VMF HEALTH CARE");
    expect(res.body.billing.invoicePrefix).toBe("INV");
    expect(res.body.payments).toEqual({ cashEnabled: true, upiEnabled: true });
    expect(res.body.security.sessionTimeoutMinutes).toBe(720);
  });
});

describe("PATCH /api/admin/clinic-settings", () => {
  it("partially updates one section without touching others, and records an audit event", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);

    const res = await adminAgent
      .patch("/api/admin/clinic-settings")
      .send({ clinic: { name: "VMF Downtown", doctorName: "Dr. Iyer" } });
    expect(res.status).toBe(200);
    expect(res.body.clinic.name).toBe("VMF Downtown");
    expect(res.body.clinic.doctorName).toBe("Dr. Iyer");
    expect(res.body.billing.invoicePrefix).toBe("INV");

    const events = await AuditLogModel.find({ eventType: "admin_settings_updated" }).lean();
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ sections: ["clinic"] });
  });

  it("preserves settings across reload (persistence)", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent
      .patch("/api/admin/clinic-settings")
      .send({ billing: { invoicePrefix: "CLN" } });

    const res = await adminAgent.get("/api/admin/clinic-settings");
    expect(res.body.billing.invoicePrefix).toBe("CLN");
  });

  it("leaves the existing tax settings completely unaffected", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent.patch("/api/admin/settings").send({ taxEnabled: true, taxRateBasisPoints: 500 });

    await adminAgent.patch("/api/admin/clinic-settings").send({ clinic: { name: "New Name" } });

    const taxRes = await adminAgent.get("/api/admin/settings");
    expect(taxRes.body).toEqual({ taxEnabled: true, taxRateBasisPoints: 500 });
  });

  it("ignores unknown top-level and nested fields rather than rejecting the request", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);

    const res = await adminAgent.patch("/api/admin/clinic-settings").send({
      clinic: { name: "Valid Name", notARealField: "ignored" },
      notARealSection: { anything: true },
    });

    expect(res.status).toBe(200);
    expect(res.body.clinic.name).toBe("Valid Name");
    expect(res.body.notARealSection).toBeUndefined();
  });

  it.each([
    ["invalid invoicePrefix", { billing: { invoicePrefix: "inv-01" } }],
    ["negative defaultConsultationFeeInPaise", { billing: { defaultConsultationFeeInPaise: -1 } }],
    ["non-boolean allowPartialPayments", { billing: { allowPartialPayments: "yes" } }],
    ["invalid paperSize", { receipt: { paperSize: "LETTER" } }],
    ["footerText too long", { receipt: { footerText: "x".repeat(301) } }],
    ["invalid logoUrl scheme", { clinic: { logoUrl: "javascript:alert(1)" } }],
    ["invalid website", { clinic: { website: "not a url" } }],
    ["invalid email", { clinic: { email: "not-an-email" } }],
    ["sessionTimeoutMinutes too low", { security: { sessionTimeoutMinutes: 5 } }],
    ["sessionTimeoutMinutes too high", { security: { sessionTimeoutMinutes: 5000 } }],
    ["non-integer sessionTimeoutMinutes", { security: { sessionTimeoutMinutes: 30.5 } }],
    ["invalid dateFormat", { regional: { dateFormat: "YYYY/DD/MM" } }],
    ["invalid timeFormat", { regional: { timeFormat: "25h" } }],
    ["currencySymbol too long", { regional: { currencySymbol: "TOOLONG" } }],
  ])("rejects %s with 400", async (_label, body) => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.patch("/api/admin/clinic-settings").send(body);
    expect(res.status).toBe(400);
  });

  it("rejects disabling both payment methods at once", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent
      .patch("/api/admin/clinic-settings")
      .send({ payments: { cashEnabled: false, upiEnabled: false } });
    expect(res.status).toBe(400);
  });

  it("accepts disabling one payment method while the other remains enabled", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent
      .patch("/api/admin/clinic-settings")
      .send({ payments: { cashEnabled: false } });
    expect(res.status).toBe(200);
    expect(res.body.payments).toEqual({ cashEnabled: false, upiEnabled: true });
  });

  it("accepts a valid http(s) logoUrl and clears it back to null with an empty string", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);

    const setRes = await adminAgent
      .patch("/api/admin/clinic-settings")
      .send({ clinic: { logoUrl: "https://example.com/logo.png" } });
    expect(setRes.status).toBe(200);
    expect(setRes.body.clinic.logoUrl).toBe("https://example.com/logo.png");

    const clearRes = await adminAgent.patch("/api/admin/clinic-settings").send({ clinic: { logoUrl: "" } });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.clinic.logoUrl).toBeNull();
  });
});
