# Project Harness

Router for agent sessions. Read this first, then follow the startup workflow.
Project facts live in `docs/`, not here.

## Startup Workflow

Before writing code:
1. `pwd` — confirm you are in the repo root.
2. Read this file fully.
3. Run `./init.sh` (install + verify). If the baseline is already failing, fix that first.
4. Read `feature_list.json` (the source of truth for scope and status).
5. Read `progress.md` and `git log --oneline -5`.

## Verification Commands

- `./init.sh` — the canonical install + verify entrypoint.
- `npm run test` — unit/integration tests.
- `npm run build` — type-check and build.

## Definition of Done

A feature is done only when ALL are true:
- The behavior is implemented.
- Verification actually ran (the commands in the feature's `verification` list).
- Evidence is recorded in `feature_list.json` (command + observed output).
- The repo is restartable from the standard startup workflow.

## Working Rules

- One feature at a time. Exactly one feature may be `in_progress`.
- Stay in scope: do not start a second feature or refactor unrelated code.
- A feature flips to `done` only with recorded evidence; never hand-edit status without it.
- Prefer durable repo artifacts over chat history. Never delete features.

## End of Session

1. Update `progress.md`.
2. Update `feature_list.json` (status + evidence).
3. Record blockers and the recommended next step.
4. Commit. Leave the repo clean and restartable via `./init.sh`.
