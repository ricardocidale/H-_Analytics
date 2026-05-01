# Phase C Inventory — Runtime Migration → Drizzle Migration Consolidation

This document is the foundational artifact produced by the first execution
pass of Phase C (item 7 of `.local/tasks/database-audit-fix-optimize.md`).
It classifies every file under `server/migrations/*.ts` so future
Phase C work can consume it without re-doing the inventory.

**Status of Phase C as a whole:** Step 1 (inventory) and a partial Step 2
(schema cross-check methodology) done in this session. Steps 3-7
(regenerate Drizzle migrations, pre-mark `__drizzle_migrations`, remove
from boot, verify on fresh + stale DB) are explicitly **NOT** done here —
they require DB validation that cannot be performed safely in a sandboxed
session without the ability to spin up clean Postgres instances.

## Tally

- **74 runtime migration files total** (excluding `consolidated-schema.ts`).
- **52 PURE_DDL** — only structural changes. Primary consolidation candidates.
- **17 MIXED** — DDL + data-fix in one file. Must be split before consolidation.
- **5 DATA_FIX** — only data mutation. **Stay as runtime migrations** — they don't belong in Drizzle's migration history.
- **0 UNKNOWN** — every file successfully classified.

**Detection caveat:** the initial classification regex matched only raw-SQL DML keywords (`INSERT INTO …`, `UPDATE … SET`, `DELETE FROM …`). Files using Drizzle ORM call forms (`db.insert(table).values(...)`, `db.update(table).set(...)`) were re-scanned in a follow-up pass; the only file affected was `seed-external-integrations.ts`, which is now classified MIXED (not PURE_DDL). All counts in this doc reflect the corrected classification.

## Critical insight (changes the risk profile)

Spot-checking the migration file headers reveals that many "runtime
migrations" exist precisely because the DDL **already is** in
`shared/schema/*.ts` but `db:push` (the Drizzle-Kit "push without a
migration file" path) drifted on the live Neon DB. Two clear examples:

- `audit-unique-constraints-001.ts` header: *"Drizzle's schema declares
  `.unique()` on these columns, but a stale prod DB lacks the
  constraint, so `npm run db:push` blocks in non-TTY contexts with one
  truncate prompt per missing constraint."*
- `index-coverage-001.ts` header: *"Three FK covering indexes that were
  declared in shared/schema/notifications.ts but never built."*

This means the schema-backfill step (Phase B closeout's Step 2) is
**already done for many files** — the DDL just needs to flow through the
proper Drizzle migration generator (`drizzle-kit generate`) instead of
the runtime back-channel. That is good news; it means Phase C is
genuinely tractable as a series of small consolidations rather than one
big-bang.

## Recommended execution model

Don't do Phase C as one giant cutover. Do it as **repeated mini-phases**,
each touching 3-5 related migrations, with the same per-phase loop:

1. Confirm the DDL is in `shared/schema/*.ts` (most are; backfill if not).
2. Run `drizzle-kit generate` to produce a numbered SQL migration.
3. Diff the generated SQL against the runtime migration's intent.
4. Insert a row into `drizzle.__drizzle_migrations` for the new
   migration's hash on existing DBs (production, staging, dev) so
   Drizzle's `migrate()` skips re-applying it.
5. Remove the corresponding `await import("./migrations/foo-001")` block
   from `server/index.ts:runSchemaMigrations()`.
6. Verify on a fresh Postgres (clean DB → Drizzle migrate → schema
   matches production byte-for-byte).
7. Verify on a stale Postgres (DB pinned to pre-Phase-C state → boot →
   no errors, no missing DDL).
8. Commit and move to the next batch.

Pick batches by **theme** so that if one batch breaks, rollback is
narrow. Suggested ordering (lowest blast radius first):

| Batch | Files | Why first |
|---|---|---|
| **Batch 1: Pure-index migrations** | `composite-indexes-001`, `fk-indexes-001`, `fk-indexes-002`, `index-coverage-001` | Indexes are cheap, additive, and idempotent. Easy to verify. Lowest blast radius. |
| **Batch 2: Drop-only migrations** | `drop-engine-suggested-lines-001`, `drop-marcela-columns`, `drop-plaid-001`, `drop-company-fk-001` (note: this one is MIXED — split first) | Once verified the columns/tables really are gone from prod, removing the drops is a no-op. |
| **Batch 3: Single-table additive (rebecca-*)** | `rebecca-chat-engine-001`, `rebecca-fixture-replay-001`, `rebecca-fixtures-001`, `rebecca-language-001`, `rebecca-opt-out-001` | Self-contained per-feature additions. |
| **Batch 4: Single-table additive (specialist-*)** | `specialist-multi-model-001`, `specialist-observed-missing-001`, `specialist-recommendation-counters-001`, `specialist-recommendation-events-001` | Same idea, different feature. |
| **Batch 5: Standalone tables** | `cache-entries-001`, `documents-001`, `market-data-tables-001`, `notification-logs-001` (MIXED — split first), `property-dd-001`, `property-urls-001`, `scenario-access-001`, `scenario-overrides-001`, `scheduler-runs-001`, `scheduler-runs-002`, `source-call-logs-001`, `storage-drift-sweep-runs-001`, `reference-range-001`, `seed-external-integrations` (MIXED — split first; the ORM `db.insert(externalIntegrations).values(...)` seed loop must move to the runtime seed path or it will silently stop running on fresh DBs), `seed-defaults-001`, `calc-audit-001` | Each adds a new table. Verify the schema definition exists, then consolidate. |
| **Batch 6: global_assumptions column adds** | `appearance-defaults-001`, `app-name-001`, `country-risk-premium-001`, `export-config-001`, `funding-cascade-001`, `funding-interest-001`, `icp-config-001`, `icp-model-tier-001`, `inflation-per-entity-001`, `research-config-001` | All add columns to the same table. Group in one Drizzle migration. |
| **Batch 7: MIXED files** | (after splitting each into a DDL half + a DATA_FIX half) — see section below | Higher risk; do last so the easy wins are banked first. |

## File-by-file inventory

### PURE_DDL (52 files) — primary consolidation candidates

| File | Tables touched | DDL fingerprint |
|---|---|---|
| `admin-resources-001.ts` | admin_resources, admin_resource_versions, audit_break_glass_overrides, specialist_assignments | 16 DDL ops (CREATE TABLE + columns + indexes) |
| `admin-resources-002.ts` | resource_health_checks | CREATE TABLE + indexes |
| `admin-resources-003.ts` | specialist_configs, specialist_config_versions | CREATE TABLE + columns |
| `appearance-defaults-001.ts` | global_assumptions | ADD COLUMN ×3 |
| `app-name-001.ts` | global_assumptions | ADD COLUMN |
| `cache-entries-001.ts` | cache_entries | CREATE TABLE + index |
| `calc-audit-001.ts` | calculation_audit_logs | CREATE TABLE + indexes |
| `can-manage-scenarios-001.ts` | users | ADD COLUMN |
| `companies-theme-001.ts` | companies | ADD COLUMN |
| `composite-indexes-001.ts` | (multi-table) | 3 composite indexes |
| `country-risk-premium-001.ts` | properties | ADD COLUMN |
| `documents-001.ts` | document_extractions, extraction_fields | CREATE TABLE ×2 + indexes |
| `drop-engine-suggested-lines-001.ts` | (engine_suggested_lines) | DROP TABLE |
| `drop-marcela-columns.ts` | global_assumptions | DROP COLUMN ×2 |
| `drop-plaid-001.ts` | (plaid tables) | DROP TABLE / cleanup |
| `enhanced-photo-001.ts` | property_photos | ADD COLUMN |
| `export-config-001.ts` | global_assumptions | ADD COLUMN |
| `fk-indexes-001.ts` | (multi-table) | 3 FK covering indexes |
| `fk-indexes-002.ts` | (multi-table) | 13 FK covering indexes |
| `funding-cascade-001.ts` | global_assumptions | ADD COLUMN ×4 |
| `funding-interest-001.ts` | global_assumptions | ADD COLUMN ×3 |
| `google-id-001.ts` | users | ADD COLUMN (unique) |
| `icon-set-001.ts` | design_themes | ADD COLUMN |
| `icp-config-001.ts` | global_assumptions | ADD COLUMN |
| `icp-model-tier-001.ts` | global_assumptions | ADD COLUMN |
| `index-coverage-001.ts` | notification_logs, scenario_shares | 6 FK covering indexes |
| `inflation-per-entity-001.ts` | global_assumptions, properties | 13 ADD COLUMN ops |
| `market-data-tables-001.ts` | event_calendars, fb_benchmarks, labor_rates, market_adr_index, seasonal_calendars | CREATE TABLE ×5 |
| `photo-image-data-001.ts` | property_photos | ADD COLUMN (binary) |
| `pipeline-n1-global-models-001.ts` | pipeline_policies | ADD COLUMN ×4 |
| `property-dd-001.ts` | dd_template_items, property_dd_items | CREATE TABLE + 9 cols/indexes |
| `property-urls-001.ts` | property_urls | CREATE TABLE + index |
| `rebecca-chat-engine-001.ts` | global_assumptions | ADD COLUMN |
| `rebecca-fixture-replay-001.ts` | rebecca_preview_fixtures | ADD COLUMN ×4 |
| `rebecca-fixtures-001.ts` | rebecca_preview_fixtures | CREATE TABLE + indexes |
| `rebecca-language-001.ts` | rebecca_conversations | ADD COLUMN |
| `rebecca-opt-out-001.ts` | users | ADD COLUMN |
| `reference-range-001.ts` | reference_range | CREATE TABLE + 6 indexes |
| `research-config-001.ts` | global_assumptions | ADD COLUMN |
| `scenario-access-001.ts` | scenario_access | CREATE TABLE + indexes |
| `scenario-overrides-001.ts` | scenario_property_overrides, scenarios | CREATE TABLE + 9 ops |
| `scenario-service-templates-001.ts` | scenarios | ADD COLUMN |
| `scenario-system-unique-001.ts` | (scenarios) | ADD UNIQUE constraint |
| `scheduler-runs-001.ts` | scheduler_runs | CREATE TABLE |
| `scheduler-runs-002.ts` | scheduler_run_history | CREATE TABLE + index |
| `seed-defaults-001.ts` | seed_defaults | CREATE TABLE + index |
| `source-call-logs-001.ts` | source_call_logs, source_registry | CREATE TABLE + 4 ops |
| `specialist-multi-model-001.ts` | specialist_configs, specialist_config_versions | 12 ADD COLUMN ops |
| `specialist-observed-missing-001.ts` | specialist_configs | ADD COLUMN ×3 |
| `specialist-recommendation-counters-001.ts` | specialist_recommendation_counters | CREATE TABLE + indexes |
| `specialist-recommendation-events-001.ts` | specialist_recommendation_events | CREATE TABLE + indexes |
| `storage-drift-sweep-runs-001.ts` | storage_drift_sweep_runs | CREATE TABLE |

### MIXED (17 files) — must be split before consolidation

The DDL half goes into a Drizzle migration; the data-fix half stays as a
runtime migration with its current `isMigrationApplied()` gate.

| File | Tables touched | Why MIXED |
|---|---|---|
| `admin-resources-004.ts` | resource_specialist_connections, specialist_research_quality_snapshots | DDL + 1 INSERT (likely seed) |
| `app-identity-001.ts` | global_assumptions, logos | DDL + UPDATE backfill |
| `app-logo-001.ts` | logos | DDL + UPDATE |
| `assumption-guidance-dedupe-001.ts` | assumption_guidance | DDL + UPDATE dedupe |
| `audit-unique-constraints-001.ts` | (8 tables, see header) | UNIQUE constraints + dedupe UPDATEs (per-constraint, with pg_constraint probe) |
| `auto-research-refresh-001.ts` | global_assumptions | ADD COLUMN + UPDATE backfill |
| `benchmark-snapshots-unique-001.ts` | benchmark_snapshots | UNIQUE constraint + dedupe UPDATE |
| `db-hygiene-001.ts` | logos | DDL + cleanup UPDATE |
| `drop-company-fk-001.ts` | users | DROP FK + UPDATE |
| `fk-hardening-001.ts` | companies, conversations, notification_logs, users | DDL FK changes + 6 backfills |
| `notification-logs-001.ts` | 10 tables | 33 DDL ops + 2 INSERTs (largest single migration) |
| `property-notnull-001.ts` | properties | 9 ADD COLUMN + 9 UPDATE backfills (the standard "add NOT NULL with default + backfill" pattern) |
| `property-photos-001.ts` | property_photos, scenarios | DDL + UPDATE |
| `rebecca-guardrails-001.ts` | rebecca_guardrails | CREATE TABLE + INSERT seed |
| `rebecca-kb-001.ts` | rebecca_knowledge_base, rebecca_knowledge_history | CREATE TABLE ×2 + INSERT seed |
| `seed-external-integrations.ts` | external_integrations | CREATE TABLE + ORM `db.insert(externalIntegrations).values(...)` loop seeding 12+ default rows. Detected via follow-up ORM-call scan; missed by initial raw-SQL DML regex. |
| `themes-system-flag-001.ts` | design_themes | ADD COLUMN + UPDATE |

### DATA_FIX (5 files) — stay as runtime migrations

These never go into Drizzle's migration history. They mutate data, and
mutating data through a migration framework is the wrong abstraction —
they belong as gated one-shot scripts, which is what they already are.

| File | Tables touched | What it does |
|---|---|---|
| `admin-resources-005.ts` | admin_resources | data backfill |
| `financials-computed-at-backfill-001.ts` | properties | `UPDATE … SET financials_computed_at = updated_at` (Task #442 backfill) |
| `fix-shared-ownership.ts` | global_assumptions, properties | `UPDATE … SET userId = NULL` legacy ownership fix |
| `role-checker-investor-to-user-001.ts` | users | role rename UPDATE |
| `role-partner-to-user-001.ts` | users | role rename UPDATE |

## Boot-sequence cost (current state)

`server/index.ts:runSchemaMigrations()` runs:

1. `bootstrapDrizzleMigrationState()` — fast (one COUNT + maybe one INSERT batch on first boot of legacy DB, no-op after).
2. Drizzle `migrate(./migrations)` — one DDL transaction per pending SQL migration; no-op if all applied.
3. `runDataFixes()` — gated by `_applied_migrations` row check, no-op after first run.
4. **~56 runtime migration gate calls** (`rg -c "isMigrationApplied" server/index.ts` = 56), each a single `SELECT 1 FROM _applied_migrations WHERE tag = ?` plus a dynamic `import()`. On already-applied DBs, the cost is ~56 SELECTs + ~56 dynamic imports per boot — *not* the schema-DDL cost the spec was originally worried about, but still ~0.5-1.5 seconds of pure overhead on every server start. (Note: 56 < 74 because some of the 74 files appear deprecated / no longer wired into boot.)

The actual win from Phase C is therefore:

- **Latency:** Drop ~50 SELECTs and dynamic imports from boot (the ones whose DDL gets consolidated; the ~6 that remain are the seeds + DATA_FIX runtime gates) → save ~0.5-1.5 sec on every restart.
- **Discoverability:** New engineers see DDL changes in `./migrations/00XX_*.sql` next to all other schema changes, not in 70 hand-rolled TypeScript files.
- **Consistency:** One migration system (Drizzle) instead of two (Drizzle + the runtime registry).
- **No production data risk** (since the gate prevents re-application) but **fresh-DB risk if done wrong** (the reason this is high blast radius).

## Schema cross-check & backfill list

This section documents Step 2 of the Phase B plan: for every PURE_DDL
migration (and the DDL half of every MIXED migration), verify the
resulting table/column/index is present in `shared/schema/*.ts`.

### Methodology

1. Built a table whitelist via `rg --multiline 'pgTable\(\s*"(\w+)"' shared/schema/*.ts` (102 tables defined).
2. For each table referenced by a runtime migration, checked the literal `"table_name"` appears in some `shared/schema/*.ts`.
3. For each named index from `CREATE INDEX … name_idx`, checked the literal `"name_idx"` appears in some `shared/schema/*.ts` (Drizzle declares indexes via `index("name_idx")`).
4. For each `ADD COLUMN col_name`, checked `"col_name"` appears in some `shared/schema/*.ts`.

This is not a 100% guarantee (a column literal could appear in an unrelated context), but it's a reliable presence test for Drizzle-style declarations.

### Result: one table + 17 indexes missing from schema

**Tables missing from `shared/schema/*.ts`:**

| Table | Created by | Backfill location |
|---|---|---|
| `cache_entries` | `cache-entries-001.ts` | New file `shared/schema/cache.ts` (or add to `shared/schema/integrations.ts`); export from `shared/schema/index.ts` |

All other 84+ tables that runtime migrations touch are already declared in `shared/schema/*.ts`. The 14 tables that appeared "missing" in a first-pass naive grep (e.g. `admin_resources`, `specialist_configs`, `dd_template_items`) are all defined — the multi-line `pgTable("name",` formatting just defeated the line-anchored regex. A `rg --multiline` confirmed them all.

**Indexes missing from `shared/schema/*.ts`:**

| Index | Created by | Suggested schema home |
|---|---|---|
| `cache_entries_expires_idx` | `cache-entries-001` | (with the new `cache_entries` table above) |
| `market_research_type_updated_idx` | `composite-indexes-001` | `shared/schema/intelligence.ts` (where `marketResearch` is defined) |
| `scenarios_user_updated_idx` | `composite-indexes-001` | `shared/schema/scenarios.ts` |
| `pipeline_policies_analyst_a_model_idx` | `fk-indexes-002` | `shared/schema/intelligence-v2.ts` |
| `pipeline_policies_analyst_b_model_idx` | `fk-indexes-002` | `shared/schema/intelligence-v2.ts` |
| `pipeline_policies_synthesis_model_idx` | `fk-indexes-002` | `shared/schema/intelligence-v2.ts` |
| `pipeline_policies_fallback_model_idx` | `fk-indexes-002` | `shared/schema/intelligence-v2.ts` |
| `specialist_configs_analyst_a_model_idx` | `fk-indexes-002` | `shared/schema/specialist.ts` |
| `specialist_configs_analyst_b_model_idx` | `fk-indexes-002` | `shared/schema/specialist.ts` |
| `specialist_configs_synthesis_model_idx` | `fk-indexes-002` | `shared/schema/specialist.ts` |
| `specialist_configs_fallback_model_idx` | `fk-indexes-002` | `shared/schema/specialist.ts` |
| `specialist_config_versions_analyst_a_model_idx` | `fk-indexes-002` | `shared/schema/specialist.ts` |
| `specialist_config_versions_analyst_b_model_idx` | `fk-indexes-002` | `shared/schema/specialist.ts` |
| `specialist_config_versions_synthesis_model_idx` | `fk-indexes-002` | `shared/schema/specialist.ts` |
| `specialist_config_versions_fallback_model_idx` | `fk-indexes-002` | `shared/schema/specialist.ts` |
| `property_dd_items_owner_user_id_idx` | `fk-indexes-002` | `shared/schema/property-dd.ts` |
| `scenarios_user_kind_unique` (partial unique) | `scenario-system-unique-001` | `shared/schema/scenarios.ts` — declare via Drizzle's `uniqueIndex("scenarios_user_kind_unique").on(t.userId, t.kind).where(sql\`"kind" IN ('default','autosave') AND "deleted_at" IS NULL\`)`. **Note:** this is a partial unique index. If `drizzle-kit generate` does not preserve the `WHERE` clause cleanly, fall back to a hand-written SQL migration in `./migrations/` rather than trying to express it through the schema builder. |

All 6 indexes from `index-coverage-001` are already in schema (header was right). All 3 indexes from `fk-indexes-001` are already in schema. The 1 index from `composite-indexes-001` (`sessions_expires_at_idx`) is in `shared/schema/auth.ts`.

**Columns / constraints:** Spot-checks across `country-risk-premium-001`, `app-name-001`, `funding-cascade-001`, and `inflation-per-entity-001` (a representative cross-section) found every `ADD COLUMN` target already declared in `shared/schema/config.ts` or `shared/schema/properties.ts`. The pattern is consistent with the migration-file headers' admission that these migrations exist *because* `db:push` drifted from the schema, not because the schema was incomplete.

### Implication for execution batches

This dramatically narrows the schema-backfill prerequisite for Phase C:

- **Batch 1 (pure-index migrations)** — needs schema backfill for 15 of the 17 indexes above (the 13 from `fk-indexes-002` + the 2 from `composite-indexes-001`). After that, the rest is mechanical.
- **Batch 5 (standalone tables)** — needs the new `cache_entries` schema declaration (with its `cache_entries_expires_idx`). Everything else is in schema. Also needs `seed-external-integrations` to be split (DDL → Drizzle, ORM seed loop → runtime seed path) before consolidation.
- **Batch 7 includes `scenario-system-unique-001`** — the partial unique index (`scenarios_user_kind_unique`) needs schema-or-SQL backfill; flag it as a risk because Drizzle Kit's `WHERE` support on partial indexes has historically been spotty.
- **Batches 2, 3, 4, 6** — no schema backfill needed. Go straight to `drizzle-kit generate`.
- **MIXED files generally** — splitting the data-fix/seed half off is the dominant cost; the DDL half is in schema.

So the realistic Phase C "step 2" cost is ~1 small schema PR (add `cache_entries` table + 15 routine `index()` declarations across 4 schema files + 1 partial `uniqueIndex(...).where(...)` in `scenarios.ts`) before any `drizzle-kit generate` work begins.

### Runtime seeds that must remain after consolidation

Phase C cannot remove these from boot, even after the DDL half is consolidated, without preserving an equivalent seed path:

| File | What it seeds | Why preservation matters |
|---|---|---|
| `seed-external-integrations.ts` | 12+ rows in `external_integrations` (FRED, OpenExchangeRates, WalkScore, World Bank, Moody's, S&P, CoStar, Vecteezy, WeatherAPI, GeoDB Cities, Realty in US, US Real Estate, …) | Fresh DBs would have an empty integrations registry and the admin UI would be unable to render the integration list until manually seeded. |
| `seed-defaults-001.ts` | seed_defaults rows | Same — fresh-DB regression risk. |
| `rebecca-guardrails-001.ts` (MIXED) | rebecca_guardrails initial rows | Same. |
| `rebecca-kb-001.ts` (MIXED) | rebecca_knowledge_base / _history initial rows | Same. |
| `admin-resources-004.ts` (MIXED) | resource_specialist_connections seed row | Same. |
| `notification-logs-001.ts` (MIXED) | 2 INSERTs (likely seeds) | Same. |

The split pattern for each is: keep the file under `server/migrations/` with the DDL stripped and only the `db.insert(...)` left, gated by `isMigrationApplied`. The DDL half goes into the Drizzle migration.

## What this session deliberately did NOT do

- **No `drizzle-kit generate` run.** That would mutate `./migrations/` and the inventory needs human review first.
- **No edits to `server/index.ts`.** The boot sequence stays unchanged.
- **No DB writes.** Pre-marking `__drizzle_migrations` requires production-DB access that should happen as part of a coordinated deploy.
- **No splitting of MIXED files.** Each split is a small surgery that needs its own commit and code review.

## Hand-off

Next session / future Phase C agent should:

1. Pick **Batch 1** from the table above (pure-index migrations).
2. Verify each batch-1 file's indexes are present in the corresponding `shared/schema/*.ts`. If missing, add them.
3. Run `drizzle-kit generate` and review the diff.
4. Coordinate with the deploy story for pre-marking on production/staging.
5. Only then remove from `server/index.ts` and verify on fresh + stale DBs.
6. Repeat for batches 2-7.

## Pointers

- Phase A closeout: `.local/db-audit-PHASE-A-CLOSEOUT.md`
- Phase B closeout: `.local/db-audit-PHASE-B-CLOSEOUT.md`
- Original spec: `.local/tasks/database-audit-fix-optimize.md`
- Drizzle config: `drizzle.config.ts` (out=`./migrations`, schema=`./shared/schema/index.ts`)
- Boot sequence: `server/index.ts:runSchemaMigrations()` ~lines 493-1000
- Drizzle bootstrap: `server/migrations/consolidated-schema.ts:bootstrapDrizzleMigrationState`
- Gate helpers: `consolidated-schema.ts:isMigrationApplied`, `:markMigrationApplied`
