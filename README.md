# harness-creator (consolidated skill)

A portable, multi-agent **skill** for building, auditing, and *gating* reliable
harnesses around AI coding agents. It consolidates and hardens the
`harness-creator` skill and the harness-engineering practices from
[walkinglabs/learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering)
into one self-contained bundle you can install into Claude Code, Codex, Cursor,
Windsurf, or any generic agent.

> **The model decides what code to write. The harness governs when, where, and how.**
> A strong model still ships broken work without an environment that tracks
> state, bounds scope, and refuses to call a feature "done" without proof.

## What's in the box

```
skills/harness-creator/
├── SKILL.md                     # entry point (progressive disclosure)
├── metadata.json                # manifest: triggers, compatibility, bundle
├── references/                  # 7 deep pattern docs (loaded on demand)
├── templates/                   # AGENTS.md, feature_list.json (+schema), init.sh,
│                                #   progress.md, session-handoff.md,
│                                #   clean-state-checklist.md, evaluator-rubric.md
├── scripts/                     # Node built-ins only — no dependencies
│   ├── create-harness.mjs       # scaffold a minimal harness (multi-stack)
│   ├── recognize.mjs            # descriptive audit: credits ANY harness convention, lists real gaps
│   ├── validate-harness.mjs     # 5-subsystem score + HARD invariant gate
│   ├── validate-feature-list.mjs# evidence-before-done, WIP cap, enum, deps
│   ├── cleanup-scanner.mjs      # idempotent: secrets, debug code, temp files
│   ├── check-architecture.mjs   # config-driven layer-boundary guard
│   ├── render-assessment-html.mjs / run-benchmark.mjs
│   └── lib/harness-utils.mjs
├── ci/                          # drop-in github-actions.yml + pre-commit hook
└── evals/evals.json             # 13 acceptance cases
tests/                           # behavioural suite + good/bad/dirty/arch fixtures
```

## The core idea: five subsystems + one hard gate

| Subsystem | Minimal artifact | Job |
|---|---|---|
| Instructions | `AGENTS.md` / `CLAUDE.md` | startup path, rules, definition of done — a router, not a manual |
| State | `feature_list.json`, `progress.md` | current feature, status, **evidence**, next step |
| Verification | `init.sh` + documented commands | checks the agent must run before claiming done |
| Scope | feature deps + done criteria | one feature at a time, no overreach |
| Lifecycle | `session-handoff.md` + end routine | the next session is restartable |

The five-subsystem score is **advisory** (it can be gamed by name-dropping the
right phrases). The **invariant gate is not**: a harness fails outright when a
feature is marked `done` without recorded evidence + a verification step, when
more than one feature is `in_progress`, when a status is off-enum, or when a
dependency dangles. This is the difference that makes it foolproof rather than
decorative.

## Quick start

```bash
# 0. Audit an existing repo on its ACTUAL harness (any convention) — start here for mature repos
node skills/harness-creator/scripts/recognize.mjs --target /path/to/project

# 1. Scaffold a harness into your project
node skills/harness-creator/scripts/create-harness.mjs --target /path/to/project

# 2. Enforce the invariants (use in CI / pre-commit too)
node skills/harness-creator/scripts/validate-feature-list.mjs --target /path/to/project
node skills/harness-creator/scripts/validate-harness.mjs --target /path/to/project

# 3. Guard clean state and architecture boundaries
node skills/harness-creator/scripts/cleanup-scanner.mjs --target /path/to/project
node skills/harness-creator/scripts/check-architecture.mjs --target /path/to/project
```

Install as a skill (where supported):

```bash
npx skills add <your-org>/harness-creator-skill --skill harness-creator
```

## Make the checks mechanical

Vendor `skills/harness-creator/scripts/` into your repo (e.g. `scripts/harness/`)
and copy `skills/harness-creator/ci/github-actions.yml` →
`.github/workflows/harness-gate.yml` and `ci/pre-commit` → `.git/hooks/pre-commit`.
Now "done needs evidence" and "leave a clean state" are enforced by the repo, not
trusted to the agent's self-report. Mechanical checks beat remembered rules.

## Develop / test

```bash
npm test            # runs the behavioural suite (tests/run-tests.mjs)
```

The suite proves the contract: the broken fixture fails every gate, the good
fixture passes, and the guards catch real violations.

## License

MIT. Derived from [walkinglabs/learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering) (MIT). See [LICENSE](./LICENSE).
