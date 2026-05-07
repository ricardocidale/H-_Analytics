# Number Taxonomy & Assumption Lifecycle — Architecture Plan

**Date:** 2026-05-05
**Status:** Active — canonical reference, not to be re-litigated
**Scope:** All numbers, rates, and financial values in H+ Analytics

---

## Why this plan exists

Every few tasks an AI agent hardcodes `?? 0.03`, wraps it in `const DEFAULT_INFLATION_RATE = 0.03`, or calls it a constant. This happens because the categories were never written down in one place with enough authority. This document is that place. It answers three questions for every number an agent or developer encounters:

1. What *type* of number is this?
2. Where does it live in the system?
3. What is the correct code pattern to read or fallback to it?

---

## The four categories of numbers in H+ Analytics

---

### Category 1 — TRUE CONSTANTS

**Definition:** A value that is fixed by mathematics, physics, or an authoritative accounting standard that is identical everywhere in the universe and has never changed and cannot change by law, market, or jurisdiction. These are extremely rare.

**H+ examples that qualify:**
| Name | Value | Why it qualifies |
|---|---|---|
| `DAYS_PER_MONTH` | 30.5 | `365 ÷ 12` — arithmetic; GAAP may mandate this for pro-rata. Same in every country. |
| `MONTHS_PER_YEAR` | 12 | Definitional. |
| `SECONDS_PER_DAY` | 86400 | `24 × 60 × 60`. Physical definition. |
| `Math.PI` | 3.14159… | Constant of nature. |

**What does NOT qualify — ever:**

| Type | Why it is NOT a constant |
|---|---|
| Tax rates | Change by law, by year, by country. |
| Inflation rates | Market-driven. Change every quarter. |
| Depreciation years | IRS says 39 (US commercial), Canada CRA says 40 (Class 1), different again under Spanish/Colombian codes. Authority-dictated but jurisdiction-specific — not universal. |
| Interest rates | Market-driven. |
| Management fee rates | Market benchmark. Can change. |
| Occupancy rates | Assumption. User-configurable. |
| Exit cap rates | Market benchmark. Varies by market. |
| Transfer taxes | Jurisdiction-specific statutory rates. Change by law. |
| "Industry standard" anything | Only standard in one market/time. |

**If you find yourself wanting to name a value `FOO_CONSTANT` and the value involves a percentage, a rate, or a tax: stop. It is not a constant.**

**Code rule:**
```ts
// TRUE CONSTANT — no DEFAULT_ prefix, formula comment mandatory
const DAYS_PER_MONTH = 30.5;   // 365 / 12, GAAP accounting convention
const MONTHS_PER_YEAR = 12;    // definitional
```

Location: `lib/shared/src/constants.ts` IMMUTABLE section, or inline with formula comment where used.

---

### Category 2 — DEFAULT VARIABLES

**Definition:** Starting values for financial assumptions. The admin sets them in **Admin → Steady State**. They are used:
1. To seed the database on first deploy
2. To populate new property / company / assumption forms when a user adds a new entity
3. As code-level fallbacks — `property.costRateRooms ?? DEFAULT_COST_RATE_ROOMS` — for any DB field that is null

Default variables are admin-controlled. The admin may change them in Steady State and the new value propagates to any entity that has not yet confirmed its own assumption values.

**H+ examples:**
| Constant | Value | Notes |
|---|---|---|
| `DEFAULT_COST_RATE_ROOMS` | 0.20 | USALI rooms department |
| `DEFAULT_BASE_MANAGEMENT_FEE_RATE` | 0.085 | 8.5% base fee |
| `DEFAULT_REV_SHARE_FB` | 0.30 | 30% F&B share |
| `DEFAULT_MARKETING_RATE` | 0.05 | Company-level marketing (≠ `DEFAULT_COST_RATE_MARKETING` which is property S&M) |
| `DEFAULT_MAX_OCCUPANCY` | 0.85 | Ramp target |
| `DEFAULT_EXIT_CAP_RATE` | 0.085 | Exit cap rate fallback |
| `DEFAULT_LTV` | 0.75 | Acquisition LTV |
| `DEFAULT_INTEREST_RATE` | 0.09 | Debt interest fallback |
| `DEFAULT_TERM_YEARS` | 25 | Amortization term |

**Code rules:**
- Prefix: always `DEFAULT_`
- Location: `lib/shared/src/constants*.ts` ONLY — never in route handlers, engine files, or any non-constants file
- Usage: `?? DEFAULT_X` — always the named constant, never the raw literal
- Never duplicate a `DEFAULT_X` literal in two files — the constant is the single source of truth

**Country-specific rates are a special case.** Some rates (tax, inflation, depreciation) vary by country and must not be a single flat `DEFAULT_*` constant. Use `getFactoryNumber(key, country, state)` instead:

```ts
// CORRECT — country-aware
inflationRate: ga.inflationRate ?? getFactoryNumber('inflationRate', country)
taxRate:       property.taxRate ?? getFactoryNumber('taxRate', country, state)

// WRONG — flat constant masks country variation
inflationRate: ga.inflationRate ?? 0.03                   // literal
inflationRate: ga.inflationRate ?? DEFAULT_INFLATION_RATE  // masked literal
```

---

### Category 3 — ASSUMPTION VARIABLES

**Definition:** Per-entity values that start from Default Variables and can be edited by users (and admins). Stored in the database per entity (properties table, global_assumptions, etc.). Once a user confirms them (presses Save), they are authoritative — defaults no longer affect them.

**Lifecycle:**
```
Admin sets DEFAULT_BASE_MANAGEMENT_FEE_RATE = 0.085 in Steady State
        ↓
New property created → seeded with baseManagementFeeRate = 0.085
        ↓
User opens Property Edit → sees 8.5%
User changes to 9.0% and presses Save
        ↓
DB: baseManagementFeeRate = 0.090 (confirmed)
        ↓
Admin later changes DEFAULT_BASE_MANAGEMENT_FEE_RATE = 0.095
        ↓
This property still reads 9.0% — it was confirmed.
A NEW property created after the admin change is seeded at 9.5%.
```

**Inviolable UX rules:**
1. The Save button on any page or tab containing assumption variables is **never disabled or grayed out**
2. If a user navigates away from an assumption page without saving, the app shows a **"Confirm your values"** prompt
3. Once confirmed (saved), the DB value is authoritative — admin Default Variable changes do not override it
4. Unconfirmed fields (DB value is null) show the Default Variable value as the placeholder

**Code rules:**
```ts
// Engine / route handler — always read from DB, fallback to DEFAULT
costRateRooms: property.costRateRooms ?? DEFAULT_COST_RATE_ROOMS,

// For country-specific assumptions:
inflationRate: ga.inflationRate ?? getFactoryNumber('inflationRate', country),

// NEVER use raw literals as fallbacks:
costRateRooms: property.costRateRooms ?? 0.20,   // VIOLATION
```

---

### Category 4 — TABLE-SOURCED VALUES

**Definition:** Financial numbers that live in database tables rather than code constants. The most common case is country-based data (tax rates by country/state, inflation baselines by country, depreciation schedules by jurisdiction, market cap rate benchmarks).

**H+ examples:**
- Model constants registry (`model_constant_overrides` table) — accessed via `getFactoryNumber(key, country)`
- Country-specific tax rates
- Country inflation baselines
- Research / benchmark data tables in the knowledge registry
- Any table the admin can view and regenerate in **Admin → Sources & Resources**

**Key rules:**
1. Every table-sourced value must be admin-regeneratable from **Admin → Sources & Resources**. If an admin cannot trigger a refresh/regeneration of the underlying table from the admin UI, the data is incorrectly sourced.
2. The `model-constants-registry.ts` in `lib/shared/src/` contains hardcoded country baselines as a **bootstrap fallback only**. Production overrides come from the DB via `applyModelConstants*()`.
3. Never hardcode country-specific rates as `DEFAULT_*` constants — they must live in a country-keyed table so admins can update them without a code deploy.

**Code rules:**
```ts
// CORRECT — reads DB table via registry; admin can update via Sources & Resources
const inflation = getFactoryNumber('inflationRate', property.country)

// WRONG — admin cannot update this without a code deploy
const DEFAULT_COLOMBIA_INFLATION = 0.06;
```

---

## Master decision table

When you encounter a number and need to decide what to do with it:

| The number is... | Use... | Location |
|---|---|---|
| Calendar or physics math (12 months, 365 days, 30.5 days/month) | True constant — no DEFAULT_ prefix, formula comment | `constants.ts` IMMUTABLE section |
| A financial default the admin can change in Steady State | `DEFAULT_*` named constant | `lib/shared/src/constants*.ts` only |
| A country-specific rate (tax, inflation, depreciation) | `getFactoryNumber(key, country)` | Registry lookup |
| A per-entity user-editable assumption | Read from DB; `?? DEFAULT_X` fallback | DB → engine fallback |
| A null-check fallback in any route or engine file | `?? DEFAULT_X` — never `?? 0.085` | Named constant import |
| A number in a route handler with no named constant yet | Create the `DEFAULT_X` constant first; then use it | `constants*.ts` → import → use |
| A rate in a country or financial data table | Query via `getFactoryNumber()` or storage call | DB table |

---

## Violations found in codebase scan (to fix in ce.work pass)

### analyst-admin.ts — `gaToGlobalInput`
| Line | Violation | Fix |
|---|---|---|
| 116 | `ga.inflationRate ?? 0.03` | `?? getFactoryNumber('inflationRate')` |
| 117 | `ga.marketingRate ?? DEFAULT_COST_RATE_MARKETING` | `?? DEFAULT_MARKETING_RATE` — semantic error: 1% property S&M used instead of 5% company marketing |
| 119 | `dbDebt?.interestRate ?? 0.065` | `?? DEFAULT_INTEREST_RATE` |

### scenario-helpers.ts — `extractScenarioComputeInputs`
| Line | Violation | Fix |
|---|---|---|
| 75 | `scenarioGA?.inflationRate ?? 0.03` | `?? getFactoryNumber('inflationRate')` |
| 76 | `scenarioGA?.marketingRate ?? 0.01` | `?? DEFAULT_MARKETING_RATE` |
| 78 | `dbDebt?.interestRate ?? 0.065` | `?? DEFAULT_INTEREST_RATE` |
| ~79 | `dbDebt?.amortizationYears ?? 25` | `?? DEFAULT_TERM_YEARS` |

### structure-comparison.ts
| Line | Violation | Fix |
|---|---|---|
| 167 | `property.exitCapRate ?? 0.085` | `?? DEFAULT_EXIT_CAP_RATE` |

### properties.ts — stress-test handlers (GET and POST)
| Lines | Violations | Fix |
|---|---|---|
| 804–813, 850–861 | `?? 0.30`, `?? 0.18`, `?? 0.03`, `?? 0.20`, `?? 0.08`, `?? 0.01`, `?? 0.04`, `?? 0.05`, `?? 0.085`, `?? 0.12` | Named `DEFAULT_*` constants |
| 819 | `?? 0.75` | `?? DEFAULT_LTV` |
| 822 | `?? 0.09` | `?? DEFAULT_INTEREST_RATE` |
| 850 | `?? 0.70` (startOccupancy) | `?? DEFAULT_START_OCCUPANCY` (0.55) — **confirm intent**: stress test may want stabilized occupancy, not ramp-start |
| 851 | `?? 0.85` (maxOccupancy) | `?? DEFAULT_MAX_OCCUPANCY` |

### constants-business-models.ts — `BUSINESS_MODEL_DEFAULTS.hotel`
17 literals duplicate `DEFAULT_*` constants from `constants.ts`. Fix: move the 17 constants from `constants.ts` into `constants-business-models.ts` (breaking the circular import). They remain available via the `export * from './constants-business-models'` re-export in `constants.ts`. Use named constants throughout `BUSINESS_MODEL_DEFAULTS.hotel`.

---

## Open questions (record answers here as they are confirmed)

| # | Question | Answer |
|---|---|---|
| 1 | `DEFAULT_PROPERTY_INCOME_TAX_RATE = 0.25` vs registry `taxRate = 0.21` (US) — which wins? | Tax rates are never constants or flat defaults. Should route through `getFactoryNumber('taxRate', country)`. Requires `country` field on `PropertyInput`. Separate task. |
| 2 | Transfer tax constants in `exit-scenarios.ts` — move to admin Constants table? | Yes. Admin confirmed: "Authoritative rates live in admin Constants in the long run." Separate task. |
| 3 | `RESEARCH_*` constants in `property-metrics.ts` — intentionally different from app defaults? | Yes — these are AI research context benchmarks, not operational defaults. Leave as-is. |
| 4 | `startOccupancy ?? 0.70` in POST stress-test — stabilized occupancy (intentional) or should be `DEFAULT_START_OCCUPANCY` (0.55)? | Needs admin confirmation before fix. |

---

## Skills to create / update

| Action | File | Purpose |
|---|---|---|
| Create | `.agents/skills/hplus-variable-taxonomy/SKILL.md` | The four categories, decision table, code rules — CC-consumable format |
| Create | `.agents/skills/hplus-assumption-lifecycle/SKILL.md` | Default → Assumption → Confirmed lifecycle, UX rules, seeding rules |
| Update | `.agents/skills/no-magic-numbers/SKILL.md` | Cross-reference to taxonomy; strengthen "not a constant" list |
| Update | `CLAUDE.md` | Replace existing assumption-class section with the full 4-category taxonomy |

---

## Implementation sequence

| Step | Task | Gate |
|---|---|---|
| 1 | Write all four skill/memory updates | Done when files exist |
| 2 | Fix violations in analyst-admin.ts, scenario-helpers.ts, structure-comparison.ts | `check:typecheck` passes |
| 3 | Fix violations in properties.ts | `check:typecheck` passes |
| 4 | Refactor `BUSINESS_MODEL_DEFAULTS.hotel` — move constants | `check:typecheck` passes |
| 5 | Sync mirrors | `check:types-mirror` passes |
| 6 | Re-snapshot magic-numbers baseline | `check:magic-numbers` passes |
| 7 | Investigate `DEFAULT_PROPERTY_INCOME_TAX_RATE` → `getFactoryNumber` (requires `PropertyInput.country`) | Separate task |
| 8 | Transfer taxes → admin Constants table | Separate task |
