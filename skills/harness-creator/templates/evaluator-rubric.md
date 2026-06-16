# Evaluator Rubric

Use a **separate evaluator role** from the one that wrote the code. An agent
judging its own work is systematically overconfident — it will identify issues
and then talk itself into approving anyway. Separate the worker from the checker.

## Who evaluated
- Mode: ☐ self-review  ☐ separate evaluator agent  ☐ planner + generator + evaluator
- Reviewed at: <timestamp>
- Feature(s) under review: <feat-ids>

## Scoring (0–2 each)

| Dimension | Score (0/1/2) | Notes / evidence |
|---|---|---|
| Correctness — does the behavior actually work end-to-end? | | |
| Verification — did the stated `verification` commands really run and pass? | | |
| Scope discipline — only the active feature changed; no drive-by refactors | | |
| Reliability — error paths handled; no obvious runtime failure modes | | |
| Maintainability — readable, matches existing patterns, no dead/debug code | | |
| Handoff readiness — state files updated; next session can resume | | |

**Total: __ / 12**

## Verdict
- ☐ **Accept** (all dimensions ≥ 1 and Correctness + Verification = 2)
- ☐ **Revise** (specific, evidence-based changes listed below)
- ☐ **Block** (cannot proceed; reason recorded)

Feedback must be evidence-based, never taste-based. Good: "contrast is 2.1:1
vs WCAG AA 4.5:1." Bad: "it doesn't feel right." Every requested change names
what failed, why, and how to fix it.

## Revision evidence (if revised)
| Round | Change requested | Re-checked result |
|---|---|---|
| 1 | | |

---

## Tuning this rubric (do not skip)

Agents are poor self-judges, so the rubric itself must be calibrated against a
human before you trust its scores:

1. Run the rubric on a completed sprint.
2. Compare the agent's verdict to your own judgment.
3. Wherever they diverge, make the relevant dimension **more specific** (add a
   concrete threshold or example that would have caught the miss).
4. Re-run and repeat.

Plan **3–5 tuning rounds** and record each change. An untuned rubric produces
confident, wrong scores — the exact failure it is meant to prevent.
