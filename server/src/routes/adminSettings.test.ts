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

describe("Admin settings authorization", () => {
  it("rejects unauthenticated access", async () => {
    const app = createApp();
    expect((await request(app).get("/api/admin/settings")).status).toBe(401);
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

    expect((await receptionistAgent.get("/api/admin/settings")).status).toBe(403);
  });
});

describe("GET/PATCH /api/admin/settings", () => {
  it("defaults to tax disabled", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.get("/api/admin/settings");
    expect(res.body).toEqual({ taxEnabled: false, taxRateBasisPoints: null });
  });

  it("enables tax with a rate and records an audit event", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);

    const res = await adminAgent
      .patch("/api/admin/settings")
      .send({ taxEnabled: true, taxRateBasisPoints: 500 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ taxEnabled: true, taxRateBasisPoints: 500 });

    const events = await AuditLogModel.find({ eventType: "tax_settings_updated" }).lean();
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ taxEnabled: true, taxRateBasisPoints: 500 });
  });

  it("rejects enabling tax without a rate", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.patch("/api/admin/settings").send({ taxEnabled: true });
    expect(res.status).toBe(400);
  });

  it("rejects a rate above 10000 basis points", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent
      .patch("/api/admin/settings")
      .send({ taxEnabled: true, taxRateBasisPoints: 20000 });
    expect(res.status).toBe(400);
  });
});
