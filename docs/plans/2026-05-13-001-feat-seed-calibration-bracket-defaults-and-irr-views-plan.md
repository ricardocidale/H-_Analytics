---
title: "feat: Seed calibration and bracket-default extension"
type: feat
status: active
date: 2026-05-13
---

# feat: Seed calibration and bracket-default extension

## Summary

Bring the demo portfolio's combined IRR from the current ~50%+ band into a defensible 25–30% boutique value-add target, while fixing the structural causes that produced the unrealistic seed in the first place. Three coordinated work streams: (1) **Tactical seed corrections** in the live DB — exit caps and Duplex occupancy; (2) **Engine + UI changes** for a configurable refi-LTV-to-original cap that prevents inflated mid-projection cash-out spikes; (3) **Structural bracket-default extension** that wires `exit_cap_rate` and `refi_max_ltv_to_original` into the bracket-default template pathway introduced in `docs/concepts/bracket-mix.md` § 6a, so future seeds and new entities inherit market-anchored values automatically.

The tactical fix unblocks the demo immediately; the structural fix prevents the same drift from recurring. IRR continues to be computed as today (single combined-portfolio figure) — no view changes in scope.

---

## Problem Frame

Investigation on 2026-05-13 confirmed:
- **Engine math is correct.** `lib/analytics/src/returns/irr.ts` (Newton-Raphson with relative-tolerance fallback) and `lib/engine/src/aggregation/yearlyAggregator.ts` correctly construct cash-flow vectors and compute IRR. No engine fix is in scope.
- **Seed assumptions are systematically off.** Three compounding causes: (a) every property's exit cap is tight to market by 100–600 bp and ignores the standard 75 bp 10-year hold-period premium (HVS / PwC / CBRE 2025 convention); (b) the Medellin Duplex's `max_occupancy` of 0.65 contradicts its $1,500 ADR ultra-luxury positioning, which mathematically requires 20–35% steady-state occupancy; (c) the refinance pass uses `NOI / exit_cap × refi_LTV` with no constraint relative to the original loan, producing $7–11M cash-out spikes in years 5–7.
- **The Duplex is structurally invisible to the dashboard.** Three blind spots stack: room-weighted averages give it 0.87% influence (1 of 115 rooms), `Full Equity` properties are silently skipped by ~5 financed-only branches in the calculation checker, and `vrbo_owner_managed` business-model routing diverges from hotel paths. Out of scope here (separate follow-up); noted because it explains why the bad Duplex assumptions went unnoticed.
- **No structural pathway exists for market-anchored defaults.** Per `docs/concepts/bracket-mix.md` § 6a (added 2026-05-13), bracket catalog rows should carry default-value templates that seed both the dev environment AND new entities at creation. Today, exit cap and refi LTV are not part of that template — they are set ad hoc at property-creation time, which is how the seed drifted off market in the first place.

User direction (2026-05-13):
- Target portfolio IRR: **25–30%** (typical boutique value-add).
- Show LP / asset / sponsor IRR side-by-side.
- Exit cap policy: **market going-in + 75 bp** for 10-year holds.
- Refinance: conservative, only refi if new loan ≤ user-configurable LTV × original loan; **default 70%**.
- Hold period: 10 years for all (institutional convention).
- Duplex exit cap may stay lower than market 11% to reflect strategic package-sale-to-Cartagena-guests thesis; document the rationale rather than fight it.

---

## Requirements

- **R1.** Update the live DB `properties.exit_cap_rate` for the seven demo properties to market going-in + 75 bp per the recommendation table in §"Implementation Units" U1, with the Duplex exception (~7–8% to reflect package-sale exit thesis, not the market 11%).
- **R2.** Update `properties.max_occupancy` for `Medellin Duplex` from 0.65 → 0.30 (start_occupancy stays 0.30, ramp_months stays 4 → effectively flat at 30% from month 4).
- **R3.** Add a user-editable property-level field `refi_max_ltv_to_original` (numeric, default 0.70). Surface in `client/src/pages/PropertyEdit` debt section. Type: DEFAULT VARIABLE per `hplus-variable-taxonomy`.
- **R4.** The refinance pass in `lib/engine/src/property/refinance-pass.ts` must compute its target new-loan amount as today (`NOI / exit_cap × refi_LTV`) but then **cap** it at `original_loan × refi_max_ltv_to_original`. If the cap binds, log the binding through the existing engine diagnostic channel; do not silently produce an inflated cash-out.
- **R5.** Extend the bracket-default template (DB schema and admin editor) with two new numeric fields: `default_exit_cap_rate` and `default_refi_max_ltv_to_original`. Both wire through the existing § 6a defaults flow: bracket row → weight-blended default → applied at `POST /api/properties` and at dev seed.
- **R6.** Backfill the seven existing bracket catalog rows with market-anchored values for both new fields per the recommendation table in U1.
- **R7.** Dev seed script reads the new bracket-default fields and applies them — no hardcoded exit cap or refi LTV remains in seed code (per `no-magic-numbers` skill).
- **R8.** After all DB changes, run `/api/finance/compute` against the demo company and verify combined portfolio IRR lands in **25–30%**. Document the before/after IRR table in the plan's completion notes. IRR computation itself is unchanged — single combined-portfolio figure as today.

---

## Non-Goals (Deferred)

- **Engine algorithm changes.** IRR Newton-Raphson, NOI roll-up, and exit-value formula stay as-is. Only inputs change.
- **Three-IRR / LP-vs-asset-vs-sponsor view.** Out of scope. Pure IRR — one figure — as today.
- **GP/LP equity split, waterfall, preferred return, or promote.** Out of scope. Pure IRR on the consolidated cash flow vector. No equity-share gymnastics.
- **Dashboard "show the Duplex" fixes.** The room-weighted blind-spot, financed-only-skip, and STR-routing issues are real but distinct; track as a separate follow-up. This plan only fixes the Duplex's *values*, not its visibility.
- **Confirmed → Default reconciliation.** Per `hplus-assumption-lifecycle`, existing entity values are owned by the entity and bracket-template changes do not retroactively update them. The seven demo properties are updated by direct DB write in U1; no auto-cascade.
- **Cap-rate research automation.** The market-anchored values in U1 come from manual research synthesizing HVS / PwC / CBRE / Airbnb / Tripadvisor 2024–2025 data. A future plan can wire this into a Pietro / Costantino periodic refresh.
- **Hold-period flexibility.** Holds remain 10-yr for all per user direction. A configurable hold period per property is out of scope.
- **Mgmt Co fee or vendor pass-through recalibration.** Out of scope; if combined IRR still lands above 30% after U1–U7 land, revisit in a follow-up.

---

## Implementation Units

### U1: DB seed corrections (tactical)

**Files (data, not code):** Direct UPDATE against `properties` and `icp_brackets` tables in the dev/demo Neon DB via the `executeSql`-equivalent admin route or a one-off Node script using `process.env.POSTGRES_URL` per `replit.md` gotchas.

**Changes:**

| Property | Stored exit cap | New exit cap | Rationale |
|---|---|---|---|
| Belleayre Mountain | 8.50% | **9.75%** | Catskills tertiary going-in 9.0% + 75 bp |
| Loch Sheldrake | 7.50% | **9.75%** | Catskills tertiary going-in 9.0% + 75 bp |
| Lakeview Haven Lodge | 8.00% | **9.75%** | Ogden Valley tertiary going-in 9.0% + 75 bp |
| Scott's House | 8.50% | **9.75%** | Ogden Valley tertiary going-in 9.0% + 75 bp |
| Jano Grande Ranch | 9.00% | **12.00%** | Rural Antioquia going-in 11.0% + 100 bp (illiquidity) |
| "San Diego" Cartagena | 9.00% | **10.50%** | Cartagena prime going-in 9.75% + 75 bp |
| Medellin Duplex | 6.00% | **7.50%** | Strategic package-sale exit (intentional below-market) — document rationale |

Plus: `Medellin Duplex.max_occupancy` from 0.65 → **0.30**.

**Acceptance:** All seven exit caps and the Duplex max-occupancy reflected in DB. A short markdown note added under `docs/runbooks/seed-calibration-2026-05-13.md` recording the before/after values and the rationale for the Duplex exception.

**Tests:** Manual — re-run `GET /api/finance/compute` and confirm combined IRR moves into 25–30% band before any other unit lands. This is the calibration sanity check that gates U2–U7.

### U2: Refi LTV cap — schema + engine

**Files:**
- `lib/db/src/schema/properties.ts` — add column `refi_max_ltv_to_original numeric default 0.70 not null`.
- `lib/db/migrations/` — new migration file (next sequential number; check `drizzle/migrations/__drizzle_migrations` per `docs/runbooks/schema-migrations.md`).
- `lib/engine/src/property/refinance-pass.ts` — read `refi_max_ltv_to_original` from property context; cap target loan at `original_loan_amount × refi_max_ltv_to_original`; emit diagnostic when cap binds.
- `lib/engine/src/property/resolve-assumptions.ts` — surface field on property context.
- `artifacts/api-server/src/routes/properties.ts` — accept and validate field on PATCH/POST.

**Tests:**
- `lib/engine/src/property/__tests__/refinance-pass.test.ts` — three scenarios: (a) cap does not bind (refi target < cap, behavior unchanged); (b) cap binds at 70% default (target = original × 0.70); (c) custom 50% cap binds tighter.
- `lib/engine/src/property/__tests__/resolve-assumptions.test.ts` — default value 0.70 applied when field absent.

**Acceptance:** Engine never produces a refinance loan amount above `original_loan × refi_max_ltv_to_original`. Diagnostic logged when cap binds. Test suite green.

### U3: Refi LTV cap — UI

**Files:**
- `artifacts/hospitality-business-portal/src/components/property-edit/DebtSection.tsx` (or wherever the existing refi LTV field lives — confirm in research) — add input for `refi_max_ltv_to_original` next to existing `refi_ltv` field. Default 70%, 0–100% range, helper text: "Maximum new loan as % of original loan basis. Caps cash-out refinance to prevent inflated mid-projection spikes."

**Tests:** Manual — load a property's edit page, confirm field renders with default 0.70, save round-trips correctly.

**Acceptance:** Field editable, saves to DB, engine reads it on next compute.

### U5: Bracket-default schema extension

**Files:**
- `lib/db/src/schema/icp-brackets.ts` (or wherever bracket-default templates live — `artifacts/api-server/src/ai/icp/bracket-catalog.ts` per `important_files`) — add `default_exit_cap_rate numeric` and `default_refi_max_ltv_to_original numeric default 0.70` to whatever DB-row + Zod schema models the bracket template.
- `lib/db/migrations/` — sequential migration adding the two columns.
- Admin editor for bracket catalog (locate in research, likely under `artifacts/hospitality-business-portal/src/pages/admin/brackets/`) — add two numeric inputs.

**Tests:**
- `lib/db/__tests__/icp-brackets-schema.test.ts` (extend existing) — round-trip new fields.
- Admin editor: manual save/load round-trip.

**Acceptance:** Both fields editable in admin, persisted in DB, available on bracket-row reads.

### U6: Bracket-default seeding pathway

**Files:**
- `artifacts/api-server/src/routes/properties.ts` `POST /api/properties` handler — after resolving company bracket mix, weight-blend `default_exit_cap_rate` and `default_refi_max_ltv_to_original` across mix entries and write into the new property's columns.
- ManCo creation handler (locate via `rg "POST.*companies" artifacts/api-server/src/routes/`) — same blending applied to any ManCo-level defaults that consume these.
- Dev seed script (locate via `rg "icp_brackets" artifacts/api-server/src/seed/` or `lib/db/seed/`) — read bracket rows for both fields; remove any hardcoded exit cap or refi LTV literals.

**Tests:**
- Integration test against `POST /api/properties` with a known bracket mix → asserts the new property's exit cap and refi LTV match the weight-blended bracket-template values.
- Re-run dev seed; confirm seven demo properties end up with U1's exit-cap values purely from bracket templates (no hardcoded literals in seed code).

**Acceptance:** Creating a new property in dev/staging/prod inherits market-anchored exit cap and refi LTV from the active bracket mix. Dev seed is fully bracket-driven.

### U7: Bracket catalog backfill

**Files (data):** UPDATE the seven `icp_brackets` rows so each carries the right `default_exit_cap_rate` and `default_refi_max_ltv_to_original` for its tier:

| Bracket tier | default_exit_cap_rate | default_refi_max_ltv_to_original |
|---|---|---|
| US tertiary boutique resort | 9.75% | 0.70 |
| US gateway boutique | 8.50% | 0.70 |
| Latin America prime urban boutique | 10.50% | 0.65 |
| Latin America rural / illiquid | 12.00% | 0.60 |
| Latin America luxury STR (single-key) | 11.00% (note: Duplex uses overridden 7.50% per package-sale exception) | 0.70 |
| (and any other existing brackets — enumerate during U7 from `artifacts/api-server/src/ai/icp/bracket-catalog.ts`) | (research at U7 start) | (research at U7 start) |

**Acceptance:** All bracket rows carry both fields. The dev seed re-run from U6 produces the U1 exit caps for the seven demo properties (modulo the Duplex package-sale override, which is set per-entity not per-bracket).

### U8: Verification + documentation

**Files:**
- `docs/runbooks/seed-calibration-2026-05-13.md` (created in U1) — append before/after IRR table for all 7 properties + portfolio combined.
- `docs/concepts/bracket-mix.md` § 6a — add a sentence to the "Why this matters operationally" callout pointing at this plan as the first concrete bracket-default fields beyond the original list.

**Acceptance:**
- Combined portfolio IRR lands in **25–30%** band.
- Per-property IRRs all defensible: outliers (Jano, Loch Sheldrake) brought below 50%; Duplex IRR may sit lower (10–15%) consistent with the strategic package-sale exit and the corrected occupancy.
- IRR computation unchanged from today — single combined-portfolio figure surfaced as before.
- Documentation reflects the new defaults pathway.

---

## Sequencing

```
U1 (tactical DB seed) ──► sanity-check IRR moves into 25-30% band
                              │
                              ├──► U2 (refi cap engine) ──► U3 (refi cap UI)
                              │
                              └──► U5 (bracket-default schema) ──► U6 (seeding pathway) ──► U7 (catalog backfill)
                                                                                                  │
                                                                                                  └──► U8 (verify + doc)
```

U1 must land first and produce the IRR sanity check. U2/U3 and U5/U6/U7 are independent and can run in parallel. U8 is the final close-out.

---

## Key Technical Decisions

- **Refi LTV cap is a per-property DEFAULT VARIABLE, not a TRUE CONSTANT.** Default 0.70 lives in the bracket-default template; per-property override is allowed (per `hplus-variable-taxonomy`).
- **Duplex exit cap stays at 7.5% per user direction** — this is a per-entity strategic-exit override, NOT a market-anchored default. The bracket-default template for "Latin America luxury STR (single-key)" carries 11% as the market-anchored value; the Duplex's 7.5% is documented as a deliberate deviation in U1's runbook note.
- **IRR computation is unchanged — pure IRR.** Single combined-portfolio IRR per current code paths (`computeIRR(consolidatedFlows, 1)` in `lib/engine/src/aggregation/yearlyAggregator.ts`). One IRR figure, computed from the net consolidated cash flow vector as today — no GP/LP split, no waterfall overlay, no preferred return, no promote tiers, no LP-vs-asset-vs-sponsor variants. The `lpEquityPct` field and `computeWaterfall` machinery exist in the codebase but are out of scope for this plan. The 25–30% target band applies to this single pure IRR figure as it surfaces today.
- **No hardcoded literals in seed code per `no-magic-numbers`.** All values flow from bracket template → DB → seed; seed code reads bracket rows.
- **Migrations follow `docs/runbooks/schema-migrations.md`.** Both U2 and U5 add a sequential migration; verify the journal sync state after applying.

---

## Risks

- **Engine refi-cap regression.** The cap could mis-trigger on edge cases (no original loan, full-equity refi, etc.). Mitigation: test cases U2 cover three branches; engine diagnostic when cap binds is the safety net.
- **Bracket mix weight-blending math drift.** If two brackets in a mix have very different exit caps, weight-blending the numeric value may not match what a user intuitively expects. Mitigation: U6 integration test pins the blending math; admin can always override per-property post-creation.
- **Duplex package-sale rationale degrades over time.** A future engineer may "correct" the 7.5% cap to market 11% without context. Mitigation: the U1 runbook note + a comment on the Duplex's `exit_cap_rate` row in `properties` (via DB COMMENT) documenting the package-sale rationale.
- **Combined IRR may land below 25% after all changes.** If so, two follow-up levers are available: (a) tighten exit caps closer to going-in (drop the 75 bp hold premium toward 50 bp), or (b) revisit Mgmt Co fees / vendor pass-throughs which are explicitly out of scope here. Document the as-landed IRR in U8 and call out the lever choice if needed.
- **`Drizzle migration journal lag` per `replit.md` gotcha.** After U2 and U5 migrations apply, verify `drizzle.__drizzle_migrations` is in sync per the runbook; do not assume `drizzle-kit push` succeeded silently.

---

## References

- `docs/concepts/bracket-mix.md` § 6a — defaults-template flow this plan operationalizes.
- `docs/runbooks/schema-migrations.md` — migration discipline for U2 and U5.
- `hplus-variable-taxonomy` skill — DEFAULT vs ASSUMPTION variable classification.
- `hplus-assumption-lifecycle` skill — why bracket changes do not retroactively update existing entities.
- `no-magic-numbers` skill — why seed code must not carry hardcoded exit caps.
- `front-of-app-admin-isolation` skill — bracket-template editing must live in admin only.
- HVS, PwC Investor Survey 2025, CBRE — exit-cap convention sources backing the +75 bp hold-period premium.
- Prior IRR investigation (this conversation, 2026-05-13) — engine math verified clean; seed identified as the cause.
