# Context Engineering Pattern

## The Problem

Most agent failures trace back to how their context window is curated. Three failure modes recur:

- **Overloaded window** — Cramming everything in slows down session start, drives token spend through the roof, and buries the signal so the model loses the thread.
- **Starved window** — Withhold too much and the agent guesses wrong: it rebuilds things that already exist and breaks established conventions.
- **Misaligned window** — Fill the window with the wrong material and the agent fixates on minutiae while the architectural guardrails never register.

Treat the window not as a place to dump everything you have, but as a finite budget governed by deliberate operations.

## Golden Rules

### The Four Context Operations

Each token that occupies the window has to justify itself through exactly one of these four operations:

1. **SELECT** — Pull context in at the moment it's needed, never the whole library up front.
2. **WRITE** — Let the agent push durable state back out (into memory, persisted state, or rules).
3. **COMPRESS** — Fold older exchanges down on demand once the session grows long.
4. **ISOLATE** — Keep delegated subtasks from leaking their working set into the parent's window.

### Progressive Disclosure

Load context in three tiers, cheapest and most permanent first:

```
Tier 1 — Metadata (always loaded, low cost)
  → feature list, memory index, current session status

Tier 2 — Instructions (loaded when a capability activates)
  → AGENTS.md, skill bodies, style and convention guides

Tier 3 — Resources (loaded only when explicitly needed)
  → architecture write-ups, API references, worked examples
```

The harness reflects these tiers directly: `recognize.mjs` reads the Tier-1 metadata to figure out where it is, while `discoverability.mjs` confirms that the Tier-2 and Tier-3 material an agent will eventually need is actually reachable from those entry points.

### Memoize Costly Builders, but Invalidate by Hand

Any context builder that does real work — say, "collect every recent git commit" — should cache its result so it isn't recomputed for nothing. But that cache **must** be cleared deliberately, at each known point where the underlying data changes. Never lean on reactive or time-based expiry. The discipline is simple: wherever a mutation happens, the matching cache entry gets dropped right there.

## When To Reach For This

Apply this pattern when you see any of the following:

- The agent gets noticeably worse the longer a session runs.
- Sessions are slow to spin up because context is loaded greedily at the start.
- Subtasks you hand off end up contaminating the parent's window.
- Token consumption is hard to forecast from one run to the next.

## Tradeoffs

| Choice | What you gain | What it costs |
|---|---|---|
| Just-in-time loading | Quick startup, minimal idle overhead | The agent can't reason about a skill until it's been activated |
| Fixed caps per block | A token budget you can predict | Occasionally clips context that would have helped |
| Hand-written cache invalidation | No silent staleness creeping in | Every mutation site needs its own invalidation call added |
| Isolation on delegation | The parent window stays clean | The child can't see what the parent has already gathered |

## Implementation Patterns

### Select Pattern

```markdown
## Startup Context (loaded immediately)

- Repository root path
- One-line tech stack summary
- Active feature ID, read from feature_list.json

## On-Demand Context (loaded when something triggers it)

- Skill body: read the moment the skill activates
- Architecture docs: read when starting a new feature
- API reference: read when an external service call is about to happen
```

**Moves that matter:**

- Measure what context actually costs you per turn before optimizing.
- Put a hard cap on every block whose length can vary.
- Leave a recovery breadcrumb wherever you truncate (for example, "run the full listing command for the complete output") so nothing is silently lost.

When you author a harness, `validate-feature-list.mjs` checks that the startup block points at a well-formed `feature_list.json`, and `cleanup-scanner.mjs` flags variable-length blocks that escaped their caps.

### Compress Pattern

A long enough session will eventually outgrow the window. Compact older material on demand:

1. **Trigger** — fire when window usage crosses a threshold (for example, 80%).
2. **Summarize** — condense the older turns (roughly the first 50% measured by token count).
3. **Preserve** — leave the recent tail intact (about the last 20% of turns).
4. **Label** — stamp the resulting snapshot with the turn it was compacted at.

```markdown
## Session Summary (turns 1-15, compacted)

**Goal**: Ship a Q&A feature with citations
**Decisions made**:
- Stream the response for a better UX
- Citation format: inline [doc:chunk] references
**Key files created**:
- src/services/QaService.ts
- src/shared/types.ts (extended with QaResult)
```

### Isolate Pattern

Work you delegate must never spill into the parent's context. Pick the sharing model that fits the job:

| Model | What's shared | Suits |
|---|---|---|
| **Coordinator** (no inheritance) | Nothing — every worker boots from a blank slate | Multi-phase tasks with real complexity |
| **Fork** (full inheritance) | Everything — but one level deep only | Fast parallel splits |
| **Swarm** (peer-to-peer) | A common task list | Independent work that runs for a long time |

**Hard constraint:** Fork only nests one level. Let forks recurse and the context cost compounds exponentially — `check-architecture.mjs` exists in part to catch harness designs that allow this.

## Gotchas

1. **Async units usually skip "pending" entirely** — most register straight into a "running" state, so don't build logic that assumes a pending stage exists.
2. **Memoized builders need manual invalidation** — wire the cache-clear into every mutation point, or you'll serve stale context.
3. **Truncation gives no warning until it happens** — hard caps are applied at read time, so test that the recovery pointers actually work.
4. **The isolation boundary has to hold at call time** — stripping tools out of the prompt isn't enough; enforce the boundary where the call is made.

## Related Patterns

- [Memory Persistence](memory-persistence-pattern.md) — how the memory layers and the context window interact.
- [Multi-agent Coordination](multi-agent-pattern.md) — how context is (and isn't) shared between agents.

## Template: Context Budget

```markdown
## Context Budget (Session)

| Category | Budget | Current | Status |
|----------|--------|---------|--------|
| System prompt | 2,000 | 1,850 | OK |
| Instruction files | 3,000 | 2,400 | OK |
| Memory index | 1,000 | 600 | OK |
| Session history | 10,000 | 4,200 | OK |
| Working context | 15,000 | 3,100 | OK |
| **Total** | **31,000** | **12,150** | 39% used |

**Compaction trigger**: 80% (24,800 tokens)
**Next action**: compact once usage reaches 24,800 tokens
```

`validate-harness.mjs` checks that a generated harness declares a budget like this and that its compaction trigger lines up with the threshold in the Compress pattern above.

## Why This Holds Up

These practices are what working agent runtimes converge on once they hit real-world scale:

- Budgets are stated outright rather than left implicit.
- Progressive disclosure cuts startup latency by roughly 60-80%.
- Invalidating caches by hand heads off the subtle staleness bugs that reactive expiry produces.
- Disciplined isolation is what makes multi-agent coordination dependable instead of flaky.
