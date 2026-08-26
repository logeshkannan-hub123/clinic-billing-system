import { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { UserModel } from "../models/User.js";
import { clearTestDb, connectTestDb, disconnectTestDb } from "../test/testDb.js";
import {
  AdminAlreadyExistsError,
  InvalidPasswordError,
  StaffIdTakenError,
  UsernameTakenError,
  adminAccountExists,
  bootstrapAdmin,
  changeOwnPassword,
  createReceptionist,
  deleteAdminAccount,
  deleteReceptionist,
  resetReceptionistPassword,
  setReceptionistActive,
  verifyCredentials,
} from "./userService.js";

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("bootstrapAdmin", () => {
  it("creates the first admin and hashes the password", async () => {
    const admin = await bootstrapAdmin("doctor", "password123");
    expect(admin.role).toBe("admin");
    expect(admin.username).toBe("doctor");
    expect(admin.passwordHash).not.toBe("password123");
  });

  it("rejects a second admin", async () => {
    await bootstrapAdmin("doctor", "password123");
    await expect(bootstrapAdmin("doctor2", "password456")).rejects.toBeInstanceOf(
      AdminAlreadyExistsError,
    );
  });

  it("allows only one admin to survive under concurrent first-time bootstrap attempts", async () => {
    // Distinct usernames — a race here can't be masked by the (unrelated)
    // username-uniqueness check; only the {role: "admin"} partial unique
    // index can be the thing that stops the loser(s).
    const results = await Promise.allSettled([
      bootstrapAdmin("doctor1", "password111"),
      bootstrapAdmin("doctor2", "password222"),
      bootstrapAdmin("doctor3", "password333"),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    for (const result of rejected) {
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(AdminAlreadyExistsError);
      }
    }

    expect(await UserModel.countDocuments({ role: "admin" })).toBe(1);
  });
});

describe("createReceptionist", () => {
  it("creates a receptionist linked to the creating admin", async () => {
    const admin = await bootstrapAdmin("doctor", "password123");
    const receptionist = await createReceptionist({
      staffId: "S001",
      username: "reception1",
      password: "password123",
      createdBy: admin._id,
    });

    expect(receptionist.role).toBe("receptionist");
    expect(receptionist.isActive).toBe(true);
    expect(receptionist.createdBy?.toString()).toBe(admin._id.toString());
  });

  it("rejects a duplicate username", async () => {
    const admin = await bootstrapAdmin("doctor", "password123");
    await createReceptionist({
      staffId: "S001",
      username: "reception1",
      password: "password123",
      createdBy: admin._id,
    });

    await expect(
      createReceptionist({
        staffId: "S002",
        username: "reception1",
        password: "password123",
        createdBy: admin._id,
      }),
    ).rejects.toBeInstanceOf(UsernameTakenError);
  });

  it("rejects a duplicate staffId", async () => {
    const admin = await bootstrapAdmin("doctor", "password123");
    await createReceptionist({
      staffId: "S001",
      username: "reception1",
      password: "password123",
      createdBy: admin._id,
    });

    await expect(
      createReceptionist({
        staffId: "S001",
        username: "reception2",
        password: "password123",
        createdBy: admin._id,
      }),
    ).rejects.toBeInstanceOf(StaffIdTakenError);
  });
});

describe("verifyCredentials", () => {
  it("returns the user for correct credentials", async () => {
    await bootstrapAdmin("doctor", "password123");
    const user = await verifyCredentials("doctor", "password123");
    expect(user?.username).toBe("doctor");
  });

  it("returns null for a wrong password", async () => {
    await bootstrapAdmin("doctor", "password123");
    expect(await verifyCredentials("doctor", "wrongpassword")).toBeNull();
  });

  it("returns null for a nonexistent username", async () => {
    expect(await verifyCredentials("nobody", "password123")).toBeNull();
  });

  it("returns null for a deactivated account even with correct credentials", async () => {
    const admin = await bootstrapAdmin("doctor", "password123");
    const receptionist = await createReceptionist({
      staffId: "S001",
      username: "reception1",
      password: "password123",
      createdBy: admin._id,
    });
    await setReceptionistActive(receptionist._id.toString(), false);

    expect(await verifyCredentials("reception1", "password123")).toBeNull();
  });

  it("is case-insensitive on username", async () => {
    await bootstrapAdmin("doctor", "password123");
    expect((await verifyCredentials("DOCTOR", "password123"))?.username).toBe("doctor");
  });
});

describe("setReceptionistActive", () => {
  it("toggles isActive", async () => {
    const admin = await bootstrapAdmin("doctor", "password123");
    const receptionist = await createReceptionist({
      staffId: "S001",
      username: "reception1",
      password: "password123",
      createdBy: admin._id,
    });

    const updated = await setReceptionistActive(receptionist._id.toString(), false);
    expect(updated?.isActive).toBe(false);
  });

  it("returns null for a nonexistent id", async () => {
    expect(await setReceptionistActive(new Types.ObjectId().toString(), false)).toBeNull();
  });
});

describe("deleteReceptionist", () => {
  it("removes the account so it can no longer authenticate", async () => {
    const admin = await bootstrapAdmin("doctor", "password123");
    const receptionist = await createReceptionist({
      staffId: "S001",
      username: "reception1",
      password: "password123",
      createdBy: admin._id,
    });

    const deleted = await deleteReceptionist(receptionist._id.toString());
    expect(deleted?.username).toBe("reception1");

    expect(await UserModel.findById(receptionist._id)).toBeNull();
    expect(await verifyCredentials("reception1", "password123")).toBeNull();
  });

  it("returns null for a nonexistent id", async () => {
    expect(await deleteReceptionist(new Types.ObjectId().toString())).toBeNull();
  });

  it("does not delete an admin account", async () => {
    const admin = await bootstrapAdmin("doctor", "password123");
    expect(await deleteReceptionist(admin._id.toString())).toBeNull();
    expect(await UserModel.findById(admin._id)).not.toBeNull();
  });
});

describe("adminAccountExists", () => {
  it("is false before any admin is created", async () => {
    expect(await adminAccountExists()).toBe(false);
  });

  it("is true once an admin exists", async () => {
    await bootstrapAdmin("doctor", "password123");
    expect(await adminAccountExists()).toBe(true);
  });
});

describe("deleteAdminAccount", () => {
  it("deletes the account with the correct password", async () => {
    const admin = await bootstrapAdmin("doctor", "password123");

    const deleted = await deleteAdminAccount(admin._id.toString(), "password123");
    expect(deleted?.username).toBe("doctor");

    expect(await UserModel.findById(admin._id)).toBeNull();
    expect(await adminAccountExists()).toBe(false);
  });

  it("throws InvalidPasswordError and keeps the account for a wrong password", async () => {
    const admin = await bootstrapAdmin("doctor", "password123");

    await expect(deleteAdminAccount(admin._id.toString(), "wrongpassword")).rejects.toBeInstanceOf(
      InvalidPasswordError,
    );
    expect(await UserModel.findById(admin._id)).not.toBeNull();
  });

  it("returns null for a nonexistent id", async () => {
    expect(await deleteAdminAccount(new Types.ObjectId().toString(), "password123")).toBeNull();
  });

  it("does not delete a receptionist account", async () => {
    const admin = await bootstrapAdmin("doctor", "password123");
    const receptionist = await createReceptionist({
      staffId: "S001",
      username: "reception1",
      password: "password123",
      createdBy: admin._id,
    });

    expect(await deleteAdminAccount(receptionist._id.toString(), "password123")).toBeNull();
    expect(await UserModel.findById(receptionist._id)).not.toBeNull();
  });
});

describe("changeOwnPassword", () => {
  it("changes a receptionist's own password with the correct current password", async () => {
    const admin = await bootstrapAdmin("doctor", "password123");
    const receptionist = await createReceptionist({
      staffId: "S001",
      username: "reception1",
      password: "oldpassword",
      createdBy: admin._id,
    });

    await changeOwnPassword(receptionist._id.toString(), "oldpassword", "newpassword");

    expect(await verifyCredentials("reception1", "oldpassword")).toBeNull();
    expect((await verifyCredentials("reception1", "newpassword"))?.username).toBe("reception1");
  });

  it("changes an admin's own password", async () => {
    const admin = await bootstrapAdmin("doctor", "password123");
    await changeOwnPassword(admin._id.toString(), "password123", "newpassword456");
    expect((await verifyCredentials("doctor", "newpassword456"))?.username).toBe("doctor");
  });

  it("throws InvalidPasswordError and leaves the password unchanged for a wrong current password", async () => {
    const admin = await bootstrapAdmin("doctor", "password123");
    await expect(changeOwnPassword(admin._id.toString(), "wrongpassword", "newpassword456")).rejects.toBeInstanceOf(
      InvalidPasswordError,
    );
    expect((await verifyCredentials("doctor", "password123"))?.username).toBe("doctor");
  });

  it("returns null for a nonexistent id", async () => {
    expect(await changeOwnPassword(new Types.ObjectId().toString(), "anything", "newpassword456")).toBeNull();
  });
});

describe("resetReceptionistPassword", () => {
  it("allows login with the new password and rejects the old one", async () => {
    const admin = await bootstrapAdmin("doctor", "password123");
    const receptionist = await createReceptionist({
      staffId: "S001",
      username: "reception1",
      password: "oldpassword",
      createdBy: admin._id,
    });

    await resetReceptionistPassword(receptionist._id.toString(), "newpassword");

    expect(await verifyCredentials("reception1", "oldpassword")).toBeNull();
    expect((await verifyCredentials("reception1", "newpassword"))?.username).toBe("reception1");
  });
});

// Direct-insert check: not reachable through the public API today (a receptionist
// can't exist before an admin does), but UserModel.find/query calls elsewhere
// still need this collection to behave with expected uniqueness.
describe("UserModel uniqueness (sanity check for the schema this service relies on)", () => {
  it("prevents two admins at the collection level", async () => {
    await UserModel.create({ role: "admin", username: "doctor", passwordHash: "x" });
    await expect(bootstrapAdmin("doctor2", "password456")).rejects.toBeInstanceOf(
      AdminAlreadyExistsError,
    );
  });
});
