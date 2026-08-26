import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";

// IP-based only, no per-account lockout — see docs/architecture/authentication-authorization.md §12.
// A factory (not a shared singleton) so each `createApp()` call — each test file
// included — gets independent attempt-counting state.
export function createLoginRateLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Try again later." },
  });
}
