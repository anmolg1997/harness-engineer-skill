# {{AGENT_FILE_NAME}}

{{PROJECT_PURPOSE}}

This file is the operating manual for coding agents in this repo. Read it first;
it routes you to everything else. Keep it short — project facts belong in `docs/`.

## Startup Workflow

Run this before writing any code:

1. `pwd` — confirm you are in the repo root.
2. Read this file end to end.
3. Read the project docs that exist (`docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, `README`).
4. Run `./init.sh` to confirm the environment is healthy.
5. Read `feature_list.json` for the current feature state.
6. Skim recent history: `git log --oneline -5`.

If the baseline is already failing, fix that first. Never stack new work on a broken state.

## Working Rules

- **One feature at a time** — exactly one feature is `in_progress` in `feature_list.json`.
- **Verification is mandatory** — run the feature's `verification` commands; don't claim done on a hunch.
- **Evidence gate** — a feature reaches `done` only with non-empty `evidence` plus a `verification` step. Never hand-edit status to skip this.
- **Stay in scope** — touch only files for the active feature; never refactor on the side; never delete features to hide unfinished work.
- **Persist state** — update `progress.md` and `feature_list.json` before you stop.
- **Leave it restartable** — the next session must be able to run `./init.sh` immediately.

## Required Artifacts

- `feature_list.json` — the source of truth for scope and status.
- `progress.md` — the session continuity log.
- `init.sh` — the one startup + verification entrypoint.
- `session-handoff.md` — for multi-session work.

## Definition of Done

A feature is done only when every one of these holds:

- [ ] The behavior is implemented.
- [ ] Verification actually ran (tests / lint / type-check).
- [ ] Evidence is recorded in `feature_list.json` (command + observed output).
- [ ] The repo is still restartable from the standard startup workflow.

## End of Session

1. Update `progress.md` with the current state.
2. Update `feature_list.json` status + evidence.
3. Record open risks / blockers.
4. Commit once the tree is safe to resume from.
5. Leave it clean enough that the next session runs `./init.sh` and continues.

## Verification Commands

```bash
# Full verification:
{{PRIMARY_VERIFICATION_COMMAND}}
```

Individual checks:
{{VERIFICATION_COMMANDS}}

## Escalation

- **Architecture choices** — check the architecture docs; otherwise ask.
- **Unclear requirements** — check the product docs; otherwise ask.
- **Repeated test failures** — record the state in `progress.md` and flag for review.
- **Scope ambiguity** — re-read `feature_list.json` for the definition of done.
