# Execution Plan — Claude Code Next Session

> Self-contained. No permission prompts. Execute sequentially, commit after each phase.

---

## Phase 1: Fix the finance.ts Zod Gap (5 min)

**File:** `server/routes/finance.ts` line 211
**Current:** `typeof req.body.scenarioId === "number" ? req.body.scenarioId : 0`
**Fix:** The body is already Zod-validated upstream by `computeRequestSchema`. Add `scenarioId` to that schema as `z.number().int().optional().default(0)`, then use the parsed value.

**Steps:**
1. Read `server/routes/finance.ts` lines 195-220 to see the compute endpoint
2. Read the `computeRequestSchema` definition (in `server/routes/helpers.ts` or nearby)
3. Add `scenarioId: z.number().int().optional().default(0)` to the schema
4. Replace line 211 with `const scenarioId = validation.data.scenarioId ?? 0;`
5. Run `tsc --noEmit` — must pass
6. Commit: `fix: add scenarioId to computeRequestSchema — last Zod gap`

---

## Phase 2: Test Fixture Factories (30 min)

**Goal:** Create typed factory functions so tests stop needing `as any` for partial objects.

**File to create:** `tests/fixtures/factories.ts`

**Steps:**
1. Read `tests/fixtures/index.ts` — current untyped fixtures
2. Read `shared/schema/properties.ts` — Property type definition
3. Read `shared/schema.ts` or `shared/schema/global-assumptions.ts` — GlobalAssumptions type
4. Create `tests/fixtures/factories.ts` with:
   ```typescript
   import type { Property, GlobalAssumptions, Scenario } from "@shared/schema";
   
   export function createTestProperty(overrides?: Partial<Property>): Property {
     return { ...BASE_PROPERTY_DEFAULTS, ...overrides } as Property;
   }
   
   export function createTestGlobalAssumptions(overrides?: Partial<GlobalAssumptions>): GlobalAssumptions {
     return { ...BASE_GLOBAL_DEFAULTS, ...overrides } as GlobalAssumptions;
   }
   ```
   Where BASE_*_DEFAULTS has every required field with sensible values.
5. Update `tests/fixtures/index.ts` to re-export from factories
6. Pick the worst offender test file (`phase3-features-golden.test.ts` — 40 casts) and convert it to use factories
7. Pick 2 more high-cast files and convert
8. Run `vitest run tests/golden/phase3-features-golden.test.ts` — must pass
9. Run `tsc --noEmit` — must pass
10. Commit: `refactor: add typed test fixture factories — eliminate as-any in golden tests`

---

## Phase 3: Typed JSONB Accessors (45 min)

**Goal:** Create accessor functions for JSONB columns so server code stops casting `as any`.

**Analysis of the 65 server `as any` casts by cause:**

| Cause | Count | Fix |
|-------|-------|-----|
| JSONB column access (dataQuality, params, dataProvided) | ~15 | Typed accessor with Zod parse |
| Property fields not in TS type (archivedAt, qualityTier, etc.) | ~20 | These are schema columns — should already be typed. Check if the Property type is incomplete |
| Drizzle insert/upsert type mismatches | ~15 | `as typeof table.$inferInsert` (already used in some places) |
| ICP descriptive object building | ~13 | Interface for ICP descriptive config |
| Misc (config objects, dynamic keys) | ~5 | Case-by-case |

**Steps:**
1. Read `shared/schema/intelligence-v2.ts` — identify all JSONB columns
2. Read `shared/schema/properties.ts` — check if `archivedAt`, `qualityTier`, `totalPropertyAcreage`, etc. are in the Property type
3. Create `shared/schema/jsonb-accessors.ts`:
   ```typescript
   import { z } from "zod";
   
   const dataQualitySchema = z.object({
     sourceCount: z.number(),
     sourceTypes: z.array(z.string()),
     dataAgeDays: z.number(),
     rangeSpreadPct: z.number(),
     sourcesConverge: z.boolean(),
     qualityScore: z.number(),
     qualityNarrative: z.string(),
   }).partial();
   
   export type DataQualityScore = z.infer<typeof dataQualitySchema>;
   
   export function getDataQuality(raw: unknown): DataQualityScore {
     const parsed = dataQualitySchema.safeParse(raw);
     return parsed.success ? parsed.data : {};
   }
   ```
4. For each JSONB column, add a typed accessor
5. Update the 15 JSONB-related `as any` casts to use accessors
6. For the Property type gap: if fields like `archivedAt`, `qualityTier` are in the schema but not the exported type, fix the type export
7. For ICP: create an `IcpDescriptiveConfig` interface in `server/ai/icp-intelligence.ts`
8. Run `tsc --noEmit` after each batch of changes
9. Commit: `refactor: add typed JSONB accessors — eliminate 30+ as-any casts in server`

---

## Phase 4: New Audit Guard Tests (20 min)

**Goal:** Add automated tests that prevent regressions on the patterns we just fixed.

**File to create:** `tests/audit/storage-boundary.test.ts`

```typescript
// Test 1: No direct db imports outside server/storage/ and server/db.ts
// Scan all .ts files in server/ai/, server/routes/, server/services/
// Assert: none import from "../db" or "../../db"

// Test 2: No parseInt(req.params anywhere in server/routes/
// Scan all route files
// Assert: zero matches for /parseInt\(.*req\.params/

// Test 3: No raw req.body without Zod in route handlers
// Scan for destructuring from req.body without a preceding .safeParse
// (heuristic — check for `= req.body` not preceded by schema.safeParse on same route)
```

**File to create:** `tests/audit/seed-data-integrity.test.ts`

```typescript
// This test requires DB connection — skip in CI if DATABASE_URL not set
// Test: Each pre-collected table has minimum expected rows
// market_adr_index >= 10, seasonal_calendars >= 12, etc.
// Test: Seed properties exist by name
```

**Steps:**
1. Create `tests/audit/storage-boundary.test.ts` with fs-based scanning (same pattern as existing audit tests)
2. Create `tests/audit/seed-data-integrity.test.ts` with conditional skip
3. Run `vitest run tests/audit/` — all must pass
4. Commit: `test: add storage boundary + seed integrity audit guards`

---

## Phase 5: Clean Up Remaining Server as-any (20 min)

**Goal:** Mop up the remaining `as any` casts in server/ that weren't JSONB or type gaps.

**Targets:**
- `server/routes/properties.ts` (4 casts) — likely stripToColumns or Drizzle insert types
- `server/routes/research.ts` (3 casts) — likely response shaping
- `server/ai/ambient/research-scheduler.ts` (6 casts) — likely Drizzle upsert
- `server/providers/config.ts` (2 casts) — likely dynamic config access
- `server/replit_integrations/batch/utils.ts` (2 casts) — likely batch processing

**Steps:**
1. For each file, read the `as any` context
2. Fix with proper typing (interface, generic, `satisfies`, or `$inferInsert`)
3. Run `tsc --noEmit` after each file
4. Commit: `refactor: eliminate remaining as-any casts in server — 65 → 0`

---

## Phase 6: Commit, Push, Update Docs (5 min)

1. Run full audit suite: `vitest run tests/audit/`
2. Run full TypeScript check: `tsc --noEmit`
3. Push all commits
4. Update `.claude/skills/architecture/app-architecture.md` section 7 (Codebase Health Trends) with new numbers

---

## Timing

| Phase | Est. | Commits |
|-------|------|---------|
| 1. Finance Zod gap | 5 min | 1 |
| 2. Test fixture factories | 30 min | 1 |
| 3. Typed JSONB accessors | 45 min | 1 |
| 4. New audit guards | 20 min | 1 |
| 5. Remaining as-any cleanup | 20 min | 1 |
| 6. Push + docs | 5 min | 1 |
| **Total** | **~2 hrs** | **6 commits** |

## No-Permission Protocol

- All changes are in server/, shared/schema/, and tests/ — no client code
- All changes compile (`tsc --noEmit` after each phase)
- All existing tests must continue passing
- Commit after each phase (not at the end)
- Push after all phases complete
- No interactive commands, no git rebase -i, no force push
