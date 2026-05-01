---
name: property-returns-diagnosis
description: Diagnose whether each portfolio property is delivering an LP-credible return profile. Use before LP decks, when evaluating a new acquisition, when a property's IRR feels off, or when a user says "fix the IRRs." Procedure runs the real engine end-to-end (no hand-calc) → classifies into bands → identifies root cause → selects levers → applies and re-verifies. Spec for Specialists Q (Returns) and R (Distributions) when they're built.
---

# Property Returns Diagnosis — Methodology

Use this whenever you need to know whether a property's return profile is LP-credible, or to fix one that isn't. Hand-calc is BANNED — the engine has occupancy ramp, pre-opening burn, debt service, working capital, FF&E reserve, refinance pass, exit waterfall mechanics that any back-of-envelope calc will get wrong by 20-50%.

## When to use

- Pre-LP-deck portfolio review ("are all our active properties showing healthy IRRs?")
- Evaluating a new property acquisition before adding to seed/portfolio
- A user says "this IRR looks too high / too low / impossible"
- Sanity-checking after a parameter change (room count bump, ADR shift, financing change)
- Spec for the Q (Returns Intelligence / Quitéria) and R (Distributions Intelligence / Rafaela) Specialists when they're built — same procedure, productized

## When NOT to use

- The user asks for a single number from a spreadsheet — just run the script
- The user is asking about company-level returns (use the company engine path, not this property-level skill)
- You are debugging the engine itself — different skill (engine debugging needs golden-scenario tests + invariant checks)

## The procedure (5 steps)

### Step 1 — Run the verified baseline

Use `artifacts/api-server/script/diagnose-portfolio-irr.ts`. The script:

1. Imports `SEED_INITIAL_PROPERTIES` and `SEED_PROPERTY_DEFAULTS` from the active seed file
2. Builds a minimal `GlobalInput` with `DEFAULT_MODEL_START_DATE`, `DEFAULT_MARKETING_RATE`, `getFactoryNumber("inflationRate", "United States")`, and the relevant `DEFAULT_*` fee rates
3. For each property: merges defaults + property → calls `generatePropertyProForma(merged, global, PROJECTION_MONTHS)` from `@engine/property/property-engine`
4. Aggregates monthly `cashFlow` + `refinancingProceeds` to annual
5. Computes terminal exit via `computeExitValuation` from `@calc/returns/exit-valuation` using stabilized ANOI + outstanding debt at month 119
6. Builds IRR cash-flow vector: `[-equityInvested, ...annualFCFE, lastYear + netToEquity]`
7. Solves via `computeIRR` from `@analytics/returns/irr`

Run from `artifacts/api-server/` directory (path aliases need that working dir): `tsx script/diagnose-portfolio-irr.ts`.

**Equity invested formula** (matches engine semantics — verify against `lib/engine/src/property/resolve-assumptions.ts` line ~368):
```
equityInvested = (purchasePrice + buildingImprovements - originalLoan)
               + preOpeningCosts + operatingReserve
```
Where `originalLoan = totalPropertyValue × LTV` for "Financed" type, else 0.

### Step 2 — Classify each property

Bands (LP-credible boutique-luxury hospitality):

| Band | IRR | Action |
|---|---|---|
| **BROKEN** | null (no convergence) or < 0% | Mandatory fix — equity sinks |
| **LOW** | 0% – 20% | Investigate — may be defensible for ultra-low-risk; usually needs lift |
| **HEALTHY** | 20% – 50% | Leave alone unless other evidence suggests a problem |
| **HIGH** | > 50% | Investigate — likely model error or mode-collapsed assumption; LPs will flag |

The bands are a starting calibration. Boutique luxury / wellness / retreat targets 20–35% is the LP-defensible sweet spot. Below 20% reads as "why bother"; above 50% reads as "you're overstating something."

### Step 3 — Root-cause taxonomy (broken / off properties only)

When a property is BROKEN, LOW, or HIGH, classify the cause into one of three buckets BEFORE choosing a lever:

| Bucket | Symptoms | Where to look |
|---|---|---|
| **Operating** | Stabilized ANOI insufficient to cover debt service + provide return; revenue too small for the asset (room count × ADR doesn't generate enough); ANOI margin compressed by cost rates | `roomCount`, `startAdr`, `revShareEvents/FB/Other`, `cateringBoostPercent`, `costRate*`, `maxOccupancy`, `occupancyRampMonths`, `pricingModel` |
| **Capital structure** | Equity invested is "right" for the asset but financing terms make the IRR sour; LTV too low (under-levering kills equity returns); refi assumptions too aggressive or too thin; exit cap rate punitive | `acquisitionLTV`, `acquisitionInterestRate`, `acquisitionTermYears`, `willRefinance`, `refinanceLTV`, `exitCapRate`, `dispositionCommission` |
| **Distributions** | Property IRR is healthy but LP-net IRR (after pref + waterfall) collapses to single digits; GP is over-promoted; pref tier is too thin; catch-up is too aggressive | `ownerPriorityReturn` (currently null on every seeded property — distribution mechanics are not configured yet); waterfall config in `compute_waterfall` skill (`lib/calc/src/analysis/waterfall.ts`) |

Most of the time — especially for the seed portfolio in May 2026 — the root cause is **operating**. Capital structure issues show up on highly-financed properties; distributions issues require a configured waterfall (which currently doesn't exist in seed).

### Step 4 — Lever selection

Once the root cause bucket is identified, pick the smallest lever set that lifts the property into the HEALTHY band without creating implausible inputs:

**For operating shortfall (most common):**
1. **Building improvements as the primary lever** (user-named in the May 1 2026 session). More improvement spend justifies: more rooms (buildout), upgraded F&B venue (cateringBoostPercent + revShareFB), event space (revShareEvents), luxury positioning (higher ADR + lower exit cap), amenities driving longer stays + repeat.
2. **Room count + ADR together** — bump both, check that physical/site claims hold (you can't 3× rooms on a 1-acre lot). Update `description` to justify the new room count.
3. **Revenue mix** — adding events (revShareEvents 0 → 0.15) or F&B catering boost (0 → 0.15) is conservative for properties with the physical capacity (kitchen, terrace, hall).
4. **Don't touch costRate values** unless they're wrong relative to industry norms — those are operator-effort levers, not asset-design levers.

**For capital structure:**
- Push acquisitionLTV higher (60% → 65–75%) when DSCR allows it
- Push refinanceLTV higher in Year 3 to extract trapped equity
- Lower exit cap rate by 0.5–1pp if the asset positioning legitimately moved up-market post-renovation

**For distributions:**
- This is currently the prerequisite for Specialist R (Rafaela). Not actionable until waterfall config + ownerPriorityReturn schema is in place. Note as a roadmap item, don't try to fix.

### Step 5 — Apply and re-verify

1. Edit the seed file (typically `artifacts/api-server/src/seeds/property-data.ts`)
2. Update the property `description` if room count or positioning changed — keep the narrative consistent with the financials
3. Re-run the diagnostic script — confirm the property landed in HEALTHY band AND that no other property's IRR shifted unexpectedly (a global change like default fee rates would cascade)
4. Type-check: `pnpm typecheck` (workspace-wide) — pre-existing errors in unrelated artifacts are OK; new errors are not
5. Commit with a message naming the lever and the verified outcome (e.g., "Lift Lakeview to 21% IRR via 14-room buildout + events revenue")

## Anti-patterns (drawn from the May 1 2026 session — these are mistakes I made)

1. **Hand-calculating IRR without occupancy ramp + pre-opening burn.** I diagnosed Jano Grande as 84% IRR by mental math; the real engine returned 41%. Hand-calc is wrong by 20-50pp on hospitality properties because of the ramp curve. Just run the engine.
2. **Building Specialist designs on unverified baselines.** I started designing two new Specialists (Q + R) before grounding the diagnosis. Half of the Specialist design rationale evaporated when the verified numbers came in (Jano Grande wasn't actually 84% — no need for the "moderate down" Specialist verdict).
3. **Conflating tracks.** When the user said "use compound engineering," I drifted from the immediate seed-fix into a multi-week Specialist roadmap and quietly dropped the LP-deck deadline. Track-separate before executing: (a) immediate fix, (b) methodology capture, (c) productization roadmap.
4. **Forgetting the prerequisite check.** Specialist R (Distributions) requires waterfall config that doesn't exist in the schema yet. Designing it without naming the prerequisite is the rewrite-tax pattern. Always section "Prerequisites" before "Design."
5. **Adjusting properties that don't need adjusting.** I proposed moderating Jano Grande from "84%" to "30-40%" before verifying. Don't touch healthy properties — every change is risk.

## Worked example — May 1 2026 Track 1 outcome

| Property | Baseline IRR | Action | Final IRR |
|---|---|---|---|
| Jano Grande Ranch | 41% | none — already healthy | 41% |
| Loch Sheldrake | 27% | none | 27% |
| Belleayre Mountain | 25% | none | 25% |
| Scott's House | 28% | none | 28% |
| **Lakeview Haven Lodge** | **−22%** | 8r → 14r buildout, $320 → $450 ADR, events 0 → 0.15, F&B catering 0 → 0.15, improvements $1.2M → $1.5M, maxOcc 0.68 → 0.70, description updated | **21%** |
| San Diego | 25% | none | 25% |

Levers used: roomCount, startAdr, revShareEvents, cateringBoostPercent, buildingImprovements, maxOccupancy, description (narrative consistency). Root cause: pure **operating shortfall** — 8 rooms × $320 ADR with no events/F&B premium produced $254K stabilized ANOI which barely covered $209K/yr debt service; exit value was less than equity invested. The buildout justified by an additional $300K of building improvements lifts the asset to 14 rooms at $450 ADR with proper F&B and event capacity, generating $1.06M stabilized ANOI and $9.93M exit.

## Engine call paths (verified May 1 2026)

| Function | Path |
|---|---|
| `generatePropertyProForma(property, global, months)` | `lib/engine/src/property/property-engine.ts:56` |
| `buildIRRVector(input)` (vector builder, not solver) | `lib/calc/src/returns/irr-vector.ts:57` |
| `computeIRR(cashFlows, periodsPerYear)` (Newton-Raphson) | `lib/analytics/src/returns/irr.ts:39` |
| `computeExitValuation(input)` | `lib/calc/src/returns/exit-valuation.ts:58` |
| `computeWaterfall(input)` (LP/GP distributions) | `lib/calc/src/analysis/waterfall.ts:99` |
| Property `equityInvested` semantics | `lib/engine/src/property/resolve-assumptions.ts:368` |

## Pricing model variants — when to switch from hotel cost-stack

Not every property is a hotel. The engine routes properties through one of four
business model archetypes via the `businessModel` field. **Always classify the
property first** — running a single-unit STR through the hotel cost stack
produces a fundamentally wrong picture of profitability.

| `businessModel` | When to use | Fee structure |
|---|---|---|
| `hotel` | Multi-room hospitality property; F&B + events + meetings | Cost-plus services (separate admin, marketing, IT, propops rates) + 8.5% base mgmt fee + 12% incentive on GOP |
| `lodge` | Whole-property retreat; rural; bundled F&B; no events | 18% base mgmt fee + 10% incentive; higher cleaning + utilities |
| `vrbo` | STR full-service ManCo (Vacasa/AvantStay-tier). Owner is **passive**; ManCo handles ALL operations | 25% consolidated all-in fee; no incentive; 14% blended platform commission |
| `vrbo_owner_managed` | STR listing-only ManCo (Evolve Core-tier). Owner arranges cleaning/maintenance/handyman directly with local vendors | 10% mgmt fee (listing + bookings + guest support only); 14% platform commission; OWNER pays variable + fixed property costs at owner-direct rates |

**Why two STR variants matter:**

The same property in the same market produces materially different IRRs depending
on whether the owner is passive (full-service ManCo) or active (owner-managed
listing). The Medellin Duplex worked example demonstrates this:

- Original misconfiguration (hotel cost stack on STR pricing): 4.8% IRR, $87K stabilized ANOI
- Switched to `vrbo` full-service: 2.4% IRR, $70K stabilized ANOI (worse — high mgmt fee + still some duplicated cost rates)
- Switched to `vrbo_owner_managed` with Medellin-calibrated rates: 11.0% IRR, $141K stabilized ANOI

The driver: in markets with low labor costs (Latin America, Eastern Europe, parts
of Asia), owner-direct sourcing of cleaning + handyman beats US-equivalent ManCo
overhead by 10-20pp of revenue. The `vrbo_owner_managed` model captures that.

**Bundle context:** STR-class properties often blend below the standalone
HEALTHY band (teens to low-20s IRR is normal for single-unit luxury STR) but
work fine when packaged with stronger hotel/lodge properties. A two-property
Colombia bundle of Jano Grande Ranch (41% IRR) + Medellin Duplex (11% IRR)
weighted by equity blends to ~31% — strongly LP-healthy. **Don't force a
single-unit STR into the standalone band by overstating occupancy or ADR; lift
it via bundling instead.**

## Cost-rate calibration cheatsheet — when defaults need a per-market override

The `BUSINESS_MODEL_DEFAULTS` table in `lib/shared/src/constants-business-models.ts`
ships with US-anchored cost rates. Override per-property when the market
materially differs:

| Cost rate | US benchmark (vrbo defaults) | Latin America override | Reason |
|---|---|---|---|
| `costRateRooms` | 0.30 (vrbo); 0.20 (hotel) | 0.06–0.14 | Cleaning labor 30-50% of US rates |
| `costRateUtilities` | 0.07 (vrbo) | 0.04 | Utilities materially cheaper |
| `costRateTaxes` | 0.03 | 0.018 | Property tax assessment lower |
| `costRatePropertyOps` | 0.06 (vrbo); 0.04 (vrbo_owner_managed) | 0.03–0.04 | Handyman labor cheaper |

Reference: AirROI 2026 cleaning fee economics; Colombia minimum wage data;
cost-of-living comparisons (https://thelatinvestor.com).

## What this skill is the spec for

When Specialists Q (Returns / Quitéria) and R (Distributions / Rafaela) are built, this procedure becomes their evaluator body — same root-cause taxonomy, same lever set, same band classification, same LP-credibility check. The skill compounds: every session that uses it improves the doctrine, and the doctrine becomes the productized Specialist when the prerequisites are met.

See `docs/architecture/decisions/ADR-010-returns-and-distributions-specialists.md` for the productization roadmap.
