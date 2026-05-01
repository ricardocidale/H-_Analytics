# Handoff: Phase 1b — Analyst Skills and Vocabulary Rules

**From:** Replit Agent
**To:** Claude Code
**Date:** 2026-04-19
**Phase 1a context:** see `docs/architecture/ANALYST.md` and the eight per-component specs in `docs/architecture/analyst/` (all shipping in the same commit as this handoff).
**Why this is a handoff and not a direct edit:** `.claude/rules/claude-replit-split.md` reserves `.claude/**` content (skills, rules, notes) for Claude Code. Replit Agent is restricted to ≤5-line appends to `.claude/session-memory.md` and `BLOCKED.md` siblings.

---

## Scope of work

Create the `.claude/`-side companions to the Phase 1a docs. Three deliverables:

1. **`.claude/skills/analyst/`** — a new skill directory with 9 skill files mirroring the per-component docs.
2. **`.claude/rules/analyst-team.md`** — internal vocabulary rule.
3. **`.claude/rules/analyst-verdict-contract.md`** — placeholder rule pointing forward to Phase 3.

Total: ~12 short files. No engine code, no schema, no UI. All five verification gates must pass.

---

## File 1: `.claude/skills/analyst/_index.md`

Landing page for the skill directory. Should:

- State the skill's purpose: "Authoritative reference for any work touching The Analyst."
- List the other files in the directory with one-line descriptions.
- Link out to the architecture docs (`docs/architecture/ANALYST.md`, `docs/architecture/analyst/*.md`) and to the persona rule (`.claude/rules/the-analyst-persona.md`) and to the existing Cognitive Engine note (`.claude/notes/analyst-architecture.md`).
- State the canonical reading order for a contributor new to The Analyst.

Template: ~80-120 lines.

---

## File 2: `.claude/skills/analyst/orchestrator.md`

Skill for the **Surface Router** (the user's "orchestrator").

Pull the contract from `docs/architecture/analyst/surface-router.md`. The skill version should be more directive ("when implementing the router, always …") whereas the architecture doc is descriptive ("the router is …").

Critical rules to encode:
- No LLM calls in the Router. Period.
- Every dispatch goes through Voice Renderer before returning.
- Conviction-floor decisions live in the Router, not in Specialists.
- Multi-Specialist aggregation is the Router's job.

Template: ~100-150 lines.

---

## Files 3-7: Surface Specialist skill files

Five files, one per Specialist family:

- `.claude/skills/analyst/surface-mgmt-co.md`
- `.claude/skills/analyst/surface-property.md`
- `.claude/skills/analyst/surface-admin-defaults.md`
- `.claude/skills/analyst/surface-icp.md`
- `.claude/skills/analyst/surface-cross-portfolio.md`

(Plus `.claude/skills/analyst/surface-staleness.md` if you decide Staleness warrants its own skill — I'd lean yes for parity with the architecture docs.)

Each should pull from the corresponding `docs/architecture/analyst/*-specialist*.md` and add directive guidance for implementers:
- Tier-0 vs Tier-1 evaluation rules
- When to consult the Cognitive Engine
- Cross-surface implication conventions
- Persona-keyed test obligations

Template: ~80-120 lines each.

---

## File 8: `.claude/skills/analyst/cognitive-engine.md`

Skill that points implementers at `.claude/notes/analyst-architecture.md` as the authority on the Cognitive Engine, plus directive rules for working with the Engine façade (`engine/analyst/cognitive/engine-client.ts` in Phase 2):

- Specialists never import `research-orchestrator.ts` directly; always go through `engine-client.ts`.
- N+1 evidence is required for Tier-1 calls (existing rule, surfaced here).
- Deterministic-tool rule applies inside the Engine (existing `.claude/rules/deterministic-tools.md`, surfaced here).
- Cognitive Engine internals changes require an ADR.

Template: ~80-100 lines.

---

## File 9: `.claude/skills/analyst/voice.md`

Skill for the Voice Renderer. Pull from `docs/architecture/analyst/voice-rendering.md` and from `.claude/rules/the-analyst-persona.md`.

Critical rules to encode:
- Specialists never craft user-facing strings; only Voice Renderer does.
- Forbidden pattern list (must mirror `tests/audit/vocabulary-compliance.test.ts`).
- Severity → tone map and Quality → conviction-label map.
- Range-first, conviction-led, investor-aware tone.

Template: ~100-150 lines.

---

## File 10: `.claude/skills/analyst/quality-scoring.md`

Skill for the Quality Scorer. Pull from `docs/architecture/analyst/quality-scoring.md`.

Critical rules to encode:
- The 6-component weighted score (formula visible in skill).
- Conviction floor enforcement (`< 40` downgrades severity).
- The badge label mapping (mirrors `confidence-scorer.ts`).
- Persona-fit scoring guidance.

Template: ~80-120 lines.

---

## File 11: `.claude/skills/analyst/steward.md`

The change-control gate. This is the most important file in the directory.

Required checklist (every PR touching anything analyst-shaped must pass):

1. Is your change Surface tier or Cognitive tier? (Different rules apply.)
2. Does any new function returning a verdict return `AnalystVerdict`? (Phase 3+)
3. Does it meet the evidence tier? (Tier-0 = constants OK; Tier-1 = N+1 sources)
4. Did you add or update a persona-keyed golden test (at minimum the L+B persona)?
5. Did you update the relevant `.claude/skills/analyst/<file>.md` and `docs/architecture/analyst/<file>.md`?
6. If irreversible: did you write an ADR under `docs/architecture/decisions/`?
7. Did you preserve singular-Analyst voice in any user-facing string?
8. Did you run all five gates in `.claude/rules/pre-commit-verification.md`?
9. Did you check `.claude/rules/cross-check-invariants.md` for any invariant pair your change triggers?

Template: ~120-180 lines. This file should be the longest skill file — it's the gate, not a description.

---

## File 12: `.claude/rules/analyst-team.md`

The vocabulary rule. Codifies the resolution of singular-voice vs internal-team-naming.

Required content:
- Statement of the user-facing rule (unchanged from `the-analyst-persona.md`): The Analyst is singular, capitalized, with "The".
- Statement of the internal vocabulary: Surface Specialist, Cognitive Engine, Cognitive Panel, Surface Router, Voice Renderer, Quality Scorer. With definitions.
- Pointer to the per-component docs in `docs/architecture/analyst/` for each term.
- Hard rule: internal team terms must NEVER appear in user-facing code (vocabulary test enforces).
- Hard rule: user-facing singular-Analyst voice must NEVER appear in code-level identifiers (e.g., a function called `theAnalystValidates()` is a code smell — use `analystVerdict.validate()` or `mgmtCoFundingSpecialist.evaluate()` etc.).

Template: ~80-120 lines.

---

## File 13: `.claude/rules/analyst-verdict-contract.md`

Placeholder rule pointing forward. Required content:

- The contract `AnalystVerdict` will be defined in Phase 3 at `engine/analyst/contracts/verdict.ts`.
- Architecture spec is in `docs/architecture/analyst/verdict-contract.md`.
- Until Phase 3 lands, divergent shapes from `engine/watchdog/*Evaluator.ts`, `analyst-watchdog.computeFieldAlerts`, `analyst-table-refresh`, etc., are tolerated.
- After Phase 3 lands, every Specialist must return `AnalystVerdict`. Adding a Specialist with a different shape is a violation.

Template: ~50-80 lines (it's a placeholder; will be replaced/expanded when Phase 3 ships).

---

## Verification (mandatory)

Per `.claude/rules/pre-commit-verification.md`, all five gates before commit:

1. `npx tsc --noEmit` — exit 0
2. `npm run lint` — exit 0
3. `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 pass
4. `npm run test:summary` — all pass
5. `npm run verify:summary` — UNQUALIFIED

These should all pass trivially since the changes are MD-only and `.claude/` paths aren't in the TS include set. But run them anyway — the rule is non-optional.

Commit message should include:
```
Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED
```

Per `.claude/rules/claude-replit-split.md` §Guardrail #3, include a `Surfaces:` footer (the relevant surface here is documentation; the dependency-surface code in `.claude/audit-inventory.md` will tell you the exact tag).

---

## What this handoff does NOT include

- Any `engine/analyst/` skeleton work (that's Phase 2; my responsibility, not yours).
- Any CODEOWNERS edit (Phase 2; mine).
- Any ESLint rule (Phase 2; mine).
- Any code under `engine/`, `server/`, `client/`, `shared/`, `calc/`, `tests/` — these are out of scope for Phase 1b.
- Any modification to existing `.claude/rules/the-analyst-persona.md` — it remains the user-facing voice authority, untouched.

---

## When this is done

- Append a one-line entry to `.claude/session-memory.md`: "Phase 1b complete: analyst skills + vocabulary rules landed."
- Reply on whatever channel the user uses to relay handoffs that Phase 1b is ready, so I can proceed to Phase 2.
