# How a Skill Behaves at Runtime

Reach for this pattern whenever a piece of agent behavior is worth reusing. Rather than pasting the same lengthy instructions into every repository you touch, fold that behavior into a skill once and let the agent pull it in on demand.

## What a Skill Should Hold

- Workflows that recur and carry across more than one project.
- Decision logic that is specific to a domain or problem area.
- On-demand material — templates, checklists, and references the agent only loads when the moment calls for it.
- Compact helper scripts, provided they are stable and safe to execute.

## What a Skill Should Not Hold

- Facts about one project's architecture; those belong inside the target repository, not the shared skill.
- Any credential — secrets, tokens, private endpoints, or anything tied to a single user.
- Sprawling manuals the agent would be forced to read in full before it can do anything.
- Operations with destructive consequences, unless they are spelled out plainly and gated behind explicit user consent.

## The Progressive-Disclosure Layout

A skill built for real use reveals itself in layers, surfacing only as much as each moment requires:

1. The frontmatter at the top of `SKILL.md` states the conditions under which the skill should fire.
2. The body lays out the leanest workflow that still works dependably.
3. A `references/` directory holds the heavier material, pulled in only when it actually applies.
4. A `templates/` directory supplies artifacts meant to be copied as-is.
5. An `evals/` directory records the quality checks that stand in for typical use.

## Rules of Thumb for Design

- Keep the top-level file short enough to take in at a glance.
- Reach for concrete checklists before reaching for abstract guidance.
- Wire up every bundled file you point to, and confirm each one is actually present.
- Spell out install steps without ambiguity: name the repository, the skill, and the agent it targets.
- Frame scripts as opt-in helpers, never as behavior that runs out of sight.

## Validation Checklist

- [ ] `SKILL.md` is present, and its frontmatter parses cleanly — confirm with `recognize.mjs`.
- [ ] Every file the skill references actually lives inside the skill directory — `validate-harness.mjs` and `cleanup-scanner.mjs` flag the gaps.
- [ ] Templates can be dropped into a target repository without causing harm.
- [ ] The trigger conditions and feature coverage line up — check with `discoverability.mjs`, `validate-feature-list.mjs`, and `check-architecture.mjs`.
- [ ] Nothing in the skill leans on a private local path; `create-harness.mjs` should reproduce it cleanly from scratch.
