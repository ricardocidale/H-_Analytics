# User Manual Update Checklist

Sections needing updates based on Phase 3, Phase 9, and property lifecycle features.

Generated: 2026-04-13 from source code audit.

---

## Section 04 — Properties (`Section04Properties.tsx`)

- [ ] Document soft-delete behavior (properties are never truly deleted)
- [ ] Add portfolio assignment workflow (admin assigns properties to users)
- [ ] Explain ON/OFF toggle for default scenarios per user
- [ ] Chevron-expandable property list UI

## Section 05 — Property Details (`Section05PropertyDetails.tsx`)

- [ ] Document seasonality curves (monthly occupancy/ADR multipliers)
- [ ] Document ramp-up curves (new property occupancy phase-in)
- [ ] Explain research confidence badges next to inputs
- [ ] Add staleness indicators (how old is the underlying data?)
- [ ] Property quality tier explanation (Luxury/Upscale/Upper Midscale/etc.)

## Section 08 — Assumptions (`Section08Assumptions.tsx`)

- [ ] Priority return / preferred return fields
- [ ] Fee subordination rules (when fees defer to debt service)
- [ ] Seasonality profile assignment per property
- [ ] Ramp curve configuration (months, starting occupancy)

## Section 09 — Scenarios (`Section09Scenarios.tsx`)

- [ ] Auto-save after 1hr idle behavior
- [ ] Default scenario assignment by admin (ON/OFF toggles)

## Section 10 — Analysis Tools (`Section10Analysis.tsx`)

- [ ] Stress test scenarios (moderate/severe/critical)
- [ ] Tornado chart sensitivity analysis
- [ ] Scenario risk scoring explanation
- [ ] Research-driven range indicators on key assumptions

## Section 13 — AI Research (`Section13AIResearch.tsx`)

- [ ] Research confidence levels (high/medium/low) and what they mean
- [ ] Staleness indicators and auto-refresh behavior
- [ ] Source badges (which data source provided each benchmark)
- [ ] Research engine dashboard (admin view of engine health)
- [ ] Hospitality benchmark data sources (STR, CBRE, HVS, etc.)
- [ ] Market rates panel (FRED, Frankfurter, Damodaran)
- [ ] Comp-set analysis via Apify and RapidAPI scrapers

## Section 16 — Admin Settings (`Section16Admin.tsx`)

- [ ] Source registry management (21+ data sources)
- [ ] Integration health dashboard (circuit breakers, success rates)
- [ ] Market rates admin panel (manual vs auto-fetched)
- [ ] Hospitality benchmarks admin panel
- [ ] Research engine test buttons
- [ ] Country defaults management (tax/depreciation by country)

## Section 17 — Business Rules (`Section17BusinessRules.tsx`)

- [ ] Fee subordination rules and priority return
- [ ] International property defaults (country-configurable)
- [ ] F&B revenue requirement for all models
- [ ] Franchise fee requirement for all properties

---

## Checker Manual Updates Needed

- `skills/13-research-calibration.md` — Add source registry audit procedures, benchmark verification against published reports
- `skills/14-property-crud.md` — Add soft-delete verification, portfolio assignment testing
- `skills/04-global-assumptions.md` — Add seasonality and ramp curve verification procedures

---

## General

- [ ] Update all help tooltips that reference deprecated features
- [ ] Verify info icons (?) reflect current field behavior
- [ ] Update glossary terms for new concepts (staleness, confidence, priority return)
