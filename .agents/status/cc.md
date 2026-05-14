# CC (Claude Code Shell) — Agent Status

<!-- CC is the SOLE WRITER of this file. Replit reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-14T14:30:00Z
Status: active

## Active Branch

feat/plan-001-u1-seed-calibration (PR #154 open)

## Last Commit on Branch

813fd8928  docs(solutions): document ICP bracket slug mismatch + Layer-2 overlay inert fix

## What CC Did This Session

Plan 001 U1 + DB audit fixes — cherry-picked from fix/db-audit-and-seed-calibration onto clean main branch

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

None — all committed and pushed to PR #154.

## Plan 001 Status

- U5 (icp_brackets schema columns): DONE ✅ (on main)
- U6 (applyBracketLayerDefaults seeding pathway): DONE ✅ (on main)
- U1 (demo property exit-cap overrides + bracket slug fix): DONE ✅ (PR #154)
- U8 (Duplex full-equity refi rule): DONE ✅ (PR #154 — properties-demo-seed-overrides-002)
- U7 (bracket catalog backfill with market values): NOT done — icp-brackets-004 only fixes slug renames + applies overlay; full geography-tier catalog (Davi classifier) is on origin/feat/seed-calibration-bracket-defaults, not yet merged
- IRR verification (25–30% band): NOT done — depends on U7 + U1 landing in prod

## What's Pending

- Merge PR #154 after review
- Decide whether to land origin/feat/seed-calibration-bracket-defaults (geography-tier Davi classifier) — bigger lift, separate PR
- IRR verification after prod boot runs the migrations
- Plan 006 Phase 2 (DEFAULT_* constants cleanup) still outstanding

## Handoff to Replit

PR #154 open. Replit can smoke-test after merge:
- Check that icp_brackets rows have correct slugs (soft-brand-boutique, performance-managed-str, agritourism-experiential)
- Check that demo properties have updated exit_cap_rate values
- Do NOT touch any files in the Do Not Touch list below

## Do Not Touch

- `lib/engine/src/` — financial engine (CC-only per CLAUDE.md §9)
- `lib/calc/src/` — financial calculators (CC-only)
- `artifacts/api-server/src/finance/` — finance routes (CC-only)
- `artifacts/api-server/src/migrations/` — runtime guards (CC-only)
- `lib/db/src/schema/` — DB schema (CC-only)
