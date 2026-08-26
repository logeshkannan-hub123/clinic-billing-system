# Storage Monitoring & Backup Export — Approved Architecture

Status: **Approved 2026-08-15.** Implementation sequencing below is binding — do not build the
export subsystem before the core data models (Bill, Patient info, Payment, User/Auth, Audit log)
are implemented and approved.

## 1. Storage monitoring

- Scheduled job polls the MongoDB Atlas Administration API (read-only Atlas API credentials).
- Monitoring interval is configurable, not hard-coded.
- Storage limit and warning threshold are configurable, not hard-coded.
- Defaults: 500 MB storage limit, 80% threshold.

## 2. Threshold behavior

- The backup workflow triggers only on the transition from below-threshold to at/above-threshold
  (edge-triggered), not on every cycle while storage remains above threshold.
- Each threshold crossing is recorded in the audit log (`storage_threshold_reached`).

## 3. Export

- Format: XLSX.
- Contains only approved clinic business data: billing, patient, payment, and other explicitly
  approved records.
- Never contains passwords, authentication secrets, API keys, environment variables, database
  credentials, or unnecessary internal system data.
- Exact schema/field list is finalized after the core data models are approved (see Sequencing).

## 4. Object storage

- Exports are stored in private cloud object storage.
- Provider is not yet selected — no provider-specific integration until one is chosen and approved.
- The export service depends on a storage-provider abstraction/adapter interface, so a provider can
  be plugged in later without changing the export service itself.

## 5. Notifications

- Authenticated in-app notifications only.
- Notification content never includes sensitive patient data directly.
- Download happens via an authenticated endpoint, accessible only to authorized Admin users —
  not a link embedded in the notification.

## 6. Audit log

Append-only. Recorded events:

- `storage_threshold_reached`
- `export_started`
- `export_completed`
- `export_failed`
- `notification_sent`
- `notification_failed`

## 7. Data safety

- Never automatically delete billing or patient records due to storage usage.
- Never modify existing billing/payment records as part of this workflow.
- An export failure is never treated as a successful backup — failure paths must notify, not fail
  silently.

## 8. Implementation sequencing (binding order)

1. Core data models first: billing, patient, payment, authorization/auth, audit log. Must be
   proposed and approved before any code is written for them.
2. Only after those models are approved: finalize the exact XLSX export schema and implement the
   export workflow (steps 1–3, 5–7 above).
3. Object-storage provider integration requires a separate stop-and-approve gate once a provider is
   selected — do not implement any provider-specific code before that approval, even after the
   export workflow itself is built (use the storage-adapter interface with a no-op/stub
   implementation until then).
