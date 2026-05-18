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

## SUPERSEDING RULE — Default Variables belong in the DB, not in TypeScript

**As of 2026-05-13 this is the governing constraint.** Category 2 (DEFAULT
VARIABLES) described below was the correct approach during initial development.
The canonical architecture has since been locked:

> **No business or financial value may exist as a TypeScript constant.
> The only numbers that may live in TypeScript are math/physics absolutes
> (Category 1 below). Everything else lives in the database.**

Naming a financial value as a `const` does NOT make it acceptable — it is still
a hardcoded value, just with a disguise. The constant is opaque to the admin,
invisible to the agent layer, and requires a code deploy to change.

### How values reach the engine

```
DB bootstrap (migration SQL — one-time, source-documented)
         ↓
Layer 1: model_defaults table (universal fallback, editable by admin in "Model Defaults" UI)
         ↓
Layer 2: icp_brackets rows (bracket-level overlay, applied at entity creation)
         ↓
Layer 3: property / company row (per-entity value, always populated by the three-layer resolver)
         ↓
Engine reads Layer 3 only — no TypeScript fallback needed
```

The three-layer resolver guarantees that `property.exitCapRate` is **always
non-null** when the engine runs. The engine should read the field directly —
never fall back to a TypeScript constant.

### Concrete examples

**VIOLATION — TypeScript constant for a financial value:**
```ts
// BAD — constants.ts
export const DEFAULT_EXIT_CAP_RATE = 0.085;

// BAD — engine (fallback to TS constant is a violation)
const exitCapRate = property.exitCapRate ?? DEFAULT_EXIT_CAP_RATE;
```

**VIOLATION — Bracket defaults in TypeScript:**
```ts
// BAD — bracket-catalog.ts
const BRACKET_DEFAULT_US_TERTIARY_EXIT_CAP = 0.0975;
const BRACKET_DEFAULT_US_GATEWAY_EXIT_CAP  = 0.0850;
// These are financial policy values. They belong in icp_brackets DB rows,
// not as TypeScript constants — even well-named ones.
```

**VIOLATION — Service template rates as TypeScript array:**
```ts
// BAD — constants.ts
export const DEFAULT_SERVICE_FEE_CATEGORIES = [
  { name: "Marketing & Brand", rate: 0.02 },   // 2% is DB data, not code
  { name: "Accounting",        rate: 0.015 },  // 1.5% is DB data, not code
];
```

**VIOLATION — Refi LTV fallback in engine:**
```ts
// BAD
const refiCap = property.refiMaxLtvToOriginal ?? DEFAULT_REFI_MAX_LTV_TO_ORIGINAL;
// The resolver guarantees this field is set; the fallback constant is a crutch.
```

**CORRECT — Bootstrap values live in migration SQL with source citation:**
```sql
-- In 0060_initial_model_defaults.sql
-- Source: USALI 14th Edition §4, US hotel industry average
INSERT INTO model_defaults (key, value, label)
VALUES ('exitCapRate', 0.085, 'Default exit cap rate — US hotel average');

-- Source: CBRE Hotel Cap Rate Survey 2024 + 75bp hold-period premium (tertiary US markets)
INSERT INTO icp_brackets (slug, default_exit_cap_rate, default_refi_max_ltv_to_original)
VALUES ('us-tertiary-boutique-resort', 0.0975, 0.70);
```

**CORRECT — Engine reads from Layer-3 with no TS fallback:**
```ts
// CORRECT — three-layer resolver guarantees property.exitCapRate is always set
const exitCapRate = property.exitCapRate;
const refiCap     = property.refiMaxLtvToOriginal;
```

**CORRECT — Math/time absolutes may remain in TypeScript:**
```ts
// CORRECT — these are Category 1: definitional math, same everywhere
const MONTHS_PER_YEAR   = 12;     // definitional
const DAYS_PER_MONTH    = 30.5;   // 365/12, GAAP convention
const SECONDS_PER_DAY   = 86_400; // 24 × 60 × 60
```

**CORRECT — Algorithm calibration constants may remain in TypeScript:**
```ts
// CORRECT — IRS §382-derived algorithm parameter; admin does not configure this
export const NOL_UTILIZATION_CAP = 0.8; // max 80% of taxable income offset per year (IRS §382)

// CORRECT — priority ordering for a best-fit rule set; non-financial ordering
const PRIORITY_LATAM_LUXURY_STR_SINGLE_KEY = 100; // most-specific rule fires first
const PRIORITY_US_GATEWAY_BOUTIQUE         = 40;  // catch-all fires last
```

**CORRECT — SEED_* constants in migration guard files:**
```ts
// CORRECT — migration bootstrap only; SEED_* prefix; source citation in comment
// File: artifacts/api-server/src/migrations/icp-brackets-004.ts
const SEED_BRACKET_EXIT_CAP_RATE: Record<BracketId, number> = {
  [BRACKET_ID_US_TERTIARY_BOUTIQUE_RESORT]: 0.0975, // CBRE 2024, tertiary US + 75bp hold premium
  [BRACKET_ID_US_GATEWAY_BOUTIQUE]:         0.0850, // CBRE 2024, gateway US
};
// After this guard runs, the values live in icp_brackets rows.
// The SEED_* const exists ONLY to bootstrap the table — not used at runtime.
```

### Migration path for existing DEFAULT_* constants

**Confirmed 2026-05-13: ALL `DEFAULT_*` constants are violations — remove them
entirely over time, including from Drizzle schema `.default()` calls.** The
Drizzle schema should use an inline literal matching the SQL migration's
`DEFAULT` clause (the checker doesn't scan `lib/db/src`). The cleanup
discipline:

1. Identify the constant and every caller.
2. Ensure the `model_defaults` DB table has a row for the value (or the
   relevant `icp_brackets` column is populated).
3. Verify the three-layer resolver writes the value into every entity row at
   creation time.
4. Remove the `?? DEFAULT_X` fallback from the engine / route.
5. In the Drizzle schema, replace `.default(DEFAULT_X)` with the matching
   inline literal (e.g., `.default(0.70)`) — the SQL migration's `DEFAULT 0.70`
   is the single source of truth.
6. Delete the TypeScript `DEFAULT_*` constant.
7. Run the magic numbers check and typecheck — both must pass.

Do NOT remove a `DEFAULT_*` constant before completing steps 2–3. Removing
the fallback before the DB guarantee is in place causes null-dereference bugs.

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

## Category 2 — DEFAULT VARIABLES *(legacy — being migrated to DB)*

> **See SUPERSEDING RULE above.** Under the current architecture, Category 2
> values belong in the `model_defaults` DB table, not as TypeScript constants.
> The `DEFAULT_*` constants below are legacy debt from before the three-layer
> resolver existed. New code must NOT create new `DEFAULT_*` constants for
> business values. Existing ones are cleaned up incrementally as described
> in the SUPERSEDING RULE section.

**Historical definition (for understanding existing code):** Starting values
for financial assumptions. The admin sets them in **Admin → Model Defaults**.
Used to:
1. Seed the database on first deploy
2. Populate new entity forms (new property, new company setup)
3. Serve as code-level fallbacks when a DB field is null (legacy pattern only)

Default variables are admin-controlled. When the admin changes a default
in Model Defaults, the new value applies to any new entity and any unconfirmed
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

**Code rules (historical — DEFAULT_* is legacy debt being removed):**
- Prefix: always `DEFAULT_`
- Location: `lib/shared/src/constants*.ts` — nowhere else
- **The `?? DEFAULT_X` fallback pattern is a VIOLATION** under the superseding
  rule. The three-layer resolver guarantees every entity field is non-null
  before the engine runs — no TypeScript fallback is needed or correct.
- **Never create new `DEFAULT_*` constants for financial values.** The entire
  category is being migrated to DB rows.
- **`DEFAULT_*` in Drizzle schema `.default()` is also a violation** —
  transition to the inline literal matching the SQL migration's `DEFAULT` clause.

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

## Category 5 — STARTER-PORTFOLIO SEEDS

**Definition:** Calibrated numeric values for the pre-launch property cohort + management-company assumptions that ship with the app on first install. The chicken-and-egg constraint: you cannot seed a value from the DB before the DB exists. Category-5 surfaces hold these values as `SEED_*` named constants (or inline literals with provenance comments) **exclusively for DB-population code paths** — never for runtime engine/calc/route reads.

**Why it's distinct from Category 2:** Category 2 (`DEFAULT_*`) is legacy debt — a runtime fallback when the DB row is missing. Category 5 (`SEED_*`) is structural — it's the source value the DB row is populated FROM at install time. After install, the prod DB owns the value; the TS constant is a historical artifact of the calibration run.

**Conflict resolution:** On prod-DB conflict (the user/admin saved over the seed value), the DB row wins. `seed-model-defaults.ts` uses `onConflictDoNothing()` — re-running the seed against a prod DB with user edits leaves those edits intact.

**H+ examples:**
- `SEED_EXIT_CAP_RATE_LUXURY` (`lib/shared/src/constants.ts`) — calibrated to CBRE/JLL US luxury hospitality cap rate consensus 2025 (7.5-9.5% midpoint)
- `SEED_MEDELLIN_DUPLEX_START_ADR` (`lib/shared/src/constants.ts`) — calibrated to AirDNA Q1-2026 El Poblado top-decile listings
- `SEED_BRACKET_EXIT_CAP_RATE` (`artifacts/api-server/src/migrations/*.ts`) — migration bootstrap for `icp_brackets` rows
- Inline literals in `artifacts/api-server/src/seeds/property-data.ts` — per-property calibrated values for the dev/starter portfolio

**Allowed locations:**

| Location | What may live here |
|---|---|
| `artifacts/api-server/src/migrations/*.ts` | `SEED_*` named bootstrap constants for runtime migration guards |
| `artifacts/api-server/src/seeds/**` | `SEED_*` constants AND inline calibration literals for seed data (property-data.ts, market-rates.ts, etc.) |
| `artifacts/api-server/script/seed-*.ts` | Inline literals for SPECS arrays that drive `seed-model-defaults` upserts |
| `artifacts/api-server/src/syncHelpers.ts` | `SEED_GLOBAL_DEFAULTS` and one-shot sync payload constructors |
| `lib/shared/src/constants.ts` | `SEED_*` constants only, when cross-package import is needed |

**Mandatory contract:**

1. **`SEED_` prefix** in the constant name (when named) — distinguishes from `DEFAULT_*` legacy debt
2. **Source citation** in a comment block immediately above the declaration (or above the inline literal where named constants don't apply). Cite the calibration source: date, target metric, runbook link, market-data reference, audit.
3. **Never imported by runtime engine/calc/route code.** The "is this category 5?" test is: does any file outside the allowed locations import this? If yes → it's the masking anti-pattern, not a seed.

**Key rules:**

1. Adding a new starter property? Define its calibrated values inline in `seeds/property-data.ts` with provenance comments, or as `SEED_*` constants in `lib/shared/src/constants.ts` if cross-package.
2. Adding a new management-company assumption? Add a SPEC entry to `seed-model-defaults.ts` with an inline literal value, AND a corresponding schema column NOT NULL DEFAULT in `lib/db/src/schema/config.ts`.
3. Calibrating the dev scenario? Document the run in `docs/runbooks/seed-calibration-<date>.md` and cite that runbook in each `SEED_*` provenance comment. The runbook is the audit trail proving the scenario balances.
4. The cross-file ratchet (`check-magic-numbers.ts`) excludes all category-5 surfaces — cross-file duplication of seed literals does NOT regress the gate.

**Code rule:**
```ts
// CORRECT — Category 5: calibrated, prefixed, cited, in an allowed location
// (artifacts/api-server/src/seeds/property-data.ts)

/** Source: scenario calibration 2026-05-13 — IRR target 28-38% midpoint.
 *  See docs/runbooks/seed-calibration-2026-05-13.md */
export const SEED_HUDSON_ESTATE_EXIT_CAP_RATE = 0.085;

// WRONG — would be Category 5 by intent but no provenance, no SEED_ prefix
export const HUDSON_ESTATE_EXIT_CAP_RATE = 0.085;

// WRONG — wrong location (route file is runtime, not bootstrap)
// artifacts/api-server/src/routes/properties.ts
const SEED_DEFAULT_EXIT_CAP_RATE = 0.085;  // masking anti-pattern
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
| Calendar math (12 months, 365 days, 30.5 days/month) | True constant, formula comment | `constants.ts` IMMUTABLE section or inline |
| An IRS/GAAP-derived algorithm parameter (NOL cap, depreciation method) | Named constant, regulatory citation in comment | `lib/shared/src/constants*.ts` or inline in engine |
| A rule-ordering / priority integer (non-financial algorithm calibration) | Named `PRIORITY_*` constant near its rule definitions | Same file as the rules it orders (seed-only code) |
| A financial default the admin controls | DB row in `model_defaults` | Bootstrapped by migration SQL with source comment |
| A bracket-level overlay (exit cap, LTV by tier) | DB row in `icp_brackets` | Bootstrapped by migration SQL with source comment |
| A country-specific rate (tax, inflation, depreciation) | `getFactoryNumber(key, country)` | Registry lookup |
| A per-entity user-configurable value | DB column on `properties` / `companies` | Always populated by three-layer resolver at creation |
| Engine / calc function reading an entity value | `property.field` — no `?? DEFAULT_X` | DB value guaranteed by resolver |
| A bootstrap value in a migration SQL file | Inline SQL literal with source comment | Migration SQL only |
| A bootstrap value in a migration guard .ts file | `SEED_*` named constant with source comment | `artifacts/api-server/src/migrations/*.ts` only |
| A starter-portfolio calibration value (dev/prod first-install seed) | `SEED_*` named constant or inline literal — must carry source comment | `artifacts/api-server/src/seeds/**`, `script/seed-*.ts`, `syncHelpers.ts`, or `lib/shared/src/constants.ts` for cross-package SEED_* |
| `0` used as a structural floor/clamp | Inline `0` is fine | Inline |
| A test assertion or fixture value | Inline literal is fine | `*.test.ts` / `*.spec.ts` — checker skips these files |

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
| `0.085` (mgmt fee) | No — legacy `DEFAULT_*` violation | DB row in `model_defaults` |
| `0.075` (interest rate) | No — legacy `DEFAULT_*` violation | DB row in `model_defaults` |
| `0.30` (F&B share) | No — legacy `DEFAULT_*` violation | DB row in `model_defaults` |
| `0.70` (refi LTV cap) | No | DB column on `properties` (three-layer resolver) |
| `0.0975` (bracket exit cap) | No | DB row in `icp_brackets` (seeded by migration guard) |
| `39` (depreciation years) | No | `getFactoryNumber('depreciationYears', country)` |
| `30.5` (days/month) | Yes — math | `DAYS_PER_MONTH` — formula: `365/12` |
| `12` (months/year) | Yes — math | `MONTHS_PER_YEAR` |
| `0.8` (NOL utilization cap) | Yes — IRS §382 algorithm parameter | `NOL_UTILIZATION_CAP` in `constants.ts` |
| `100`, `90`, `70`… (bracket priority) | Yes — non-financial ordering | `PRIORITY_*` constants near their rule set |

---

## Magic-numbers checker exclusions (confirmed 2026-05-13)

The `check-magic-numbers.ts` ratchet intentionally skips these paths because
they are bootstrap or test contexts where raw literals are correct:

| Excluded path/pattern | Why |
|---|---|
| `*.test.ts`, `*.spec.ts` | Test assertions and fixture inputs are exempt — they document computed expectations, not business rules |
| `artifacts/api-server/src/migrations/*.ts` | Runtime guard files may contain `SEED_*` named bootstrap constants |
| `lib/db/migrations/*.sql` | Bootstrap SQL — the *source* of truth for DB values, not a consumer |
| `lib/db/src/schema/*.ts` | Drizzle schema `.default()` literals mirror their SQL migration; `lib/db/src` is not in SCAN_DIRS |

**Algorithm calibration constants are also exempt** from the "must live in DB"
rule: non-financial ordering or IRS/GAAP-derived algorithm parameters (priority
integers, NOL caps) may stay in TypeScript as named constants with regulatory
citations.

---

## Coupling with other skills

- **`hplus-assumption-lifecycle`** — UX rules for the Save button, confirm
  prompt, and the Default → Assumption → Confirmed flow
- **`constants-vs-defaults`** — distinguishes authority-dictated Constants
  (DB table) from market-driven Defaults (code constants)
- **`no-magic-numbers`** — enforcement layer (ratchet + vitest guard)
