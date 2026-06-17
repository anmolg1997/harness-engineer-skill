# Harness Engineering Ecosystem — Frameworks to Borrow From

**Purpose.** A deep, cited survey of the frameworks, tools, and open standards in the
AI-coding-agent "harness engineering" space, mapped onto the gaps we found by running
`harness-creator` against a real production repo (LRA). For each item: what it is, why it
is strong, and **exactly what to borrow** (file convention, schema, mechanism, or detection
marker) to make the skill holistic.

**How this was produced.** Four parallel research streams: a 110-agent web research harness
(fan-out search → fetch → 3-vote adversarial verification → cited synthesis) plus three
hands-on repo investigations (shallow-clone + read real conventions/schemas). Confidence
tags below reflect adversarial vote counts where applicable.

---

## 0. The meta-gap this report serves

Running the skill on LRA scored it **28/100** even though LRA is heavily harnessed — because
the skill is **prescriptive** (hunts for its own filenames: `init.sh`, `feature_list.json`,
`progress.md`) instead of **descriptive** (recognizing the many valid ways a repo satisfies
each subsystem). LRA satisfies every subsystem, just via `Makefile` + `.pre-commit-config.yaml`
+ `specs/NNN/tasks.md` + a rich `CLAUDE.md` + `uv.lock`. The single highest-value change is a
**recognition layer**. Everything below feeds it.

The nine gap areas (from the LRA audit): (1) recognition across conventions, (2) feature/spec/
state tracking, (3) instruction/context standards, (4) environment reproducibility, (5) automated
verification, (6) observability, (7) system-of-record/discoverability, (8) evals/before-after,
(9) multi-agent coordination.

---

## 1. Instruction / context standards (gap #3, feeds #1)

### AGENTS.md — the open agent-context file `[high, 3-0]`
A dedicated, predictable, README-for-agents Markdown file holding build/test/convention context,
kept separate from the human README. Monorepo model: **nearest file in the directory tree wins**
(OpenAI's repo ships 88 of them). Complements, does not replace, README/CLAUDE.md.
- **Borrow:** emit/recognize `AGENTS.md` as the canonical agent-context entrypoint; support
  nested per-directory precedence; treat `CLAUDE.md`, `.cursor/rules`, `.cursorrules`,
  `.github/copilot-instructions.md` as the **same category** (instruction file present).
- **Conventional sections:** `## Setup commands`, `## Code style`, `## Dev environment tips`,
  `## Testing instructions`, `## PR instructions`.
- Source: https://agents.md/ , https://github.com/agentsmd/agents.md

### llms.txt — root markdown index for discoverability `[high, 3-0]`
A `/llms.txt` file: concise background plus hyperlinks to detailed markdown, explicitly to work
around context windows. Fixed order: required H1 (project name) → blockquote summary → optional
detail sections → H2 "file list" sections of markdown links (with optional `: notes`) → a named
`## Optional` section flagging **skippable** content.
- **Borrow:** generate/recognize a root index file pointing agents at deeper docs; the `Optional`
  tier is a lightweight progressive-disclosure flag; flag its absence as a discoverability gap.
- Source: https://llmstxt.org/

### Anthropic Agent Skills — the canonical progressive-disclosure pattern `[high, 3-0]`
Three load levels: **L1 metadata** (~100 tokens, always loaded: `name` + `description` from
frontmatter), **L2 `SKILL.md` body** (<5k tokens, loaded on trigger), **L3+ bundled resources/
scripts** (effectively unlimited; **run via bash, code never enters context** — only output does).
Frontmatter constraints: `name` ≤64 chars lowercase/numbers/hyphens (no reserved `anthropic`/
`claude`); `description` non-empty ≤1024 chars stating **both what it does AND when to use it**.
- **Borrow:** this is the skill's own packaging model — use it as an **instruction-hygiene check**:
  is the instruction file short and routing (progressive disclosure) vs a monolith? (LRA's
  `CLAUDE.md` is 591 lines — flaggable.) Bundled-script-via-bash is why our `.mjs` validators are
  the right shape: deterministic, token-cheap.
- Source: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview

### Agent OS — the `index.yml` relevance index `[high, 3-0]`
A three-layer context model (Standards / Product / Specs). Its strongest borrowable piece is a
machine-readable **`agent-os/standards/index.yml`** mapping each standard to a one-sentence
description, so an agent matches relevance **without reading every file**.
```yaml
root:
  coding-style: { description: General coding style, formatting, linting rules }
api:
  response-format: { description: API response envelope, status codes, pagination }
```
- **Borrow:** the relevance-index pattern for keeping instructions discoverable without context
  bloat; flag its absence when a repo has many docs but no index. Detection: `agent-os/`,
  `agent-os/standards/index.yml`, `agent-os/product/{mission,roadmap,tech-stack}.md`.
- Source: https://github.com/buildermethods/agent-os , https://buildermethods.com/agent-os/v2/3-layer-context

### BMAD-METHOD — pinned-bundle vs external-override split
Every skill ships `customize.toml` stamped "DO NOT EDIT — overwritten on every update"; per-project/
per-user overrides live **outside** the bundle in `_bmad/custom/<skill>.toml` (+ `.user.toml`),
merged scalars-win / arrays-append. Canonical memory is append-only `.memlog.md`; `SPEC.md` is
**derived** from it, never hand-edited.
- **Borrow:** mirrors LRA's own "ops tuning in config, never in the pinned bundle" principle —
  validate that ops overrides are external to pinned skill bundles. Detection: `_bmad/`,
  `bmad-*/SKILL.md` + `customize.toml`, `SPEC.md` + `.memlog.md`.

---

## 2. Feature / spec / state tracking (gap #2, feeds #1)

### GitHub Spec Kit — spec-driven backbone + cross-artifact gate `[high, 3-0]`
Numbered feature dirs with a strict taxonomy and a sequential slash-command pipeline
(`constitution → specify → clarify → plan → tasks → analyze → implement`).
```text
.specify/
  memory/constitution.md          # project invariants/gates plan.md must satisfy
  templates/{spec,plan,tasks}-template.md
  scripts/bash/create-new-feature.sh
  feature.json                    # { "feature_directory": "specs/001-..." }  active pointer
specs/001-feature-name/
  spec.md  plan.md  tasks.md  research.md  data-model.md  contracts/
```
ID grammar for traceability: `FR-001` (functional req), `SC-001` (success criterion), `T001`
(task, tagged `[P]` parallel + `[US1]` story), `US1`/`P1` (story/priority). Task state is markdown
checkboxes `- [ ]`/`- [X]`. Incomplete-spec marker: `[NEEDS CLARIFICATION: …]`.
- **Borrow (recognize):** `.specify/` dir, `specs/[0-9][0-9][0-9]-*/spec.md`, the ID grammar.
- **Borrow (capability):** `/speckit.analyze` is a **cross-artifact consistency gate** (spec ↔
  plan ↔ tasks). We have nothing like it — a "detect spec/tasks drift" check is a high-value add.
- Source: https://github.com/github/spec-kit

### Taskmaster (claude-task-master) — typed task schema `[high; dir/PRD 3-0, schema 2-1]`
State under `.taskmaster/`; source of truth `.taskmaster/tasks/tasks.json` (tagged task lists).
Real Zod schema:
```js
TaskStatus = ['pending','in-progress','blocked','done','cancelled','deferred']  // unionable
BaseTask = { id:int, title, description, status, dependencies:(int|string)[],
             priority:'low|medium|high|critical', details, testStrategy, subtasks[], previousStatus? }
```
Plus a complexity report (`recommendedSubtasks`, `complexityScore`) and `state.json` (`currentTag`).
- **Borrow (recognize):** `.taskmaster/tasks/tasks.json`, `.taskmaster/config.json`, legacy
  `.taskmasterconfig`; structurally any JSON with `tasks:[{id,status,dependencies,...}]`.
- **Borrow (schema):** `testStrategy` per task (binds verification to the unit), `subtasks[]`,
  `previousStatus` (cheap audit trail), an active-pointer file.
- Source: https://github.com/eyaltoledano/claude-task-master , `/docs/task-structure.md`

### Recommended normalized `feature_list` schema v2 (union of the above)
```jsonc
{
  "id": "feat-001",                 // or FR-/SC-/T-/US- traceability ids
  "title": "…", "description": "…",
  "status": "not_started|in_progress|blocked|review|done|deferred|cancelled", // terminal-complete = {done,cancelled}
  "dependencies": ["feat-000"],
  "priority": "low|medium|high|critical",
  "verification": ["npm test -- x"],   // REQUIRED non-empty when done  (our existing gate)
  "evidence": "command + observed output", // REQUIRED non-empty when done
  "testStrategy": "how this is proven",     // from Taskmaster
  "testedAt": "ISO-8601|null",
  "previousStatus": "in_progress",          // cheap audit trail (optional)
  "subtasks": [ … ]
}
```

---

## 3. Environment reproducibility (gap #4 — a missing subsystem)

### Dev Containers — `devcontainer.json` + embeddable reference CLI `[high, 3-0]`
A single file convention (`.devcontainer/devcontainer.json` or `.devcontainer.json`) describing a
reproducible tool/runtime stack; the Dev Container CLI is explicitly designed to be shelled out to.
- **Borrow:** detect `devcontainer.json` as a strong "environment is reproducible" signal; optionally
  scaffold one. Source: https://containers.dev/implementors/spec/ , https://github.com/devcontainers/cli

### Devbox / Nix / mise / asdf / uv — detection matrix `[high, 3-0]`
| Tool | Marker file(s) |
|---|---|
| Devbox (Nix) | `devbox.json`, `devbox.lock` |
| Nix | `flake.nix`, `shell.nix`, `default.nix` |
| mise | `.mise.toml`, `mise.toml` |
| asdf | `.tool-versions` |
| uv (Python) | `uv.lock` + `requires-python` in `pyproject.toml` |
| nvm / Volta | `.nvmrc` / `engines` in `package.json` |
- **Borrow:** an **Environment subsystem** scored on (lockfile present) + (runtime pinned) +
  (reproducible-env config present). LRA has `uv.lock` + `requires-python` — today scored zero.
- Source: https://www.jetify.com/docs/devbox/faq , https://github.com/jetify-com/devbox

---

## 4. Automated verification & quality gates (gap #5, feeds #1)

### pre-commit + Semgrep-as-hook — copyable gate `[high, 3-0]`
A `repo`+`rev` entry in `.pre-commit-config.yaml` runs static analysis on every commit. The
`semgrep/pre-commit` repo defines recognizable hook IDs (`semgrep` / `semgrep-ci`).
- **Borrow:** recognize `.pre-commit-config.yaml` (and its hook IDs) as "verification is automated";
  scaffold a starter config. LRA has 13 hooks (ruff, pyrefly, debug-statements, large-file guard,
  merge-conflict guard) — today uncredited.
- Source: https://semgrep.dev/docs/extensions/pre-commit , https://github.com/semgrep/pre-commit

### reviewdog — diff-scoped reporting `[high, 3-0]`
Filters diagnostics to **only added/modified lines** of a diff (`ModeAdded`/`ModeDefault`), with
optional `diff_context` (±N) and whole-file modes.
- **Borrow (capability):** add a **diff-scoped mode** to our `cleanup-scanner` / `check-architecture`
  so CI gates report only on changed lines — this stops them flagging pre-existing debt and makes
  them adoptable on large legacy repos (the #1 reason such gates get disabled).
- Source: https://github.com/reviewdog/reviewdog

### ast-grep / Semgrep rules — structural checks
Structural (AST) pattern rules generalize our regex-based `check-architecture`. Detection:
`sgconfig.yml` / `.semgrep.yml` / `.semgrep/`. **Borrow:** allow architecture rules to be
expressed as ast-grep/semgrep patterns for languages where regex is too blunt.

### CI detection (any of)
`.github/workflows/*.yml`, `.gitlab-ci.yml`, `azure-pipelines.yml`/`.azure-pipelines/`,
`Jenkinsfile`, `.circleci/config.yml`, `.drone.yml`, `bitbucket-pipelines.yml`.

---

## 5. Observability (gap #6 — a missing subsystem)

### OpenTelemetry GenAI semantic conventions `[high]`
The vendor-neutral schema every LLM tracer maps to. **Moved to a dedicated repo:**
`open-telemetry/semantic-conventions-genai` (old `docs/gen-ai/*` paths are now stubs). All keys
under `gen_ai.*`. The most useful discriminators to detect:
- `gen_ai.operation.name` (values: `chat`, `embeddings`, `retrieval`, `execute_tool`,
  `invoke_agent`, `create_agent`, `invoke_workflow`, `plan`, memory ops)
- `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.usage.input_tokens` /
  `output_tokens`, `gen_ai.tool.name`, `gen_ai.agent.name`, `gen_ai.conversation.id`,
  retrieval: `gen_ai.retrieval.top_k` / `documents`
- Metrics: `gen_ai.client.token.usage`, `gen_ai.client.operation.duration`
- **Borrow:** an **Observability subsystem** check — is the repo wired for agent observability?
  Signals: deps `opentelemetry-sdk`/`-api`/`-exporter-otlp`/`-instrumentation-*`,
  `openinference-instrumentation-*`, `langfuse`, `traceloop-sdk`; env `OTEL_EXPORTER_OTLP_ENDPOINT`/
  `OTEL_SERVICE_NAME`; source grep for literal `gen_ai.` keys. (LRA already uses OpenInference +
  Phoenix — would now score.)
- Langfuse namespace (`langfuse.*`, env `LANGFUSE_PUBLIC_KEY`/`SECRET_KEY`); OpenLLMetry/Traceloop
  (`@workflow`/`@task`/`@agent`/`@tool` decorators, env `TRACELOOP_API_KEY`).
- Source: https://opentelemetry.io/docs/specs/semconv/gen-ai/ , https://github.com/open-telemetry/semantic-conventions-genai

---

## 6. System-of-record / discoverability (gap #7)

### Diátaxis — four-type doc compass `[high, 3-0]`
Partitions all docs into exactly four kinds: **tutorials, how-to guides, reference, explanation**
(axes: action vs cognition; acquisition vs application). Usable as a **mis-filing detector**.
- **Borrow:** classify a repo's docs and flag a missing quadrant (e.g. no how-to, or reference
  mixed into tutorials). Source: https://diataxis.fr/start-here/ , https://diataxis.fr/compass/

### ADRs — architecture decision records
`docs/decisions/` or `docs/adr/` (`adr-tools`, `log4brains`, MADR format). The "why" system-of-record
(course L03). **Borrow:** detect ADR dirs; the discoverability scorer should credit them.

### The "Fresh Session Test" discoverability scorer (from the course, not yet bundled)
A 100-point check: can a cold agent answer — what is this, how is it organized, how do I run it,
how do I verify it, where are we now? **Borrow:** implement as a generic scorer that reads the
instruction file + detected entrypoints and grades coverage.

---

## 7. Evals / before-after benchmarking (gap #8 — the README's admitted-missing item)

### promptfoo — declarative A/B benchmark `[best fit]`
YAML-first (`promptfooconfig.yaml`): matrix of providers × prompts × tests × assertions, with
`threshold`, `repeat`, `cache`, `defaultTest`. Built for side-by-side before/after comparison.
```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts: [prompt1.txt, prompt2.txt]
providers: [openai:gpt-5, anthropic:claude-...]
tests: tests.csv
defaultTest:
  assert: [{ type: llm-rubric }, { type: contains-json }, { type: latency, threshold: 2000 }]
```
Assertion families: deterministic (`equals`/`contains`/`regex`/`cost`/`latency`), code
(`javascript`/`python`), similarity (`similar`/`rouge-n`), model-graded (`llm-rubric`/`factuality`/
`context-faithfulness`), safety (`moderation`).
- **Borrow:** scaffold a `promptfooconfig.yaml` for the before/after harness gap; recognize it
  (marker: `promptfooconfig.yaml`, the `$schema` header, `.promptfoo/` cache).
- Source: https://www.promptfoo.dev/docs/configuration/guide/

### UK AISI Inspect — agentic eval framework `[best for tool-use]`
Code-first: `@task` → `Task(dataset, solver, scorer)`; first-class tool use, sandboxes, multi-step
solver chains, **epochs** (repeat-N for variance), `.eval` logs + `inspect view`.
- **Borrow:** recognize `inspect_ai` dep / `@task` decorators / `.eval` logs; better fit than
  promptfoo when the benchmark needs agentic tool-use + sandbox.
- Source: https://github.com/UKGovernmentBEIS/inspect_ai
- Context (no borrow, breadth): SWE-bench (task corpus), Ragas (RAG metrics), OpenAI Evals.

---

## 8. Multi-agent coordination (gap #9)

Frameworks: LangGraph (graph/state machine), CrewAI (roles/tasks), AutoGen, OpenAI Agents SDK
(handoffs), Claude Agent SDK, OpenHands / SWE-agent (autonomous SWE loops). The skill already
ships a `multi-agent-pattern.md` reference (coordinator-synthesizes, worker tool-filtering,
single-level fork). **Borrow (light):** detect these deps as a "repo uses multi-agent" signal and,
when present, recommend explicit per-agent ownership boundaries (the skill's existing guidance).

---

## 9. The recognition matrix (the P0 deliverable)

For each subsystem, accept **any** of these signals (this is what turns 28/100 on LRA into a true
score that surfaces only real gaps):

| Subsystem | Accepted signals (any) |
|---|---|
| **Instructions** | `AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, `.cursorrules`, `.github/copilot-instructions.md`, `agent-os/standards/`, `/llms.txt` |
| **Verification (entrypoint)** | `init.sh`, `Makefile`, `justfile`, `Taskfile.yml`, `tox.ini`, `noxfile.py`, `package.json` scripts (`test`/`check`/`lint`/`build`), `uv`/`pdm`/`poetry` run targets |
| **Verification (automated)** | `.pre-commit-config.yaml`, CI files (GH Actions / GitLab / Azure / Jenkins / CircleCI), lint/type/test config (`ruff`/`mypy`/`pyrefly`/`eslint`/`tsconfig`/`pytest`) |
| **State / Feature tracker** | `feature_list.json`, `.specify/` + `specs/NNN/{spec,plan,tasks}.md`, `.taskmaster/tasks/tasks.json`, `agent-os/specs/`, BMAD `SPEC.md`+`.memlog.md`, generic `specs/`/`TODO.md`/`ROADMAP.md`, GitHub issues |
| **Scope** | one active feature (WIP from any recognized tracker), `[NEEDS CLARIFICATION]` markers, stated scope rules in instruction file |
| **Lifecycle** | `session-handoff.md`, end-of-session section in instruction file, `progress.md`/`claude-progress.md`, recent commit cadence |
| **Environment** *(new)* | `uv.lock`/lockfiles + runtime pin (`requires-python`/`.nvmrc`/`.tool-versions`), `devcontainer.json`, `devbox.json`, `flake.nix`, `.mise.toml` |
| **Observability** *(new)* | OTel deps (`opentelemetry-*`, `openinference-*`), `langfuse`/`traceloop-sdk`, `OTEL_*` env, source `gen_ai.*` keys |
| **System-of-record** *(new)* | `docs/decisions/`/`docs/adr/`, Diátaxis-shaped `docs/`, `/llms.txt`, ADR tooling config |

---

## 10. Prioritized plan to extend harness-creator

**P0 — recognition layer (kills the false-negative meta-gap)**
1. `recognize.mjs`: evidence-map auditor implementing the matrix above; outputs which mechanism
   satisfies each subsystem + the genuine gaps. Re-score LRA on its actual harness.
2. Extend feature-tracker + verify-entrypoint recognition (spec-kit / taskmaster / agent-os / BMAD;
   Makefile / justfile / Taskfile / tox / nox / scripts).
3. Detect pre-commit + CI + lint/type config as "automated verification present."

**P1 — the three missing subsystems**
4. Environment subsystem check (lockfile + runtime pin + devcontainer/devbox/nix/mise).
5. Observability subsystem check (OTel `gen_ai.*` / langfuse / traceloop deps + env + grep).
6. Discoverability "Fresh Session Test" scorer + ADR/Diátaxis docs detection + `llms.txt` recognition.
7. Instruction hygiene (AGENTS.md presence, file length, progressive-disclosure / relevance-index).

**P2 — new capabilities (borrowed mechanisms)**
8. Cross-artifact consistency gate (spec ↔ tasks drift) — borrowed from spec-kit `/speckit.analyze`.
9. Before/after benchmark via a scaffolded `promptfooconfig.yaml` (closes the README's open item).
10. Diff-scoped mode for `cleanup-scanner` / `check-architecture` — borrowed from reviewdog.
11. `feature_list` schema v2 (union spec-kit IDs + Taskmaster fields).
12. Scaffolders: `AGENTS.md`, `/llms.txt`, `.pre-commit-config.yaml`, `devcontainer.json` when missing.

---

## Sources

Primary (web, adversarially verified): agents.md; llmstxt.org; platform.claude.com Agent Skills;
github.com/github/spec-kit; github.com/eyaltoledano/claude-task-master; github.com/buildermethods/
agent-os; diataxis.fr; containers.dev + github.com/devcontainers/cli; jetify devbox; semgrep
pre-commit; reviewdog; opentelemetry.io GenAI semconv (+ semantic-conventions-genai repo);
promptfoo.dev; github.com/UKGovernmentBEIS/inspect_ai.

Hands-on clones investigated: spec-kit, claude-task-master, agent-os, BMAD-METHOD,
semantic-conventions-genai, inspect_ai (schemas + detection markers quoted in the working notes).
