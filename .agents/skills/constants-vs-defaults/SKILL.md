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

### Default (market-driven)

A value that represents a reasonable starting estimate when no better data is available. No authority publishes it. The number reflects internal calibration against benchmarks, prior deals, market research, or expert judgment.

**Examples:**
- Default exit cap rate for a luxury hotel (e.g. 8.5%)
- Default RevPAR assumption for a market segment
- Default management fee percentage
- Default F&B cost ratio
- Default leverage ratio for a development pro forma

**Properties:**
- No external authority. The value is *your* opinion.
- Calibration is internal — informed by data, but not dictated by it.
- Changes are calibration decisions, recorded in ADRs or commit messages.
- Lives in code as a named constant (see `no-magic-numbers` skill).
- May have an admin-editable override per-property/per-portfolio, but the *default itself* is a code constant.

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

**Admin UI:** dedicated `Constants` tab, organized by category (Tax / Depreciation / Reporting / Currency / Labor). Each card shows: current value, scope, authority source as a hyperlink, as-of date, last edited by/when, Edit button, "Ask The Analyst for recommended value" button.

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
| Admin editable? | Yes |

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
| Admin editable? | Yes (when the IRS changes it, an admin updates the row) |

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

## The "Ask The Analyst" pattern (Constants only)

For each Constant in the admin UI, expose an "Ask The Analyst for recommended value" button. The Analyst:

1. Receives the constant key, scope (country/bracket/businessType), and current value.
2. Returns a verdict (per the AnalystVerdict contract) with: recommended value, range, conviction, evidence (citing the authority), and whether the current value matches the latest authority publication.
3. Admin sees a recommendation card with an Apply button that updates the DB row in-place, recording the verdict id as audit trail.

Defaults do not get this button — recalibration of a Default is a commit-time decision with an ADR, not an admin action.

## Migration discipline

When converting a code constant to a DB-backed Constant:

1. Add the row to the `constants` table with full provenance.
2. Replace the code import with a `getConstant(key, scope)` call that resolves through the DB with USA fallback.
3. Keep the named code constant as the **last-resort default** for the resolver — if the DB read fails, the code value is the floor (logged loudly).
4. The named code constant's docstring must point to the DB row that supersedes it.
5. The migration commit must touch every consumer in one pass — no half-migrations.

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

If an authority publishes the number, it's a Constant and lives in the DB. If you calibrated the number, it's a Default and lives in code. Never the other way around.
