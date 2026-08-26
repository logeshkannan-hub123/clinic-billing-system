# Release Readiness Checklist

## Requirements

- [ ] Client-approved MVP scope is documented.
- [ ] All critical acceptance criteria pass.
- [ ] Known limitations are documented.

## Security

- [ ] No secrets are committed.
- [ ] No real patient data is present in repository/test data/logs.
- [ ] Authentication and authorization have been tested.
- [ ] Sensitive data exposure has been reviewed.
- [ ] Production configuration uses secure secret handling.

## Billing

- [ ] Invoice numbering is confirmed.
- [ ] Money representation is consistent.
- [ ] Subtotal/rounding/grand-total rules are confirmed and tested.
- [ ] Payment states are confirmed and tested.
- [ ] Partial payment behavior is confirmed and tested.
- [ ] Cash change/due behavior is confirmed and tested.
- [ ] Duplicate payment submission behavior is addressed.
- [ ] Historical billing records are preserved appropriately.

## Printing

- [ ] Exact thermal printer model is confirmed.
- [ ] Connection method is confirmed.
- [ ] Receipt width/layout is tested on the target device.
- [ ] Patient phone number is excluded from printed receipts.
- [ ] Failure/offline printer behavior is defined.

## Quality

- [ ] Tests pass.
- [ ] Lint passes.
- [ ] Typecheck passes where applicable.
- [ ] Production build passes.
- [ ] Relevant manual verification passes.
- [ ] No unexpected console/server errors remain.

## Operations

- [ ] Environment variables are documented without exposing values.
- [ ] Database backup/restore strategy is defined.
- [ ] Deployment/rollback procedure is documented.
- [ ] Monitoring/logging avoids sensitive data.
- [ ] Production deployment has explicit human approval.
