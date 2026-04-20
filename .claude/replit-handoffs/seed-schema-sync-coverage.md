# Handoff: Seed/Schema Sync — Add Coverage or Delete Columns

**Audience:** Replit Agent
**Status:** Ready to execute
**Owner:** Replit (seed data + schema changes are DB territory per claude-replit-split.md)
**Priority:** Low — no production impact; improves drift detection
**Prereq:** None

---

## Context

`tests/proof/seed-schema-sync.test.ts` verifies that every column in `shared/schema/properties.ts` is exercised by at least one seed row. A field with a `.default()` that never appears in any seed row will silently pick up the schema default in production. If that default ever changes, the behavior change is invisible until a bug surfaces.

Claude did the triage pass (2026-04-20):
- **28 columns → `SYSTEM_COLUMN_EXEMPTIONS`** — research-extracted (filled by The Analyst) and audit/housekeeping fields that should never be seed-set.
- **36 columns → real drift baseline** — schema has a default but no seed row exercises it.

Your task is to resolve the 36 real-drift columns.

---

## What to do

For each of the 36 columns listed below:

### Path A: Add to seed row (preferred for most fields)

Update `server/seeds/property-data.ts::SEED_PROPERTY_DEFAULTS` to include the column with a reasonable value. The value should:
- Match the schema's `.default()` where one exists (so the seed exercises the default explicitly).
- Use a sensible non-null value where the schema is nullable but the field has obvious semantics (e.g., `apDays: 30`, `arDays: 30`).
- Use `null` where no default makes sense for a generic seed property.

After adding to `SEED_PROPERTY_DEFAULTS`, the column is automatically covered by every property (existing + new) since they spread `...SEED_PROPERTY_DEFAULTS`.

### Path B: Delete the schema column

If a column is genuinely unused in production code (no reads, no writes outside seed/migration), delete it:
1. Remove the column from `shared/schema/properties.ts`
2. Generate a drop-column migration: `drizzle-kit generate`
3. Run on dev Neon, verify no data loss (pre-check: `SELECT COUNT(*) FROM properties WHERE <col> IS NOT NULL`)
4. Coordinate with steward before running on production

**Path B is the right answer for any column whose only reference in the codebase is in `shared/schema/properties.ts` itself.** Grep each candidate before choosing Path A vs B.

### Path C: Mark as computed/system (moves to SYSTEM_COLUMN_EXEMPTIONS)

If a column is filled by a background job, trigger, or API-only path (not by user or seed), add it to `SYSTEM_COLUMN_EXEMPTIONS` in `tests/proof/seed-schema-sync.test.ts`. Same outcome as Path A for the test; clearer intent in code.

---

## The 36 columns

Grouped by category for triage speed:

### Financial assumptions (likely Path A — add to seed with schema default)
- `apDays` — accounts-payable days, typical default 30
- `arDays` — accounts-receivable days, typical default 30
- `dayCountConvention` — e.g., "30/360" or "actual/365"
- `escalationMethod` — inflation model type
- `feeSubordination` — fee subordination toggle (boolean)
- `operatingDeficitReserve` — $ amount reserve
- `ownerPriorityReturn` — rate (e.g., 0.08)
- `reinvestmentRate` — rate
- `performanceTestEnabled` — toggle (boolean)
- `occupancyRampCurve` — JSON array
- `seasonalityProfile` — JSON object

### Property classification (Path A — set reasonable seed default)
- `brandId` — FK to business_brands; can be null for generic seed, or point to a default brand if seeded
- `locationType` — enum (urban/suburban/rural/mountain/etc.)
- `managementType` — enum (full-service/branded/independent)
- `marketTier` — enum (primary/secondary/tertiary)
- `pricingModel` — enum
- `qualityTier` — enum (luxury/upscale/midscale/economy)
- `serviceLevel` — enum
- `streetAddress2` — nullable; seed can leave null
- `nightlyPropertyRate` — VRBO-model field, numeric

### Property physical (Path A if field is product-relevant; Path B if legacy)
- `commercialKitchenCost` — $ cost field
- `conversionCost` — $ cost field
- `estimatedConversionMonths` — integer months
- `eventSpaceSqft` — integer
- `eventVenueCost` — $ cost
- `fbSeats` — integer (F&B capacity)
- `fbVenues` — integer count
- `fireCodeAdaCost` — $ cost
- `liquorLicenseCost` — $ cost
- `maxGuests` — integer (VRBO)
- `onMunicipalSewer` — boolean
- `roomAdditionCost` — $ cost
- `totalBuildingSqft` — integer
- `totalPropertyAcreage` — decimal
- `yearBuilt` — integer year
- `zoningPermitCost` — $ cost

---

## Verification (after each commit)

1. `npm run test:file -- tests/proof/seed-schema-sync.test.ts` — baseline entries you removed must pass the "no stale baseline" assertion
2. `npx tsc --noEmit` — zero errors
3. `npm run verify:summary` — UNQUALIFIED (all 19 phases)
4. If you deleted any schema column: confirm no production data loss via pre-migration count query

Each column resolved = one entry removed from `BASELINE_UNEXERCISED` in `tests/proof/seed-schema-sync.test.ts`.

---

## Commit cadence

Group columns by category in commits:
- Commit 1: financial assumptions (11 columns)
- Commit 2: property classification (9 columns)
- Commit 3: property physical (16 columns)

Each commit passes all 5 gates independently.

---

## What NOT to do

- ❌ Don't bulk-delete without grepping for each column's usage first
- ❌ Don't add a column to seed with a fabricated value that's far from the schema default — use the schema's own `.default()` or `null` unless there's strong product reason otherwise
- ❌ Don't add fields to `SYSTEM_COLUMN_EXEMPTIONS` without verifying they're genuinely system-set (computed trigger, admin-only, or populated via a non-seed code path)

---

## References

- `tests/proof/seed-schema-sync.test.ts` — the test + baseline to drive toward []
- `server/seeds/property-data.ts` — `SEED_PROPERTY_DEFAULTS` is the common inherit point
- `shared/schema/properties.ts` — schema source of truth
- `.claude/skills/database/SKILL.md` — migration workflow
- `.claude/rules/no-hardcoded-values.md` — when adding defaults, respect the constants pattern
