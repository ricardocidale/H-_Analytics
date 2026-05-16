---
title: "ce-plan plan synthesis must delegate to Claude Opus — never Sonnet"
date: 2026-05-16
module: ce-plan
problem_type: convention
component: development_workflow
severity: high
applies_when:
  - "Running /ce-plan or any planning synthesis workflow"
  - "Dispatching a subagent to write or synthesize an implementation plan document"
  - "Any task where the primary output is a structured implementation plan"
tags:
  - ce-plan
  - model-selection
  - opus
  - planning
  - subagent-dispatch
  - agent-workflow
---

# ce-plan plan synthesis must delegate to Claude Opus — never Sonnet

## Context

Plan synthesis in `/ce-plan` runs on whatever model the caller session uses — typically Sonnet,
which is the orchestrator for most CC sessions. The user established a standing directive in
session `f85bf8d3` (2026-05-15): plan synthesis must always be explicitly delegated to
Claude Opus 4.7 via a subagent with `model: "opus"`.

The directive was validated against the T3-1 Matteo model router plan, which was authored by an
Opus subagent and produced measurably deeper risk treatment, more rigorous unit decomposition,
and stronger test scenario specificity than a Sonnet-authored equivalent.

The convention exists only in the auto-memory standing directives file and in session history —
it is **not** encoded in `ce-plan`'s SKILL.md (as of 2026-05-16). Any session that does not
load that memory file, or any future update to the skill that does not carry the rule forward,
would silently revert to Sonnet synthesis with no warning.

## Guidance

When invoking `/ce-plan` or any workflow that produces a structured implementation plan:

1. **Do NOT write the plan document on Sonnet.** The orchestrator gathers and synthesizes
   research findings but must not author the plan itself.
2. **Dispatch a subagent explicitly on the Opus tier** — pass `model: "opus"` in the Agent
   tool call.
3. **Pass the full research context in the subagent prompt.** The Opus agent should be able
   to write a complete, standalone plan without requiring additional tool calls.
4. **The Opus subagent uses the Write tool** to save the plan file to disk at the agreed path.
5. **The orchestrator does not post-process or rewrite** the plan — accept the file the Opus
   agent produces.

**Applies to:**
- `/ce-plan` invocations
- Any direct architectural synthesis or planning work
- Cross-cutting plans with significant risk treatment or multi-unit decomposition

**Does NOT apply to:**
- Implementation work (`ce-work` correctly uses Sonnet)
- Quick single-file fixes or mechanical changes
- Status updates, commit messages, and other low-stakes writing

## Why This Matters

Planning on Sonnet produces lower-quality plans: shallower risk treatment, weaker test
scenarios, thinner architectural rationale, and less rigorous unit decomposition. Because
plans anchor implementation for one or more follow-on sessions, a lower-quality plan creates
compounding downstream costs — units get scoped incorrectly, risks surface during
implementation rather than planning, and verification sections are underspecified.

The per-invocation cost difference between Opus and Sonnet plan synthesis is negligible
compared to the cost of re-planning mid-implementation or discovering missed risks during
code review.

The structural risk of losing this convention is also material: the convention lives only in
the auto-memory standing directives file, not in the skill itself. Future sessions loading
`ce-plan` without that memory context would silently produce Sonnet-authored plans.
(session history) — this was the explicit concern raised when the directive was established.

## When to Apply

Apply whenever a planning artifact is being written, regardless of how the session started.
If `/ce-plan` or any ad-hoc planning workflow is underway and the orchestrator is Sonnet,
the plan synthesis step requires an Opus subagent dispatch.

The directive is unconditional — it applies even when:
- The plan is short or has few implementation units
- Research context is already fully loaded
- The session started as a coding task and pivoted to planning
- The user did not explicitly mention Opus in the current turn (the standing directive covers it)

## Examples

**Before (violation) — orchestrator writes the plan directly on Sonnet:**
```typescript
// Orchestrator is Sonnet; plan authored by the same model
await collectResearchFindings();
await Write({ file_path: "docs/plans/...", content: completePlanContent });
// ↑ This is Sonnet writing the plan — violates the convention
```

**After (correct) — orchestrator delegates synthesis to Opus subagent:**
```typescript
// Orchestrator (Sonnet) gathers context, dispatches to Opus
const research = await collectResearchFindings();

await Agent({
  model: "opus",                          // ← explicit Opus tier
  description: "Write T3-1 Matteo model router plan",
  prompt: `
    You are writing a technical implementation plan.
    Write it to docs/plans/2026-05-16-002-feat-matteo-model-router-plan.md
    using the Write tool.

    ## Research findings (use these — do not re-derive)
    ${research}

    Write the complete plan to disk. Do not truncate.
  `
});
// ↑ Opus agent uses Write internally — plan is on disk when agent returns
```

The key shape: the orchestrator passes all research as a self-contained prompt payload, the
Opus agent owns the Write call, and the orchestrator does not touch the file afterward.

## Related

- `docs/solutions/conventions/section-9-vs-subagent-dispatch-guard-2026-05-11.md` —
  similar "always do X regardless of context" rule for financial engine surface protection
- `docs/solutions/architecture-patterns/hplus-specialist-design-discipline-from-ce-researchers-2026-05-13.md` —
  Pattern #19: model tier pinning — the baseline for when to pin a model tier vs. inherit
  from the caller; the Opus-for-planning rule is an application of this principle
- `docs/solutions/architecture-patterns/agent-autonomy-managed-agents-dreaming-strategy-2026-05-16.md` —
  model routing matrix (does not include plan synthesis as of 2026-05-16; this convention
  fills that gap)
- Auto-memory standing directives:
  `/home/runner/.claude/projects/-home-runner-workspace/memory/feedback-standing-directives-2026-05-15.md`
- CLAUDE.md §12 — model cost optimization (Opus for financial engine + cross-cutting refactors
  + deep debugging; this convention extends Opus coverage to plan synthesis)
