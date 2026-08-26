import type { Request } from "express";
import session, { MemoryStore, type SessionOptions, type Store } from "express-session";
import { env } from "../config/env.js";

// 12-hour sliding expiration (renewed on activity via `rolling: true`),
// roughly a clinic shift — see docs/architecture/authentication-authorization.md.
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function createSessionMiddleware(store?: Store) {
  const options: SessionOptions = {
    name: "clinic.sid",
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    // Defaults to an in-memory store when none is provided (e.g. in tests),
    // so nothing here depends on a live MongoDB connection. The real server
    // passes a MongoStore explicitly — see index.ts.
    store: store ?? new MemoryStore(),
    cookie: {
      httpOnly: true,
      secure: env.nodeEnv === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_MS,
    },
  };

  return session(options);
}

// Must be called — and awaited — before writing an authenticated identity
// (req.session.userId = ...) into the session, for both signup and login.
// Regenerating first assigns a brand-new session id, so a pre-authentication
// session id (e.g. one an attacker primed before the user logged in) can
// never become a valid authenticated session — this is the standard fix for
// session fixation. `regenerate()` also clears any other data already on the
// session, which is fine here since nothing is written to session before
// authentication in this app.
export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      resolve();
    });
  });
}
