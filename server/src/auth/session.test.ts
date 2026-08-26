import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { regenerateSession } from "./session.js";

function fakeRequest(regenerateImpl: (cb: (error: unknown) => void) => void): Request {
  return {
    session: {
      regenerate: regenerateImpl,
    },
  } as unknown as Request;
}

describe("regenerateSession", () => {
  it("resolves once req.session.regenerate succeeds", async () => {
    let called = false;
    const req = fakeRequest((cb) => {
      called = true;
      cb(null);
    });

    await expect(regenerateSession(req)).resolves.toBeUndefined();
    expect(called).toBe(true);
  });

  it("rejects when req.session.regenerate errors", async () => {
    const req = fakeRequest((cb) => {
      cb(new Error("store unavailable"));
    });

    await expect(regenerateSession(req)).rejects.toThrow("store unavailable");
  });
});
