# Skill: Cross-Portfolio Specialist

**Status:** Partially built inside `server/ai/analyst-watchdog.ts:checkPortfolioConsistency`.
**Descriptive companion:** `docs/architecture/analyst/cross-portfolio-specialist.md`.
**Future home:** `engine/analyst/surface/cross-portfolio/portfolio-specialist.ts`.
**Parent skill:** `_index.md`.

---

## Scope

Owns intelligence that only emerges when properties are compared against each other within a Mgmt-Co. Detects:

- **Outliers** — one property's ADR is 30% above the portfolio mean.
- **Inconsistencies** — two adjacent properties in the same market with very different cost ratios.
- **Drift** — after a Mgmt-Co default changes, which properties still hold legacy values?
- **Coverage gaps** — the portfolio has no property in a tier the ICP claims to target.

Runs as a follow-on to many other Specialists. When a Property or Mgmt-Co Specialist's verdict changes a value with portfolio implications, the Surface Router fans out here and aggregates.

---

## Today's state

`server/ai/analyst-watchdog.ts:checkPortfolioConsistency` already implements outlier detection for a fixed set of fields. Runs ambient (scheduled) and on certain write paths.

Phase 4: re-home under `engine/analyst/surface/cross-portfolio/`, broaden dimension coverage, standardize output to `AnalystVerdict`.

---

## Hard rules

### 1. Tier-0 by default, Tier-1 opt-in

The bulk of Cross-Portfolio work is SQL aggregation + rule deltas — Tier-0 (no LLM). Tier-1 consultation only when:

- Market context is needed to interpret an outlier ("is the higher ADR justified by tier, or overstated?").
- A new property was added and segment characterization is needed.

The default path is Tier-0. Do not invoke the Cognitive Engine speculatively.

### 2. Never call directly; always through the Router

Other Specialists NEVER invoke Cross-Portfolio directly. They set `crossSurface: { needsCrossPortfolio: true, reason }` on their verdicts; the Surface Router dispatches. This keeps the routing graph a tree, not a mesh.

A Property Specialist or ICP Specialist importing Cross-Portfolio code is a violation.

### 3. Severity discipline

| Finding | Default severity |
|---|---|
| Outlier (one property differs from portfolio mean beyond tolerance) | `advisory` |
| Drift (portfolio values don't match recent defaults change) | `advisory` |
| Inconsistency (two properties disagree on a shared market fact) | `advisory` |
| Coverage gap (portfolio missing tier ICP claims) | `warning` |
| Accounting-identity violation (rare) | `block` |

Cross-Portfolio RARELY blocks. It surfaces patterns for user consideration.

### 4. Persona-keyed test is mandatory

The L+B-segment golden for Cross-Portfolio:

- 4-property L+B fixture portfolio with one deliberate outlier.
- Expected outlier verdict (for the outlier property).
- Expected absence of false positives on the other 3.

False positives on clean portfolios are product-breaking. The golden asserts both presence and absence.

---

## Triggers

The Router dispatches to this Specialist on:

- **Scheduled portfolio sweep** (cron — frequency from `global_assumptions.researchConfig`).
- **Property tab save** with `crossSurface.needsCrossPortfolio: true` from a Property Specialist.
- **Mgmt-Co default change** with portfolio impact (new default cascades only to properties without overrides).
- **Admin Defaults change** (curated benchmark shifted; outlier detection should re-run).
- **Explicit "Run portfolio review" admin click**.

---

## Inputs

- All portfolio properties' `PropertyContextPack` bundles.
- Current Mgmt-Co stated ICP (from ICP Specialist output or DB).
- The curated benchmark tables the Admin Defaults Specialist maintains.
- (Tier-1 only) Cognitive Engine output for market context on outliers.

---

## Output shape

`AnalystVerdict` with one `VerdictDimension` per detected pattern. Each dimension:

- `field` — the field or pattern name (`"adr.outlier"`, `"cost-ratio.inconsistency"`, `"icp-coverage.gap"`).
- `severity` — per the table above.
- `range` — portfolio-wide range for the field, with the outlier's value flagged.
- `evidence` — the portfolio properties that informed the finding.
- `voice` — rendered by Voice Renderer; typically "The Analyst notes [property X] has ADR 30% above the portfolio mean — consider whether tier difference justifies it."

---

## What Cross-Portfolio does NOT do

- Does NOT evaluate individual properties (that's each Property Specialist's job).
- Does NOT modify properties or Mgmt-Co fields — it only advises.
- Does NOT cascade fixes automatically — users decide which outliers to accept.
- Does NOT override Property Specialist verdicts — its advisory verdict is aggregated alongside.

---

## Common false positives to guard against

A Specialist that flags every minor variance is useless noise. Guard against:

- **Small-sample portfolios** — a 2-property portfolio can't have statistically meaningful outliers. Require N ≥ 3 for outlier detection.
- **Intentional tier diversity** — a portfolio with both ultra-luxury and resort-budget properties SHOULD have ADR spread. Normalize by tier before flagging.
- **Recent acquisitions** — a newly-added property lacking comparable history shouldn't flag until it has 2+ months of data.
- **Known exceptions** — per-property `suppressPortfolioChecks: { dimension, reason }` flag on property record.

The L+B golden's "absence of false positives" is the test that catches regressions here.

---

## References

- `docs/architecture/analyst/cross-portfolio-specialist.md` — descriptive spec
- `server/ai/analyst-watchdog.ts:checkPortfolioConsistency` — today's implementation
- `.claude/skills/analyst/surface-property.md` — sibling Specialist
- `.claude/skills/analyst/surface-icp.md` — ICP reference point
- `.claude/skills/analyst/surface-admin-defaults.md` — cascade trigger
- `.claude/skills/analyst/orchestrator.md` — Router dispatch
- `.claude/skills/analyst/cognitive-engine.md` — Tier-1 façade
- `.claude/skills/analyst/steward.md` — change-control gate
