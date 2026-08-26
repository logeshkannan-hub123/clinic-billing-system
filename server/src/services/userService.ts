import { Types } from "mongoose";
import { hashPassword, hashPasswordSync, verifyPassword } from "../auth/password.js";
import { UserModel, type UserHydratedDoc } from "../models/User.js";

export class AdminAlreadyExistsError extends Error {}
export class UsernameTakenError extends Error {}
export class StaffIdTakenError extends Error {}
export class InvalidPasswordError extends Error {}

// Precomputed once at module load and compared against whenever a username
// isn't found, so login response timing can't be used to tell whether a
// username is registered. Not a real credential — just a fixed dummy hash.
const DUMMY_PASSWORD_HASH = hashPasswordSync("timing-attack-mitigation");

export async function bootstrapAdmin(username: string, password: string): Promise<UserHydratedDoc> {
  const adminExists = await UserModel.exists({ role: "admin" });
  if (adminExists) {
    throw new AdminAlreadyExistsError();
  }

  const passwordHash = await hashPassword(password);
  try {
    return await UserModel.create({
      role: "admin",
      username,
      passwordHash,
      isActive: true,
    });
  } catch (error) {
    if (isDuplicateKeyError(error, "username")) throw new UsernameTakenError();
    // Backstops the exists()-then-create() check above against a concurrent
    // first-admin race: MongoDB's partial unique index on {role: "admin"}
    // (see models/User.ts) rejects a second admin insert atomically even if
    // both requests passed the exists() check before either committed.
    if (isDuplicateKeyError(error, "role")) throw new AdminAlreadyExistsError();
    throw error;
  }
}

export async function createReceptionist(params: {
  staffId: string;
  username: string;
  password: string;
  createdBy: Types.ObjectId;
}): Promise<UserHydratedDoc> {
  const passwordHash = await hashPassword(params.password);
  try {
    return await UserModel.create({
      role: "receptionist",
      username: params.username,
      staffId: params.staffId,
      passwordHash,
      isActive: true,
      createdBy: params.createdBy,
    });
  } catch (error) {
    if (isDuplicateKeyError(error, "username")) throw new UsernameTakenError();
    if (isDuplicateKeyError(error, "staffId")) throw new StaffIdTakenError();
    throw error;
  }
}

export async function verifyCredentials(
  username: string,
  password: string,
): Promise<UserHydratedDoc | null> {
  const user = await UserModel.findOne({ username: username.toLowerCase() });

  // Always run a bcrypt compare, even when the user doesn't exist, so response
  // timing can't reveal whether the username is registered.
  const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const passwordMatches = await verifyPassword(password, passwordHash);

  if (!user || !user.isActive || !passwordMatches) {
    return null;
  }

  return user;
}

export async function setReceptionistActive(
  id: string,
  isActive: boolean,
): Promise<UserHydratedDoc | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  return UserModel.findOneAndUpdate({ _id: id, role: "receptionist" }, { isActive }, { new: true });
}

export async function deleteReceptionist(id: string): Promise<UserHydratedDoc | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  return UserModel.findOneAndDelete({ _id: id, role: "receptionist" });
}

/** Self-service password change — any authenticated role, requires the
 * current password rather than an admin override, unlike
 * `resetReceptionistPassword`. Also bumps `sessionVersion`, which invalidates
 * every session for this account — including, deliberately, the one making
 * this very request; the caller (routes/auth.ts) re-stamps its own session
 * with the new version immediately after so the user isn't logged out by
 * changing their own password, while any other still-open session for this
 * account (e.g. a stolen cookie) stops working on its very next request. */
export async function changeOwnPassword(
  id: string,
  currentPassword: string,
  newPassword: string,
): Promise<UserHydratedDoc | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const user = await UserModel.findById(id);
  if (!user) return null;

  const passwordMatches = await verifyPassword(currentPassword, user.passwordHash);
  if (!passwordMatches) throw new InvalidPasswordError();

  user.passwordHash = await hashPassword(newPassword);
  user.sessionVersion += 1;
  await user.save();
  return user;
}

export async function adminAccountExists(): Promise<boolean> {
  return Boolean(await UserModel.exists({ role: "admin" }));
}

/** Self-service deletion of the admin's own account — requires the admin's
 * current password, checked here rather than left to the caller, so this
 * can never be invoked without re-proving identity. */
export async function deleteAdminAccount(
  id: string,
  password: string,
): Promise<UserHydratedDoc | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const admin = await UserModel.findOne({ _id: id, role: "admin" });
  if (!admin) return null;

  const passwordMatches = await verifyPassword(password, admin.passwordHash);
  if (!passwordMatches) throw new InvalidPasswordError();

  await UserModel.deleteOne({ _id: admin._id });
  return admin;
}

/** Admin-initiated reset of a receptionist's password. Bumps `sessionVersion`
 * so every session already open for that receptionist — anywhere, including
 * one an admin suspects is compromised — is invalidated as of this call;
 * unlike self-service change, there's no "current session" to re-stamp here
 * since the admin, not the receptionist, is the caller. */
export async function resetReceptionistPassword(
  id: string,
  password: string,
): Promise<UserHydratedDoc | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const passwordHash = await hashPassword(password);
  return UserModel.findOneAndUpdate(
    { _id: id, role: "receptionist" },
    { passwordHash, $inc: { sessionVersion: 1 } },
    { new: true },
  );
}

function isDuplicateKeyError(error: unknown, field: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000 &&
    Boolean((error as { keyPattern?: Record<string, unknown> }).keyPattern?.[field])
  );
}
