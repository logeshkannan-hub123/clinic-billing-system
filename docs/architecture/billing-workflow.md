# Billing Workflow — Approved Architecture

Status: **Approved 2026-08-15. Not yet implemented — see "Confirmed decisions" at the end.**

Inspected before writing this: `requirements.md`, `docs/architecture/data-models.md`,
`docs/architecture/authentication-authorization.md`, `security.md`, the `Bill`/`Patient`/`Payment`/
`BillSequence`/`User`/`AuditLog` models, and the current auth middleware/routes.

## New model: `ClinicSettings` (needed — doesn't exist yet)

Nothing currently stores the Admin-controlled tax config. `Bill.taxEnabled`/`taxRateBasisPoints`
are per-bill *snapshots* (correctly, per `data-models.md`), but something has to hold the live,
editable value the Admin sets. Proposed singleton document:

| field | type | notes |
|---|---|---|
| _id | string, fixed value `"clinic"` | singleton pattern, same idea as `BillSequence`'s date-keyed `_id` |
| taxEnabled | boolean, default false | |
| taxRateBasisPoints | integer, nullable | required when enabled, unset when disabled — same rule already enforced on `Bill` |
| updatedBy | ObjectId ref User, nullable | |
| timestamps | createdAt/updatedAt (UTC) | |

`GET/PATCH /api/admin/settings` (Admin-only) reads/writes it; bill creation/edit reads it once per
request to snapshot the current value onto the bill.

## API endpoints

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/bills` | Admin or Receptionist | Create a bill (patient lookup-or-create, compute totals, allocate bill number) |
| `PATCH /api/bills/:id` | Admin or Receptionist | Edit a bill — **only while `UNPAID`** |
| `PATCH /api/bills/:id/cancel` | Admin only | Cancel a bill — **only while `UNPAID`** (per the existing documented restriction) |
| `POST /api/bills/:id/payments` | Admin or Receptionist | Record a payment (cash or UPI) |
| `GET /api/bills` | Admin or Receptionist | List/search bills — status, date, phone/name filters |
| `GET /api/bills/:id` | Admin or Receptionist | Bill detail, including its payment history |
| `GET /api/admin/settings` | Admin only | Read current tax config |
| `PATCH /api/admin/settings` | Admin only | Update tax config |

Explicitly **out of scope for this task**: the Admin dashboard's aggregate summary cards
(today's revenue/counts) — that's a reporting/aggregation feature layered on top of `GET /api/bills`,
better scoped as its own "Admin Dashboard" task. This task covers bill creation, lifecycle, payments,
and list/search retrieval only.

## Request/response shapes

**`POST /api/bills`** and **`PATCH /api/bills/:id`** (same body shape — edit re-runs the full
calculation):

```json
{
  "patientName": "Asha Rao",
  "patientPhone": "9876543210",
  "items": [
    { "medicineName": "Paracetamol", "unitType": "tablet", "quantity": 10, "unitPriceInPaise": 200 }
  ],
  "consultationFeeInPaise": 50000
}
```

Note: the client never sends `lineTotalInPaise`, `subtotalInPaise`, `taxAmountInPaise`,
`roundingAdjustmentInPaise`, or `grandTotalInPaise` — the server computes all of them, always
(security.md: never trust a client-provided total the server can compute itself). Response is the
full `Bill` document.

**`POST /api/bills/:id/payments`** — two shapes depending on `method`:

```json
// CASH — receptionist enters only what the patient physically handed over
{ "method": "CASH", "tenderedAmountInPaise": 100000 }

// UPI — receptionist enters the amount actually being charged (partials allowed)
{ "method": "UPI", "amountInPaise": 50000, "upiReference": "TXN123" }
```

Response: `{ payment: Payment, bill: { status, dueAmountInPaise, ... } }`.

**`GET /api/bills`** query params: `status`, `date` (Asia/Kolkata calendar day), `search` (matches
phone or name, flat list, most-recent-first — per the confirmed dashboard-search decision),
`limit`/`skip` (basic pagination, not explicitly requested but a low-risk addition to avoid an
unbounded query).

## Confirmed: CASH tendered/change semantics

The receptionist enters only what the patient physically handed over
(`tenderedAmountInPaise`). The server derives everything else, authoritatively, from the bill's
current outstanding balance — the client never sends applied amount or change:

```
currentDue = grandTotalInPaise - sum(existing payments)
appliedAmount = min(tenderedAmountInPaise, currentDue)   // what actually counts toward the bill
changeAmountInPaise = max(0, tenderedAmountInPaise - currentDue)
```

For UPI, the amount the receptionist enters *is* the applied amount directly (no tendered/change
concept) — partial UPI payments are allowed, and `upiReference` stays optional.

Both payment methods support partial payments, and in both cases every derived number (applied
amount, change, resulting bill status, due amount) is computed server-side from the current
database state inside the same transaction that inserts the `Payment` — never trusted from the
client, exactly like subtotal/tax/rounding/grand total on the bill itself.

## Service-layer responsibilities

`server/src/services/billMath.ts` — **pure, no DB access**, so it's exhaustively unit-testable:
- `calculateItemLineTotal(quantity, unitPriceInPaise)`
- `calculateBillTotals(items, consultationFeeInPaise, taxConfig)` → `{ subtotalInPaise,
  taxAmountInPaise, roundingAdjustmentInPaise, grandTotalInPaise }`
- Rounding rule (confirmed): round `subtotal + tax` to the nearest ₹1 (100 paise); exactly ₹0.50
  rounds up. Tax itself (`subtotal × rateBasisPoints ÷ 10000`) is rounded to the nearest paisa
  (standard round-half-up) before the whole-rupee rounding step is applied on top.

`server/src/services/patientService.ts`:
- `findOrCreatePatient(name, phone)` — confirmed match rule: exact (trimmed, case-insensitive name +
  exact phone) match reuses the existing `Patient`; otherwise creates a new one.

`server/src/services/billService.ts` — orchestrates the above plus persistence:
- `createBill(input, actor)` — resolves patient, computes totals via `billMath`, allocates the bill
  number (`getNextBillSequence` + `formatBillNumber`, date key derived from `issuedAt` in
  Asia/Kolkata — new `getKolkataDateKey(date)` util), runs duplicate detection (see below), inserts,
  records `bill_generated`.
- `editBill(billId, input, actor)` — loads the bill, rejects if `status !== "UNPAID"`, re-runs the
  same calculation against the **current** `ClinicSettings` (not the original creation-time
  snapshot — confirmed), updates in place, records `bill_edited` (new event type).
- `cancelBill(billId, actor)` — rejects if `status !== "UNPAID"`, sets `CANCELLED` +
  `cancelledBy`/`cancelledAt`, records `bill_cancelled`.
- `recordPayment(billId, input, actor)` — see concurrency strategy below; records `payment_recorded`.

`server/src/services/clinicSettingsService.ts` — get/update the `ClinicSettings` singleton, records
`tax_settings_updated` (new event type).

## Bill lifecycle / state transitions

```
                 ┌─────────────┐
   create ──────▶│   UNPAID    │──── admin cancel ────▶ CANCELLED (terminal)
                 └──────┬──────┘
                        │ payment (partial)
                        ▼
                 ┌─────────────────┐
                 │ PARTIALLY_PAID  │
                 └──────┬──────────┘
                        │ payment (remainder)
                        ▼
                 ┌─────────────┐
                 │    PAID     │ (terminal)
                 └─────────────┘
```

- `UNPAID → PAID` directly is also valid (single payment covering the full amount).
- Editing is only allowed in `UNPAID`.
- Cancellation is only allowed in `UNPAID` (existing restriction — cancelling `PARTIALLY_PAID`/`PAID`
  needs the refund/financial-adjustment rule that's still an open question with the client).
- `PAID` and `CANCELLED` are terminal for this MVP — no un-cancel, no refund flow.

## Concurrency strategy

Two places need real atomicity, not just careful code:

1. **Bill numbering** — already solved (`BillSequence`'s atomic `$inc`, implemented in the data
   models milestone). If a bill insert fails after the number is allocated, that number is simply
   skipped — invoice numbers are unique and monotonic, not required to be gapless (matches how real
   invoicing systems handle voided attempts).

2. **Payment recording** — this is the one flagged as needing a transaction in `data-models.md`.
   Two payments submitted for the same bill at nearly the same instant must not both succeed if
   together they'd exceed `grandTotalInPaise`. Proposed: a MongoDB multi-document transaction
   (`mongoose.startSession()` + `withTransaction()`) wrapping: re-read the bill + sum existing
   payments, validate `appliedAmount` doesn't exceed the remaining due, insert the `Payment`, update
   `Bill.status`. All within the same session/transaction, so it's atomic and isolated.

   **Environment dependency — checked, confirmed working:** MongoDB transactions require the
   database to run as a replica set — a standalone `mongod` doesn't support them. Verified directly
   against the dev `MONGODB_URI`: it's an Atlas cluster (`atlas-14ls1m-shard-0`), which is always a
   replica set, so transactions work as-is — no environment change needed.

   One implementation detail this does require: `server/src/test/testDb.ts` currently starts
   `mongodb-memory-server` as a standalone instance (fine for everything tested so far, since
   nothing needed transactions yet). It'll need `replSet: { count: 1 }` added so the payment
   concurrency tests can actually exercise real transactions in-memory too — a test-infra tweak, not
   a design question.

Bill creation/edit itself doesn't need a transaction — it's a single-document write (plus an
independent, low-stakes `Patient` lookup-or-create; see the duplicate-Patient note below).

## Duplicate/submission protection

Per the client's answer on this (`checklists/requirements.md` Q13): disable the button client-side,
give every bill a unique id (already true), **warn rather than silently block**, and allow an
authorized user to cancel a duplicate rather than ever silently deleting one. Proposed two-step
flow:

1. On `POST /api/bills`, the server checks for another **non-cancelled** bill by the same
   `createdBy`, same `patientPhone`, and the *same computed `grandTotalInPaise`*, created within the
   last 30 seconds.
2. If found and the request body doesn't include `"confirmDuplicate": true`, respond `409` with
   `{ warning: "possible_duplicate", existingBillId, existingBillNumber }` — nothing is created yet.
3. If the client resubmits with `confirmDuplicate: true` (user confirmed it's intentional), or no
   near-duplicate is found, the bill is created normally. A `duplicate_bill_warning` audit event
   (new event type) is recorded whenever the check trips, noting whether it was confirmed through.

The 30-second window and exact matching criteria (phone + grand total + same creator) are confirmed
as proposed. Bill-number uniqueness stays mandatory regardless — the duplicate check is purely an
advisory warning layered on top, never a substitute for the unique `billNumber` constraint.

**Separately:** two concurrent requests both creating a "new" patient with the same name+phone at
the exact same instant could produce two `Patient` documents for the same person (since `phone`
isn't unique by design). This is a low-probability, low-stakes edge case — a harmless duplicate
`Patient` row, not a money or auth problem — so it's not proposed to be wrapped in a transaction.

## Validation & authorization

- All billing endpoints require `requireAuth`; `requireRole("admin", "receptionist")` for
  create/edit/pay/list/detail; `requireRole("admin")` only for cancel and settings.
- Item validation: `medicineName` non-empty, `unitType` in `MEDICINE_UNIT_TYPES`, `quantity` a
  positive integer, `unitPriceInPaise` a non-negative integer — all already enforced at the schema
  level; the service layer validates the same way before construction so bad requests get a clean
  `400` rather than surfacing a Mongoose validation error.
- `consultationFeeInPaise`: non-negative integer.
- Payment: `amountInPaise` (UPI)/`tenderedAmountInPaise` (CASH) positive integers; method-specific
  fields exactly as the `Payment` schema already enforces.
- Server-computed, never client-trusted, full list: bill line totals, `subtotalInPaise`,
  `taxAmountInPaise`, `roundingAdjustmentInPaise`, `grandTotalInPaise`, `billNumber`, `issuedAt`,
  `status`, `createdBy` — **and, on the payment side**, the applied amount (CASH), change amount
  (CASH), resulting bill status, and remaining due amount. The client supplies raw inputs only
  (items/fees, or tendered/UPI-amount); every derived or aggregate number is calculated
  server-side, inside the same transaction for payments.

## Audit events (new event types needed)

Already exist and get reused: `bill_generated`, `bill_cancelled`, `payment_recorded`. New:

- `bill_edited` — payload: `billId`, `billNumber` (actor already covered by `actorUserId`).
- `duplicate_bill_warning` — payload: `billId` (if created), matched `existingBillId`, whether
  confirmed through.
- `tax_settings_updated` — payload: new `taxEnabled`/`taxRateBasisPoints` values.

All payloads: safe identifiers only (bill id/number, patient id — not name/phone), matching the
existing pattern and `security.md`'s data-minimization guidance.

## Test strategy

- **`billMath.ts`** (pure functions): exhaustive unit tests — zero items, single/multiple items,
  totals that need no rounding, every remainder boundary (1, 49, 50, 51, 99), tax on/off, 0% and
  100% tax rates. This is the one place bad math would silently corrupt real money, so it gets the
  most direct coverage.
- **Service-layer integration tests** (`mongodb-memory-server`, same pattern as the auth milestone):
  patient match-vs-create, bill numbering uniqueness under real concurrent calls (fire N creates in
  parallel, assert N unique numbers), edit-allowed-then-blocked-after-payment, cancellation
  UNPAID-only enforcement, payment math (cash tender/change, UPI partials, overpayment rejection),
  status transitions, duplicate-detection warn-then-confirm.
- **A dedicated concurrency test for payments**: fire two simultaneous payment requests that are
  each individually valid but would jointly overpay — assert the total accepted never exceeds
  `grandTotalInPaise`, proving the transaction actually prevents the race rather than "usually
  works."
- **Route-level tests** (supertest): authorization per role/endpoint, end-to-end flow matching the
  documented acceptance flow (login → create → pay → status updates → list membership changes).

## Confirmed decisions (2026-08-15)

1. **Patient de-duplication** — match existing `Patient` by exact (case-insensitive/trimmed name +
   exact phone); otherwise create new.
2. **Bill edit uses the current tax config** at edit time, not the original creation-time snapshot.
3. **Admin corrections scope** — Admin's edit/cancel powers stay restricted to `UNPAID` bills for
   MVP, same as receptionist edit. No refund/financial-adjustment behavior is invented; correcting a
   bill after payment has begun is deferred to that still-pending client follow-up.
4. **Duplicate-detection window/criteria** — same creator + same phone + same grand total, within 30
   seconds; warn-then-confirm, never a hard block. Bill-number uniqueness remains mandatory
   regardless.
5. **CASH payment semantics** — confirmed: tendered-only input, server derives applied/change/due.
   **UPI** — the entered amount *is* the applied amount; reference stays optional. Partial payments
   are allowed for both methods.
6. **Server-side authority** — confirmed, explicit: the server never trusts client-submitted totals,
   applied amounts, change amounts, subtotal, tax amount, rounding adjustment, or grand total. All
   of that is calculated server-side and re-validated against current database state inside the
   payment transaction.
7. **Transactions** — MongoDB transaction wraps re-checking the current outstanding balance, then
   inserting the payment and updating the bill, atomically. Verified the dev database (Atlas) is a
   replica set, so this works as-is; `mongodb-memory-server` in tests will be started with
   `replSet: { count: 1 }` so the concurrency tests exercise real transactions too.
8. **Pagination** on `GET /api/bills` — simple `limit`/`skip`.
9. **Payment history on bill detail** — `GET /api/bills/:id` includes the bill's payments inline.
