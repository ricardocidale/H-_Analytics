---
title: "ICP bracket slug mismatch — applyBracketLayerDefaults silently non-functional for 3 of 4 brackets"
date: 2026-05-13
category: database-issues
module: icp-brackets-layer2-overlay
problem_type: database_issue
component: database
symptoms:
  - "applyBracketLayerDefaults() produced zero-weight blend for 3 of 4 ICP brackets with no error or warning"
  - "Layer-2 weight-blended overlay was effectively inert at POST /api/properties for soft-brand, STR, and agritourism brackets"
  - "New properties received wrong or underweighted default_exit_cap_rate and default_refi_max_ltv_to_original"
  - "Demo portfolio IRR targets not reached after U6 was wired — resolver ran without errors but produced wrong defaults"
root_cause: config_error
resolution_type: migration
severity: high
related_components:
  - bracket-catalog
  - icp-brackets-001
  - applyBracketLayerDefaults
  - three-layer-resolver
  - properties-demo-seed-overrides
tags:
  - icp-brackets
  - three-layer-resolver
  - slug-mismatch
  - layer-2-overlay
  - seed-data
  - financial-defaults
  - migration-guard
  - bracket-catalog
---

# ICP bracket slug mismatch — applyBracketLayerDefaults silently non-functional for 3 of 4 brackets

## Problem

`applyBracketLayerDefaults()` (the U6 Layer-2 financial-defaults overlay) performs a slug-based JOIN
between `global_assumptions.bracket_mix` entries and `icp_brackets` rows at `POST /api/properties`. The
`icp_brackets` table was seeded by `icp-brackets-001.ts` with slugs that diverged from the ID constants
later declared in `bracket-catalog.ts`, so 3 of 4 slug lookups returned 0 rows — silently applying only 1
bracket's defaults instead of the blended 4, and producing wrong per-entity Layer-2 values for every new
property created after U6 was wired.

## Symptoms

- `applyBracketLayerDefaults()` returned a near-zero blended overlay for all new properties — the function
  ran without errors but effectively ignored three of four brackets.
- The bracket-assignment minion (`bracket-assignment-minion.ts`) correctly wrote `bracket_mix` entries using
  `BRACKET_ID_*` constants from `bracket-catalog.ts`. Those constants did NOT match the DB slugs, so every
  lookup on the blended-defaults side returned an empty result set.
- Demo portfolio IRR targets were not reached after U6 was wired because `default_exit_cap_rate` and
  `default_refi_max_ltv_to_original` were underweighted in Layer-2, making Layer-3 property values wrong at
  creation time.
- No runtime error was thrown. The only observable signal was incorrect financial defaults on newly created
  properties.

The slug mismatch that caused the bug:

| `bracket-catalog.ts` ID (used by minion + resolver) | `icp_brackets.slug` (seeded by 001) |
|-----------------------------------------------------|--------------------------------------|
| `boutique-upscale-hotel` ✓                          | `boutique-upscale-hotel` ✓           |
| `soft-brand-boutique` ✗                             | `branded-full-service-hotel` ✗       |
| `performance-managed-str` ✗                         | `performance-str-cluster` ✗          |
| `agritourism-experiential` ✗                        | `agritourism-experiential-lodge` ✗   |

## What Didn't Work

**TypeScript fallback constants (`BRACKET_DEFAULT_*`)** — An earlier iteration of the branch carried
`BRACKET_DEFAULT_*` named TS constants (e.g., `BRACKET_DEFAULT_US_TERTIARY_EXIT_CAP = 0.0975`) and
`applyBracketLayerDefaults()` was wired to use them as fallbacks when the DB lookup returned nothing. The
advisor rejected this: a named TS constant is the same taxonomy violation as an inline literal, the
three-layer resolver guarantees Layer-3 is always set via `NOT NULL DEFAULT` migration SQL, and falling back
to TS constants masks the real bug rather than fixing it. (session history)

**Full U7 bracket catalog redesign (Path B)** — The original plan proposed rebuilding the ICP bracket
architecture from scratch: rewriting `bracket-catalog.ts`, the assignment minion, and the resolver in a
coordinated overhaul (~1–2 days). Rejected because the actual problem was a pure data mismatch in one seed
file that a targeted DB migration could fix in half a day. Architectural redesign would have introduced
unnecessary churn across the bracket pipeline for a bug that didn't require it. (session history)

**Using the bracket overlay resolver for U1 demo property calibration** — It was considered whether the
three-layer resolver's bracket overlay (Layer 2) could propagate calibrated exit cap rates to demo
properties. Rejected because the resolver was not fully functional until the slug fix landed — using it for
calibration before that was circular. Direct Layer-3 per-entity DB updates were used for U1 instead.

## Solution

**Step 1 — `artifacts/api-server/src/migrations/icp-brackets-004.ts`: rename 3 slugs, backfill overlay values**

Rename the three mismatched DB slugs to match `bracket-catalog.ts` IDs exactly. Each UPDATE is a no-op if
the row already has the new slug (idempotent). Then backfill `default_exit_cap_rate` and
`default_refi_max_ltv_to_original` on all four brackets using `SEED_*` constants with source citations.

```typescript
// Slug renames — idempotent: no-op when row already has new slug
await db.execute(sql`
  UPDATE icp_brackets
  SET slug            = 'soft-brand-boutique',
      name            = 'Soft-Brand Boutique',
      archetype_label = 'soft-brand boutique hotel'
  WHERE slug = 'branded-full-service-hotel'
`);

await db.execute(sql`
  UPDATE icp_brackets
  SET slug            = 'performance-managed-str',
      name            = 'Performance-Managed STR Cluster',
      archetype_label = 'performance-managed short-term rental cluster'
  WHERE slug = 'performance-str-cluster'
`);

await db.execute(sql`
  UPDATE icp_brackets
  SET slug                        = 'agritourism-experiential',
      name                        = 'Agritourism / Experiential Lodge',
      archetype_label             = 'agritourism or experiential lodge',
      service_consumption_profile = 'mixed'
  WHERE slug = 'agritourism-experiential-lodge'
`);

// Overlay backfill — SET is unconditional (same value on repeat run)
// Run after renames so WHERE clauses use canonical catalog IDs
// Sources: HVS 2025 boutique (0.085), AirDNA 2024 STR benchmark (0.10),
//          HVS 2024 tertiary/experiential + 75bp (0.0975), standard US refi cap (0.70)
await db.execute(sql`
  UPDATE icp_brackets
  SET default_exit_cap_rate = 0.085, default_refi_max_ltv_to_original = 0.70
  WHERE slug = 'boutique-upscale-hotel'
`);
await db.execute(sql`
  UPDATE icp_brackets
  SET default_exit_cap_rate = 0.085, default_refi_max_ltv_to_original = 0.70
  WHERE slug = 'soft-brand-boutique'
`);
await db.execute(sql`
  UPDATE icp_brackets
  SET default_exit_cap_rate = 0.10, default_refi_max_ltv_to_original = 0.70
  WHERE slug = 'performance-managed-str'
`);
await db.execute(sql`
  UPDATE icp_brackets
  SET default_exit_cap_rate = 0.0975, default_refi_max_ltv_to_original = 0.70
  WHERE slug = 'agritourism-experiential'
`);
```

**Step 2 — `artifacts/api-server/src/migrations/properties-demo-seed-overrides-001.ts`: U1 Layer-3 overrides**

Write calibrated exit cap rates directly to the 7 demo properties as Layer-3 per-entity values, bypassing
the bracket overlay resolver. The three-layer resolver guarantees Layer-3 is always set; the engine reads
`property.exitCapRate` directly.

```typescript
// US tertiary boutique resort: PwC/CBRE/HVS 2025 H2 going-in + 75bp terminal
await db.execute(sql`
  UPDATE properties SET exit_cap_rate = 0.0975
  WHERE name IN ('Belleayre Mountain', 'Loch Sheldrake', 'Lakeview Haven Lodge', 'Scott''s House')
`);

// LatAm rural/illiquid hacienda: Colombia country-risk + illiquidity; HVS LatAm 2024 + 200bp
await db.execute(sql`
  UPDATE properties SET exit_cap_rate = 0.12
  WHERE name = 'Jano Grande Ranch'
`);

// LatAm prime urban boutique: CBRE Colombia prime coastal Q4 2024 + 50bp
await db.execute(sql`
  UPDATE properties SET exit_cap_rate = 0.105
  WHERE name = 'San Diego'
`);

// Medellin Duplex: LP package-sale exception + AirDNA Q1-2026 El Poblado STR ceiling
await db.execute(sql`
  UPDATE properties SET exit_cap_rate = 0.075, max_occupancy = 0.30
  WHERE name = 'Medellin Duplex'
`);
```

**Step 3 — Register both as one-time boot gates in `startup/migrations.ts`**

```typescript
if (!(await isMigrationApplied("icp_brackets_004"))) {
  const { runIcpBrackets004 } = await import("../migrations/icp-brackets-004");
  await runIcpBrackets004();
  await markMigrationApplied("icp_brackets_004");
}

if (!(await isMigrationApplied("properties_demo_seed_overrides_001"))) {
  const { runPropertiesDemoSeedOverrides001 } = await import("../migrations/properties-demo-seed-overrides-001");
  await runPropertiesDemoSeedOverrides001();
  await markMigrationApplied("properties_demo_seed_overrides_001");
}
```

## Why This Works

`bracket-catalog.ts` and `icp-brackets-001.ts` were authored independently during the same development arc,
and the slug strings diverged — the catalog was stabilized with shorter IDs after the seed had already
landed with longer ones. `bracket-assignment-minion.ts` uses `BRACKET_ID_*` constants from `bracket-catalog.ts`
when writing `global_assumptions.bracket_mix` entries, so every bracket mix written to the DB already
contained the catalog IDs. When `applyBracketLayerDefaults()` JOINed those mix entries against
`icp_brackets.slug`, 3 of 4 rows were not found — and because the function simply accumulated empty result
sets with no assertion, the bug was completely silent.

After the slug rename, all four catalog IDs resolve to DB rows and the weight-blended Layer-2 overlay
produces meaningful `default_exit_cap_rate` and `default_refi_max_ltv_to_original` values. The U1 property
overrides write Layer-3 per-entity values directly; the three-layer resolver (Layer 1: `model_defaults` →
Layer 2: `icp_brackets` overlay → Layer 3: property row) guarantees Layer-3 is always populated, so the
engine reads `property.exitCapRate` directly with no TypeScript fallback needed. (session history)

## Prevention

**1. Import `BRACKET_ID_*` constants in seed migrations — never use raw slug strings.**
`icp-brackets-001.ts` hardcoded slug strings that were later superseded by catalog constants. The correct
pattern is for any migration inserting or updating `icp_brackets` rows to import `BRACKET_ID_*` from
`bracket-catalog.ts` and use those constants in the SQL. If the constants can't be imported in the migration
context, add a `satisfies Record<BracketId, ...>` static assertion in `bracket-catalog.ts` that enumerates
every expected slug — divergence then becomes a TypeScript error, not a silent runtime miss.

**2. Add a startup invariant that validates `icp_brackets.slug` coverage against the catalog.**
`assertRequiredModelDefaults()` already fails boot if `model_defaults` seed rows are missing. A companion
`assertBracketSlugCoverage()` should query `icp_brackets` and verify that every `BRACKET_ID_*` value from
`bracket-catalog.ts` exists as a slug. If any catalog ID is absent or mismatched, boot fails with a
descriptive error naming the missing slug. This converts a silent data mismatch into a hard boot failure,
making this category of bug impossible to miss in any environment. (session history)

**3. Assert non-zero weight sums in `applyBracketLayerDefaults` tests.**
A unit test running `applyBracketLayerDefaults()` against a fixture DB should assert that the blended output
weight sums to `1.0` (within floating-point tolerance). A weight sum materially below `1.0` signals that one
or more bracket lookups returned zero rows. This test would have caught the bug immediately after U6 was
wired, before the IRR calibration work began. (session history)

**4. Keep Layer-3 overrides independent of the Layer-2 resolver.**
When doing per-entity seed calibration (e.g., U1 demo property exit caps), write Layer-3 values directly via
a SQL migration rather than relying on the bracket overlay to propagate them. The two are independent: Layer-2
sets defaults for future new entities; Layer-3 is the authoritative per-entity value the engine reads. Direct
Layer-3 migrations are simpler, explicitly documented, and not susceptible to upstream resolver bugs.

## Related Issues

- GitHub Issue #139: "Expand unique key on `vendor_passthrough_costs` and `mgmt_co_markup_factors` to include
  `bracket_slug`" — filed 2026-05-13. The slug rename in `icp-brackets-004.ts` is the precondition for the
  safe unique-key expansion proposed in this issue.
- [`seed-pipeline-drift-dual-migration-folders-and-uncalled-medellin-duplex-2026-05-12.md`](seed-pipeline-drift-dual-migration-folders-and-uncalled-medellin-duplex-2026-05-12.md) — covers the
  analogous "appears wired, silently never fires" failure class in the migration layer; references
  `icp_bracket_mix` migration topology. Note: that doc predates the slug rename — `icp-brackets-004.ts` (this
  fix) is not reflected there.
- [`seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md`](../database-issues/seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md) — covers idempotent UPDATE migration
  as a boot gate for demo property financial values; the U1 `properties-demo-seed-overrides-001.ts`
  migration follows the same pattern. Note: that doc predates the taxonomy rules (2026-05-13) — its code
  examples use TS constant arrays that are now violations under `CLAUDE.md §2`.
