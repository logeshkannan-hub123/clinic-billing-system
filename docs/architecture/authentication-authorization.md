# Authentication & Authorization — Approved Architecture

Status: **Approved and implemented 2026-08-15.** A post-implementation security review the same
day found two gaps (session fixation, missing password-reset audit event); both are fixed and
documented below — see §6 and §11.

## 1. Account bootstrap — first signup becomes the sole Admin

- `POST /api/auth/signup` is a **bootstrap-only** endpoint: it only succeeds if zero `User`
  documents exist in the database. The first (and only) successful call creates the Admin account
  (`role: "admin"`) and immediately logs the caller in.
- Every subsequent call to this endpoint fails (`409 Conflict`, generic "setup already completed"
  message) — enforced by an application-layer check (`UserModel.exists({ role: "admin" })`) before
  insert, matching the "exactly one Admin" rule already noted in `data-models.md`. A unique-index
  race is still possible if two bootstrap requests land at the same instant; the second insert is
  caught by a duplicate-key error on `username` at worst, but this is a one-time, low-traffic
  operation (initial setup), so a transaction is not proposed for it.
- Once an Admin exists, the signup UI/route is not exposed to end users at all — there is no
  ongoing public self-registration for anyone, including receptionists (see §3).

## 2. Exactly one Admin account

Enforced at the service layer (not the schema — MongoDB has no native "at most one row" constraint):
every Admin-creating code path checks `UserModel.exists({ role: "admin" })` first and rejects if
one is already present. There is intentionally no "promote to admin" or "second admin" pathway in
this design.

## 3. Receptionist accounts — Admin-created only

Per the confirmed requirement ("new receptionist accounts cannot self-register... only
created/approved by the Admin"), there is **no public receptionist signup**. Only an authenticated
Admin can create one:

- `POST /api/admin/receptionists` (Admin-only) — body: `{ staffId, username, password }`. Creates
  the account with `role: "receptionist"`, `isActive: true` immediately (no separate "pending"
  state — the Admin's act of creating the account *is* the approval).
- The Admin is responsible for relaying the chosen username/password to the receptionist
  out-of-band (in person, etc.) — no email/SMS delivery mechanism is in scope for MVP.

## 4. Unique `staffId`

Already enforced by the `User` model's unique index (`staffId`, sparse). The creation endpoint
surfaces a clear `409 Conflict` with a field-level error if the chosen `staffId` or `username` is
taken — this is a legitimate case where revealing "already exists" is fine, since it's an
authenticated Admin action, not a public-facing login/signup surface (see §10 for why login itself
must stay generic).

## 5. Password hashing

Passwords are hashed with **bcrypt** (via the `bcryptjs` package — pure JS, no native build step;
see §14 for why over native `bcrypt`), cost factor 12, before ever touching the database. Minimum
length 8 characters enforced at the API boundary (already confirmed). Plaintext passwords are never
logged, stored, or included in audit payloads.

## 6. Login / logout / session strategy

**Server-side session, stored in MongoDB, referenced by an httpOnly cookie** — not a stateless JWT.
Rationale: the requirement that a deactivated receptionist can no longer log in/act **immediately**
is much simpler to guarantee with a server-side session (destroy or reject the session on next
request) than with stateless JWTs, which would otherwise need either short-lived tokens plus a
refresh flow, or a revocation list — extra machinery that defeats JWT's main advantage. This is an
internal small-scale app (handful of users), so the operational simplicity of sessions wins.

- `POST /api/auth/login` — body `{ username, password }`. On success: creates a session, sets an
  httpOnly, `sameSite: 'lax'` cookie (`secure: true` when `NODE_ENV=production`), returns
  `{ id, username, role }` (never the password hash). On failure: generic error, see §10.
- `POST /api/auth/logout` — destroys the session server-side and clears the cookie.
- `GET /api/auth/me` — returns the current session's `{ id, username, role, staffId? }`, or `401` if
  no valid session. This is how the client discovers "am I logged in, and as whom" (see §13).
- Session store: `connect-mongo`, reusing the existing MongoDB connection — no new infrastructure.
- Session lifetime: proposed 12-hour sliding expiration (renewed on activity), roughly a clinic
  shift. Flagged for confirmation in §14.
- Every request re-checks `isActive` on the referenced user (not just at login) — see §7 — so a
  receptionist deactivated mid-session loses access on their very next request, not just next login.
- **Session regeneration (required):** both the bootstrap signup and login handlers must call
  `req.session.regenerate()` and await it before writing `req.session.userId`. This assigns a
  brand-new session id at the moment of authentication, so a pre-authentication session id (e.g.
  one an attacker primed before the user logged in, or a stale id from a previous login by someone
  else on a shared machine) can never become — or remain — a valid authenticated session. This is
  the standard mitigation for session fixation (OWASP). Implemented as a shared
  `regenerateSession(req)` helper in `server/src/auth/session.ts`, used identically by both flows.

## 7. Authentication middleware

- `requireAuth`: reads the session, loads the referenced `User`, rejects `401` if no session or the
  session references a user that no longer exists or has `isActive: false`. On success, attaches a
  minimal `req.user = { id, role, staffId }` to the request.
- `requireRole(...roles)`: composes after `requireAuth`; rejects `403` if `req.user.role` isn't in
  the allowed set.

## 8. Role-based authorization

- Admin-only: receptionist account management, dashboard/reporting, bill cancellation (already
  scoped to Admin in `data-models.md`), storage-monitoring/export endpoints (per the earlier
  approved architecture).
- Admin or Receptionist: billing workflow (generate bill, record payment), generated-bills list —
  both roles listed in the original requirements as using this flow.
- No endpoint is unauthenticated except `POST /api/auth/login` and the one-time
  `POST /api/auth/signup`.

## 9. Active / deactivated receptionist accounts

- `PATCH /api/admin/receptionists/:id` (Admin-only) — body `{ isActive: boolean }`, toggles the
  flag. No new status enum needed; the field already exists on `User`.
- `GET /api/admin/receptionists` (Admin-only) — list all receptionist accounts with their
  `isActive` state. Not explicitly itemized in the original requirements' page list, but necessary
  for the Admin to have anything to toggle — flagged as an inferred-but-necessary addition.
- Deactivation never deletes or unlinks the account from its historical bills/payments
  (`createdBy`/`recordedBy` references stay intact), matching the confirmed requirement.

## 10. Secure authentication error handling

Per `security.md` ("login errors should not unnecessarily reveal whether a username exists"): the
login endpoint returns the **same** generic response — `401`, `{ error: "Invalid username or
password" }` — for all three failure cases: username doesn't exist, wrong password, and account
deactivated. A deactivated account is *not* told "your account is deactivated" at the login screen,
since that would confirm the username's existence/status to anyone probing it; the receptionist
finds out via the Admin directly (out-of-band), not through the login form. Flagged for confirmation
in §14, since this is stricter than some apps' UX and worth an explicit sign-off.

## 11. Login / account-related audit events

Extends the existing `AuditLog` model's `eventType` enum (currently only has storage/export and
billing events) with:

- `login_succeeded`, `login_failed` — payload: `{ username }` only (never the password, hashed or
  not).
- `logout`
- `account_created`, `account_deactivated`, `account_reactivated` — payload includes the target
  user's id/username and the acting Admin's id (`actorUserId` already covers the actor).
- `password_reset` — recorded whenever an Admin successfully resets a receptionist's password
  (`PATCH /api/admin/receptionists/:id/password`). Payload: target user's id/username/staffId only.
  **Must never** contain the new password, the password hash, or any other authentication secret —
  this is enforced by the payload being hand-built from specific safe fields, never by spreading or
  logging the user document itself.

## 12. Brute-force / login-abuse protection

Proposed: `express-rate-limit` on `POST /api/auth/login`, keyed by IP, e.g. 10 attempts per 15
minutes, returning generic `429`. **No per-account lockout** is proposed — with only a handful of
staff accounts, an attacker-triggerable lockout would itself become a denial-of-service the Admin
has to manually fix, which is worse than the risk it prevents at this scale. Flagged for
confirmation in §14, since account lockout is a legitimate alternative some reviewers expect.

## 13. Client authentication-state handling

- The session cookie is httpOnly — client JavaScript cannot read it, and does not need to; nothing
  auth-related is ever stored in `localStorage`/`sessionStorage` (avoids XSS-driven session theft).
- On app load, the client calls `GET /api/auth/me`. A React `AuthContext`/`AuthProvider` holds
  `{ user, loading }`; route guards redirect to `/login` if unauthenticated, or check `user.role`
  for Admin-only routes.
- All API calls from the client use `fetch(..., { credentials: 'include' })` so the cookie is sent;
  the server's CORS config allows the client's origin with `credentials: true`.
- Logout clears client-side `user` state after `POST /api/auth/logout` succeeds.

## 14. Confirmed decisions (2026-08-15)

1. **Session vs JWT** — confirmed: server-side session (§6), not JWT.
2. **New dependencies** — approved: `bcryptjs`, `express-session`, `connect-mongo`,
   `express-rate-limit`.
3. **Session lifetime** — confirmed: 12-hour sliding expiration.
4. **Brute-force strategy** — confirmed: IP-based rate limiting only (§12), no account lockout.
5. **Login error messaging** — confirmed: fully generic errors even for deactivated accounts (§10).
6. **Cookie `secure`/`sameSite` settings** — dev-safe defaults stand (§6); still ultimately depends
   on final hosting (same-origin vs cross-origin), which remains open in `requirements.md`'s
   "Data & compliance" section — revisit once hosting is confirmed.
7. **Password reset** — confirmed as proposed: Admin resets a receptionist's password directly via
   `PATCH /api/admin/receptionists/:id/password`; Admin's own forgotten-password recovery is out of
   scope for MVP.
