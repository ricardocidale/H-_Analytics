---
title: "feat: Knowledge Registry — AI knowledge asset control plane"
type: feat
status: completed
date: 2026-05-05
origin: docs/brainstorms/knowledge-registry-requirements.md
---

# feat: Knowledge Registry — AI knowledge asset control plane

## Summary

Adds a Knowledge Registry section to Intelligence: a `knowledge_registry` DB table seeded with 8 assets, API routes for listing and regenerating those assets, and two new frontend pages (the registry overview with type-specific content viewers and an Analyst regeneration button per asset; plus a Country Economic Data sub-page). Implements the control-plane described in §§4–9 of the origin requirements doc. Three constraints discovered during planning shape the implementation: `assumption-guidance` is display-only (no Analyst button — it is populated by per-entity analyst runs, not a portfolio-wide batch); benchmark regeneration must route through the existing single-flight guard chain; and `country_economic_data` is an observability surface, not a financial-engine input.

---

## Problem Frame

Every AI knowledge asset in H+ — vector namespaces, benchmark tables, country economic data — lives in a different system with no unified place to see it, understand it, or regenerate it. Admins cannot answer basic questions like "what does the AI actually know about comparables?" or "when was the country inflation data last updated?" without digging into code or the database directly. (see origin: `docs/brainstorms/knowledge-registry-requirements.md` §1)

---

## Requirements

- R1. A `knowledge_registry` DB table stores metadata for all 8 AI knowledge assets; seeded at startup via idempotent upsert.
- R2. A `country_economic_data` DB table stores per-country macro figures (inflation, FX, GDP, interest rate) for the initial 4 countries (US, MX, CO, BR).
- R3. API routes under `/api/admin/knowledge-registry` expose list, detail, regenerate, and country-data endpoints; all gated by `requireAdmin`.
- R4. The Knowledge Registry page in Intelligence renders one collapsible asset panel per registry entry, collapsed by default, showing name, freshness badge, chunk/row count, and Analyst button (where applicable).
- R5. Each asset panel's expanded state shows a type-specific content viewer: text-chunk cards (`vector_namespace`), ranges grid (`benchmark_table`), brands card grid (`benchmark_brands`), compact inline country table (`country_data`). No link-outs that navigate away from the page — each panel always shows inline content.
- R6. Freshness is derived client-side from `last_refreshed_at` vs. the global 30-day cadence: `missing` (null or zero count), `stale` (>30 days), `fresh` (within cadence).
- R7. The Analyst button on each panel opens `AnalystRefreshTheater`; on completion `last_refreshed_at` is updated in `knowledge_registry` and the asset panel refreshes its live stats.
- R8. A Country Economic Data sub-page shows a wide read-only table with all country rows, per-row freshness, and a global Analyst button that triggers a live fetch from FRED + Frankfurter + IMF/World Bank.
- R9. The nav IA SKILL.md canonical tree is updated to include "Knowledge Registry" in Intelligence so the decision is durable.
- R10. No OpenAPI codegen step — this repo uses plain Express route registration; §8 of the origin doc does not apply.
- R11. The `assumption-guidance` asset has no Analyst button — it is populated by per-entity analyst runs and has no portfolio-wide regeneration path. Its panel is display-only (freshness badge + chunk count + metadata footer).
- R12. The `country_economic_data` table is an observability surface only — it does not feed the financial engine. The engine continues to read macro constants from `model_constants`. Stale country data does not cause financial-engine errors; the badge communicates data currency to admins.
- R13. The read API includes `GET /api/admin/knowledge-registry/:id/chunks?page=N` for paginated chunk browsing, consumed by `VectorChunkViewer` in the frontend.

**Origin flows:** §14 (implementation order), §5 (asset panel), §6 (country sub-page), §7 (API)
**Origin acceptance criteria:** All 8 assets visible in one section; each regenerable via Analyst button; freshness badges accurate; country data table populated with last-known values.

---

## Scope Boundaries

- Admin sidebar Sources / Resources sections are separate implementation tasks (origin §10) — not touched by this plan.
- Knowledge Base, Comparables, Assumption Guidance nav placement outside Intelligence is TBD (origin §2) — not resolved here.
- Per-asset cadence override is post-v1 (origin §15).
- Specialist connection management from the registry panel is post-v1 (origin §15).
- `AnalystTables.tsx` and its existing endpoints are untouched (origin §13).
- Rebecca's chat interface and configuration are untouched (origin §13).

---

## Context & Research

### Relevant Code and Patterns

- **Table definition pattern:** `lib/db/src/schema/intelligence-v2.ts` — `pgTable`, `createInsertSchema`, `z` from `zod/v4`, index via second argument array
- **Migration pattern:** `artifacts/api-server/migrations/0035_lb_slides_config.sql` — hand-authored SQL, `CREATE TABLE IF NOT EXISTS`, `-->statement-breakpoint` separator; next slot is `0036_`
- **Seed pattern:** `artifacts/api-server/src/seeds/source-registry.ts` — typed const array, loop with existence check; register in `artifacts/api-server/src/seeds/index.ts`
- **Admin route pattern:** `artifacts/api-server/src/routes/admin/intelligence-sources.ts` — `requireAdmin`, Zod body parse, `logAndSendError`, register in `artifacts/api-server/src/routes/admin/index.ts`
- **Storage composition:** `artifacts/api-server/src/storage/intelligence-v2.ts` — sub-storage classes wired into `IntelligenceV2Storage`; declare on `IStorage` in `artifacts/api-server/src/storage/index.ts`
- **Vector stats:** `GET /api/admin/vector-store/stats` already returns `{ namespaces: Record<VectorNamespace, number> }` — use this for live chunk counts; no need to query vector store directly
- **AnalystRefreshTheater:** `artifacts/hospitality-business-portal/src/components/admin/intelligence/AnalystRefreshTheater.tsx` — props: `tableLabel`, optional `narration[]`, `onCancel`
- **ReferenceBrandsGrid:** `artifacts/hospitality-business-portal/src/components/admin/intelligence/ReferenceBrandsGrid.tsx`
- **Intelligence page/section wiring:** `artifacts/hospitality-business-portal/src/pages/Intelligence.tsx` — `sectionMeta`, `lazy()` imports, `SectionContent` switch
- **Boot-gate migration:** `artifacts/api-server/src/index.ts` `isMigrationApplied / markMigrationApplied` pattern — use for any post-schema data initialisation

### Institutional Learnings

- **Seed idempotency (critical):** `docs/solutions/database-issues/seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md` — plain `db.insert()` silently no-ops on non-empty DB; use `onConflictDoUpdate` keyed on the natural slug (`id`) for all seed records.
- **Sources UX — status icon + timestamp + button:** `docs/solutions/architecture-patterns/sources-ux-status-analyst-button-2026-05-02.md` — every regenerable entry needs three affordances: 🟢/🔴 status icon, relative "last refreshed" timestamp, [Run Analyst] button with spinner during run.
- **Nav IA placement:** `docs/solutions/architecture-patterns/admin-sidebar-ia-sources-resources-2026-05-02.md` — Knowledge Registry belongs in Intelligence, not Admin. Structured tables (benchmarks, country data, constants) belong in Admin → Sources → Tables — the Knowledge Registry overview for those types is a read-only mirror viewer, not the management surface.
- **OpenAI embedding client baseURL:** `docs/solutions/integration-issues/openai-sdk-env-base-url-overrides-embedding-client-2026-05-02.md` — any new OpenAI client for embeddings must pass `baseURL: "https://api.openai.com/v1"` explicitly; Replit AI proxy silently reroutes otherwise.
- **No-duplicate nav items:** `docs/solutions/architecture-patterns/no-duplicate-menu-items-hierarchical-nav-2026-05-02.md` — one destination = one menu item. Knowledge Registry was pruned in a prior iteration; confirm placement against nav IA SKILL.md before adding sidebar items.

### External References

- FRED API (inflation, interest rates), Frankfurter ECB (FX rates), IMF/World Bank (GDP, international rates) — per origin §6.4

---

## Key Technical Decisions

- **`knowledge_registry.id` is a text slug** (e.g., `"market-research"`) not an integer, matching the `source_registry` pattern and making seeds deterministic across environments.
- **Country data regeneration calls external APIs directly** from the route handler (not via a Specialist LLM) — these are structured numeric fetches from known endpoints, not research synthesis. Keeps the implementation simple and avoids Anthropic API cost for deterministic data.
- **Live chunk counts come from the existing vector-stats endpoint,** not from a separate DB query — the endpoint is already cached and used by other admin pages. The GET list route fetches vector stats once and merges them into the response.
- **No per-asset regeneration queuing in v1** — POST /:id/regenerate is synchronous. `AnalystRefreshTheater` does not stream SSE — it rotates narration strings on a local timer while the HTTP request is in flight. A long-running regeneration (LLM call + embedding) holds the HTTP connection open and risks timeout. Post-v1 work can add a job queue to address this.
- **No pre-existing namespace→specialist registry** — a routing table mapping vector namespace slugs to their owner Specialists does not exist at `lib/engine/src/analyst/registry/` or anywhere else. The U5 route handler must build this dispatch table explicitly by reading the specialist runners. `assumption-guidance` is excluded from regeneration dispatch (R11).
- **Benchmark regeneration must route through the single-flight guard chain** — POST /:id/regenerate for `benchmark_table` and `benchmark_brands` assets must delegate through the guard primitives in `analyst-refresh-guards.ts`, not call the refresh functions directly, to prevent concurrent writes.
- **`country_economic_data` is an observability surface, not a financial-engine input** — the engine reads macro constants from `model_constants`; stale country data has no downstream financial consequences. Freshness badge is an admin dashboard affordance only.
- **`country_economic_data` uses `country_code` (ISO 3166-1 alpha-2) as the natural key** for upserts, matching the seed-update pattern (`onConflictDoUpdate` on `country_code`).
- **OpenAPI §8 dropped** — no `api-spec/` directory exists; routes are plain Express registrations consumed by TanStack Query via `apiRequest()`.

---

## Open Questions

### Resolved During Planning

- **Which assets are the 8?** Confirmed from origin §4 and §5.3: `market-research`, `comparables`, `knowledge-base`, `assumption-guidance` (all `vector_namespace`); `capital-raise`, `exit-multiples` (`benchmark_table`); `reference-brands` (`benchmark_brands`); country data (`country_data`).
- **Where does chunk count come from?** Existing `GET /api/admin/vector-store/stats` — no new DB query needed.
- **Is OpenAPI codegen required?** No — infrastructure does not exist in this repo (origin §8 does not apply).

### Deferred to Implementation

- **Exactly which Analyst specialist(s) to call per vector namespace** during regeneration — no pre-built namespace→specialist registry exists in the codebase; the implementing agent must build the dispatch table by reading the existing specialist runners under `lib/engine/src/analyst/` and identifying which specialist owns each of the three regenerable vector namespaces (`market-research`, `comparables`, `knowledge-base`). `assumption-guidance` is excluded from dispatch per R11.
- **Benchmark table regeneration delegate** — POST /:id/regenerate for `benchmark_table` and `benchmark_brands` assets should call the existing benchmark regeneration path; exact method to invoke is at implementation time.
- **Country data API error handling granularity** — whether to write partial results on partial API failure, or roll back all rows on any failure, is an implementation-time call.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Admin request
    │
    ▼
POST /api/admin/knowledge-registry/:id/regenerate   (requireAdmin)
    │
    ├─ asset_type = "vector_namespace"
    │       └─ dispatch to owner Specialist → upsert vector chunks
    │              → update knowledge_registry.last_refreshed_at
    │
    ├─ asset_type = "benchmark_table" | "benchmark_brands"
    │       └─ delegate to existing benchmark regeneration flow
    │              → update knowledge_registry.last_refreshed_at
    │
    └─ route = "/country-economic-data/regenerate"
            └─ fetch FRED + Frankfurter + IMF/World Bank
                   → upsert country_economic_data rows
                   → update knowledge_registry["country-data"].last_refreshed_at

GET /api/admin/knowledge-registry
    │
    ├─ storage.getAllKnowledgeRegistry()           → DB rows
    ├─ fetch GET /api/admin/vector-store/stats     → chunk counts
    └─ merge → [{ ...entry, liveCount }]

Frontend (KnowledgeRegistryPage)
    │
    ├─ useQuery(["/api/admin/knowledge-registry"])
    ├─ asset panels (collapsed by default)
    │    ├─ summary row: name + FreshnessBadge + liveCount + AnalystButton
    │    └─ expanded: TypeSpecificViewer (chunks | ranges | brands | compact-table)
    └─ AnalystButton → AnalystRefreshTheater → POST /:id/regenerate
                                             → invalidate query on close
```

---

## Implementation Units

- U1. **DB schema and migration**

**Goal:** Define the two new tables in Drizzle schema and create the SQL migration.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Create: `lib/db/src/schema/knowledge-registry.ts`
- Modify: `lib/db/src/schema/index.ts`
- Create: `artifacts/api-server/migrations/0036_knowledge_registry.sql`

**Approach:**
- `knowledgeRegistry` table: `id` text PK (slug), `display_name`, `description`, `how_built`, `source_description`, `renewal_mechanism` (all text NOT NULL), `asset_type` text NOT NULL, `asset_ref` text NOT NULL, `last_refreshed_at` timestamptz nullable, `created_at` timestamptz DEFAULT now().
- `countryEconomicData` table: `id` serial PK, `country_code` text NOT NULL UNIQUE, `country_name` text NOT NULL, `inflation_rate` / `fx_rate_to_usd` / `gdp_growth_rate` / `interest_rate` (all numeric nullable), `sourced_at` timestamptz nullable, `source_notes` text nullable, `updated_at` timestamptz DEFAULT now().
- Export `insertKnowledgeRegistrySchema`, `insertCountryEconomicDataSchema` and inferred types.
- Add `export * from "./knowledge-registry"` to `lib/db/src/schema/index.ts`.
- Migration SQL uses `CREATE TABLE IF NOT EXISTS` with `-->statement-breakpoint` between the two statements.

**Patterns to follow:**
- `lib/db/src/schema/intelligence-v2.ts` for table definition style
- `artifacts/api-server/migrations/0035_lb_slides_config.sql` for SQL format

**Test scenarios:**
- Test expectation: none — this is DDL only; TypeScript compilation verifies schema exports and inferred types

**Verification:**
- `pnpm typecheck` passes in `lib/db` and `artifacts/api-server`
- Both tables appear in the Drizzle schema export
- Migration file is valid SQL and consistent with schema definition

---

- U2. **Seeds — 8 knowledge assets**

**Goal:** Seed the `knowledge_registry` table with the 8 canonical AI knowledge assets at server startup.

**Requirements:** R1

**Dependencies:** U1

**Files:**
- Create: `artifacts/api-server/src/seeds/knowledge-registry.ts`
- Modify: `artifacts/api-server/src/seeds/index.ts`
- Modify: `artifacts/api-server/src/index.ts` (add boot-gate call for `country_economic_data` pre-population)

**Approach:**
- Define a typed const array of 8 seed records (slugs: `market-research`, `comparables`, `knowledge-base`, `assumption-guidance`, `capital-raise`, `exit-multiples`, `reference-brands`, `country-data`).
- Use `db.insert(knowledgeRegistry).values(...).onConflictDoUpdate({ target: knowledgeRegistry.id, set: { ...display fields... } })` — idempotent on `id`.
- Do NOT seed `countryEconomicData` rows in this seed file — those are populated via a boot-gate migration that runs once at server startup. After the schema migration applies, the boot-gate check (`isMigrationApplied / markMigrationApplied` pattern from `artifacts/api-server/src/index.ts`) pre-populates `country_economic_data` with hardcoded last-known values for US, MX, CO, BR so the table is never empty on first boot. The implementing agent should add this boot-gate call (keyed e.g., `"knowledge-registry-country-data-seed"`) to the startup sequence alongside seed registration.
- Export `seedKnowledgeRegistry(): Promise<void>` and register it in `seeds/index.ts`.

**Patterns to follow:**
- `artifacts/api-server/src/seeds/source-registry.ts` for structure
- `onConflictDoUpdate` (not plain insert) per institutional learning

**Test scenarios:**
- Happy path: running `seedKnowledgeRegistry()` twice produces exactly 8 rows (idempotency)
- Edge case: each of the 8 expected asset slugs is present after seeding
- Edge case: `display_name` and `asset_type` values match the requirements doc §4 seed values

**Verification:**
- `pnpm typecheck` clean
- Running the seed function twice produces exactly 8 rows with no duplicates

---

- U3. **Storage layer**

**Goal:** Add `KnowledgeRegistryStorage` methods to the storage layer and wire them into `IntelligenceV2Storage` and `IStorage`.

**Requirements:** R1, R2, R3

**Dependencies:** U1

**Files:**
- Create: `artifacts/api-server/src/storage/intelligence/knowledge-registry.ts`
- Modify: `artifacts/api-server/src/storage/intelligence-v2.ts`
- Modify: `artifacts/api-server/src/storage/index.ts`

**Approach:**
- Methods: `getAllKnowledgeRegistry()`, `getKnowledgeRegistryEntry(id: string)`, `updateKnowledgeRegistryRefreshed(id: string, at: Date)`, `getAllCountryEconomicData()`, `upsertCountryEconomicData(rows: InsertCountryEconomicData[])`.
- Inject `db` via constructor (same pattern as other `intelligence/` sub-storage classes).
- Add the class to `IntelligenceV2Storage`'s composition.
- Declare all 5 methods on the `IStorage` interface.

**Patterns to follow:**
- `artifacts/api-server/src/storage/intelligence/constants/sources.ts`
- `artifacts/api-server/src/storage/intelligence-v2.ts` composition pattern

**Test scenarios:**
- Happy path: `getAllKnowledgeRegistry()` returns all seeded rows after U2 runs
- Happy path: `getKnowledgeRegistryEntry("market-research")` returns the correct row
- Happy path: `updateKnowledgeRegistryRefreshed` sets `last_refreshed_at` to the given date
- Edge case: `getKnowledgeRegistryEntry` with an unknown id returns `undefined`
- Happy path: `upsertCountryEconomicData` on empty table creates 4 rows; calling again with updated values replaces them (no duplicates)

**Verification:**
- `pnpm typecheck` clean in `artifacts/api-server`
- All 5 methods accessible via `storage.*` at the call sites

---

- U4. **Read API routes**

**Goal:** Implement GET routes for listing registry entries (with live stats), fetching a single entry, and fetching all country economic data rows.

**Requirements:** R3, R4, R6

**Dependencies:** U3

**Files:**
- Create: `artifacts/api-server/src/routes/admin/knowledge-registry.ts`
- Modify: `artifacts/api-server/src/routes/admin/index.ts`
- Test: `artifacts/api-server/src/tests/admin/knowledge-registry-routes.test.ts`

**Approach:**
- `GET /api/admin/knowledge-registry` — fetch all registry rows from storage, fetch vector stats via internal call to `getNamespaceStats()` from `vector-store-service`, merge chunk counts into entries where `asset_type === "vector_namespace"`, return merged array.
- `GET /api/admin/knowledge-registry/:id` — fetch single entry; 404 if not found.
- `GET /api/admin/knowledge-registry/:id/chunks?page=N` — paginated chunk retrieval for `VectorChunkViewer`; query the vector store for chunks in the named namespace; return `{ chunks: ChunkRecord[], page: number, total: number }`. Default page size: 20. Only valid for `vector_namespace` assets; return 422 for other types.
- `GET /api/admin/knowledge-registry/country-economic-data` — return all country rows.
- All routes use `requireAdmin`. Use `logAndSendError` for error handling.
- Register via `registerKnowledgeRegistryRoutes(app)` in `routes/admin/index.ts`.

**Patterns to follow:**
- `artifacts/api-server/src/routes/admin/intelligence-sources.ts`

**Test scenarios:**
- Happy path: `GET /` returns 200 with array including `liveCount` field on vector_namespace entries
- Happy path: `GET /market-research` returns 200 with the seeded entry
- Error path: `GET /nonexistent-id` returns 404
- Error path: unauthenticated request returns 401
- Happy path: `GET /country-economic-data` returns 200 with array (empty or populated)
- Happy path: `GET /market-research/chunks?page=1` returns 200 with `{ chunks, page, total }` shape
- Error path: `GET /capital-raise/chunks` (benchmark_table type) returns 422

**Verification:**
- Routes return expected shapes; TypeScript clean; tests pass

---

- U5. **Regeneration API**

**Goal:** Implement POST routes to trigger Analyst regeneration for a single asset and for all country economic data.

**Requirements:** R3, R7, R8

**Dependencies:** U3, U4

**Files:**
- Modify: `artifacts/api-server/src/routes/admin/knowledge-registry.ts`
- Test: `artifacts/api-server/src/tests/admin/knowledge-registry-routes.test.ts`

**Approach:**
- `POST /api/admin/knowledge-registry/:id/regenerate` — look up entry; 404 if missing. Dispatch by `asset_type`:
  - `vector_namespace`: no pre-existing namespace→specialist registry exists. Build a local dispatch table in the route handler (by reading the specialist runners under `lib/engine/src/analyst/`) mapping each of the three regenerable slugs (`market-research`, `comparables`, `knowledge-base`) to their owner Specialist. Return 422 for `assumption-guidance` with a message explaining it is populated by per-entity analyst runs and has no portfolio-wide regeneration path (R11). For the remaining three, call the owner Specialist, upsert new chunks, call `updateKnowledgeRegistryRefreshed` on success.
  - `benchmark_table` / `benchmark_brands`: do NOT call the benchmark refresh functions directly — route through the single-flight guard primitives in `artifacts/api-server/src/routes/admin/analyst-refresh-guards.ts` to prevent concurrent writes, matching the pattern used by the existing AnalystTables routes. Call `updateKnowledgeRegistryRefreshed` after the guard completes successfully.
  - `country_data`: redirect to the country-data regeneration handler below.
- `POST /api/admin/knowledge-registry/country-economic-data/regenerate` — fetch FRED (US CPI/Fed Funds rate), Frankfurter (FX rates for MX, CO, BR), IMF/World Bank (GDP growth for all 4); upsert into `country_economic_data` keyed on `country_code`; update `knowledge_registry["country-data"].last_refreshed_at`.
- Any new OpenAI client for embeddings must pass `baseURL: "https://api.openai.com/v1"` (institutional learning).

**Patterns to follow:**
- Existing Specialist dispatch patterns in `artifacts/api-server/src/routes/admin/intelligence.ts`
- Benchmark regeneration in `artifacts/api-server/src/routes/admin/analyst-tables.ts` or equivalent

**Test scenarios:**
- Happy path: POST to a `vector_namespace` asset id calls the correct specialist and updates `last_refreshed_at`
- Happy path: POST to `country-economic-data/regenerate` returns 200 and writes rows to the DB
- Error path: POST to unknown asset id returns 404
- Error path: External API failure during country regeneration is logged and returns a meaningful error (does not corrupt existing rows)
- Integration: `last_refreshed_at` is null before regeneration and non-null after a successful run

**Verification:**
- Routes registered and reachable; integration test confirms `last_refreshed_at` updates after POST

---

- U6. **Intelligence sidebar wiring**

**Goal:** Add `"knowledge-registry"` and `"knowledge-registry-country-data"` sections to the Intelligence sidebar and page router, and update the nav IA SKILL.md canonical tree.

**Requirements:** R4, R8, R9

**Dependencies:** None (can run in parallel with U1–U5)

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/components/intelligence/IntelligenceSidebar.tsx`
- Modify: `artifacts/hospitality-business-portal/src/pages/Intelligence.tsx`
- Modify: `.agents/skills/hplus-admin-nav-ia/SKILL.md`

**Approach:**
- Add `"knowledge-registry"` and `"knowledge-registry-country-data"` to the `IntelligenceSection` union type.
- Add a `"Knowledge Registry"` nav group to `buildNavGroups()` with two sub-items: "Knowledge Registry" and "Country Economic Data".
- In `Intelligence.tsx`: add `sectionMeta` entries for both sections, add `lazy()` imports for `KnowledgeRegistryPage` and `CountryEconomicDataPage`, add `case` branches in `SectionContent`.
- Update the canonical nav tree in `.agents/skills/hplus-admin-nav-ia/SKILL.md` to add the Knowledge Registry group under Intelligence — prevents future agents from incorrectly pruning it again.

**Patterns to follow:**
- Existing section type additions in `IntelligenceSidebar.tsx`
- `lazy()` import + `sectionMeta` + `switch` case pattern in `Intelligence.tsx`

**Test scenarios:**
- Happy path: navigating to `knowledge-registry` section renders the `KnowledgeRegistryPage` without errors (smoke test)
- Happy path: navigating to `knowledge-registry-country-data` renders `CountryEconomicDataPage`
- Edge case: `SectionContent` switch has `default` or exhaustive handling — new sections don't fall through silently
- Test expectation: nav IA SKILL.md update is doc-only, no runtime test needed

**Verification:**
- `pnpm typecheck` clean in `artifacts/hospitality-business-portal`
- Both sections appear in sidebar and route to correct pages

---

- U7. **Knowledge Registry page**

**Goal:** Build `KnowledgeRegistryPage` with collapsible asset panels, freshness badges, type-specific content viewers, and Analyst button wiring.

**Requirements:** R4, R5, R6, R7

**Dependencies:** U4, U6

**Files:**
- Create: `artifacts/hospitality-business-portal/src/pages/intelligence/KnowledgeRegistryPage.tsx`
- Create: `artifacts/hospitality-business-portal/src/components/admin/intelligence/knowledge-registry/AssetPanel.tsx`
- Create: `artifacts/hospitality-business-portal/src/components/admin/intelligence/knowledge-registry/FreshnessBadge.tsx`
- Create: `artifacts/hospitality-business-portal/src/components/admin/intelligence/knowledge-registry/VectorChunkViewer.tsx`

**Approach:**
- `KnowledgeRegistryPage`: `useQuery({ queryKey: ["/api/admin/knowledge-registry"] })`. Maps entries to `AssetPanel` components. Default-collapsed accordion.
- `AssetPanel`: Summary row shows `display_name`, `FreshnessBadge`, `liveCount` (formatted as "N chunks" or "N rows"), relative `last_refreshed_at`, and Analyst button. Expanded state shows `TypeSpecificViewer` + metadata footer (description, how_built, source_description, renewal_mechanism).
- `FreshnessBadge`: derives `missing | stale | fresh` from `last_refreshed_at` and `liveCount` — `missing` if null or count=0, `stale` if >30 days, `fresh` otherwise.
- `TypeSpecificViewer` switch: `vector_namespace` → `VectorChunkViewer` (paginated list of recent chunks, 20/page, fetched from `GET /api/admin/knowledge-registry/:id/chunks?page=N`); `benchmark_table` → render inline ranges grid; `benchmark_brands` → `<ReferenceBrandsGrid />`; `country_data` → inline compact country table (columns: country_code, country_name, inflation_rate, fx_rate_to_usd, sourced_at; null values as "—"; data fetched from `GET /api/admin/knowledge-registry/country-economic-data`). No link-outs that navigate away from the page — all viewers are inline per R5.
- Analyst button: sets local `refreshing` state, opens `AnalystRefreshTheater`, on cancel/complete invalidates the list query and re-fetches to update count + freshness.

**Patterns to follow:**
- `artifacts/hospitality-business-portal/src/components/admin/intelligence/AnalystTables.tsx` for query + mutation + theater wiring
- `artifacts/hospitality-business-portal/src/components/admin/intelligence/ReferenceBrandsGrid.tsx` for brands viewer
- Sources UX pattern (status icon LEFT, timestamp and button RIGHT-aligned) per institutional learning

**Test scenarios:**
- Happy path: page renders list of 8 panels in collapsed state with asset names visible
- Happy path: expanding a `vector_namespace` panel shows `VectorChunkViewer` with chunk cards
- Happy path: expanding a `benchmark_brands` panel renders `ReferenceBrandsGrid`
- Happy path: expanding a `country_data` panel shows an inline compact country table with country_code, inflation_rate, fx_rate_to_usd, and sourced_at columns (no navigation away from the page)
- Edge case: `FreshnessBadge` shows "missing" when `last_refreshed_at` is null
- Edge case: `FreshnessBadge` shows "stale" when `last_refreshed_at` is 31+ days ago
- Edge case: `FreshnessBadge` shows "fresh" when `last_refreshed_at` is within 30 days and `liveCount > 0`
- Happy path: clicking Analyst button opens `AnalystRefreshTheater`; closing it invalidates and re-fetches the query
- Error path: if API returns an error, page shows an error state (not a blank screen)

**Verification:**
- All 8 panels render; freshness logic correct for all three states; Analyst button wires to theater; TypeScript clean

---

- U8. **Country Economic Data sub-page**

**Goal:** Build `CountryEconomicDataPage` showing the wide country table with freshness indicators and a global Analyst button.

**Requirements:** R8

**Dependencies:** U4, U5, U6

**Files:**
- Create: `artifacts/hospitality-business-portal/src/pages/intelligence/CountryEconomicDataPage.tsx`

**Approach:**
- `useQuery({ queryKey: ["/api/admin/knowledge-registry/country-economic-data"] })`.
- Wide table: columns = Country / Inflation Rate / FX Rate (to USD) / GDP Growth / Interest Rate / Sourced At / Source Notes.
- Missing values (null) rendered as "—" with a `missing` badge.
- Per-row freshness: `fresh` if `sourced_at` within 30 days, `stale` otherwise, `missing` if null.
- Page header: "Country Economic Data" + subtitle + last global `sourced_at` timestamp.
- Global Analyst button top-right: opens `AnalystRefreshTheater` pointing at `POST /api/admin/knowledge-registry/country-economic-data/regenerate`; on close invalidates query.
- Table is read-only. No inline editing.

**Patterns to follow:**
- `artifacts/hospitality-business-portal/src/pages/intelligence/MarketDataTablesPage.tsx` for wide data table layout

**Test scenarios:**
- Happy path: page renders a table with 4 country rows (US, MX, CO, BR) after regeneration
- Edge case: null numeric values render as "—" not as "0" or empty string
- Edge case: row with null `sourced_at` shows "missing" badge
- Happy path: Analyst button opens theater and triggers `POST /country-economic-data/regenerate`
- Happy path: after regeneration completes, table re-fetches and shows updated `sourced_at` timestamps

**Verification:**
- Table renders for all 4 countries; null values display correctly; Analyst button wires up; TypeScript clean

---

## System-Wide Impact

- **Interaction graph:** `seeds/index.ts` startup path gains a new seed call. Admin routes gain 6 new endpoints. `IntelligenceV2Storage` gains 5 new methods delegated to `KnowledgeRegistryStorage`. `IntelligenceSidebar` type union and nav groups change — existing sections are unaffected but the type change must be exhaustive.
- **Error propagation:** Regeneration failures are caught per-route, logged, and returned as 500 with a message. They do not affect other assets. Country data partial-API failures are an implementation-time decision (see deferred questions).
- **State lifecycle risks:** `last_refreshed_at` is updated only on successful regeneration completion — if the theater is cancelled mid-stream, the timestamp is not updated. Chunk upserts on vector namespaces are idempotent (namespace+id key) per the existing `upsertChunks` contract.
- **API surface parity:** None — no client-side SDK or agent SDK needs updating for these new routes.
- **Integration coverage:** The regeneration → `last_refreshed_at` → freshness badge chain should be verified with an integration test (U5 test scenario 5).
- **Unchanged invariants:** `AnalystTables.tsx` and its `/api/admin/analyst-tables/*` routes are untouched. The `vector_chunks` table schema is untouched. Rebecca's `queryChunks` calls are unaffected — when a namespace is regenerated via the registry, new chunks replace old ones and Rebecca's next query automatically uses them.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Country data APIs (FRED, Frankfurter, IMF) may be rate-limited or temporarily unavailable | Wrap each fetch in a try/catch; write partial results if some succeed; log which sources failed; return a partial-success response |
| Vector namespace regeneration via Specialist may be slow (LLM call + embedding) | `AnalystRefreshTheater` keeps the UI responsive by rotating narration strings locally — but the HTTP connection stays open until the request completes; mitigate by keeping specialist calls as targeted as possible, and by post-v1 job queue |
| Seed on non-empty DB silently drops updates if plain INSERT is used | Mitigated by using `onConflictDoUpdate` in the seed function (institutional learning) |
| Nav sidebar type union change may break exhaustive checks elsewhere | TypeScript will surface this at typecheck; fix any `never`-reaching arms before shipping |
| Embedding client `baseURL` missing → chunks silently fail | Explicitly pass `baseURL: "https://api.openai.com/v1"` in any new OpenAI client constructions (institutional learning) |
| Knowledge Registry previously pruned from nav — could be pruned again | Nav IA SKILL.md updated in U6 as a durable record of the placement decision |
| `AnalystRefreshTheater` rotates narration strings locally (does not stream SSE); long LLM+embedding operations risk HTTP timeout before the response closes | Document the timeout risk; keep v1 synchronous and rely on post-v1 job queue (already planned) to resolve. For country data fetches (deterministic, fast), timeout risk is minimal |

---

## Sources & References

- **Origin document:** [`docs/brainstorms/knowledge-registry-requirements.md`](docs/brainstorms/knowledge-registry-requirements.md)
- DB schema pattern: `lib/db/src/schema/intelligence-v2.ts`
- Seed pattern: `artifacts/api-server/src/seeds/source-registry.ts`
- Admin route pattern: `artifacts/api-server/src/routes/admin/intelligence-sources.ts`
- Vector stats endpoint: `artifacts/api-server/src/routes/admin/intelligence-vector-store.ts`
- Storage composition: `artifacts/api-server/src/storage/intelligence-v2.ts`
- Intelligence sidebar: `artifacts/hospitality-business-portal/src/components/intelligence/IntelligenceSidebar.tsx`
- Intelligence page router: `artifacts/hospitality-business-portal/src/pages/Intelligence.tsx`
- Nav IA canonical tree: `.agents/skills/hplus-admin-nav-ia/SKILL.md`
- Institutional learnings: `docs/solutions/database-issues/seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md`, `docs/solutions/architecture-patterns/sources-ux-status-analyst-button-2026-05-02.md`, `docs/solutions/integration-issues/openai-sdk-env-base-url-overrides-embedding-client-2026-05-02.md`
