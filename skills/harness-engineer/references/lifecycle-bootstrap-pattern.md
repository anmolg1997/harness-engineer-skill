# Lifecycle and Bootstrap Pattern

## The Core Tension

An agent runtime has to stay open to extension while never letting that openness become an attack surface or a source of instability. Three capabilities pull in that direction:

- **Hooks** — let callers splice their own logic into fixed lifecycle moments (before and after a tool runs, when a session opens or closes, around prompt submission).
- **Background work** — gives the runtime a way to follow tasks that outlive a single turn without freezing the foreground agent.
- **Bootstrap** — establishes a single, ordered startup path that every launch surface (CLI, server, SDK) flows through.

Left unchecked, each of these turns into a liability:

- Hooks supplied by an untrusted workspace become a vector for arbitrary code execution.
- Background tasks that never reach a terminal state pile up and leak memory and disk.
- Startup steps that fire in an undefined order produce races and half-built contexts.

## Foundational Rules

### Hook Trust Is Binary

Trust is evaluated for the workspace as a whole, not per hook. The moment a workspace fails the trust check, **every** hook is bypassed — there is no partial mode where some "safe-looking" hooks still fire. This keeps the security decision to a single yes/no and removes any need to reason about which individual hooks might be dangerous. Hooks registered only for the current session are transient: they exist for the life of that session and are torn down when it ends.

```typescript
// Hook dispatch guarded by a single workspace-level trust check
async function dispatchHook(
  hookType: HookType,
  context: HookContext,
): Promise<HookResult[]> {

  // Single gate: an untrusted workspace disables the entire hook set
  if (!context.trustBoundary.crossed) {
    logger.warn("workspace not trusted — bypassing all hooks");
    return [];
  }

  // Session-scoped hooks are transient and discarded when the session closes
  const sessionHooks = context.hooks.getByScope("session");
  const projectHooks = context.hooks.getByScope("project");

  return await Promise.all([
    ...sessionHooks.map((h) => h.execute(context)),
    ...projectHooks.map((h) => h.execute(context)),
  ]);
}
```

### Background Work Runs as a Typed State Machine With Two-Phase Eviction

Every unit of background work carries:

1. **A typed, prefixed identifier** — for example `extraction-001` or `benchmark-002`, so the kind of work is legible from the ID alone.
2. **A constrained set of states** — it moves from `running` to exactly one terminal state: `completed`, `failed`, or `killed`. No other transitions are legal.
3. **An output written to disk** — results are persisted, not held purely in process memory.

Cleanup happens in two distinct phases:

1. The **on-disk output** is reclaimed promptly, as soon as the task reaches a terminal state.
2. The **in-memory record** is reclaimed only afterward, once the parent that spawned the work has been told the outcome.

Splitting eviction this way means memory stays roughly flat regardless of how many tasks run concurrently, while still guaranteeing the parent always gets a chance to read the result before the bookkeeping disappears.

### Bootstrap Runs in Dependency Order, With Each Stage Memoized

Whichever surface starts the runtime — CLI, server, or SDK — they all converge on one ordered initialization path:

```
Stage 1: Build a minimal context (requires no trust)
  ↓
Stage 2: Register read-only tools (safe to load before trust)
  ↓
Stage 3: Cross the trust boundary (the user grants consent)
  ↓
Stage 4: Bring up trust-gated subsystems (telemetry, secret environment variables)
```

**The pivotal constraint:** no subsystem that touches sensitive data or capability may come online until the trust boundary has been crossed. Trust is the dividing line between "read-only, safe-by-default" startup and everything that follows.

## When This Pattern Fits

Reach for it when you need to:

- Extend agent behavior without editing the runtime's core code.
- Keep tabs on background work that spans more than one turn.
- Funnel several launch surfaces through one well-defined startup sequence.
- Run logic at specific lifecycle points (around tool calls, at session open/close, around prompts).

## Tradeoffs

| Choice | What you gain | What it costs |
|---|---|---|
| Binary hook trust | One clean security boundary, trivial to reason about | A single untrusted hook takes the whole extension layer offline |
| Disk-backed task output | Memory footprint stays flat no matter the concurrency | Extra I/O latency that scales with the number of work units |
| Dependency-ordered bootstrap | Every launch surface shares one path | Startup is serial — stages can't run in parallel |
| Memoized stages | Re-initialization is cheap | Memoization must be invalidated carefully whenever config changes |

## How to Implement It

### Hook Lifecycle

Six hook types fire at well-defined moments:

```typescript
interface HookRegistry {
  // Session boundaries
  onSessionStart: (context: SessionContext) => Promise<void>;
  onSessionEnd: (context: SessionContext) => Promise<void>;

  // Around tool execution
  preToolExecute: (context: ToolContext) => Promise<ToolContext>;
  postToolExecute: (context: ToolResult) => Promise<ToolResult>;

  // Around prompt submission
  prePromptSubmit: (context: PromptContext) => Promise<PromptContext>;
  postPromptSubmit: (context: ResponseContext) => Promise<ResponseContext>;
}

// Hooks are wired in through config rather than hard-coded, e.g.:
// hooks.preToolExecute = "scripts/audit-tool-call.js"
```

### Tracking Background Work

```typescript
interface TaskRegistry {
  // Hand out a typed, prefixed ID
  registerWork(
    type: "extraction" | "benchmark" | "indexing",
    outputType: "json" | "text" | "file",
  ): string; // e.g. returns "extraction-001"

  // Only the legal transitions are accepted
  updateState(
    taskId: string,
    state: "running" | "completed" | "failed" | "killed",
    output?: unknown,
  ): void;

  // Two-phase eviction
  evictTask(taskId: string): void;
  // Phase 1: drop the on-disk output (eager, on reaching a terminal state)
  // Phase 2: drop the in-memory record (deferred, after the parent is notified)
}
```

### The Bootstrap Sequence

```typescript
// Dependency-ordered, memoized initialization
class AgentBootstrap {
  private stages = new Map<string, Stage>();
  private memoizedCallers = new Map<string, unknown>();

  async bootstrap(entryMode: "cli" | "server" | "sdk"): Promise<AgentContext> {

    // Stage 1: minimal context, no trust needed
    await this.runStage("minimal-context", async () => {
      return {
        cwd: process.cwd(),
        entryMode,
        trustBoundary: { crossed: false },
      };
    });

    // Stage 2: read-only tools, safe before trust
    await this.runStage("load-tools", async (context) => {
      context.tools = await this.loadSafeTools();
      return context;
    });

    // Stage 3: trust boundary — user grants consent
    await this.runStage("trust-boundary", async (context) => {
      const consent = await this.requestConsent();
      context.trustBoundary = { crossed: consent };
      return context;
    });

    // Stage 4: trust-gated subsystems — only once consent is in hand
    if (context.trustBoundary.crossed) {
      await this.runStage("load-sensitive", async (context) => {
        context.telemetry = await this.loadTelemetry();
        context.secretEnvVars = await this.loadSecrets();
        return context;
      });
    }

    return context;
  }

  private async runStage(
    name: string,
    fn: (context: AgentContext) => Promise<AgentContext>,
  ): Promise<void> {
    // Memoized: a stage already marked complete is skipped
    if (this.stages.has(name) && this.stages.get(name).complete) {
      return;
    }

    const stage = { name, complete: false, running: true };
    this.stages.set(name, stage);

    try {
      await fn(this.context);
      stage.complete = true;
    } finally {
      stage.running = false;
    }
  }
}
```

## Easy Things to Get Wrong

1. **Trust is binary, by design.** A single untrusted hook switches off the whole extension system — that's intended, not a bug.
2. **Most background work never visits a "pending" state.** Units typically register straight into `running`; don't build logic that assumes an intermediate queued phase.
3. **Eviction waits on notification.** A task that has reached its terminal state is only eligible for garbage collection after its parent has been informed of the result.
4. **Memoized dispatch must be concurrency-safe.** When several callers hit the same memoized stage at once, none of them may trigger a re-run.
5. **Keep hook types disjoint.** Overlapping hook scopes create ambiguity about which hook owns a given moment — define them so they never collide.

## Related References

- [Tool Registry](tool-registry-pattern.md) — how tools get registered during bootstrap
- [Memory Persistence](memory-persistence-pattern.md) — how memory is loaded at init

## Verification Template

Before you call bootstrap finished, walk this checklist. The harness scripts back each stage: run `recognize.mjs` to confirm what the runtime detected about its environment, `discoverability.mjs` and `validate-feature-list.mjs` to confirm tools and capabilities surfaced correctly, `check-architecture.mjs` to confirm the staged ordering holds, `validate-harness.mjs` for the end-to-end gate, and `cleanup-scanner.mjs` to confirm nothing leaked. (`create-harness.mjs` is the generator that lays this structure down in the first place.)

```markdown
## Bootstrap Verification

### Stage 1: Minimal Context
- [ ] Working directory resolved and confirmed
- [ ] Entry mode identified (cli / server / sdk)
- [ ] Trust boundary still uncrossed (no secrets loaded yet)

### Stage 2: Tools Loaded
- [ ] Read-only tools registered (read, search, glob)
- [ ] Write tools deliberately NOT registered yet (edit, shell)
- [ ] Tool permissions left at their default (ask / deny)

### Stage 3: Trust Boundary
- [ ] User consent obtained (interactive prompt or config flag)
- [ ] Consent persisted into session state
- [ ] Security audit entry written

### Stage 4: Trust-Gated Subsystems
- [ ] Telemetry brought up (only if consent was granted)
- [ ] Secret environment variables loaded (only if consent was granted)
- [ ] Write tools now registered (edit, shell, exec)
- [ ] Hook system activated (only if the workspace is trusted)

### Stage 5: Background Tasks
- [ ] Task registry stood up
- [ ] Cleanup handlers wired in
- [ ] Drain-on-shutdown behavior configured

## On Any Stage Failure

- Bootstrap stops at once — no later stage runs
- The session falls back to safe mode (read-only)
- The failure is logged with the stage name and the reason it failed
```

## Why It Holds Up

These lifecycle and bootstrap mechanics earn their place in real runtimes because:

- Hook dispatch keys off one workspace-level trust decision rather than per-hook guesswork.
- Background tasks are identified by typed, prefixed IDs and persist their output to disk.
- Initialization runs in dependency order, with each stage memoized so re-entry is cheap and safe.
- The trust boundary stands as the explicit, non-negotiable gate in front of every sensitive subsystem.
