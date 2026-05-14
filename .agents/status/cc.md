# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-14T13:00:00Z
Status: idle

## Active Branch

feat/mgmt-co-fees-phase-1

## Last Commit on Branch

2dac8904e  fix(mgmt-co-fees): U6 — remove DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE fallback

## Last Commit on Branch

design(mgmt-co-fees): post-coding design review — input styling + card shadows

## What CC Did This Session

Plan 006 Phase 1 — ALL 6 UNITS COMPLETE + design review DONE

- U1: Extend business_brands + data migration (already done prior session)
- U2: Create management_company_fees + brand_fees tables + seed (already done prior session)
- U3: hydrateFeeColumns resolver + guardrails seed — DONE ✅
  - defaults.ts: new hydrateFeeColumns function (fill-nulls-only cascade)
  - routes/properties.ts: create + PATCH call sites
  - assumption-guardrails-mgmt-co-fees-001.ts: 7 guardrail rows
  - startup/migrations.ts: registered assumption_guardrails_mgmt_co_fees_001
- U4: Admin UI — Management Co Fees + Brands tabs — DONE ✅
  - routes/admin/fees.ts: admin CRUD routes
  - ManagementCoTab.tsx + BrandsTab.tsx components
  - ModelDefaultsTab.tsx + AdminSidebar.tsx + Admin.tsx wired
- U5: Company Assumptions → Mgmt Co Fees tab — DONE ✅
  - Public fee read routes (registerPublicFeesRoutes)
  - MgmtCoAssumptionsSection.tsx: read-only display + admin edit link
  - useCompanyAssumptionsForm.ts + CompanyAssumptionsTabsView.tsx wired
- U6: Remove DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE fallback — DONE ✅
  - ManagementFeesSection.tsx (property-edit): 3 ?? DEFAULT_ fallbacks removed

## Files CC Owns Right Now (uncommitted, working tree)

- `.claude/settings.local.json` — minor tweak

## What's Left for Plan 006

### Phase 2 (separate PR, depends on Phase 1 verified in prod)

- U7: Engine bypass cleanup at company-engine.ts:195 (CC-only, §9)
  - Remove ?? DEFAULT_BASE_MANAGEMENT_FEE_RATE at company-engine.ts:195
  - Verify all 7 demo properties still produce correct cash flows
- U8: Delete DEFAULT_* business constants (CC-only, §9)
  - lib/shared/src/constants*.ts migration of remaining DEFAULT_* constants

### Testing outstanding

- U2 migration test: artifacts/api-server/src/tests/migrations/mgmt-co-fees-seed.test.ts

### Design review

- U4 admin tabs: design review DONE ✅ (input styling + shadow-sm fixes applied)
- U5 company tab: design review DONE ✅ (shadow-sm fixes applied)

## Handoff to Replit

Branch ready for PR review. Phase 1 code complete. Replit can:
- Run the app and smoke-test the new Admin → Model Defaults → Management Co Fees tab
- Run the app and smoke-test the Company Assumptions → Mgmt Co Fees tab
- Do NOT touch any files in the Do Not Touch list below

## Do Not Touch

- `lib/engine/src/` — financial engine (CC-only per CLAUDE.md §9)
- `lib/calc/src/` — financial calculators (CC-only)
- `artifacts/api-server/src/finance/` — finance routes (CC-only)
- `artifacts/api-server/src/migrations/` — runtime guards (CC-only)
- `lib/db/src/schema/` — DB schema (CC-only)
