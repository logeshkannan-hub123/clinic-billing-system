import cors from "cors";
import express, { type Express } from "express";
import type { Store } from "express-session";
import { createSessionMiddleware } from "./auth/session.js";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { securityHeaders } from "./middleware/securityHeaders.js";
import { applySessionTimeout } from "./middleware/sessionTimeout.js";
import { createAdminAccountRouter } from "./routes/adminAccount.js";
import { createAdminClinicSettingsRouter } from "./routes/adminClinicSettings.js";
import { createAdminDashboardRouter } from "./routes/adminDashboard.js";
import { createAdminReceptionistsRouter } from "./routes/adminReceptionists.js";
import { createAdminSettingsRouter } from "./routes/adminSettings.js";
import { createAuthRouter } from "./routes/auth.js";
import { createBillsRouter } from "./routes/bills.js";
import { createMedicinesRouter } from "./routes/medicines.js";
import { createSettingsDisplayRouter } from "./routes/settingsDisplay.js";
import { healthRouter } from "./routes/health.js";

export interface CreateAppOptions {
  sessionStore?: Store;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();

  // Opt-in only — see resolveTrustProxy in config/env.ts. Left unset (i.e.
  // not called) by default so behavior is unchanged for a deployment that
  // isn't behind a reverse proxy.
  if (env.trustProxy !== null) {
    app.set("trust proxy", env.trustProxy);
  }

  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(securityHeaders);
  app.use(express.json());
  app.use(createSessionMiddleware(options.sessionStore));
  app.use(applySessionTimeout);

  app.use("/api/health", healthRouter);
  app.use("/api/auth", createAuthRouter());
  app.use("/api/admin/account", createAdminAccountRouter());
  app.use("/api/admin/receptionists", createAdminReceptionistsRouter());
  app.use("/api/admin/settings", createAdminSettingsRouter());
  app.use("/api/admin/clinic-settings", createAdminClinicSettingsRouter());
  app.use("/api/admin/dashboard", createAdminDashboardRouter());
  app.use("/api/settings/display", createSettingsDisplayRouter());
  app.use("/api/bills", createBillsRouter());
  app.use("/api/medicines", createMedicinesRouter());

  app.use(errorHandler);

  return app;
}
