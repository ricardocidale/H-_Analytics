---
title: "feat: STR Specialist (Beatriz) + Pietro OTA Rate Minions"
type: feat
status: active
date: 2026-05-13
---

# STR Specialist (Beatriz) + Pietro OTA Rate Minions

## Summary

Add Beatriz — a new HTTP-on-demand specialist agent for H+ ultra-luxury STR properties — covering two launch scopes: `channel-mix` (OTA channel allocation recommendations per property) and `ultra-luxury-segmentation` (ADR/occupancy/RevPAR benchmarks for the $1,500–$30,000/night market segment). Simultaneously add two deterministic Pietro minions — Teo (Airbnb) and Nilo (VRBO) — that periodically refresh OTA commission rates in the existing `brand_fees` table. Plum Guide and Onefinestay commission rates are static-only: Plum Guide is already seeded by plan 006; this plan adds a `channel_onefinestay` row (~50% revshare) to `brand_fees`. Beatriz reads commission rates directly from `brand_fees` — no separate `ota_channel_rates` table.

**Cross-plan dependency:** Requires plan 006 U2 (`brand_fees` table) to land first.

---

## Problem Frame

H+ is reclassifying Medellin Duplex as an ultra-luxury STR and expects more STR properties in this tier ($1,500–$30,000/night). STR properties have a structurally different fee model than hotel flags: OTA channel commissions (Airbnb 15.5%, VRBO 8%, Plum Guide 16.5%, Onefinestay ~50%) and channel-mix allocation drive economics in a way that the existing hotel-oriented specialist roster doesn't cover.

There is no H+ specialist today that:
- Recommends how to split bookings across Airbnb / VRBO / Plum Guide / Onefinestay for an ultra-luxury STR
- Provides comp-set ADR/occupancy benchmarks for the $1,500–$30,000/night market (deferred scope, see below)
- Flags when OTA commission rates in `brand_fees` are stale (Pietro minions cover this)

The specialist design contract from `docs/solutions/conventions/hplus-specialist-design-discipline-from-ce-researchers-2026-05-13.md` applies in full.

---

## Requirements

- R1. Beatriz provides channel-mix recommendations per property: recommended OTA allocation (% through Airbnb / VRBO / Plum Guide / Onefinestay) with conviction labels and source attribution.
- R2. Beatriz provides ultra-luxury STR market segmentation: ADR/occupancy/RevPAR benchmarks for the $1,500–$30,000/night comp tier, with conviction calibration and outlier flagging.
- R3. Beatriz is HTTP-invoked, stateless, streams structured text findings to the caller — never writes to `admin_resources` or `properties` (Pattern #13).
- R4. Beatriz pre-filters `brand_fees` commission rows by channel slug before any external query (Pattern #4).
- R5. Beatriz conviction labels carry explicit calibration thresholds: `high` = ≥3 independent sources within ±15%; `moderate` = 2 sources within ±25%; `low` = 1 source or wide spread (Pattern #10).
- R6. Beatriz flags deviations between user-supplied assumptions and sourced benchmarks — "user occ 65%; STR ultra-luxury Q4 median 58% (delta −7pp)" (Pattern #17).
- R7. Beatriz returns "no STR comp signal for [market] / [tier]" rather than substituting hardcoded fallback values (Pattern #7).
- R8. Teo (Airbnb) and Nilo (VRBO) are deterministic HTML-scraper minions — no LLM, no judgment. They upsert `brand_fees` rows; return `MinionResult` with `rowsUpserted=0` on fetch failure (no TS literal fallbacks).
- R9. OTA help-center URLs (used by Teo and Nilo) are stored as `admin_resources.config.url` — not hardcoded TypeScript string literals (CLAUDE.md §1 integration identifier rule).
- R10. Plum Guide (Sandro) and Onefinestay (Rino) have no live-fetch minions; their rates are bootstrap-seeded SQL rows in `brand_fees`.
- R11. All five names (Beatriz, Teo, Nilo, Sandro, Rino) follow CLAUDE.md §10 Brazilian/Italian naming convention.
- R12. `comp-range` and `fee-cascade-validation` scopes are deferred — no data source for comp-range; `fee-cascade-validation` depends on plan 006 completing.

---

## Scope Boundaries

**In scope:**
- Beatriz specialist runner + dispatch route + system prompt
- Beatriz SPECIALIST_CATALOG entry (letter R)
- Teo (Airbnb) and Nilo (VRBO) minion TS files + MINION_REGISTRY entries
- `channel_onefinestay` seed row in `brand_fees` migration SQL
- admin_resources rows: Beatriz (specialist config), Teo + Nilo (MINION_REGISTRY slug config with `pietroTtlDays` + `config.url`)

**Deferred — separate plan or trailing PR:**
- `comp-range` scope: Beatriz needs AirDNA, PriceLabs, or Wheelhouse feed — no budget or contract yet
- `fee-cascade-validation` scope: depends on plan 006 `brand_fees` + cascade fully verified
- Dynamic pricing platform integration (PriceLabs/Beyond/Wheelhouse) recommendation engine
- UI surface: specialist badge, AnalystRangeIndicator for channel-mix output (trail-on after runner ships)
- Sandro (Plum Guide): no TS file needed; plan 006 already seeds `channel_plum_guide 16.5%`

---

## Context & Research

### Existing specialist pattern

`artifacts/api-server/src/ai/specialists/property-risk-intelligence-runner.ts` is the canonical runner reference: N+1 pipeline (prompt engineer → parallel vendor dispatch → convergence → synthesis → quality regress). Invoked via HTTP at `artifacts/api-server/src/routes/analyst-admin-dispatch.ts` (also `analyst-admin-runners-portfolio.ts`). Returns streamed structured text. No background scheduling.

### Existing minion pattern

`artifacts/api-server/src/ai/ambient/pietro-scheduler.ts` — `MINION_REGISTRY` maps slug strings to async imports. Pietro runs on a 60-minute tick; per-row `config.pietroTtlDays` gates staleness. New entries: `"airbnb-rates"` → Teo, `"vrbo-rates"` → Nilo. Pietro iterates only admin_resources rows whose slug is present in `MINION_REGISTRY` — the admin_resources row is the dispatch trigger.

### SPECIALIST_CATALOG

`lib/engine/src/analyst/registry/specialist-catalog.ts` — 17 existing specialists, letters A–Q. Beatriz = letter R. Catalog materialized into `specialist_assignments` DB table at boot via `artifacts/api-server/src/jobs/catalog-sync.ts`. No runtime alternative to adding the catalog entry.

### brand_fees (plan 006 U2)

`brand_fees` table already seeds: `channel_airbnb 15.5%`, `channel_vrbo 8%`, `channel_booking 15%`, `channel_plum_guide 16.5%` under the H+ STR Ultra-Luxury flag. Each row carries `source_url` + `last_checked`. Plan 006 explicitly excluded Onefinestay ("different counterparty type") — that exclusion is overridden here given the $1,500–$30,000/night market scope where Onefinestay is non-optional. This plan adds `channel_onefinestay` to the same seed, with a cross-plan coordination note.

### Pattern compliance

Spec: `docs/solutions/conventions/hplus-specialist-design-discipline-from-ce-researchers-2026-05-13.md`. Minimum viable contract for Beatriz: patterns #4 (pre-filter), #7 (stop on empty), #10 (conviction labels), #13 (idempotent output). Also required: #2 (scope switches), #6 (4+6 query cap), #8 (named sections), #11 (source attribution), #17 (conflict flagging).

---

## Key Technical Decisions

1. **HTTP-on-demand for Beatriz, not background scheduling.** CLAUDE.md §10 bars LLM-calling minions from `MINION_REGISTRY`. Pattern #13 bars writes to `admin_resources`/`properties`. The intersection leaves HTTP invocation as the only shape that satisfies both constraints without a new `str_specialist_findings` schema unit. Matches `property-risk-intelligence-runner.ts` precedent. Add caching in a follow-up plan if latency is measured as a problem.

2. **Beatriz reads `brand_fees` directly — no `ota_channel_rates` table.** Plan 006 already seeds the OTA commission rows. Splitting into two tables with identical data creates ownership ambiguity. Teo/Nilo upsert the same rows they refresh; Beatriz reads them pre-query.

3. **Teo + Nilo are MINION_REGISTRY entries (deterministic).** They fetch HTML help-center pages, parse the current commission table, and upsert one `brand_fees` row each. No LLM. `Promise.allSettled` + `AbortSignal.timeout(8_000)` required. On parse failure: `MinionResult { rowsUpserted: 0 }` — no TS fallback literals.

4. **OTA help-center URLs in admin_resources config.** CLAUDE.md §1 integration identifier rule: endpoint URLs may not be TypeScript string literals. Teo + Nilo read `admin_resources.config.url` at runtime. Operator can update the URL without a deploy.

5. **Onefinestay overrides plan 006 scope boundary.** Plan 006 excluded Onefinestay as a "different counterparty type." The $1,500–$30,000/night ultra-luxury STR market context makes Onefinestay non-optional for Beatriz's segmentation scope. This plan adds `channel_onefinestay` to `brand_fees` seed and documents the override rationale explicitly.

6. **Sandro (Plum Guide) requires no TS file.** Plan 006 U2 already seeds `channel_plum_guide 16.5%`. Sandro is documentation-only: the plan notes the name, rate provenance, and the fact that no live-fetch minion exists. An operator-visible admin_resources row (kind=`config`, slug=`sandro-plum-guide-rates`) is recommended to surface last-checked date in the admin UI, but is not blocking.

---

## Implementation Units

### Phase 1: Data Layer + Catalog (prerequisite: plan 006 U2 landed)

- U1. **Migration SQL — extend brand_fees seed + admin_resources rows**

  **Goal:** Add `channel_onefinestay` to `brand_fees` for the H+ STR Ultra-Luxury flag. Add admin_resources config rows for Teo, Nilo, and Beatriz so Pietro and the specialist dispatcher can find their configs at runtime.

  **Requirements:** R8, R9, R10, R11

  **Dependencies:** Cross-plan prerequisite — plan 006 U2 (`brand_fees` table must exist before this migration runs).

  **Cross-plan note:** This migration must run AFTER plan 006's `brand_fees` table creation migration. Slot number must be higher than plan 006's migration slot.

  **Files:**
  - Create: `lib/db/migrations/NNNN_str_specialist_seed_and_admin_resources.sql`
  - Create: `artifacts/api-server/migrations/NNNN_str_specialist_seed_and_admin_resources.sql`
  - Create: `artifacts/api-server/src/migrations/str-specialist-admin-resources-001.ts` (runtime guard — idempotent `INSERT OR IGNORE`)

  **Migration content:**
  ```sql
  -- channel_onefinestay: Onefinestay ultra-luxury STR revshare
  -- Source: https://www.onefinestay.com/partners (partnership page, ~50% revshare model)
  -- Overrides plan 006 exclusion — included here for ultra-luxury-segmentation scope
  INSERT INTO brand_fees (brand_slug, slug, rate, source_url, last_checked)
  VALUES ('h-plus-str-ultra-luxury', 'channel_onefinestay', 0.50,
          'https://www.onefinestay.com/partners', '2026-05-13')
  ON CONFLICT (brand_slug, slug) DO NOTHING;

  -- admin_resources: Teo (Airbnb), Nilo (VRBO) minion config rows
  -- config.url is the help-center URL scraped by the minion (no TS string literals)
  -- config.pietroTtlDays = 7 (weekly refresh)
  INSERT INTO admin_resources (kind, slug, label, config)
  VALUES
    ('mcp', 'airbnb-rates', 'Teo — Airbnb Host Fee Rates',
     '{"url":"https://www.airbnb.com/help/article/1857","pietroTtlDays":7}'),
    ('mcp', 'vrbo-rates', 'Nilo — VRBO Owner Commission Rates',
     '{"url":"https://www.vrbo.com/info/owner-faqs","pietroTtlDays":7}'),
    ('config', 'beatriz-str-specialist', 'Beatriz — STR Specialist Config',
     '{"scopes":["channel-mix","ultra-luxury-segmentation"],"maxWebQueries":10}')
  ON CONFLICT (slug) DO NOTHING;
  ```

  **Test scenarios:**
  - Happy path: `channel_onefinestay` row exists with rate 0.50 after migration.
  - Happy path: Teo and Nilo admin_resources rows present with correct config keys.
  - Edge case: migration is idempotent — re-running does not duplicate rows.

  **Verification:** Before writing the `ON CONFLICT (brand_slug, slug)` clause, confirm plan 006 U2 migration defines `UNIQUE (brand_slug, slug)` on `brand_fees`. If not, prepend `ALTER TABLE brand_fees ADD UNIQUE (brand_slug, slug);` to this migration. `pnpm --filter @workspace/scripts run check:migration-guards` PASS. Typecheck. Magic-numbers gate PASS.

- U2. **Add Beatriz to SPECIALIST_CATALOG**

  **Goal:** Register Beatriz as letter-R specialist in `SPECIALIST_CATALOG`. Catalog-sync job materializes the entry into `specialist_assignments` on next boot.

  **Requirements:** R1, R2, R11

  **Dependencies:** None (TypeScript-only change)

  **Files:**
  - Modify: `lib/engine/src/analyst/registry/specialist-catalog.ts` — add Beatriz entry after the Q entry

  **Entry shape:**
  ```ts
  {
    id: "beatriz",
    letter: "R",
    realName: "Beatriz",
    displayName: "STR Intelligence",
    humanName: "Beatriz",
    gender: "female",
    description: "Short-term rental economics specialist. Channel-mix recommendations and ultra-luxury STR market segmentation for H+ STR properties ($1,500–$30,000/night tier).",
    subject: "str-economics",
    capabilities: ["channel-mix", "ultra-luxury-segmentation"],
    assignmentRefs: [],
    candidateFields: ["channelMix", "ultraLuxuryAdr", "ultraLuxuryOccupancy"],
    prerequisites: ["brand_fees"],
  }
  ```

  **Test scenarios:**
  - Happy path: `SPECIALIST_CATALOG` includes Beatriz at letter R; no duplicate letter assignments.
  - Happy path: `catalog-sync.ts` `flattenCatalogDeclarations()` processes the new entry without error.

  **Verification:** Typecheck PASS. Magic-numbers gate PASS.

---

### Phase 2: Minions (after U1)

- U3. **Teo (Airbnb) + Nilo (VRBO) minion files + MINION_REGISTRY wiring**

  **Goal:** Two deterministic minions that fetch current OTA commission tables from help-center HTML and upsert the corresponding `brand_fees` rows. Wired into `MINION_REGISTRY` so Pietro dispatches them weekly.

  **Requirements:** R8, R9

  **Dependencies:** U1 (admin_resources rows with `config.url` must exist for runtime dispatch); cross-plan plan 006 U2 (`brand_fees` table must be populated with seed rows as upsert targets)

  **Files:**
  - Create: `artifacts/api-server/src/ai/ambient/minions/teo-airbnb-rates.ts`
  - Create: `artifacts/api-server/src/ai/ambient/minions/nilo-vrbo-rates.ts`
  - Modify: `artifacts/api-server/src/ai/ambient/pietro-scheduler.ts` — add two entries to `MINION_REGISTRY`

  **Approach:**
  - Both minions: read `config.url` from their admin_resources row at runtime (never hardcode the URL)
  - Fetch HTML with `AbortSignal.timeout(8_000)` + `Promise.allSettled`
  - Parse the help-center page for the current host/owner commission rate (CSS selector or regex — implementation detail)
  - `db.insert(brandFees).onConflictDoUpdate(...)` on `(brand_slug, slug)` — idempotent upsert
  - On parse failure or non-200: `return { source: 'airbnb-rates', rowsUpserted: 0, rowsFailed: 1, errors: [e.message], durationMs }` — no TS literal fallbacks
  - Return type: `MinionResult` (existing interface from `./index`)

  **MINION_REGISTRY entries:**
  ```ts
  "airbnb-rates": async () => { const { runMinionTeoAirbnbRates } = await import("./minions/teo-airbnb-rates"); return runMinionTeoAirbnbRates(); },
  "vrbo-rates":   async () => { const { runMinionNiloVrboRates }  = await import("./minions/nilo-vrbo-rates");  return runMinionNiloVrboRates();  },
  ```

  **Test scenarios:**
  - Happy path: minion reads config.url from admin_resources row, fetches HTML, upserts one brand_fees row, returns `rowsUpserted: 1`.
  - Failure path: 404 response → `rowsUpserted: 0, rowsFailed: 1`, no throw, no TS fallback written to DB.
  - Failure path: timeout (>8s) → same failure-path result.
  - Idempotent: calling twice with identical parsed rate → second call upserts with same value, no duplicate rows.
  - Edge case: admin_resources row missing → minion returns `rowsFailed: 1` with descriptive error string.

  **Verification:** Typecheck. Magic-numbers gate PASS (no rate literals in TS — rates come from HTML parse only). Unit tests for fetch + upsert path.

---

### Phase 3: Beatriz Runner (after U2)

- U4. **Beatriz STR specialist runner + HTTP dispatch route**

  **Goal:** HTTP-invoked specialist runner for STR channel-mix and ultra-luxury-segmentation scopes. Implements the 19-pattern design contract. Mounted in `analyst-admin-dispatch.ts`.

  **Requirements:** R1–R7, R12

  **Dependencies:** U2 (catalog entry must exist; catalog-sync must have materialized it), U1 (beatriz-str-specialist admin_resources row — runner reads `scopes` config at dispatch time)

  **Files:**
  - Create: `artifacts/api-server/src/ai/specialists/beatriz-str-intelligence-runner.ts`
  - Modify: `artifacts/api-server/src/routes/analyst-admin-dispatch.ts` — add `specialistId === "beatriz"` dispatch branch

  **System prompt contract (all items mandatory):**
  - **Pattern #2 scope switches:** accept `Scope: channel-mix | ultra-luxury-segmentation`; return error for `comp-range` / `fee-cascade-validation` (deferred)
  - **Pattern #4 pre-filter:** query `brand_fees` by channel slugs `(channel_airbnb, channel_vrbo, channel_booking, channel_plum_guide, channel_onefinestay)` BEFORE any external fetch; include current rates in the prompt context
  - **Pattern #6 phased funnel:** cap at 4 broad queries + 6 narrow source-specific fetches per invocation; channels: Airbnb Luxe, VRBO Premium, Plum Guide, Onefinestay (never exceed the cap)
  - **Pattern #7 stop on empty:** return `"no STR comp signal for [market] / [tier]"` rather than substituting nationwide averages or hardcoded benchmarks
  - **Pattern #8 named sections:** output must contain `### Channel-Mix Recommendation`, `### Conviction`, `### Source Mix`, `### Outliers Flagged`, `### Market Benchmarks` (ultra-luxury-segmentation scope only)
  - **Pattern #10 conviction labels:** every range badge carries `high | moderate | low` — `high` = ≥3 independent sources ±15%; `moderate` = 2 sources ±25%; `low` = 1 source or wide spread
  - **Pattern #11 source attribution:** every data point tagged `source: <name>-<year>Qn | tier: primary-paid | primary-free | secondary`
  - **Pattern #13 idempotent:** return findings as structured text only — never call DB writes, never call `admin_resources` mutations
  - **Pattern #17 conflict flagging:** compare user-supplied assumption (e.g., expected occupancy 65%) against sourced benchmark; flag delta with sign and unit: "user occ 65%; ultra-luxury Q4 median 58% (delta −7pp)"

  **Runner architecture:** follow `property-risk-intelligence-runner.ts` N+1 pattern — prompt engineer step reads `brand_fees` and property fields, parallel vendor dispatch (Anthropic + Google), convergence + synthesis. Scope switch at the top before any external query.

  **Test scenarios:**
  - Happy path `channel-mix`: runner returns all 5 named sections; conviction labels present; at least one source attribution per recommendation.
  - Happy path `ultra-luxury-segmentation`: market benchmark section present; delta flagging fires when user assumption is ±10pp from sourced median.
  - Scope guard: calling with `comp-range` scope → returns structured "deferred scope" error, no external queries fired.
  - Pattern #4: `brand_fees` commission rates appear verbatim in prompt context (verifiable in runner log output).
  - Pattern #7: market with no STR signal returns "no STR comp signal" string, not fabricated data.
  - Pattern #13: no DB write calls in the runner (static analysis — grep for `db.insert` / `db.update` in the runner file → zero results).

  **Verification:** Typecheck. Magic-numbers gate PASS. No `db.insert`/`db.update` in `beatriz-str-intelligence-runner.ts`.

---

## System-Wide Impact

- **Interaction graph:** Teo + Nilo write to `brand_fees` via Pietro 60-min tick (weekly effective cadence via `pietroTtlDays: 7`). Beatriz reads `brand_fees` + external sources on HTTP demand. No engine reads affected.
- **Catalog-sync:** Beatriz entry in `SPECIALIST_CATALOG` materializes into `specialist_assignments` at boot — no manual DB step needed after deploy.
- **Error propagation:** Teo/Nilo fetch failures return `MinionResult` with `rowsUpserted: 0` — Pietro logs the error, marks the cycle as `partial`, does not crash. Beatriz invocation failure returns structured error to HTTP caller.
- **ADR-007 preserved:** Beatriz reads `brand_fees` (in the route layer) and passes commission context to the runner as prompt input — no direct DB imports inside `lib/engine/src/` or `lib/calc/src/`.
- **CLAUDE.md §9 (CC-only surface):** No changes to `lib/engine/src/`, `lib/calc/src/`, or protected paths. All new files are in `lib/engine/src/analyst/registry/` (catalog entry only), `artifacts/api-server/src/ai/specialists/`, `artifacts/api-server/src/ai/ambient/minions/`.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Airbnb/VRBO help-center HTML structure changes → Teo/Nilo parse fails silently | MinionResult `rowsFailed: 1` surfaces in Pietro cycle notes; admin visible. URL + selector in admin_resources → operator can update without deploy. |
| Onefinestay revshare fluctuates — `channel_onefinestay 0.50` becomes stale | Row carries `source_url` + `last_checked`; admin UI shows freshness. Operator manually updates. Future plan can add Rino live-fetch if Onefinestay publishes a feed. |
| Plan 006 U2 not landed when this plan ships | Runtime guard `str-specialist-admin-resources-001.ts` will fail on `INSERT INTO brand_fees` → boot failure. Must sequence plan 006 U2 before this plan's migrations. |
| OTA commission URL hardcoded as TS literal (§1 violation) | Plan explicitly requires URL in admin_resources config.url. Magic-numbers gate catches string-literal API slugs if the pattern breaks. |
| Beatriz makes external calls without reading brand_fees first (Pattern #4 violation) | System prompt enforces pre-filter; code review confirms `brand_fees` query precedes any external fetch in the runner. |
| Drizzle migration drift (three-folder topology) | Mirror migration SQL to both `lib/db/migrations/` and `artifacts/api-server/migrations/` per `docs/runbooks/schema-migrations.md`. |

---

## Phased Delivery

### Phase 1 — Data layer + catalog (one PR, after plan 006 U2)

U1 (migration SQL + admin_resources rows) + U2 (catalog entry) in parallel — both are independent

### Phase 2 — Minions (one PR, after Phase 1 lands + migrates)

U3 (Teo + Nilo minion files + MINION_REGISTRY wiring)

### Phase 3 — Beatriz runner (one PR, after Phase 1 catalog materialized)

U4 (beatriz-str-intelligence-runner.ts + dispatch route)

---

## Open / Deferred

- **comp-range scope**: Beatriz supports the scope switch in code but returns a "deferred scope" structured error until an AirDNA, PriceLabs, or Wheelhouse feed is contracted.
- **fee-cascade-validation scope**: Depends on plan 006 cascade fully verified. Add to Beatriz's `capabilities[]` and implement the runner branch in a follow-up PR.
- **Sandro operator row**: Recommend adding an admin_resources `config` row for Sandro (slug `sandro-plum-guide-rates`, kind `config`) so operators can see Plum Guide's last-checked date in the admin UI. Not blocking.
- **UI surface**: AnalystRangeIndicator / specialist badge for Beatriz output. Trails after Phase 3.
