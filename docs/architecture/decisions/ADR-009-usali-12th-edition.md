# ADR-009: USALI 12th Edition Adoption

**Status:** Accepted
**Date:** 2026-04-28
**Deciders:** Ricardo Cidale, Claude Code (architect)
**Tags:** engine, schema, usali, utilities, reporting

---

## Context

The Uniform System of Accounts for the Lodging Industry (USALI) 12th Edition
became effective 2026-01-01. Three structural changes affect the financial engine:

1. **EWW Schedule** — Electricity, Water, and Waste are now tracked as three
   separate cost lines rather than aggregated into Utilities. The 11th Edition
   combined these; the 12th breaks them apart for ESG transparency and
   granular cost attribution. Properties report EWW as a discrete schedule
   above the Departmental Summary line.

2. **Schedule 16: Brand & Operator Cost Consolidation** — Franchise fees, brand
   marketing contributions, licensing fees, and manager base fee are consolidated
   into Schedule 16. Removes ambiguity about where brand-related costs appear in
   the income statement (previously scattered across Rooms, A&G, and undistributed).

3. **Schedule 15: FTE Tracking** — Full-time equivalent employee counts are now
   a required disclosure per department per reporting period. Enables per-key
   labor productivity benchmarking natively within the statement structure.

The current engine (`engine/property/property-engine.ts`) uses 11th Edition
conventions: `expenseUtilitiesVar` and `expenseUtilitiesFixed` exist but are
computed as a single cost-rate input (no EWW split); there is no brand fee
line-item in the income statement; FTE tracking is absent.

The `reference_range` seeding (W1 of the 2026-04-28 roadmap) already seeds EWW
per-room benchmarks under `domain: "risk"` so the benchmarks are ready. The
engine changes must follow.

---

## Decision

### 1. EWW Schedule (Phase 1 — next session)

Add an `expenseEWW` aggregate to `MonthlyFinancials` in `engine/types.ts`:

```
expenseEWW = expenseUtilitiesVar + expenseUtilitiesFixed
```

This is a derived field (sum of two existing fields), not a replacement.
The existing `expenseUtilitiesVar` and `expenseUtilitiesFixed` remain for
backwards-compatibility and as the engine's internal computation primitives;
`expenseEWW` is the USALI-12 presentation layer. No change to the computation
logic — only a new aggregate.

GOV cascade is unchanged. `expenseEWW` flows into the undistributed expenses
section of the income statement below GOP, consistent with USALI 12th placement.

The UI surface for EWW (a new row in the property income statement table) is
a Replit packet task created after the engine change soaks.

### 2. Schedule 16 Brand & Operator Costs (Phase 2 — deferred to P7+)

A `brandOperatorCost` field on `MonthlyFinancials` requires:
- New UI inputs on Property Edit (operator fees, franchise fee, brand marketing %)
- New schema columns on `properties`
- Engine cascade changes (removes brand cost from A&G, creates new line)
- Replit packet for the full UI surface

This is a significant scope change. It is deferred to P7+ with an explicit ADR
amendment or a child ADR at that time.

### 3. Schedule 15 FTE Tracking (Phase 3 — deferred to P7+)

FTE count disclosure requires per-department headcount inputs and a new
`fteCount` field on `PropertyDdItemRow` or a separate `property_fte_schedule`
table. Deferred until labor cost module stabilizes.

### 4. `compute_labor_burden` Deterministic Tool (shipped 2026-04-28)

The `compute_labor_burden` calc tool (`calc/analysis/compute-labor-burden.ts`)
is already shipped. It computes burdened labor cost from base wages + benefits
load + employer payroll tax. This is a prerequisite capability for Schedule 15
FTE cost attribution.

---

## Consequences

### Positive
- `expenseEWW` aligns the engine's presentation layer with investor-grade
  USALI-12 reporting without any computation change (pure derived field).
- Seeded EWW benchmarks in `reference_range` are immediately usable as soon as
  the engine field exists — no additional data work needed.
- Schedule 15 + Schedule 16 are explicitly deferred with documented rationale,
  preventing half-implementations.

### Negative
- `expenseEWW` is a presentation field that duplicates data already in
  `expenseUtilitiesVar + expenseUtilitiesFixed`. This is deliberate but must be
  documented as a derived field to prevent future readers from treating it as
  independent input.
- Schedule 16 deferral means brand fee costs remain in A&G until P7+, which is
  technically USALI-11 behavior for that line.

### Neutral / Notable
- No migration is needed for Phase 1 — `expenseEWW` is computed at runtime.
- No UI change is needed until Phase 1 engine change soaks for one session
  (Doctrine Freeze Gate applies to the Replit packet).

---

## Alternatives considered

**Full EWW split (E + W + W as three separate fields):** The 12th Edition
technically presents electricity, water, and waste separately on the EWW
Schedule. The full three-field split is correct for final reporting but requires
three new cost-rate inputs from the user and three engine primitives. Deferred
to the same P7+ packet as Schedule 16 — implementing three fields vs. one
aggregate is a cost-input UX question that should be addressed with the full
Schedule 16 redesign. The `expenseEWW` aggregate satisfies the line-item
requirement for P6 reporting while keeping Phase 1 minimal.

**Replace utilities fields with EWW aggregate:** Removing `expenseUtilitiesVar`
and `expenseUtilitiesFixed` would break backwards-compat on existing properties
and require a migration. Pure additive (`expenseEWW` as a derived field) is
safe and reversible.

**Defer all USALI-12 changes to P7+:** Feasible, but `expenseEWW` is a one-line
engine change and the benchmark data is already seeded. Deferring the cheapest
change while deferring the expensive ones is the right scope split.

---

## Implementation notes

### Phase 1 — next session (engine only)

1. `engine/types.ts`: Add `expenseEWW: number` to `MonthlyFinancials`.
2. `engine/property/property-engine.ts`: Compute `expenseEWW = expenseUtilitiesVar + expenseUtilitiesFixed` after those two lines.
3. Run `tests/engine/operating-reserve-cash.test.ts` — must pass (additive field, no cascade change).
4. Run `npm run verify:summary` — must show UNQUALIFIED.
5. After engine soaks one session: write Replit packet for income statement UI row.

### Files to touch in Phase 1

| File | Change |
|------|--------|
| `engine/types.ts` | Add `expenseEWW: number` to `MonthlyFinancials` |
| `engine/property/property-engine.ts` | Add `expenseEWW` derived assignment |
| `server/calculationChecker.ts` | Add `expenseEWW` to checker output if it validates income statement totals |

### Phase 2 / Phase 3 prerequisites (before P7+ packet)

- New schema columns: `costRateElectricity`, `costRateWater`, `costRateWaste` on `properties`
- New schema columns: `franchiseFeeRate`, `brandMarketingRate`, `operatorBaseFeeRate`
- Migration
- Engine primitives replacing current `costRateUtilities` split

---

## References

- USALI 12th Edition, effective 2026-01-01
- `engine/types.ts` — `MonthlyFinancials` interface
- `engine/property/property-engine.ts` — EWW computation lines 126, 140
- `shared/schema/reference-range.ts` — `domain: "risk"` EWW benchmarks
- `server/seeds/reference-ranges.ts` — Pass 8 `seedEwwBenchmarks()` (seeded 2026-04-28)
- `calc/analysis/compute-labor-burden.ts` — Schedule 15 prerequisite tool
- `.claude/rules/deterministic-tools.md` — tool registry
- `.claude/rules/financial-engine.md` — engine constraints
