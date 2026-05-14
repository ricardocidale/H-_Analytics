# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-14T18:00:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

docs(plans): rewrite 2026-05-13-005 with no-NULL enforcement rule

## What Replit Did This Session

- coderabbit-loop portability pass: extracted H+-specific §9 regexes to `.coderabbit-loop/protected-paths.conf` and blocked agent email to `.coderabbit-loop/blocked-emails.conf`; scripts now skip guards when config files absent
- Added Step 0 (print-logo) to both `coderabbit-loop-review.md` and `coderabbit-loop-autofix.md` — logo now shows before all precondition checks
- Removed unconditional `cr_banner` call from `coderabbit-loop-autofix.sh` — was firing on every subcommand, causing double banner
- Removed H+-specific language from all 6 slash commands and install script; install next-steps now point to coderabbit.ai/docs/cli
- Updated `docs/runbooks/coderabbit-loop-workflow.md` to reflect config-file approach, portable install instructions, and corrected gate descriptions

## Files Replit Owns Right Now

None — session complete.

## Handoff to CC

**Plan for CC to execute:**
`docs/plans/2026-05-13-005-refi-max-ltv-cap-calibration-and-admin-ui-plan.md`

**Summary:** Four independent phases — execute in any order:

- **P1** — `artifacts/api-server/src/seeds/property-data.ts`
  Change `SEED_REFI_MAX_LTV_TO_ORIGINAL = 1.00` → `0.70`. One line.

- **P2** — New migration + runtime guard (migration-guards topology)
  Update ALL properties: set `refi_max_ltv_to_original = 0.70` where NULL or > 0.70.
  No `will_refinance` filter — no-NULL rule applies to every property row.
  Guard file: `properties-refi-ltv-recalibration-001.ts`

- **P3** — `artifacts/hospitality-business-portal/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx`
  Add "Max Loan vs. Purchase Price" field to Refinance Terms section.
  Follow the STR Platform Fee pattern (separate fetch + local state + own Save button).
  Query key: `mc.funding.refiMaxLtvToOriginal` in `model_defaults`.

- **P4** — `artifacts/hospitality-business-portal/src/components/property-edit/CapitalStructureSection.tsx`
  Display fix only: badge shows `70%` not `0.70×`, tooltip rewording, slider max → 150.
  Do not change how value is stored or sent.

**Key context:**
- Engine cap logic is correct — do not touch `lib/engine/src/`
- `DEFAULT_REFI_MAX_LTV_TO_ORIGINAL = 0.70` in `lib/shared/src/constants-funding.ts` is correct
- `model_defaults` row `mc.funding.refiMaxLtvToOriginal` is already `0.70` — only property rows need fixing
- Creation path already correct — `hydratePropertyFinancials` writes value at insert time

## Pending Replit Work

None.

## Do Not Touch (CC-owned surfaces)

- `lib/engine/src/` — financial engine
- `lib/calc/src/` — financial calculators
- `lib/shared/src/constants*.ts` — shared constants
- `lib/db/src/` — DB schema + constants
- `artifacts/api-server/src/finance/` — finance routes
- `artifacts/api-server/src/report/` — report routes
- `artifacts/api-server/src/migrations/*.ts` — runtime guards
- `artifacts/api-server/src/tests/proof/` and `tests/engine/` — engine tests
