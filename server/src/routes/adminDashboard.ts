import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { getDashboardSummary } from "../services/dashboardService.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function createAdminDashboardRouter(): Router {
  const router = Router();

  router.use(requireAuth, requireRole("admin"));

  router.get("/", async (req, res, next) => {
    try {
      const { date } = req.query;
      if (date !== undefined && (typeof date !== "string" || !DATE_PATTERN.test(date))) {
        res.status(400).json({ error: "date must be in YYYY-MM-DD format" });
        return;
      }

      const summary = await getDashboardSummary(typeof date === "string" ? date : undefined);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
