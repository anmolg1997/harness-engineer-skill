# Clean-State Checklist

Run this before ending a session and before committing. The next session's
success depends on this session leaving a clean, restartable state. Every box
must be checkable with evidence, not vibes.

## Build & Verification
- [ ] `./init.sh` runs clean from a fresh checkout (install + verify pass)
- [ ] Tests pass, including pre-existing tests (not just the ones you touched)
- [ ] Type-check / lint / build pass
- [ ] `node scripts/validate-feature-list.mjs` passes (no done-without-evidence, WIP cap holds)

## Scope & State
- [ ] Exactly one feature was `in_progress`; it is now `done` (with evidence) or `blocked` (with reason)
- [ ] `feature_list.json` reflects reality — no feature marked `done` without recorded evidence + verification
- [ ] No feature was deleted to hide unfinished work
- [ ] `progress.md` updated: what's done, what's next, blockers

## Cleanliness
- [ ] `node scripts/cleanup-scanner.mjs` reports no CRITICAL issues
- [ ] No leftover debug code (`console.log`, `debugger`, stray prints)
- [ ] No temp/scratch/backup files committed; no secrets (`.env`) in the tree
- [ ] Architecture boundaries hold (`node scripts/check-architecture.mjs`, if configured)

## Handoff
- [ ] `session-handoff.md` records the verified state, files changed, and the recommended next step
- [ ] Work committed at a point that is safe to resume from
- [ ] A fresh session could run the standard startup workflow and continue without manual fixes
