import type { NextFunction, Request, Response } from "express";
import { UserModel } from "../models/User.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const user = await UserModel.findById(userId).lean();
  // A missing `session.sessionVersion` (a session predating this field, or
  // one from before this check existed) is treated as version 0 — the same
  // default a freshly created User document gets — so deploying this check
  // doesn't itself force-logout every already-active session; only an actual
  // password change (which increments the stored value) does.
  const sessionVersion = req.session.sessionVersion ?? 0;
  // `.lean()` returns the raw stored document and does NOT backfill schema
  // defaults for fields missing on it — unlike a hydrated (non-lean) query,
  // e.g. the one login uses to stamp the session in the first place. Any
  // account that existed before `sessionVersion` was added to the schema
  // has no such field actually persisted, so it reads back as `undefined`
  // here even though the session was correctly stamped with `0` at login.
  // Without this fallback, `undefined !== 0` is always true and every
  // pre-existing account gets logged out on its very next request.
  const userSessionVersion = user?.sessionVersion ?? 0;
  if (!user || !user.isActive || userSessionVersion !== sessionVersion) {
    req.session.destroy(() => {});
    res.clearCookie("clinic.sid");
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  req.user = {
    id: userId,
    username: user.username,
    role: user.role,
    staffId: user.staffId ?? undefined,
  };
  next();
}