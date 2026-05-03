# ADR-011 — Waterfall Schema: per-property capital-structure storage

**Status:** Accepted
**Date filed:** 2026-05-01
**Authors:** Claude Code
**Supersedes:** none
**Related:** ADR-010 (Q/R Specialists — prerequisite #1), ADR-006 (Resources control plane), `lib/calc/src/analysis/waterfall.ts`

## Context

`computeWaterfall` in `lib/calc/src/analysis/waterfall.ts` is fully implemented: it takes `WaterfallInput` (LP/GP equity split, pref rate, tiers[], catch-up params, distributable cash flows) and returns `WaterfallOutput` (LP/GP multiples, tier breakdown, shortfall). Nothing feeds it at runtime because the property schema captures only one waterfall-adjacent field: `owner_priority_return` — a simple annual priority hurdle used by the engine loop, not the full LP/GP waterfall.

ADR-010 Prerequisite #1 names the gap: "per-property `lp_equity`, `gp_equity`, `preferred_return`, `tiers[]`, `catch_up_rate`, `catch_up_to_gp_pct` columns or JSONB." This ADR picks the design and schedules the migration.

## Decision

### Storage design — hybrid columns + JSONB

**Scalar fields as columns** (stable shape, individually queryable, Drizzle type-safe):

| Column | Type | Default | Notes |
|---|---|---|---|
| `lp_equity_pct` | `real` | `0.90` | LP share of total equity (0–1). GP share = `1 − lp_equity_pct`. |
| `catch_up_rate` | `real` | `1.0` | Fraction of catch-up dollars going to GP (1.0 = 100% GP during catch-up). |
| `catch_up_to_gp_pct` | `real` | `0.20` | GP's target share of all distributions after pref; matches `DEFAULT_GP_CATCH_UP_TARGET_PCT`. |

**`preferred_return_rate` — alias `owner_priority_return`, do not add a new column.**

`owner_priority_return` (column `owner_priority_return`) already stores a decimal annual return rate and is consumed by `property-engine.ts` as the priority hurdle. Semantically this IS the preferred return. Adding a second column would create drift. The ADR-011 build reads `ownerPriorityReturn` as the pref rate input into `computeWaterfall`. The field name is renamed in the engine adapter at build time (no schema migration needed for this field).

**Tiers as JSONB** (variable-length; always read/written as a unit):

| Column | Type | Default | Notes |
|---|---|---|---|
| `waterfall_tiers` | `jsonb` | `null` | `WaterfallTier[]` — `{label, hurdle_irr, lp_split, gp_split}[]`. Zod-validated in app code. `null` = use seed defaults. |

Rationale for JSONB over a separate tiers table: tiers are never queried individually across properties. A join table would add foreign-key complexity with zero query-time benefit. JSONB keeps the property row self-contained and matches how real-estate PE software stores promote schedules.

Rationale for columns over all-JSONB: `lp_equity_pct` and `catch_up_rate` are useful in analytics queries (e.g., "all properties where LP equity < 80%"). JSONB extraction for scalar lookups is verbose and not indexed by default.

### Alternatives considered

**(a) Rename `owner_priority_return` → `preferred_return_rate`:** Cleaner vocabulary, but breaks `property-engine.ts:170-171` and all existing property seeds. Deferred; can be done as a standalone rename migration when the engine adapter is rewritten for Specialist Q.

**(c) All-JSONB `waterfall_config`:** One JSONB blob for all waterfall fields. Simpler migration, but loses Drizzle type safety on scalars and makes partial updates (e.g., UI saves `lp_equity_pct` without touching tiers) awkward.

### Seed defaults

Industry benchmarks (Preqin 2024 LP Survey, ILPA Principles 3.0; cited in `docs/skills/property-returns-diagnosis/SKILL.md`):

```
lp_equity_pct:       0.90   (90% LP / 10% GP)
preferred_return:    0.08   (8% annual — uses existing ownerPriorityReturn seed value)
catch_up_rate:       1.0    (100% to GP during catch-up)
catch_up_to_gp_pct:  0.20   (GP catches up to 20% of total distributions)
waterfall_tiers: [
  { label: "Tier 1",  hurdle_irr: 0.12, lp_split: 0.80, gp_split: 0.20 },
  { label: "Tier 2",  hurdle_irr: 0.18, lp_split: 0.70, gp_split: 0.30 },
  { label: "Tier 3",  hurdle_irr: 999,  lp_split: 0.60, gp_split: 0.40 }
]
```

`hurdle_irr: 999` on the final tier = uncapped residual tier (standard pattern).

### Engine integration (design intent — deferred to ADR-010 Phase 1 build)

`computeWaterfall` is called at two points:
1. **Exit** — distributable = `net_to_equity` from `computeExitValuation`
2. **Refi** — distributable = cash-out proceeds at each refinancing event

The per-year cash flows feed LP-net IRR alongside the total IRR (property IRR = pre-waterfall; LP-net IRR = post-waterfall LP share). Specialist R surfaces LP-net IRR as its primary verdict dimension. Details deferred to ADR-010 Phase 1.

### Replit-lane scope (UI — not CC)

Two UI surfaces needed before Specialist R can run:
1. **Property-edit panel** — LP/GP split slider + pref rate field + tier editor (add/remove tiers, set hurdle + splits). Defaults pre-populated from company-level defaults.
2. **Company-level waterfall defaults panel** — sets the seed defaults that populate new properties. Similar to how `SEED_PROPERTY_DEFAULTS` works today.

Both are Replit-lane per `claude-replit-split.md`.

## Prerequisites for this ADR to move to Accepted

1. ADR-010 must also advance (waterfall schema is only useful when Specialist R exists to consume it).
2. User sign-off on the `lp_equity_pct` / JSONB tiers hybrid design.
3. Confirm that `ownerPriorityReturn` alias approach is acceptable (vs. rename migration).

## Compounding signal — what would suggest this design is wrong

- Specialist R turns out to be **portfolio-level** rather than per-property (see ADR-010's third compounding signal). In that case, waterfall config lives on `management_companies` or `property_bundles`, not `properties`. The hybrid columns+JSONB design still holds; only the table changes. The migration is additive so it can be re-targeted.
- The `WaterfallTier[]` shape needs to evolve to support American vs European waterfall mechanics (look-back provision, deal-by-deal vs aggregated pref). In that case, the JSONB column absorbs the schema evolution without a migration — just a Zod schema update and an engine change.

## Status next steps

Remains **Proposed** until:
1. ADR-010 prerequisites 1–4 are met (this ADR is prerequisite #2)
2. User confirms the `ownerPriorityReturn` alias decision
3. ADR-010 status → Accepted

When Accepted, the migration (`ALTER TABLE properties ADD COLUMN lp_equity_pct real, ADD COLUMN catch_up_rate real, ADD COLUMN catch_up_to_gp_pct real, ADD COLUMN waterfall_tiers jsonb`) ships as `lib/db/migrations/0030_waterfall_schema.sql`.

## Implementation

Migration applied 2026-05-01 via `lib/db/script/apply-0030.mjs`. All four columns (`lp_equity_pct real`, `catch_up_rate real`, `catch_up_to_gp_pct real`, `waterfall_tiers jsonb`) are nullable with no DB-level defaults. Drizzle schema updated in `lib/db/src/schema/properties.ts`. Engine integration remains deferred to ADR-010 Phase 1.
