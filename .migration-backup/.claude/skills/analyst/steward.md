# Steward Checklist — Every Analyst-Shaped PR Must Pass

This is the change-control gate. If a PR touches anything analyst-shaped — a Specialist, the Cognitive Engine, the Router, the Voice Renderer, the Quality Scorer, the verdict contract, or any admin-defaults table feeding Specialists — the author MUST work through this checklist before requesting merge.

**This is the most important file in this skill.** It is what prevents the recurring pattern of Analyst features shipping with one surface updated and ten sibling surfaces silently drifting.

---

## The 9-step checklist

Run these in order. A "no" at any step means the PR does not merge yet.

### 1. Is this a Surface-tier change or a Cognitive-tier change?

Different rules apply.

- **Surface-tier** (a Specialist, the Router, the Voice Renderer, the Quality Scorer, a benchmark table, or a UI surface rendering an `AnalystVerdict`): proceed to step 2.
- **Cognitive-tier** (anything under `server/ai/` in the ~25 files listed in `cognitive-engine.md`): stop. Cognitive Engine changes are rare and require an ADR (`docs/architecture/decisions/`). Do not proceed without one. Write the ADR first.

If you cannot answer this question, the design is not clear enough to ship. Go back to the per-component spec in `docs/architecture/analyst/`.

### 2. Does any new function returning a verdict return `AnalystVerdict`?

- **Before Phase 3 lands:** the contract type does not exist yet. New Specialists that must ship now match the closest existing shape (`{ status, alerts }` for tab Specialists, `FieldAlert[]` for field paths). See `.claude/rules/analyst-verdict-contract.md` for the transition policy. **Do not introduce a fifth divergent shape.**
- **After Phase 3 lands:** every new function returning a verdict MUST return `AnalystVerdict`. `tests/proof/analyst-verdict-shape.test.ts` enforces this.

### 3. Does the change meet the evidence tier required for the surface?

| Surface / trigger | Tier | Minimum evidence |
|---|---|---|
| Tab save (`TabSaved` event) | Tier-0 | Constants OK; DB benchmark lookup OK; **no LLM call** |
| Field change / field alert | Tier-0 | Same as above |
| `ResearchRequested` (explicit consult) | Tier-1 | N+1 sources (≥ 3 via `MIN_SOURCES_FOR_TIER1`) |
| `ScheduledRefresh` on stale guidance | Tier-1 | N+1 sources |
| `AdminDefaultsChanged` row edit | Tier-0 validation + optional Tier-1 refresh | N+1 when refreshing |
| `ICPRequested` | Tier-1 | N+1 sources |
| `PageOpened` (staleness check) | Tier-0 | Metadata only |

If your Specialist's Tier-0 path reaches for an LLM call, that's a violation. If your Tier-1 path does not produce N+1 evidence, that's a violation.

### 4. Did you add or update a persona-keyed golden test?

At minimum, the L+B-segment golden test at `tests/analyst/personas/lb.test.ts` (Phase 3). Every Specialist that Phase 4+ introduces must pass this test against a canonical L+B fixture. Phase 4 expands to additional personas (boutique-select-service, resort, wellness).

- **New Specialist:** add a test case to `lb.test.ts` with the golden verdict.
- **Modified Specialist:** update the golden verdict in the same PR. Unupdated goldens are silent regressions.
- **New dimension on an existing Specialist:** update the golden verdict's `dimensions[]` to cover it.
- **New benchmark data:** assert the benchmark's effect in the golden.

A PR that touches a Specialist without updating the persona test is incomplete.

### 5. Did you update the relevant `.claude/skills/analyst/<file>.md` AND `docs/architecture/analyst/<file>.md`?

Both docs stay in sync. Specifically:

- The skill file in `.claude/skills/analyst/` is directive ("when implementing X, always Y"). Update it when directive guidance changes.
- The architecture doc in `docs/architecture/analyst/` is descriptive ("X is structured as Y"). Update it when the shape of X changes.

If your PR changes behavior AND leaves either doc unchanged, the docs have drifted. Fix them in the same PR.

### 6. If the change is irreversible, did you write an ADR?

Irreversible changes include:

- Renaming `AnalystVerdict` fields.
- Adding or removing a top-level Specialist category (a new Surface tier).
- Changing the tier policy (promoting a Tier-0 surface to Tier-1 or vice-versa).
- Changing the conviction floor (`CONVICTION_FLOOR = 40`).
- Deprecating or restructuring the Cognitive Engine.

ADRs live at `docs/architecture/decisions/ADR-NNN-<slug>.md`. Follow the template at `docs/architecture/decisions/ADR-template.md`. Draft the ADR first, open for review, then implement.

Reversible changes (adding a new Specialist to an existing category, adding a new dimension to an existing verdict, adding a new benchmark source) do not require an ADR.

### 7. Did you preserve singular-Analyst voice in any user-facing string?

Every string your PR adds to a tooltip, dialog, error message, chat response, email, notification, chart caption, CTA, or any other user-visible surface must:

- Use `The Analyst` (capital T, capital A, with the article) if referring to the agent.
- Avoid every forbidden phrase in `.claude/rules/branding-vocabulary-enforcement.md` (plural forms, "the system", "Ask the Analyst" as a literal, "Regenerate Intelligence", etc.).
- Match the severity → tone map in `voice.md` if the string is a verdict headline or detail.

`npm run test:file -- tests/audit/vocabulary-compliance.test.ts` enforces this before commit. A PR that ships a forbidden phrase and hasn't run this test is incomplete.

### 8. Did you run all five gates in `.claude/rules/pre-commit-verification.md`?

Non-negotiable. Every commit:

```bash
npx tsc --noEmit
npm run lint
npm run test:file -- tests/audit/vocabulary-compliance.test.ts
npm run test:summary
npm run verify:summary     # must say UNQUALIFIED
```

A commit that skips any gate does not land. If one gate fails on a pre-existing issue you didn't introduce, file a BLOCKED.md sibling and escalate — do not skip.

The commit message should include the verification footer:

```
Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED
```

### 9. Did you check `.claude/rules/cross-check-invariants.md` for any invariant pair your change triggers?

The rule maps edit types to sibling surfaces that must be verified. Relevant invariant pairs for Analyst work:

- Editing `AnalystVerdict` → every Specialist that returns it + every consumer in the Router, Voice Renderer, Quality Scorer.
- Editing a Specialist → the route handler that calls it + the client component that renders its output + the persona-keyed golden.
- Editing a benchmark table row → every Specialist that looks up that table + the Cross-Portfolio Specialist (cascade implications).
- Editing a Cognitive Engine file → `.claude/notes/analyst-architecture.md` if the change affects the mental model + every Specialist that consults via the façade.
- Editing the persona rule or vocabulary → every user-facing string in the repo (run the vocabulary compliance test).

---

## Additional rules for specific scenarios

### Adding a new Specialist

1. Spec lives at `docs/architecture/analyst/<surface>-specialist.md` (create or extend).
2. Skill file lives at `.claude/skills/analyst/surface-<surface>.md` (create or extend).
3. Specialist code at `engine/analyst/surface/<surface>/<name>-specialist.ts` (Phase 2+).
4. Benchmark table under `engine/analyst/benchmarks/<surface>.ts` if needed.
5. Persona-keyed L+B golden case in `tests/analyst/personas/lb.test.ts`.
6. Surface Router routing entry (`surface-router.md` routing table + `engine/analyst/surface/surface-router.ts`).

### Modifying the Cognitive Engine

ADR required. Every change to `server/ai/research-orchestrator.ts`, the three Cognitive Panels, the deterministic tool set, the vector memory layer, or `server/ai/staleness-detector.ts` alters the contract every Specialist depends on. Steward gate is: ADR + updated `.claude/notes/analyst-architecture.md` + regression test in `tests/ai/`.

### Editing the Voice Renderer

Voice changes are user-facing. Steward gate includes: updated `voice.md` skill, updated `.claude/rules/the-analyst-persona.md` if the persona contract shifts (rare), vocabulary compliance test, and a `tests/analyst/voice/voice-renderer.test.ts` update (Phase 3) for every forbidden-pattern change.

---

## When in doubt

Ask: "If a future audit finds this PR, will it be clear which rule protected it and which sibling surface I updated?"

If the answer is no — the docs aren't updated, the golden test isn't updated, the invariant isn't documented — the PR is not ready. The five-gate verification catches execution bugs. The steward checklist catches design bugs. Both are non-optional.

---

## References

- `.claude/rules/pre-commit-verification.md` — the blocking five gates
- `.claude/rules/cross-check-invariants.md` — edit → sibling-surface map
- `.claude/rules/analyst-team.md` — internal vocabulary
- `.claude/rules/analyst-verdict-contract.md` — transition policy
- `.claude/rules/the-analyst-persona.md` — user-facing voice authority
- `docs/architecture/ANALYST.md` — architecture spine
- `docs/architecture/decisions/ADR-template.md` — ADR template
- `tests/audit/vocabulary-compliance.test.ts` — vocabulary gate
- `tests/analyst/personas/lb.test.ts` — persona-keyed golden bench (Phase 3)
- `tests/proof/analyst-verdict-shape.test.ts` — verdict-shape invariant gate (Phase 3)
