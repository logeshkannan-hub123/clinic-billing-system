# Architecture and Coding Standards

## Stack

Confirmed stack: React, TypeScript, Node.js, Express, MongoDB. Follow the existing project conventions rather than imposing a new structure. Inspect the repository first before adding any new pattern.

## General principles

- Prefer clarity over cleverness.
- Prefer small cohesive modules.
- Avoid premature abstraction.
- Reuse established patterns.
- Keep business logic testable.
- Keep UI concerns separate from domain/business rules.
- Keep persistence concerns behind a clear data-access boundary where the existing architecture supports it.

## Frontend

When applicable:

- Keep pages, components, hooks, API clients, types, and utilities organized consistently.
- Keep business calculations out of presentation components when practical.
- Handle loading, success, empty, and error states.
- Never place secrets in client-side code.
- Validate user input for usability, but do not treat client validation as security.

## Backend

When applicable, prefer a clear separation such as:

`route → controller → service/domain logic → data access`

Do not force this pattern if the existing codebase has a simpler coherent pattern.

Backend responsibilities:

- validate untrusted input;
- enforce authorization;
- perform authoritative business calculations;
- return consistent errors;
- avoid leaking internal details.

## TypeScript

When TypeScript is used:

- avoid `any` unless justified;
- type API boundaries;
- model nullable/optional values explicitly;
- do not suppress compiler errors without a documented reason;
- prefer narrow types and discriminated unions where they improve correctness.

## API design

- Use resource-oriented names.
- Validate request bodies, query parameters, and path parameters.
- Define success and error behavior.
- Do not change an existing contract without approval.
- Do not expose internal database errors directly.

## Database

- Define explicit schemas/models.
- Add indexes only when justified by query patterns.
- Avoid N+1 access patterns where practical.
- Handle missing records explicitly.
- Schema/data migrations require approval.

## Money

Use one project-wide money representation. Prefer integer smallest units or a suitable decimal representation where supported by the chosen database/runtime. Do not mix representations.

Every financial calculation must have tests for normal values, zero, boundary values, rounding, and invalid values as applicable.

## Date and time

The application must have an explicit timezone policy. Store and display dates/times consistently. Do not silently depend on the developer machine's local timezone.

## Dependencies

Before adding a dependency:

1. check whether an existing dependency solves the problem;
2. explain the proposed dependency and reason;
3. obtain approval;
4. install and test it.
