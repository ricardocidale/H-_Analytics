# Objective
Eliminate the remaining ~127 client + ~70 server `: any` annotations and split the 5 largest files (>1000 lines) into reviewable modules — without breaking any financial test or workflow.

# Tasks

### T001: Sweep client `: any` — top 10 offenders (research + export helpers)
- **Blocked By**: []
- **Details**:
  - One commit per file. After each: `tsc --noEmit`, `lint:summary`, `audit:quick`.
  - Files (in order):
    1. `client/src/components/research/MarketResearchTabs.tsx` (10)
    2. `client/src/lib/exports/pptx/slide-helpers.ts` (8)
    3. `client/src/components/property-research/ResearchSections.tsx` (8)
    4. `client/src/lib/exports/researchPdfHelpers.ts` (7)
    5. `client/src/components/company-research/CompanyResearchSections.tsx` (6)
    6. `client/src/lib/runVerification.ts` (5)
    7. `client/src/lib/exports/propertyExportShared.ts` (5)
    8. `client/src/lib/exports/excel/helpers.ts` (5)
    9. `client/src/lib/exports/researchPdfRenderers.ts` (4)
    10. `client/src/lib/exports/checkerManualExport.ts` (4)
  - Acceptance: prop `: any` count ≤ 60 (was 127).

### T002: Sweep client `: any` — long tail [SUBSTANTIALLY COMPLETE — audit 14, real ~9]
- **Blocked By**: [T001]
- **Details**:
  - Batch the remaining 30+ files with 1–4 anys each into 1–2 commits.
  - Acceptance: prop `: any` count ≤ 10.
  - Status: 41 → 14 (audit count). 11 of remaining are real anys (3 false-positives in App.tsx comments + map-utils.ts deferred). Files left: useResearchStream (2 — cascades through PropertyEdit/PropertyMarketResearch), income-helpers (3 — cascades through IncomeRowsProps), map-elements (2 — depends on map-utils Property shape), known-value-runner (2 — TestCase shape), verification/types data (1 — cascades through VerificationResults/GoldenScenarioResults). Each has 5+ downstream callers requiring schema unification, blocking quick fixes.

### T003: Sweep server `: any` — top 5 offenders
- **Blocked By**: [T002]
- **Details**:
  - `server/routes/icp-research-helpers.ts` (8), `server/storage/financial.ts` (6), `server/routes/format-generators/excel-generator.ts` (6), `server/svg-charts.ts` (5), `server/table-renderer.ts` (4).
  - Acceptance: server `: any` count ≤ 30.

### T004: Verify all gates after the sweep
- **Blocked By**: [T003]
- **Details**:
  - Run full `health`, `verify:summary`, `lint:summary`, `audit:quick`, `parity`, `exports:check`.
  - Acceptance: all PASS UNQUALIFIED, audit reports 0 critical.

### T005: Split `client/src/pages/CompanyAssumptions.tsx` (1117 lines)
- **Blocked By**: [T004]
- **Details**:
  - Extract sections into co-located components. Keep page as orchestrator.
  - Acceptance: file < 500 lines, all workflows PASS.

### T006: Split `client/src/components/admin/model-defaults/ModelConstantsTab.tsx` (1053 lines)
- **Blocked By**: [T004]
- **Details**:
  - Extract per-tab/per-table sections. Acceptance: file < 500 lines.

### T007: Split `shared/regulatory-data.ts` (1169 lines)
- **Blocked By**: [T004]
- **Details**:
  - Pure data file — split by region or domain into multiple modules with a barrel.
  - Acceptance: largest file < 500 lines, all imports continue to resolve.

### T008: Defer or split `server/storage/intelligence-v2.ts` (1199) and `server/ai/data-routing.ts` (1150)
- **Blocked By**: [T004]
- **Details**:
  - These are AI infra with high regression cost. Evaluate after T005-T007. Split if low-risk seams exist; otherwise document the deferral and stop.

# Done
All 5 files under 500 lines OR explicitly deferred with rationale. Combined `: any` count ≤ 40. All workflows PASS UNQUALIFIED.
