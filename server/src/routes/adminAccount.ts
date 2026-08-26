import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { createLoginRateLimiter } from "../middleware/rateLimit.js";
import { recordAuditEvent } from "../services/auditLog.js";
import { InvalidPasswordError, deleteAdminAccount } from "../services/userService.js";

export function createAdminAccountRouter(): Router {
  const adminAccountRouter = Router();

  adminAccountRouter.use(requireAuth, requireRole("admin"));

  // Rate-limited like login/password-change — this verifies a password too,
  // so it's an equally viable brute-force target for anyone holding a valid
  // (but not password-knowing) admin session.
  adminAccountRouter.delete("/", createLoginRateLimiter(), async (req, res, next) => {
    try {
      const { password } = req.body ?? {};
      if (typeof password !== "string" || password.length === 0) {
        res.status(400).json({ error: "password is required" });
        return;
      }

      const admin = await deleteAdminAccount(req.user!.id, password);
      if (!admin) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      await recordAuditEvent("account_deleted", {
        actorUserId: admin._id,
        payload: { username: admin.username, role: "admin", selfDelete: true },
      });

      req.session.destroy((error) => {
        if (error) {
          next(error);
          return;
        }
        res.clearCookie("clinic.sid");
        res.status(204).end();
      });
    } catch (error) {
      if (error instanceof InvalidPasswordError) {
        res.status(401).json({ error: "Incorrect password" });
        return;
      }
      next(error);
    }
  });

  return adminAccountRouter;
}
