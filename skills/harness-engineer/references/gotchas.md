# Failure Modes in Harness Engineering

A catalogue of the surprises that bite you when building an agent harness. Each one is a behaviour that looks fine on paper but produces bugs the moment you assume it works the obvious way. Treat these as invariants to defend, not trivia.

---

## 1. The Memory Index Trims Itself Without Telling You

**Symptom**: Entries you just wrote vanish from the index, and nothing logs an error.

**Cause**: The index is bounded by hard ceilings that are checked the moment it's read back (for example 200 lines or 25KB, whichever comes first). A verbose entry — a paragraph-long recap — can blow the byte ceiling while still looking innocent against the line ceiling, so it gets dropped.

**Fix**: Treat every index line as a single short pointer. Anything longer lives in a dedicated topic file that the index merely references.

```markdown
✓ Good: "Use bun, not npm - user preference 2024-01-15"
✗ Bad: "The user prefers bun over npm because it's faster. This was discussed on 2024-01-15 when the user said 'use bun not npm' and I updated the package.json accordingly..."
```

---

## 2. Precedence Doesn't Run the Direction You Expect

**Symptom**: A rule you set globally gets quietly clobbered by something in the repo, with no warning.

**Cause**: The closer a rule lives to the work, the more authority it carries. A local override beats a project rule, a project rule beats a user-level rule, and a user-level rule beats an org-level rule. So if you inject at the user tier assuming it's the final word, any local override file sitting in the project root will simply win instead.

**Fix**: Never validate precedence against a single file in isolation. Reconstruct the entire instruction-file stack and confirm which layer actually takes effect.

```bash
# Inspect the full precedence stack, lowest authority first
cat ~/.claude/CLAUDE.md          # User tier
cat ./CLAUDE.md                   # Project tier
cat ./CLAUDE.local.md             # Local override — this is the winner
```

---

## 3. Extraction Overlaps the Next Turn

**Symptom**: The background extractor is still committing memory from the last response when the user fires off their next message.

**Cause**: Extraction kicks off as the response wraps up, but nothing stops the user from continuing the conversation before that job has finished.

**Fix**: Merge overlapping extraction requests into a single run rather than letting them stack. Only move the read cursor forward once a run lands cleanly — if a run fails, leave the cursor where it is so those same messages get another pass on the following turn.

---

## 4. Anything the Repo Can Tell You Doesn't Belong in Memory

**Symptom**: The index bloats with architecture notes and code facts that go out of date almost immediately.

**Cause**: The agent keeps recording things it could simply re-read from the source: the layout of the system, recurring code idioms, the history of how a module changed.

**Fix**: Make derivable content un-saveable by construction. The type taxonomy for memory entries should have no category that permits writing down what already lives in the repository.

---

## 5. Concurrency Safety Is a Property of the Call, Not the Tool

**Symptom**: A tool you labelled "safe to run in parallel" still produces a race.

**Cause**: One tool can be perfectly safe for certain arguments and dangerous for others. The safety verdict can't be baked into the tool definition because it depends on what's actually being invoked.

**Fix**: Decide concurrency safety per invocation, at the moment of the call, by inspecting its arguments.

```typescript
// Wrong — a static flag on the tool:
toolRegistry.register('shell', { concurrentSafe: false });

// Right — judged at call time from the arguments:
function isCallConcurrentSafe(call: ToolCall): boolean {
  if (call.args.command.startsWith('rm -rf')) return false;
  if (call.args.command.startsWith('cat')) return true;
  // ...continue classifying from the live arguments
}
```

---

## 6. Checking a Permission Mutates State

**Symptom**: Running a permission check once visibly alters how later calls behave.

**Cause**: The permission evaluator isn't a read-only lookup. As it runs it records denials, may shift the active mode, and otherwise updates internal state as a deliberate side effect.

**Fix**: Don't memoize or reuse a permission verdict across calls. Run the evaluation fresh every single time.

---

## 7. "Pending" Is Mostly a Phantom State

**Symptom**: A UI built around a "pending" indicator shows it, but real work units never actually pass through that state.

**Cause**: In practice, work units enter the system already marked "running." The "pending" state exists in the state machine but is almost never the one a unit starts in.

**Fix**: Don't design any UI on the assumption that work begins in "pending" and transitions out of it.

---

## 8. A Forked Child Is Not Allowed to Fork Again

**Symptom**: Context consumption blows up exponentially.

**Cause**: Forks that can fork recursively stack context on context — the parent plus child A plus child B plus all of their descendants, compounding at each level.

**Fix**: Hold the single-level rule absolutely: a child may never fork. Keep the fork tool present in the child's tool pool so the prompt cache prefix stays shared, but reject the fork at call time.

---

## 9. Context Builders Are Cached, and You Clear the Cache by Hand

**Symptom**: The model keeps reading stale data for the rest of the session.

**Cause**: A context builder's output is memoized once at startup. There's no automatic link between mutating the underlying data and clearing that cached value.

**Fix**: Wire an explicit cache-clear into every place that mutates the data, keyed to the matching cache entry.

```typescript
// Each mutation site is responsible for its own invalidation:
async function editFile(path: string, content: string) {
  await writeFile(path, content);
  context.cache.invalidate(`file:${path}`); // REQUIRED — otherwise the model reads stale content
}
```

---

## 10. Hook Trust Is Decided Once, for the Whole Set

**Symptom**: A single questionable hook takes the entire extension system offline.

**Cause**: Trust is evaluated at the workspace level. If the workspace isn't trusted, every hook is skipped — there's no triage that disables only the risky ones.

**Fix**: Put the trust decision at the dispatch boundary and treat it as a single gate for all hooks. Don't try to grade hooks individually for trustworthiness.

---

## 11. You Can't Evict a Result Before the Parent Has Heard About It

**Symptom**: A parent is permanently unable to read its work unit's result.

**Cause**: The work unit gets evicted before the parent is told it finished, so the parent reaches for a result that's already been garbage-collected — a straight race between cleanup and notification.

**Fix**: Split eviction into two phases:
1. Eagerly delete the on-disk output as soon as the unit reaches a terminal state.
2. Lazily drop the in-memory record only after the parent has been notified of completion.

---

## 12. The Skill Listing Has Almost No Room

**Symptom**: A skill's description gets cut off and can no longer trigger reliably.

**Cause**: Skill descriptions are joined together and each one is clipped to a tight per-entry budget (around 150 characters). Whatever sits at the front of the description survives; the rest is lost.

**Fix**: Lead with the most distinctive trigger words so they land inside the budget.

```markdown
✓ Good: "harness-patterns: Memory, permissions, context engineering, multi-agent"
✗ Bad: "A comprehensive skill for understanding and implementing various patterns related to AI agent harnesses and runtime systems..."
```

---

## 13. Tools Default to "Allow"

**Symptom**: A tool sails past the gate you expected to stop it.

**Cause**: A tool that ships no permission logic of its own hands the decision entirely to the rule-based system, where the unconfigured default is "allow."

**Fix**: For anything sensitive, set the default explicitly instead of relying on the implicit one.

```typescript
registry.register('shell', {
  defaultPermission: 'ask', // never leave this as the implicit 'allow'
  // ...
});
```

---

## 14. Team Memory Rides on Auto-Memory

**Symptom**: Team-shared memory stays dead even though it's configured correctly.

**Cause**: Team memory is built on top of the very same directory and index machinery that auto-memory uses. Turning auto-memory off — through an env var or a setting — pulls the floor out from under team memory too.

**Fix**: Confirm auto-memory is on before you switch team memory on. Verify both the feature gate and the actual enablement check, not just one of them.

---

## 15. Orphaned Topic Files Pile Up

**Symptom**: `.claude/memory/topics/` slowly eats disk space.

**Cause**: Saving a memory takes two steps — write the topic file, then point the index at it. A crash landing between those steps leaves a topic file on disk that the index never references.

**Fix**: Run a periodic sweep that deletes any topic file the index doesn't point to. Orphans never corrupt the index itself; they just waste space until reclaimed.

---

## Related Reading

- [Memory Persistence Pattern](memory-persistence-pattern.md) — Failure modes #1, #3, #4, #15
- [Tool Registry Pattern](tool-registry-pattern.md) — Failure modes #5, #6, #13
- [Multi-agent Pattern](multi-agent-pattern.md) — Failure modes #8, #11
- [Context Engineering Pattern](context-engineering-pattern.md) — Failure mode #9
- [Lifecycle Pattern](lifecycle-bootstrap-pattern.md) — Failure modes #10, #14
