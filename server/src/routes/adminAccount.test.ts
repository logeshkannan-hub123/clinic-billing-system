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

async function signUpAdmin(app: Express, password = "password123") {
  const agent = request.agent(app);
  await agent.post("/api/auth/signup").send({ username: "doctor", password });
  return agent;
}

describe("DELETE /api/admin/account", () => {
  it("rejects unauthenticated access", async () => {
    const app = createApp();
    const res = await request(app).delete("/api/admin/account").send({ password: "password123" });
    expect(res.status).toBe(401);
  });

  it("rejects a receptionist (non-admin) caller", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent
      .post("/api/admin/receptionists")
      .send({ staffId: "S001", username: "reception1", password: "password123" });

    const receptionistAgent = request.agent(app);
    await receptionistAgent
      .post("/api/auth/login")
      .send({ username: "reception1", password: "password123" });

    const res = await receptionistAgent.delete("/api/admin/account").send({ password: "password123" });
    expect(res.status).toBe(403);
  });

  it("requires a password in the request body", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.delete("/api/admin/account").send({});
    expect(res.status).toBe(400);
  });

  it("rejects an incorrect password and leaves the account intact", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app, "password123");
    const res = await adminAgent.delete("/api/admin/account").send({ password: "wrongpassword" });
    expect(res.status).toBe(401);

    const meRes = await adminAgent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
  });

  it("deletes the account with the correct password, ends the session, and the account can no longer log in", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app, "password123");

    const deleteRes = await adminAgent.delete("/api/admin/account").send({ password: "password123" });
    expect(deleteRes.status).toBe(204);

    const meRes = await adminAgent.get("/api/auth/me");
    expect(meRes.status).toBe(401);

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "doctor", password: "password123" });
    expect(loginRes.status).toBe(401);

    const statusRes = await request(app).get("/api/auth/setup-status");
    expect(statusRes.body).toEqual({ adminExists: false });
  });

  it("allows signing up a new admin after the previous one deletes their account", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app, "password123");
    await adminAgent.delete("/api/admin/account").send({ password: "password123" });

    const signupRes = await request(app)
      .post("/api/auth/signup")
      .send({ username: "newdoctor", password: "password456" });
    expect(signupRes.status).toBe(201);
  });

  it(
    "rate-limits repeated password-verification attempts",
    async () => {
      const app = createApp();
      const adminAgent = await signUpAdmin(app, "password123");

      for (let attempt = 0; attempt < 10; attempt += 1) {
        const res = await adminAgent.delete("/api/admin/account").send({ password: "wrongpassword" });
        expect(res.status).toBe(401);
      }

      // The 11th attempt within the window is throttled rather than allowed
      // to keep guessing — same protection PATCH /api/auth/password already
      // has, applied here since this endpoint verifies a password too.
      const throttledRes = await adminAgent.delete("/api/admin/account").send({ password: "wrongpassword" });
      expect(throttledRes.status).toBe(429);
    },
    20000,
  );

  it("records an account_deleted audit event", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app, "password123");
    await adminAgent.delete("/api/admin/account").send({ password: "password123" });

    const events = await AuditLogModel.find({ eventType: "account_deleted" }).lean();
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ username: "doctor", role: "admin", selfDelete: true });
  });
});
