import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

/**
 * A small, hand-picked set of response headers — deliberately not the
 * `helmet` package, since four headers don't warrant a new dependency here.
 * All are safe defaults for a same-origin, cookie-authenticated JSON API:
 * none of them touch CORS, cookies, or response bodies, so they can't break
 * the existing client. HSTS is gated to production, matching the same
 * `NODE_ENV === "production"` gate the session cookie's `secure` flag
 * already uses (auth/session.ts) — never sent over a plain-HTTP local/dev
 * server, where it would be actively wrong.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // This API only ever returns JSON — stops a browser from ever sniffing a
  // response as something else (e.g. HTML) and executing it as such.
  res.setHeader("X-Content-Type-Options", "nosniff");
  // This app is never intentionally embedded in another site's iframe.
  res.setHeader("X-Frame-Options", "DENY");
  // Don't leak this app's internal URLs (bill ids, etc.) via the Referer
  // header when a link or asset request crosses to a different origin.
  res.setHeader("Referrer-Policy", "no-referrer");
  if (env.nodeEnv === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
}
