import "express-session";
import type { UserRole } from "../models/enums.js";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    // Snapshot of User.sessionVersion at login time — requireAuth compares
    // this to the live value on every request so a password change (which
    // bumps the live value) invalidates sessions stamped with an older one.
    sessionVersion?: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        role: UserRole;
        staffId?: string;
      };
    }
  }
}

export {};
