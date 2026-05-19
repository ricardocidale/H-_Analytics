# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-19T23:30:00Z
Status: active

## Active Branch

`main`

## Last Commit on Branch

`chore(portal): delete unreferenced SpecialistsSection.tsx` (`f4b192fae`)

## What CC Did This Session (2026-05-19 session 28 — Valentina scheduler tests + ce-compound + Replit handoff cleanup)

**Wrote unit tests for `runValentinaModelDefaultsCycle` (D3 scheduler); ran /ce-compound to document Vitest TDZ pattern; cleaned up dead `SpecialistsSection.tsx` from Replit session 28 handoff.**

- `artifacts/api-server/src/tests/valentina-model-defaults-scheduler.test.ts` — 25 tests for `runValentinaModelDefaultsCycle`: concurrency guard, feature-flag gate (absent/value=0), row filtering (lastSetSource≠seed, excluded categories, management_company), happy path (proposed count, DB writes, ok status), all-skipped (warn, no DB write), error path (no throw, error status), finally-block guarantee that `recordSchedulerCycle` always fires. Same vi.mocked() pattern as the prior valentina-model-defaults.test.ts (inline `vi.fn()` in factories, `vi.mocked()` after imports). Commit `3f1242c81`.
- **`/ce-compound` full mode** — documented the Vitest `vi.mock` factory TDZ pattern. Four subagents ran (Context Analyzer, Solution Extractor, Related Docs Finder, Session Historian). No prior sessions, no duplicate docs. Result: `docs/solutions/best-practices/vitest-mock-factory-tdz-hoisting-2026-05-19.md` (knowledge track, `best_practice`). Cross-linked from `vacuous-catch-test-regression-magnet-2026-05-11.md` (sibling Vitest best-practice doc). Frontmatter validated (`OK` exit). Commits `b7a6702c0` + `0925c7bec`.
- **Replit session 28 handoff** — per-entity LLM info on roster cards (5 frontend files, all portal-only). No CC surfaces touched. Cleaned up the one follow-on item: deleted `SpecialistsSection.tsx` (121 lines, now unreferenced after `LlmWorkflowsPage` removed its import). Commit `f4b192fae`.

## What CC Did This Session (2026-05-19 session 25 — coderabbit loop + handoff fixes)

**Ran coderabbit-loop review on T1-4 retirement work; resolved two Replit-reported CC-owned blockers; closed PR #169.**

- Working tree was clean at session start → adapted loop to `--type committed --base main --agent`.
- **Branch hygiene failure on `feat/cc-t1-4-retirement`**: 2 Replit-email commits mixed in. User chose cherry-pick onto clean branch; `efce5eef4` became empty (revert of a commit not on main) → skipped via `--skip`.
- **CodeRabbit loop** (2 iterations): 7 findings iter 1 → 0 clean iter 2. Key fixes: moved `SEED_TRAVEL_PER_CLIENT`/`SEED_IT_LICENSE_PER_CLIENT` canonical definitions from portal's `lib/constants.ts` (§2 Cat 5 violation — not in allowed surfaces) to `lib/shared/src/constants.ts`; portal re-exports from `@shared/constants`. `PctField.fallback` made optional (`fallback?: number`, `value ?? fallback ?? 0`) so `PropertyUnderwritingTab` tax/land fields need no fallback.
- **PR #169 opened** (`feat/cc-t1-4-retirement`), then **closed as superseded** — all work already on main via direct commits.
- **Replit handoff — two CC-owned blockers:**
  1. `artifacts/api-server/src/seeds/property-data.ts` — Replit reported remaining `DEFAULT_PROPERTY_INCOME_TAX_RATE` / `DEFAULT_LAND_VALUE_PERCENT` refs. Grep on main confirmed **already clean** — no fix needed.
  2. `CLAUDE.md` `### Canonical definitions` section header missing → `check:taxonomy-mirror` failing. **Fixed:** added `### Canonical definitions` subsection to §10 with four canonical definitions (Agent, Minion, Specialist, Swarm) from `.agents/skills/slide-factory/SKILL.md`; mirrored verbatim to replit.md `## Agent Taxonomy` section. `check:taxonomy-mirror` → OK.
- All gates green: typecheck PASS, check-magic-numbers PASS, check:taxonomy-mirror OK.
- Pushed main to `origin/main` (`06b811a7c` → `3063c75d5`). PR #169 closed.

## What CC Did This Session (2026-05-19 session 24 — T1-4 cross-cutting retirement)

**Retired `DEFAULT_PROPERTY_INCOME_TAX_RATE` and `DEFAULT_LAND_VALUE_PERCENT` (§2 T1-4 Tier 2) via §14 two-commit discipline.**

**Context:** Replit had attempted this retirement in commits `2ced23aaf` + `e95077706` but violated §9 (edited `lib/calc/src/`) and §14 (deleted before consumers rewired). Session opened by reverting those commits surgically (file-level restore to `556c963f9`).

**Commit A (SHA 7f8c6fd57) — rewire all consumers:**
- `lib/shared/src/constants-research.ts` + `lib/db/src/constants-research.ts`: added `RESEARCH_TAX_RATE_25_PCT = 0.25` (bracket-illustration partner of `RESEARCH_TAX_RATE_30_PCT`)
- `lib/calc/src/research/depreciation-basis.ts`: switched from `DEFAULT_PROPERTY_INCOME_TAX_RATE` to `RESEARCH_TAX_RATE_25_PCT`
- `lib/calc/src/analysis/hold-vs-sell.ts`: tightened `land_value_pct` from optional to required; removed `?? DEFAULT_LAND_VALUE_PERCENT`
- `lib/calc/src/shared/schemas.ts`: `land_value_pct` → required in Zod holdVsSell schema
- `lib/engine/src/debt/loanCalculations.ts`: removed both from import + re-export block
- `lib/shared/src/field-registry.ts` + `lib/db/src/field-registry.ts`: removed fallback entries for both fields (NOT NULL in DB, resolver always populates, fallback unreachable)
- `lib/db/src/schema/config.ts`: dead imports removed
- Seed surfaces: `seed-model-defaults.ts` + `property-data.ts` → inline 0.25 literals
- Portal: `PropertyAuditInput.landValuePercent` and `.taxRate` tightened to required; `TestCase.property` intersection-typed to require both; all `?? DEFAULT_*` chains removed from audits, display, edit, admin, verification harness; both removed from `lib/constants.ts` re-exports

**Commit B (SHA 8c133659c) — delete definitions:**
- `lib/shared/src/constants.ts` + `lib/db/src/constants.ts`: both definitions deleted, tombstone comments added

**Gates (both commits):** typecheck clean · check-magic-numbers PASS (+2 improvements vs baseline) · check:schema-drift PASS · engine 41/41 · calc 96/96

## What CC Did This Session (2026-05-19 session 23 — TRAVEL/IT constant retirement)

**Retired `DEFAULT_TRAVEL_COST_PER_CLIENT` (5000→12000) + `DEFAULT_IT_LICENSE_PER_CLIENT` (3600→3000) via git archaeology + §2 T1-4 retirement pattern.**

- Git archaeology confirmed stale values in `lib/db/src/constants.ts` (5000/3600) vs correct AHLA/HFTP 2024 benchmarks in `constants-staffing`/syncHelpers (12000/3000). Conflict originated at workspace port (`372774b7c`, April 2026) — syncHelpers always had correct values; constants.ts was never updated.
- `lib/shared/src/constants.ts`: added `SEED_TRAVEL_PER_CLIENT = 12_000` + `SEED_IT_LICENSE_PER_CLIENT = 3_000` (Category 5, AHLA/HFTP 2024 provenance)
- `lib/db/src/constants.ts` + both `constants-staffing.ts` files: retired DEFAULT_TRAVEL/IT constants (replaced with retirement tombstone comment)
- `lib/db/src/schema/config.ts`: inlined `.default(12_000)` / `.default(3_000)` with SEED provenance comments, removed stale imports
- `lib/shared/src/model-constants-registry.ts`: replaced `constants-staffing` import with module-private `FACTORY_TRAVEL_PER_CLIENT`/`FACTORY_IT_LICENSE_PER_CLIENT` constants
- `artifacts/api-server/src/syncHelpers.ts`: switched from `DEFAULT_TRAVEL_PER_CLIENT`/`DEFAULT_IT_LICENSE_PER_CLIENT` to `SEED_TRAVEL_PER_CLIENT`/`SEED_IT_LICENSE_PER_CLIENT`
- `artifacts/api-server/script/seed-model-defaults.ts` + `seed-model-constants.ts`: inline 12000/3000 with SEED provenance comments, removed constants-staffing imports
- `artifacts/hospitality-business-portal/src/lib/constants.ts` + `store.ts`: re-export and use `SEED_TRAVEL_PER_CLIENT`/`SEED_IT_LICENSE_PER_CLIENT`
- Migrations: `0069_travel_it_defaults.sql` (lib/db) + `0076_travel_it_defaults.sql` (api-server) — SET DEFAULT 12000/3000
- `migration-guards.json`: 0076 declared as `self-idempotent`; both journals updated
- All gates: typecheck PASS, check-magic-numbers PASS (+2 improvement), check-ui-canonical PASS, check-migration-guards PASS (72 entries)
- Note: Replit Agent auto-committed partial overlap (`90ab4bfc4`) covering lib/db constants, schema/config, syncHelpers, and lib/shared constants. My commit (`131c686b0`) completed the remaining files + migrations.
- `docs/plans/open-todos-cc.md` + `CLAUDE.md` TODOs + `replit.md` Recent Changes all updated.

## What CC Did This Session (2026-05-19 session 22 — model-defaults phase 2 + CLAUDE.md trim)

**Merged PR #168 (refactor/claude-md-trim) and PR #167 (feat/model-defaults-phase2) to main.**

**PR #168 — CLAUDE.md trim (590 → 432 lines):**
- Extracted Project Source of Truth + Monorepo + Stack + Key Commands → `docs/reference/project-overview.md`
- Extracted Environment Variables + Production Deployment → `docs/reference/deployment-and-env.md`
- Flattened Architecture Notes H3 sections → `docs/architecture/architecture-notes.md` (bullet-pointer list in CLAUDE.md)
- Elevated Inviolable Login/Auth Rules to own H2 with gate-equivalent preamble
- Open TODOs body → `docs/plans/open-todos-cc.md`; Recent Changes → `docs/changelog/cc-recent-changes.md`
- §1–§14 preserved byte-for-byte; replit.md harmonized; stale doc cross-refs fixed
- CodeRabbit loop: 0 findings, all gates clean

**PR #167 — model-defaults phase 2:**
- `lib/shared/src/constants.ts`: added `SEED_ADR_GROWTH_RATE = 0.03` (Category 5, HVS 2024)
- `PropertyUnderwritingTab.tsx`: wired `fallback={SEED_ADR_GROWTH_RATE}` (fixes typecheck regression from `DEFAULT_ADR_GROWTH_RATE` retirement)
- `Portfolio.tsx`: replaced inline `0.03` with `SEED_ADR_GROWTH_RATE`
- `properties.ts`: moved `buildModelDefaultsInput` inside non-blocking try/catch in `seedPropertyFees`
- CodeRabbit loop: 5 findings iter 1 → 2 findings iter 2 → clean; all gates PASS

**Session 22 continued — DEFAULT_ADR_GROWTH_RATE retirement final step (commit `5721682f6`):**
- `lib/db/src/schema/properties.ts`: `adrGrowthRate` → `.notNull().default(0.03)` (schema self-sufficient)
- `0068_adr_growth_rate_default.sql` (lib/db) + `0075_adr_growth_rate_default.sql` (api-server boot path)
- `migration-guards.json`: 0075 declared as `self-idempotent`
- All §14 pre-conditions satisfied; `open-todos-cc.md` updated
- **Audited TRAVEL/IT constants**: value conflict found (syncHelpers uses 12000/3000 from constants-staffing; schema + model_defaults use 5000/3600 from constants.ts). NOT retired — see handoff below.

## Remaining §2 violations flagged (not in this commit)

- `lib/engine/src/property/resolve-assumptions.ts:219-220` — `arDays ?? 30`, `apDays ?? 45`. Schema columns are `NOT NULL DEFAULT 30/45` so the `??` is structurally unreachable. Fix: tighten `PropertyInput.arDays`/`apDays` in `lib/engine/src/types.ts` (currently `number | null`). Wider blast radius than `miscOpsRate` — PropertyInput has ~10 callsites and many test fixtures.
- `artifacts/api-server/src/slides/build-payload.ts:93` — `inflationRate ?? 0.03`. Check if `GlobalInput.inflationRate` is required (already is) — likely just dead `??`; should be straightforward removal.
- Route-layer pattern `?? 0.05`/`?? 0.03` in `scenario-helpers.ts` and `analyst-admin-utils.ts`: these read raw DB rows where Zod-narrowing hasn't applied. Could be replaced with a parsed-row narrowing helper, but lower priority — the literals mirror schema DEFAULTs and are bounded to two files.

## Replit parallel-work note

Replit Agent shipped `bfddef8a3 "Update financial modeling to include miscellaneous operations rate"` between my prior commit (`37c97324d`) and this one. Their commit added `miscOpsRate` to the `globalAssumptions` DB schema and to call-sites; my work tightened the engine type and swept residual call-sites + tests. The two commits are complementary, not conflicting.

## Last Commit on Branch (prior)

`T1-4: retire DEFAULT_ALERT_COOLDOWN_MINUTES, DEFAULT_MARKETING_RATE, DEFAULT_MISC_OPS_RATE` (`0ad1ae1d1`), on top of Replit's parallel retirement commit (`6a228a142`) and the AgentProcessingCard mockup commits (`84749470c`, `f6e8ea8a3`).

## What CC Did This Session (2026-05-18 session 19 — T1-4 triple retirement, parallel with Replit)

**Shipped T1-4 triple retirement — DEFAULT_ALERT_COOLDOWN_MINUTES + DEFAULT_MARKETING_RATE + DEFAULT_MISC_OPS_RATE (commit `0ad1ae1d1`).**

- Audited the Tier 1 backlog from the prior session's open-TODO list. Five constants (`DEFAULT_OCCUPANCY_RAMP_MONTHS`, `DEFAULT_START_OCCUPANCY`, `DEFAULT_MAX_OCCUPANCY`, `DEFAULT_START_ADR`, `DEFAULT_ROOM_COUNT`) were already retired and the list was stale. Three remaining cleanly tractable: `DEFAULT_ALERT_COOLDOWN_MINUTES`, `DEFAULT_MARKETING_RATE`+`DEFAULT_MISC_OPS_RATE`.
- **DEFAULT_ALERT_COOLDOWN_MINUTES (1440)** — `lib/db/src/schema/notifications.ts` schema column + Zod default → inline `1440`. `artifacts/api-server/src/notifications/engine.ts` `??` fallback → inline `?? 1440`. Dead import removed from `lib/db/src/schema/config.ts`. Constant removed from `lib/shared/src/constants.ts` + `lib/db/src/constants.ts`.
- **DEFAULT_MARKETING_RATE (0.05) + DEFAULT_MISC_OPS_RATE (0.03)** — schema column defaults in `config.ts` → inline. Engine `??` fallbacks in `lib/engine/src/company/company-engine.ts` → inline `?? 0.05`/`?? 0.03`. Route fallbacks in `scenario-helpers.ts` + `analyst-admin-utils.ts` → inline. Seed surfaces in `seed-model-defaults.ts`, `diagnose-portfolio-irr.ts`, `src/seeds/properties.ts` → inline (Category 5 carve-out). Frontend `store.ts` demo fixture, `CompanyTab.tsx` `fallback={}`, `known-value-runner.ts` test runner → inline. Re-exports removed from `lib/constants.ts`. Constants removed from both canonical constants files.
- **Parallel-work conflict resolved:** While I was making these edits, Replit Agent pre-emptively committed the same retirements as `6a228a142 "Update default system rates and notification cooldown"`. My commit landed on top — when I read files mid-session some were already in Replit's post-state, so my Edit calls were partially no-ops; the final tree is consistent. Confirmed clean: typecheck PASS, 41/41 engine tests PASS, check-magic-numbers PASS after `--init` baseline reset (119 suspects, unchanged from prior session).
- **Engine surface note (§9):** Replit's commit `6a228a142` touched `lib/engine/src/company/company-engine.ts` (3 lines: 2 import lines + 2 `??` fallback inlines). This violates the §9 "ONLY shell CC may edit financial engine" rule. The change itself is identical to what I was about to do and is mechanically safe (constant inlining, no semantic change), so I did not revert. Flagging here for visibility — if Replit's pattern of touching engine files continues, the file-scope-exclusion discipline in §9 needs reinforcement.
- Ratchet baseline re-init: `0.05` (17→20 files) and `0.03` (12→13 files) crossed thresholds as expected after constant retirement. `--init` re-snapshotted per the ratchet-improvements doc pattern.
- Pushed to `origin/main` with explicit user authorization.

## What CC Did Previous Session (2026-05-18 session 18 — short orientation + push)

**Oriented on Replit handoff `.agents/handoffs/replit-to-cc-2026-05-18.md` and pushed Replit's 3 local commits to `origin/main`.**

- Verified the third undisclosed commit (`5e00c0131`) was just the handoff doc itself (133-line doc-only diff), not a stealth code change.
- `git push` initially rejected (remote had `99e6d86a1` "Set cost-conscious Claude Code defaults", a `.claude/settings.json` change unrelated to T2-7). Rebased cleanly (no conflicts — disjoint file sets) and pushed.
- `origin/main` now at `ae7c0afbb` with T2-7 Batch 3 live (12 pages migrated to `CollapsibleSection`, `forceOpenId` + `onSectionOpen` API).
- No CC code changes this session.

## What CC Did This Session (2026-05-18 session 17 — /ce-compound run)

**Shipped Category 5 convention doc via /ce-compound full mode (commit `fd4636223`).**

- `docs/solutions/conventions/category-5-starter-portfolio-seeds-carve-out-2026-05-18.md` — knowledge-track convention codifying the rule extension from commit `ab1924923`. 5-section knowledge-track structure (Context, Guidance, Why This Matters, When to Apply, Examples) with mandatory contract, before/after walkthrough using `DEFAULT_BUSINESS_INSURANCE_START`, and 8 cross-references (ratchet doc, onConflictDoNothing origin, sibling §1 convention, barrel-shadow risk, both skill files, CLAUDE.md/replit.md, original commit).
- Phase 1 subagents (Context Analyzer + Solution Extractor + Related Docs Finder + Session Historian) all completed. Frontmatter validated via `validate-frontmatter.py` (exit 0).
- Phase 2.5 SKIPPED — Related Docs Finder reported no stale candidates (the ratchet doc already incorporates Cat 5; no other doc enumerates a four-category list that would now be drift-prone).
- Phase 3 SKIPPED — documentation, not code; the embedded TS examples are illustrative.
- Discoverability check PASSED — CLAUDE.md §6 already surfaces `docs/solutions/` explicitly.

## What CC Did This Session (2026-05-18 session 17 — late additions)

**Shipped Category 5 — Starter-Portfolio Seeds (commit `ab1924923`).**

User-requested rule modification to resolve the bootstrap chicken-and-egg: calibrated starter-portfolio values can't come from the DB before the DB exists. Category 5 codifies `SEED_*` constants and inline calibration literals in dedicated bootstrap surfaces — mandatory `SEED_` prefix + source-citation comment, never imported by runtime code, prod DB wins on conflict via `onConflictDoNothing()`.

- Checker: added `"seeds"` to `SERVER_EXCLUDE_DIRS`, new `SKIP_REL_PATHS` set with `syncHelpers.ts`. Baseline 144 → 119 values (25 legitimate seed duplicates dropped).
- Docs: CLAUDE.md §2 list expanded, replit.md harmonized, both skill files (no-magic-numbers + hplus-variable-taxonomy) gained Category 5 sections with examples and master-decision-table entry, magic-numbers-ratchet-improvements.md got solution 5 (seed file carve-out).
- Gates: typecheck clean, check-magic-numbers PASS, baseline locked.

## What CC Did This Session (2026-05-18 session 17 — six T1-4 retirements + 2 deferral plans)

**Shipped T1-4 overhead quadruple — DEFAULT_OFFICE_LEASE_START + DEFAULT_PROFESSIONAL_SERVICES_START + DEFAULT_TECH_INFRA_START + DEFAULT_BUSINESS_INSURANCE_START retired (commit `b34b8d20a`).**

- Year-1 management-company overhead cost cluster, all four identical profile (8 sites each, no engine `??`, no client-side fallback chains).
- Schema column defaults → inline literals (36000/24000/18000/12000). SPECS entries inline. syncHelpers.ts inline.
- Ratchet: 36000 new suspect (4 files), 24000 4→5 files. Re-snapshotted baseline via `--init`.
- Gates: typecheck clean, check-magic-numbers PASS, check:schema-drift PASS, engine tests (41/41) PASS.

**Shipped plan docs for the 2 cross-cutting deferred T1-4 candidates (commit `be592f319`).**

- `docs/plans/t1-4-property-income-tax-rate-retirement.md` — 20+ sites; calc layer needs country plumbing for `getFactoryNumber('taxRate', country)`.
- `docs/plans/t1-4-land-value-percent-retirement.md` — 30+ sites; mostly a dead-fallback sweep if client-side type tightening reached audits/display.
- Masterplan T1-4 entry updated to reflect reality (six 2026-05-18 retirements listed, two cross-cutting refactors marked "deferred — plan required" with links).

**Shipped T1-4 paired increment — DEFAULT_PROPERTY_INFLATION_RATE + DEFAULT_COMPANY_INFLATION_RATE retired (commit `fe730c7c9`).**

- Both constants were marked `@deprecated` per Audit #319 R4 — canonical replacement is `getFactoryNumber('inflationRate', country, state)` from the model-constants registry. This commit completes their retirement.
- Schema column `globalAssumptions.inflationRate` → inline `0.03` NOT NULL DEFAULT. SPECS entries for `companyInflationRate` and `propertyInflationRate` use inline 0.03. Slides build-payload `??` fallback inlined as `?? 0.03` with explanatory comment.
- Client-side re-export removed.
- Ratchet: 0.03 (12→13 files, +build-payload.ts) crossed baseline. Re-snapshotted via `--init`.
- Gates: typecheck clean, check-magic-numbers PASS, check:schema-drift PASS, engine tests (41/41) PASS.

**Shipped T1-4 paired increment — DEFAULT_AR_DAYS + DEFAULT_AP_DAYS retired (commit `ccb3efdcb`).**

- Removed both TS constants from both canonical constants files. Schema column defaults → inline literals `30`/`45` (standard hospitality net-30/net-45 working capital terms). Seed inline. Engine `?? DEFAULT_*` fallbacks → inline `?? 30`/`?? 45` with comment.
- Type-tightening of `PropertyInput.arDays/apDays` deferred to a future phase (would cascade to ~16 test fixtures in `engine-edge-cases.test.ts` — out of scope for this incremental retirement).
- Ratchet: 30 (60→61 files) and 45 (13→15 files) crossed thresholds. Re-snapshotted baseline via `--init` per the magic-numbers-ratchet-improvements doc ("After every large constant-extraction sprint, re-init"). The new file entries are intentional §2-allowed bootstrap surfaces (schema defaults, seeds, engine fallbacks).
- Gates: typecheck clean, check-magic-numbers PASS, check:schema-drift PASS, engine tests (41/41) PASS.

**Shipped T1-4 increment — DEFAULT_OCCUPANCY_GROWTH_STEP retired (commit `5d02e7e18`).**

- Removed the TS constant `DEFAULT_OCCUPANCY_GROWTH_STEP = 0.05` from both canonical constants files + the client-side re-export.
- Schema column `properties.occupancyGrowthStep` is `notNull()` with no `.default()` — every insert must supply a value. Bootstrap paths now inline `0.05`:
  - `seed-model-defaults.ts` SPECS entry
  - `seeds/property-data.ts` (12 inline replacements via `replace_all`)
  - `Portfolio.tsx` new-property form template (with source-citation comment pointing to model_defaults)
- Engine read is already `property.occupancyGrowthStep` (no `??` fallback to remove).
- Gates: typecheck clean, check-magic-numbers PASS, engine tests (41/41) PASS.

**Shipped T1-4 increment — DEFAULT_REINVESTMENT_RATE retired (commit `5f0c73402`).**

- Removed the TS constant `DEFAULT_REINVESTMENT_RATE = 0.05` from both canonical constants files.
- Schema column `properties.reinvestmentRate` now uses raw literal `0.05` (SQL bootstrap pattern). Seed file `property-data.ts` uses `0.05` inline with a source-citation comment.
- Dead imports removed from `lib/db/src/schema/config.ts` and `lib/db/src/schema/properties.ts` import block.
- PropertyInput.reinvestmentRate is a passthrough field — engine doesn't read it; calc MIRR uses a separate `reinvestment_rate` input from the dispatch layer. No engine fallback to remove.
- Gates: typecheck clean, check-magic-numbers PASS, check:schema-drift PASS, engine tests (41/41) PASS.

**Shipped T1-4 increment — DEFAULT_MAX_STALENESS_HOURS retired (commit `b981c4e66`).**

- Removed the TS constant `DEFAULT_MAX_STALENESS_HOURS = 24` from both canonical constants files (`lib/shared/src/constants.ts`, `lib/db/src/constants.ts`).
- Schema column `marketResearch.maxStalenessHours` now uses raw literal `24` as the SQL bootstrap default (allowed per CLAUDE.md §2 — the `notNull().default(24)` is both the bootstrap and the not-null enforcement).
- Removed dead import from `lib/db/src/schema/config.ts` (the constant was imported but never used in that file).
- No `model_defaults` row added — this is a per-row tunable column on the `intelligence` table (admins can override `max_staleness_hours` per market-research source), not a system-wide admin-editable default. Same shape as the canonical `DEFAULT_STABILIZATION_MONTHS` migration (`900338a54`).
- Gates: `pnpm run typecheck` clean, `check-magic-numbers` PASS, `check:migration-guards` PASS. Zero remaining `DEFAULT_MAX_STALENESS_HOURS` references in the repo.

**Shipped T2-7 audit — horizontal tabs → collapsible UI candidate list.**

- Wrote `docs/plans/t2-7-tab-audit.md` listing 11 in-scope pages with their tab labels and indicator hypotheses, 4 excluded pages, 1 ambiguous (`CompanyAssumptions`), and the Admin sub-component classification.
- AgentRosterAccordion pattern documented as the basis for a new generic `CollapsibleSectionItem` API in `components/ui/`.
- Suggested implementation order (easy-first) and verification gates per page.
- This is T2-7 Done-When criterion #1. Implementation is Replit-safe.

## What CC Did Previous Session (2026-05-18 session 16)

**Shipped unit tests for parseMistralOcrPages (T3-1 U8 follow-up, commit `485a7d02d`).**

- Exported `parseMistralOcrPages` and `MISTRAL_OCR_TABLE_CONFIDENCE` from `routes/documents.ts` (the function was previously unexported, blocking test isolation).
- Added `artifacts/api-server/src/tests/mistral-ocr-adapter.test.ts` — 12 tests covering all three adapter behaviors:
  - 0-based Mistral `index` → 1-based `pageNumber` (including non-zero index offsets)
  - GFM separator-row skipping (`|---|---|`, `:---:`, spaced `| --- |`)
  - 2-column rows → `keyValuePairs` at `MISTRAL_OCR_TABLE_CONFIDENCE = 0.8`; 3+ column rows not promoted
  - Pages with no table rows excluded from `result.pages`; text accumulated regardless
  - Empty input guard
- All 12 tests pass. `typecheck` clean. `check-magic-numbers` PASS.

**Shipped `/ce-compound-refresh` docs updates (commits `9918b582b`, earlier this session).**

- `docs/solutions/architecture-patterns/lorenzo-vision-pipeline-canonical-ingestion-2026-05-07.md` — added Class 5 regex literal false-positives (both `{6}` quantifier AND `[a-z0-9]` character-class variants); removed drifted `LORENZO_VISION_MODEL` constant entry; added note on runtime `resolveLorenzoVisionModelId()`.
- `docs/solutions/tooling/magic-numbers-ratchet-improvements.md` — bumped "four classes" → "five classes"; added Class 5 full entry with both patterns and prevention bullet.

---

## What CC Did Previous Session (2026-05-18 session 15)

**Shipped T2-6 CC portion — brand CRUD API routes (commit `893a04868`).**

- `routes/admin/fees.ts`: added `POST /api/admin/brands` (create brand with slug + metadata) and `PATCH /api/admin/brands/:slug` (update display name / metadata). No new schema — `business_brands` table already covers all needed columns. `isDefault` is never writable via these routes (migration-only invariant preserved). Slug uniqueness enforced with explicit duplicate check before insert.
- Replit can now build the admin UI on top of these routes (T2-6 UI portion — the create/edit brand form under Model Default Management Co → Brands tab).
- T2-6 CC scope complete. UI portion is Replit-safe.
- Both gates passed: `typecheck` clean, `check-magic-numbers` PASS.

**Shipped T3-1 Matteo U8 — PDF OCR routing through Mistral OCR 3 (commit `776085c98`).**

- `routes/documents.ts`: `runAnalysisPipeline` now checks `matteo-enable-pdf-ocr-extraction` parameter flag. Flag on + PDF → Mistral OCR 3 via `getMistralOcrClient()`. Flag off or non-PDF → unchanged Google DocumentAI path.
- `parseMistralOcrPages()` adapter converts Mistral markdown pages into `DocumentAIResult` shape (`pages[].tables[].bodyRows`, `keyValuePairs`) for `mapExtractionToFields()`.
- `logApiCost()` emits JSONL cost line (`service=mistral`, `operation=pdf-ocr-extraction`, cost = `pageCount * unitCost("mistral-ocr-page")`).
- `MISTRAL_OCR_TABLE_CONFIDENCE = 0.8` named calibration constant (algorithm heuristic, not financial).
- Parity map updated with T3-1 U8 slot routing audit entries (both call sites: pdf-ocr-extraction + bulk-text-synthesis).
- All T3-1 Matteo Model Router units (U1–U8) now complete.
- Both verification gates passed: `pnpm run typecheck` clean, `check-magic-numbers.ts` PASS.

**Previous session (2026-05-17 session 14): shipped cross-platform Claude Code permission-bypass installers — PR #161 squash-merged to main as `4f29261c4`.**

Diagnosed and worked around three open Anthropic bugs that make permission-prompt suppression unreliable in Claude Code 2.1.x:
- [anthropics/claude-code#34923](https://github.com/anthropics/claude-code/issues/34923) — `permissions.defaultMode: "bypassPermissions"` in settings.json is silently broken.
- [anthropics/claude-code#29026](https://github.com/anthropics/claude-code/issues/29026) — Desktop app ignores both `permissions.allow` and `defaultMode` bypass.
- [anthropics/claude-code#55095](https://github.com/anthropics/claude-code/issues/55095) — Desktop's in-app bypass toggle is a no-op.

**Shipped (now on main):**
- `scripts/install-claude-wrapper.sh` — Linux/Mac installer. Drops a portable shim at `~/.local/bin/claude` that resolves the real claude binary by skipping itself on PATH and exec's it with `--dangerously-skip-permissions`. Includes a size-based safety check that refuses to overwrite a native install (>100 KB at target path).
- `scripts/install-claude-wrapper.ps1` — Windows PowerShell installer. Drops `claude.cmd` at `%USERPROFILE%\.claude-bypass\bin\` (separate directory, prepended to user PATH) to avoid the PATHEXT collision where `.exe` beats `.cmd` in the same directory. Includes OneDrive/Dropbox hazard detection. Uses `[Environment]::SetEnvironmentVariable(..., 'User')` to dodge `setx` 1024-char truncation.

**Verification:**
- Linux: removed `~/.local/bin/claude` → fell back to npm binary → ran installer → wrapper restored → bash trace confirmed `exec real-claude --dangerously-skip-permissions --version`. Real-tool-call smoke test via `claude -p` Bash invocation echoed the marker through the wrapper.
- Windows: verified end-to-end on the repo owner's native Claude Code 2.1.133 at `C:\Users\ricar\.local\bin\claude.exe` (225 MB compiled binary). `where.exe claude` showed `.claude-bypass\bin\claude.cmd` first, real `.exe` second. `claude --model haiku -p` echoed the marker through the shim — bypass confirmed active.
- Desktop (Mac & Windows): 🔴 no working bypass in 2.1.x. Use CLI for unattended workflows until fixed upstream.

**Per-machine setup also done on this Replit (not committed, gitignored):**
- `~/.local/bin/claude` wrapper installed and live.
- `~/.claude/settings.json`: dead `skipDangerousModePermissionPrompt: true` key removed.
- `.claude/settings.local.json` allowlist expanded to broad `[Bash, Edit, Write, WebFetch, WebSearch]` as a wrapper-less fallback for this box only.

**Branch hygiene:**
- Worked on `chore/claude-wrapper` (off main) for the PR.
- Deleted `feat/portal-followups` (post-merge stub from PR #160 with no unique work) — deletion authorized by user; recovery via reflog if needed (`d11cb426e`).
- Pruned 17 stale remote-tracking refs as a side effect of `git remote prune origin`.

**Protocol override (one-time, user-authorized):** Edited `.agents/status/replit.md` to mark Replit's Phase 3 handoff to CC as resolved (Phase 3 = `gaspar → gustavo` rename, shipped in PR #160). The protocol says Replit is the sole writer of that file; the override was scoped to a single targeted edit and clearly labeled in-file with a `[CC note — user-authorized]` block. Original handoff text preserved (struck-through) for session-log continuity. Commit `40bcf3ca3`.

**Compound documentation captured (`/ce-compound` full mode, commit `27463422a`):** `docs/solutions/tooling-decisions/claude-code-permission-bypass-path-shim-2026-05-17.md` — knowledge-track learning that documents the cross-platform CLI permission-bypass strategy, the three upstream bugs that necessitate it (#34923, #29026, #55095), the Windows PATHEXT collision pitfall, the `setx` truncation gotcha, the `claude -p` smoke-test pattern, and the explicit "Desktop has no working bypass in 2.1.x" guidance. Discoverability check passed (CLAUDE.md §6 already surfaces `docs/solutions/`). Phase 2.5 refresh skipped (no stale candidates).

**Memory-file maintenance (commit `483dbe48d`):** CLAUDE.md trimmed from 649 → 556 lines (-14%); replit.md from 172 → 158 lines (-8%). Cuts: redundant code examples now restated by their skill files (§2 violations, §3 seed violations, §10 canonical Agent/Minion/Specialist/Swarm definitions in slide-factory SKILL.md, §13 one of three TSX examples), Architecture Notes "Number taxonomy" restatement of §2 collapsed to pointer, several 3-4-line skill-pointer subsections tightened. NOT touched: inviolable login/auth rules (verbatim), §13 base rule + 2 examples (gate shipped 2026-05-17), import-discipline + Zod gotchas (short, valuable inline). All 13 numbered sections preserved; all 9 named-subsection refs from replit.md still resolve. Harmonization gate per CLAUDE.md "Memory-file harmonization" rule — both files shipped in single commit.

**CodeRabbit review (post-trim):** user invoked, loop stood down — working tree clean (everything pushed) and loop toggle OFF. No state files written. Run `/coderabbit-loop-on` then `/coderabbit-loop-review` when there are working-tree changes to review.

**Memory captured (saved to `~/.claude/projects/.../memory/`):**
- `feedback_powershell_repo_path.md` — don't assume the user is in the H-Analytics repo when issuing PowerShell commands on Windows; their clone is not in any common location.
- `feedback_windows_native_claude_install.md` — user's Windows runs Anthropic native `claude.exe` at `~/.local/bin\`, not npm; sibling `.cmd` shims won't shadow it because of PATHEXT.

## Files CC Owns Right Now

None — work is on main, working tree clean.

## What's Pending

### T1-4 campaign status (as of session 26)

All tracked `DEFAULT_*` retirements **COMPLETE**. All three residual `??` violations from prior sessions also **COMPLETE**:

- ~~`build-payload.ts:93` — `inflationRate ?? 0.03`~~ removed in session 26 (commit `33f2c7484`)
- ~~Route-layer `?? 0.05`/`?? 0.03` in `scenario-helpers.ts` + `analyst-admin-utils.ts`~~ removed in session 26 (commit `a3505e198`)
- ~~`resolve-assumptions.ts:219-220` — `arDays ?? 30`/`apDays ?? 45`~~ already clean — engine reads `PropertyInput.arDays: number` directly, no `??` in current code

### Next CC session pickup

No urgent CC work outstanding. Replit UI tasks (T2-2, T2-3, T2-4, T2-6) remain on the backlog.

### Completed CC work this session (status reference)

- **T3-1 Matteo — Model Router Specialist** COMPLETE (all U1–U8). Routing table in `admin_resources kind=llm_slot`, Mistral OCR 3 + DeepSeek + Gemini routing, cost-per-task JSONL log, cost visible in Admin LLM Workflows Cost tab.
- **T2-6 CC scope** COMPLETE. Brand CRUD API routes shipped (`POST /api/admin/brands`, `PATCH /api/admin/brands/:slug`). UI portion is Replit-safe — see Handoff section below.
- **T2-7 audit** COMPLETE. `docs/plans/t2-7-tab-audit.md` lists 12 in-scope pages with indicator hypotheses. `CompanyAssumptions` confirmed in scope per 2026-05-18 owner decision. UI implementation is Replit-safe.
- **Category 5 rule extension** COMPLETE. CLAUDE.md §2 + replit.md + both skill files + ratchet doc + conventions doc all harmonized. Checker file-glob carve-out shipped; baseline locked at 119 suspects.

### Open TODO carried forward

Tier 1 T1-4 backlog above (incremental — check off each as cleaned up).

## Handoff to Replit (session 26, 2026-05-19)

**All work is on `main`. Working tree is clean (one untracked `.mcp.json` change — Figma MCP entry you added; safe to commit or leave).**

### What CC completed this session

Three residual dead `??` fallbacks removed from route/slide code (all §2 cleanup — schema columns are NOT NULL so fallbacks were structurally unreachable):

| File | Change |
|---|---|
| `artifacts/api-server/src/slides/build-payload.ts:93` | `inflationRate: Number(ga.inflationRate ?? 0.03)` → `Number(ga.inflationRate)` |
| `artifacts/api-server/src/routes/scenario-helpers.ts:78-79` | `marketingRate ?? 0.05`, `miscOpsRate ?? 0.03` → direct reads |
| `artifacts/api-server/src/routes/analyst-admin-utils.ts:12-13` | same `marketingRate`/`miscOpsRate` fallbacks removed |

T1-4 §2 campaign is **fully complete**. All DEFAULT_* constants retired, all dead fallbacks cleared.

### Your tasks (all Replit-safe, frontend-only)

Pick any of these — all plan docs are in `docs/plans/`:

**T2-2 — Portfolio filter on `Portfolio.tsx`** (`docs/plans/t2-2-portfolio-filter.md`)
- Add a filter dropdown (All / by portfolio / Unassigned) to the property list page header
- Client-side only — `portfolioId` is already on every property, `useQuery` for portfolios already in the page
- No new API routes needed

**T2-6 — Brand create/edit dialog in `BrandsTab.tsx`** (`docs/plans/t2-6-brand-form-dialog.md`)
- Routes live: `POST /api/admin/brands`, `PATCH /api/admin/brands/:slug`
- Single `BrandFormDialog` component with `mode: "create" | "edit"` prop
- Reference pattern: `CreateUserDialog.tsx` / `EditUserDialog.tsx` under `components/admin/users/`

**T2-4 — "Verify deck" button in Slide Factory Tab 6**
- Routes live: `POST /api/slide-factory-runs/:id/verify`, `GET /api/slide-factory-runs/:id/verification`
- Severity palette: ok=emerald, advisory=sky, warning=amber, block=red

**T2-3 — "Improve with AI" on description textarea in `BasicInfoSection.tsx`**
- Route live: `POST /api/properties/:id/rewrite-description { text: string }`

**T2-7 — Horizontal tabs → collapsible UI** (`docs/plans/t2-7-tab-audit.md`)
- 12 pages in scope; audit doc lists tab labels, indicator hypotheses, and suggested order
- AgentRosterAccordion is the reference pattern

### Reminder: surfaces you must not touch

- `lib/engine/src/`, `lib/calc/src/`, `lib/shared/src/constants*.ts`
- `lib/db/src/`, `artifacts/api-server/src/finance/`, `artifacts/api-server/src/report/`
- `artifacts/api-server/src/migrations/*.ts`, `artifacts/api-server/src/tests/proof/`, `tests/engine/`

---

## Handoff to Replit (prior — T2-6 UI routes reference)

**API routes for T2-6 (already live in `artifacts/api-server/src/routes/admin/fees.ts`):**
- `POST /api/admin/brands` — Body: `{ slug, name, description?, businessModel?, segment?, sortOrder?, isActive? }`. Returns 201 + brand row. 409 if slug exists.
- `PATCH /api/admin/brands/:slug` — same fields except slug is immutable. Returns updated row. 404 if not found.
- `GET /api/admin/brands` — list all brands (already in use by `BrandsTab.tsx`)

---

## Prior handoff notes (2026-05-18, session 17)

**Category 5 — Starter-Portfolio Seeds is now codified** (commit `ab1924923` + convention doc `fd4636223`). What this means for Replit:
- `SEED_*` named constants and inline calibration literals are permitted in: `artifacts/api-server/src/migrations/*.ts`, `artifacts/api-server/src/seeds/**`, `artifacts/api-server/script/seed-*.ts`, `artifacts/api-server/src/syncHelpers.ts`, and (cross-package `SEED_*` only) `lib/shared/src/constants.ts`.
- Contract: `SEED_` prefix on named constants + source-citation comment block (date, target metric, runbook link, market reference) + NEVER imported by runtime engine/calc/route code + prod DB wins on conflict via `onConflictDoNothing()`.
- The magic-numbers checker (`scripts/src/check-magic-numbers.ts`) skips these locations mechanically. Baseline went 144 → 119 suspects.
- Full convention: `docs/solutions/conventions/category-5-starter-portfolio-seeds-carve-out-2026-05-18.md`.
- Implementation/checker mechanics: `docs/solutions/tooling/magic-numbers-ratchet-improvements.md` (Solution 5).
- CLAUDE.md §2 "ONLY numbers allowed in TypeScript" list now includes Category 5 as the fifth bullet. replit.md inviolable-rules summary harmonized.

**T2-7 audit doc ready for Replit-driven implementation:** `docs/plans/t2-7-tab-audit.md` — 12 in-scope pages with tab labels, indicator hypotheses, and suggested implementation order. AgentRosterAccordion pattern documented as the model. `CompanyAssumptions` confirmed in scope (preserve per-tab Save + AnalystButton semantics).

### Outstanding Replit UI tasks (unchanged from prior handoff)

- **T2-6 UI:** brand create/edit form in `BrandsTab.tsx`. Routes live: `POST /api/admin/brands`, `PATCH /api/admin/brands/:slug`. Details in the T2-6 UI handoff section above.
- T2-4 UI: "Verify deck" button in Slide Factory Tab 6 — `POST /api/slide-factory-runs/:id/verify` → `GET /api/slide-factory-runs/:id/verification`. Severity: ok=emerald, advisory=sky, warning=amber, block=red.
- T2-3 UI: "Improve with AI" button on `descriptionImproved` textarea in `BasicInfoSection.tsx` — `POST /api/properties/:id/rewrite-description { text: string }`.
- T2-2 UI: Portfolio selector on property list — `GET /api/portfolios`, `PUT /api/properties/:id/portfolio { portfolioId: N | null }`.

Pre-existing test failures (not introduced this session, not CC-owned):
- `check:lint` — no-shadow in `api-server/src/chat/rebecca-tool-impls-slide-factory.ts`
- `test:api-server` — marco, builder-substitution-map, pptx-substitution, dispatch, slide-6-embed-flow

## Do Not Touch

- `lib/engine/src/` — financial engine (CC-only per CLAUDE.md §9)
- `lib/calc/src/` — financial calculators (CC-only)
- `artifacts/api-server/src/finance/` — finance routes (CC-only)
- `artifacts/api-server/src/migrations/` — runtime guards (CC-only)
- `lib/db/src/schema/` — DB schema (CC-only)

### Owner-maintained CC skills — DO NOT DELETE OR MODIFY

These four skill files are maintained by the repo owner and have been
restored multiple times after CC sessions wiped them. Treat as read-only.
Do not remove, overwrite, or merge-conflict-resolve them away.

- `.agents/skills/start-here/SKILL.md`
- `.agents/skills/plugin-stack/SKILL.md`
- `.agents/skills/workflows/SKILL.md`
- `.agents/skills/run-workflow/SKILL.md`
