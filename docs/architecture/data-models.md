# Core Data Models — Implemented

Status: **Approved and implemented 2026-08-15.** Code-reviewed the same day; findings and fixes are
in the "Post-implementation code review" section at the end of this document.

## Conventions

- **Money**: integer paise (₹1 = 100), never floating-point. Convert to rupees only at display time.
- **Tax rate**: integer basis points (1 bp = 0.01%; e.g. 500 = 5.00%), never a floating-point
  percentage.
- **Timestamps**: stored in UTC (Mongo/driver default). Converted to Asia/Kolkata only at the
  display layer and for "today" boundary calculations on the dashboard.
- **Medicine unit types**: not a hard schema enum. Stored as a string validated against a
  server-maintained reference list, so new units can be added via config/data rather than a schema
  migration. Initial set: `tablet, capsule, strip, bottle, syrup, injection, tube, sachet, ml, mg,
  unit`.

## Patient

New dedicated model (previously patient data lived only inline on Bill).

| field | type | notes |
|---|---|---|
| name | string | |
| phone | string, indexed (not unique) | not unique — a household/family may share one phone |
| timestamps | createdAt/updatedAt (UTC) | |

Whether bill creation looks up an existing Patient by phone or always creates a new one is a
billing-flow (UI/endpoint) decision, not a data-model decision — deferred to when that endpoint is
planned.

## User

| field | type | notes |
|---|---|---|
| role | `'admin' \| 'receptionist'` | |
| username | string, unique | |
| passwordHash | string | bcrypt, never plaintext |
| staffId | string, unique, required for receptionist | not applicable to admin |
| isActive | boolean, default true | |
| createdBy | ObjectId ref User, nullable | admin who approved this account |
| timestamps | createdAt/updatedAt (UTC) | |

"Exactly one admin" is enforced at the application layer (check-before-create), since MongoDB has
no native "at most one row matching a filter" constraint.

## BillSequence (new — supports concurrency-safe invoice numbering)

| field | type | notes |
|---|---|---|
| _id | string | date key, e.g. `20260815` |
| seq | integer | last-issued sequence number for that date |

Bill numbers are generated via a single atomic `findOneAndUpdate({ _id: dateKey }, { $inc: { seq: 1
} }, { upsert: true, new: true })`. This is atomic per-document in MongoDB, so two receptionists
generating bills at the same instant cannot receive the same number — no read-then-write race.
Resulting bill number: `INV-{dateKey}-{seq, zero-padded to 3 digits}`.

## Bill

| field | type | notes |
|---|---|---|
| billNumber | string, unique | from BillSequence, see above |
| patientId | ObjectId ref Patient | |
| patientName | string | **snapshot** at issuance — historical accuracy if Patient record changes later |
| patientPhone | string | **snapshot** at issuance, same reasoning |
| items | array of `{ medicineName, unitType, quantity, unitPriceInPaise, lineTotalInPaise }` | |
| consultationFeeInPaise | integer | |
| subtotalInPaise | integer | |
| taxEnabled | boolean | |
| taxRateBasisPoints | integer, nullable | snapshot of admin-configured rate at issuance |
| taxAmountInPaise | integer, default 0 | |
| roundingAdjustmentInPaise | integer | can be negative |
| grandTotalInPaise | integer | |
| status | `'UNPAID' \| 'PARTIALLY_PAID' \| 'PAID' \| 'CANCELLED'` | |
| issuedAt | Date (UTC) | explicit business timestamp — the bill's official date/time, used for invoice numbering's date key and dashboard "today" grouping |
| createdBy | ObjectId ref User | receptionist who generated it |
| cancelledBy / cancelledAt | ObjectId ref User / Date, nullable | admin only |
| timestamps | createdAt/updatedAt (UTC) | technical record-keeping, distinct from `issuedAt` |

**Cancellation restriction (new):** cancellation is only permitted while status is `UNPAID` (i.e. no
payment has ever been recorded against the bill). Cancelling a `PARTIALLY_PAID` or `PAID` bill is
**not implemented** until a refund/financial-adjustment rule is confirmed with the client — this
narrows the earlier "Admin can cancel bills" requirement until that follow-up question is answered.

## Payment

| field | type | notes |
|---|---|---|
| billId | ObjectId ref Bill | |
| method | `'UPI' \| 'CASH'` | |
| amountInPaise | integer | |
| tenderedAmountInPaise | integer, nullable | cash only |
| changeAmountInPaise | integer, nullable | cash only, derived |
| upiReference | string, optional | UPI only |
| recordedBy | ObjectId ref User | receptionist |
| timestamps | createdAt (UTC) | |

**Overpayment prevention (new):** before inserting a Payment, the service layer must verify
`sum(existing payments for this bill) + amountInPaise <= bill.grandTotalInPaise`, rejecting the
write otherwise. Overpayment handling is explicitly out of scope for MVP. Because two payments could
be submitted for the same bill at nearly the same instant, this check plus the resulting Payment
insert and Bill status update must happen inside a single MongoDB transaction (or an equivalent
atomic conditional update) — not a plain read-then-write — to avoid a race where both individually
look valid but together exceed the total.

Bill's amount-paid/amount-due are always derived by summing its Payment records — never stored as a
redundant running total.

## AuditLog

Generic, append-only — reused by the storage-monitoring/export subsystem and by billing events.

| field | type | notes |
|---|---|---|
| eventType | string enum | storage/export events (`storage_threshold_reached`, `export_started`, `export_completed`, `export_failed`, `notification_sent`, `notification_failed`) plus billing events (`bill_generated`, `bill_cancelled`, `payment_recorded`) |
| actorUserId | ObjectId ref User, nullable | null for system-triggered events (e.g. the monitor job) |
| payload | object | event-specific details — never secrets |
| timestamps | createdAt (UTC) only | append-only, never updated |

## Relationships

```
User ──< Bill (createdBy, cancelledBy)
User ──< Payment (recordedBy)
Patient ──< Bill (patientId, plus name/phone snapshot on Bill)
Bill ──< Payment (billId)
BillSequence — standalone, keyed by date, not referenced by other models
AuditLog — standalone, optionally references User via actorUserId
```

## Post-implementation code review (2026-08-15)

A review of the implemented models (not just their tests) against this document found 8 gaps —
places where the schema would have accepted data that violated an approved rule, because nothing
checked it. All 8 were fixed the same day, at the schema level, as field-level custom validators
(not `pre('validate')` middleware — those don't run under Mongoose's synchronous `validateSync()`,
which the test suite relies on):

1. **Bill money arithmetic** — `items[].lineTotalInPaise`, `subtotalInPaise`, and
   `grandTotalInPaise` are now validated against `quantity × unitPriceInPaise`, item totals +
   consultation fee, and subtotal + tax + rounding, respectively.
2. **Bill tax consistency** — `taxAmountInPaise` must be 0 when `taxEnabled` is false;
   `taxRateBasisPoints` must be set when `taxEnabled` is true and unset when false.
3. **Bill cancellation coupling** — `cancelledBy`/`cancelledAt` must be set if and only if
   `status === "CANCELLED"`.
4. **Payment method-conditional fields** — `tenderedAmountInPaise` is required for `CASH` and
   forbidden for `UPI`; `changeAmountInPaise` and `upiReference` are similarly method-scoped.
5. **`taxRateBasisPoints` upper bound** — capped at 10000 (100%) via
   `nullableBasisPointsValidator` in `money.ts`.
6. **`User.staffId` sparse-index null collision** — a schema `set()` normalizes an explicit
   `staffId: null` to `undefined`, since MongoDB sparse indexes still index explicit nulls (only a
   truly missing field is excluded), which would otherwise let two admin accounts collide.
7. **`User.username` case sensitivity** — added `lowercase: true`.
8. **`AuditLog.payload`** — documented via code comment that it must never contain secrets/PII,
   since `Mixed` can't enforce this at the schema level; left as a discipline requirement for
   whoever writes audit events later.

Verification: `npm run lint`, `npm run build` (typecheck), and `npm run test` all pass —
34 tests across 7 files (up from 18), including new coverage for all 8 fixes above.
