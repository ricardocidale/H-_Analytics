# Skill: Property Specialists

**Status:** Field-alert path partially built; per-tab Specialists scheduled for Phase 4.
**Descriptive companion:** `docs/architecture/analyst/property-specialists.md`.
**Future home:** `engine/analyst/surface/property/<tab>-specialist.ts`.
**Parent skill:** `_index.md`.

---

## Scope

One Specialist per tab of the Property Edit page. Property tabs differ from Mgmt-Co tabs in two ways:

1. **Per-property context** — every evaluation is scoped to a specific `propertyId` and consults that property's history, comparables, and prior research runs.
2. **Cross-portfolio implications** — a Property tab change may trigger an advisory verdict from the Cross-Portfolio Specialist (e.g., "this property's ADR is now 30% above the portfolio average").

---

## Today's state — the field-alert path

`server/ai/analyst-watchdog.ts:computeFieldAlerts` emits `FieldAlert[]` for property field changes, validating against `server/ai/benchmark-lookups.ts:validateAssumptionRange`. Works at the field level; no per-tab aggregation.

Phase 4 reorganizes this into per-tab Specialists. The field-alert mechanism becomes an internal helper of each Specialist, not a top-level surface.

---

## Property tabs (initial inventory, mirror `client/src/pages/PropertyEdit.tsx`)

| Tab | Specialist | Notes |
|---|---|---|
| Identity / Classification | Identity Specialist (or shared with Revenue) | Low evaluation surface |
| Revenue | Property Revenue Specialist | ADR, occupancy, RevPAR, F&B per occupied room, ancillary streams |
| Operating Costs | Property Cost Specialist | Departmental costs, undistributed expenses, fixed costs |
| CapEx | Property CapEx Specialist | FF&E reserve, capital plan, replacement schedule |
| Financing | Property Financing Specialist | Per-property debt structure (overrides Mgmt-Co defaults) |
| Exit / Hold | Property Exit Specialist | Hold period, exit cap rate, refinancing assumptions |

Finalize the partition when Phase 4 begins; `PropertyEdit.tsx` is the source of truth for which tabs exist.

---

## Hard rules

### 1. Use the `PropertyContextPack`, not raw rows

Every Property Specialist resolves the property's `PropertyContextPack` via `server/ai/context-pack/property-pack.ts`. This is the typed narrative bundle (identity, classification, location, physical character, amenity profile, revenue profile, cost profile — each as composed English). Specialists reason over narratives, not field dumps.

Pulling raw property columns from the DB inside a Specialist is a bug. The Context Pack exists for this reason.

### 2. Default is Tier-0; Tier-1 is opt-in

Property Specialists consult the Cognitive Engine WHEN:

1. Market is thinly covered by benchmarks (small market, few comps).
2. User explicitly clicked "Consult the Analyst" on a field.
3. Property's guidance is "Due for review" or "Overdue" per the Staleness Specialist.
4. Field value moves outside the benchmark range and market context is needed to advise.

Otherwise: constants + DB benchmark lookups only. Latency budget for saves is ~200ms.

### 3. Cross-portfolio implications go through the `crossSurface` channel

When a Property Specialist's verdict has portfolio-level implications, set `verdict.crossSurface: { needsCrossPortfolio: true, reason }`. The Surface Router fans out to the Cross-Portfolio Specialist and aggregates both verdicts.

**Never** call the Cross-Portfolio Specialist directly from a Property Specialist. The Router owns multi-Specialist aggregation.

### 4. Persona-keyed L+B golden fixture is mandatory

The L+B golden test expects specific property fixtures (e.g., 30-room boutique, $400 ADR, US tier-1 market). Every Property Specialist — new or modified — must produce the expected verdict on this fixture.

---

## Benchmarks

Per-tab benchmark tables live at `engine/analyst/benchmarks/<tab>.ts` (Phase 2+). Resolution scope: property's market + tier + country. If a benchmark doesn't exist for the scope, fall back to country-level, then tier-level, then segment-level — logged at each step so the evidence trail is complete.

---

## Cross-surface implication patterns

Common cases:

- **Property Revenue → Cross-Portfolio.** ADR change outside portfolio mean triggers outlier verdict.
- **Property Financing → Mgmt-Co Company Specialist.** Per-property debt overriding Mgmt-Co default should surface at the Company level.
- **Property Exit → Cross-Portfolio.** Exit cap rate inconsistent with peers in the same market.
- **Property CapEx → Mgmt-Co Property-Defaults.** CapEx plan diverging from Mgmt-Co defaults should surface.

The `crossSurface` flag is advisory. The Router decides whether to actually invoke the cross-surface Specialist.

---

## Migration from today's watchdog

Phase 4:

1. `server/ai/analyst-watchdog.ts:computeFieldAlerts` re-homes to `engine/analyst/surface/property/field-alert-helper.ts` and becomes an internal helper.
2. Each Property tab gets a Specialist at `engine/analyst/surface/property/<tab>-specialist.ts`.
3. The Specialist invokes the field-alert helper for per-field checks and aggregates into `AnalystVerdict.dimensions[]`.
4. Legacy field-alert call sites re-point at the Specialist via the Surface Router.

Re-export shims at old paths carry `@deprecated` JSDoc for one release cycle.

---

## What NOT to do

- Don't pull raw property columns; use the `PropertyContextPack`.
- Don't call Cross-Portfolio Specialist directly; use the `crossSurface` channel.
- Don't fire the Cognitive Engine on every save; default to Tier-0.
- Don't bypass the Surface Router for field alerts.
- Don't update a Property Specialist without updating the L+B golden.

---

## References

- `docs/architecture/analyst/property-specialists.md` — descriptive spec
- `server/ai/context-pack/property-pack.ts` — the typed narrative bundle
- `server/ai/benchmark-lookups.ts:validateAssumptionRange` — today's field validator
- `server/ai/analyst-watchdog.ts:computeFieldAlerts` — today's field-alert path
- `.claude/skills/analyst/surface-cross-portfolio.md` — Cross-Portfolio Specialist
- `.claude/skills/analyst/surface-staleness.md` — Staleness Specialist
- `.claude/skills/analyst/orchestrator.md` — Router dispatch
- `.claude/skills/analyst/steward.md` — change-control gate
- `.claude/rules/analyst-verdict-contract.md` — transition policy
