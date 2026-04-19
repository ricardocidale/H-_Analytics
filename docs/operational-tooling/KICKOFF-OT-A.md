# Kickoff — Phase OT-A

**For:** Replit Agent
**From:** Claude Code
**Full brief:** `docs/operational-tooling/HANDOFF-replit-phase-OT-A.md`
**Date:** 2026-04-19

Paste the block below into Replit Agent to start execution. The full handoff with per-task scope, schema Amendment 1, boundaries, and verification rubric is in the brief file — this kickoff is the tight summary + entry prompt.

---

## Paste this

```
Read docs/operational-tooling/HANDOFF-replit-phase-OT-A.md and execute.

Main is at fc25a7f3. Phase 3b landed cleanly (ee0c6573); five gates
UNQUALIFIED green. No rebase needed — OT-A surfaces (server/ai/clients.ts,
research-orchestrator.ts, research-value-extractor.ts) were untouched
by 3b.

Four sub-tasks, four commits expected, each gated by the full five-gate
verification block (TS 0 / Lint 0 / Vocab 11-11 / test:summary PASS /
Verify UNQUALIFIED).

OT-A.1 — Anthropic native prompt caching on synthesis + panel calls
(cache_control: { type: "ephemeral" }). ~10 lines. Ship FIRST — pays
for itself on every synthesis call regardless of the broader migration.
Verify cache_read_input_tokens > 0 on the second call.

OT-A.2 — Install @ai-sdk/* packages (ai, @ai-sdk/anthropic,
@ai-sdk/google, @ai-sdk/openai). AI_GATEWAY_API_KEY is already in
Replit Secrets. Create server/ai/ai-sdk-clients.ts wrapper routing
through AI Gateway with BYOK (existing provider keys continue to flow,
zero Gateway markup). Include a throwaway smoke test at
tests/ai/ai-sdk-client.smoke.test.ts to prove end-to-end connectivity.
No existing call sites change yet.

OT-A.3 — Create server/ai/synthesis-schema.ts from Amendment 1 at the
end of the handoff (paste verbatim). Add a parallel synthesis path in
research-orchestrator.ts behind USE_AI_SDK_SYNTHESIS env flag (default
false). Run 20-case A/B on real research inputs. Document results in
docs/operational-tooling/OT-A-3-ab-results.md. Parity criteria: severity
match ≥95%, numeric midpoints within ±5%, voice violations = 0, latency
regression ≤ 20%.

OT-A.4 — ONLY if OT-A.3 parity passes ALL criteria: flip flag default
(or remove flag), delete the old synthesis block, delete
server/ai/research-value-extractor.ts (195 lines), delete the A.2 smoke
test. If parity fails on any criterion, file BLOCKED-OT-A.md and stop.

Boundaries per the handoff §"what NOT to touch":
- No engine/analyst/** (Phase 3b / Phase 4 territory)
- No engine/watchdog/*Evaluator.ts
- No server/routes/** (Phase 3b wired /save-tab already)
- No client/src/** (UI already consumes voice.headline)
- No .claude/rules/**
- No tests/analyst/**
- No eslint.config.mjs
- No .github/CODEOWNERS

Commit cadence: one commit per sub-task. Each commit independently passes
all five gates. No "build on a failing commit."

Commit message footer on every commit:
  Surfaces: S8 (A.1/A.2/A.4) or S8, S10 (A.3)
  Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED

Rollback: A.1/A.2/A.3 are env-var-level rollback (set flag off or
revert baseURL). A.4 is a git revert — research-value-extractor.ts
restores from history.

When all four sub-tasks are done: ≤5-line append to
.claude/session-memory.md with the four commit SHAs + any caveats from
OT-A-3-ab-results.md. Reply here so Claude Code can draft OT-B
(Promptfoo PR-gate).

If any instruction contradicts .claude/rules/claude-replit-split.md,
pre-commit-verification.md, or cross-check-invariants.md, the rules
win — flag the contradiction in BLOCKED-OT-A.md and stop.
```

---

## Prerequisites (already satisfied)

- ✅ `AI_GATEWAY_API_KEY` in Replit Secrets
- ✅ Phase 3b merged (`ee0c6573`)
- ✅ Main at `fc25a7f3`, five gates UNQUALIFIED
- ✅ Handoff brief committed at `docs/operational-tooling/HANDOFF-replit-phase-OT-A.md`
- ✅ `SynthesisOutputSchema` content inlined in Amendment 1 of the brief

---

## After OT-A lands

Claude Code will draft the OT-B handoff (Promptfoo PR-gate on persona drift). OT-C (Braintrust adoption) is a week-7 decision point based on OT-A and OT-B data.

See the overall OT roadmap in the brief §"Relationship to Phase 3b".
