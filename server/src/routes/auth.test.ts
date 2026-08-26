import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { AuditLogModel } from "../models/AuditLog.js";
import { UserModel } from "../models/User.js";
import { clearTestDb, connectTestDb, disconnectTestDb } from "../test/testDb.js";

function getSessionCookie(res: request.Response): string {
  const setCookie = res.headers["set-cookie"];
  const cookies: string[] = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const sessionCookie = cookies.find((cookie) => cookie.startsWith("clinic.sid="));
  if (!sessionCookie) {
    throw new Error("No clinic.sid cookie found in response");
  }
  return sessionCookie.split(";")[0]!;
}

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("GET /api/auth/setup-status", () => {
  it("reports no admin before the first signup", async () => {
    const app = createApp();
    const res = await request(app).get("/api/auth/setup-status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ adminExists: false });
  });

  it("reports an admin exists after signup, without requiring authentication", async () => {
    const app = createApp();
    await request(app).post("/api/auth/signup").send({ username: "doctor", password: "password123" });

    const res = await request(app).get("/api/auth/setup-status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ adminExists: true });
  });
});

describe("POST /api/auth/signup", () => {
  it("creates the first admin and starts a session", async () => {
    const app = createApp();
    const agent = request.agent(app);

    const signupRes = await agent
      .post("/api/auth/signup")
      .send({ username: "doctor", password: "password123" });
    expect(signupRes.status).toBe(201);
    expect(signupRes.body.role).toBe("admin");

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.username).toBe("doctor");
  });

  it("rejects a second signup once an admin exists", async () => {
    const app = createApp();
    await request(app).post("/api/auth/signup").send({ username: "doctor", password: "password123" });

    const secondRes = await request(app)
      .post("/api/auth/signup")
      .send({ username: "doctor2", password: "password456" });
    expect(secondRes.status).toBe(409);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ username: "doctor", password: "short" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials", async () => {
    const app = createApp();
    await request(app).post("/api/auth/signup").send({ username: "doctor", password: "password123" });

    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ username: "doctor", password: "password123" });
    expect(loginRes.status).toBe(200);

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.role).toBe("admin");
  });

  it("returns a generic error for a wrong password", async () => {
    const app = createApp();
    await request(app).post("/api/auth/signup").send({ username: "doctor", password: "password123" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "doctor", password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid username or password");
  });

  it("returns the same generic error for a nonexistent username", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "nobody", password: "password123" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid username or password");
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 without a session", async () => {
    const app = createApp();
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/auth/password", () => {
  it("rejects unauthenticated access", async () => {
    const app = createApp();
    const res = await request(app)
      .patch("/api/auth/password")
      .send({ currentPassword: "password123", newPassword: "newpassword456" });
    expect(res.status).toBe(401);
  });

  it("requires currentPassword and a valid newPassword", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send({ username: "doctor", password: "password123" });

    const missingCurrent = await agent.patch("/api/auth/password").send({ newPassword: "newpassword456" });
    expect(missingCurrent.status).toBe(400);

    const shortNew = await agent
      .patch("/api/auth/password")
      .send({ currentPassword: "password123", newPassword: "short" });
    expect(shortNew.status).toBe(400);
  });

  it("rejects an incorrect current password and leaves the password unchanged", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send({ username: "doctor", password: "password123" });

    const res = await agent
      .patch("/api/auth/password")
      .send({ currentPassword: "wrongpassword", newPassword: "newpassword456" });
    expect(res.status).toBe(401);

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "doctor", password: "password123" });
    expect(loginRes.status).toBe(200);
  });

  it("lets a receptionist change their own password, and the old password stops working", async () => {
    const app = createApp();
    const adminAgent = request.agent(app);
    await adminAgent.post("/api/auth/signup").send({ username: "doctor", password: "password123" });
    await adminAgent
      .post("/api/admin/receptionists")
      .send({ staffId: "S001", username: "reception1", password: "oldpassword" });

    const receptionistAgent = request.agent(app);
    await receptionistAgent.post("/api/auth/login").send({ username: "reception1", password: "oldpassword" });

    const changeRes = await receptionistAgent
      .patch("/api/auth/password")
      .send({ currentPassword: "oldpassword", newPassword: "newpassword456" });
    expect(changeRes.status).toBe(204);

    const oldLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "reception1", password: "oldpassword" });
    expect(oldLoginRes.status).toBe(401);

    const newLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "reception1", password: "newpassword456" });
    expect(newLoginRes.status).toBe(200);
  });

  it("keeps the session that made the change working, but invalidates a separately-held session for the same account", async () => {
    const app = createApp();
    await request(app).post("/api/auth/signup").send({ username: "doctor", password: "password123" });

    // Two independent sessions for the same account — e.g. two browser tabs,
    // or a session an attacker already holds via a stolen cookie.
    const sessionA = request.agent(app);
    await sessionA.post("/api/auth/login").send({ username: "doctor", password: "password123" });
    const sessionB = request.agent(app);
    await sessionB.post("/api/auth/login").send({ username: "doctor", password: "password123" });

    const changeRes = await sessionA
      .patch("/api/auth/password")
      .send({ currentPassword: "password123", newPassword: "newpassword456" });
    expect(changeRes.status).toBe(204);

    // The session that made the change stays logged in.
    expect((await sessionA.get("/api/auth/me")).status).toBe(200);

    // The separately-held session is rejected on its very next request.
    expect((await sessionB.get("/api/auth/me")).status).toBe(401);
  });

  it("records a password_reset audit event marked as self-service, without leaking either password", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send({ username: "doctor", password: "password123" });

    await agent.patch("/api/auth/password").send({ currentPassword: "password123", newPassword: "newpassword456" });

    const events = await AuditLogModel.find({ eventType: "password_reset" }).lean();
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ username: "doctor", selfService: true });

    const serializedPayload = JSON.stringify(events[0]!.payload);
    expect(serializedPayload).not.toContain("password123");
    expect(serializedPayload).not.toContain("newpassword456");
  });
});

describe("requireAuth — accounts predating sessionVersion", () => {
  it("stays authenticated for an account whose stored document has no sessionVersion field at all", async () => {
    const app = createApp();
    await request(app).post("/api/auth/signup").send({ username: "doctor", password: "password123" });

    // Simulates a real account created before sessionVersion existed in the
    // schema — direct $unset, not just leaving it undefined in memory, so
    // the stored document genuinely lacks the field the way a pre-existing
    // production/dev record would.
    await UserModel.collection.updateOne({ username: "doctor" }, { $unset: { sessionVersion: "" } });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({ username: "doctor", password: "password123" });
    expect(loginRes.status).toBe(200);

    // The regression: requireAuth's `.lean()` read doesn't backfill the
    // schema default the way login's hydrated read does, so this must not
    // 401 just because the raw document has no sessionVersion field.
    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.username).toBe("doctor");
  });
});

describe("Session fixation protection", () => {
  it("issues a new session id on login and invalidates whatever session existed before", async () => {
    const app = createApp();
    await request(app).post("/api/auth/signup").send({ username: "doctor", password: "password123" });

    const agent = request.agent(app);
    const firstLoginRes = await agent
      .post("/api/auth/login")
      .send({ username: "doctor", password: "password123" });
    const firstCookie = getSessionCookie(firstLoginRes);

    // Log in again on the same agent, so this request carries the session id
    // from the first login — the realistic case a fixation attack relies on
    // (an already-established session id persisting across an auth event).
    const secondLoginRes = await agent
      .post("/api/auth/login")
      .send({ username: "doctor", password: "password123" });
    const secondCookie = getSessionCookie(secondLoginRes);

    expect(secondCookie).not.toBe(firstCookie);

    // The pre-second-login session id must no longer authenticate anything —
    // proves regenerate() actually invalidated the old session server-side,
    // not just that a second, separate valid session was issued alongside it.
    const staleRes = await request(app).get("/api/auth/me").set("Cookie", firstCookie);
    expect(staleRes.status).toBe(401);

    // The new session id still works.
    const freshRes = await agent.get("/api/auth/me");
    expect(freshRes.status).toBe(200);
  });
});

describe("POST /api/auth/logout", () => {
  it("ends the session so a subsequent /me is unauthenticated", async () => {
    const app = createApp();
    await request(app).post("/api/auth/signup").send({ username: "doctor", password: "password123" });

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: "doctor", password: "password123" });
    expect((await agent.get("/api/auth/me")).status).toBe(200);

    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(204);

    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });
});
