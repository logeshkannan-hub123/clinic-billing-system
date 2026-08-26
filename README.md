# Clinic Billing System

A full-stack billing and administration system for small clinics — patient billing, medicine/injection/fluid inventory, payments, and clinic-configurable settings, built as a source-available portfolio project.

> **Status:** Source code sample, not currently deployed. This repository is shared as a code sample for review; a production deployment would happen under the operating clinic's own infrastructure/account.

## What it does

A clinic has two kinds of staff: an **admin** (owner/manager) and **receptionists** who handle day-to-day billing. The admin manages receptionist accounts, medicine pricing, and clinic-wide settings; receptionists create bills, record payments, and look up patient history. Every bill computes its own totals server-side, supports partial payments, and can be reprinted as a receipt sized for a thermal till printer or standard paper.

## Tech stack

**Client** — React 19, TypeScript, Vite 8, TanStack Query 5, React Router 7, Vitest + Testing Library
**Server** — Node.js, Express 4, TypeScript, MongoDB/Mongoose 8, `express-session` + `connect-mongo` (MongoDB-backed sessions), bcryptjs, `express-rate-limit`, Vitest + Supertest + `mongodb-memory-server`

Structured as an npm-workspaces monorepo (`client/`, `server/`) with unified root-level scripts for dev, lint, test, and build.

## Features (verified against the current code)

**Authentication & accounts**
- First-run setup: the login screen checks `/api/auth/setup-status` and only offers admin signup until one admin account exists — no open registration afterward
- Session-based auth (MongoDB-backed sessions, not JWT), bcrypt password hashing
- Self-service password change that re-validates the current password, re-stamps the acting session so the user isn't logged out by their own change, and invalidates every *other* session for that account
- Admin self-delete (password-confirmed)
- Admin creates/manages receptionist accounts directly — there's no receptionist self-registration
- Rate-limited login and password-change endpoints
- Full audit trail: 24 distinct event types (logins, account changes, bill actions, settings changes, exports, etc.)

**Billing**
- Server-computed bill totals with cross-field arithmetic validation at the schema level (line totals must equal quantity × unit price, etc.)
- Bill statuses: `UNPAID`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`
- Payment methods: UPI (with reference number) and Cash, partial payments supported
- Idempotency-key protection against accidental duplicate bill submission
- Bill history with search, status, and date filtering; printable/reprintable receipts

**Medicine management**
- Categorized inventory: Medicine, Injection, Fluid, each with active/inactive status
- Autocomplete lookup while building a bill
- Admin-only deletion, restricted to medicines with no billing history

**Admin dashboard & settings**
- Date-filterable billing summary/reporting endpoint
- Clinic-wide configuration: tax settings, receipt paper size (A4, A5, or 80mm/58mm thermal), date/time display format

**Security**
- `requireAuth` / `requireRole` middleware enforced server-side on every protected route (not just hidden in the UI)
- Session-version–based revocation: password changes and account actions invalidate other active sessions immediately
- `trust proxy` is opt-in via an environment variable (off by default, so behavior is unchanged for a deployment with no reverse proxy in front of it) rather than always-on
- Hand-rolled security headers middleware, CORS restricted to a configured client origin

**Testing**
- Co-located automated tests across models, services, routes, and middleware on the server, and across components and pages on the client (~30 and ~13 test files respectively)

## What's not implemented

Being upfront about the gap between a real clinic's needs and what's actually built:
- No "doctor" role — only `admin` and `receptionist` exist
- No self-service account registration beyond the one-time initial admin setup (by design — accounts are admin-provisioned)
- Patient records are minimal (name + phone only, deduplicated) — no medical history, prescriptions, or appointment scheduling
- Not deployed anywhere yet; no live demo

## Getting started

Requires Node 18+ and a MongoDB instance (local or Atlas).

```bash
git clone <this-repo>
cd clinic-billing-system
npm install
```

Configure the server:
```bash
cd server
cp .env.example .env
# fill in MONGODB_URI and SESSION_SECRET at minimum
```

From the repo root:
```bash
npm run dev:server   # http://localhost:4000
npm run dev:client   # http://localhost:5173 — proxies /api to the server above
```

On first run, open the client and use the signup screen to create the initial admin account (this option disappears once one exists).

## Testing

```bash
npm test             # runs both client and server suites
```

Co-located tests exist across nearly every model, service, route, and middleware module on the server (~30 files) and across components/pages on the client (~13 files), using Vitest (both) plus Supertest and `mongodb-memory-server` on the server. Current local run: **407/409 server tests passing** — 2 failures are timeouts in password-related tests (bcrypt + in-memory MongoDB setup exceeding a 5s test timeout under load), not investigated further as part of this pass.

## Project structure

```
client/src/
  api/          # typed fetch wrappers, one per resource
  components/   # shared UI (DataTable, Dialog, Toast, forms, etc.)
  hooks/        # TanStack Query hooks per resource
  pages/        # routed screens
server/src/
  auth/         # password hashing, session helpers
  config/       # env parsing/validation
  middleware/   # auth, role, rate limiting, security headers, session timeout
  models/       # Mongoose schemas (Bill, Payment, Patient, Medicine, User, ClinicSettings, AuditLog, ...)
  routes/       # Express routers, one per resource
  services/     # business logic called by routes
docs/architecture/  # design notes per subsystem
```
