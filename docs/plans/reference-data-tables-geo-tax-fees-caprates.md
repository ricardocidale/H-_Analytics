---
title: "Reference Data Tables — Geography, Jurisdictional Tax, Regulatory Fees, Cap Rates"
status: active
created: 2026-05-09
depth: standard
origin: "direct (architect gap analysis, session 2026-05-09)"
---

## Summary

Add four reference data tables (geography dimension, hotel/occupancy taxes, regulatory fees, cap rates by market) to Neon/pgvector, each backed by an LLM-powered Analyst regeneration job and surfaced in the Admin Sources section with a canonical `AnalystButton` that triggers on-demand refresh.

## Problem Frame

H+ Analytics currently hard-codes country and US-state reference data (19 countries, 13 states) as TypeScript constants in `lib/db/src/countryDefaults.ts`. Hotel/occupancy tax rates, regulatory fees, and cap rates by market are entirely absent from the data layer. This forces the financial engine to use stale, manually-maintained fallbacks and blocks the Analyst from producing jurisdiction-accurate projections. The fix is a proper DB-resident reference data layer — queryable, provenance-tracked, and admin-refreshable on demand.

## Requirements

- **R1** Four new tables on Neon/pgvector: `geography_dimension`, `jurisdictional_taxes`, `regulatory_fees`, `market_cap_rates`.
- **R2** `geography_dimension` and `market_cap_rates` carry `vector(1536)` embedding columns for semantic/similarity search. Tax and fee rows use exact jurisdictional lookup — no embeddings needed.
- **R3** All four tables include `source_id` (FK → `source_registry`), `source_name`, `source_url`, `effective_from`/`effective_until` date fields, and `updated_at` timestamps for provenance.
- **R4** Cap rate table is append-only time-series: each row has an `as_of_date` so trend queries work without a separate history table.
- **R5** A seed baseline populates `geography_dimension` from existing `COUNTRY_DEFAULTS` + `US_STATE_DEFAULTS` TS constants on first run.
- **R6** Each table has a corresponding `knowledge_registry` entry (asset type `benchmark_table`) so the existing `AnalystTables` admin UI renders it automatically.
- **R7** The existing `/api/admin/knowledge-registry/:id/regenerate` SSE route dispatches to LLM research functions for all four tables — producing narration + auto-committed rows (no diff-review step, unlike capital_raise_benchmarks).
- **R8** Admin Sources UI — the four entries appear in `AnalystTables.tsx` with row counts, last-refreshed timestamp, freshness status, and an `AnalystButton` (suffix `"Regenerate"`).
- **R9** Research recipes: each table's LLM function must cite ≥ 3 independent sources (N+1 evidence rule), produce structured JSON, and fall back to existing rows on LLM failure.
- **R10** `COUNTRY_DEFAULTS` / `US_STATE_DEFAULTS` TS constants remain as factory fallbacks; DB rows become the runtime read path for new lookups. Migrating existing engine reads is out of scope.

## Scope Boundaries

**In scope:** DB schema, migration, seed baseline, storage CRUD, knowledge_registry entries, LLM research recipe implementations (4 functions), SSE route dispatch stubs → real implementations, Admin Sources UI integration.

**Out of scope:**
- Automated scheduled refresh (Analyst button is on-demand only)
- Labor market rates, interest rate time series (architect items 4 and 6)
- Migrating existing property/company assumption reads away from TS constants
- Admin UI for editing individual rows (CRUD table editor)
- All 50 US states in seed v1 — start with the 13 already in `US_STATE_DEFAULTS`, expand via Analyst button

## Key Technical Decisions

### KD-1 — Auto-commit pattern (not diff-review)
Capital raise benchmarks and exit multiples use a diff-review dialog before committing. The four reference data tables use **auto-commit**: the Analyst writes rows directly after the LLM returns, same as `reference_brands`. Rationale: geography/tax/fee/cap-rate data has no "proposed vs. current" ambiguity — either the data is sourced correctly or the admin runs it again.

### KD-2 — Shared dispatch via existing knowledge-registry route
The existing `POST /api/admin/knowledge-registry/:id/regenerate` route already handles SSE + single-flight guard + audit log. The four new table IDs (`geography_dimension`, `jurisdictional_taxes`, `regulatory_fees`, `market_cap_rates`) are already wired into the dispatch map in `artifacts/api-server/src/routes/admin/knowledge-registry.ts` (lines 207–221). No new route needed.

### KD-3 — Research recipe shape mirrors `researchReferenceBrands`
Each research function returns `{ proposedRows, narration, sourceCount, evidence }`. The route handler auto-commits rows and returns `autoCommitted: true` to the frontend. The frontend plays narration as a ticker and shows a toast on completion — no diff dialog opens.

### KD-4 — Seed uses COUNTRY_DEFAULTS / US_STATE_DEFAULTS key names as isoCode
`COUNTRY_DEFAULTS` is keyed by country name (e.g. `"United States"`) not ISO alpha-2. The seed script must map these to ISO codes explicitly (hardcoded map or derive from the `currency` field). Do not use the map key as `iso_code` directly.

### KD-5 — pgvector embeddings deferred to Phase 2
Embedding columns exist in the schema (`vector(1536)`) but embedding generation and HNSW index creation are deferred until there is consumer code that queries by vector similarity. Phase 1 leaves embedding columns `null`.

## Foundation Already in Place

The research sub-agent scaffolded the DB layer during planning. These files exist, typecheck clean, and all CI checks pass (migration-guards ✓, schema-drift ✓, typecheck ✓):

| File | Status |
|---|---|
| `lib/db/src/schema/reference-data-tables.ts` | ✅ Complete — 4 tables with pgvector, indexes, FK |
| `lib/db/migrations/0045_cool_starfox.sql` | ✅ SQL generated, journal entry at idx=45 |
| `lib/db/src/schema/index.ts` | ✅ Exports 4 new tables |
| `artifacts/api-server/src/storage/reference-data.ts` | ✅ `ReferenceDataStorage` with upsert methods |
| `artifacts/api-server/src/storage/index.ts` | ✅ `ReferenceDataStorage` integrated |
| `artifacts/api-server/script/seed-reference-data.ts` | ⚠️ Scaffold exists — needs ISO-code mapping fix (KD-4) |
| `artifacts/api-server/src/ai/analyst-table-refresh.ts` | ⚠️ Stubs exist for all 4 functions — need real LLM implementations |
| `artifacts/api-server/src/routes/admin/knowledge-registry.ts` | ⚠️ Dispatch cases wired — stubs return placeholder data |

## Implementation Units

### IU-1 — Apply migration + seed baseline
**Files:** `lib/db/migrations/0045_cool_starfox.sql`, `artifacts/api-server/script/seed-reference-data.ts`, `lib/db/migrations/meta/_journal.json`

Apply `0045_cool_starfox.sql` to the Neon database via the project's migration runner. Fix the seed script's ISO-code mapping (KD-4): build an explicit `COUNTRY_NAME_TO_ISO` map (e.g. `"United States" → "US"`, `"Canada" → "CA"`) and use it when building geography rows. Run the seed to populate the baseline geography rows. Register a runtime migration guard for migration 0045 in `migration-guards.json`.

**Test scenarios:**
- Seed runs idempotently: running twice produces the same row count (upsert on `iso_code + level`)
- All 19 `COUNTRY_DEFAULTS` countries produce valid geography rows with correct ISO alpha-2 codes
- All 13 `US_STATE_DEFAULTS` states produce rows with `parent_country_code = "US"` and `level = "state"`
- check:migration-guards passes after guard registration

### IU-2 — Knowledge registry seed entries
**Files:** `artifacts/api-server/src/routes/admin/knowledge-registry.ts` or a dedicated seed script

Insert 4 rows into `knowledge_registry` (one per table) with `asset_type = "benchmark_table"`, `asset_ref` matching the dispatch map key, human-readable label, and a `renewal_mechanism` description. These entries make the tables visible in `AnalystTables.tsx` automatically via the existing `/api/admin/knowledge-registry` GET endpoint.

**Entry shape to follow:** Match existing benchmark_table entries already in the registry (reference_brands, capital_raise_benchmarks, exit_multiples).

**Test scenarios:**
- `GET /api/admin/knowledge-registry` returns all 4 new entries
- Each entry has `freshness: "missing"` before first Analyst run (no `last_refreshed_at`)
- Existing entries are unaffected

### IU-3 — LLM research recipe implementations
**Files:** `artifacts/api-server/src/ai/analyst-table-refresh.ts`

Replace the 4 stub functions with real LLM implementations following the `researchCapitalRaiseBenchmarks` pattern:

| Function | Sources to cite | Output shape |
|---|---|---|
| `researchGeographyDimension` | World Bank, UN Stats, ISO 3166 | array of `InsertGeographyDimension` rows |
| `researchJurisdictionalTaxes` | IRS, state tax authorities, municipal codes, AICPA | array of `InsertJurisdictionalTax` rows for top 20 US hospitality markets |
| `researchRegulatoryFees` | SBA.gov, state licensing boards, local municipal portals | array of `InsertRegulatoryFee` rows for top 20 markets |
| `researchMarketCapRates` | CBRE, JLL, STR, CoStar, Damodaran | array of `InsertMarketCapRate` rows with `as_of_date = today` |

Each function must: cite ≥ 3 independent sources; return a `narration` array (6–12 items) of present-tense research steps ("Consulting CBRE 2025 Cap Rate Survey…"); return `evidence[]`; implement a fallback that returns existing rows unchanged on LLM failure.

Use `research-reference-urls.ts` as the curated source reference — inject relevant URLs into the prompt so the LLM anchors to real sources rather than hallucinating.

**Test scenarios:**
- Each function returns valid typed rows parseable by `insertGeographyDimensionSchema` (etc.)
- LLM timeout / parse failure activates fallback — function does not throw
- Narration array is non-empty and ≤ 12 items
- Evidence array contains ≥ 3 entries on success path

### IU-4 — Knowledge registry dispatch — real implementations
**Files:** `artifacts/api-server/src/routes/admin/knowledge-registry.ts`

Replace stub dispatch cases (lines 207–221) with real calls to the IU-3 implementations. Follow the `reference_brands` auto-commit path:

```
researchFn(current) → { proposedRows, narration, sourceCount, evidence }
  → storage.upsert*(proposedRows)
  → finalizeAuditLog(success)
  → SSE: { event: "done", data: { autoCommitted: true, rowCount, narration, sourceCount, evidence } }
```

The SSE `run` event must stream narration items as they're ready (or replay them from the completed result). Do not open a diff dialog — `autoCommitted: true` signals the frontend to show a toast instead.

**Test scenarios:**
- `POST /api/admin/knowledge-registry/:id/regenerate` returns SSE stream for each of the 4 table IDs
- Concurrent requests to the same table ID return 409 (single-flight guard already in place)
- After successful run, `GET /api/admin/knowledge-registry` shows updated `last_refreshed_at` and `freshness: "fresh"`
- Audit log row created and finalized for each run

### IU-5 — Admin Sources UI — reference data entries
**Files:** `artifacts/hospitality-business-portal/src/components/admin/intelligence/AnalystTables.tsx`

The 4 new knowledge_registry entries render automatically in the existing `AnalystTables` component once IU-2 seeds them. However, these tables have a different data shape than benchmark ranges (they produce rows, not low/mid/high ranges). The component's `TableRow.ranges` array will be empty for reference data tables.

Extend `AnalystTables.tsx` to handle reference data table display:
- When `ranges` is empty and the row is a reference data table (detect by `id` prefix or a new `tableKind` field from the API), render a row-count summary instead of the ranges grid
- The `AnalystButton` renders identically — `suffix="Regenerate"`, `freshnessStatus` from the freshness field, no diff dialog on response (`autoCommitted: true` → toast only)
- Row count comes from a new field in the API response: `rowCount?: number` added to `TableRow`

**Design standards to follow:**
- IBM Plex Sans / Inter / JetBrains Mono font system (existing in the component)
- Earth-tone palette, 8px grid, `Card` + `CardContent` layout (matches existing rows)
- Freshness dot: green (< 7 days), yellow (7–30 days), red (> 30 days or missing)
- Relative timestamp with ISO hover (`"3 days ago"` → hover shows `2026-05-06T14:23:00Z`)
- `data-testid="reference-data-table-{id}"` on each row

**Test scenarios:**
- 4 new entries visible in Admin → Sources (or Intelligence → Tables depending on nav placement)
- Before first Analyst run: freshness dot is red, row count shows "No data yet"
- After Analyst run: freshness dot is green, row count shows actual count
- `AnalystButton` disabled while SSE is in flight (single-flight guard)
- Toast appears on auto-commit completion — no diff dialog

## Test Scenarios (cross-cutting)

- **check:migration-guards** passes with migration 0045 guard registered
- **check:schema-drift** passes (schema file matches migration SQL)
- **check:typecheck** passes (all 4 new import paths resolve cleanly)
- **check:magic-numbers** passes (no raw numeric literals in research functions — use named constants for source counts, staleness thresholds)
- Seed is idempotent across 3 consecutive runs

## Deferred to Follow-Up Work

- HNSW index on embedding columns + vector similarity search endpoints (KD-5)
- Expanding geography coverage to all 50 US states (Analyst button will add them on first real run)
- Automated scheduled refresh via ambient minion
- Admin row-level CRUD editor for these tables
- Exporting reference data as CSV from Admin UI

## Patterns to Follow

| What | Where |
|---|---|
| Auto-commit SSE pattern | `researchReferenceBrands` in `artifacts/api-server/src/ai/analyst-table-refresh.ts` |
| Knowledge registry dispatch | Lines 379–404 in `artifacts/api-server/src/routes/admin/knowledge-registry.ts` |
| Analyst button usage | `artifacts/hospitality-business-portal/src/components/intelligence/AnalystButton.tsx` |
| AnalystTables row rendering | `artifacts/hospitality-business-portal/src/components/admin/intelligence/AnalystTables.tsx` |
| N+1 evidence rule + narration shape | `researchCapitalRaiseBenchmarks` in `analyst-table-refresh.ts` |
| Upsert with `ON CONFLICT` | `ReferenceDataStorage.upsertGeography` in `artifacts/api-server/src/storage/reference-data.ts` |
| Research reference URLs | `artifacts/api-server/src/data/research-reference-urls.ts` |
| Migration guard registration | `artifacts/api-server/src/migrations/migration-guards.json` |

## Risks

| Risk | Mitigation |
|---|---|
| LLM hallucinates tax rates / cap rates | N+1 evidence rule; inject curated source URLs into prompts; admin can re-run if output looks wrong |
| Seed script ISO mapping is wrong for some countries | Build explicit `COUNTRY_NAME_TO_ISO` map from ISO 3166-1; add assertion that every row has a 2-char `iso_code` |
| Migration applied out of order on existing DB | Use the project's `migrate()` runner, not raw `psql`; verify journal sync after apply |
| SSE auto-commit silently fails mid-stream | Audit log `status: pending` survives crash; admin can inspect audit log for failed runs |
