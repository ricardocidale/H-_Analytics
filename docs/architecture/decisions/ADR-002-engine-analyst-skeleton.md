# ADR-002: `engine/analyst/` skeleton, naming-lint guard, and CODEOWNERS gate

**Status:** Accepted
**Date:** 2026-04-19
**Deciders:** Replit Agent (Phase 2 implementer), Norfolk AI architect
**Tags:** analyst, engine, structure, governance

---

## Context

ADR-001 accepted The Analyst as a two-tier system (Cognitive Engine + Surface Specialists, joined by an `AnalystVerdict` contract). Phase 1 produced the documentation spine and the Claude Code skill directory but **no executable home**. The two existing tab evaluators (`engine/watchdog/capitalRaiseEvaluator.ts`, `engine/watchdog/revenueEvaluator.ts`) sit under `engine/watchdog/`, not under any "Analyst" path. The Surface Router, Voice Renderer, Quality Scorer, and `AnalystVerdict` contract have no folder to live in.

Three risks if Phase 2 doesn't act:

1. **Drift between docs and code.** The ANALYST.md spine names six surfaces; the codebase shows only `watchdog/`. New contributors will reach for `watchdog/` and re-cement the legacy shape.
2. **Internal team vocabulary leaks to the user.** The persona rule forbids plural ("the analysts"), "the system", and the team names (Surface Specialist, Cognitive Engine, Surface Router, Voice Renderer, Quality Scorer). The vocabulary test catches the first two; nothing currently catches the team names.
3. **Architecture changes get made without architect review.** With no `CODEOWNERS` file in the repo, the analyst spine, ADRs, and skills can be edited by any contributor without trace.

---

## Decision

We make three separable, low-blast-radius changes:

### 1. Land the `engine/analyst/` skeleton (re-exports only)

```
engine/analyst/
├── index.ts                              barrel
├── README.md                             layout + conventions
├── contracts/index.ts                    placeholder for AnalystVerdict (Phase 3)
├── router/index.ts                       placeholder for Surface Router    (Phase 3)
├── voice/index.ts                        placeholder for Voice Renderer    (Phase 3)
├── quality/index.ts                      placeholder for Quality Scorer    (Phase 3)
└── surface/
    ├── index.ts                          barrel
    ├── mgmt-co/index.ts                  re-exports evaluateCapitalRaise + evaluateRevenue
    ├── property/index.ts                 placeholder
    ├── admin-defaults/index.ts           placeholder
    ├── icp/index.ts                      placeholder
    ├── cross-portfolio/index.ts          placeholder
    └── staleness/index.ts                placeholder
```

Phase 2 ships **structure only**. No new logic. The `surface/mgmt-co/` re-export of the two existing evaluators is the only line crossed — and it's a re-export, not a move, so legacy import paths continue to work until Phase 3 backfills both evaluators to the `AnalystVerdict` contract.

### 2. Add a naming-lint guard for internal vocabulary

In `eslint.config.mjs`, add an error-level `no-restricted-syntax` rule that bans the five internal team-vocabulary phrases — `Surface Specialist`, `Cognitive Engine`, `Surface Router`, `Voice Renderer`, `Quality Scorer` — from `Literal` and `JSXText` nodes inside `client/src/**`.

The rule is **error-level** in the `client/**` block even though the surrounding financial rules in that block are warn-level. Persona violations are not warnings.

This is the static-analysis complement to the runtime Voice Renderer arriving in Phase 3. The two together form a defense-in-depth against vocabulary leakage.

### 3. Add a `CODEOWNERS` file at `.github/CODEOWNERS`

Owners gate the analyst spine, the ADRs, the analyst-domain rules and skills, and the `engine/analyst/` and `engine/watchdog/` directories. The owner placeholder is `@Norfolk-Group/admins`; teams may refine to a more specific handle (e.g. `@Norfolk-Group/analyst-architects`) without changing the structure.

---

## Consequences

### Positive

- **Code now matches docs.** A contributor who reads ANALYST.md can `cd engine/analyst/` and see the same shape.
- **Phase 3 lands without restructure.** The contracts, router, voice, and quality folders already exist; Phase 3 fills them.
- **Persona drift gets caught at edit time.** ESLint fires before commit; combined with the vocabulary test (forbidden persona phrases) and Phase 3's runtime Voice Renderer, vocabulary leakage requires three independent failures to ship.
- **Architectural changes have a paper trail.** CODEOWNERS forces a review on any analyst-domain edit, including ADRs.
- **Re-export shim preserves callers.** Today's `import { evaluateRevenue } from "engine/watchdog/revenueEvaluator"` keeps working; tomorrow's `import { evaluateRevenue } from "engine/analyst/surface/mgmt-co"` also works. Cutover happens at Phase 3 backfill on the new path's terms.

### Negative

- **Empty placeholders carry a maintenance reminder cost.** Each `export {};` index.ts is a small commitment that something will arrive there. If Phase 3 slips, the directory looks abandoned. Mitigated by the README documenting expected arrivals per phase.
- **Two import paths for the same evaluator** during the Phase 2 → Phase 3 → Phase 4 transition. Mitigated by ADR-003 (TBD) which will retire the `engine/watchdog/` path once backfill ships.
- **CODEOWNERS placeholder owner** (`@Norfolk-Group/admins`) may not match the actual GitHub team name. The file is correct in structure; the handle requires one targeted edit by whoever creates the team.
- **Naming-lint regex is broad.** The five phrases are exact-match substrings; the rule does not distinguish "the Surface Specialist returned …" (correct internal log line) from "the Surface Specialist will help you" (forbidden user-facing string) — but the rule is scoped to `client/src/**` only, where the distinction collapses (everything user-facing).

### Neutral / Notable

- **The skeleton compiles to nothing useful** today. By design. Phase 2 is structural, not behavioral. Verification of structure is "the build still passes and re-exports still resolve."
- **`engine/watchdog/` stays put.** The Phase 2 decision is to *parallel* it, not replace it. Phase 3's backfill is the move; Phase 2 is the ramp.

---

## Alternatives considered

**A. Move (not re-export) the two evaluators into `engine/analyst/surface/mgmt-co/` immediately.**

Rejected. A move forces a same-PR update of every caller (server route handlers, tests, fixtures). Phase 2's purpose is to land structure with zero blast radius; a move is a coupled migration that belongs in Phase 3 alongside the contract backfill.

**B. Wait until Phase 3 to create the directories.**

Rejected. The longer the docs claim a structure that the code doesn't have, the more contributors invent ad-hoc placements (a new evaluator file appearing under `server/ai/` because that's "where evaluators live"). Empty placeholders + a README beat absent directories at communicating intent.

**C. Use a runtime check for vocabulary instead of ESLint.**

Rejected as a *replacement*, accepted as a *complement*. ESLint catches at edit time and is part of the five-gate pre-commit pass; the runtime Voice Renderer (Phase 3) catches at request time. We want both — the runtime check is defense in depth, not redundancy.

**D. Skip CODEOWNERS until a real team handle exists.**

Rejected. The placeholder cost is one line edit later; the cost of not having the file is unreviewed analyst-domain edits today. Better to commit the structure with a placeholder and adjust the handle than to leave the gate absent.

---

## Implementation notes

- All twelve `index.ts` placeholders use `export {};` (engine/** bans `any`, so no implicit-any concern). The four barrel files (`engine/analyst/index.ts`, `engine/analyst/surface/index.ts`) re-export their children with `.js` extensions for ESM compatibility.
- The single non-empty re-export is `engine/analyst/surface/mgmt-co/index.ts`, which forwards `evaluateCapitalRaise`, `evaluateStub`, `evaluateRevenue`, plus their input/result types from `engine/watchdog/`.
- The naming-lint rule lives in `eslint.config.mjs` as the constant `ANALYST_INTERNAL_VOCAB_FORBIDDEN_IN_CLIENT` and is applied inside the `client/src/**` block. A pre-flight grep confirmed zero existing offenders in `client/src` — the rule is enforceable from day one with no remediation backlog.
- CODEOWNERS gates: `/engine/analyst/`, `/engine/watchdog/`, `/docs/architecture/ANALYST.md`, `/docs/architecture/analyst/`, `/docs/architecture/decisions/`, `/.claude/rules/the-analyst-persona.md`, `/.claude/rules/analyst-team.md`, `/.claude/rules/analyst-verdict-contract.md`, `/.claude/skills/analyst/`, `/.claude/notes/analyst-architecture.md`.

---

## References

- Related ADRs: `ADR-001-analyst-two-tier.md`
- Related architecture docs: `docs/architecture/ANALYST.md`, `docs/architecture/analyst/*.md` (per-component specs), `docs/architecture/analyst/HANDOFF-claude-code-phase-1b.md`
- Related skill files: `.claude/skills/analyst/_index.md` and siblings; `.agents/skills/architecture-decision-records/SKILL.md`; `.agents/skills/pre-commit-gates/SKILL.md`; `.agents/skills/cross-check-invariants/SKILL.md`
- Related rules: `.claude/rules/the-analyst-persona.md`, `.claude/rules/analyst-team.md`, `.claude/rules/analyst-verdict-contract.md`, `.claude/rules/pre-commit-verification.md`, `.claude/rules/cross-check-invariants.md`
- External: GitHub CODEOWNERS docs (https://docs.github.com/en/repositories/managing-your-repositories-settings-and-features/customizing-your-repository/about-code-owners), ESLint `no-restricted-syntax` (https://eslint.org/docs/latest/rules/no-restricted-syntax)
