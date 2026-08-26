# Security, Privacy, and Financial Data Rules

This is a real clinic billing application. Treat patient-identifying information and financial information as sensitive.

## Never use real data in development

Do not put real patient names, phone numbers, invoices, payment records, credentials, or exports into:

- source code;
- fixtures/seeds;
- test snapshots;
- screenshots;
- logs;
- Git commits;
- issue descriptions;
- AI prompts.

Use synthetic data only.

## Secrets

Never commit or print:

- passwords;
- database credentials;
- JWT/session secrets;
- API keys;
- private keys;
- production environment values.

Use environment variables or the project's approved secret-management mechanism.

## Authentication

- Passwords must never be stored in plaintext.
- Login errors should not unnecessarily reveal whether a username exists.
- Sessions/tokens must follow the chosen architecture's security practices.
- Do not weaken authentication for convenience.
- Session-based auth must regenerate the session id at the moment of authentication (signup and
  login), before writing any authenticated identity into the session. A pre-authentication session
  id must never remain valid as the authenticated session (session fixation).

## Authorization

The product currently defines two roles:

- **Doctor/Admin:** exactly one admin user.
- **Receptionist:** multiple staff users.

The role model is a business requirement and must not be silently expanded. Authorization must be enforced server-side for protected operations.

## Patient information

The current requirements include patient name and phone number. Minimize collection and exposure. The printable thermal bill must not include the patient's phone number, per the stated requirement.

## Billing/payment security

- Server-side validation is authoritative.
- Payment status must be derived from validated financial state, not from a client-provided status alone.
- Never trust a client-provided total when the server can calculate it from stored line items/rules.
- Prevent duplicate submission where appropriate.
- Preserve an auditable relationship between bill, payment, and status.
- Do not silently overwrite payment history.

## Logging

Do not log patient phone numbers, credentials, payment secrets, or full sensitive payloads. Log safe identifiers and technical diagnostics only.

Security-sensitive account actions — account creation, deactivation/reactivation, and password
resets — must be recorded as audit events. Audit payloads must be built from specific, named safe
fields (actor id, target id, username, staffId) — never by spreading or serializing a full user
document — so a password, password hash, or other secret can never end up in an audit record even
by accident.

## Printing

The thermal-printing integration must not expose patient phone numbers. The exact Bluetooth/wired mechanism is a technical requirement to confirm before implementation because browser/device capabilities vary.

## Compliance

Do not claim that the application is legally or regulatory compliant without a qualified review. If deployment jurisdiction or applicable healthcare/payment requirements are unknown, flag them for the client/qualified professional.

## Production safety

Production deployment, migrations, backups, restores, and destructive data operations require explicit human approval and a rollback/recovery plan.
