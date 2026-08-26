# Admin Settings — Approved Architecture

Status: **Approved 2026-08-17. Implemented 2026-08-17** — backend (Phase 3), frontend (Phase 4), and
final verification/security review (Phase 5) all complete. See "Confirmed decisions" at the end for
how the four open questions below were resolved; nothing in this document was changed from what was
proposed and approved — the implementation matches it as written.

Inspected before writing this: `requirements.md`, `security.md`, `docs/architecture/{data-models,
billing-workflow, dashboard-reporting, authentication-authorization, frontend}.md`, the full server
implementation (`ClinicSettings.ts`, `adminSettings.ts`, `clinicSettingsService.ts`, `billService.ts`,
`bills.ts`, `Patient.ts`, `BillSequence.ts`, `session.ts`, `app.ts`, `errorHandler.ts`, `enums.ts`,
`money.ts`, `requireAuth.ts`, `requireRole.ts`, `auditLog.ts`, `AuditLog.ts`, `timezone.ts`), and the
full frontend layer (`api/admin.ts`, `hooks/useAdmin.ts`, `types/api.ts`, `utils/datetime.ts`,
`components/{FormField,Card,Dialog,ConfirmationDialog,Toast}.tsx`, `App.tsx`, `ProtectedRoute.tsx`,
`queryKeys.ts`, `TaxSettingsPage.tsx`), and the existing test files (`adminSettings.test.ts`,
`clinicSettingsService.test.ts`, `ClinicSettings.test.ts`).

## Summary of what already exists

A `ClinicSettings` singleton (`_id: "clinic"`) **already exists** — it currently holds only
`taxEnabled`/`taxRateBasisPoints`/`updatedBy`, served by `GET/PATCH /api/admin/settings`
(Admin-only). This is exactly the model the task asks me to extend, not duplicate.

Everything else in the requested conceptual model (clinic branding, billing behavior toggles,
receipt display, payment-method availability, patient settings, regional display, security) is
**new** — nothing currently persists it, and several of the requested fields don't correspond to any
real backend capability today. Section "Fields I'm proposing NOT to implement as stated" below is the
most important part of this document — please read it before approving.

## Architectural decision: extend, don't duplicate

`clinicSettingsSchema` gets new **sibling top-level paths** alongside the existing `taxEnabled`/
`taxRateBasisPoints` — same document, same `_id: "clinic"`, same collection. The existing tax fields
are untouched: same names, same validation, same default, same owning endpoint.

```ts
// server/src/models/ClinicSettings.ts — extended, not replaced
{
  _id: "clinic",
  taxEnabled: boolean,              // EXISTING — unchanged
  taxRateBasisPoints: number|null,  // EXISTING — unchanged
  updatedBy: ObjectId|null,         // EXISTING — unchanged (now shared by both endpoints)

  clinic: {
    name: string,                    // default: "VMF HEALTH CARE" (matches client/src/constants/clinic.ts today)
    doctorName: string,              // default: ""
    logoUrl: string | null,          // default: null — http(s) URL only, no binary upload (see below)
    phone: string,                   // default: "" — free text, not the strict 10-digit patient-phone format
    email: string,                   // default: "" — validated email shape if non-empty
    website: string,                 // default: "" — validated http(s) URL if non-empty
    address: string,                 // default: "", max 500 chars
    registrationNumber: string,      // default: "", max 50 chars
    gstNumber: string,               // default: "", max 50 chars
  },

  billing: {
    invoicePrefix: string,                    // default: "INV" (matches current hardcoded value)
    allowPartialPayments: boolean,             // default: true (preserves current behavior)
    duplicateWarningEnabled: boolean,          // default: true (preserves current behavior)
    defaultConsultationFeeInPaise: number,     // default: 0
  },

  receipt: {
    showLogo: boolean,               // default: true
    showClinicAddress: boolean,      // default: true
    showClinicPhone: boolean,        // default: true
    showDoctorName: boolean,         // default: true
    showTax: boolean,                // default: true
    showPaymentMethod: boolean,      // default: true
    showPaymentHistory: boolean,     // default: true
    paperSize: 'A4' | 'A5' | 'THERMAL_80MM' | 'THERMAL_58MM',  // default: 'A4'
    footerText: string,              // default: "", max 300 chars
  },

  payments: {
    cashEnabled: boolean,   // default: true
    upiEnabled: boolean,    // default: true
  },

  regional: {
    currencySymbol: string,          // default: "₹", max 5 chars — cosmetic only
    dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD',  // default: 'DD/MM/YYYY'
    timeFormat: '12h' | '24h',       // default: '12h'
  },

  security: {
    sessionTimeoutMinutes: number,   // default: 720 (matches the current hardcoded 12h), range 15-1440
  },

  createdAt, updatedAt   // EXISTING (timestamps: true)
}
```

Every new field is **additive** — no existing field is renamed, retyped, or removed, so nothing
currently reading `taxEnabled`/`taxRateBasisPoints` (billService, TaxSettingsPage) changes at all.
Loading a pre-existing `ClinicSettings` document (which today only has the tax fields) yields Mongoose
schema defaults for every new nested path — no migration script needed, and no data is lost.

## Fields I'm proposing NOT to implement as stated

Four of the conceptually-listed fields either contradict an already-confirmed requirement or don't
correspond to any real backend capability. Implementing them as live, functional toggles would create
exactly the "fake setting" the brief explicitly warns against. I'm flagging each rather than silently
dropping or silently building a non-functional control.

**1. `receipt.showPatientPhone` — proposing to omit entirely, not default-false-but-toggleable.**
`requirements.md` and `security.md` both state, as an already-confirmed requirement: *"the printable
thermal bill must not include the patient's phone number."* `ReceiptView.tsx` already has a code
comment enforcing this: *"Deliberately never renders `patientPhone`, per the confirmed requirement."*
A togglable `showPatientPhone` — even defaulted off — is a control whose entire purpose is to let an
Admin turn on something the project has already confirmed must never happen. I'm proposing this field
is simply not part of the schema or the UI. If you want it, that's a requirements change to
`requirements.md`/`security.md` first, not a settings-schema decision.

**2. `patients.requirePhone` — proposing read-only (always on), not a togglable field.**
`Patient.phone` is `required: true` at the schema level, and phone is load-bearing throughout the app:
`findOrCreatePatient`'s dedup key, `Bill.patientPhone` snapshot + index, `GET /api/bills`'s
phone-search, the duplicate-bill-warning check, and the receipt's own patient line. Making phone
truly optional is a real data-model change (nullable `Patient.phone`, nullable `Bill.patientPhone`,
adjusted dedup/search/duplicate-detection logic) — a breaking change to core billing flows, not a
settings toggle. Proposing: show it in the Patient Settings section as a disabled/locked toggle,
permanently on, with copy explaining why ("Always required — phone is part of the core patient
record"). If you want it truly optional, I'll stop and scope that as its own approved change.

**3. `patients.patientIdPrefix` — proposing to omit for v1.**
There is no human-readable "Patient ID" anywhere in the current data model or UI — only Mongo's
internal `_id`, never surfaced to users. A prefix setting for a field that doesn't exist isn't a
settings decision, it's a request for a new feature (a `PatientSequence` model mirroring
`BillSequence`, a new indexed field on `Patient`, and UI to display it). I can build that as a small
follow-up, mirroring `BillSequence`'s exact pattern, if you confirm you want it — flagging it here
rather than inventing the feature silently or shipping a setting that configures nothing.

**4. `payments.card` / `payments.bankTransfer` — proposing to omit, not add as disabled toggles.**
`PAYMENT_METHODS = ["UPI", "CASH"]` is the complete, hard-validated set on the `Payment` model —
there is no card or bank-transfer processing anywhere in this codebase (no gateway integration, no
schema support, `recordPayment` only branches on `"CASH" | "UPI"`). A toggle for a payment method the
backend cannot accept regardless of the toggle's state is the textbook "fake control" the brief warns
against. Payments settings will expose **Cash** and **UPI** only — the two methods that actually
exist end-to-end. Card/bank-transfer support would be a real payments-integration project, out of
scope here.

**5. `security.loginProtectionEnabled` — proposing read-only display, not a stored/togglable field.**
Login already has IP-based rate limiting (`express-rate-limit`, always on, per
`authentication-authorization.md` §12) — brute-force protection already exists and is **not**
optional today. Storing a boolean that an Admin could flip to *disable* it would let a settings change
silently weaken login security — the opposite of what a "security settings" section should allow.
Proposing: show a static, non-editable row — "Login protection: Always on (rate-limited login
attempts)" — sourced from a constant in the code, not the database. `sessionTimeoutMinutes` (below)
remains the one real, editable security setting.

## The one security field that *is* real: `sessionTimeoutMinutes`

`express-session`'s `cookie.maxAge` is currently a hardcoded constant
(`SESSION_MAX_AGE_MS = 12h` in `session.ts`), applied once when the session middleware is constructed
at server boot — not naturally re-readable per request. To make this setting **actually** affect
session behavior (not just look like it does), I'm proposing a small addition: a lightweight
middleware, mounted once after the session middleware in `app.ts`, that reads the current
`sessionTimeoutMinutes` from an in-process cache (refreshed on every settings write, avoiding a DB
read per request) and assigns it to `req.session.cookie.maxAge` before the route handler runs. Since
the session is `rolling: true` already, this means the very next settings save takes effect on
subsequent requests' sliding expiration — genuinely enforced, not decorative. Existing sessions in
flight adopt the new timeout on their next request rather than being force-invalidated immediately
(no abrupt logout on save).

## API design

**Existing `GET/PATCH /api/admin/settings` (tax) is completely unchanged** — same path, same request/
response shape, same behavior, same tests. Per the brief's explicit instruction not to duplicate or
disturb tax configuration.

New, separate endpoint for everything else, since reusing `/api/admin/settings`'s path for a
different response shape would be a breaking change to an already-shipped, already-tested contract:

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/admin/clinic-settings` | Admin only | Read the full extended settings document (all 6 new sections) |
| `PATCH /api/admin/clinic-settings` | Admin only | Partial update — any subset of the 6 sections, each itself partial |
| `GET /api/settings/display` | Admin **or** Receptionist | Read-only, narrow projection: `clinic` + `receipt` + `payments` + `billing.defaultConsultationFeeInPaise` only — see below |

**Why a third endpoint, and why it doesn't violate "only Admin may read settings":** the brief's ADMIN
ACCESS section is about the *settings administration surface* — reading/editing the full
configuration. But the billing workflow itself (Receptionist-facing) genuinely needs a few of these
values to render correctly: which payment methods to offer, what to prefill the consultation fee
with, and what to print on a receipt (clinic name/address/logo, footer, which lines to show). This is
the **same precedent already established in this exact codebase**: `GET /api/admin/settings` (tax) is
Admin-only, yet Receptionists need to know `taxEnabled` to build a bill — solved by
`POST /api/bills/preview` including `taxEnabled` in its response rather than loosening the admin
endpoint's permissions (`frontend.md`, "Tax visibility for Receptionists"). `GET /api/settings/display`
is the same pattern, generalized: a minimal, purpose-built, read-only projection containing nothing
sensitive (no session config, no invoice-prefix/duplicate-warning internals, no `updatedBy`) — not a
backdoor into the admin settings surface. If you'd rather keep this stricter (e.g. bake the needed
fields into `POST /api/bills/preview` and `POST /api/bills/:id/payments` responses instead of a
standalone endpoint), I can do that instead — flagging it as a decision, not assuming.

**Request/response shape** (`GET/PATCH /api/admin/clinic-settings`):

```json
{
  "clinic": { "name": "...", "doctorName": "...", "logoUrl": null, "phone": "...", "email": "...",
              "website": "...", "address": "...", "registrationNumber": "...", "gstNumber": "..." },
  "billing": { "invoicePrefix": "INV", "allowPartialPayments": true,
               "duplicateWarningEnabled": true, "defaultConsultationFeeInPaise": 0 },
  "receipt": { "showLogo": true, "showClinicAddress": true, "showClinicPhone": true,
               "showDoctorName": true, "showTax": true, "showPaymentMethod": true,
               "showPaymentHistory": true, "paperSize": "A4", "footerText": "" },
  "payments": { "cashEnabled": true, "upiEnabled": true },
  "regional": { "currencySymbol": "₹", "dateFormat": "DD/MM/YYYY", "timeFormat": "12h" },
  "security": { "sessionTimeoutMinutes": 720 }
}
```

`PATCH` accepts the same shape with any subset of top-level sections, and any subset of fields within
each section present — e.g. `{ "clinic": { "name": "New Name" } }` updates only that one field,
leaving every other field (including the rest of `clinic`) untouched. Implemented as a deep partial
merge in the service layer (never a raw `Object.assign`/spread of `req.body` into the document), so a
partial update can never blow away sibling fields.

**Validation (mirrors the existing tax-endpoint style — explicit whitelist extraction + typed checks,
never a raw spread of `req.body`):**

| Field | Rule |
|---|---|
| `clinic.name`, `doctorName` | string, ≤200/150 chars |
| `clinic.logoUrl`, `website` | `http://`/`https://` URL if non-empty, else `null`/`""`; ≤500 chars |
| `clinic.email` | simple email-shape regex if non-empty; ≤200 chars |
| `clinic.phone` | string, ≤30 chars (not the strict 10-digit patient-phone rule — clinic lines vary) |
| `clinic.address` | string, ≤500 chars |
| `clinic.registrationNumber`, `gstNumber` | string, ≤50 chars |
| `billing.invoicePrefix` | `^[A-Z0-9]{1,10}$` |
| `billing.defaultConsultationFeeInPaise` | non-negative integer |
| `billing.allowPartialPayments`, `duplicateWarningEnabled` | boolean |
| `receipt.show*` | boolean |
| `receipt.paperSize` | one of the 4 enum values |
| `receipt.footerText` | string, ≤300 chars |
| `payments.cashEnabled`, `upiEnabled` | boolean; **reject the whole PATCH with 400 if both would end up false** — there must always be at least one usable payment method |
| `regional.currencySymbol` | string, 1-5 chars |
| `regional.dateFormat`, `timeFormat` | one of the enum values |
| `security.sessionTimeoutMinutes` | integer, 15-1440 |

Unknown top-level keys and unknown keys within a section are silently ignored (not a 400) — matching
the existing tax-PATCH handler's own convention of destructuring only known fields.

Every new validator is a small, explicit function (URL check, email check, length check, enum check) —
no `req.body` is ever spread directly into a Mongoose update or query, so Mongo-operator injection
(`$where`, `$gt`, etc. smuggled in as a field value) is structurally impossible the same way it
already is for the tax endpoint.

## `regional.timezone` / `regional.currency` — intentionally not configurable at all

Per the brief's own guidance ("consider making timezone/currency read-only... rather than allowing
arbitrary combinations"): the entire backend is hard-built on Asia/Kolkata arithmetic
(`getKolkataDateKey`, `getKolkataDayRangeUtc`, invoice-number date keys, dashboard day boundaries) and
INR/paise money representation. These are not stored as settings at all — not even as read-only
schema fields — they're simply not present in the document, and the Settings UI shows them as fixed
text ("Asia/Kolkata", "INR"), not disabled form controls, so there's no field a future
change could accidentally make writable. `currencySymbol` (cosmetic — feeds `formatPaise`'s `₹`
prefix) and `dateFormat`/`timeFormat` (cosmetic — feed the client's existing `formatDateIst`/
`formatDateTimeIst`) are the only regional fields that exist, and both are purely
presentational: they change how an already-correct UTC instant is displayed, never how it's stored,
compared, or bucketed into a reporting day.

## Backend integration points — what actually changes behavior

1. **`billService.createBill`** — reads `billing.invoicePrefix` (passed into `formatBillNumber`
   instead of the hardcoded `"INV-"` prefix; only affects bills issued *after* the setting changes —
   already-issued bill numbers are immutable) and `billing.duplicateWarningEnabled` (skips the
   30-second duplicate-check block entirely when false, same as it does today when a match isn't
   found).
2. **`billService.recordPayment`** — reads `billing.allowPartialPayments` (rejects with a new
   `PartialPaymentsDisabledError` → `409` if the computed applied amount would leave the bill anything
   but fully paid, while `allowPartialPayments` is false) and `payments.{cashEnabled,upiEnabled}`
   (rejects with a new `PaymentMethodDisabledError` → `400` if `input.method` is currently disabled).
   Both checks run **inside** the existing transaction, alongside the existing overpayment check —
   never a separate, racy read.
3. **New session-timeout middleware** (`app.ts`, after `createSessionMiddleware`) — sets
   `req.session.cookie.maxAge` from the cached `security.sessionTimeoutMinutes` on every request, as
   described above.
4. **Frontend `BillingPage`** — prefills the consultation-fee input from
   `billing.defaultConsultationFeeInPaise` (via `GET /api/settings/display`) instead of the current
   hardcoded `'0'`. Still fully editable, still validated identically, still server-recomputed —
   this only changes the form's *starting* value.
5. **Frontend `PaymentDialog`** — hides a payment method from the dropdown if `payments.*Enabled` is
   false (mirroring the server's own rejection, so the receptionist never hits a 400 from a method
   the Admin turned off).
6. **Frontend `ReceiptView`** — reads `clinic.*` + `receipt.*` from `GET /api/settings/display` and
   conditionally renders each section; `paperSize` maps to a `receipt--{a4|a5|thermal-80|thermal-58}`
   modifier class with matching `@media print { @page { size: ...; margin: ... } }` rules (new CSS,
   `receipt.paperSize` is the only field that touches the print stylesheet). `patientPhone` continues
   to never render, unconditionally — see the "not implementing" section above.
7. **Frontend `Sidebar`/`AppLayout`** — clinic name shown in the nav/top bar switches from the static
   `CLINIC_NAME` constant to the live `clinic.name` (with the constant kept as the loading-state/
   pre-fetch fallback, so there's no flash of empty text). The **Login page keeps the static
   constant** — it's pre-authentication, and `GET /api/settings/display` requires a session; making
   branding dynamic on the login screen would need a genuinely public, unauthenticated endpoint, which
   is a larger surface-area decision I'm not making unilaterally. Flagging as optional future work,
   not doing it now.

Nothing else changes. `calculateBillTotals`, `calculateCashApplication`, tax calculation, rounding,
and every other piece of `billMath.ts` are untouched — no setting in this document ever reaches the
money-calculation code path.

## Audit logging

New event type: `admin_settings_updated`. Payload: `{ sections: string[], before: {...}, after: {...} }`
— `sections` lists which top-level sections were part of the request; `before`/`after` are the
changed sections only (not the whole document), built from the same named-field extraction as the
request validation (never a raw document spread), so nothing beyond these plain config values can
ever end up in an audit payload. None of these fields are secrets, so no redaction logic is needed —
unlike the account/password audit events, there's nothing here that *could* leak a credential.

The existing `tax_settings_updated` event, fired by the unchanged tax endpoint, is untouched.

## Frontend structure

```
client/src/
  api/
    settings.ts          # new: fetchClinicSettings, updateClinicSettings, fetchDisplaySettings
  hooks/
    useAdmin.ts           # extended: useClinicSettings(), useUpdateClinicSettings(), useDisplaySettings()
  types/
    api.ts                 # extended: ClinicSettings, ClinicSettingsSection types, DisplaySettings
  components/
    Switch.tsx             # new: Material 3-style toggle switch (currently only a plain checkbox exists)
    SettingsNav.tsx         # new: section list (desktop sidebar / mobile selector)
  pages/
    settings/
      SettingsPage.tsx          # new: layout shell + section routing (mirrors AppLayout's sidebar+content shape)
      ClinicInfoSection.tsx     # new
      BillingSettingsSection.tsx    # new
      ReceiptSettingsSection.tsx    # new
      PaymentSettingsSection.tsx    # new
      PatientSettingsSection.tsx    # new
      RegionalSettingsSection.tsx   # new
      SecuritySettingsSection.tsx   # new
```

**Routing**: `/settings` (new, Admin-only, redirects to `/settings/clinic`), with each section as its
own path (`/settings/clinic`, `/settings/billing`, `/settings/receipt`, `/settings/payments`,
`/settings/patients`, `/settings/regional`, `/settings/security`) — so the section nav is real
navigation (shareable/refreshable URLs, back-button friendly), matching how `/settings/tax` already
works today. `/settings/tax` itself is unchanged; the new Settings page's nav includes a "Tax" entry
that's a plain link to the existing `/settings/tax` route (per the brief: "Tax configuration is
managed separately"), not a re-hosted copy of that page.

**One form per section, not one giant form** — each section component owns its own local edit state
(seeded from the query), its own dirty-tracking, and its own Save button, matching the per-page (not
per-app) save pattern `TaxSettingsPage` already uses. Save calls `PATCH /api/admin/clinic-settings`
with only that section's key (`{ clinic: {...} }`), keeping partial-update semantics meaningful and
avoiding one section's in-progress edits silently overwriting another's saved state if two tabs are
open. `queryClient.setQueryData` updates the shared `clinicSettings` query on success (same pattern
`useUpdateTaxSettings` already uses), so switching sections never shows stale data, and no extra
refetch is needed. `useDisplaySettings()`'s query is invalidated too, so `BillingPage`/`PaymentDialog`/
`ReceiptView` pick up the change without a manual refresh.

**New `Switch` component**: the brief's mockups show toggle switches; today only a plain
`<input type="checkbox">` exists (`TaxSettingsPage`'s "Apply tax to new bills"). A small, reusable
Material 3-style switch (checkbox semantics underneath, for accessibility — `role` stays native, no
custom ARIA reinvention) is proposed as the one genuinely new UI primitive this task needs; every
other requirement (Card, Button, FormField, Dialog, Toast, StatusBadge) reuses what already exists.

**Unsaved-changes protection**: each section wraps its dirty state with a `beforeunload`/route-change
guard (a small new `useUnsavedChangesGuard(isDirty)` hook), reusing the browser-navigation-block
pattern rather than inventing a bespoke one — consistent with "prevent accidental data loss."

**Logo handling**: `clinic.logoUrl` is a plain URL string field (`TextField`, `type="url"`), rendered
as a live `<img>` preview in the Clinic Information section once it parses as `http(s)`. No file
upload, no binary storage, no new dependency — matches the brief's explicit steer ("a safe URL/
reference-based logo may be preferable... do NOT introduce an external image-upload service unless
the project already uses one" — it doesn't). Invalid/unreachable URLs fail open (broken-image icon,
not a form error) since the server can't verify image reachability without an outbound fetch, which
introduces SSRF surface I'm not proposing to add.

## Security review (per the brief's explicit checklist)

- **Authorization**: `GET/PATCH /api/admin/clinic-settings` uses the exact same
  `requireAuth, requireRole("admin")` composition already proven on every other admin route.
  `GET /api/settings/display` uses `requireAuth, requireRole("admin", "receptionist")` — read-only,
  no PATCH exists on this path. A Receptionist hitting either write path gets `403` from the existing
  middleware, not a hand-rolled check.
- **CSRF**: unchanged from the rest of the app — same-origin dev proxy, `sameSite: 'lax'` cookie,
  no new cross-origin surface introduced by this feature.
- **Input validation / Mongo injection**: every field is extracted by name and type-checked before
  use; nothing from `req.body` is ever spread into a query or update document (see API design above).
- **XSS**: `clinic.name`/`footerText`/etc. are rendered as React text content (auto-escaped) in
  `ReceiptView`, `Sidebar`, `TopBar` — never `dangerouslySetInnerHTML`. `logoUrl` is only ever used as
  an `<img src>` attribute (browser-fetched, not executed).
- **URL validation**: `logoUrl`/`website` restricted to `http`/`https` schemes only, rejecting
  `javascript:`/`data:`/other schemes that could be abused if a field were ever rendered as a link.
- **Financial integrity**: no setting is read by `billMath.ts`, and no setting can alter a stored
  bill's `subtotalInPaise`/`taxAmountInPaise`/`grandTotalInPaise` calculation. The two settings that
  touch payment behavior (`allowPartialPayments`, `payments.*Enabled`) are enforced **inside** the
  existing payment transaction, alongside the existing overpayment check — the client's copy of these
  settings is UI convenience only (hiding a disabled option), never the actual authorization boundary.
- **Privilege escalation**: no setting can change a user's role, create/delete an account, or bypass
  `requireRole`. `security.sessionTimeoutMinutes` can only shorten or lengthen how long an *already
  otherwise-valid* session lasts — it cannot forge or extend authorization for an invalid one.
- **Sensitive data exposure**: `GET /api/settings/display`'s projection is enumerated explicitly
  (never "all fields except X") — `security`, `billing.invoicePrefix`, `billing.duplicateWarningEnabled`,
  and `updatedBy` are never included in that response.
- **Audit logging**: covered above — safe fields only, no secrets possible.

## Test strategy

**Backend** (mirrors `adminSettings.test.ts`'s existing structure):
- Admin GET/PATCH `clinic-settings` succeed; Receptionist gets 403 on both; unauthenticated gets 401.
- Receptionist **can** GET `settings/display`; gets only the documented subset (assert `security` and
  `billing.invoicePrefix` are absent from the response body).
- Defaults match this document when no settings doc exists yet.
- Partial update: patching only `{ clinic: { name } }` leaves every other field, including sibling
  `clinic.*` fields, unchanged — read back and assert.
- Rejection cases: invalid `paperSize` enum value, negative `defaultConsultationFeeInPaise`,
  non-integer `sessionTimeoutMinutes`, out-of-range `sessionTimeoutMinutes`, malformed `logoUrl`/
  `website` (non-http(s) scheme), both `cashEnabled`/`upiEnabled` false in one request, `invoicePrefix`
  with lowercase/symbols outside `[A-Z0-9]`.
- Unknown top-level/nested keys are ignored, not rejected (matches existing tax-endpoint behavior) —
  assert the response doesn't include them and doesn't error.
- Settings survive reload: write, re-fetch a fresh app/db connection equivalent, confirm persistence.
- Existing tax fields are unaffected by a `clinic-settings` PATCH, and vice versa.
- Audit log: `admin_settings_updated` recorded with the correct `sections` list and no secret fields.
- **Behavioral tests, not just document-shape tests** (per the brief's explicit instruction to verify
  real effects):
  - `duplicateWarningEnabled: false` → creating two near-identical bills back-to-back does **not**
    return a 409.
  - `allowPartialPayments: false` → a CASH payment for less than the due amount is rejected 409; a
    UPI payment for less than due amount is rejected 409; a payment for the exact due amount still
    succeeds.
  - `payments.upiEnabled: false` → `POST .../payments` with `method: "UPI"` is rejected 400, `CASH`
    still succeeds.
  - `billing.invoicePrefix: "CLN"` → the next bill created gets a `CLN-...` number; a bill created
    *before* the prefix change keeps its original `INV-...` number.
  - `security.sessionTimeoutMinutes` changed → a subsequent request's session cookie reflects the new
    `maxAge` (inspect the `Set-Cookie` header or the session store's TTL field).

**Frontend**:
- Admin can navigate to `/settings` and each section; Receptionist is redirected away (same
  `ProtectedRoute allowedRoles` pattern already used for `/dashboard`/`/receptionists`/`/settings/tax`).
- Each section: loading state, error state, load-and-display current values, edit + Save + success
  toast, Save failure keeps the error visible and the form editable, Save disabled while pending,
  Reset/Cancel discards local edits back to the last-saved query data.
- Unsaved-changes guard blocks/prompts on navigating away with a dirty form; does not block when clean.
- Validation errors render inline per field (mirrors `TaxSettingsPage`'s existing
  `error={!rateValid ? '...' : undefined}` pattern).
- `Switch` component: keyboard-operable (Space/Enter toggles), correct checked state, disabled state
  renders non-interactive (for the two read-only rows above).
- `BillingPage` consultation-fee field is prefilled from `defaultConsultationFeeInPaise` on first
  render and remains freely editable afterward.
- `PaymentDialog` hides a disabled payment method from the dropdown.
- `ReceiptView` respects each `show*` toggle and `paperSize`; `patientPhone` never renders regardless
  of any setting (regression-style assertion, since this is the one field intentionally excluded from
  the whole feature).

**Regression**: full existing suite (213 server / 37 client as of the last verified run) must stay
green — nothing above touches `billMath.ts`, auth/session core logic (only adds a `maxAge` reassignment
after the existing session is already resolved), the tax endpoint, receptionist management, or
dashboard aggregation.

## Migration / backward compatibility

None needed. Every new field is additive with a schema default; an existing `ClinicSettings` document
(today, tax-only) continues to load correctly, with every new section resolving to its default the
first time it's read. No script, no backfill, no downtime.

## Confirmed decisions (2026-08-17)

The four open questions above were resolved exactly as proposed, with no scope changes:

1. **`GET /api/settings/display`** — implemented as a standalone endpoint, exactly as proposed.
2. **`patients.patientIdPrefix`** — omitted. No `PatientSequence` model was built; `PatientSettingsSection`
   is a read-only page with a locked "phone required" indicator and no ID-prefix control of any kind.
3. **Endpoint naming** — `/api/admin/clinic-settings` used as specified.
4. **All five "not implementing as stated" exclusions kept exactly as documented** — in particular,
   `showPatientPhone` was not added anywhere (schema, API, or UI); `ReceiptView` continues to never
   render `patientPhone`, unconditionally, regardless of any setting.

## Post-implementation notes (Phase 5 verification)

- A real-browser smoke test caught one genuine bug not visible in jsdom-based component tests: the
  `Switch` component's decorative track/thumb elements visually cover the underlying checkbox input,
  and without `pointer-events: none` on them, a real mouse click lands on the track instead of the
  input and never toggles it. jsdom's `fireEvent.click()` dispatches directly to the target node
  without real hit-testing, so this passed every unit test while being broken for an actual user.
  Fixed in `global.css` (`.switch__track { pointer-events: none; }`); covered going forward by the
  Playwright smoke test, since this class of bug isn't reachable from jsdom-based tests.
- No other implementation deviations from this document were found during the Phase 5 review.
