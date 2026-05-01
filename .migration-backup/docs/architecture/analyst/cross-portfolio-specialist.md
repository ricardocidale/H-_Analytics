# Cross-Portfolio Specialist

**Status:** Partially built inside `server/ai/analyst-watchdog.ts` (`checkPortfolioConsistency`).
**Future home:** `engine/analyst/surface/cross-portfolio/portfolio-specialist.ts`
**Parent:** `docs/architecture/ANALYST.md`

---

## Scope

The Cross-Portfolio Specialist owns intelligence that only emerges when properties are compared to each other within a Mgmt-Co. It detects:

- Outliers (one property's ADR is 30% above the portfolio mean — intentional or stale assumption?)
- Inconsistencies (two adjacent properties in the same market with very different cost ratios)
- Drift (after a Mgmt-Co default changes, which properties still hold legacy values?)
- Coverage gaps (the portfolio has no property in a tier the ICP claims to target)

This Specialist runs as a follow-on to most other Specialists. When a Property or Mgmt-Co Specialist's verdict changes a value with portfolio implications, the Surface Router fans out to this Specialist and aggregates.

---

## Today's state

`server/ai/analyst-watchdog.ts:checkPortfolioConsistency` already implements outlier detection for a fixed set of fields. It runs ambient (scheduled) and on certain write paths.

Phase 4 re-homes it under `engine/analyst/surface/cross-portfolio/`, broadens its dimension coverage, and standardizes its output to `AnalystVerdict`.

---

## Triggers

- **Ambient (cron):** scheduled portfolio sweep (frequency from `global_assumptions.researchConfig`)
- **Property tab save** with `crossSurface.needsCrossPortfolio: true` flag from a Property Specialist
- **Mgmt-Co default change** with portfolio impact (e.g., a new default cap rate cascades only to properties without per-property overrides)
- **Admin Defaults change** (a curated benchmark shifted; portfolio outlier detection should re-run)
- **Explicit "Run portfolio review" admin click**

---

## Cognitive consultation

Mostly Tier-0 (SQL aggregation + rule deltas). Tier-1 only when:

- The Specialist needs market context to interpret an outlier ("is the higher ADR justified by this property's tier or is it overstated?")
- A new property has been added to the portfolio and segment characterization is needed

The Specialist defaults to Tier-0 and explicitly opts into Tier-1.

---

## Output shape

`AnalystVerdict` with `severity: "advisory"` for most findings. The Specialist rarely blocks — it surfaces patterns the user should consider. Exceptions:

- Coverage gap inconsistent with stated ICP → `severity: "warning"` (the Mgmt-Co's portfolio doesn't match what they say they're building)
- Conflict between two properties' values that violates accounting identity → `severity: "block"` (rare)

---

## Persona-keyed test expectations

The L+B-segment golden test for Cross-Portfolio includes:

- A 4-property L+B fixture portfolio with one deliberate outlier
- The expected outlier verdict
- The expected absence of false positives on the other 3 properties
