# ADR-009 Phase 1 UI: EWW Income Statement Row

## Doctrine Freeze Gate Check

- **Governing ADR:** [ADR-009](../../docs/architecture/decisions/ADR-009-usali-12th-edition.md)
- **ADR status:** `Accepted` (2026-04-28)
- **Last ADR edit:** 2026-04-28 (initial acceptance)
- **Engine change soaked:** `expenseEWW` field landed in commit `a84708bd` last session. Current session is the soak session. Gate satisfied.
- **Gate decision:** ✅ Cleared to execute.

## Context

USALI 12th Edition (effective 2026-01-01) introduced the EWW Schedule —
Electricity, Water & Waste — as a discrete undistributed expense line in the
income statement. ADR-009 Phase 1 added the derived field `expenseEWW`
(= `expenseUtilitiesVar + expenseUtilitiesFixed`) to the financial engine
(`engine/types.ts`, `engine/property/property-engine.ts`).

This packet adds the single UI surface change: a new "Energy, Water & Waste"
row in the property income statement table, placed in the undistributed
expenses section below GOP, using `month.expenseEWW`.

No new inputs, no schema changes, no migration. Pure presentation layer.

Owner: **Replit Agent** (UI lane per `claude-replit-split.md`).

## Atomic-budget check

- **Sub-step count:** 4 (well under limit)
- **File count:** 2–3 (under limit)
- **Capability domains:** UI only

---

## Tasks

### S1: Locate the income statement table component

Find the component that renders the property income statement monthly/annual
table. It is likely under:
- `client/src/components/statements/`
- `client/src/features/property/`
- Search for the `expenseUtilitiesFixed` or `expenseUtilitiesVar` string —
  the EWW row goes immediately after wherever those render.

**Acceptance criteria:**
- Component file identified
- Confirmed it receives `month.expenseUtilitiesFixed` (or equivalent)

---

### S2: Add the EWW row

In the income statement table, add a row for `expenseEWW` in the
**undistributed expenses section**, placed immediately after the utilities
rows (after `expenseUtilitiesFixed`):

```
Energy, Water & Waste (EWW)    | month.expenseEWW
```

Label text: **"Energy, Water & Waste"**

The row should:
- Format as a cost line (negative/red when expenses are shown as negative,
  or matching the convention of the sibling utility rows)
- Use the same formatting helper as `expenseUtilitiesVar` /
  `expenseUtilitiesFixed`
- NOT appear if `expenseEWW === 0` — use the same conditional guard as
  nearby rows (if any rows are conditionally hidden)
- Include a tooltip: `"USALI 12th Edition EWW Schedule: Electricity, Water
  & Waste aggregate"`

**Acceptance criteria:**
- EWW row visible in the income statement for any property with non-zero utility expenses
- Label matches exactly: "Energy, Water & Waste"
- Value matches `expenseUtilitiesVar + expenseUtilitiesFixed` (verify by
  inspecting one month's numbers in browser devtools)

---

### S3: Verify exports include EWW

Check whether the income statement Excel/PDF export (`client/src/components/dashboard/dashboardExports.ts` or similar) pulls from the same statement row array. If it does, the EWW row will appear automatically. If the export has a hardcoded row list, add the EWW row there too.

**Acceptance criteria:**
- Export includes EWW row OR confirm export derives rows automatically from
  the table (document which in the completion report)

---

### S4: Verification

Run in Replit terminal:
```
npx tsc --noEmit
npm run lint
npm run test:file -- tests/audit/vocabulary-compliance.test.ts
npm run test:summary
npm run verify:summary
```

All five gates must pass. Commit with:
```
Surfaces: S-income-statement, S-property-detail
ADR: ADR-009 Phase 1 UI — EWW income statement row
Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED
```

**Acceptance criteria:**
- All five pre-commit gates pass
- EWW row visible in browser on property income statement
- EWW value = utilities variable + utilities fixed (spot-checked in devtools)

---

## What CC already shipped (do not re-implement)

| Commit | What landed |
|--------|------------|
| `5ed0728a` | `expenseEWW: number` added to `MonthlyFinancials` in `engine/types.ts` |
| `a84708bd` | `expenseEWW = expenseUtilitiesVar + expenseUtilitiesFixed` computed in `engine/property/property-engine.ts`; field passed through `server/calculationChecker.ts` |

The engine computes `expenseEWW` on every pro-forma run. No engine work needed.

---

## References

- ADR-009: `docs/architecture/decisions/ADR-009-usali-12th-edition.md`
- Engine field: `engine/types.ts` line ~267 (`expenseEWW`)
- Engine computation: `engine/property/property-engine.ts` (after `expenseUtilitiesFixed`)
- USALI 12th Edition, effective 2026-01-01
