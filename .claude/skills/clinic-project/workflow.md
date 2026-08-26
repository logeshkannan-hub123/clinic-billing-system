# Detailed Development Workflow

## Phase 1 — Understand

For each request, produce:

- Goal
- User/role
- Current behavior
- Desired behavior
- Inputs
- Outputs
- Business rules
- Acceptance criteria
- Dependencies
- Ambiguities/questions

Do not translate ambiguous statements into code assumptions.

## Phase 2 — Inspect

Inspect only what is relevant, but enough to understand existing behavior. Check:

- current branch and Git status;
- project structure;
- package manifests and lockfiles;
- relevant frontend/backend modules;
- data models/schema;
- API contracts;
- validation/error handling;
- existing tests;
- configuration/environment conventions.

## Phase 3 — Plan

Provide a plan with:

1. exact behavior;
2. affected files/modules;
3. data/model changes;
4. API/UI changes;
5. tests;
6. risks;
7. unresolved decisions.

Keep the plan small enough to review. Mark any decision that requires human confirmation.

## Phase 4 — Confirm

Wait for explicit approval. Approval of a plan authorizes only that plan. It does not authorize unrelated work discovered later.

If the user changes scope, return to Understand → Inspect → Plan → Confirm.

## Phase 5 — Implement

During implementation:

- preserve existing behavior unless the approved task changes it;
- use existing patterns;
- keep functions/components focused;
- validate untrusted input;
- handle expected errors;
- avoid dead code and speculative abstractions;
- add/update tests with the implementation;
- do not modify unrelated files.

## Phase 6 — Test

Run the project's available checks. At minimum, use applicable checks for:

- formatting;
- linting;
- type checking;
- unit/integration tests;
- build;
- relevant API behavior;
- relevant UI behavior.

If a check cannot be run, state why. Do not claim success from inspection alone.

## Phase 7 — Review

Review the final diff for:

- requirement coverage;
- incorrect business logic;
- security/privacy issues;
- authorization mistakes;
- validation gaps;
- money/rounding mistakes;
- date/time mistakes;
- duplicate logic;
- accidental unrelated changes;
- missing tests;
- secrets or real client data.

## Phase 8 — Commit

Only commit after explicit authorization.

Use a small conventional-style message such as:

- `feat: add invoice creation flow`
- `fix: correct cash change calculation`
- `test: add payment state coverage`

Before committing, inspect `git diff` and `git status`. Never include unrelated changes.

## Phase 9 — Next task

Stop after the approved task. Do not chain tasks automatically.
