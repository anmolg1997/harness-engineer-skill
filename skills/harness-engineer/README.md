# harness-engineer

A skill for **auditing, scaffolding, and gating** the harness around an AI coding
agent — the environment of instructions, state, verification, scope, and lifecycle
that turns a capable model into a reliable one.

It does two things no naive harness checker does:

1. **Recognizes the harness you already have**, in whatever convention you use
   (a `Makefile` instead of `init.sh`, `specs/NNN/tasks.md` instead of a
   `feature_list.json`, pre-commit/CI instead of a script), so it reports your
   *real* coverage and only the *genuine* gaps.
2. **Refuses to let an agent fake "done."** A feature reaches `done` only with
   recorded evidence plus a verification step — enforced as a hard gate that fails
   CI regardless of how good the prose looks.

## Install

```bash
npx skills add anmolg1997/harness-engineer-skill --skill harness-engineer
```

Or copy `skills/harness-engineer/` into your agent's skill path.

## Use

```bash
# Audit an existing repo on its ACTUAL harness (any convention) — start here
node skills/harness-engineer/scripts/recognize.mjs --target /path/to/project
node skills/harness-engineer/scripts/discoverability.mjs --target /path/to/project  # Fresh Session Test

# Scaffold the missing pieces
node skills/harness-engineer/scripts/create-harness.mjs --target /path/to/project

# Enforce the gates (use in CI / pre-commit)
node skills/harness-engineer/scripts/validate-feature-list.mjs --target /path/to/project
node skills/harness-engineer/scripts/validate-harness.mjs --target /path/to/project
node skills/harness-engineer/scripts/cleanup-scanner.mjs --target /path/to/project
node skills/harness-engineer/scripts/check-architecture.mjs --target /path/to/project
```

Every script uses Node built-in modules only — no dependencies. Run them after
copying the skill directory in, or vendor `scripts/` into the target repo and wire
the `ci/` templates into CI / a pre-commit hook.

## The two auditors

| Script | Question it answers |
|---|---|
| `recognize.mjs` | Does *some mechanism* satisfy each of the nine subsystems? (credits any convention) |
| `discoverability.mjs` | Can a *cold agent* actually orient itself from the repo alone? (5 cold-start questions) |

Nine recognized subsystems: instructions, verification entrypoint, automated
verification, state/feature tracker, scope, lifecycle, environment, observability,
system-of-record — each matched against a broad signal set (AGENTS.md/CLAUDE.md;
Makefile/justfile/Taskfile/tox/nox/npm-scripts; pre-commit/CI/lint config;
spec-kit/Taskmaster/agent-os/specs; lockfiles + runtime pins +
devcontainer/devbox/nix; OpenTelemetry/Langfuse/Traceloop deps; ADRs/llms.txt/
architecture docs).

## The gates

`validate-harness.mjs` scores the five core subsystems (instructions, state,
verification, scope, lifecycle) and applies a **hard invariant gate**: the keyword
score is advisory, but a feature marked `done` without evidence + verification, a
WIP breach, an off-enum status, or a dangling dependency fails outright.

`validate-feature-list.mjs` enforces those feature-list invariants on their own
(ideal for CI/pre-commit). `cleanup-scanner.mjs` (idempotent, read-only) flags
committed secrets, debug code, and temp files. `check-architecture.mjs` enforces
layer boundaries from a `.harness/architecture.json` rule set.

## What `create-harness` writes

`AGENTS.md` (or `CLAUDE.md`), `feature_list.json`, `progress.md`,
`session-handoff.md`, and a fail-fast `init.sh`. It detects the stack
(Node/npm/pnpm/yarn/bun, Python, Go, Rust, Maven, Gradle, .NET) and wires the
matching verify commands.

## Capabilities

- [x] Descriptive recognition across nine subsystems and many conventions
- [x] Fresh Session Test (cold-start orientation) + instruction-hygiene advisory
- [x] Minimal harness scaffolding (multi-stack)
- [x] Five-subsystem validation + hard invariant gate
- [x] Evidence-before-done / WIP / enum / dependency enforcement
- [x] Clean-state scanner + config-driven architecture guard
- [x] CI workflow + pre-commit hook templates
- [x] HTML assessment + structural benchmark reports
- [x] 13 eval cases + behavioural test suite (`npm test`)
- [x] Canonical feature_list schema (`not_started | in_progress | blocked | done`)
- [ ] Optional real before/after agent-session replay

## Files

```text
harness-engineer/
├── SKILL.md                 # entry point (progressive disclosure)
├── metadata.json            # manifest: triggers, compatibility, bundle
├── agents/openai.yaml       # Codex/agent integration
├── ci/                      # drop-in github-actions.yml + pre-commit hook
├── scripts/
│   ├── recognize.mjs            # descriptive coverage audit (any convention)
│   ├── discoverability.mjs      # Fresh Session Test (5 cold-start questions)
│   ├── create-harness.mjs       # scaffold a minimal harness (multi-stack)
│   ├── validate-harness.mjs     # 5-subsystem score + hard invariant gate
│   ├── validate-feature-list.mjs# evidence-before-done, WIP, enum, deps
│   ├── cleanup-scanner.mjs      # secrets / debug / temp scan (idempotent)
│   ├── check-architecture.mjs   # config-driven boundary guard
│   ├── render-assessment-html.mjs / run-benchmark.mjs
│   └── lib/harness-utils.mjs
├── templates/               # agents.md, feature-list.json (+schema), init.sh,
│                            #   progress.md, session-handoff.md,
│                            #   clean-state-checklist.md, evaluator-rubric.md
├── references/              # 7 deep pattern docs (loaded on demand)
└── evals/evals.json
```

## Boundaries

This skill is for harness engineering — not model selection, prompt tuning in
isolation, or application architecture. Keep project-specific facts in the target
repository, not in the skill.
