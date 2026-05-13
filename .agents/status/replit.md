# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-13T18:00:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

feat(#1626): Playwright narrow-layout squeeze regression — all 6 tests pass
fix: apply min-w-0/shrink-0 overflow fix to remaining land-value-percent row in CapitalStructureSection

## What Replit Did This Session

Task #1629: Audited all `flex justify-between items-center` rows in
`artifacts/hospitality-business-portal/src/components/property-edit/` for
the label overflow discipline (min-w-0 on left, shrink-0 on right).

Found all files already fully fixed EXCEPT one row in CapitalStructureSection.tsx:
the land value percent display row (showing `40%` on the left and
"Depreciable basis: $..." on the right) was missing both classes.

Applied:
- `min-w-0` to the left `<span>` (text-land-value-percent)
- `shrink-0` to the right `<span>` (depreciable basis)

Typecheck passes clean (0 errors).

Task #1626 — Completed the Playwright narrow-layout squeeze regression guard:
- Created `tests/layout/` workspace package (`@workspace/tests-layout`)
  - `playwright.config.ts` — resolves Nix Chromium (Replit) or Playwright-installed (CI);
    falls back to undefined so `playwright install --with-deps chromium` works on Ubuntu CI
  - `fixtures/narrow-layout.html` — self-contained HTML fixture with a PROTECTED card
    (min-w-0 label + shrink-0 chip wrapper) and a REGRESSION card (rigid nowrap label
    + min-width:0/flex-shrink:1 chip) at 246 px inner width simulating one column of a
    2-column grid at 768 px
  - `tests/narrow-layout.spec.ts` — 6 Playwright tests; per-format minimum thresholds:
    percent ≥ 40 px, dollar ≥ 40 px, number ≥ 15 px; regression control asserts
    unprotected chip ≤ 35 px (measured ~30 px vs protected ~56 px)
- Added `tests/*` to `pnpm-workspace.yaml`
- Added `layout-tests` CI job to `.github/workflows/ci.yml` (installs Playwright Chromium
  with `--with-deps`, runs the 6 Playwright tests on ubuntu-latest)
- Kept complementary source-level test `narrow-layout-squeeze.test.ts` (18 vitest tests)
  in the portal package — all 397 portal tests still pass
Files touched: CapitalStructureSection.tsx (1 row, 2 class additions).

## Files Replit Owns Right Now

None — session complete.

## Handoff to CC

None pending.

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
