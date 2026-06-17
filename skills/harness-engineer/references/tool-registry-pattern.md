# Tool Registry and Safety Pattern

## What This Solves

To get real work done, an agent has to reach beyond text generation: run shell
commands, mutate files, query indexes, and so on. The catch is that every
capability you hand it widens the blast radius. Three failure modes dominate:

- **Irreversible damage** — a single call wipes a directory (`rm -rf`), drops a
  table, or reformats a disk.
- **Concurrency hazards** — two calls touch the same state at once and corrupt it.
- **Permission drift** — a rule is misconfigured and the agent quietly does
  something it was never supposed to be allowed to do.

The answer is a registry that **denies by default**, tags concurrency at the
moment of the call, and runs every request through a layered permission chain
with a fixed precedence.

## Golden Rules

### Default to deny

Every tool is treated as **state-mutating** and **serial-only** until someone
deliberately declares otherwise. Two payoffs:

- A batch of calls never fans out in parallel unless each one is proven safe to,
  so writes don't race each other.
- A freshly added tool can't leak destructive behavior simply because its author
  forgot to set a flag — the unsafe assumption is the resting state.

### Classify concurrency at the call, never at the tool

A tool's safety depends on its arguments, not its name. The exact same tool can
be harmless for one invocation and dangerous for the next:

```
✓ Parallel-safe (no shared-state mutation):
  - cat config.json
  - grep -r "TODO" src/
  - ls -la

✗ Serial-only (mutates state, network, or many files):
  - rm -rf dist/
  - npm install            # writes the tree + hits the network
  - sed -i 's/foo/bar/g' **/*.ts
```

When a round of tool calls arrives, the runtime walks the batch and splits it
into adjacent runs. A stretch of parallel-safe calls executes together; the
moment a serial-only call appears, it opens a sequential segment that the safe
calls cannot jump ahead of. Classification therefore has to read the arguments —
`validate-harness.mjs` flags any registry whose concurrency decision is keyed
purely on tool identity, since that's the tell-tale sign of the bug this rule
exists to prevent.

### The permission pipeline carries state

Treating the evaluator as a pure predicate is a mistake. Resolving a permission
also **mutates session state**:

- It records each denial, which feeds the audit trail and any rate-limiting.
- It can escalate the prevailing mode — for instance, flipping a tool from
  auto-approve to ask-every-time once it has been refused.
- Those updates persist into the session as a deliberate side effect.

The layers are consulted in a **non-negotiable order**, from broadest authority
to narrowest:

```
Organization policy → User preferences → Project rules → Local overrides → Session grants
```

The first layer that returns a verdict wins; a layer that has no opinion passes
the decision down to the next.

## When To Reach For This

- Your runtime has to let tools register themselves.
- You're running tool calls in parallel and need to gate which ones may.
- You need approval tiers (auto-approve / prompt / refuse).
- You want a usable record of what each tool did, for auditing.

## Tradeoffs

| Choice | Upside | Downside |
|---|---|---|
| Deny-by-default flags | Anything new is locked down on arrival | Authors must opt in before parallelism is possible |
| Per-call classification | Parallelism is decided with full context | Every call must be inspected, not just registered once |
| Layered permission sources | Policies compose cleanly across scopes | Conflicting layers are awkward to trace |
| Stateful evaluator | Behavior can react to prior decisions | No longer referentially transparent, so harder to unit-test |

## How To Build It

### Registering a tool

```typescript
// Shape of a registry entry
interface ToolDefinition {
  name: string;
  description: string;
  handler: (args: any) => Promise<any>;

  // Safety flags — both default to the unsafe assumption
  isReadOnly: boolean;       // Default: false
  isConcurrentSafe: boolean; // Default: false

  // Optional per-tool gating that overrides the rule chain
  permissionCheck?: (args: any, context: ToolContext) => PermissionResult;
}

// Wiring tools in
registry.register('read_file', {
  name: 'read_file',
  description: 'Return the contents of a file',
  handler: readFile,
  isReadOnly: true,
  isConcurrentSafe: true,  // Reading several files at once is fine
});

registry.register('write_file', {
  name: 'write_file',
  description: 'Create or overwrite a file',
  handler: writeFile,
  isReadOnly: false,
  isConcurrentSafe: false, // Serialize writes so they can't clobber each other
});
```

### Walking the permission layers

```typescript
// Resolve a verdict by descending the precedence chain
async function evaluatePermission(
  toolCall: ToolCall,
  context: PermissionContext
): Promise<PermissionResult> {

  // 1. Org policy — top authority, applies everywhere
  const policyResult = await policyEngine.check(toolCall, context);
  if (policyResult !== 'defer') return policyResult;

  // 2. User preferences
  const userResult = await userSettings.check(toolCall, context);
  if (userResult !== 'defer') return userResult;

  // 3. Project rules
  const projectResult = await projectRules.check(toolCall, context);
  if (projectResult !== 'defer') return projectResult;

  // 4. Local overrides
  const localResult = await localOverrides.check(toolCall, context);
  if (localResult !== 'defer') return localResult;

  // 5. Session grants — last word, narrowest scope
  return sessionGrants.check(toolCall, context);
}
```

### Rules that no mode can override

Some targets and commands must stay outside the reach of auto-approval no matter
which layer or mode is active. Keep them in a declarative list so they're easy to
audit and impossible to bypass by toggling a setting:

```yaml
# Paths that auto-approve can never touch
protected_paths:
  - /etc/**
  - /usr/**
  - node_modules/**
  - .git/**

# Commands that always force a prompt
protected_commands:
  - "rm -rf*"
  - "DROP TABLE*"
  - "DELETE FROM*"
  - "mkfs*"
```

`check-architecture.mjs` treats the presence of a bypass-immune list as a
required structural property of any generated harness; `cleanup-scanner.mjs`
flags entries that have been commented out or shadowed by a more permissive rule.

## Gotchas

1. **The "pending" state is usually skipped** — most async work units land
   straight in "running" rather than waiting in a queued limbo first.
2. **Permission verdicts must not be memoized** — because evaluation mutates
   session state, a cached result from an earlier call will be stale and wrong.
3. **You cannot classify on the tool name alone** — the arguments decide whether
   a call is parallel-safe, so the inputs have to be inspected every time.
4. **A tool with no custom check defaults to the rule chain, which resolves to
   "allow"** — that's intentional, but it means forgetting bypass-immune rules is
   silently permissive rather than safe.
5. **Garbage collection waits on notification** — a work unit that has reached a
   terminal state is only eligible for eviction once its parent has been told.

## Related Patterns

- [Lifecycle & Bootstrap](lifecycle-bootstrap-pattern.md) — where tools get
  registered during initialization
- [Skill Runtime](skill-runtime-pattern.md) — how the pre/post execution hooks
  wrap a tool call

## Template: Tool Safety Checklist

Run through this before turning on any new tool. `validate-feature-list.mjs`
expects each new tool entry to have a corresponding completed review:

```markdown
## Tool Safety Review

**Tool name**: [e.g., execute_shell]

### Classification
- [ ] Decided whether it is read-only (yes / no / argument-dependent)
- [ ] Decided whether it is parallel-safe (yes / no / argument-dependent)
- [ ] Wrote down the argument patterns that make it unsafe

### Permission Requirements
- [ ] Default mode is "ask" or "deny"
- [ ] Bypass-immune paths and commands listed
- [ ] Custom permission check written, if the rule chain isn't enough
- [ ] Audit logging switched on

### Testing
- [ ] Exercised with safe arguments (expect auto-approve)
- [ ] Exercised with dangerous arguments (expect prompt or refusal)
- [ ] Exercised parallel calls (unsafe ones must serialize)
- [ ] Exercised the failure path (errors logged, state left consistent)
```

`recognize.mjs` and `discoverability.mjs` look for this checklist alongside each
registered tool when scoring a harness, so keeping it filled in directly affects
the assessment.

## Why It Works

This shape recurs across hardened agent runtimes that share the same properties:

- Tools advertise their concurrency safety with explicit, default-unsafe flags.
- Permission resolution descends a layered chain — preferences, then project,
  then session — with a fixed precedence.
- A protected paths-and-commands list sits above every auto-approve mode.
- Concurrency is settled per call, partitioning each batch into parallel-safe
  and serial-only segments rather than trusting the tool's name.
