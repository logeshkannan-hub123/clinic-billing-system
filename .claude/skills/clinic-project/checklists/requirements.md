# Product Requirements — Clinic Billing System

This document captures the client's current requirements as reported by the developer. It is a working specification, not a substitute for client confirmation.

## Roles

### Doctor/Admin

- Exactly one admin user.
- Admin can access dashboard, billing, and generated bills.
- Admin dashboard includes revenue/bill/payment summaries and historical search.

### Receptionist

- Multiple receptionist accounts are allowed.
- Receptionist logs in and accesses the billing workflow and generated bills.

## Authentication

### Login

Fields/actions:

- username
- password
- signup button

### Receptionist signup

Fields:

- staff_id
- username
- password

Unresolved: who is authorized to create receptionist accounts, whether staff IDs must be unique, password policy, account activation/deactivation, and whether admin login is seeded/configured outside signup.

## Receptionist billing page

Required information/actions currently requested:

- date and time — automatically generated;
- patient name;
- patient phone number;
- medicine field;
- add medicine button;
- consultation fee;
- subtotal;
- rounded adjustment;
- grand total;
- print bill button;
- generate bill button;
- generated bills button at the top.

### Print bill behavior

- Print the bill to the clinic's thermal printer.
- Patient phone number must not appear on the printed bill.
- Printer may be connected by Bluetooth or wire.

Unresolved: exact printer model, connection method, operating system/device, print protocol, paper width, receipt layout, medicine fields (name/quantity/unit price/line total), currency, tax/discount rules, invoice numbering, and whether printing is possible directly from the chosen client environment.

### Generate bill behavior

- Persist the bill.
- Open the payment page directly after generation.

Unresolved: whether a bill is considered “generated” before payment, exact status values, duplicate generation behavior, and whether generated bills can be edited/cancelled.

## Generated bills page

List generated bills with:

- bill_id;
- patient name;
- patient phone number;
- date and time.

Selecting a bill opens its payment page.

Bill lifecycle requirement:

- fully paid bill is removed from the generated-bills list;
- partially paid bill remains and shows a due tag.

Unresolved: whether unpaid/partially paid/fully paid statuses are exactly the intended state machine, whether cancelled/refunded states are needed, and what happens to historical records after full payment.

## Payment page

Show bill details.

Payment method dropdown:

- UPI
- Cash

### UPI

- amount field;
- submit button.

Unresolved: whether the amount must equal the due amount, whether partial UPI payments are allowed, whether a UPI transaction/reference ID is required, and whether payment verification is manual or integrated.

### Cash

- amount field;
- tendered amount field;
- submit button.

Behavior:

- tendered amount greater than amount → show return/change amount;
- tendered amount less than amount → show due amount;
- exact amount → fully paid.

Unresolved: whether cash partial payments are allowed, whether tendered amount is stored, and how multiple payments are represented.

## Admin dashboard

Top navigation/tabs:

- dashboard;
- billing;
- generated bills.

Dashboard cards:

- today's revenue;
- generated bills count;
- paid bills count;
- pending bills count;
- partially paid bills count.

Historical records action:

- “See previous records” button.
- Search/filter by date.
- Search/filter by phone number or patient name.

Expected behavior:

- date search → show dashboard details for the selected date;
- phone/name search → show all bills for matching patient(s).

Card navigation:

- generated bills card → generated bills list;
- paid bills card → paid bills list;
- pending bills card → pending bills list;
- partially paid bills card → partially paid bills list.

Unresolved: definition of “today”, timezone, whether generated count means all generated or currently unpaid, exact pending status, whether multiple matches are grouped, pagination, sorting, and whether reports include refunds/cancellations.

## Core acceptance flow

Receptionist:

`Login → Billing → Generate Bill → Payment → status updated → generated list updated`

Admin:

`Login → Dashboard → inspect today's metrics/history → open bill/payment lists → use billing/generated bills when needed`

## Implementation note (2026-08-15)

Bill cancellation is currently scoped to `UNPAID` bills only (no payment ever recorded). Cancelling a
`PARTIALLY_PAID` or `PAID` bill is not implemented until a refund/financial-adjustment rule is
confirmed — this narrows the "Admin can cancel bills" requirement above until that follow-up
question is answered. See `docs/architecture/data-models.md` for the full data model and the
storage-monitoring/export architecture in `docs/architecture/storage-monitoring-export.md`.

## Requirements that must be confirmed before implementation

1. Exact bill data model and medicine line-item structure.
2. Currency and decimal/rounding rules.
3. Tax/discount requirements, if any.
4. Bill/invoice numbering format.
5. Payment status state machine.
6. Whether partial payments are allowed for both cash and UPI.
7. Whether multiple payments per bill are stored as payment records.
8. Whether a fully paid bill remains in a separate historical list (recommended) even though it disappears from the generated/unpaid list.
9. Exact thermal printer model, OS/device, connection, and protocol.
10. Authentication/account creation rules.
11. Data retention, backup, and deployment environment.
12. Any legal/compliance requirements applicable to the clinic's jurisdiction.


Storage Monitoring, Backup Export & Admin Notification

The system must monitor MongoDB Atlas storage usage.

The configured database storage limit is currently 500 MB.

When database storage usage reaches or exceeds 80% of the configured limit
(currently 400 MB), the system must trigger a storage warning workflow.

Workflow:

MongoDB storage reaches 80%
        ↓
Storage warning is triggered
        ↓
Admin/Doctor is notified
        ↓
A secure data export is generated
        ↓
The export is stored securely
        ↓
The Admin/Doctor receives a notification containing a secure way
to access/download the export

Requirements:

1. The system must NEVER automatically delete billing or patient records
   because the storage threshold has been reached.

2. The 80% threshold must be configurable and must not be hard-coded.

3. The system must notify the Admin/Doctor that database storage is
   approaching its configured limit.

4. The export must contain the approved clinic business data required
   for backup/recovery, including billing, patient, and payment records
   as defined by the project's data-export specification.

5. The export must NOT contain:
   - passwords
   - authentication secrets
   - API keys
   - database credentials
   - environment variables
   - unnecessary internal system data

6. The exported data contains sensitive clinic/patient information.
   Therefore, the export must be stored and accessed securely.

7. The Admin/Doctor must receive a notification when the export is
   successfully generated and stored.

8. The notification should provide a secure download/access mechanism
   rather than exposing sensitive data directly in the email.

9. The system must record an audit event for:
   - storage threshold reached
   - export started
   - export completed successfully
   - export failed
   - notification sent
   - notification failed

10. If export generation or notification fails, the system must not
    assume the backup succeeded. The Admin/Doctor must be notified
    of the failure.

11. The system must not automatically delete, archive, or modify
    database records after generating the export.

12. The clinic's data-retention period and final archival/deletion
    policy must be confirmed separately with the clinic.

13. Before implementing this workflow, Claude must identify and explain
    the proposed storage-monitoring, export, secure-storage, and
    notification architecture and wait for explicit approval.




## Deployment & Compliance

Proposed deployment:
Cloud-hosted application with MongoDB Atlas.

Final hosting architecture:
TO BE CONFIRMED with the clinic.

Compliance:
The clinic must identify its operating jurisdiction and any applicable
healthcare, patient-privacy, payment-data, data-retention, and
data-localization requirements.

The development team must not provide legal/compliance certification.

Before production deployment, the clinic should obtain appropriate
professional advice where required and provide the development team
with the applicable requirements.

The application must implement reasonable technical security controls
based on the confirmed requirements.