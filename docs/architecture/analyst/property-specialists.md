# Property Specialists

**Status:** Field-alert path partially built; per-tab Specialists scheduled for Phase 4.
**Future home:** `engine/analyst/surface/property/*-specialist.ts`
**Parent:** `docs/architecture/ANALYST.md`

---

## Scope

Each Property Specialist owns one tab of the Property Edit page. Property tabs differ from Mgmt-Co tabs in two ways:

1. **Per-property context** — every evaluation is scoped to a specific `propertyId` and consults that property's history, comparables, and prior research runs.
2. **Cross-portfolio implications** — a Property tab change may trigger an advisory verdict from the Cross-Portfolio Specialist (e.g., "this property's ADR is now 30% above the portfolio average").

---

## Today's state (the field-alert path)

`server/ai/analyst-watchdog.ts` (`computeFieldAlerts`) emits `FieldAlert[]` for property field changes against `validateAssumptionRange()` from `server/ai/benchmark-lookups.ts`. This works at the field level but has no per-tab structure — every field alert is independent, none are aggregated into a tab-level verdict.

Phase 4 reorganizes this into per-tab Specialists. The field-alert mechanism survives but becomes an internal helper of each Specialist, not a top-level surface.

---

## The Property tabs (initial inventory)

| Tab | Specialist | Notes |
|---|---|---|
| Identity / Classification | Identity Specialist (or shared with Revenue) | Low evaluation surface; may not need its own |
| Revenue | Property Revenue Specialist | ADR, occupancy, RevPAR, F&B per occupied room, ancillary streams |
| Operating Costs | Property Cost Specialist | Departmental costs, undistributed expenses, fixed costs |
| CapEx | Property CapEx Specialist | FF&E reserve, capital plan, replacement schedule |
| Financing | Property Financing Specialist | Per-property debt structure (overrides Mgmt-Co defaults) |
| Exit / Hold | Property Exit Specialist | Hold period, exit cap rate, refinancing assumptions |

The exact tab partition mirrors `client/src/pages/PropertyEdit.tsx`. The Specialist set will be finalized when Phase 4 begins.

---

## Common contract

Every Property Specialist:

- Takes `{ propertyId, tabKey, payload, priorPayload }`.
- Resolves the property's `PropertyContextPack` (`server/ai/context-pack/property-pack.ts`) — uses the existing typed-narrative bundle, not raw rows.
- Resolves benchmarks for the property's market + tier + country from `hospitality_benchmarks` (and tab-specific benchmark tables).
- Optionally consults the Cognitive Engine (Tier-1) for fields where benchmark coverage is thin or where progressive-relaxation peer matching is warranted.
- Returns an `AnalystVerdict`.

---

## The cross-portfolio implication channel

When a Property Specialist's verdict has portfolio-level implications, it sets `verdict.crossSurface: { needsCrossPortfolio: true, reason }`. The Surface Router fans out: it dispatches a follow-on event to the Cross-Portfolio Specialist and aggregates both verdicts.

This is the primary mechanism by which a property change updates Mgmt-Co-level intelligence without the Property Specialist needing to know Mgmt-Co internals.

---

## Cognitive consultation patterns

Property Specialists should consult the Cognitive Engine when:

1. The market is thinly covered by benchmarks (small market, few comps).
2. The user has explicitly clicked "Consult the Analyst" on a field.
3. The property's guidance is "Due for review" or "Overdue" per the Staleness Specialist.
4. A field's value moves outside the benchmark range and the Specialist needs market context to advise.

Property Specialists must NOT consult the Cognitive Engine on every save. The default is Tier-0 evaluation; Tier-1 is opt-in per the four conditions above.

---

## Persona-keyed test expectations

Same rule as Mgmt-Co Specialists: every Property Specialist must pass `tests/analyst/personas/lb.test.ts` with a golden L+B-segment property fixture (e.g., 30-room boutique, $400 ADR, US tier-1 market). Phase 4 PRs that introduce or modify a Property Specialist must update the L+B golden fixture in the same PR.
