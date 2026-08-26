import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;
export const MIN_PASSWORD_LENGTH = 8;
// bcrypt silently truncates/ignores input past 72 bytes — without a cap here,
// two passwords sharing the same first 72 bytes would hash identically and
// be interchangeable at login. 128 is comfortably above any real password
// while still well clear of that boundary.
export const MAX_PASSWORD_LENGTH = 128;

export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

export function hashPasswordSync(plainTextPassword: string): string {
  return bcrypt.hashSync(plainTextPassword, SALT_ROUNDS);
}

export async function verifyPassword(
  plainTextPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}

export function isValidPassword(password: unknown): password is string {
  return (
    typeof password === "string" &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH
  );
}
