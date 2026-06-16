# harness-creator

A compact skill for building and auditing harnesses around AI coding agents.

It helps a repository provide five things agents need: instructions, state, verification, scope boundaries, and lifecycle handoff.

## Install

```bash
npx skills add walkinglabs/learn-harness-engineering --skill harness-creator
```

Or copy `skills/harness-creator/` into your skill path.

## Use

```bash
node skills/harness-creator/scripts/create-harness.mjs --target /path/to/project
node skills/harness-creator/scripts/validate-harness.mjs --target /path/to/project        # score + invariant gate
node skills/harness-creator/scripts/validate-feature-list.mjs --target /path/to/project    # evidence-before-done gate
node skills/harness-creator/scripts/cleanup-scanner.mjs --target /path/to/project           # clean-state scan
node skills/harness-creator/scripts/check-architecture.mjs --target /path/to/project         # boundary guard (config-driven)
node skills/harness-creator/scripts/run-benchmark.mjs --target /path/to/project --html /path/to/report.html
```

The scripts use only Node.js built-in modules. They can be run after copying the skill directory into another repository, or vendored into the target repo's `scripts/` and wired into CI via the templates in `ci/`.

## What It Creates

- `AGENTS.md` or `CLAUDE.md`
- `feature_list.json`
- `progress.md`
- `init.sh`
- `session-handoff.md`

`create-harness.mjs` detects common project types and package managers. It supports Node/npm/pnpm/yarn/bun, Python, Go, Rust, Maven, Gradle, and .NET at a basic verification-command level.

## What It Checks

`validate-harness.mjs` scores the five harness subsystems (Instructions, State,
Verification, Scope, Lifecycle) and applies a **hard invariant gate**: the score
is advisory, but a feature marked `done` without evidence + verification, a WIP
breach, an off-enum status, or a dangling dependency fails the harness outright.

`validate-feature-list.mjs` enforces those feature-list invariants on their own
(ideal for CI/pre-commit). `cleanup-scanner.mjs` (idempotent, read-only) flags
committed secrets, debug code, and temp files. `check-architecture.mjs` enforces
layer boundaries from a `.harness/architecture.json` rule set.

The structural score tells you whether the harness is present and coherent; it
does not replace real before/after agent-session testing.

## Status

- [x] Minimal harness scaffolding (multi-stack)
- [x] Five-subsystem validation + hard invariant gate
- [x] Evidence-before-done / WIP / enum / dependency enforcement
- [x] Clean-state scanner + config-driven architecture guard
- [x] CI workflow + pre-commit hook templates
- [x] HTML assessment + structural benchmark reports
- [x] 13 eval cases + behavioural test suite (`npm test`)
- [x] Unified feature_list schema (`not_started | in_progress | blocked | done`)
- [ ] Optional real before/after agent-session replay

## Files

```text
harness-creator/
├── SKILL.md
├── metadata.json
├── agents/openai.yaml
├── ci/
│   ├── github-actions.yml
│   └── pre-commit
├── scripts/
│   ├── create-harness.mjs
│   ├── validate-harness.mjs
│   ├── validate-feature-list.mjs
│   ├── cleanup-scanner.mjs
│   ├── check-architecture.mjs
│   ├── render-assessment-html.mjs
│   ├── run-benchmark.mjs
│   └── lib/harness-utils.mjs
├── templates/
│   ├── agents.md
│   ├── feature-list.json
│   ├── feature-list.schema.json
│   ├── init.sh
│   ├── progress.md
│   ├── session-handoff.md
│   ├── clean-state-checklist.md
│   └── evaluator-rubric.md
├── references/
└── evals/evals.json
```

## Boundaries

This skill is for harness engineering, not model selection, prompt tuning alone, or app architecture. Keep project-specific facts in the target repository.
