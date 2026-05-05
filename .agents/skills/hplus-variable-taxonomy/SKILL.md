---
name: hplus-variable-taxonomy
description: >
  Authoritative taxonomy of every number in H+ Analytics: TRUE CONSTANTS,
  DEFAULT VARIABLES, ASSUMPTION VARIABLES, and TABLE-SOURCED VALUES.
  Load before writing ANY numeric literal, named constant, DEFAULT_*, or
  fallback value anywhere in the codebase. Prevents the most common and
  most expensive recurring mistake: masking a configurable variable as a
  constant.
---

# H+ Analytics — Number Taxonomy

This is the single source of truth. Do not re-derive these categories.
Do not invent new categories. Every number in the codebase falls into exactly
one of these four buckets.

---

## Category 1 — TRUE CONSTANTS

**Definition:** A value that is fixed by mathematics, physics, or an
accounting standard that is **identical everywhere in the universe** and
**cannot change by law, market, or jurisdiction**. These are extremely rare.

**H+ examples that qualify:**

| Name | Value | Derivation |
|---|---|---|
| `DAYS_PER_MONTH` | 30.5 | `365 ÷ 12` — GAAP pro-rata convention |
| `MONTHS_PER_YEAR` | 12 | Definitional |
| `SECONDS_PER_DAY` | 86400 | `24 × 60 × 60` |
| `Math.PI` | 3.14159… | Constant of nature |

**The following are NOT true constants — ever:**

| Type | Why |
|---|---|
| Tax rates (income, property, transfer, VAT) | Change by law, year, country |
| Inflation rates | Market-driven, change quarterly |
| Depreciation years | IRS = 39 (US commercial), CRA = 40 (Canada Class 1), different under Colombian/Spanish codes |
| Interest rates | Market-driven |
| Management fee rates | Market benchmark, negotiated per deal |
| Occupancy rates | User assumption, varies by property |
| Exit cap rates | Market benchmark, varies by market and cycle |
| Transfer taxes | Jurisdiction-specific statutory rates |
| "Industry standard" anything | Only standard in one market at one time |

**Rule:** If the value involves a percentage, a rate, a tax, or anything a
reasonable admin might want to update — it is NOT a true constant.

**Code pattern:**
```ts
// TRUE CONSTANT — no DEFAULT_ prefix; formula comment is mandatory
const DAYS_PER_MONTH = 30.5;   // 365 / 12, GAAP accounting convention
const MONTHS_PER_YEAR = 12;    // definitional calendar unit
```

**Location:** `lib/shared/src/constants.ts` IMMUTABLE section, or inline
with formula comment where used once.

---

## Category 2 — DEFAULT VARIABLES

**Definition:** Starting values for financial assumptions. The admin sets
them in **Admin → Steady State**. Used to:
1. Seed the database on first deploy
2. Populate new entity forms (new property, new company setup)
3. Serve as code-level fallbacks when a DB field is null

Default variables are admin-controlled. When the admin changes a default
in Steady State, the new value applies to any new entity and any unconfirmed
field. It does NOT override already-confirmed assumption variables.

**H+ examples:**

| Constant | Value | Meaning |
|---|---|---|
| `DEFAULT_COST_RATE_ROOMS` | 0.20 | 20% rooms department cost |
| `DEFAULT_BASE_MANAGEMENT_FEE_RATE` | 0.085 | 8.5% base management fee |
| `DEFAULT_REV_SHARE_FB` | 0.30 | 30% F&B revenue share |
| `DEFAULT_MARKETING_RATE` | 0.05 | Company-level marketing (≠ `DEFAULT_COST_RATE_MARKETING` = 1% property S&M) |
| `DEFAULT_MAX_OCCUPANCY` | 0.85 | Occupancy ramp ceiling |
| `DEFAULT_EXIT_CAP_RATE` | 0.085 | Exit cap rate fallback |
| `DEFAULT_LTV` | 0.75 | Acquisition loan-to-value |
| `DEFAULT_INTEREST_RATE` | 0.075 | Debt interest rate fallback (lives in `constants-funding.ts`) |
| `DEFAULT_TERM_YEARS` | 25 | Amortization term |

**Code rules:**
- Prefix: always `DEFAULT_`
- Location: `lib/shared/src/constants*.ts` — nowhere else
- Usage as null-coalescing fallback: `property.field ?? DEFAULT_FIELD`
- **Never use the raw literal** when a `DEFAULT_*` constant exists
- **Never duplicate a `DEFAULT_*` value** in two files — the constant is
  the single source of truth
- **Seed files MUST reference `DEFAULT_*` constants** — never write a raw
  literal in seed data. The flow is: `DEFAULT_X` defined in constants → seed
  file imports `DEFAULT_X` → DB row initialised with `DEFAULT_X`. A raw
  literal in a seed file breaks the single-source-of-truth chain and causes
  silent drift the moment the constant is recalibrated.

**Country-specific rates are a special case.** Tax rates, inflation baselines,
and depreciation lives vary by country. They must use `getFactoryNumber()`,
not a flat `DEFAULT_*` constant:

```ts
// CORRECT — country-aware fallback
inflationRate: ga.inflationRate ?? getFactoryNumber('inflationRate', country)
taxRate:       property.taxRate  ?? getFactoryNumber('taxRate', country, state)

// WRONG — flat constant masks country variation
inflationRate: ga.inflationRate ?? 0.03                    // raw literal
inflationRate: ga.inflationRate ?? DEFAULT_INFLATION_RATE  // masked literal
```

---

## Category 3 — ASSUMPTION VARIABLES

**Definition:** Per-entity values that start from Default Variables and can
be edited by users and admins. Stored in the database per entity (properties
table, global_assumptions, etc.). Once confirmed (user presses Save), they
are authoritative and defaults no longer affect them.

**Lifecycle:**
```
Admin sets DEFAULT_BASE_MANAGEMENT_FEE_RATE = 0.085 in Steady State
    ↓
New property created → seeded with baseManagementFeeRate = 0.085
    ↓
User opens Property Edit → sees 8.5%
User changes to 9.0% and presses Save
    ↓
DB: baseManagementFeeRate = 0.090  ← confirmed
    ↓
Admin later changes DEFAULT_BASE_MANAGEMENT_FEE_RATE = 0.095
    ↓
This property still reads 9.0% (confirmed)
A NEW property is seeded at 9.5%
```

**Inviolable UX rules:**
1. The Save button on any page or tab with assumption variables is **never
   disabled or grayed out**
2. If the user navigates away without saving, show a **"Confirm your values"**
   prompt
3. Once confirmed, the DB value is authoritative — admin default changes
   do not override it
4. Unconfirmed fields (DB = null) display the Default Variable value as
   placeholder

**Code rule:**
```ts
// Read from DB; fallback to named DEFAULT_* constant — never a literal
costRateRooms:    property.costRateRooms    ?? DEFAULT_COST_RATE_ROOMS,
baseMgmtFeeRate:  property.baseManagementFeeRate ?? DEFAULT_BASE_MANAGEMENT_FEE_RATE,

// Country-specific:
inflationRate:    ga.inflationRate ?? getFactoryNumber('inflationRate', country),

// VIOLATION — raw literal fallback:
costRateRooms:    property.costRateRooms ?? 0.20,
```

---

## Category 4 — TABLE-SOURCED VALUES

**Definition:** Financial numbers that live in database tables rather than
code. The most common case is country-based data (tax rates, inflation
baselines, depreciation schedules by jurisdiction). These tables are
admin-regeneratable from **Admin → Sources & Resources**.

**H+ examples:**
- Model constants registry (`model_constant_overrides` table) — accessed
  via `getFactoryNumber(key, country, state)`
- Country-specific tax rates
- Country inflation baselines
- Research / benchmark data tables in the knowledge registry

**Key rules:**
1. Every table-sourced value must be admin-regeneratable from
   **Admin → Sources & Resources** without a code deploy
2. `model-constants-registry.ts` in `lib/shared/src/` contains hardcoded
   country baselines as a **bootstrap fallback only**; production overrides
   come from the DB
3. Never hardcode a country-specific rate as a `DEFAULT_*` constant — it
   must live in a country-keyed table

**Code rule:**
```ts
// CORRECT
const inflation = getFactoryNumber('inflationRate', property.country)

// WRONG — admin cannot update without a code deploy
const DEFAULT_COLOMBIA_INFLATION = 0.06;
```

---

## Master decision table

| The number is… | Use… | Location |
|---|---|---|
| Calendar math (12 months, 365 days, 30.5 days/month) | True constant, formula comment | `constants.ts` IMMUTABLE section |
| A financial default the admin controls in Steady State | `DEFAULT_*` named constant | `lib/shared/src/constants*.ts` only |
| A country-specific rate (tax, inflation, depreciation) | `getFactoryNumber(key, country)` | Registry lookup |
| A null-check fallback in any route/engine file | `?? DEFAULT_X` — named constant | Import from `@shared/constants` |
| A new constant with no named constant yet | Define `DEFAULT_X` first; then use | `constants*.ts` → import → use |
| A seed value (DB row initial value) | Import `DEFAULT_X`; reference it in seed | Never a raw literal in seed files |
| A rate in a country or financial data table | `getFactoryNumber()` or storage | DB table |
| A per-entity user-configurable value | DB read + `?? DEFAULT_X` fallback | DB column |
| `0` used as a structural floor/clamp | Inline `0` is fine | Inline |

---

## The masking anti-pattern — memorise this

The single most common violation is **wrapping a literal in a local constant**
to satisfy the ratchet while changing nothing about the real problem:

```ts
// VIOLATION — this is still a masked variable
const DEFAULT_INFLATION_RATE = 0.03;
// ↑ "constant" is wrapping a user-configurable assumption.
// If Colombia's inflation is 0.06, this code gives the wrong answer
// for every Colombian property regardless of how the admin configures it.

// CORRECT
inflationRate: ga.inflationRate ?? getFactoryNumber('inflationRate', country)
```

**The test:** ask "Could the admin legitimately want a different value for
this number?" If yes, it is not a constant — it is a default variable or a
table-sourced value.

---

## What this means for common values

| Value | Is it a constant? | Correct treatment |
|---|---|---|
| `0.03` (inflation) | No | `getFactoryNumber('inflationRate', country)` |
| `0.21` (US income tax) | No | `getFactoryNumber('taxRate', 'United States')` |
| `0.085` (mgmt fee) | No | `DEFAULT_BASE_MANAGEMENT_FEE_RATE` |
| `0.075` (interest rate) | No | `DEFAULT_INTEREST_RATE` (in `constants-funding.ts`) |
| `0.30` (F&B share) | No | `DEFAULT_REV_SHARE_FB` |
| `39` (depreciation years) | No | `getFactoryNumber('depreciationYears', country)` |
| `30.5` (days/month) | Yes | `DAYS_PER_MONTH` — formula: `365/12` |
| `12` (months/year) | Yes | `MONTHS_PER_YEAR` |

---

## Coupling with other skills

- **`hplus-assumption-lifecycle`** — UX rules for the Save button, confirm
  prompt, and the Default → Assumption → Confirmed flow
- **`constants-vs-defaults`** — distinguishes authority-dictated Constants
  (DB table) from market-driven Defaults (code constants)
- **`no-magic-numbers`** — enforcement layer (ratchet + vitest guard)
