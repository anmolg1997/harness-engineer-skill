# Memory and Persistence Pattern

## The Core Problem

An agent that keeps nothing across sessions starts cold every time. The instant a session closes, every preference the user expressed, every fact about the project, and every piece of behavioral correction evaporates. The practical fallout is repetition: the user has to re-issue the same guidance turn after turn ("we run bun here, never npm"), and the agent never builds up the durable working knowledge that separates a tool you tolerate from one that actually earns its keep.

## Principles That Must Hold

### Split memory by who owns it and how long it lasts

Treat memory as three distinct layers rather than one undifferentiated store. Each has a different author, lifetime, and trust level:

- **Instruction memory** — authored by humans, tracked in version control. This is the layer that lives in files such as AGENTS.md, CLAUDE.md, and committed project-convention docs.
- **Auto-memory** — written by the agent itself and meant to survive. Progress logs, handoff notes between sessions, and patterns the agent figured out on its own all land here.
- **Session extraction** — produced in the background. At the end of a session, the transcript is mined automatically for anything worth keeping, with no human in the loop.

### Saving is always two writes, never one

A single memory save is never a single file operation. It is always a pair, in this order:

1. Persist the complete content into its own dedicated topic file.
2. Add one summary line — a pointer back to that topic file — to the index.

The ordering is deliberate. If the agent dies between step one and step two, the only damage is a topic file that nothing points at yet. The index never ends up referencing a file that does not exist, so it stays trustworthy no matter when a crash lands.

### The most local instruction always wins

When the same subject is covered at more than one scope, resolve the conflict in favor of the narrowest, closest scope. Broader scopes establish a baseline; each tighter scope is allowed to narrow or replace it, and the most local statement is decisive:

```
Organization-wide  →  User-level  →  Project-level  →  Local override
       │                  │                │                  │
   sets the         tightens the      tightens         has the
   baseline           baseline         further         final word
```

### Keep the index small and always loaded; keep the detail large and loaded on request

The index and the topic files play opposite roles on purpose:

- **Index** — held to a hard ceiling (on the order of ~200 lines or ~25KB), with exactly one line per entry. It is cheap enough to keep in context at all times.
- **Topic files** — no size limit. They carry the full detail and are pulled in only when a given topic is actually needed.

## When This Pattern Fits

Reach for it when:

- Your agent is expected to live across sessions and recall what the user prefers or how the project is set up.
- Several instruction scopes coexist and you need an unambiguous rule for which one prevails.
- You want the agent to absorb lessons from its sessions without anyone hand-curating them.
- You need end-of-session extraction to happen off to the side, never stalling the user's turn.

## What You Trade Away

| Choice | What you gain | What it costs |
|---|---|---|
| Layered memory | Every scope is independently shareable, auditable, and overridable | More places to look at startup |
| Local-wins priority | Users override behavior without editing files others depend on | A global rule can be quietly displaced |
| Small index + on-demand topics | Context cost stays flat no matter how much memory piles up | One extra fetch step before detail is available |
| Background extraction | Zero added latency on the user-facing response | A timing gap exists between extraction and the next turn |

## How To Build It

1. **Stand up the memory directory idempotently** at startup — for example `.claude/memory/` — so re-running bootstrap never clobbers what is already there.
2. **Lay down the index file** and enforce its ceilings when it is read, not just when it is written.
3. **Wire the two-step save**: topic file first, index line second, always in that sequence.
4. **Trigger background extraction only when the turn is truly finished** — after the final response has gone out and no tool calls are still pending.
5. **Hold mutual exclusion**: if the main agent already committed something to memory this turn, do not also run extraction for the same turn.
6. **Provide a review path** so proposals to promote knowledge from one layer up to another can be inspected before they take effect.

## Sharp Edges

1. **The index cap fails quietly** — nothing warns you as entries pile up; truncation just happens. Keep each line terse so you stay well under the ceiling.
2. **The priority order feels backwards at first** — remember local beats project, project beats user, user beats org. The narrowest scope wins.
3. **Background extraction opens a race window** — the user can fire off the next turn before extraction has finished writing.
4. **Re-derivable facts do not belong here** — anything you can reconstruct by reading the codebase (architecture, code patterns) should be derived on demand, not stored.
5. **Orphaned topic files build up over time** — schedule periodic cleanup so abandoned files do not accumulate.

## Related Patterns

- [Context Engineering](context-engineering-pattern.md) — budgeting context across the memory layers.
- [Lifecycle & Bootstrap](lifecycle-bootstrap-pattern.md) — how startup discovers and loads memory.

## Template: Progress Log

```markdown
# Session Progress Log

## Current State (Last Updated: YYYY-MM-DD HH:MM)

**Active Feature:** feat-003 - Q&A with Citations
**Status:** In Progress (60% complete)

### Done
- [x] Document chunking pipeline
- [x] Index data structure
- [ ] Q&A handler (in progress)

### In Progress
- Building the Q&A IPC handler
- Open question: streaming response vs. batched

### Blockers
- Awaiting a call on citation format (footnotes vs. inline)

### For Next Session
1. Finish the Q&A handler
2. Wire up citation formatting
3. Run an end-to-end pass
```

## Validation In This Harness

The harness-engineer scripts exercise the pieces of this pattern directly. `recognize.mjs` detects which memory layers an existing harness already has in place. `discoverability.mjs` confirms the index is reachable and that topic files can be located from it on demand. `validate-feature-list.mjs` and `validate-harness.mjs` check that the two-step save contract and the layer separation hold up across the harness. `cleanup-scanner.mjs` surfaces orphaned topic files no index line points at — the accumulation gotcha above. `check-architecture.mjs` verifies the priority ordering and mutual-exclusion rules are wired correctly, and `create-harness.mjs` scaffolds the memory directory, index, and save flow idempotently when a new harness is generated.
