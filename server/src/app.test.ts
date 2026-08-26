import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const app = createApp();
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("sends baseline security headers on every response", async () => {
    const app = createApp();
    const response = await request(app).get("/api/health");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    // HSTS is gated to production (see securityHeaders.ts) — this test runs
    // with NODE_ENV=test, so it must be absent here, matching the cookie's
    // own `secure` flag being similarly gated.
    expect(response.headers["strict-transport-security"]).toBeUndefined();
  });
});
