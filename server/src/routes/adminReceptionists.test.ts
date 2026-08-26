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

describe("Admin receptionist management", () => {
  it("rejects unauthenticated access", async () => {
    const app = createApp();
    const res = await request(app).get("/api/admin/receptionists");
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

    const res = await receptionistAgent.get("/api/admin/receptionists");
    expect(res.status).toBe(403);
  });

  it("lets the admin create, list, and deactivate a receptionist", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);

    const createRes = await adminAgent
      .post("/api/admin/receptionists")
      .send({ staffId: "S001", username: "reception1", password: "password123" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.isActive).toBe(true);

    const listRes = await adminAgent.get("/api/admin/receptionists");
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].staffId).toBe("S001");

    const deactivateRes = await adminAgent
      .patch(`/api/admin/receptionists/${createRes.body.id}`)
      .send({ isActive: false });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.isActive).toBe(false);

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "reception1", password: "password123" });
    expect(loginRes.status).toBe(401);
  });

  it("rejects a duplicate staffId", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    await adminAgent
      .post("/api/admin/receptionists")
      .send({ staffId: "S001", username: "reception1", password: "password123" });

    const res = await adminAgent
      .post("/api/admin/receptionists")
      .send({ staffId: "S001", username: "reception2", password: "password123" });
    expect(res.status).toBe(409);
  });

  it("lets the admin reset a receptionist's password", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent
      .post("/api/admin/receptionists")
      .send({ staffId: "S001", username: "reception1", password: "oldpassword" });

    const resetRes = await adminAgent
      .patch(`/api/admin/receptionists/${createRes.body.id}/password`)
      .send({ password: "newpassword" });
    expect(resetRes.status).toBe(204);

    const oldLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "reception1", password: "oldpassword" });
    expect(oldLoginRes.status).toBe(401);

    const newLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "reception1", password: "newpassword" });
    expect(newLoginRes.status).toBe(200);
  });

  it("invalidates the receptionist's already-open session on password reset", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent
      .post("/api/admin/receptionists")
      .send({ staffId: "S001", username: "reception1", password: "oldpassword" });

    const receptionistAgent = request.agent(app);
    await receptionistAgent.post("/api/auth/login").send({ username: "reception1", password: "oldpassword" });
    expect((await receptionistAgent.get("/api/auth/me")).status).toBe(200);

    const resetRes = await adminAgent
      .patch(`/api/admin/receptionists/${createRes.body.id}/password`)
      .send({ password: "newpassword" });
    expect(resetRes.status).toBe(204);

    // The receptionist's session — open before the reset — is rejected on
    // its very next request, exactly as if it were an attacker's stolen
    // cookie the admin reset the password specifically to shut out.
    expect((await receptionistAgent.get("/api/auth/me")).status).toBe(401);

    const newLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "reception1", password: "newpassword" });
    expect(newLoginRes.status).toBe(200);
  });

  it("records a password_reset audit event without leaking the password", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent
      .post("/api/admin/receptionists")
      .send({ staffId: "S001", username: "reception1", password: "oldpassword" });

    await adminAgent
      .patch(`/api/admin/receptionists/${createRes.body.id}/password`)
      .send({ password: "newpassword" });

    const events = await AuditLogModel.find({ eventType: "password_reset" }).lean();
    expect(events).toHaveLength(1);

    const event = events[0]!;
    expect(event.payload).toMatchObject({
      targetUserId: expect.anything(),
      username: "reception1",
      staffId: "S001",
    });
    expect(event.actorUserId).toBeTruthy();

    // Belt-and-suspenders: the stored payload must not contain either
    // password value, or any key/value resembling a password/hash field.
    const serializedPayload = JSON.stringify(event.payload);
    expect(serializedPayload).not.toContain("oldpassword");
    expect(serializedPayload).not.toContain("newpassword");
    expect(serializedPayload.toLowerCase()).not.toContain("password");
  });

  it("returns 404 for a nonexistent receptionist id", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent
      .patch("/api/admin/receptionists/64b000000000000000000000")
      .send({ isActive: false });
    expect(res.status).toBe(404);
  });

  it("lets the admin delete a receptionist, and the account can no longer log in", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent
      .post("/api/admin/receptionists")
      .send({ staffId: "S001", username: "reception1", password: "password123" });

    const deleteRes = await adminAgent.delete(`/api/admin/receptionists/${createRes.body.id}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await adminAgent.get("/api/admin/receptionists");
    expect(listRes.body).toHaveLength(0);

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "reception1", password: "password123" });
    expect(loginRes.status).toBe(401);
  });

  it("returns 404 when deleting a nonexistent receptionist id", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const res = await adminAgent.delete("/api/admin/receptionists/64b000000000000000000000");
    expect(res.status).toBe(404);
  });

  it("rejects a receptionist (non-admin) caller from deleting an account", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent
      .post("/api/admin/receptionists")
      .send({ staffId: "S001", username: "reception1", password: "password123" });

    const receptionistAgent = request.agent(app);
    await receptionistAgent
      .post("/api/auth/login")
      .send({ username: "reception1", password: "password123" });

    const res = await receptionistAgent.delete(`/api/admin/receptionists/${createRes.body.id}`);
    expect(res.status).toBe(403);
  });

  it("records an account_deleted audit event", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);
    const createRes = await adminAgent
      .post("/api/admin/receptionists")
      .send({ staffId: "S001", username: "reception1", password: "password123" });

    await adminAgent.delete(`/api/admin/receptionists/${createRes.body.id}`);

    const events = await AuditLogModel.find({ eventType: "account_deleted" }).lean();
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({
      targetUserId: expect.anything(),
      username: "reception1",
      staffId: "S001",
    });
    expect(events[0]!.actorUserId).toBeTruthy();
  });
});
