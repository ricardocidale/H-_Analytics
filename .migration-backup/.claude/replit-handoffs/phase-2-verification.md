# Phase 2 Verification — audit commits already on main

**Owner:** Replit Agent
**Phase:** 2 (drift repair, already shipped)
**Blast radius:** Company Assumptions page, global-assumptions save path, scenario load/save, user manual, admin model-defaults
**Reversibility:** high — all changes are named-constant substitutions for equal-valued literals

---

## Purpose

Verify that the 5 audit commits shipped in this session did not regress
any UI or data flow. Everything below is about **confirmation**, not new
work. If anything fails, file a bug with the commit hash and stop.

## Commits to verify

1. `ae563c1c` — CompanyAssumptions.tsx constant drift, dead code, savedTabs hydration
2. `a417f2b1` — company-assumptions sections shared formData, slider bounds, dead layout
3. `f916300e` — TaxSection constants + ServiceTemplateCard rename-safe help lookup
4. `0ce1f06b` — centralize Analyst badge citations (`citations.ts`)
5. `5d4b4111` — D-1 drift repair (5 sites now use `DEFAULT_COMPANY_OPS_START_DATE`)

---

## What changed in each surface

### S1 (DB schema)
- `shared/schema/config.ts:101` — `companyOpsStartDate` column `.default()` now references `DEFAULT_COMPANY_OPS_START_DATE` (value unchanged: `"2026-06-01"`).
- **No migration required** — literal replaced with import of equal value.

### S2 (sync helpers)
- `server/syncHelpers.ts` — `SEED_GLOBAL_ASSUMPTIONS.companyOpsStartDate` uses the constant. Same value.

### S3 (seeds)
- `server/seeds/properties.ts` — auto-seed inserts use the constant.

### S4 (client types)
- `client/src/lib/api/types.ts` — `GlobalResponse` now includes `savedTabs: string[]`.

### S5 (user manual)
- `client/src/pages/checker-manual/sections/Section04GlobalAssumptions.tsx` — row for `companyOpsStartDate` renders `DEFAULT_COMPANY_OPS_START_DATE` instead of hardcoded `"2026-06-01"`.

### S7 (admin UI)
- `client/src/components/admin/model-defaults/CompanyTab.tsx` — the "Operations Start Date" input falls back to the constant.

### UI changes (CompanyAssumptions.tsx + sub-sections)
- **Per-tab Save** — the Revenue tab now saves `incentiveManagementFee` via its own tab Save button (the inline "Save Incentive" button was removed). Incentive-fee edits flow through the parent's shared `formData`.
- **Vocabulary fix** — the Analyst button tooltip now reads "Ask the Analyst about <Tab>" (was "Run The Analyst on <Tab>").
- **Watchdog math** — tranche-gap computation now uses `DAYS_PER_MONTH` from `@shared/constants` (was a literal `30.44`).
- **`savedTabs` gating** — hydrated from `global.savedTabs[]` on mount and re-hydrates on every server refresh (previously inferred from `lastAssumptionChangeAt`, which could drift).

---

## Verification checklist

### 1. Type & lint
```bash
npx tsc --noEmit
npm run lint
```
Both must return 0 errors.

### 2. Test suites
```bash
npm run test:summary
npm run verify:summary
```
- `test:summary` — all ~4,191 tests pass.
- `verify:summary` — must show **UNQUALIFIED**.
- If either regresses, open `tests/engine/operating-reserve-cash.test.ts` first — that's the canary for financial-engine changes.

### 3. Dev server smoke test
```bash
npm run dev
```
Navigate to the running URL and verify:

**`/company/assumptions` page**
- [ ] Page loads without console errors.
- [ ] All 6 tabs render: Company, Funding, Revenue Model, Compensation, Overhead, Property Defaults.
- [ ] Each tab has its own "Save" button at the bottom.
- [ ] The "Ask the Analyst" button tooltip reads **"Ask the Analyst about <tab name>"**.
- [ ] Deep-linking `?tab=funding` opens the Funding tab.
- [ ] Legacy URL `?tab=setup` redirects to `company` tab (backward-compat).

**Revenue tab specifically**
- [ ] Adjust the "Default Incentive Fee" input (e.g., change 12% → 15%).
- [ ] Click the **tab's bottom Save button** (there should be **only one** Save button on this tab — the old inline "Save" next to the incentive input should be gone).
- [ ] Verify the value persists after page reload.
- [ ] Verify the Revenue tab's Save button becomes enabled when you edit (was "dirty" before, still works now).

**Funding tab**
- [ ] The two Capital Raise sliders have the same min/max (100K–1.5M).
- [ ] Tranche dates save and reload correctly.
- [ ] The Analyst watchdog dialog surfaces for a funding save that violates a benchmark (e.g., Tranche 2 date before Tranche 1).

**Property Defaults tab**
- [ ] Exit cap rate + sales commission save.
- [ ] Industry Vertical dropdown populates from `/api/exit-multiples`.

### 4. Admin → Model Defaults page
- [ ] Open Admin → Model Defaults → Company tab.
- [ ] "Operations Start Date" field shows `2026-06-01` by default.
- [ ] Edit it, click Save, reload — persists.

### 5. User manual Section 4
- [ ] Open the checker manual (/checker-manual or wherever it lives).
- [ ] Section 4 "Global Assumptions" row for `companyOpsStartDate` shows `2026-06-01` as the Default column value.

### 6. Scenario save/load round-trip (critical for savedTabs contract)
- [ ] Open Scenarios, save a new scenario from the current state.
- [ ] Edit some assumptions, save a different scenario.
- [ ] Load the first scenario back.
- [ ] Go to `/company/assumptions` — verify the `savedTabs` state is correct (tabs previously saved should still show as saved; gating should not unlock tabs that were never saved).

### 7. Database sanity
```bash
psql $DATABASE_URL -c "SELECT company_ops_start_date, saved_tabs FROM global_assumptions ORDER BY id DESC LIMIT 5;"
```
- [ ] `company_ops_start_date` column value matches expected (either user-set or the default).
- [ ] `saved_tabs` column returns a valid JSONB array.

---

## Rollback plan (if verification fails)

All 5 commits are clean named-constant substitutions. If anything regresses:

1. Identify which commit introduced the regression (`git bisect` between `e5b64777` and the prior audit commits).
2. Revert only the offending commit with `git revert <hash>`.
3. Push revert, re-run verification.

**No DB data is at risk** — the column values are literally identical to what they were before the audit.

---

## Report back

After verification, append a note to `.claude/session-memory.md` under the current session entry:

> Phase 2 verification: PASS/FAIL. Tests: <count>/<total>. verify:summary: UNQUALIFIED/QUALIFIED/ADVERSE. Notes: <anything surprising>.
