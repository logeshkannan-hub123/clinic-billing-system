# Git Collaboration Workflow

Two developers collaborate on this repository.

## Branch policy

`main` is protected/stable. Never implement directly on `main`.

Branch names:

- `feature/<short-description>`
- `fix/<short-description>`
- `refactor/<short-description>`
- `test/<short-description>`
- `docs/<short-description>`

Examples:

- `feature/invoice-api`
- `feature/billing-ui`
- `fix/cash-change-calculation`

## Before work

Run/inspect:

```bash
git status
git branch --show-current
git fetch origin
```

If there are uncommitted changes, do not discard, stash, reset, or overwrite them. Tell the user what is present.

## Push/pull

Push only the current feature branch unless explicitly authorized otherwise. Never force-push shared branches.

Before opening a PR, ensure the branch is reasonably up to date with the intended target and resolve conflicts deliberately.

## Commits

Prefer small, logical commits. Do not mix unrelated work. Never commit secrets, `.env`, private keys, real patient data, production exports, or credentials.

## Pull Requests

A PR should state:

- purpose;
- user-facing behavior;
- files/modules changed;
- tests/checks run;
- known limitations;
- migration or configuration requirements.

A human developer makes the final merge decision.

## Conflicts

Never automatically choose ours/theirs for business-critical conflicts. For conflicts involving models, invoices, payments, authorization, API contracts, or migrations, show the conflicting intent and ask the human to decide.

## Dangerous commands

Do not run without explicit authorization for the exact operation:

- `git push --force` / `--force-with-lease`;
- `git reset --hard`;
- `git clean -fd`;
- history rewriting;
- destructive branch deletion;
- database drops/resets.

## Promote Completed Feature to Main

When the user explicitly requests that the completed feature be pushed/merged
to main, follow this workflow.

### Preconditions

1. Confirm current branch.
2. Confirm working tree.
3. Never use `git add .` blindly.
4. Never force-push.
5. Never overwrite main history.
6. Never commit unrelated/unapproved files.
7. Never commit secrets, `.env`, credentials, node_modules, build artifacts,
   or temporary files.

### Workflow

1. Run:

   ```bash
   git status
   git branch --show-current
   git log --oneline -10
   ```

2. Identify uncommitted/untracked files.

3. If unexpected files exist:
   STOP and ask the user whether they should be excluded.

4. Run the project's required verification:
   - lint
   - typecheck/build
   - tests

5. Push the feature branch:

   ```bash
   git push -u origin <feature-branch>
   ```

6. Update local main:

   ```bash
   git checkout main
   git pull --ff-only origin main
   ```

7. Merge:

   ```bash
   git merge --no-ff <feature-branch>
   ```

8. If conflicts occur:
   STOP. Do not resolve automatically.

9. Push main:

   ```bash
   git push origin main
   ```

10. Verify:

    ```bash
    git status
    git log --oneline -10
    git ls-remote origin main
    ```

### Failure rules

STOP immediately if:

- working tree contains unexpected changes
- push is rejected
- merge has conflicts
- remote main has unexpected commits
- authentication fails
- tests fail
- lint fails
- typecheck fails

Never force-push main.
Never delete branches automatically.
Never resolve merge conflicts without explicit approval.
