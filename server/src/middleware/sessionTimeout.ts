import type { NextFunction, Request, Response } from "express";
import { getCachedSessionTimeoutMinutes } from "../services/clinicSettingsService.js";

/**
 * Applies the Admin-configured session timeout to the current request's
 * session cookie. `express-session`'s `cookie.maxAge` is normally fixed at
 * server boot (see session.ts); reassigning it per request, before the route
 * handler runs, is what lets a saved `security.sessionTimeoutMinutes` change
 * actually take effect — on the *next* request (session is `rolling: true`),
 * not just be a value that sits in the database unused. Cheap: reads an
 * in-process cache (see clinicSettingsService.ts), no DB access per request.
 */
export function applySessionTimeout(req: Request, _res: Response, next: NextFunction): void {
  if (req.session) {
    req.session.cookie.maxAge = getCachedSessionTimeoutMinutes() * 60 * 1000;
  }
  next();
}
