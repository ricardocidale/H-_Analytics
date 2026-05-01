# ADR-010 — Returns Intelligence (Q / Quitéria) + Distributions Intelligence (R / Rafaela) Specialists

**Status:** Proposed (stub — roadmap, not active build)
**Date filed:** 2026-05-01
**Authors:** Claude Code (drafted from Track 3 of portfolio IRR diagnosis session)
**Supersedes:** none
**Related:** ADR-007 (Specialist Tier-1 Graduation pattern), ADR-006 (Resources control plane), `.local/skills/property-returns-diagnosis/SKILL.md`

## Context

The 16-Specialist roster (letters A–P) has owners for funding, revenue, ICP, risk, executive summary, photos, watchdog, four constants categories, resource builder, compensation, overhead, company defaults, and property defaults. **No Specialist owns property-level returns diagnosis or capital-distribution architecture.**

The May 1 2026 portfolio IRR session demonstrated the procedure that should live in those Specialists:

1. Run the engine baseline (deterministic — already a skill in `lib/calc/src/returns/`)
2. Classify into healthy/broken/high bands (LP-credibility judgment)
3. Identify root cause as operating / capital / distributions
4. Recommend lever set per root cause
5. Verify post-fix and produce comparables-backed verdict

Steps 2–5 are Specialist work (Tier-1 cognitive, citations, comparables tables, vendor-breadth N+1) per `.claude/rules/specialist-intelligence-bar.md`.

## Decision

Add two new Specialists to the roster:

- **Letter Q — Returns Intelligence** (humanName: **Quitéria**, gender: female, subject: `property`)
  - Owns operating-IRR health: `roomCount`, `startAdr`, `revShareEvents/FB/Other`, `cateringBoostPercent`, `buildingImprovements`, `occupancyRampCurve`, `exitCapRate`, `maxOccupancy`, `pricingModel`/`nightlyPropertyRate`
  - APIs (`assignmentRefs`): STR comp set, CBRE/HVS hospitality benchmarks, AirROI/AirDNA (STR-style markets), FRED inflation, BLS labor
  - Outputs `comparables: ComparableRow[]` table per numeric dimension
  - Deep-links to property-edit form fields via `verdictField` rows in catalog

- **Letter R — Distributions Intelligence** (humanName: **Rafaela**, gender: female, subject: `property`)
  - Owns capital structure for LP-credibility: `ownerPriorityReturn`, preferred return rate, waterfall tier hurdles, catch-up rate, LP/GP equity split, LP-net IRR
  - APIs (`assignmentRefs`): Preqin / Carta / PitchBook (waterfall comps), NAREIM, ILPA standards
  - Outputs comparables table for waterfall structure (e.g., "Hospitality PE 2024 cohort: 8% pref / 80–20 / 70–30 / 60–40 tiers")

**Eloá (E) extension:** read latest cached Q + R verdicts → synthesize into LP-facing one-page narrative. No new LLM call; just an additional input to her existing synthesis pass.

**Giovanna (G) extension:** Tier-0 deterministic IRR-band tripwire. Property IRR outside `[20%, 50%]` or LP-net IRR outside `[10%, 25%]` → "Due for review" badge that nudges users to click `<AnalystButton />` on Q + R. No LLM cost. Adheres to `analyst-trigger-discipline.md` (watchdog flags; Specialists run only on user click).

**Surface Router parallel dispatch:** one `<AnalystButton />` press on the property page fires Q + R concurrently. Same wall-clock as a single Specialist; double the source breadth. Eloá pulls from cache when she next runs her narrative pass.

## Naming rationale

Per `.claude/rules/analyst-team.md` (internal vs user-facing vocabulary), `Specialist` is internal vocabulary and may not appear in `displayName`. The user-tested candidates ("Financial Return Specialist," "Distribution of Proceeds Specialist") were rejected in the May 1 brainstorm for that reason and for verbosity. The chosen displayNames follow the established `X Intelligence` pattern (Funding Intelligence, Revenue Intelligence, Risk Intelligence, etc.). Plural "Returns" / "Distributions" matches industry parlance.

Brazilian female persona names continue the alphabetical convention (Ana, Bia, Cecília, ..., Olívia, Paula, **Quitéria**, **Rafaela**).

## Prerequisites — DO NOT START BUILD UNTIL THESE LAND

R has hidden infrastructure dependencies that don't exist today. Naming them up front so they get scoped into the build sequence rather than discovered mid-build:

1. **Waterfall schema.** Per-property `lp_equity`, `gp_equity`, `preferred_return`, `tiers[]` (label, hurdle_irr, lp_split, gp_split), `catch_up_rate`, `catch_up_to_gp_pct` columns or JSONB. The `compute_waterfall` skill at `lib/calc/src/analysis/waterfall.ts` already exists; nothing currently feeds it because no schema captures the inputs.
2. **Waterfall config UI.** A property-edit panel (or company-level default panel) where users set the LP/GP split + pref + tiers. Replit-lane work per claude-replit-split.md.
3. **Seed defaults for waterfall.** Sensible per-property defaults so existing seed properties produce a meaningful R verdict on first run. Likely 80/20 → 70/30 → 60/40 promote tiers with 8% pref and 50% catch-up — but should be sourced from Preqin / Carta benchmarks via Letícia (Resource Builder) or Helena/Isadora (Constants).
4. **Q's prerequisite is lighter:** all the operating fields already exist in the property schema. No schema work needed — only the Specialist build itself.
5. **API resource licensing.** Preqin / Carta / PitchBook are paid APIs with non-trivial per-call cost; Resources control plane (ADR-006) needs entries for them, and budget needs to be allocated. Without paid LP-comp data, R falls back to NAREIM/ILPA published benchmarks (free but coarser).

## Build sequence (multi-phase, mirroring G1 Funding / G2 Revenue / G6 Watchdog graduations)

Per ADR-007 Tier-1 graduation pattern:

1. **Phase 1 — Tier-0 deterministic** for both Q and R. Wraps existing engine output (computeIRR, computeExitValuation, computeWaterfall) into a deterministic Tier-0 evaluator. Establishes catalog entry, candidateFields, verdict shape. No LLM.
2. **Phase 2 — Tier-1 N+1 graduation.** Add Cognitive Engine call (Anthropic Opus + Gemini Pro + DeepSeek-R1 synthesis), Prompt Engineer pre-stage, regress loop, comparables table population from APIs. Per `specialist-intelligence-bar.md` requirement #1, 7, 8, 9.
3. **Phase 3 — IB (Intelligence Bar) bench.** 25-test benchmark verifying Tier-1 Specialist hits all 9 bar requirements: cognitiveRunId, citation count, comparables shape, vendor breadth ≥2, range-first delivery, etc.
4. **Phase 4 — Eloá synthesis pull-through + Giovanna deterministic alert.** Smaller diff; productizes the cross-Specialist integration.
5. **Phase 5 — UI surface.** Replit-lane: property page integration of `<AnalystButton />` with parallel Q + R dispatch, comparables tables, range badges. Per `analyst-trigger-discipline.md`, no auto-triggering.

Each phase ships green and stays committed before the next phase opens. Doctrine Freeze Gate applies — no Phase 2 starts until this ADR is `Accepted` and the waterfall schema (prerequisite #1) is merged.

## Trigger discipline

Both Specialists evaluate **only** on `<AnalystButton />` press. Save handlers, useEffect hooks, and page loads MUST NOT fire Q or R. Per `.claude/rules/analyst-trigger-discipline.md`. Cache reads (`cacheState: "hit"`) of prior verdicts ARE allowed — that's reading paid-for intelligence, not a new evaluation.

## Cost discipline

Per-property AnalystButton press fires Q + R Tier-1 cognitive runs in parallel. Each run uses 2+ vendors per `llm-vendor-roster.md`. Estimated per-run cost (May 2026 prices):

- Q: ~$0.40 (Opus synthesis + Sonnet/Flash panels)
- R: ~$0.40 (same shape)
- Eloá pull-through: $0 (cache read of Q + R verdicts feeds into existing narrative pass)
- Giovanna: $0 (Tier-0 deterministic)

**Total per AnalystButton press: ~$0.80.** Acceptable for an LP-credibility verdict that today doesn't exist anywhere in the product.

## Compliance with the 9-point Intelligence Bar

Every requirement in `.claude/rules/specialist-intelligence-bar.md` is intended to be hit:

1. ✅ Tier-1 cognitive (Phase 2)
2. ✅ Context-rich prompt (property + portfolio + market injected)
3. ✅ ≥3 citation-backed evidence per dimension
4. ✅ Tabular comparables for numeric dimensions (operating comps for Q; waterfall comps for R)
5. ✅ Live API resources (STR/CBRE/HVS for Q; Preqin/Carta for R)
6. ✅ Range-first delivery (low/mid/high bands)
7. ✅ Vendor-breadth N+1 (Anthropic + Google + DeepSeek minimum)
8. ✅ LLM-driven Prompt Engineer pre-stage (per ADR-007)
9. ✅ Quality regress + honest-fail (per ADR-007)

## Compounding signal — what would suggest this ADR is wrong

- The methodology skill (`.local/skills/property-returns-diagnosis/SKILL.md`) gets used 5+ times before either Q or R is built and reveals that the procedure NEEDS to be different per investor profile (LP institutional vs family office vs HNW direct). In that case, this ADR splits into ADR-010a (Q) + ADR-010b (R) + ADR-010c (per-investor-profile customization).
- The waterfall schema work (prerequisite #1) reveals that the existing `compute_waterfall` skill is missing key real-world mechanics (e.g., American vs European waterfall, sidecar pools, tax-driven distributions). In that case, R is delayed pending a `compute_waterfall_v2`.
- Per-property R verdicts produce identical or near-identical outputs across the portfolio (mode collapse per `.claude/rules/parity-exemption-classes.md`). In that case, R becomes a **portfolio-level** Specialist (subject `portfolio-ops`) that produces one waterfall verdict for the management company's standard term sheet, not a per-property verdict.

## Status next steps

This ADR remains **Proposed** until:
1. The methodology skill has been used 3+ times (proves the procedure is stable enough to productize)
2. Waterfall schema design lands as its own ADR or workpacket
3. Resources control plane has placeholder entries for Preqin / Carta / NAREIM / ILPA
4. The user signs off on the build sequence, vendor selection, and naming

When all four are met, status → **Accepted** and Phase 1 (Tier-0 wrappers) opens.
