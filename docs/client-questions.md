# Clinic Billing System — Questions for the Client

These need answers before we can safely build the billing, payment, printing, and account-creation
features. Everything else (login screen layout, page structure, etc.) can proceed in parallel.

## 1. Accounts & login

1. Who is allowed to create a new receptionist account — does the admin approve/create it, or can
   receptionists sign themselves up freely?

# answer : admin approve 
2. Should `staff_id` be unique per receptionist?
# answer : yes
3. Are there any password rules we should enforce (minimum length, etc.)?

# answer:Password must be at least 8 characters. Passwords must be securely hashed and never stored in plaintext.
4. Can a receptionist account be disabled/deactivated later (e.g. if someone leaves)?
# answer:Admin can deactivate/reactivate receptionist accounts. Deactivated users cannot log in, but their historical billing/payment records remain associated with their staff account.
5. Is the one admin account created manually/directly in the system, or through the same signup flow?
# answer:The first account created during initial system setup becomes the single Admin/Doctor account. After the initial Admin account exists, new receptionist accounts cannot self-register. Receptionist accounts can only be created/approved by the Admin.

## 2. Bill contents & numbering

6. For each medicine added to a bill, what exactly should be recorded — just a name, or also
   quantity, unit price, and line total?
# answer : Each medicine line must record medicine name, unit type, quantity, unit price, and calculated line total. The system must support individual units such as tablets, with the exact available unit types to be defined during implementation.
7. What currency does the clinic use? (Assuming INR — confirm.)
# answer: inr with symbol
8. Are there any tax or discount rules that apply to bills?
# answer : Tax is disabled by default. Only the Admin can enable/configure tax. When enabled, the tax must be included in the bill calculation and displayed on the invoice. When disabled, no tax field should appear on the bill. The exact tax rate and calculation method must be configurable by the Admin.
9. How should the rounding adjustment work — round to the nearest whole rupee, nearest 0.50, etc.,
   and should it round up, down, or to the nearest?
   # answer : Round the grand total to the nearest whole INR (₹1). For exactly ₹0.50, round  to ₹1.00.
10. What format should bill/invoice numbers follow (e.g. sequential number, date-based, prefix)?
# annswer : Date + prefix + sequence example :INV-20260815-001 ,INV-20260815-002 ,INV-20260815-003

## 3. Generating a bill

11. Is a bill considered "generated" as soon as it's created (before any payment), or only once it's
    fully paid?

    # answer :
    A bill is considered “generated” as soon as the receptionist creates and saves the bill, even if no payment has been made yet.
Create Bill
    ↓
GENERATED
    ↓
Payment
    ├── Fully paid → PAID
    ├── Partially paid → PARTIALLY PAID
    └── No payment → PENDING
12. Can a generated bill be edited or cancelled after creation? If so, by whom?

# answer :
Receptionist:

Can edit a bill before payment
Cannot edit a fully/partially paid bill
Can request cancellation

Doctor/Admin:

Can cancel bills
Can make corrections
Can view the history

This gives the doctor more control.

13. What should happen if the same bill is accidentally generated twice?
    # answer:Disable the Generate button while the request is processing. Give every bill a unique Bill ID. If a suspicious duplicate is detected, warn the user. Allow an authorized user to cancel a duplicate. Never silently delete a generated bill.

## 4. Payments

14. For UPI payments, can a receptionist enter a partial amount, or must it always match the full
    due amount?
    # answer : Partial UPI payments are allowed.
15. Do we need to record a UPI transaction/reference number, or is the amount alone enough?
# answer :Make the reference number optional

This might be a nice compromise:

Payment method: UPI
Amount: ₹800
UPI Reference No: [optional]

But whether it should be optional or mandatory is a business decision.

16. Is UPI payment confirmed manually by the receptionist (self-reported), or does it need to connect
    to a real payment gateway to verify the money actually arrived?
    # answer :UPI payments are manually confirmed by the receptionist. The system does not integrate with or automatically verify a UPI/payment gateway in the MVP.
17. For cash payments, are partial payments allowed (pay some now, rest later)?
# answer: Yes
18. If a bill is paid in more than one installment (e.g. partial cash today, rest next week), should
    we keep a record of each individual payment, or just the running total paid?
    # answer : Yes, store each individual payment separately. The bill should maintain a payment history, while the total paid and remaining due are calculated from those payment records.

## 5. Bill status & history

19. What are the exact statuses a bill can be in? (We're assuming: Unpaid, Partially Paid, Fully
    Paid — confirm, and let us know if Cancelled/Refunded should also exist.)

    # answer :
    Bill generated
      ↓
UNPAID
      ↓
payment
      ↓
PARTIALLY_PAID
      ↓
remaining payment
      ↓
PAID
CANCELLED bills cannot be edited or paid.
20. Once a bill is fully paid and disappears from the "generated bills" list, should it still be
    viewable somewhere as historical record? (We'd recommend yes, for audit/reporting purposes.)
    # answer:Fully paid bills are removed from the active Generated Bills list but remain available as historical records for the clinic's configured retention period. They must not be deleted simply because they are fully paid.

## 6. Printing

22. Connection:
FUTURE / OUT OF SCOPE FOR MVP

23. Paper width:
FUTURE / OUT OF SCOPE FOR MVP

24. Receipt layout:
MVP: Create a printer-independent print-friendly receipt.
Thermal-printer-specific layout: FUTURE.
25. What should happen if the printer is offline or fails to print — retry, show an error, or let
    the receptionist continue anyway?

    # answer :The clinic does not currently have a thermal printer. The system should be designed to support thermal receipt printing in the future, but printer integration is not required for the initial MVP. The exact make/model and connection method (USB, Bluetooth, network, etc.) will be decided when the printer is purchased. For now, implement the bill-printing functionality in a printer-independent way where practical, and keep the printer-specific integration modular so it can be added later without redesigning the billing system.

    When the doctor eventually buys one

Then we'll ask:

Exact make/model
USB, Bluetooth, or network
Printer language/protocol, if applicable
Paper width, e.g. 58mm or 80mm
Windows/Android/web environment
Whether direct printing without a dialog is required

Then we can add a printer adapter without rebuilding the billing system.

## 7. Admin dashboard & reporting

26. What time zone should "today" be based on for the dashboard's daily figures?
# answer: Timezone: Asia/Kolkata
            Dashboard "Today": clinic local calendar day
            Day boundary: midnight local time
            Storage: use timezone-aware timestamps consistently
            Display: clinic local time
27. Should the "generated bills" count on the dashboard mean *all* bills ever generated, or only
    ones that are still unpaid/pending?
    # answer :That keeps the dashboard metrics logically separate:
Generated Bills → total number of bills created
Paid Bills → bills fully paid
Pending/Unpaid Bills → bills with ₹0 paid
Partially Paid Bills → bills with some payment but balance remaining

For example, today:
28. If a search by phone number or patient name matches multiple people, should results be grouped
    per patient, or listed as one flat list?
    # answer : When searching by patient name or phone number, display a flat list of all matching bills. Each result must show Bill ID, patient name, phone number, date/time, total amount, amount paid, due amount, and payment status. Results may be sorted by date, with the most recent first.
29. Do historical reports need to account for any cancelled or refunded bills, or are those out of
    scope for now?
    # answer : Cancelled bills remain visible in historical records but are excluded from revenue, paid-bill, pending-bill, and partially-paid-bill counts. They may have a separate Cancelled Bills count/filter.

## 8. Data & compliance

30. How long should billing/patient records be kept, and does the clinic have any existing backup
    process we should fit into?

    # answer : read the requirements.md file 
31. Where will this be hosted/deployed (clinic's own PC/server, cloud, etc.)?
  # answer : read the requirements.md file 
32. Is there any healthcare or payment-data regulation in your jurisdiction we need to be aware of
    (e.g. data localization, patient privacy law)? We are not lawyers, so if this matters, please
    involve someone qualified to confirm compliance requirements.
      # answer : read the requirements.md file 
