# Plan: Seed Default Values Optimization

**Status**: Draft — May 2026  
**Goal**: Tune the seed/default values so the H+ financial engine produces results that are simultaneously attractive to the management company (Norfolk AI Group) and to every individual property investor.

---

## Problem Frame

The development database is seeded from two canonical sources:

| Source | What it controls |
|---|---|
| `artifacts/api-server/src/seeds/properties.ts` | Global assumptions (management fees, capital raise, partner comp, overhead) |
| `artifacts/api-server/src/seeds/property-data.ts` | Per-property assumptions (ADR, occupancy, cost rates, debt terms, exit caps) |
| `lib/shared/src/constants.ts` + `constants-funding.ts` | Factory defaults used when individual fields are null |

A "result" is attractive when the financial engine — run against the seeded values — shows both:

- **Property perspective**: levered IRR ≥ 15% (target 18–22%), DSCR ≥ 1.25× at stabilization, equity multiple ≥ 2× over 10 years, NOI margin ≥ 28%.
- **Management company perspective**: management fee revenue covers company overhead (partner comp + staffing + office + tech) by Month 36–42, capital raise runway is adequate, no negative EBITDA after Y4.

Currently the seeds produce several tensions identified by reading the raw values:

1. Refinance interest rates are set at 9% uniformly — current market for stabilized luxury commercial is 7.0–7.5%.
2. Exit cap rates on some properties (9–10%) exceed market evidence for the luxury boutique tier (CBRE Q1-2026: 6.5–8.0%).
3. Several Colombia properties start at $240–$250 ADR, below the $300+ positioning the asset definition targets for luxury hospitality in growing LatAm markets.
4. The base management fee (8.5% of revenue) is structurally high relative to industry (3–5% base + 10–15% incentive). Combined with incentive fee and operating costs, some early-year property P&Ls may show negative cash flow.
5. Company-level hardcoded seed values (`marketingRate: 0.05`, `miscOpsRate: 0.03`) are not sourced from the model defaults registry — they may diverge from the live model defaults system.

---

## Scope

### In Scope
- `artifacts/api-server/src/seeds/property-data.ts` — per-property field values for all `SEED_INITIAL_PROPERTIES` and `SEED_SYNC_PROPERTIES`
- `artifacts/api-server/src/seeds/properties.ts` — `seedGlobalAssumptions` values (management fees, capital raise, partner comp, overhead rates)
- `lib/shared/src/constants-funding.ts` — `SEED_DEBT_ASSUMPTIONS` (global debt fallback)
- `lib/shared/src/constants.ts` — `DEFAULT_BASE_MANAGEMENT_FEE_RATE`, `DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE`, exit cap constants

### Out of Scope
- Database migrations or schema changes
- Engine calculation logic
- The model constants registry (country defaults / canonical rows) — those are authority-sourced

---

## Implementation Units

### T001 — Audit pass: compute key metrics from seed values

Before changing anything, write a small diagnostic script (or use the existing engine) to compute per-property stabilized-year metrics from the current seeds. Log:
- Year-1 revenue (rooms + F&B + events) given `startAdr × roomCount × 365 × startOccupancy`
- Management fee load (base + incentive) as % of revenue
- Estimated NOI margin
- DSCR estimate using acquisition debt service

This gives the quantitative baseline. Without it, tuning is guesswork.

**Files**: `scripts/src/` (new diagnostic script, disposable) or read existing `artifacts/api-server/src/routes/analyst-admin.ts` audit output via curl.  
**Acceptance**: table of 6 properties × {RevPAR, revenue Y1, mgmt fee $, NOI margin estimate} visible.

---

### T002 — Refinance interest rate correction

**Current**: `refinanceInterestRate: 0.09` on every property.  
**Issue**: 9% is acquisition bridge pricing. A stabilized luxury boutique refinancing in 2029–2031 against a 10yr Treasury of ~4.5% + 200bp spread = ~6.5–7.0%. Using 9% inflates debt service, suppresses levered IRR, and makes DSCR look tighter than reality.  
**Target**: `0.07` for US properties; `0.085` for Colombia (higher sovereign risk + local financing premium).

**Files**: `artifacts/api-server/src/seeds/property-data.ts` (per-property `refinanceInterestRate` fields in `SEED_INITIAL_PROPERTIES` and `SEED_SYNC_PROPERTIES`).  
**No constants change needed** — these are property-specific values, not defaults.

---

### T003 — Exit cap rate calibration

**Current**: 0.085–0.10 across properties (Jano Grande: 0.10, Loch Sheldrake: 0.09, Belleayre: 0.085, Scott's House: 0.085, Cartagena: 0.09, Lakeview: 0.08).  
**Market evidence** (CBRE Hospitality Cap Rate Survey Q1-2026):
- US luxury boutique / resort: 6.5–8.0%
- LatAm luxury (Colombia): 9.0–10.5% (higher risk premium, thinner buyer pool)

**Target**:
| Property | Current | Target | Rationale |
|---|---|---|---|
| Jano Grande Ranch (CO) | 0.10 | 0.10 | Keep — Colombia market evidence supports |
| Loch Sheldrake (NY) | 0.09 | 0.075 | Catskills luxury resort comp set 7.0–8.0% |
| Belleayre Mountain (NY) | 0.085 | 0.075 | Western Catskills, four-season — same comp |
| Scott's House (UT) | 0.085 | 0.075 | Wasatch luxury ADU/lodge — Mountain West |
| San Diego/Cartagena (CO) | 0.09 | 0.095 | Historic Cartagena boutique — LatAm premium |
| Lakeview Haven Lodge (UT) | 0.08 | 0.075 | Pineview Reservoir lodge — Mountain West |

**Files**: `artifacts/api-server/src/seeds/property-data.ts`.

---

### T004 — Colombia ADR adjustment

**Current**: Jano Grande `startAdr: 250`, San Diego/Cartagena `startAdr: 240`.  
**Issue**: The asset definition targets $150–600 luxury; Colombia boutique hotels in growing markets (Antioquia coffee country, historic Cartagena walled city) command $280–$380 for comparable luxury properties (STR/AirDNA Q1-2026 comps for luxury boutique in Cartagena walled city: $280–$450; Medellín area luxury haciendas: $220–$320).  
**Target**: Jano Grande → $290; San Diego/Cartagena → $310.  
**Rationale**: These are still conservative relative to the property descriptions (luxury hacienda, Caribbean colonial boutique); raising by ~$50–70 per property adds 20–28% to revenue at same occupancy.

**Files**: `artifacts/api-server/src/seeds/property-data.ts`.

---

### T005 — Management fee structure review

**Current**: `DEFAULT_BASE_MANAGEMENT_FEE_RATE = 0.085` (8.5% of total revenue), `DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE = 0.12` (12% of GOP).  
**Issue**: 8.5% base is above the typical market range for full-service boutique management (3–5% base). Combined with incentive, the all-in fee load at stabilization can reach 12–18% of revenue, which squeezes property NOI.  
**However**: The management company's break-even depends on this fee revenue. Reducing base fee without increasing the property portfolio scale or the incentive fee harms company economics.

**Two options** — choose based on T001 audit findings:

**Option A — Keep current structure, verify it still works after T002/T003/T004**  
If those three fixes bring property IRR above target without changing fees, no fee change needed. This preserves management company revenue.

**Option B — Rebalance: lower base, raise incentive**  
`DEFAULT_BASE_MANAGEMENT_FEE_RATE = 0.050` (5%) + `DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE = 0.15` (15% of GOP). This aligns incentives (company earns more when properties perform) and lowers the fixed cost burden on early-stage properties. At stabilized GOP margins of ~35%, all-in fee is similar; in the ramp-up years, the property saves cash.

**Defer decision to T001 audit output.** If per-property levered IRR ≥ 18% after T002–T004, keep Option A.

**Files** (if change needed): `lib/shared/src/constants.ts` (`DEFAULT_BASE_MANAGEMENT_FEE_RATE`, `DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE`) + mirror sync to `artifacts/api-server/src/shared/constants.ts`.

---

### T006 — Company overhead and capital raise calibration

**Current company seed**:
- `capitalRaise1Amount: 1_000_000`, `capitalRaise2Amount: 1_000_000` → $2M total
- `partnerCompYear1: 360_000` (3 partners × $120K)
- `marketingRate: 0.05`, `miscOpsRate: 0.03` (hardcoded — not from registry)
- `staffSalary: DEFAULT_STAFF_SALARY = 65_000`, `officeLeaseStart: 36_000`

**Analysis**:
- Year 1 partner comp: $360K
- Year 1 overhead: $36K office + $24K professional services + $18K tech + $12K insurance + staff (TBD) + travel = ~$90–110K
- Total Y1 burn before management fee revenue: ~$450–470K
- $2M / $460K burn ≈ 4.3 years to zero from raise alone (ignoring management fee revenue growth)
- Management fee revenue begins at first property stabilization (Month ~12–18 for Jano Grande, Month ~18–24 for others)
- At 5 stabilized properties × avg $700K revenue × 8.5% base fee = ~$297K/yr base fee revenue
- First management fee revenue appears ~Month 12; full portfolio not until Y3–Y4

**Verdict**: $2M raise appears sufficient if the first 2–3 properties stabilize on schedule and the company overhead stays below $500K/yr in Y1–Y2. The plan should verify this assumption rather than blindly raising the capital raise amounts.

**Specific seeds to check**:
- `marketingRate: 0.05` — 5% of company revenue is aggressive for a seed-stage company with 1–2 clients in Y1; consider `0.03` in early years (this is the company-level marketing spend, not property-level)
- `miscOpsRate: 0.03` — reasonable; leave

**Files**: `artifacts/api-server/src/seeds/properties.ts` (`marketingRate` value in `seedGlobalAssumptions`).

---

### T007 — SEED_DEBT_ASSUMPTIONS interest rate

**Current**: `SEED_DEBT_ASSUMPTIONS.interestRate = 0.09` — used as the global fallback when a property has no individual debt assumption set.  
**Issue**: 9% is a 2023 peak-rate assumption. May 2026 commercial lending rates are 6.5–8% depending on property/lender type. Pipeline properties that fall through to this default will show inflated debt service.  
**Target**: `interestRate: 0.075` — reflects current CMBS/SBA 504 midpoint.

**Files**: `lib/shared/src/constants-funding.ts` + mirror sync.  
**Note**: Per-property override rates already set correctly in `SEED_INITIAL_PROPERTIES` (7.0–9.5% by deal type); this only affects properties that use the default fallback path.

---

### T008 — Reseed dev DB and verify

After all changes:
1. Run `pnpm --filter @workspace/api-server exec tsx src/seed.ts --force` to reseed.
2. Open the H+ Analytics dashboard and verify:
   - Dashboard shows positive NOI for at least 4/6 active properties at their stabilized year
   - Company Funding tab shows positive company EBITDA trajectory reaching break-even by Year 3–4
   - Per-property IRR (visible in property detail or Executive Summary) ≥ 15% for US properties
3. Run `pnpm run typecheck` and `pnpm --filter @workspace/scripts run check:magic-numbers` to confirm no regressions.

---

### T009 — Update skill documentation

Update `.agents/skills/no-magic-numbers/SKILL.md` to document the masking anti-pattern.  
Update `replit.md` to note that seed default values live in `seeds/property-data.ts` and `seeds/properties.ts`, not in constants files.

---

## Constraints

- **No new masking constants**: Do not add `DEFAULT_REFINANCE_INTEREST_RATE = 0.07` or similar named constants just to satisfy the magic-numbers checker. These seed values are property-specific. If the same value appears in many places, use `--init` after the change to accept the new baseline, or consolidate into a named constant only if the value is genuinely reused across files with the same semantic meaning.
- **No schema changes**: All changes are to seed data and shared constants — no Drizzle migrations.
- **Preserve Colombian market realism**: Colombia properties carry real additional risk (higher acquisition interest, higher exit caps, higher operating taxes). Do not over-optimize them to US luxury benchmarks.
- **Do not touch the model constants registry**: Country defaults (inflation, tax, costRateTaxes) are authority-sourced; do not change them as part of this plan.

---

## Done Looks Like

- `pnpm run typecheck` — clean
- `pnpm --filter @workspace/scripts run check:magic-numbers` — no regressions
- Dev database reseeded; H+ Analytics UI shows:
  - ≥ 4/6 active properties with stabilized NOI margin ≥ 28%
  - Company Funding tab shows break-even trajectory by Y3–Y4
  - At least one property with levered IRR ≥ 15% visible in the UI
