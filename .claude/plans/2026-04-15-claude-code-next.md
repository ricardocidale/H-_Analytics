# Claude Code — Next Session Plan

## What Was Done (88 commits over 2 days)

### Day 1 (April 14)
- Security audit: 11 engine bugs, 7 external service fixes, PMT deduplication
- Brand voice: guidelines, vocabulary skill, Analyst + Rebecca personas, 3 reusable communication skills
- Audit tests: 10 files, 209 tests (endpoint security, fetch timeouts, route params, vocabulary)
- WeasyPrint PDF pipeline wired
- Page visit tracking (server + storage)
- Knowledge base seeds (18 knowledge-base entries), market data seeds (475 rows)
- CI fixes (ripgrep, test timeouts, ESLint)

### Day 2 (April 15)
- Architecture map: unified doc with nav tree, 86 property fields, 107 global assumptions, dependencies
- Eliminated ALL 36 raw parseInt(req.params) across 13 route files → parseRouteId()
- Added Zod to 5 unvalidated req.body usages
- Moved all 10 db.* calls from server/ai/ to storage abstraction layer
- Verified all 12 plan steps already complete (soft delete, portfolio, sources, health, defaults, stress)

## Self-Review: What's Honest

### Solid
- Route parameter validation: 0 raw parseInt remaining
- Storage abstraction: 0 direct db imports in server/ai/
- Audit test suite: automated guards catching regressions
- Brand voice: single source of truth, enforcement rules, vocabulary

### Fragile
- **Seeds may not have run on Replit** — tables might be empty, app silently degrades
- **Auto-trigger intelligence not implemented** — banner shows, but requires manual click
- **WeasyPrint untested** — wired but never exercised end-to-end
- **Golden tests don't validate DB** — they use local fixtures, would pass with empty DB
- **86 `as any` casts in non-test code** — 22 server files, 64 client files
- **finance.ts line 211** — `typeof req.body.scenarioId` still bypasses Zod

## What Claude Code Should Do Next

### Priority 1: Typed JSONB Accessors (eliminates ~22 server `as any`)
Create typed accessor functions for every JSONB column:
- `assumption_guidance.dataQuality` → `getDataQuality(row): DataQualityScore`
- `scenario_property_overrides.params` → `getOverrideParams(row): OverrideParams`
- `source_registry.dataProvided` → `getDataProvided(row): string[]`
- Each accessor does `z.safeParse()` on the raw JSONB and returns typed or default

Files: Create `shared/schema/jsonb-accessors.ts`, update consumers.

### Priority 2: Test Fixture Factories (eliminates ~200 test `as any`)
Create factory functions that produce valid typed objects:
- `createTestProperty(overrides?)` → full Property with sensible defaults
- `createTestGlobalAssumptions(overrides?)` → full GlobalAssumptions
- `createTestScenario(overrides?)` → full Scenario
- Put in `tests/fixtures/factories.ts`

### Priority 3: Fix finance.ts Zod Gap
Line 211: `typeof req.body.scenarioId === "number"` should use the existing Zod schema.

### Priority 4: Golden Test DB Validation
Add a test that queries the actual DB tables and validates seed data exists:
- `tests/audit/seed-data-integrity.test.ts`
- Checks each of the 7 pre-collected tables has expected row counts
- Checks seed properties exist with expected names

### Priority 5: Expand Audit Test Coverage
New automated guards:
- No `db.` imports outside `server/storage/` and `server/db.ts`
- No `parseInt(req.params` anywhere in server/
- All JSONB column reads use typed accessors (once Priority 1 is done)

### Priority 6: Source-Map Freshness
The `.claude/skills/architecture/source-map.md` may be stale after 88 commits.
Regenerate from current codebase state.
