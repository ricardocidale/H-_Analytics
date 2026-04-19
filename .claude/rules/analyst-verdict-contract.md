# Analyst Verdict Contract — Binding (Post-Phase-3a)

Phase 3a landed the real contract. This rule is now binding — not a placeholder. Every Surface Specialist in the codebase must produce an `AnalystVerdict`; every consumer must consume one. Shape drift is a blocking bug.

**Where the contract lives:**

| Concern | Location |
|---|---|
| TypeScript type + Zod schema | `engine/analyst/contracts/verdict.ts` |
| Architecture spec | `docs/architecture/analyst/verdict-contract.md` |
| Decision record | `docs/architecture/decisions/ADR-003-analyst-verdict-contract.md` |
| Invariant tests | `tests/analyst/verdict-shape.test.ts` |
| Persona-keyed golden bench | `tests/analyst/personas/lb.test.ts` |
| Build helper (mandatory for construction) | `buildAnalystVerdict()` in `verdict.ts` |

---

## Hard rules

### 1. Every Specialist returns `AnalystVerdict`

New Specialists always. Legacy evaluators migrate via Phase 3b; until they land, the two surviving `WatchdogResult` returns in `engine/watchdog/capitalRaiseEvaluator.ts` and `revenueEvaluator.ts` are tolerated ONLY because Replit Agent's Phase 3b backfill replaces them — not because the shape is still negotiable.

Shipping a new Specialist that returns anything other than `AnalystVerdict` is a violation.

### 2. Construct verdicts via `buildAnalystVerdict()`

Do not hand-assemble an `AnalystVerdict` object. The factory runs the full Zod schema before returning, catching invariant violations at construction time rather than at runtime ten layers up. Tests use the factory too.

### 3. Specialists never write `voice.headline` or `voice.detail`

The `VoiceRenderedString` branded type ensures this at compile time. The `__castVoiceRendered` helper is an internal export of `verdict.ts`; only `engine/analyst/voice/voice-renderer.ts` imports it.

A Specialist that casts a raw string into `VoiceRenderedString` via an `as` cast bypasses the design and should be rejected at review.

### 4. Specialists never import `server/ai/research-orchestrator.ts` directly

Tier-1 evaluation goes through the Cognitive Engine façade at `engine/analyst/cognitive/engine-client.ts` (Phase 4+). Until the façade lands, Tier-1 calls are not permitted from new Specialists — add Tier-0 coverage only, or document a Phase 4 TODO.

### 5. Conviction-floor decisions live in the Surface Router, not in Specialists

A Specialist emits `severity: "warning"` + `qualityScore: 28`; the Router downgrades to `severity: "ok"` with developing-data voice. Specialists that self-downgrade bypass admin-override policy and break the single-place-applies-policy invariant.

### 6. Every numeric verdict has a range when severity is non-ok

`VerdictDimension` schema refinement enforces this. If you cannot produce a range, you cannot produce a non-ok numeric verdict — emit `severity: "ok"` with `missing-data` intent instead.

### 7. Every range has a conviction score ≥ CONVICTION_FLOOR when severity is non-ok

Zod refinement enforces this. Below-floor ranges go through the Router's downgrade path (severity → ok, range → null, voice → developing-data) — they never reach the verdict's final shape.

### 8. Every Tier-1 verdict has `cognitiveRunId` + ≥3 evidence entries total

The N+1 rule. Without either, the verdict fails Zod validation. No manual override.

---

## Invariants (enforced at builder time by Zod)

1. `overallSeverity === max(dimensions.severity)` — computed, not declared.
2. `overallQualityScore` = severity-weighted average of `dimensions.qualityScore`.
3. Non-ok numeric dimension requires a non-null `range`.
4. Non-ok dimension with a range requires `qualityScore >= CONVICTION_FLOOR`.
5. Every dimension has `>= MIN_SOURCES_FOR_ADVICE` evidence entries.
6. Tier-1 verdicts require `meta.cognitiveRunId`.
7. Tier-1 verdicts require `>= 3` total evidence entries across all dimensions.

A verdict that fails any of these produces `InvalidVerdictError` from the builder. That exception is a bug in the Specialist or a design gap in the contract — do not catch-and-continue.

---

## Changing the contract

Any modification to `AnalystVerdict`, `VerdictDimension`, `VerdictRange`, `VerdictAction`, or `Evidence` requires:

1. Updating ADR-003 (or writing ADR-004 if the change is orthogonal to ADR-003's scope).
2. Updating the architecture spec at `docs/architecture/analyst/verdict-contract.md`.
3. Updating every downstream backfilled Specialist in the same PR.
4. Updating the persona-keyed golden bench at `tests/analyst/personas/lb.test.ts`.
5. Updating `tests/analyst/verdict-shape.test.ts` with new invariant tests where applicable.

Adding a field is additive and does not require a backfill migration path. Removing or renaming a field does — document the deprecation plan in the ADR.

---

## Steward checklist integration

Every PR that touches anything analyst-shaped walks through the 9-step checklist in `.claude/skills/analyst/steward.md`. Step 2 asks: "Does any new function returning a verdict return `AnalystVerdict`?" That check references this rule.

If a PR's verdict shape deviates from the contract without an ADR, the steward gate fails.

---

## References

- ADR-001 — two-tier architecture
- ADR-002 — `engine/analyst/` skeleton
- ADR-003 — `AnalystVerdict` + Router + Voice + Quality (this rule's anchor)
- `docs/architecture/analyst/verdict-contract.md` — architecture spec
- `docs/architecture/ANALYST.md` — architecture spine
- `.claude/rules/the-analyst-persona.md` — user-facing voice authority
- `.claude/rules/analyst-team.md` — internal vocabulary
- `.claude/skills/analyst/_index.md` — skill entry point
- `.claude/skills/analyst/steward.md` — change-control gate
- `engine/analyst/contracts/verdict.ts` — the type + Zod schema
- `engine/analyst/router/surface-router.ts` — the dispatcher
- `engine/analyst/voice/voice-renderer.ts` — the persona enforcer
- `engine/analyst/quality/quality-scorer.ts` — the scorer
- `tests/analyst/verdict-shape.test.ts` — invariant regression suite
- `tests/analyst/personas/lb.test.ts` — persona-keyed golden bench
