---
name: constants-vs-defaults
description: Distinguish authority-dictated Constants from market-driven Defaults so each lives in the right system. Constants come from external authorities (IRS, GAAP, ISO, country tax agencies), are sourced and dated, and belong in an admin-editable database table scoped by country / tax bracket / business type with a USA fallback. Defaults are internal calibration estimates that live in code as named constants. Use whenever you encounter a financial value, a regulatory rate, a tax assumption, a depreciation life, a reporting threshold, or any number whose source is "an authority published this".
---

# Constants vs Defaults

A discipline for separating two kinds of "non-magic" numbers that look identical in code but require completely different systems around them.

## The two categories

### Constant (authority-dictated)

A value that comes from an external authority — a regulator, a standards body, a tax agency, an industry standards organization. The authority is the source of truth. The number may change when the authority changes it, and never otherwise.

**Examples:**
- US federal corporate income tax rate (IRS, 21%)
- Non-residential real-property depreciation life (IRS Pub 946, 39 years)
- USALI revenue line definitions (AHLA standard)
- ISO currency precision (ISO 4217)
- Country-specific VAT rates
- Country-specific minimum wage
- Country-specific employer-side payroll tax rates

**Properties:**
- Has a citable authority (URL, document name, statute reference).
- Has an effective date (and often an "as-of" date).
- Is scoped by jurisdiction (country, often state/province, sometimes tax bracket or business type).
- Changes are events, not opinions — when the IRS changes a rate, every system using it should change too.
- Admins (not engineers) should be able to update it without a deploy.

### Default (market-driven, seed-shaped)

A value that represents a reasonable starting estimate when no better data is available. No single authority publishes it. The number reflects internal calibration against industry benchmarks, prior deals, market research, or expert judgment.

**Defaults are SEED VALUES.** They are the canonical source from which DB rows get populated when a fresh tenant is created, when a new admin_resources benchmark row is registered, or when a Specialist evaluator needs reference data on cold start. The named code constant is both the runtime fallback AND the seed source — those are the same thing by design.

**Examples (point-shaped):**
- Default exit cap rate for a luxury hotel (e.g. 8.5%)
- Default RevPAR assumption for a market segment
- Default management fee percentage
- Default F&B cost ratio
- Default leverage ratio for a development pro forma

**Examples (range-shaped — benchmark bands):**
- Specialist watchdog reference ranges for ManCo overhead lines (`DEFAULT_OFFICE_LEASE_BENCHMARK_{LOW,MID,HIGH}`)
- LP-defensibility ranges per dimension (Funding, Revenue, Compensation, Overhead Specialists)
- Market reference ranges that drive Tier-0 deterministic verdicts before Tier-1 LLM refresh lands

**Properties (both shapes):**
- No external authority. The value is *your* opinion, calibrated against industry data.
- Calibration is internal — informed by data, but not dictated by it.
- Changes are calibration decisions, recorded in ADRs or commit messages.
- Lives in code as a named constant (see `no-magic-numbers` skill).
- IS a seed value: when persisted to a DB row (admin_resources benchmark, hospitality_benchmarks, model_defaults), the row's initial values come from the named code constant.
- May have an admin-editable override per-property/per-portfolio, but the *default itself* is a code constant — recalibration goes through commit + ADR, not through admin keystrokes.

**Range-shaped defaults — naming convention:**
When a default is a low/mid/high band (e.g. for a Specialist watchdog that compares user inputs against industry midpoints), expose THREE named constants per dimension:
```ts
export const DEFAULT_OFFICE_LEASE_BENCHMARK_LOW  = 24_000;
export const DEFAULT_OFFICE_LEASE_BENCHMARK_MID  = 36_000;
export const DEFAULT_OFFICE_LEASE_BENCHMARK_HIGH = 48_000;
```
Then assemble the band object by reference, never by inline literal:
```ts
export const DEFAULT_OVERHEAD_BENCHMARKS = {
  officeLeaseStart: {
    low:  DEFAULT_OFFICE_LEASE_BENCHMARK_LOW,
    mid:  DEFAULT_OFFICE_LEASE_BENCHMARK_MID,
    high: DEFAULT_OFFICE_LEASE_BENCHMARK_HIGH,
  },
  // …
};
```
The `_BENCHMARK_` infix distinguishes calibration ranges from `DEFAULT_*_START` values that seed `global_assumptions` columns (those are point seeds for user-editable assumption rows; benchmark bands are watchdog reference data — different tier, different consumer, different naming).

**Don't confuse the two seed roles:**
- `DEFAULT_OFFICE_LEASE_START` → seeds the `global_assumptions.officeLeaseStart` column for new tenants. Conservative starting value. User-editable on the Overhead tab.
- `DEFAULT_OFFICE_LEASE_BENCHMARK_MID` → seeds the watchdog reference midpoint. Industry midpoint, NOT a tenant default. Specialist-readable, never user-editable directly.

The two values may diverge intentionally — a conservative tenant seed (`DEFAULT_*_START`) does not have to equal an industry midpoint (`DEFAULT_*_BENCHMARK_MID`).

## Why this matters

Conflating the two creates two specific failure modes:

1. **A Constant lives in code.** Six months later the IRS publishes a new rate. The codebase ships with the old rate until an engineer notices, files a ticket, deploys a fix. Customers' financials are wrong in the meantime, with no audit trail.

2. **A Default lives in the database.** An admin "fixes" it on a Tuesday because one property looked off. Every property using the default silently drifts. No commit message, no ADR, no explanation when the next engineer asks "why is the exit cap 9.2% in production but 8.5% in the seed file?"

The two categories must be physically separated.

## Where each one lives

### Constants → DB table, admin-editable

Schema:
```
constants
  id              uuid
  key             text     // e.g. "us_federal_corporate_tax_rate"
  value           numeric
  unit            text     // "%", "years", "$"
  country         text     // ISO 3166 alpha-2; "USA" is the fallback
  taxBracket      text?    // nullable; e.g. "C-corp", "pass-through"
  businessType    text?    // nullable; e.g. "hotel", "office", "residential"
  authoritySource text     // e.g. "IRS Publication 946"
  authorityRef    text     // URL or document id
  asOfDate        date     // when the authority published this value
  effectiveFrom   date     // when this value started applying
  effectiveTo     date?    // when superseded
  notes           text?
  lastEditedBy    uuid     // user id
  lastEditedAt    timestamp
```

**Resolution rule (USA fallback):** look up most-specific match → fall back to less-specific → finally fall back to `country = 'USA'`. The fallback chain must be deterministic and logged.

**Admin UI (CRITICAL — read-only + Refresh only):** dedicated `Constants` tab, organized by category (Tax / Depreciation / Reporting / Currency / Labor / Macro). Each card shows: current value, scope, authority source as a hyperlink, `asOfDate`, last refreshed by/when, conviction, evidence summary, and a single **Refresh research** button. Clicking Refresh enqueues the relevant AI Intelligence specialist to re-fetch the authority publication and write a new row (or update the existing one) with refreshed provenance. **There is no Edit button.** There is no editable input. Admin and users cannot type values into Constants rows — the legitimacy of a Constant comes from the authority + specialist provenance, not from a keystroke. The `manual` source value is deprecated for authority-derived Constants; only `source = "analyst"` (specialist verdict) is legitimate.

### Defaults → code constants in `shared/constants.ts` (or equivalent)

```ts
/**
 * Default exit cap rate for L+B luxury hotels in primary US markets.
 * Calibrated 2026-Q1 against 12 comparable transactions (ADR-007).
 * Override per-property via property.exitCapRate; otherwise this default applies.
 */
export const DEFAULT_EXIT_CAP_RATE = 0.085;
```

Override mechanism: property-level or portfolio-level overrides allowed via the database, but the *default itself* changes only via a commit (with ADR for non-trivial calibration changes).

## The decision tree

For every numeric value you are introducing, ask in order:

1. **Does an external authority publish this exact value?**  
   → If yes, it's a **Constant**. Goes in the DB. Carries `authoritySource`, `authorityRef`, `asOfDate`. Admin can edit.

2. **Is the value scoped by country / tax bracket / business type?**  
   → If yes, almost certainly a **Constant**. Even if calibration was internal, jurisdictional scoping is the fingerprint of an authority-driven value.

3. **Would an admin need to change this value without a deploy when the world changes?**  
   → If yes, it's a **Constant**. (When the IRS changes the federal rate, the admin updates the DB row; no engineer involvement.)

4. **Is this value *your* calibration based on internal data?**  
   → It's a **Default**. Code constant. Document in a docstring. Material recalibrations get an ADR.

5. **Is this value a per-property opinion that varies deal by deal?**  
   → Neither category — it's a per-property field on the property record itself. The Default is the fallback when the property field is null.

## Examples

### Federal tax rate

| Property | Value |
|---|---|
| Category | **Constant** |
| Authority | IRS / 26 U.S. Code § 11 |
| Scope | country=USA, taxBracket=C-corp |
| Lives in | `constants` DB table |
| USA fallback? | Yes — the row keyed `country=USA` is the fallback when no country match found |
| Admin editable? | **No** — read-only display + Refresh button. Specialist re-fetches when IRS publishes a change. |
| Writer | AI Intelligence specialist (Tax Research) only |

### Default exit cap rate for L+B luxury hotels

| Property | Value |
|---|---|
| Category | **Default** |
| Authority | None — internal calibration |
| Scope | App-wide; can be overridden per property |
| Lives in | `shared/constants.ts` as `DEFAULT_EXIT_CAP_RATE` |
| Admin editable? | No (calibration changes go through commit + ADR) |
| Per-property override? | Yes (`property.exitCapRate`) |

### Depreciation life for non-residential real property

| Property | Value |
|---|---|
| Category | **Constant** |
| Authority | IRS Publication 946 |
| Scope | country=USA, businessType=non-residential-real |
| Lives in | `constants` DB table (currently lives in code as `DEPRECIATION_YEARS=39` — needs migration) |
| USA fallback? | Yes |
| Admin editable? | **No** — read-only display + Refresh button. Specialist re-fetches IRS Pub 946 to detect publication changes. |
| Writer | AI Intelligence specialist (Tax Research) only |

### Days per month for monthly schedule allocation

| Property | Value |
|---|---|
| Category | Neither — it's a **math derivation** (`365/12 ≈ 30.5`) |
| Lives in | Code as `DAYS_PER_MONTH = 30.5` with the derivation in the comment |
| See | `no-magic-numbers` skill, category 2 |

### Default management fee percentage

| Property | Value |
|---|---|
| Category | **Default** |
| Authority | None — internal calibration from comp set |
| Lives in | `shared/constants.ts` as `DEFAULT_MGMT_FEE_RATE` |
| Per-property override? | Yes |

### Inflation rate (the subtle case — read carefully)

Inflation is the example where this skill's general rule needs project-specific nuance. Full rule: `.claude/rules/inflation-cascade.md` and `.agents/skills/inflation-cascade/SKILL.md`.

| Property | Value |
|---|---|
| Category | **Constant — authority-sourced via AI Intelligence specialist.** Engine cascade still applies (MC assumption → property override → Market & Macro fallback) for runtime; the Constants row seeds Defaults and is the authority reference. |
| Authority | A monetary authority publication: US Federal Reserve long-run inflation target, IMF World Economic Outlook, ECB / BoE / central-bank target, etc. |
| Writer | **AI Intelligence specialist only** (Macro Research specialist that fetches central-bank publications and writes a `source = "analyst"` row with verdict id, conviction, range, evidence). Admin and users **cannot edit** the row — Constants tab shows the row read-only with a Refresh button that triggers the specialist to re-fetch. |
| Lives in | (a) `companyAssumptions.inflationRate` — source of truth for the engine; (b) `property.inflationRate` — override; (c) `defaults.inflationRate` (Market & Macro tab) — seed + last-resort fallback; (d) `model_canonicals.inflationRate` keyed by country — optional, specialist-sourced reference layer. |
| Engine cascade | `property.inflationRate ?? mcAssumptions.inflationRate ?? macroMarketFallback`. The Constants row does not silently overwrite the cascade — overlay onto `globalAssumptions.inflationRate` is gated by the `COUNTRY_KEYS_OVERLAID_ON_GLOBAL` set in `server/finance/apply-model-constants.ts` and requires the conditions in the inflation-cascade rule. |
| Hard-coded TS literal? | **Never.** Even as a "floor", inflation must come through the cascade or a specialist-sourced row. |

The contrast with depreciation is the point: depreciation is a regulator-published value with one right answer per jurisdiction, rarely changes, admin updates it when the regulator does. Inflation is a market estimate that varies per property and per market, central banks publish targets that shift over time, and specialists keep the canonical row fresh — humans rarely hand-edit it.

## The "Refresh research" pattern (Constants only)

Constants surfaces in the admin UI are **read-only displays with a Refresh research button**, not editable forms. The flow:

1. Admin opens the Constants tab and sees a row with its current value, scope (country/bracket/businessType), authority source as a hyperlink, `asOfDate`, last-refreshed timestamp, conviction, and evidence summary.
2. Admin clicks **Refresh research**. This enqueues the relevant AI Intelligence specialist (Tax Research, Macro Research, Depreciation Research, etc.) to re-fetch the authority publication.
3. The specialist returns a verdict (per the AnalystVerdict contract) with: latest authoritative value, range, conviction, evidence (citing the authority), and whether the prior value still matches the latest publication.
4. The verdict is written as a new row (or updates the existing row) with `source = "analyst"`, refreshed `asOfDate`, and the verdict id for audit trail.
5. Admin's role ends at "click Refresh and review the result." Admin does not type a number; admin does not approve a specific value; admin does not edit the row freehand. The row's value is whatever the specialist verdict says.

**Why no Apply / Edit / typed-value form:** the entire legitimacy of a Constant comes from the authority + specialist provenance. The moment a human types a number into a Constants row, that legitimacy is gone — the row is now an unattributed admin opinion masquerading as authority data. A Refresh-only UI makes this physically impossible.

Defaults do not get a Refresh button — recalibration of a Default is a commit-time decision with an ADR, not an admin action.

## Migration discipline

When converting a code constant to a DB-backed Constant:

1. Identify the AI Intelligence specialist that owns this Constant's domain (Tax Research, Depreciation Research, Macro Research, etc.). If none exists, define one in the AI Intelligence realm before proceeding — Constants without a specialist owner have no refresh path and should not exist.
2. Have the specialist produce the initial row(s) (`source = "analyst"`, full provenance: `authoritySource`, `authorityRef`, `asOfDate`, conviction, evidence). Do not seed the row by hand.
3. Replace the code import with a `getConstant(key, scope)` call that resolves through the DB with USA fallback.
4. Keep the named code constant as the **last-resort floor** for the resolver — if the DB read fails, the code value is the floor (logged loudly).
5. The named code constant's docstring must point to the DB row that supersedes it.
6. The migration commit must touch every consumer in one pass — no half-migrations.
7. The Constants tab UI for the new row is read-only display + Refresh button only — never an editable form.

## Coupling with other skills

- **`no-magic-numbers`** — Both Constants and Defaults are named values, never raw literals. This skill governs *which named system* each value belongs in.
- **`cross-check-invariants`** — Migrating a constant to the DB is a multi-file edit touching every consumer; verify all of them.
- **`architecture-decision-records`** — Material Default recalibrations get an ADR. Constants migrations may also warrant one.

## Failure modes this skill prevents

1. **Stale tax rate in production code** — caught by promoting it to a Constant in the DB where admins can update without a deploy.
2. **Silent Default drift** — caught by keeping Defaults in code where every change is a reviewable commit.
3. **Lost authority citation** — caught by requiring `authoritySource` and `authorityRef` on every Constant row.
4. **Country-specific rates buried in `if (country === "USA")` chains** — caught by making jurisdictional scoping a column, not a code branch.
5. **No fallback when country unknown** — caught by the explicit `country='USA'` fallback row.

## The one-line summary

If an authority publishes the number, it's a Constant — lives in the DB, written exclusively by an AI Intelligence specialist, exposed in the admin UI as read-only display + Refresh research button (never editable). If you calibrated the number, it's a Default and lives in code. Admins and users never type values into Constants.
