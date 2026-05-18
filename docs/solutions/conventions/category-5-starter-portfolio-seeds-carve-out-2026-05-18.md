---
title: "Category 5 — Starter-Portfolio Seeds carve-out for the magic-numbers gate"
date: 2026-05-18
category: conventions
module: magic-numbers-gate
problem_type: convention
component: tooling
severity: medium
applies_when:
  - "Authoring bootstrap values for the pre-launch starter portfolio or management-company assumptions"
  - "Adding files under artifacts/api-server/src/seeds/** or touching syncHelpers.ts"
  - "Naming a numeric constant that must live in TypeScript because it predates the DB it will populate"
  - "Modifying scripts/src/check-magic-numbers.ts SCAN_DIRS, SKIP_REL_PATHS, or the baseline snapshot"
  - "Updating the no-magic-numbers or hplus-variable-taxonomy skills, or CLAUDE.md §2 / replit.md mirror"
tags:
  - magic-numbers
  - taxonomy
  - seed-data
  - category-5
  - bootstrap-values
  - check-magic-numbers
  - conventions
  - hplus
related_components:
  - scripts/src/check-magic-numbers.ts
  - artifacts/api-server/src/seeds
  - artifacts/api-server/src/syncHelpers.ts
  - lib/shared/src/constants.ts
  - artifacts/api-server/script/seed-model-defaults.ts
---

# Category 5 — Starter-Portfolio Seeds carve-out for the magic-numbers gate

## Context

H+ Analytics CLAUDE.md §2 prohibits TypeScript constants for business or financial values — those values belong in the database. But the pre-launch property cohort and management-company assumptions need calibrated numbers *before* the database exists. A seed file cannot read from a row that has not yet been written, so the rule and the bootstrap reality collide.

The original four categories — TRUE CONSTANTS, DEFAULT VARIABLES (legacy), ASSUMPTION VARIABLES, TABLE-SOURCED VALUES — all describe runtime read paths. None of them cleanly describes bootstrap-only calibration values. `SEED_*` constants existed in practice (migration guards, market seeds), but the taxonomy did not acknowledge them broadly enough, so every new one looked like a violation. (session history) The taxonomy gap surfaced concretely during T1-4 work earlier in the same 2026-05-18 session: after retiring 11 `DEFAULT_*` constants from `lib/shared/src/constants*.ts`, the constants that remained as legitimate bootstrap values had no canonical home. The Category 5 was shaped by what *remained* after the cleanup, not defined speculatively — it formalises a surface that the codebase already used informally.

## Guidance

**Category 5: Starter-Portfolio Seeds** codifies `SEED_*` constants and inline calibration literals that exist only to bootstrap the database. Category 5 is conceptually distinct from Categories 1–4: those four classify literals by *runtime read path* (math constant, default fallback, per-entity read, authority-table read). Category 5 classifies literals by *role in data construction* — values that populate rows once, then are never read by runtime code again. Once the seed has run, the engine and routes read DB values, not the `SEED_*` symbol.

**Allowed locations.** Calibration values may live only in:

- `artifacts/api-server/src/migrations/*.ts` — runtime migration guards (existing pattern, now formalised)
- `artifacts/api-server/src/seeds/**` — seed data files (entire subtree, e.g. `property-data.ts`, `market-rates.ts`)
- `artifacts/api-server/script/seed-*.ts` — seed scripts (outside scanner scope by `SCAN_DIRS`)
- `artifacts/api-server/src/syncHelpers.ts` — single-file carve-out for `SEED_GLOBAL_DEFAULTS`
- `lib/shared/src/constants.ts` — `SEED_*` named constants only, when cross-package use is needed

**Mandatory contract.** Each named `SEED_*` constant or seed-file inline literal must satisfy:

1. `SEED_` prefix on named constants — distinguishes calibration seeds from legacy `DEFAULT_*` debt.
2. A source-citation comment block above it — date, target metric, runbook link, and market-data reference.
3. Never imported by runtime engine, calc, or route code — runtime reads come from the DB row that the seed populated.
4. On bootstrap, the prod DB always wins via `onConflictDoNothing()` in `seed-model-defaults.ts` — seeds never overwrite a live row.

```ts
// CORRECT — Category 5 seed with provenance.
// Source: CBRE Hotels Outlook 2025, luxury segment.
// Target metric: portfolio IRR 28–38% band (luxury weighting).
// Runbook: docs/runbooks/seed-calibration-2026-05-13.md
// Market: U.S. luxury full-service cap-rate midpoint Q4-2025.
export const SEED_EXIT_CAP_RATE_LUXURY = 0.085;
```

```ts
// VIOLATION — masking a runtime constant by adding SEED_ prefix.
// This value is read by the engine at projection time, not at seed time.
import { SEED_EXIT_CAP_RATE_LUXURY } from "@workspace/shared/constants";
const exitCap = property.exitCapRate ?? SEED_EXIT_CAP_RATE_LUXURY; // WRONG
```

## Why This Matters

**Bootstrap chicken-and-egg.** A property cannot resolve its exit cap rate from `model_defaults` if the row does not exist yet. The first install needs values written into SQL — by definition, those values are in source code somewhere. Category 5 names that surface explicitly instead of pretending it doesn't exist.

**Prod-DB-wins prevents seed-overwrites-edits.** `onConflictDoNothing()` in `seed-model-defaults.ts` guarantees that once an admin tunes a value in the Model Defaults UI, re-running the seed leaves their edit untouched. The seed file is *not* an authority — it is a bootstrap floor.

**The carve-out does not dilute §2.** Categories 1–4 still strictly forbid magic numbers in runtime engine, calc, and route code — that is where drift, jurisdiction variance, and re-tuning actually happen. Category 5 affects only files the runtime never reads from. The mechanical checker enforces the boundary: it scans `lib/engine/`, `lib/calc/`, and route handlers as aggressively as before; it skips the bootstrap surfaces by directory and path rules. The qualitative rule (runtime code reads from DB) and the mechanical rule (checker scope) line up.

**Baseline reduction is signal, not noise.** Locking in the carve-out re-snapshotted the magic-numbers baseline from 144 → 119 suspect values. (session history) The 25-suspect reduction reflects bootstrap constants that were correctly placed but previously inflating the ratchet's count — a measurable indication that the rule extension recovered signal, not relaxed it. The literals that remain at threshold are runtime concerns, exactly the values the gate exists to police.

## When to Apply

- **Adding a new starter property to the pre-launch cohort.** Inline literals in `artifacts/api-server/src/seeds/property-data.ts` are Category 5. If the same value is later consumed at projection time, the runtime engine reads it from the DB column — not the seed file.
- **Calibrating a dev scenario value to hit a portfolio-IRR target.** A documented `SEED_*` in `lib/shared/src/constants.ts` with provenance is Category 5. *Not* Category 5 if the engine imports it directly — that would be Category 2 legacy debt.
- **Defining management-company year-1 overhead for the starter org.** Belongs in `seeds/` or `syncHelpers.ts` as Category 5. *Not* Category 5 if any per-tenant API route falls back to it — that path must read the DB.
- **Cross-package `SEED_*` needed by both a migration guard and a seed file.** Defining it once in `lib/shared/src/constants.ts` with the `SEED_` prefix is Category 5. *Not* Category 5 if any runtime code path imports the symbol.
- **You catch yourself asking "where do I put this calibration number?"** If the answer is "the DB schema's `.default()` clause and a one-time seed write," Category 5 applies. If the answer is "the engine reads it on every projection," the value belongs in `model_defaults` (Category 4) and the engine reads via `getFactoryNumber`.
- **Re-snapshotting the magic-numbers baseline after seed expansion.** Re-running `--init` is a Category 5 maintenance operation — seed-file duplications no longer contribute to the ratchet.

## Examples

**Migration of `DEFAULT_BUSINESS_INSURANCE_START`** (this session, 2026-05-18, commit `b34b8d20a`):

*Before — Category 2 legacy debt in runtime constants:*

```ts
// lib/db/src/constants.ts
export const DEFAULT_BUSINESS_INSURANCE_START = 12000;

// downstream usage
import { DEFAULT_BUSINESS_INSURANCE_START } from "@workspace/db/constants";
const businessInsurance =
  globals.businessInsuranceStart ?? DEFAULT_BUSINESS_INSURANCE_START;
```

This is a §2 violation regardless of naming — the engine reads a TypeScript constant for a business value that should live in the DB.

*After — schema default + Category 5 seed surfaces, no runtime fallback:*

```ts
// lib/db/src/schema/config.ts — SQL bootstrap; the .notNull().default() clause is
// both the bootstrap value and the not-null enforcement. Existing rows are
// backfilled automatically.
businessInsuranceStart: real("business_insurance_start").notNull().default(12000),
```

```ts
// artifacts/api-server/script/seed-model-defaults.ts
// Source: matches schema bootstrap; admin-editable via Model Defaults card="overhead".
const SPECS = [
  // ...
  { key: "businessInsuranceStart", card: "overhead", value: 12000, unit: "$/yr",
    label: "Company business insurance (year 1)" },
];
await db.insert(modelDefaults).values(SPECS).onConflictDoNothing();
```

```ts
// artifacts/api-server/src/syncHelpers.ts — Category 5 carve-out file.
// Year-1 overhead bootstrap; matches schema NOT NULL DEFAULTs in globalAssumptions.
export const SEED_GLOBAL_DEFAULTS = {
  businessInsuranceStart: 12000,
  // ...
};
```

```ts
// runtime engine, no fallback constant.
const businessInsurance = globals.businessInsuranceStart;
// no ?? DEFAULT_BUSINESS_INSURANCE_START — the schema's NOT NULL guarantees it.
```

The number `12000` now appears in three permitted locations — the schema's `.default()` clause (SQL bootstrap), the seed-model-defaults SPECS entry (DB write), and `syncHelpers.ts` (matching payload constructor) — each with provenance. The runtime engine reads the populated DB column directly, with no TypeScript fallback. The `check-magic-numbers.ts` baseline drops by the duplication count formerly attributed to this value, and the schema's `NOT NULL` clause guarantees the runtime read is safe.

## Related

- [[docs/solutions/tooling/magic-numbers-ratchet-improvements.md]] — primary home for the checker mechanics that enforce this convention (file-glob carve-outs, baseline `--init` flow, the full taxonomy of false-positive classes the ratchet handles). Read alongside this doc — the convention here is what; that doc is how.
- [[docs/solutions/database-issues/seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md]] — origin of the `onConflictDoNothing()` invariant that this convention leans on for prod-DB-wins behaviour.
- [[docs/solutions/workflow-issues/seed-pipeline-drift-dual-migration-folders-and-uncalled-medellin-duplex-2026-05-12.md]] — seed pipeline topology context for the surfaces Category 5 covers.
- [[docs/solutions/conventions/no-hardcoded-integration-identifiers-convention-2026-05-09.md]] — sibling §1 convention for string identifiers (LLM model names, API slugs). Same authority-table pattern, different value class.
- [[docs/solutions/logic-errors/constants-barrel-shadow-overwrites-submodule-2026-05-10.md]] — collision risk to watch for when `SEED_*` constants land in `lib/shared/src/constants.ts` and may be re-exported through barrel files.
- `.agents/skills/no-magic-numbers/SKILL.md` — section "5. Starter-portfolio seed (`SEED_*`)" + decision-tree entry codify the rule for the agent.
- `.agents/skills/hplus-variable-taxonomy/SKILL.md` — Category 5 section + master-decision-table entry.
- `CLAUDE.md` §2 "The ONLY numbers allowed in TypeScript" — primary contract.
- `replit.md` Inviolable Rules — harmonised summary for the Replit agent.
- Commit `ab1924923` — `feat(no-magic-numbers): add Category 5 — starter-portfolio seeds carve-out`.
