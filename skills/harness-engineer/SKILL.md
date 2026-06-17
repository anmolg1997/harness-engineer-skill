---
name: harness-engineer
description: >-
  Use when setting up or auditing an AI coding-agent harness, or when agents claim
  done without proof, lose continuity across sessions, overreach scope, or leave a
  repo that will not restart. Covers AGENTS.md/CLAUDE.md, feature_list.json with an
  evidence-before-done gate, verification workflows, scope/WIP limits, clean-state
  guards, lifecycle handoff, memory persistence, and multi-agent coordination.
license: MIT
---

# Harness Creator

Use this skill to make a repository easier for coding agents to start, stay in scope, verify work, and resume across sessions. Keep the harness small enough that agents actually follow it.

Not for model selection, prompt tuning in isolation, chat UI design, or general app architecture.

## Core Model

Every useful coding-agent harness has five subsystems:

| Subsystem | Minimal artifact | Purpose |
|---|---|---|
| Instructions | `AGENTS.md` or `CLAUDE.md` | Startup path, working rules, definition of done |
| State | `feature_list.json`, `progress.md` | Current feature, status, evidence, next step |
| Verification | `init.sh` or documented commands | Tests/checks the agent must run before claiming done |
| Scope | Feature dependencies and done criteria | Prevents overreach and half-finished work |
| Lifecycle | `session-handoff.md`, end-of-session routine | Makes the next session restartable |

## First Move

1. Inspect what already exists: instruction files, feature/state files, verification commands, docs, package manifests.
2. Ask only for missing context that cannot be inferred safely: target agent, desired file name, tolerance for structure, and whether overwriting is allowed.
3. Prefer a minimal harness first. Add memory, tool safety, multi-agent, or benchmark details only when the user's problem calls for them.

## Common Tasks

### Create a harness

Use the bundled script when working on a local repository:

```bash
node skills/harness-engineer/scripts/create-harness.mjs --target /path/to/project
```

Options:

- `--agent-file CLAUDE.md` for Claude-oriented projects.
- `--package-manager npm|pnpm|yarn|bun` when detection is wrong.
- `--commands "cmd one,cmd two"` for custom verification.
- `--force` only after confirming overwrites are acceptable.

Then explain what was created and how the user should replace placeholder feature entries.

### Audit any repo (recognition — start here for existing/mature repos)

A repo can be well-harnessed with mechanisms other than this skill's files (a `Makefile`
instead of `init.sh`, `specs/NNN/tasks.md` or `.taskmaster/` instead of `feature_list.json`,
pre-commit/CI instead of a script). Use the descriptive auditor first — it credits *any* accepted
mechanism per subsystem and reports only the genuine gaps:

```bash
node skills/harness-engineer/scripts/recognize.mjs --target /path/to/project
```

It checks nine subsystems (instructions, verification entrypoint, automated verification, state/
feature tracker, scope, lifecycle, environment, observability, system-of-record) against a broad
signal set (AGENTS.md/CLAUDE.md; Makefile/justfile/Taskfile/tox/nox/npm-scripts; pre-commit/CI/lint
config; spec-kit/Taskmaster/agent-os/specs; lockfiles + runtime pins + devcontainer/devbox/nix;
OpenTelemetry/Langfuse/Traceloop deps; ADRs/llms.txt/architecture docs). Use this for audits;
`validate-harness.mjs` / `validate-feature-list.mjs` remain the strict gates for this skill's own
convention.

Then run the **Fresh Session Test** — `recognize` asks "does a mechanism exist", this asks "can a
cold agent actually orient itself from the repo alone":

```bash
node skills/harness-engineer/scripts/discoverability.mjs --target /path/to/project
```

It grades the five cold-start questions (what is this / how is it organized / how do I run it / how
do I verify it / where are we now) and gives an instruction-hygiene advisory (is the agent file
short + routing to docs, or a monolith?).

### Audit a harness-engineer-style harness (strict)

Run:

```bash
node skills/harness-engineer/scripts/validate-harness.mjs --target /path/to/project
```

Report the five subsystem scores, the lowest-scoring area, and the first 2-3 changes that would improve reliability. Treat the lowest score as a candidate bottleneck; confirm with failures, logs, or task outcomes before claiming causality.

The keyword score is advisory; the **invariant gate is not**. `validate-harness.mjs` fails outright (non-zero exit, regardless of score) when the feature list violates a hard invariant: a feature marked `done` without recorded evidence + a verification step, more than one feature `in_progress`, an off-enum status, or a dangling dependency.

### Enforce the invariant gate

Run on its own, or in CI / a pre-commit hook, to stop the most common failure — declaring victory without proof:

```bash
node skills/harness-engineer/scripts/validate-feature-list.mjs --target /path/to/project
```

A feature reaches `done` only with non-empty `evidence` AND a non-empty `verification` list. At most `--max-wip` (default 1) features may be `in_progress`. Canonical status enum: `not_started | in_progress | blocked | done` (see `templates/feature-list.schema.json`).

### Guard clean state and architecture

```bash
node skills/harness-engineer/scripts/cleanup-scanner.mjs --target /path/to/project   # secrets, debug code, temp/scratch (idempotent, read-only)
node skills/harness-engineer/scripts/check-architecture.mjs --target /path/to/project # layer boundaries; no-op until .harness/architecture.json exists
```

Both are language-agnostic and self-contained, so they can be vendored into the target repo's `scripts/` and wired into CI. Drop-in `ci/github-actions.yml` and `ci/pre-commit` templates are bundled. Mechanical checks beat remembered rules.

Add `--diff` (optional `--base REF`, default `HEAD`) to either guard to scope findings to lines changed since the base — the key to adopting them on a large or legacy repo, so the gate reports only on what the current change touched, not pre-existing debt.

### Set up a before/after benchmark

The structural benchmark (`run-benchmark.mjs`) confirms the harness is well formed. For the behavioural half — comparing two prompts or two models on representative tasks — scaffold a promptfoo config:

```bash
node skills/harness-engineer/scripts/scaffold-benchmark.mjs --target /path/to/project
```

It writes a `promptfooconfig.yaml` (providers × prompts × tests × assertions) to edit and run with `npx promptfoo eval`.

### Separate the checker from the worker

When the user wants quality review of agent work, use `templates/evaluator-rubric.md` — a separate evaluator role scores correctness/verification/scope/reliability/maintainability/handoff. It includes a calibration procedure: an untuned rubric produces confident, wrong scores, so align it against human judgment over 3–5 rounds. Pair with `templates/clean-state-checklist.md` at end of session.

### Produce a report

Use when the user wants a shareable assessment:

```bash
node skills/harness-engineer/scripts/render-assessment-html.mjs --target /path/to/project
node skills/harness-engineer/scripts/run-benchmark.mjs --target /path/to/project --html /path/to/report.html
```

Be clear that this is a structural benchmark. Real effectiveness still needs before/after agent sessions on representative tasks.

## When to Read References

Load only the reference needed for the user's problem:

- Memory across sessions: [Memory Persistence](references/memory-persistence-pattern.md)
- Reusable workflows as skills: [Skill Runtime](references/skill-runtime-pattern.md)
- Permissions, tools, concurrency: [Tool Registry & Safety](references/tool-registry-pattern.md)
- Context budget and progressive disclosure: [Context Engineering](references/context-engineering-pattern.md)
- Delegation and parallel agents: [Multi-Agent Coordination](references/multi-agent-pattern.md)
- Hooks, startup, long-running work: [Lifecycle & Bootstrap](references/lifecycle-bootstrap-pattern.md)
- Non-obvious failure modes: [Gotchas](references/gotchas.md)

## Design Rules

- Keep the root instruction file short: routing and invariants, not a full manual.
- Put project facts in project docs, not in the skill.
- Make verification commands explicit and runnable.
- Require evidence before marking a feature done.
- Use one active feature unless the harness has explicit multi-agent ownership boundaries.
- Prefer append/update state files over relying on chat history.
- Never hide destructive behavior in scripts; overwrites require explicit user approval.

## Deliverable Checklist

For a usable minimal harness, leave the target project with:

- [ ] `AGENTS.md` or `CLAUDE.md`
- [ ] `feature_list.json` that passes `validate-feature-list.mjs` (no done-without-evidence; WIP cap holds)
- [ ] `progress.md`
- [ ] `init.sh` that fails fast (`set -e`) and is executable
- [ ] Optional `session-handoff.md` and `clean-state-checklist.md` for multi-session work
- [ ] `validate-harness.mjs` invariant gate passes
- [ ] `cleanup-scanner.mjs` reports no critical issues
- [ ] Documented verification evidence or next action

If you cannot create files, provide exact file contents and commands instead.
