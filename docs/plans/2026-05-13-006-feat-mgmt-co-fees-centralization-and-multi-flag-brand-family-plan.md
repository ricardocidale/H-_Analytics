---
title: "feat: Mgmt Co Fees Centralization + Multi-Flag Brand Family"
type: feat
status: active
date: 2026-05-13
---

# Mgmt Co Fees Centralization + Multi-Flag Brand Family

## Summary

Centralize H+ Management Company fees + per-flag Brand Stack/STR fees into a multi-table persistence pattern: extend existing `business_brands` table for the multi-flag structure, add `management_company_fees` (Tier A: Base Mgmt + Incentive) and `brand_fees` (per-flag Brand Stack for hotel flags / STR fee schedule for STR flags) tables, wire flag-keyed cascade through the existing `hydratePropertyFinancials` resolver into per-property Layer-3 columns, then in a follow-up PR delete the `DEFAULT_*` business constants in `lib/shared/` and `lib/db/` per CLAUDE.md §2 taxonomy cleanup. Property-edit fees section converts to read-only FYI display; canonical editing moves to a new Admin / Model Defaults / Management Co tab + Brands tab and a new front-app Company / Mgmt Co Assumptions tab.

---

## Problem Frame

The current fee model has structural issues: (1) brand-stack fees live as nullable per-property columns with `?? DEFAULT_*` TS-constant fallbacks scattered across `lib/shared/src/constants-brand.ts`, `lib/shared/src/constants-business-models.ts`, and `lib/shared/src/constants.ts` — direct CLAUDE.md §2 violations; (2) the codebase modeled H+ as if it managed third-party-branded properties under arbitrary fee deals, producing artifacts like Medellin Duplex's "10% base / 0% incentive special deal" record that was actually a misclassified ultra-luxury STR; (3) the underlying business model — H+ is a vertically-integrated multi-flag brand operator with two property business models (branded hotels vs branded STRs) — was never written down in code or docs.

The architectural truth was documented today at `docs/solutions/architecture-patterns/hplus-multi-flag-brand-operator-model-2026-05-13.md`. This plan executes the structural changes that follow.

---

## Requirements

- R1. All seven Mgmt Co fees + per-flag Brand Stack/STR fees are editable from a single canonical surface (Admin / Model Defaults / Management Co + Brands); back-of-app defaults and front-of-app working values are distinct rows.
- R2. Property-edit pages display the resolved per-property fees but do NOT permit edit / add / delete.
- R3. Service set is fixed by codebase; users can change percentages but not the set of services.
- R4. Three sections for hotel flags: Brand Services / Management Services / Performance & Incentives. Channel & Platform Fees section for STR flags.
- R5. Engine continues reading `property.X` columns unchanged (ADR-007 / §4 preserved); cascade populates Layer-3 from flag-keyed defaults.
- R6. `DEFAULT_*` business constants in `lib/shared/src/constants-brand.ts`, `lib/shared/src/constants-business-models.ts`, and `lib/shared/src/constants.ts` (Violation Example 3 — `DEFAULT_SERVICE_FEE_CATEGORIES`) are deleted per CLAUDE.md §2.
- R7. Multi-flag structure honored: each H+ flag (hotel and STR) carries its own Brand Stack or STR fee schedule.
- R8. Two property business models: hotel and STR, with structurally different fee schedules.
- R9. Per-property Mgmt-Co special-deal overrides supported via `has_mgmt_co_override` boolean (preserved for genuine special deals; NOT for Medellin Duplex which is a regular STR-flag property).
- R10. Save in front-app cascades to Layer-3 columns on every property matching the cascade source's business model, except properties with `has_mgmt_co_override=true`.
- R11. Range-quality dots on every fee field via existing `assumption_guardrails` + Fabio minion.
- R12. STR channel commission seeds use verified figures (Airbnb 15.5%, VRBO 8%, Booking.com 15%, Plum Guide 16.5%); each seeded row carries `source_url` + `last_checked` columns.

---

## Scope Boundaries

- Operating expense rates (Rooms / F&B / Admin / Marketing / POM / Utilities / IT / FF&E / Insurance / Other) — separate domain under `PropertyUnderwritingTab`
- Mgmt Co Income Statement / P&L — downstream consumer; not modified
- Property taxes (country-specific factory rates)
- OTA / platform commissions for HOTEL business model (hotels don't use OTAs the same way; their `platformFeeRate` is 0)
- Disposition commission, HMA termination fee schedule
- A dedicated `mgmt_co_special_deals` table — handled inline via `has_mgmt_co_override` flag for now
- Onefinestay (~50% revshare) and Inspirato (fixed lease) — different counterparty types; do NOT seed into `brand_fees`
- Operating-expense pattern migration to same two-tier shape (could follow as a sequel)

### Deferred to Follow-Up Work

- Engine bypass cleanup at `lib/engine/src/company/company-engine.ts:195` and TS DEFAULT_* constant deletion — Phase 2 PR (after Phase 1 verifies Layer-3 hydration works)
- STR specialist agent + Pietro OTA-rate minions — separate `/ce-plan` track (`.local/tasks/str-specialist-and-pietro-minions-synthesis-2026-05-13.md`)
- DB Custodian agent — separate `/ce-plan` track (`.local/tasks/db-custodian-agent-synthesis-2026-05-13.md`)

---

## Context & Research

### Relevant Code and Patterns

- `lib/db/src/schema/core.ts:66-90` — existing `business_brands` table with `properties.brandId` FK already wired (`lib/db/src/schema/properties.ts:240`). Header comment: "architecture supports multiple brands" — this is the existing seam.
- `lib/db/src/schema/properties.ts:169-181` — per-property fee columns (Layer-3, engine-read).
- `lib/db/src/schema/services.ts:17-30, 61-72` — existing `company_service_templates` + `property_fee_categories` (Base Mgmt sub-breakdown infrastructure). Unchanged by this plan.
- `lib/db/src/schema/model-defaults.ts:36-89` — Layer-1 admin seeds with `category` enum including `management_company`.
- `lib/db/src/schema/assumption-guardrails.ts:36-60` — range-quality dot infrastructure.
- `artifacts/api-server/src/defaults.ts:163-200, 255-301` — `hydratePropertyFinancials` (5 fields today) + `applyBracketLayerDefaults` patterns to mirror for fee hydration.
- `artifacts/api-server/src/routes/properties.ts:71-118` — `createPropertyRecord` orchestrates Layer-2/3 hydration; extension point for new fee cascade.
- `artifacts/api-server/script/seed-model-defaults.ts:154-158, 196` — existing Layer-1 seed pipeline for fees; rows already exist for `baseManagementFeeRate`, `incentiveManagementFeeRate`, `serviceFeeCategories`, `platformFeeRate`.
- `artifacts/hospitality-business-portal/src/components/admin/ModelDefaultsTab.tsx` + `model-defaults/CompanyTab.tsx:122-128` — nested Tabs pattern; closest pattern for new Mgmt-Co tab and Brands tab.
- `artifacts/hospitality-business-portal/src/components/property-edit/ManagementFeesSection.tsx` — current per-property fee editor with `?? DEFAULT_*` UI fallbacks (also §2 violations to remove).
- `artifacts/hospitality-business-portal/src/pages/Company.tsx` + `CompanyAssumptions.tsx` — host for new Mgmt Co Assumptions tab.
- Three-folder migration topology: `docs/runbooks/schema-migrations.md`. Drizzle generate target + boot reader + runtime guards.
- ADR-007 reference pattern: `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md` (DB-import-free engine/calc; resolve in route layer; pass through).
- Two-phase column drop runbook: `docs/solutions/conventions/drizzle-two-phase-column-drop-runbook-2026-05-13.md`.

### Institutional Learnings

- `database-issues/icp-brackets-slug-mismatch-layer2-overlay-inert-2026-05-13.md` — slug-based JOINs fail silently when seed slugs diverge. Mitigation: startup assertion that every new `business_brands.slug` resolves to a real `brand_fees` row.
- `workflow-issues/seed-pipeline-drift-dual-migration-folders-and-uncalled-medellin-duplex-2026-05-12.md` — new migrations must be mirrored in `artifacts/api-server/migrations/` with non-colliding slot numbers, plus runtime guard.
- `database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md` — runtime guard required for fresh-DB self-heal.
- `database-issues/seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md` — seeds must be idempotent UPSERT, not bare INSERT.
- `logic-errors/financial-engine-audit-findings-2026-05-04.md` — engine is §9 protected; proof tests must run on engine-bypass cleanup.
- `architecture-patterns/analyst-intelligence-display-pattern-2026-05-05.md` — range badges source from specialist output + guardrails, not local TS derivation.
- `workflow-issues/cc-replit-branch-hygiene-2026-05-10.md` — diff audit required before merge (CC-only protected surfaces).
- `architecture-patterns/hplus-multi-flag-brand-operator-model-2026-05-13.md` — the authoritative scope doc for this plan (written today).

### External References

- Airbnb host-only fee: https://www.airbnb.com/help/article/1857 — 15.5% confirmed (last-checked: 2026-05-13)
- VRBO commission: https://help.vrbo.com/articles/How-is-the-booking-fee-calculated — 8% (5%+3%) confirmed (last-checked: 2026-05-13)
- Booking.com commission: vacation-rentals avg ~15%, Preferred Partner +3% (last-checked: 2026-05-13)
- Plum Guide host-only: 16.5% (last-checked: 2026-05-13)
- Onefinestay (~50% revshare) and Inspirato (fixed lease) noted as out-of-scope counterparties for `brand_fees`

---

## Key Technical Decisions

- **Extend `business_brands` rather than introduce parallel `mgmt_co_brands`**: existing table is under-utilized but already FK'd from `properties.brandId`. Header comment validates the multi-flag intent. (Decided after Phase 1 research surfaced the collision.)
- **Three-layer cascade preserved**: Layer 1 = `model_defaults`; Layer 2 = `management_company_fees` + `brand_fees`; Layer 3 = `properties.X` columns. Engine reads only Layer 3. No engine refactor.
- **Two-phase column drop**: Phase 1 PR wires the new infrastructure and converts read sites; Phase 2 PR deletes TS constants and (if applicable) drops legacy columns. Prevents runtime-guard re-adding dropped columns on dev boot.
- **`has_mgmt_co_override` boolean preserved for genuine special deals only**: NOT used for business-model differences. Medellin Duplex is NOT an override — it's a regular STR-flag property whose 10%/0% historical values were artifacts of misclassification.
- **Cascade scope: matching business model + non-overridden**: Save on hotel-flag Brand Stack edits → all hotel properties without override; save on STR fee edits → all STR properties without override; save on Tier A (Mgmt + Performance) → all properties without override regardless of business model.
- **Migration guard discipline**: each new table + column gets a paired Drizzle migration + idempotent runtime guard in `artifacts/api-server/src/migrations/*.ts` with `SEED_*` named constants + source citation.
- **Startup assertion extension**: `assertRequiredModelDefaults()` extended with new Mgmt Co fee + brand-fee keys. Fails boot if seed rows are missing.
- **Slug-based linkage**: `business_brands.slug` is the join key for `brand_fees`. Mirror the icp-brackets pattern; add a startup assertion that every `business_brands.slug` resolves to a `brand_fees` row.

---

## Open Questions

### Resolved During Planning

- Storage shape: resolved — extend `business_brands`, add `management_company_fees` + `brand_fees` tables.
- Cascade rule: resolved — match business model + skip `has_mgmt_co_override=true`.
- Brand-stack §2 cleanup: resolved — delete `DEFAULT_*` constants in Phase 2 PR after Phase 1 verifies Layer-3 hydration works.
- OTA channel commission defaults: resolved — Airbnb 15.5%, VRBO 8%, Booking.com 15%, Plum Guide 16.5%. Verified by external research.

### Deferred to Implementation

- Exact field shape for `brand_fees.base` enum values when channel commissions stack — `gross_booking_airbnb` vs a generic `gross_booking` with separate `channel` discriminator. Pick during U2 implementation based on what's cleanest for engine reads.
- Whether to repurpose or remove `business_brands.is_default` — likely repurpose as "fallback brand for properties pre-dating multi-flag model"; decide during U1 migration drafting.
- Specific UI placement for the new Brands tab in `ModelDefaultsTab.tsx` — alongside existing tabs or as a sub-tab of Company. Decide during U5.
- Whether Phase 2 (constant deletion) is one PR or split per constants file — decide based on Phase 1 diff size.

---

## Implementation Units

### Phase 1: Build new infrastructure + convert read paths

- U1. **Extend `business_brands` table + data migration**

  **Goal:** Add the multi-flag fields (`slug`, `business_model`, `segment`, `sort_order`, `is_active`, `updated_at`), change `properties.brand_id` FK behavior to RESTRICT, make `brand_id` NOT NULL after assigning every existing property to a flag (initially: all to `is_default=true` brand; Medellin Duplex to a new `h-plus-str-ultra-luxury` flag created in U2).

  **Requirements:** R7, R8, R9

  **Dependencies:** None (foundation unit)

  **Files:**
  - Modify: `lib/db/src/schema/core.ts` (extend `businessBrands` table)
  - Modify: `lib/db/src/schema/properties.ts` (FK behavior change)
  - Create: `lib/db/migrations/NNNN_extend_business_brands_for_multi_flag.sql` (Drizzle generate target)
  - Create: `artifacts/api-server/migrations/NNNN_extend_business_brands_for_multi_flag.sql` (mirror)
  - Create: `artifacts/api-server/src/migrations/business-brands-multi-flag-001.ts` (runtime guard, idempotent IF NOT EXISTS)
  - Modify: `artifacts/api-server/src/startup/migrations.ts` (register the new guard)
  - Test: `artifacts/api-server/src/tests/migrations/business-brands-multi-flag.test.ts` (verify columns added, FK behavior, data backfill)

  **Approach:**
  - Add columns via runtime-guard idempotent DDL
  - Backfill: all existing properties get assigned to the default `business_brands` row (`is_default=true`), Medellin Duplex deferred to U4's seed migration which creates the H+ STR Ultra-Luxury flag and re-assigns Medellin's `brand_id` to it
  - FK RESTRICT change requires dropping + re-adding the FK constraint with new ON DELETE behavior
  - `brand_id` NOT NULL applied AFTER backfill completes

  **Patterns to follow:** `artifacts/api-server/src/migrations/properties-refi-ltv-cap-001.ts` (column-add pattern with runtime guard).

  **Test scenarios:**
  - Happy path: migration applies cleanly on a fresh DB — `business_brands` has all new columns; `properties.brand_id` is NOT NULL; FK is RESTRICT.
  - Happy path: migration is idempotent — running twice produces same end state.
  - Edge case: existing properties with NULL `brand_id` get assigned to `is_default=true` brand pre-NOT-NULL constraint.
  - Edge case: attempting to delete a `business_brands` row referenced by a property is rejected (RESTRICT verified).
  - Edge case: no existing `business_brands` row marked `is_default=true` — migration creates one OR fails loudly with a clear error.

  **Verification:**
  - `pnpm run typecheck` clean.
  - `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS.
  - Migration tests PASS.
  - `pnpm --filter @workspace/scripts run check:migration-guards` PASS.
  - On fresh dev DB boot: `business_brands` has 1 row (`is_default=true`); all `properties.brand_id` are non-NULL.

- U2. **Create `management_company_fees` + `brand_fees` tables + seed data**

  **Goal:** Add the two new fee tables, register their runtime guards, seed Tier A (Mgmt + Performance), seed Brand Stack for the default hotel flag (R7), and seed STR fee schedule (with verified OTA rates from external research) for a new H+ STR Ultra-Luxury flag. Assign Medellin Duplex to the STR flag.

  **Requirements:** R1, R4, R7, R8, R12

  **Dependencies:** U1

  **Files:**
  - Modify: `lib/db/src/schema/core.ts` (or `lib/db/src/schema/fees.ts` new file) — add `managementCompanyFees` + `brandFees` tables
  - Create: `lib/db/migrations/NNNN_create_mgmt_co_and_brand_fees.sql`
  - Create: `artifacts/api-server/migrations/NNNN_create_mgmt_co_and_brand_fees.sql`
  - Create: `artifacts/api-server/src/migrations/mgmt-co-fees-tables-001.ts` (runtime guard + seed Tier A + seed default hotel flag's Brand Stack + create H+ STR Ultra-Luxury flag + seed its STR fee schedule + assign Medellin Duplex to the STR flag)
  - Modify: `artifacts/api-server/src/startup/migrations.ts` (register)
  - Modify: `artifacts/api-server/src/startup/seeds.ts` or similar — extend `assertRequiredModelDefaults()` with new keys
  - Test: `artifacts/api-server/src/tests/migrations/mgmt-co-fees-seed.test.ts`

  **Approach:**
  - `management_company_fees`: 2 rows (base_mgmt 8.5%, incentive 12.0%) per Mgmt Co
  - `brand_fees`: 5 rows for default hotel flag (royalty 5%, brand_marketing 2%, loyalty 0.5%, reservation 1.25%, brand_tech 0.5%) + 4 rows for H+ STR Ultra-Luxury flag (h_plus_str_brand_fee 10%, channel_airbnb 15.5%, channel_vrbo 8%, channel_booking 15%, channel_plum_guide 16.5%)
  - Each seed row carries `source_url` + `last_checked` columns (or comment in migration if columns deferred)
  - Idempotent UPSERT pattern (NOT bare INSERT — see seed-insert-no-conflict learning)
  - Slug discipline: hardcoded `SEED_*` named constants in migration file with source citation per CLAUDE.md §1 exception

  **Patterns to follow:** `artifacts/api-server/src/migrations/model-defaults-ltv-recalibration-001.ts` (UPSERT pattern). `artifacts/api-server/src/migrations/properties-demo-seed-overrides-002.ts` (per-property assignment pattern).

  **Test scenarios:**
  - Happy path: 2 mgmt_co_fees rows + 5+4 brand_fees rows seeded after migration applies.
  - Happy path: Medellin Duplex's `brand_id` points to H+ STR Ultra-Luxury flag.
  - Edge case: re-running migration is idempotent (UPSERT not duplicate INSERT).
  - Edge case: `assertRequiredModelDefaults()` fails boot if seed rows missing.
  - Integration: `brand_fees` JOIN to `business_brands` works for hotel-flag and STR-flag rows distinctly.

  **Verification:**
  - All gates from U1 PASS.
  - Boot includes assertion verifying every `business_brands.slug` resolves to ≥1 `brand_fees` row.

- U3. **Resolver extension + range guardrails**

  **Goal:** Extend `hydratePropertyFinancials` (and the property-create route flow) to cascade flag fees → per-property Layer-3 fee columns at property creation and when a property's `brand_id` changes. Add `assumption_guardrails` rows for every new fee key. ADR-007 preserved (DI: route layer resolves, passes to engine).

  **Requirements:** R5, R10, R11

  **Dependencies:** U1, U2

  **Files:**
  - Modify: `artifacts/api-server/src/defaults.ts` — extend `hydratePropertyFinancials` to populate the 8 fee columns from flag-keyed defaults
  - Modify: `artifacts/api-server/src/routes/properties.ts` — call the new cascade on property create AND on brand_id change (PATCH route)
  - Create: `artifacts/api-server/src/migrations/assumption-guardrails-mgmt-co-fees-001.ts` (seed guardrail rows for the new fee keys)
  - Modify: `artifacts/api-server/src/startup/migrations.ts` (register)
  - Test: `artifacts/api-server/src/tests/finance/mgmt-co-fees-hydration.test.ts`

  **Approach:**
  - Resolver consults `management_company_fees` (Tier A) + `brand_fees` JOINED to `business_brands` by `slug` to populate property column values
  - Cascade triggers: (a) property create, (b) property `brand_id` PATCH, (c) explicit recalculation request
  - Skip cascade if `has_mgmt_co_override=true`
  - ADR-007: resolver lives in api-server route/service layer; engine receives populated property row, reads Layer-3 columns directly

  **Patterns to follow:** `applyBracketLayerDefaults` (`defaults.ts:255-301`) and `hydratePropertyFinancials` (`defaults.ts:163-200`).

  **Test scenarios:**
  - Happy path: new property creation populates all 8 fee columns from assigned flag's `brand_fees`.
  - Happy path: PATCH `brand_id` triggers re-cascade.
  - Happy path: property with `has_mgmt_co_override=true` is NOT updated by cascade.
  - Edge case: STR-flag property gets STR fee columns populated, hotel-flag fields remain NULL (or 0, decide during impl).
  - Edge case: hotel-flag property gets Brand Stack populated; STR channel columns remain NULL/0.
  - Edge case: missing brand_fees row for a flag → resolver throws clear error (does NOT silently populate with 0).
  - Integration: range guardrails fire on out-of-band fee values via Fabio minion.

  **Verification:** All gates from U1 PASS. Engine tests still pass (no engine-side change yet).

- U4. **Admin UI: Model Defaults / Management Co + Brands tabs**

  **Goal:** Add the two new tabs to `ModelDefaultsTab.tsx`. Management Co tab edits Tier A (Mgmt + Performance) `management_company_fees` rows. Brands tab lets admin view all H+ flags, drill into a flag to edit its `brand_fees` rows. Range-quality dots powered by `assumption_guardrails`.

  **Requirements:** R1, R3, R4, R11

  **Dependencies:** U2

  **Files:**
  - Create: `artifacts/hospitality-business-portal/src/components/admin/model-defaults/ManagementCoTab.tsx`
  - Create: `artifacts/hospitality-business-portal/src/components/admin/model-defaults/BrandsTab.tsx`
  - Modify: `artifacts/hospitality-business-portal/src/components/admin/ModelDefaultsTab.tsx` (register new tabs)
  - Create / extend API spec: `lib/api-spec/` — new routes for `/api/admin/management-company-fees`, `/api/admin/brands`, `/api/admin/brand-fees`
  - Generate API client: `pnpm --filter @workspace/api-spec run codegen`
  - Test: smoke tests for the new pages + design review per CLAUDE.md §11

  **Approach:**
  - Mirror `CompanyTab.tsx:122-128` nested Tabs pattern
  - Editable rows with `EditableValue` component (existing pattern)
  - Range-quality dot on the right edge of each percentage chip per current contract

  **Patterns to follow:** `model-defaults/CompanyTab.tsx`, `model-defaults/PropertyUnderwritingTab.tsx`.

  **Test scenarios:**
  - Happy path: edit a Tier A percentage → save → reload → value persisted; cascade visible on properties without override.
  - Happy path: edit a per-flag Brand Stack percentage → cascade affects only properties on that flag.
  - Edge case: percentage outside guardrail range → red range-quality dot rendered.
  - Edge case: read-only on STR flag's hotel-stack fields (those rows don't exist).

  **Verification:** `/post-coding-design-review` per CLAUDE.md §11. Typecheck clean. Magic-numbers gate PASS.

- U5. **Front-app UI: Company / Mgmt Co Assumptions tab**

  **Goal:** Add a new tab on the existing Company route showing the Mgmt Co Assumptions surface where company-level users edit working fee values. Reuses the Admin tab UI patterns at the user-facing role.

  **Requirements:** R1, R2, R11

  **Dependencies:** U4

  **Files:**
  - Create: `artifacts/hospitality-business-portal/src/components/company/MgmtCoAssumptionsSection.tsx`
  - Modify: `artifacts/hospitality-business-portal/src/components/company-assumptions/CompanyAssumptionsTabsView.tsx` (register new tab)
  - Test: smoke tests + design review

  **Approach:**
  - Same fee editor components from U4 (extract to shared if needed)
  - "Seed = default; save = source of truth" lifecycle: front-app values seed from `model_defaults` on first view, become source of truth after user save
  - Range badges sourced 100% from specialist / assumption_guardrails per `analyst-intelligence-display-pattern`

  **Patterns to follow:** `CompanyAssumptions.tsx` existing tabs.

  **Test scenarios:**
  - Happy path: first-time view shows seeded defaults from `model_defaults`.
  - Happy path: user edits + saves → cascade fires per R10.
  - Edge case: range badge shows "out of range" chip when user value falls outside guardrails.

  **Verification:** `/post-coding-design-review` per §11. Typecheck. Magic-numbers gate PASS.

- U6. **Convert ManagementFeesSection to read-only display**

  **Goal:** The per-property Management Fees section becomes a read-only "FYI display" — shows the resolved Layer-3 fee values with their source flag, no edit controls. Remove the `?? DEFAULT_*` UI-layer fallbacks (CLAUDE.md §2 violations).

  **Requirements:** R2, R3

  **Dependencies:** U3 (Layer-3 must be guaranteed populated)

  **Files:**
  - Modify: `artifacts/hospitality-business-portal/src/components/property-edit/ManagementFeesSection.tsx`
  - Remove the UI-layer `?? DEFAULT_*` fallbacks at `ManagementFeesSection.tsx:130,136,146`
  - Test: smoke test that page renders without crash, no edit affordances present

  **Approach:**
  - Replace `EditableValue` with read-only display components
  - Show "Edit in Mgmt Co Assumptions" link routing to the front-app surface from U5
  - Surface the property's assigned flag (e.g., "H+ STR Ultra-Luxury")
  - Show fee source per row (`from flag: H+ STR Ultra-Luxury / Brand Stack`)

  **Patterns to follow:** Read-only display patterns in `PropertyDetail.tsx` (canonical Report archetype).

  **Test scenarios:**
  - Happy path: section renders with resolved fee values; no edit controls.
  - Happy path: "Edit in Mgmt Co Assumptions" link routes correctly.
  - Edge case: property with `has_mgmt_co_override=true` shows an override badge.

  **Verification:** `/post-coding-design-review` per §11. Typecheck. Magic-numbers gate PASS.

### Phase 2: Cleanup (separate PR, lands after Phase 1 verifies)

- U7. **Engine bypass cleanup at `company-engine.ts:195` (CC-only, §9)**

  **Execution note:** This is in §9 protected surface (shell-CC authoring authority only). Verify Phase 1 (U1–U6) is merged and Layer-3 hydration is producing correct values on existing properties before this unit.

  **Goal:** Rewrite `lib/engine/src/company/company-engine.ts:195` to read `property.baseManagementFeeRate` directly (no `?? DEFAULT_BASE_MANAGEMENT_FEE_RATE` fallback). Verify the engine still produces correct results for all 7 demo properties.

  **Requirements:** R5, R6

  **Dependencies:** U1, U2, U3, U6 (Phase 1 fully merged)

  **Files:**
  - Modify: `lib/engine/src/company/company-engine.ts` (remove `?? DEFAULT_*` at line 195)
  - Test: `artifacts/api-server/src/tests/engine/company-engine.test.ts` — verify cash flow output unchanged for all 7 demo properties

  **Approach:**
  - Trust the three-layer resolver guarantee (Layer 3 always populated post-U3)
  - If property's `baseManagementFeeRate` is NULL at this point, that's a Layer-3 hydration bug — should fail loudly, not silently fall back

  **Test scenarios:**
  - Happy path: all 7 demo properties' cash flows match pre-cleanup expectations.
  - Edge case: property with NULL `baseManagementFeeRate` → engine throws clear error (regression test for the new failure mode).
  - Edge case: STR property's incentive (12% GOP) still applies.

  **Verification:** All engine proof tests PASS. Magic-numbers gate PASS.

- U8. **Delete `DEFAULT_*` business constants (CC-only, §9)**

  **Execution note:** §9 protected surface. Verify U7 has merged and engine proof tests all pass.

  **Goal:** Delete the TS DEFAULT_* business constants per CLAUDE.md §2. Each deletion is preceded by `grep` to verify no remaining consumers. Mirrored deletions in `lib/db/src/constants*.ts`. Constants barrel updated.

  **Requirements:** R6

  **Dependencies:** U7

  **Files:**
  - Modify: `lib/shared/src/constants-brand.ts` (delete all 6 DEFAULT_* business constants)
  - Modify: `lib/shared/src/constants-business-models.ts` (delete `DEFAULT_BASE_MANAGEMENT_FEE_RATE`, `DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE`; verify `DEFAULT_VRBO_*` references before deleting that family)
  - Modify: `lib/shared/src/constants.ts` (delete `DEFAULT_SERVICE_FEE_CATEGORIES`, `DEFAULT_SERVICE_TEMPLATES` — CLAUDE.md §2 Violation Example 3)
  - Modify: mirrored copies in `lib/db/src/constants-brand.ts` + others (these are compiled mirrors)
  - Modify: any remaining import sites flagged by typecheck (will surface as errors)
  - Test: typecheck must pass; `check-magic-numbers.ts` PASS; engine proof tests PASS

  **Approach:**
  - One commit per constants file (cleaner diff review)
  - Each deletion preceded by repo-wide grep verification: 0 import sites before deletion
  - If grep finds a non-test consumer that survived Phase 1, that consumer needs to be converted first

  **Test scenarios:**
  - Happy path: `tsc --noEmit` clean across all packages.
  - Happy path: `check-magic-numbers.ts` PASS (the constants weren't masking violations elsewhere).
  - Happy path: engine proof tests PASS.

  **Verification:** All typecheck, magic-numbers, and engine proof tests PASS.

---

## System-Wide Impact

- **Interaction graph:** New cascade in property-create + property-PATCH-brand-id routes. Engine reads unchanged. Admin Model Defaults UI + front-app Company route both gain new tabs.
- **Error propagation:** Missing seed rows fail boot via extended `assertRequiredModelDefaults()`. Missing `brand_id` on a property after migration is a typecheck error (NOT NULL). Cascade failures surface as 5xx with clear error messages.
- **State lifecycle risks:** Two-phase delivery is critical. Phase 1 must fully land + verify Layer-3 hydration before Phase 2 deletes any constants — otherwise engine bypass at `company-engine.ts:195` reads from a deleted constant and crashes.
- **API surface parity:** New routes — typed contracts via `lib/api-spec/`. Frontend hooks regenerated via `pnpm --filter @workspace/api-spec run codegen`.
- **Integration coverage:** Cross-layer: cascade → engine → income statement. Engine proof tests cover this.
- **Unchanged invariants:** Engine reads `property.X` unchanged. ADR-007 DI preserved. `company_service_templates` + `property_fee_categories` (Base Mgmt sub-breakdown) unchanged. Existing `BUSINESS_MODEL_DEFAULTS` consumed at `resolve-assumptions.ts:391` unchanged (it's already DB-fed).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Phase 2 deletes a constant still consumed somewhere → build breaks | Grep verification before each deletion in U8; one commit per file for clean revert |
| Layer-3 hydration silently misses a property → engine reads NULL → engine crash post-cleanup | U3 test scenario explicitly covers NULL Layer-3; engine bypass cleanup in U7 fails loudly on NULL |
| New brand_fees seed slugs don't match cascade's expected slugs (icp-brackets-style silent fail) | Startup assertion: every `business_brands.slug` resolves to ≥1 `brand_fees` row |
| Drizzle migration drift (one folder, not both) | Three-folder mirror per `schema-migrations.md` runbook; runtime guards self-heal fresh DBs |
| Replit Agent stages commits on this branch under CC PR title | Author-email diff audit before merge per `cc-replit-branch-hygiene-2026-05-10` |
| OTA channel commission figures shift over time (Airbnb, VRBO, etc.) | Each seed row carries `source_url` + `last_checked` columns; STR specialist plan adds Pietro minions for periodic refresh |
| Cascade triggers on every property when admin edits a single percentage → performance | Batched UPDATE in a transaction; cascade is idempotent |

---

## Phased Delivery

### Phase 1 — Build new infrastructure (one PR)

U1 → U2 → U3 → (U4 + U5 in parallel) → U6

Lands when: typecheck clean, all tests pass, design reviews clean, demo properties show correct Layer-3 hydration on boot, engine output unchanged (still uses `?? DEFAULT_*` fallback at this point).

### Phase 2 — Cleanup (separate PR, after Phase 1 verification)

U7 → U8

Lands when: engine proof tests pass, typecheck clean across all packages, magic-numbers gate PASS, no remaining `DEFAULT_*` business-constant imports in any non-test file.

---

## Documentation / Operational Notes

- `docs/solutions/architecture-patterns/hplus-multi-flag-brand-operator-model-2026-05-13.md` — already written; remains authoritative as the domain pattern.
- CLAUDE.md "Recent Significant Changes" — add an entry after Phase 2 merges noting the §2 brand-stack cleanup.
- Memory: `project-mgmt-co-fees-centralization-plan.md` updates to `status: complete` after Phase 2.
- Coordination: STR specialist plan + DB Custodian plan are concurrent tracks; verify their schema-drift checks account for the new tables.

---

## Sources & References

- Architecture pattern: `docs/solutions/architecture-patterns/hplus-multi-flag-brand-operator-model-2026-05-13.md`
- Synthesis file (working): `.local/tasks/mgmt-co-fees-centralization-synthesis-2026-05-13.md`
- Schema-migrations runbook: `docs/runbooks/schema-migrations.md`
- Two-phase column drop: `docs/solutions/conventions/drizzle-two-phase-column-drop-runbook-2026-05-13.md`
- CC branch hygiene: `docs/solutions/workflow-issues/cc-replit-branch-hygiene-2026-05-10.md`
- OTA rate sources: Airbnb (https://www.airbnb.com/help/article/1857), VRBO (https://help.vrbo.com/articles/How-is-the-booking-fee-calculated), Booking.com (per research, 2026-05-13), Plum Guide (https://help.plumguide.com/en/articles/4684372-plum-guide-fees) — all last-checked 2026-05-13
