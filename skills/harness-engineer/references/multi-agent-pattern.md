# Coordinating Multiple Agents

## Why Reach For More Than One Agent

A lone agent eventually runs into a wall along one of three axes:

- **Window pressure** — a single session can't simultaneously carry deep research, a working implementation, and the verification trail without spilling over its context budget.
- **Role separation** — research, building, and reviewing want different mindsets, different tool access, and different success criteria; cramming them into one persona blurs all three.
- **Concurrency** — sometimes you want several candidate approaches tried at once instead of one after another.

The catch is that handing work to a fleet of agents trades one set of problems for another. Left unmanaged, the failure modes are predictable:

- two workers go off and research the same thing independently
- the orchestrator passes raw findings downstream instead of distilling them
- each new layer of delegation drags along its parent's accumulated context, and the cost balloons

The patterns below exist to capture the upside without inheriting the chaos.

## Non-Negotiables

### The Orchestrator Digests; It Does Not Hand Off Comprehension

The single most common mistake is treating a worker as if it shares your understanding.

**What goes wrong:**

> "Given what you found, go fix the auth system."

**What works:**

> "The research surfaced three auth flows — login, logout, and token refresh. Build ONLY the token-refresh handler, following the JWT approach captured in [research output]. Send back: the implementation diff plus test output."

The orchestrator's whole reason to exist is to compress worker output into a tight, unambiguous instruction *before* the next agent starts. If you skip that compression step, you've delegated the thinking, not the work — and the downstream agent has to reconstruct context it was never given.

### Three Ways To Delegate

| Mode | What's Shared | Where It Shines | The Limit |
|------|---------------|-----------------|-----------|
| **Coordinator** | Nothing — every worker boots clean | Multi-stage jobs that move research → distill → build → check | Most overhead, but the most predictable |
| **Fork** | Everything — the child copies the parent's full transcript | Fast parallel branches that all need the same loaded context | **One level deep only** — letting forks fork compounds context cost geometrically |
| **Swarm** | Indirect — peers coordinate through a common task board | Independent streams of work that run over a long horizon | **No hierarchy** — members can't recruit additional members |

### Spawning Returns An ID Now; Output Shows Up Later

Registering a worker is fire-and-forget: the call hands you back a handle immediately and the actual result lands afterward, via callback or polling. The parent stays free to keep working in the meantime.

```typescript
// Register a worker and receive its handle right away
const taskId = await coordinator.spawn({
  type: 'research',
  prompt: 'Map the auth flows...',
  toolFilter: ['read', 'search'], // narrow the toolset
});

// The parent keeps going while the worker runs;
// the worker's output arrives asynchronously (callback or poll).
```

## Good Signals To Split The Work

- the job is simply bigger than one session can hold
- you want to trial several designs side by side
- you need standing specialists you can keep coming back to — a researcher, a builder, a reviewer
- the workflow naturally breaks into distinct phases

## What Each Mode Costs You

| Mode | Throughput | Blast Radius | Context Overhead |
|------|-----------|--------------|------------------|
| **Coordinator** | Slowest | Most contained | Minimal — nothing is inherited |
| **Fork** | Quickest | Moderate | Heaviest — the entire parent transcript rides along |
| **Swarm** | In between | Moderate | Moderate — only the shared board is carried |

## How Each Mode Looks In Practice

### Coordinator (the default for anything intricate)

The work moves through stages, and the orchestrator distills between every one:

```
Stage 1: Research
  ↓ (distill the findings)
Stage 2: Plan
  ↓ (turn the plan into exact specs)
Stage 3: Build
  ↓ (verify)
Stage 4: Review
```

```typescript
// A staged coordinator run
const research = await coordinator.spawn({
  role: 'researcher',
  prompt: `Survey the current authentication code under ${authDir}.
  Identify: the login flow, the logout flow, and token handling.
  Send back: structured findings ONLY. Do not propose implementations.`,
  toolFilter: ['read', 'search', 'glob'], // read-only — no writes
});

await coordinator.synthesize(research.results);

const implement = await coordinator.spawn({
  role: 'implementer',
  prompt: `Build the token-refresh handler per the JWT approach
  decided in [Stage 2 findings].
  Constraints: follow the existing AuthService conventions and add tests.`,
  toolFilter: ['read', 'search', 'edit', 'test'], // write access granted
});
```

### Fork (strictly one level)

```typescript
// The parent hands its loaded context to a couple of children at once
const forks = await Promise.all([
  coordinator.fork({
    prompt: 'Build the login handler',
    inheritContext: true, // copies the parent's full history
  }),
  coordinator.fork({
    prompt: 'Build the logout handler',
    inheritContext: true,
  }),
]);

// IMPORTANT: a forked child must never fork again.
// Allow it, and the cost stacks: parent + child1 + child2 + grandchildren + ...
```

### Swarm (flat membership)

```typescript
// A standing team that pulls from a shared queue
const swarm = new Swarm([
  { id: 'researcher', specialty: 'research' },
  { id: 'implementer', specialty: 'implementation' },
  { id: 'reviewer', specialty: 'verification' },
]);

// Members claim tasks off the queue and post outcomes back to shared state
await swarm.dispatch({
  taskId: 'feat-001',
  pickedBy: 'implementer',
});
```

## Traps Worth Naming

1. **A fork's children stay leaves.** Guard against recursive forking so the one-level rule holds. It's fine to leave the fork capability in a child's toolset — that keeps the prompt cache warm — but reject the call when it actually tries to fork.
2. **Coordinator workers wake up empty.** They know only what their prompt says. Never assume a worker can see anything the parent learned; if it isn't in the prompt, it doesn't exist for that worker.
3. **Swarm members are peers, not managers.** The roster stays flat on purpose, so the team can't grow itself without bound.
4. **Prompts must stand on their own.** "Based on what you found" presumes context the worker never had — distill first, then write a prompt that's complete by itself.
5. **Scope each worker's tools to its job.** A researcher has no business writing files; a builder doesn't need a wide search surface. Trim the toolset to the role.

## Companion References

- [Context Engineering](context-engineering-pattern.md) — how to isolate context across delegations
- [Lifecycle & Bootstrap](lifecycle-bootstrap-pattern.md) — how agents come into being at startup

## Template: A Self-Standing Worker Prompt

```markdown
# Self-Contained Worker Prompt

## Context (distilled by the coordinator)

**Task**: Build the token-refresh handler
**Background**: Research found JWT-based auth issuing 24h access tokens.
**Decision**: Rotate refresh tokens (mint a fresh refresh token on every refresh).

## Your Role

You are the **builder**. Write production code that satisfies the spec above.

## Constraints

- Reuse the conventions already in `${authServicePath}`
- Cover both the success and the failure paths with tests
- Leave the login/logout handlers alone — they belong to a separate task

## Your Tools

- read, search, edit, test
- Shell: limited to npm test and npm run check

## Deliverable

Send back:
1. The implementation diff (which files changed)
2. Test outcomes (pass/fail)
3. Anything blocking you, or questions you need answered

**Do NOT send back**: research notes, architecture debates, or alternative designs.
```

## What This Is Grounded In

These conventions hold up under load in real harnesses — and the harness-engineer tooling assumes them. When a generated harness is checked with `validate-harness.mjs` and its delegation structure with `check-architecture.mjs`, the same invariants apply:

- coordinator workers begin with no inherited context
- forking is capped at a single level to keep context from exploding
- swarm members talk through a shared task board rather than prompting one another directly
- spawning is fire-and-forget, with the handle returned up front and results delivered later

The companion scripts lean on the same principles: `recognize.mjs` identifies the delegation mode in play, `discoverability.mjs` checks that worker roles and tools are legible, `validate-feature-list.mjs` confirms declared capabilities line up with what's wired, `cleanup-scanner.mjs` flags orphaned or runaway worker registrations, and `create-harness.mjs` scaffolds new harnesses that respect these contracts from the start.
