import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { getDisplaySettings } from "../services/clinicSettingsService.js";

/**
 * Narrow, read-only settings projection for screens both roles use (billing
 * workflow, receipt view) — Admin and Receptionist. Deliberately not the same
 * endpoint as GET /api/admin/clinic-settings (Admin-only, full document):
 * same precedent as POST /api/bills/preview already exposing `taxEnabled` to
 * Receptionists without loosening the Admin-only tax-settings endpoint — see
 * docs/architecture/admin-settings.md.
 */
export function createSettingsDisplayRouter(): Router {
  const router = Router();

  router.use(requireAuth, requireRole("admin", "receptionist"));

  router.get("/", async (_req, res, next) => {
    try {
      const settings = await getDisplaySettings();
      res.json(settings);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
