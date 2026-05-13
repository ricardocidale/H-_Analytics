# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-13T15:59:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

plan: financial defaults integrity + IRR calibration fix (for CC)

## What Replit Did This Session

Diagnosed IRR 50%+ root causes and produced a structured implementation plan for CC:
- Identified 3 architectural gaps (model_defaults bypass, engine TS fallbacks, seed calibration)
- Ran architect analysis to validate sequencing and calibration recommendations
- Produced `docs/plans/2026-05-13-003-fix-financial-defaults-integrity-and-irr-calibration-plan.md`
- Plan covers 5 ordered phases: seed ownership lock → server hydration layer →
  seed calibration + magic-number cleanup → remove engine DEFAULT_* fallbacks →
  wire refiMaxLtvToOriginal cap (U3)

Swept all admin model-defaults tab files for the label-wraps-around-value flex defect:
- FieldHelpers.tsx: wrapped EditableValue in `<div className="shrink-0">` in PctField, DollarField, and NumberField
- MarketMacroTab.tsx: added `gap-2` and `min-w-0` to the Fiscal Year Start Month flex row
- PropertyUnderwritingTab.tsx: fixed Revenue Analyst CTA row (min-w-0 on <p>, shrink-0 on button wrapper); fixed Macro Inflation Rate read-only row (min-w-0 on Label, shrink-0 on <span>)
- DdTemplateTab.tsx: added min-w-0 to card header left div + shrink-0 to Badge; added min-w-0 to template item flex-1 div + shrink-0 to stop-gate control div

## Files Replit Owns Right Now

None — session complete.

## Handoff to CC

**Plan for execution:** `docs/plans/2026-05-13-003-fix-financial-defaults-integrity-and-irr-calibration-plan.md`

Key facts CC must know:
1. `SEED_EXIT_CAP_RATE_LUXURY = 0.062` → recalibrate to 0.085 (lib/shared/src/constants.ts)
2. `refinanceLtv` casing bug on 3 properties (property-data.ts lines 545-547) — fix to `refinanceLTV`
3. `refiMaxLtvToOriginal` column exists in DB schema but engine ignores it; Phase 5 wires it
4. All five phases must run in order — Phase 4 (fallback removal) will break things if run before Phases 1-3
5. Architect says: seed ownership fix (insert-or-skip) must happen BEFORE anything else to prevent
   CI/boot cycles from overwriting admin-managed model_defaults rows

## Pending Replit Work

- U3 UI: Add refi LTV cap field to `DebtSection.tsx` — blocked on CC completing Phase 5 engine wiring

## Do Not Touch (CC-owned surfaces)

- `lib/engine/src/` — financial engine
- `lib/calc/src/` — financial calculators
- `lib/shared/src/constants*.ts` — shared constants
- `lib/db/src/` — DB schema + constants
- `artifacts/api-server/src/finance/` — finance routes
- `artifacts/api-server/src/report/` — report routes
- `artifacts/api-server/src/migrations/*.ts` — runtime guards
- `artifacts/api-server/src/tests/proof/` and `tests/engine/` — engine tests
