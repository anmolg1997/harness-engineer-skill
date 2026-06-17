<h1 align="center">Harness Engineer</h1>

<p align="center"><strong>A portable agent skill that audits, scaffolds, and <em>gates</em> the harness around AI coding agents — so a capable model becomes a reliable one.</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/skill-harness--engineer-1e40af?style=flat-square" alt="skill">
  <img src="https://img.shields.io/badge/deps-0%20(Node%20built--ins)-047857?style=flat-square" alt="zero deps">
  <img src="https://img.shields.io/badge/tests-28%20passing-126c43?style=flat-square" alt="tests">
  <img src="https://img.shields.io/badge/agents-Claude%20%7C%20Codex%20%7C%20Cursor%20%7C%20generic-6d28d9?style=flat-square" alt="multi-agent">
  <img src="https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square" alt="MIT">
</p>

> **The model decides *what* code to write. The harness governs *when, where, and how* — and whether "done" is real.**
> The strongest model still ships broken work without an environment that tracks state, bounds scope, and refuses to declare victory without proof. This skill builds and enforces that environment.

---

## Why this exists

Most "is my repo agent-ready?" checks are **prescriptive** — they hunt for a fixed set of filenames and punish any repo that uses different conventions. Run one against a mature, well-engineered codebase and it scores it near zero while missing the point entirely.

Harness Engineer is **descriptive and enforcing**:

- **Descriptive** — it recognizes the harness you already have, in *any* convention (a `Makefile`, `specs/NNN/tasks.md`, pre-commit, a lockfile, OpenTelemetry, ADRs), and reports your true coverage plus only the genuine gaps.
- **Enforcing** — it makes "done" impossible to fake: a feature is `done` only with recorded evidence **and** a verification step, enforced as a hard gate that fails CI no matter how convincing the prose is.

On a real production repo, a prescriptive checker scored **28/100**; Harness Engineer's recognizer reports a true **89/100** and surfaces the single real gap.

---

## What's in the box

```
skills/harness-engineer/
├── SKILL.md                     # entry point (progressive disclosure)
├── metadata.json                # manifest: triggers, compatibility, bundle
├── references/                  # 7 deep pattern docs (loaded on demand)
├── templates/                   # AGENTS.md, feature_list.json (+schema), init.sh,
│                                #   progress.md, session-handoff.md,
│                                #   clean-state-checklist.md, evaluator-rubric.md
├── scripts/                     # Node built-ins only — zero dependencies
│   ├── recognize.mjs            # descriptive audit: credits ANY convention, lists real gaps
│   ├── discoverability.mjs      # Fresh Session Test: can a cold agent orient itself?
│   ├── create-harness.mjs       # scaffold a minimal harness (multi-stack)
│   ├── validate-harness.mjs     # 5-subsystem score + HARD invariant gate
│   ├── validate-feature-list.mjs# evidence-before-done, WIP cap, enum, deps
│   ├── cleanup-scanner.mjs      # idempotent: secrets, debug code, temp files (+ --diff)
│   ├── check-architecture.mjs   # config-driven layer-boundary guard (+ --diff)
│   ├── scaffold-benchmark.mjs   # before/after promptfoo benchmark config
│   ├── render-assessment-html.mjs / run-benchmark.mjs
│   └── lib/harness-utils.mjs
├── ci/                          # drop-in github-actions.yml + pre-commit hook
└── evals/evals.json             # 13 acceptance cases
docs/research/                   # the framework research that informs the design
tests/                           # behavioural suite + good/bad/dirty/arch/alt fixtures
```

---

## The model: five subsystems + nine recognized signals + one hard gate

Every reliable coding-agent harness provides five things:

| Subsystem | What it does |
|---|---|
| **Instructions** | startup path, working rules, definition of done — a router, not a manual |
| **State** | current feature, status, **evidence**, next step — persisted to disk |
| **Verification** | the checks the agent must run before claiming done |
| **Scope** | one feature at a time, no overreach |
| **Lifecycle** | the next session is restartable |

The auditor recognizes these (plus **environment**, **observability**, and **system-of-record**) across many conventions. The five-subsystem score is **advisory** — it can be gamed by name-dropping the right phrases. The **invariant gate is not**: a harness fails outright when a feature is `done` without evidence + verification, when more than one feature is `in_progress`, when a status is off-enum, or when a dependency dangles. That is the line between a foolproof harness and a decorative one.

---

## Quick start

```bash
# 0. Audit an existing repo on its ACTUAL harness (start here for mature repos)
node skills/harness-engineer/scripts/recognize.mjs --target /path/to/project
node skills/harness-engineer/scripts/discoverability.mjs --target /path/to/project

# 1. Scaffold the missing pieces
node skills/harness-engineer/scripts/create-harness.mjs --target /path/to/project

# 2. Enforce the gates (use in CI / pre-commit too)
node skills/harness-engineer/scripts/validate-feature-list.mjs --target /path/to/project
node skills/harness-engineer/scripts/validate-harness.mjs --target /path/to/project

# 3. Guard clean state and architecture boundaries
node skills/harness-engineer/scripts/cleanup-scanner.mjs --target /path/to/project
node skills/harness-engineer/scripts/check-architecture.mjs --target /path/to/project
```

Install as a skill (where supported):

```bash
npx skills add anmolg1997/harness-engineer-skill --skill harness-engineer
```

---

## Make the checks mechanical (not remembered)

Vendor `skills/harness-engineer/scripts/` into your repo (e.g. `scripts/harness/`) and copy `ci/github-actions.yml` → `.github/workflows/harness-gate.yml` and `ci/pre-commit` → `.git/hooks/pre-commit`. Now "done needs evidence" and "leave a clean state" are enforced by the repository itself, not trusted to the agent's self-report. Mechanical checks beat remembered rules.

---

## Research-backed

The design is informed by a deep survey of the harness-engineering ecosystem (instruction/context standards, spec/state trackers, environment reproducibility, automated verification, agent observability, system-of-record, and evals). See [`docs/research/harness-ecosystem-report.md`](docs/research/harness-ecosystem-report.md) for the full report and the recognition matrix it produced.

---

## Develop / test

```bash
npm test            # behavioural suite (tests/run-tests.mjs) — 28 checks
```

The suite proves the contract: a deliberately broken harness fails every gate, a well-harnessed repo (in *any* convention) is recognized, and the guards catch real violations (committed secrets, debug code, boundary breaks).

---

## License

MIT © 2026 Anmol Jaiswal. See [LICENSE](./LICENSE).
