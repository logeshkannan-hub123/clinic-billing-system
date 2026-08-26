import { Router } from "express";
import { Types } from "mongoose";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { recordAuditEvent } from "../services/auditLog.js";
import {
  SettingsConflictError,
  getTaxConfig,
  updateTaxConfig,
} from "../services/clinicSettingsService.js";

export function createAdminSettingsRouter(): Router {
  const router = Router();

  router.use(requireAuth, requireRole("admin"));

  router.get("/", async (_req, res, next) => {
    try {
      const config = await getTaxConfig();
      res.json(config);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/", async (req, res, next) => {
    try {
      const { taxEnabled, taxRateBasisPoints } = (req.body ?? {}) as Record<string, unknown>;

      if (typeof taxEnabled !== "boolean") {
        res.status(400).json({ error: "taxEnabled (boolean) is required" });
        return;
      }
      if (
        taxEnabled &&
        !(
          Number.isInteger(taxRateBasisPoints) &&
          (taxRateBasisPoints as number) >= 0 &&
          (taxRateBasisPoints as number) <= 10000
        )
      ) {
        res.status(400).json({
          error: "taxRateBasisPoints must be an integer between 0 and 10000 when taxEnabled is true",
        });
        return;
      }

      const updated = await updateTaxConfig(
        {
          taxEnabled,
          taxRateBasisPoints: taxEnabled ? (taxRateBasisPoints as number) : null,
        },
        new Types.ObjectId(req.user!.id),
      );

      await recordAuditEvent("tax_settings_updated", {
        actorUserId: new Types.ObjectId(req.user!.id),
        payload: { taxEnabled: updated.taxEnabled, taxRateBasisPoints: updated.taxRateBasisPoints },
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof SettingsConflictError) {
        res.status(409).json({
          error: "Settings were changed by someone else just now. Reload and try again.",
        });
        return;
      }
      next(error);
    }
  });

  return router;
}
