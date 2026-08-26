# Frontend — Approved Architecture

Status: **Approved 2026-08-16. Implemented 2026-08-16 — see "Confirmed decisions" at the end**,
including a post-implementation-review contract addition (`dueAmountInPaise` on `GET /api/bills`
list items, documented inline below).

Inspected before writing this: `requirements.md`, `docs/architecture/{authentication-authorization,
data-models,billing-workflow,dashboard-reporting}.md`, `security.md`, the current client app
(`client/src/` — confirmed it's still the untouched Vite scaffold: `App.tsx`/`App.css` are template
boilerplate, no router, no state library, no clinic-specific code exists yet), and every backend
route handler directly (`auth.ts`, `adminReceptionists.ts`, `adminSettings.ts`, `adminDashboard.ts`,
`bills.ts`) — not just the architecture docs, since docs can drift from implementation.

## Current client state

`client/package.json` has only `react`/`react-dom` plus the Vite template's dev tooling
(`oxlint`, `vitest`, `@testing-library/react`). No `react-router-dom`, no data-fetching/state
library, no HTTP client wrapper. This is a genuinely blank slate.

## Confirmed API contracts (read directly from route code, not just docs)

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /api/auth/signup` | none (bootstrap-only) | 201 `{id,username,role}` / 409 if already set up |
| `POST /api/auth/login` | none | 200 `{id,username,role}` / 401 generic on any failure |
| `POST /api/auth/logout` | session | 204 |
| `GET /api/auth/me` | session | 200 `{id,username,role,staffId?}` / 401 |
| `GET/POST /api/admin/receptionists` | admin | list (selected fields) / create |
| `PATCH /api/admin/receptionists/:id` | admin | `{isActive}` toggle |
| `PATCH /api/admin/receptionists/:id/password` | admin | 204, no body |
| `GET/PATCH /api/admin/settings` | admin | tax config `{taxEnabled,taxRateBasisPoints}` |
| `GET /api/admin/dashboard?date=` | admin | revenue + 5 status counts, defaults to today (Kolkata) |
| `POST/GET /api/bills`, `GET/PATCH /api/bills/:id` | admin+receptionist | create/list/detail/edit |
| `PATCH /api/bills/:id/cancel` | admin only | UNPAID-only |
| `POST /api/bills/:id/payments` | admin+receptionist | cash/UPI |

Two response-shape inconsistencies found while reading the code (not blocking, just noting so the
frontend's type layer handles them deliberately rather than by accident): `POST /api/bills` and
`PATCH /api/bills/:id` return the raw `Bill` document (includes `__v`), `GET /api/bills/:id` wraps
it as `{ bill, payments }`, and `POST .../payments` returns yet another shape,
`{ payment, bill: { id, status }, dueAmountInPaise }` (a partial bill, not the full document). The
frontend's API layer will type each of these distinctly rather than assuming one shared "Bill
response" shape.

**Contract addition (2026-08-16, post-review): `dueAmountInPaise` on `GET /api/bills` list items.**
The Generated Bills worklist needs to show the outstanding amount per bill (`requirements.md`: "a
partially paid bill remains and shows a due tag"), but the list endpoint previously returned only
the full `Bill` document, which has no payment-derived field — only `GET /api/bills/:id` (a single
bill) includes payment history. Rather than have the client fetch payments per row (N+1) or
re-derive a running total from unfetched data, each item in `GET /api/bills`'s `bills[]` array now
also includes a server-computed `dueAmountInPaise: number`, calculated the same way the payment
endpoint already computes it (`grandTotalInPaise` minus the sum of that bill's `Payment.amountInPaise`
records), via one additional aggregate query for the whole page — not one query per bill. Only the
list endpoint gained this field; `GET /api/bills/:id` and the create/edit/payment responses are
unchanged. The frontend types this as `BillListItem extends Bill { dueAmountInPaise: number }`,
distinct from the plain `Bill` type used everywhere else, so it's never assumed to exist outside a
list response.

## Two places where the existing API contract needs a small correction

Per your instruction to flag rather than silently work around these:

**1. No way to preview a bill's total before creating it.** The billing page requirement lists
subtotal/rounding/grand-total as fields on the *input* page, alongside "add medicine." But
`POST /api/bills` both computes totals **and** persists (allocates a bill number, runs duplicate
detection, resolves/creates the `Patient`). Calling it just to preview a total would create a real
bill as a side effect — not acceptable. And computing the preview client-side would violate "use the
existing API rather than duplicating billing calculations." Proposing a small addition:

```
POST /api/bills/preview
Body: same shape as POST /api/bills (patientName, patientPhone, items, consultationFeeInPaise)
Response: { subtotalInPaise, taxEnabled, taxRateBasisPoints, taxAmountInPaise,
            roundingAdjustmentInPaise, grandTotalInPaise }
```

This is a thin route wrapping the already-approved, already-tested pure functions
(`calculateBillTotals` from `billMath.ts`) plus a `getTaxConfig()` read — no new business logic, no
persistence, no new validation rules. It also solves problem 2 below for free.

**2. Tax visibility for Receptionists.** "Tax display only when enabled by admin" requires the
billing screen to know the current tax config — but `GET /api/admin/settings` is Admin-only, and a
Receptionist legitimately needs to know whether to show a tax line while building a bill. Rather
than loosening that endpoint's permissions, the preview endpoint above naturally solves this: its
response includes `taxEnabled`, since it has to know that to compute the total anyway. No permission
change needed anywhere.

Everything else the frontend needs already exists — no other backend changes proposed.

## Proposed dependencies (need approval per `architecture.md`'s dependency process)

| Package | Purpose | Alternative considered |
|---|---|---|
| `react-router-dom` | Client-side routing (login, dashboard, billing, bills list/detail, admin screens) | None reasonable — this is the standard choice and the app has 7+ distinct screens |
| `@tanstack/react-query` | Server-state fetching/caching/invalidation (e.g., re-fetch the bills list after creating a bill, dashboard after a payment) | Plain `fetch` + `useState`/`useEffect` per screen — works, but means hand-rolling cache invalidation across ~7 interdependent screens. Flagged as a real decision below, not assumed. |

No UI component library or CSS framework proposed — plain CSS (matching the existing Vite scaffold's
approach), given no design-system requirement exists and `architecture.md` favors avoiding
unnecessary dependencies.

## Proposed structure (parallels the server's existing convention)

```
client/src/
  api/            # typed fetch wrappers, one file per backend resource
    client.ts     #   shared fetch helper: credentials:'include', JSON, error normalization
    auth.ts, bills.ts, admin.ts
  context/
    AuthContext.tsx   # holds { user, loading }, backed by GET /api/auth/me
  components/
    ProtectedRoute.tsx, BillItemsEditor.tsx, MoneyInput.tsx, StatusBadge.tsx, ReceiptView.tsx, ...
  pages/
    LoginPage, DashboardPage, BillingPage (create/edit), BillDetailPage (payment + history),
    GeneratedBillsPage, ReceptionistsPage, TaxSettingsPage
  types/
    api.ts        # response/request TypeScript types mirroring the backend shapes above
  utils/
    money.ts       # paise <-> rupee DISPLAY formatting only (not calculation — see note below)
    datetime.ts     # UTC -> Asia/Kolkata display formatting
```

**Important distinction:** `utils/money.ts` formats a server-computed integer-paise number as
`"₹520.00"` for display, and converts a receptionist's typed `"520.00"` rupee input into integer
paise *before sending it to the API* (e.g., a medicine's unit price field). Both are unit
conversion/formatting, not billing math — the frontend never computes a subtotal, tax amount,
rounding adjustment, or grand total itself; every one of those numbers always comes from the
`/preview` or create/edit response.

## Screen flow

```
/login ──(signup link, bootstrap-only)──> first-run signup form
  │
  ├─(admin)──> /dashboard (default) ─┬─> /bills?status=...&date=...  (card click-through)
  │                                   ├─> /receptionists (manage staff)
  │                                   └─> /settings/tax
  │
  └─(receptionist)──> /bills (default — "generated bills")
                        │
  both roles ───────────┼─> /bills/new  (create bill)
                         ├─> /bills/:id  (detail: edit-if-UNPAID, payment, history, receipt view)
                         └─> /bills/:id/cancel  (admin-only action on the detail page, not a route)
```

- **Route guards**: unauthenticated → redirect to `/login`. Authenticated but wrong role for an
  admin-only page (`/dashboard`, `/receptionists`, `/settings/tax`) → redirect to `/bills` rather
  than showing a 403 page, since a receptionist hitting these isn't an error state, just the wrong
  landing page for their role.
- **Auth state**: `AuthContext` calls `GET /api/auth/me` once on app load. Nothing auth-related ever
  touches `localStorage`/`sessionStorage` (matches the approved auth architecture's explicit
  requirement) — the session cookie is httpOnly and invisible to JS by design.
- **`/bills` (Generated Bills)**: calls `GET /api/bills` with no status filter (the API only accepts
  one status value, not a set, so asking for "UNPAID or PARTIALLY_PAID" in one call isn't possible
  today) and filters client-side to `UNPAID`/`PARTIALLY_PAID` only (confirmed: `CANCELLED` is
  excluded, same as `PAID`). This is presentational list-filtering on already-fetched data, not a
  billing calculation, so it doesn't need a backend change or violate "don't duplicate calculations."
- **`/dashboard`**: cards for revenue + 5 counts; clicking a count card navigates to `/bills` with
  that status (and the dashboard's selected date, if any) pre-filled as query params — reuses the
  existing `GET /api/bills` filters directly, no new endpoint.
- **Bill creation (`/bills/new`)**: patient name/phone, repeatable medicine item rows (name, unit
  type dropdown from the fixed `MEDICINE_UNIT_TYPES` list, quantity, unit price), consultation fee.
  Debounced calls to `POST /api/bills/preview` as the form changes, rendering subtotal/tax (only
  if `taxEnabled` in the response)/rounding/grand total live. "Generate Bill" calls the real
  `POST /api/bills` (surfacing the duplicate-warning 409 with a "submit anyway" confirm step,
  matching the approved warn-then-confirm design) and navigates to the bill detail/payment page.
- **Bill detail (`/bills/:id`)**: shows the bill (editable only while `UNPAID`), payment form (CASH:
  single tendered-amount field, showing server-derived applied/change after submit; UPI: amount +
  optional reference, partials allowed), payment history list, current status, and a print-friendly
  receipt view.
- **Receipt/print view**: a dedicated, printer-*independent* layout — a plain, semantic HTML view
  styled for `window.print()` (works through the OS print dialog with any printer, not a thermal-
  specific integration), built as its own component so a future thermal-specific renderer can be
  swapped in later without touching the data flow. Never renders `patientPhone`, per the confirmed
  requirement.

## Validation & authorization on the client

Per `security.md`, client-side validation is for usability only — the server remains authoritative
(already true; every write endpoint re-validates). The client mirrors the server's simple checks
(required fields, positive integers, known unit types) purely to give immediate feedback, and always
handles the server's `400`/`409` responses as the real source of truth, showing the server's error
message rather than assuming its own pre-check was sufficient.

Role-based UI: admin-only actions (cancel bill, receptionist management, tax settings, dashboard)
are hidden from receptionists in the UI, but this is a UX nicety — the actual enforcement is the
server's existing `requireRole`, unchanged by this task.

## Test strategy

Matches the existing client scaffold's tools (`vitest` + `@testing-library/react`, already
installed): component tests for the money/date formatting utilities (pure functions — exhaustive,
like `billMath.ts`'s own tests), `ProtectedRoute` redirect behavior, and key screen flows (login,
create-bill-with-preview, record-payment) using a mocked `fetch` — no real backend needed for these,
consistent with the frontend never being the source of truth for calculations.

## Confirmed decisions (2026-08-16)

1. **`POST /api/bills/preview` approved** — small, non-persisting addition reusing the existing
   tested `billMath.ts` functions; also resolves tax-visibility for receptionists.
2. **Dev-mode API connectivity: Vite dev-server proxy** — client calls relative `/api/...`, proxied
   to `localhost:4000`, same-origin from the browser's point of view. Worth revisiting once final
   hosting (same-origin vs cross-origin in production) is confirmed with the client — still open in
   `authentication-authorization.md`.
3. **"Generated Bills" excludes `CANCELLED`**, same as `PAID` — the worklist view shows only
   `UNPAID`/`PARTIALLY_PAID` bills; cancelled bills remain reachable via search/history only.
4. **`@tanstack/react-query` approved** for server-state fetching/caching/invalidation.
5. **`react-router-dom` approved** for client-side routing.
6. **`dueAmountInPaise` added to `GET /api/bills` list items (2026-08-16)** — server-computed only,
   via one extra aggregate per page (no N+1); see the contract-addition note above. The Generated
   Bills worklist shows it for `UNPAID`/`PARTIALLY_PAID` rows and hides it for `PAID`/`CANCELLED`
   (the field is still present on those rows, just not surfaced, since a settled or cancelled bill
   has no meaningful outstanding balance to display).
