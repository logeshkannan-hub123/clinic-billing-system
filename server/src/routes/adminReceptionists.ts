import { Router } from "express";
import { Types } from "mongoose";
import { isValidPassword, MIN_PASSWORD_LENGTH } from "../auth/password.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { UserModel } from "../models/User.js";
import { recordAuditEvent } from "../services/auditLog.js";
import {
  StaffIdTakenError,
  UsernameTakenError,
  createReceptionist,
  deleteReceptionist,
  resetReceptionistPassword,
  setReceptionistActive,
} from "../services/userService.js";

const MIN_USERNAME_LENGTH = 3;

function isValidUsername(username: unknown): username is string {
  return typeof username === "string" && username.trim().length >= MIN_USERNAME_LENGTH;
}

function isValidStaffId(staffId: unknown): staffId is string {
  return typeof staffId === "string" && staffId.trim().length > 0;
}

export function createAdminReceptionistsRouter(): Router {
  const adminReceptionistsRouter = Router();

  adminReceptionistsRouter.use(requireAuth, requireRole("admin"));

  adminReceptionistsRouter.get("/", async (_req, res, next) => {
    try {
      const receptionists = await UserModel.find({ role: "receptionist" })
        .select("username staffId isActive createdAt")
        .sort({ createdAt: -1 })
        .lean();
      res.json(receptionists);
    } catch (error) {
      next(error);
    }
  });

  adminReceptionistsRouter.post("/", async (req, res, next) => {
    try {
      const { staffId, username, password } = req.body ?? {};

      if (!isValidStaffId(staffId)) {
        res.status(400).json({ error: "staffId is required" });
        return;
      }
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

      const receptionist = await createReceptionist({
        staffId: staffId.trim(),
        username: username.trim(),
        password,
        createdBy: new Types.ObjectId(req.user!.id),
      });

      await recordAuditEvent("account_created", {
        actorUserId: new Types.ObjectId(req.user!.id),
        payload: {
          username: receptionist.username,
          staffId: receptionist.staffId,
          role: "receptionist",
        },
      });

      res.status(201).json({
        id: receptionist._id,
        username: receptionist.username,
        staffId: receptionist.staffId,
        isActive: receptionist.isActive,
      });
    } catch (error) {
      if (error instanceof UsernameTakenError) {
        res.status(409).json({ error: "Username is already taken" });
        return;
      }
      if (error instanceof StaffIdTakenError) {
        res.status(409).json({ error: "staffId is already taken" });
        return;
      }
      next(error);
    }
  });

  adminReceptionistsRouter.patch("/:id", async (req, res, next) => {
    try {
      const { isActive } = req.body ?? {};
      if (typeof isActive !== "boolean") {
        res.status(400).json({ error: "isActive (boolean) is required" });
        return;
      }

      const receptionist = await setReceptionistActive(req.params.id, isActive);
      if (!receptionist) {
        res.status(404).json({ error: "Receptionist not found" });
        return;
      }

      await recordAuditEvent(isActive ? "account_reactivated" : "account_deactivated", {
        actorUserId: new Types.ObjectId(req.user!.id),
        payload: { username: receptionist.username, staffId: receptionist.staffId },
      });

      res.json({
        id: receptionist._id,
        username: receptionist.username,
        staffId: receptionist.staffId,
        isActive: receptionist.isActive,
      });
    } catch (error) {
      next(error);
    }
  });

  adminReceptionistsRouter.delete("/:id", async (req, res, next) => {
    try {
      const receptionist = await deleteReceptionist(req.params.id);
      if (!receptionist) {
        res.status(404).json({ error: "Receptionist not found" });
        return;
      }

      await recordAuditEvent("account_deleted", {
        actorUserId: new Types.ObjectId(req.user!.id),
        payload: {
          targetUserId: receptionist._id,
          username: receptionist.username,
          staffId: receptionist.staffId,
        },
      });

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  adminReceptionistsRouter.patch("/:id/password", async (req, res, next) => {
    try {
      const { password } = req.body ?? {};
      if (!isValidPassword(password)) {
        res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
        return;
      }

      const receptionist = await resetReceptionistPassword(req.params.id, password);
      if (!receptionist) {
        res.status(404).json({ error: "Receptionist not found" });
        return;
      }

      // Payload intentionally excludes the password/hash — actor + target
      // identifiers only, per security.md.
      await recordAuditEvent("password_reset", {
        actorUserId: new Types.ObjectId(req.user!.id),
        payload: {
          targetUserId: receptionist._id,
          username: receptionist.username,
          staffId: receptionist.staffId,
        },
      });

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return adminReceptionistsRouter;
}
