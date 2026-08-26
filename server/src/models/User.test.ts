import { describe, expect, it } from "vitest";
import { UserModel } from "./User.js";

describe("User model", () => {
  it("passes validation for a valid admin", () => {
    const user = new UserModel({
      role: "admin",
      username: "doctor",
      passwordHash: "hashed",
    });
    expect(user.validateSync()).toBeUndefined();
  });

  it("requires staffId for a receptionist", () => {
    const user = new UserModel({
      role: "receptionist",
      username: "reception1",
      passwordHash: "hashed",
    });
    const error = user.validateSync();
    expect(error?.errors.staffId).toBeDefined();
  });

  it("does not require staffId for an admin", () => {
    const user = new UserModel({
      role: "admin",
      username: "doctor2",
      passwordHash: "hashed",
    });
    expect(user.validateSync()).toBeUndefined();
  });

  it("rejects an invalid role", () => {
    const user = new UserModel({
      role: "superadmin",
      username: "x",
      passwordHash: "hashed",
    });
    const error = user.validateSync();
    expect(error?.errors.role).toBeDefined();
  });

  it("normalizes an explicit null staffId to undefined (avoids sparse-index null collisions)", () => {
    const user = new UserModel({
      role: "admin",
      username: "doctor3",
      passwordHash: "hashed",
      staffId: null,
    });
    expect(user.staffId).toBeUndefined();
  });

  it("lowercases the username", () => {
    const user = new UserModel({
      role: "admin",
      username: "Doctor",
      passwordHash: "hashed",
    });
    expect(user.username).toBe("doctor");
  });
});
