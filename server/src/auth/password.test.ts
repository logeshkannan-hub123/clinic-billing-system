import { describe, expect, it } from "vitest";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, isValidPassword } from "./password.js";

describe("isValidPassword", () => {
  it("accepts a password within the min/max bounds", () => {
    expect(isValidPassword("a".repeat(MIN_PASSWORD_LENGTH))).toBe(true);
    expect(isValidPassword("a".repeat(MAX_PASSWORD_LENGTH))).toBe(true);
  });

  it("rejects a password shorter than the minimum", () => {
    expect(isValidPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toBe(false);
  });

  it("rejects a password longer than the maximum, so bcrypt's 72-byte truncation can never make two different passwords interchangeable", () => {
    expect(isValidPassword("a".repeat(MAX_PASSWORD_LENGTH + 1))).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidPassword(12345678)).toBe(false);
    expect(isValidPassword(undefined)).toBe(false);
  });
});
