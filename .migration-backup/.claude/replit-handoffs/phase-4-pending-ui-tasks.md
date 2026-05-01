# Phase 4 — Pending UI Audit Fixes (tasks #9–#16)

**Owner:** Replit Agent
**Phase:** 4 (correctness + cleanup from Phase 3 audit)
**Blast radius:** company-assumptions editor (client-only)
**Reversibility:** high — each task is isolated; revert individually if needed
**Prereqs:** Phase 2 verification (`phase-2-verification.md`) must PASS first

---

## Context

`.claude/audit-inventory.md` holds the full dependency-surface map (S1–S13).
Every task below lists which surfaces it touches. Don't skip those.

`.claude/session-memory.md` has the running session log.

Rules to obey (read before executing):
- `.claude/rules/no-hardcoded-values.md`
- `.claude/rules/branding-vocabulary-enforcement.md`
- `.claude/rules/ui-patterns.md`
- `.claude/rules/recalculate-on-save.md`
- `.claude/rules/documentation.md`

Execute the tasks in **the order listed**. Commit each as its own git commit
with a `Surfaces: S?, S?…` footer (see existing audit commits on `main` for
the format). Run type-check + test:summary after each.

---

## Task #9 (P1) — Fix `EditableValue` unused `step` prop

**File:** `client/src/components/company-assumptions/EditableValue.tsx`
**Surfaces:** S4 (types)
**Risk:** low — the prop is declared but never used; removing it doesn't change any behavior.

### Problem

Lines 22–25 destructure `{ value, onChange, format, min, max, }` — omitting `step`.
Line 32 declares `step: number;` as a required type prop.
~18 call sites pass `step={…}` believing it affects the inline editor. It doesn't.

### Fix

Remove `step` from the type signature on line 32. Do **not** change the
function body. Callers may keep passing `step` — extraneous props are fine
in TS, and the Slider components next to each `EditableValue` still use
their own `step` prop.

### Expected diff (approximate)
```diff
   format: "percent" | "dollar" | "number";
   min: number;
   max: number;
-  step: number;
 }) {
```

### Verify
```bash
npx tsc --noEmit
npm run test:summary
```
Browse `/company/assumptions` and confirm all EditableValue instances still render
correctly (they should — no behavior changed).

---

## Task #10 (P1) — Delete dead `CateringSection.tsx`

**File:** `client/src/components/company-assumptions/CateringSection.tsx` (DELETE)
**Surfaces:** none
**Risk:** trivial — file is not imported anywhere (verified with `grep CateringSection`).

### Problem

The file is dead code. Not in `index.ts` barrel. Body message contradicts the
docstring ("deprecated" vs. "placeholder for future feature").

### Fix

```bash
rm client/src/components/company-assumptions/CateringSection.tsx
```

### Verify
```bash
grep -rn "CateringSection" client/ server/ shared/  # should return nothing
npx tsc --noEmit
```

---

## Task #11 (P2) — Import `DEFAULT_SERVICE_MARKUP` in `ServiceTemplateDialog` empty form

**File:** `client/src/components/company-assumptions/ServiceTemplateDialog.tsx`
**Surfaces:** S1 (DB default), S12 (skill docs if any reference 20%)
**Risk:** low — changes form initial state only; DB default unchanged.

### Problem

Lines 20–27 hardcode defaults:
```ts
export const emptyForm: FormState = {
  name: "",
  defaultRate: "2",
  serviceModel: "centralized",
  serviceMarkup: "20",
  ...
};
```

The DB schema default (`shared/schema/services.ts:22`) uses
`DEFAULT_SERVICE_MARKUP` from `@shared/constants`. The "new template"
form hardcodes `"20"` — if an admin bumps the constant, the form drifts.

### Fix

1. Import `DEFAULT_SERVICE_MARKUP` from `@shared/constants`.
2. Compute the string once at module level:
   ```ts
   const DEFAULT_SERVICE_MARKUP_PCT = (DEFAULT_SERVICE_MARKUP * 100).toFixed(0);
   ```
3. Use it in `emptyForm.serviceMarkup`.

For `defaultRate: "2"` — check if a `DEFAULT_*` constant exists for this
in `shared/constants.ts`. Search for `DEFAULT_SERVICE` prefixes. If no
canonical "new template initial rate" constant exists, leave `"2"` as a
UI prompt value and add a one-line comment:
```ts
// UI prompt — not a canonical default; user fills in
```

### Verify
```bash
npx tsc --noEmit
```
Open the Revenue tab, click "Add Service", confirm the markup field shows
the correct default from the constant (currently 20%).

---

## Task #12 (P2) — Use `STAFFING_TIERS` for `CompensationSection` fallbacks

**File:** `client/src/components/company-assumptions/CompensationSection.tsx`
**Surfaces:** S12 (named constants)
**Risk:** low — same values, now sourced from the canonical constant.

### Problem

Lines 84–85, 94–95, 109–110, 119–120, 131, 134–135 hardcode tier fallback
literals:
```ts
formData.staffTier1MaxProperties ?? global.staffTier1MaxProperties ?? 3
formData.staffTier1Fte ?? global.staffTier1Fte ?? 2.5
formData.staffTier2MaxProperties ?? global.staffTier2MaxProperties ?? 6
formData.staffTier2Fte ?? global.staffTier2Fte ?? 4.5
// ...staffTier3Fte fallback 7.0
```

`SummaryFooter.tsx:31–35` already uses `STAFFING_TIERS[0].maxProperties`,
`STAFFING_TIERS[1].fte`, etc. Match that pattern.

### Fix

Import `STAFFING_TIERS` from `@/lib/constants`, swap each literal for the
corresponding tier entry.

### Verify
Open Compensation tab, confirm tier defaults render correctly. Change
`STAFFING_TIERS` in constants (temporarily) to a different value, reload,
confirm the new value appears in the form. Revert.

---

## Task #13 (P2) — Update SAFE references in `company-assumptions/index.ts` docstring

**File:** `client/src/components/company-assumptions/index.ts`
**Surfaces:** S12 (internal docs)
**Risk:** zero — docstring only; no code.

**NOTE:** Claude Code will handle this task — pure docs change, no UI/DB touch.
Skip it on your end and let Claude's next audit commit include it.

---

## Task #14 (P2) — Add `DEFAULT_FIXED_COST_ESCALATION_RATE` fallback in `SummaryFooter`

**File:** `client/src/components/company-assumptions/SummaryFooter.tsx`
**Surfaces:** S11 (add a render test for missing-data path)
**Risk:** low — defensive fallback; DB column is `.notNull()` so currently unreachable, but the code shouldn't render `NaN%` in any edge case.

### Fix

1. Import `DEFAULT_FIXED_COST_ESCALATION_RATE` from `@/lib/constants`.
2. Line 61:
   ```diff
   -  {formatPercent(formData.fixedCostEscalationRate ?? global.fixedCostEscalationRate)}
   +  {formatPercent(formData.fixedCostEscalationRate ?? global.fixedCostEscalationRate ?? DEFAULT_FIXED_COST_ESCALATION_RATE)}
   ```

Optional: add a unit test `tests/client/summary-footer.test.tsx` asserting
the overhead-tab footer renders `3.0%/year` (or whatever the constant is)
when both `formData` and `global` have `fixedCostEscalationRate: undefined`.

### Verify
Open Overhead tab, confirm the footer line still reads correctly.

---

## Task #15 (P3) — Type `PropertyFeeSummaryTable` props

**File:** `client/src/components/company-assumptions/PropertyFeeSummaryTable.tsx`
**Surfaces:** S4 (types)
**Risk:** low — typing tightens the contract; no runtime change.

### Fix

Lines 13–14:
```diff
 interface PropertyFeeSummaryTableProps {
-  properties: any[];
-  allFeeCategories: any[];
+  properties: PortfolioPropertySummary[];
+  allFeeCategories: FeeCategoryResponse[];
 }
```

Add imports:
```ts
import type { PortfolioPropertySummary } from "./types";
import type { FeeCategoryResponse } from "@/lib/api";
```

### Verify
```bash
npx tsc --noEmit
```
If type errors surface at the one call site (`ManagementFeesSection`), they
point to a real mismatch worth investigating.

---

## Task #16 (P3) — Tooltip citation in `CompensationSection`

**File:** `client/src/components/company-assumptions/CompensationSection.tsx`
**Surfaces:** S6, S9 (if Rebecca KB cites the same figures)
**Risk:** low — UI text only.

### Problem

Line 40 tooltip text embeds "AHLA Lodging Industry Survey 2024: Upper Upscale management teams average $75K–$95K per FTE; Luxury/boutique operators $85K–$120K."

The year "2024" and the dollar ranges drift alongside the top-level `CITATIONS` module. But tooltip text is free-form prose; can't import a constant directly.

### Fix (minimal)

Rewrite the tooltip to remove the specific dollar figures — let the Analyst
badge next to the input surface live research ranges instead. Something like:

```diff
-<InfoTooltip text="Total compensation expense for the management company. Includes management team draws and staff salaries. Staff headcount is determined by the portfolio size (staffing tiers below). Early-stage hotel management companies typically allocate 50–65% of total overhead to compensation. AHLA Lodging Industry Survey 2024: Upper Upscale management teams average $75K–$95K per FTE; Luxury/boutique operators $85K–$120K." formula="Monthly = (Management Comp + FTE × Salary) ÷ 12" />
+<InfoTooltip text="Total compensation expense for the management company. Includes management team draws and staff salaries. Staff headcount is determined by the portfolio size (staffing tiers below). Early-stage hotel management companies typically allocate 50–65% of total overhead to compensation. See the Analyst badge for live per-FTE benchmarks by property class." formula="Monthly = (Management Comp + FTE × Salary) ÷ 12" />
```

Same treatment for line 47's nested tooltip if it has similar baked figures.

### Verify
Hover the two info icons on the Compensation tab, confirm the new text
reads correctly and the Analyst badge next to the input still surfaces
a live range.

---

## After all tasks complete — global verification

```bash
npx tsc --noEmit          # 0 errors
npm run lint              # 0 errors
npm run test:summary      # all pass
npm run verify:summary    # UNQUALIFIED
```

Smoke-test `/company/assumptions` across all 6 tabs, confirm Save on each
tab works.

Commit message template (one per task):
```
audit phase 4 task #<n>: <one-line summary>

<paragraph or bullet detail>

Surfaces: S?, S?…
```

Then push. Phase 4 complete when all 8 tasks are shipped.
