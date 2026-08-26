# Dashboard & Historical Reporting — Approved Architecture

Status: **Approved 2026-08-16. Not yet implemented — see "Confirmed decisions" at the end.**

Inspected before writing this: `requirements.md` (Admin dashboard section + the confirmed Q26-Q29
answers in `docs/client-questions.md`), `docs/architecture/billing-workflow.md`, `timezone.ts`,
`billService.ts`, and the current `Bill`/`Payment` model index state (checked directly: `Bill` has
only its unique `billNumber` index; `Payment` has only `billId` indexed — nothing supports an
efficient date-range or status aggregation yet).

## What's actually new here

Historical bill **search** (`GET /api/bills` — status/date/phone-name filters, pagination) already
exists from the billing-workflow milestone and needs no new endpoint — "dashboard cards → filtered
bill lists" is just the frontend calling that same endpoint with `status`+`date` query params. The
genuinely new surface is the **aggregate dashboard summary** — today's revenue and the four/five
bill-status counts — which `billing-workflow.md` explicitly scoped out as "its own Admin Dashboard
task." This is that task.

## Endpoint

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/admin/dashboard?date=YYYY-MM-DD` | Admin only | Revenue + status counts for one Kolkata calendar day (defaults to today) |

**Admin-only**, not Admin+Receptionist — per `requirements.md`'s role definitions, the dashboard
page itself belongs to Doctor/Admin; Receptionist's role is scoped to "the billing workflow and
generated bills," which is the already-existing `GET /api/bills`. That endpoint's permissions
(Admin or Receptionist) are unchanged by this task.

## Date-boundary correctness (the part you flagged)

Reusing exactly what already exists and is already tested — not reinventing it:

- `getKolkataDayRangeUtc(isoDate)` (already in `timezone.ts`, already has 6 passing tests covering
  the exact midnight-boundary rollover in both directions) computes the `[startUtc, endUtc)` instant
  range for one Kolkata calendar day. The dashboard query uses this directly against
  `Bill.issuedAt` and `Payment.createdAt` — both already stored as UTC instants.
- New, small addition: `getKolkataTodayIso(now = new Date())` in `timezone.ts`, returning today's
  Kolkata date as `YYYY-MM-DD` (currently `getKolkataDateKey` returns the dash-less `YYYYMMDD` form
  used for bill numbering — this is the same computation, just formatted for the query param/API
  contract instead of the invoice-number contract). Used when no `date` query param is given.
- The critical property this buys: a bill created at `2026-08-15T18:29:59.999Z` (23:59:59.999 IST)
  and one created at `2026-08-15T18:30:00.000Z` (00:00:00.000 IST, the *next* Kolkata day) must land
  in different days' dashboards, even though they're one millisecond apart in UTC. This is exactly
  what `getKolkataDayRangeUtc`'s existing test suite already proves at the utility level — this task
  adds tests proving it holds at the *query* level too (a bill/payment actually lands in the correct
  aggregation).

## Revenue definition — needs your confirmation

Not explicitly specified anywhere in the confirmed requirements. Proposing: **"today's revenue" =
sum of `Payment.amountInPaise` for payments *received* today** (`Payment.createdAt` in today's
Kolkata range), regardless of which day the underlying bill was issued. This is the standard
cash-flow reading of "revenue" (money that actually came in today) — as opposed to summing
`grandTotalInPaise` for bills issued today, which would miss cash collected today against a bill
created yesterday, and would count money not yet received. Flagged as decision #1 below.

## Status counts — reusing the already-confirmed exclusion rule

Per the already-confirmed answer in `client-questions.md` (Q29): *"Cancelled bills remain visible
in historical records but are excluded from revenue, paid-bill, pending-bill, and partially-paid-
bill counts. They may have a separate Cancelled Bills count/filter."* This isn't a new decision —
just applying it here:

- `paidCount`, `pendingCount` (= `UNPAID`), `partiallyPaidCount` — all exclude `CANCELLED`.
- Revenue — excludes payments against bills that were later cancelled (in practice this can't
  currently happen, since cancellation is `UNPAID`-only and a cancelled bill has zero payments by
  construction — noted for completeness, not because it's reachable today).
- `generatedCount` — proposing this counts **all** bills issued that day, including cancelled ones
  (a cancelled bill was still generated; excluding it would make "generated" and "paid + pending +
  partially-paid" not sum to a meaningful total). Flagged as decision #2.
- `cancelledCount` — the client's answer explicitly floats this as a possible separate card.
  Proposing to add it, since the data and query cost are free once the other counts are computed.
  Flagged as decision #3.

## Query strategy — two aggregations, not five separate counts

```
Bill.aggregate([
  { $match: { issuedAt: { $gte: startUtc, $lt: endUtc } } },
  { $group: { _id: "$status", count: { $sum: 1 } } },
])
```
One query returns per-status counts for the day; `generatedCount` is the sum across all statuses.
Requires an index on `issuedAt` (see below) to avoid a full collection scan as bill volume grows.

```
Payment.aggregate([
  { $match: { createdAt: { $gte: startUtc, $lt: endUtc } } },
  { $group: { _id: null, totalInPaise: { $sum: "$amountInPaise" } } },
])
```
Same idea for revenue, against `Payment.createdAt`.

Both run as two total queries regardless of data volume — not N+1, not pulling full documents into
Node to sum in memory.

## New indexes

Checked what exists today (see top) — currently nothing here would scale past a small collection
without a full scan. Proposing:

- `Bill.issuedAt` — powers both the dashboard's per-day aggregation and `GET /api/bills`'s existing
  `date` filter.
- `Bill.status` — powers status-filtered list queries (`GET /api/bills?status=...`) and combines
  with `issuedAt` for the dashboard aggregation; proposing a **compound** `{ status: 1, issuedAt: -1
  }` index, since "list bills of a given status, most recent first" is the actual query shape both
  the dashboard drill-through and the generated-bills view use.
- `Payment.createdAt` — powers the revenue aggregation.
- `Bill.patientPhone` — helps the existing phone/name search partially (exact and prefix matches);
  proposing this one but **not** a text index for `patientName`, since the existing search is
  substring (`contains`), which neither a plain B-tree nor a MongoDB text index accelerates well —
  at clinic scale (hundreds to low thousands of bills, not millions) a scan on this specific field
  is an acceptable tradeoff rather than over-engineering search infrastructure nothing asked for.

## Historical records after payment

No change needed — already true. `GET /api/bills` (existing) queries the `Bill` collection directly
with no status exclusion by default; a `PAID` bill is never deleted or hidden from the underlying
data, only optionally filtered out by the frontend's "generated bills" view (by requesting
`status=UNPAID,PARTIALLY_PAID` or similar). This task doesn't change that.

## Test strategy

- **Date-boundary tests at the query level** (not just the existing utility-level ones): create
  bills/payments with `issuedAt`/`createdAt` set to exact midnight-boundary instants (`18:29:59.999Z`
  and `18:30:00.000Z`) and assert each lands in the correct day's dashboard — proves the boundary
  holds through the actual aggregation, not just the helper function in isolation.
- **Count correctness**: bills in every status (including `CANCELLED`) on the same day, assert each
  count bucket and the exclusion rule.
- **Revenue correctness**: multiple payments (cash + UPI, partial + full) on the same day, assert
  the sum; a payment on a *different* day must not count.
- **Authorization**: Admin-only enforcement on the dashboard endpoint (receptionist gets `403`,
  matching the existing pattern).
- **Search/filter regression**: confirm `GET /api/bills`'s existing status+date+search filters still
  work correctly now that indexes exist (indexes shouldn't change query results, only speed — this
  is a safety check, not new behavior).

## Confirmed decisions (2026-08-16)

1. **Revenue = money received today** — sum of `Payment.amountInPaise` by `Payment.createdAt`, not
   money billed today.
2. **`generatedCount` includes cancelled bills** issued that day (`generatedCount = paidCount +
   pendingCount + partiallyPaidCount + cancelledCount`).
3. **`cancelledCount` is a separate card**, alongside revenue, generated, paid, pending, and
   partially-paid — six figures total on the dashboard response.
4. **All four proposed indexes approved**: `Bill.issuedAt`, compound `Bill.{status: 1, issuedAt:
   -1}`, `Payment.createdAt`, `Bill.patientPhone`.

## Response shape

```json
{
  "date": "2026-08-16",
  "revenueInPaise": 125000,
  "generatedCount": 7,
  "paidCount": 4,
  "pendingCount": 2,
  "partiallyPaidCount": 1,
  "cancelledCount": 0
}
```
