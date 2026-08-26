import type { Express } from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { resetSessionTimeoutCacheForTests } from "../services/clinicSettingsService.js";
import { clearTestDb, connectTestDb, disconnectTestDb } from "../test/testDb.js";

beforeAll(async () => {
  await connectTestDb();
}, 60000);

beforeEach(() => {
  resetSessionTimeoutCacheForTests();
});

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

// express-session serializes its cookie with an absolute `Expires=` date
// (computed from `maxAge` at response time), not a `Max-Age=` attribute — so
// the remaining lifetime has to be derived from that date instead.
function remainingSecondsFromSetCookie(setCookieHeader: string[] | undefined): number | undefined {
  const cookie = setCookieHeader?.find((entry) => entry.startsWith("clinic.sid="));
  const match = cookie ? /Expires=([^;]+)/i.exec(cookie) : null;
  if (!match) return undefined;
  return Math.round((new Date(match[1]!).getTime() - Date.now()) / 1000);
}

describe("session timeout — actually affects the session cookie", () => {
  it("defaults to the documented 720-minute (12h) timeout", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/signup").send({ username: "doctor", password: "password123" });

    const remainingSeconds = remainingSecondsFromSetCookie(res.headers["set-cookie"] as unknown as string[]);
    expect(remainingSeconds).toBeDefined();
    expect(remainingSeconds).toBeGreaterThan(720 * 60 - 10);
    expect(remainingSeconds).toBeLessThanOrEqual(720 * 60 + 2);
  });

  it("reflects a shortened timeout on the next request after an Admin saves it", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);

    await adminAgent.patch("/api/admin/clinic-settings").send({ security: { sessionTimeoutMinutes: 30 } });

    const res = await adminAgent.get("/api/auth/me");
    const remainingSeconds = remainingSecondsFromSetCookie(res.headers["set-cookie"] as unknown as string[]);
    expect(remainingSeconds).toBeDefined();
    expect(remainingSeconds).toBeGreaterThan(30 * 60 - 10);
    expect(remainingSeconds).toBeLessThanOrEqual(30 * 60 + 2);
  });

  it("reflects a lengthened timeout on the next request after an Admin saves it", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);

    await adminAgent
      .patch("/api/admin/clinic-settings")
      .send({ security: { sessionTimeoutMinutes: 1440 } });

    const res = await adminAgent.get("/api/auth/me");
    const remainingSeconds = remainingSecondsFromSetCookie(res.headers["set-cookie"] as unknown as string[]);
    expect(remainingSeconds).toBeDefined();
    expect(remainingSeconds).toBeGreaterThan(1440 * 60 - 10);
    expect(remainingSeconds).toBeLessThanOrEqual(1440 * 60 + 2);
  });

  it("does not affect an unrelated in-flight request made before the setting changed (no forced logout)", async () => {
    const app = createApp();
    const adminAgent = await signUpAdmin(app);

    // A session established under the old timeout stays valid — the new
    // timeout applies going forward, it doesn't retroactively invalidate.
    await adminAgent.patch("/api/admin/clinic-settings").send({ security: { sessionTimeoutMinutes: 20 } });
    const stillAuthed = await adminAgent.get("/api/auth/me");
    expect(stillAuthed.status).toBe(200);
  });
});
