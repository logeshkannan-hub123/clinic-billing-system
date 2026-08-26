import { Router } from "express";
import { Types } from "mongoose";
import { isValidPassword, MIN_PASSWORD_LENGTH } from "../auth/password.js";
import { regenerateSession } from "../auth/session.js";
import { createLoginRateLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { recordAuditEvent } from "../services/auditLog.js";
import {
  AdminAlreadyExistsError,
  InvalidPasswordError,
  UsernameTakenError,
  adminAccountExists,
  bootstrapAdmin,
  changeOwnPassword,
  verifyCredentials,
} from "../services/userService.js";

const MIN_USERNAME_LENGTH = 3;

function isValidUsername(username: unknown): username is string {
  return typeof username === "string" && username.trim().length >= MIN_USERNAME_LENGTH;
}

// A factory (not a module-level singleton) so each `createApp()` call gets its
// own rate-limiter state — see the comment in middleware/rateLimit.ts.
export function createAuthRouter(): Router {
  const authRouter = Router();

  // Public and unauthenticated on purpose — the login screen needs this to
  // decide whether to offer first-time admin setup, before any session
  // exists. Only reveals a boolean, nothing about who the admin is.
  authRouter.get("/setup-status", async (_req, res, next) => {
    try {
      res.json({ adminExists: await adminAccountExists() });
    } catch (error) {
      next(error);
    }
  });

  authRouter.post("/signup", async (req, res, next) => {
    try {
      const { username, password } = req.body ?? {};

      if (!isValidUsername(username)) {
        res
          .status(400)
          .json({ error: `username is required (min ${MIN_USERNAME_LENGTH} characters)` });
        return;
      }
      if (!isValidPassword(password)) {
        res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
        return;
      }

      const admin = await bootstrapAdmin(username.trim(), password);

      await regenerateSession(req);
      req.session.userId = admin._id.toString();
      req.session.sessionVersion = admin.sessionVersion;
      await recordAuditEvent("account_created", {
        actorUserId: admin._id,
        payload: { username: admin.username, role: "admin", bootstrap: true },
      });

      res.status(201).json({ id: admin._id, username: admin.username, role: admin.role });
    } catch (error) {
      if (error instanceof AdminAlreadyExistsError) {
        res.status(409).json({ error: "Setup already completed" });
        return;
      }
      if (error instanceof UsernameTakenError) {
        res.status(409).json({ error: "Username is already taken" });
        return;
      }
      next(error);
    }
  });

  authRouter.post("/login", createLoginRateLimiter(), async (req, res, next) => {
    try {
      const { username, password } = req.body ?? {};

      if (typeof username !== "string" || typeof password !== "string") {
        res.status(401).json({ error: "Invalid username or password" });
        return;
      }

      const user = await verifyCredentials(username.trim(), password);
      if (!user) {
        await recordAuditEvent("login_failed", { payload: { username: username.trim() } });
        res.status(401).json({ error: "Invalid username or password" });
        return;
      }

      await regenerateSession(req);
      req.session.userId = user._id.toString();
      req.session.sessionVersion = user.sessionVersion;
      await recordAuditEvent("login_succeeded", {
        actorUserId: user._id,
        payload: { username: user.username },
      });

      res.json({ id: user._id, username: user.username, role: user.role });
    } catch (error) {
      next(error);
    }
  });

  authRouter.post("/logout", requireAuth, async (req, res, next) => {
    try {
      const actorUserId = req.user?.id;
      if (actorUserId) {
        await recordAuditEvent("logout", { actorUserId: new Types.ObjectId(actorUserId) });
      }

      req.session.destroy((error) => {
        if (error) {
          next(error);
          return;
        }
        res.clearCookie("clinic.sid");
        res.status(204).end();
      });
    } catch (error) {
      next(error);
    }
  });

  authRouter.get("/me", requireAuth, (req, res) => {
    res.json(req.user);
  });

  // Rate-limited like login — this endpoint verifies a password too, so it's
  // an equally viable brute-force target for anyone holding a valid session.
  authRouter.patch("/password", requireAuth, createLoginRateLimiter(), async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body ?? {};

      if (typeof currentPassword !== "string" || currentPassword.length === 0) {
        res.status(400).json({ error: "currentPassword is required" });
        return;
      }
      if (!isValidPassword(newPassword)) {
        res.status(400).json({ error: `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters` });
        return;
      }

      const user = await changeOwnPassword(req.user!.id, currentPassword, newPassword);
      if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      // Re-stamp the version onto *this* session so the user who just proved
      // their identity (by supplying currentPassword) isn't logged out by
      // their own change — every other session for this account, still
      // carrying the pre-change version, fails requireAuth's check on its
      // next request.
      req.session.sessionVersion = user.sessionVersion;

      await recordAuditEvent("password_reset", {
        actorUserId: user._id,
        payload: { targetUserId: user._id, username: user.username, selfService: true },
      });

      res.status(204).end();
    } catch (error) {
      if (error instanceof InvalidPasswordError) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }
      next(error);
    }
  });

  return authRouter;
}
