# ADR-009 EWW De-duplication — UI Components

## Context

The Phase 1 EWW row was added **alongside** the existing "Utilities" row instead of
**replacing** it. Per USALI 12th Edition, "Energy, Water & Waste" is the new label for
what was called "Utilities" — they are the same number. Every income statement surface
now shows the same dollar amount twice under two different labels, which is incorrect.

The export files (`propertyExportShared.ts`, `excel/property-sheets.ts`) were already
fixed by CC (commit `dbc8ce18`). This packet fixes the three UI components that remain.

## Atomic-budget check

- Sub-step count: 3 (one file per step)
- File count: 3
- Capability domain: UI only

---

## S1: Fix `client/src/components/statements/YearlyIncomeStatement.tsx`

**Two changes in this file — expanded branch and collapsed branch.**

### Expanded branch (around line 350)

**BEFORE:**
```tsx
          <ExpandableLineItem
            label="Utilities"
            tooltip={`Split into variable (${pct(global.utilitiesVariableSplit ?? 0.60)} of rate, scales with revenue) and fixed (${pct(1 - (global.utilitiesVariableSplit ?? 0.60))} of rate, anchored to Year 1 base revenue). Total rate: ${pct(costRates.utilities)}.`}
            values={yd.map((y) => y.expenseUtilities)}
            expanded={isExpanded("utilities")}
            onToggle={() => toggle("utilities")}
          >
```
**AFTER:** change `label="Utilities"` → `label="Energy, Water & Waste"` (tooltip unchanged)

Then **remove** the entire block that follows the `</ExpandableLineItem>` closing tag
(lines ~368–378):
```tsx
          {/* ADR-009 Phase 1: USALI 12th Edition EWW Schedule (Energy, Water & Waste).
              Engine field `expenseEWW = expenseUtilitiesVar + expenseUtilitiesFixed`,
              which equals the yearly aggregator's `expenseUtilities` total. Rendered
              as a discrete USALI-named row per the 12th-edition schedule format. */}
          {yd.some((y) => y.expenseUtilities !== 0) && (
            <LineItem
              label="Energy, Water & Waste"
              values={yd.map((y) => y.expenseUtilities)}
              tooltip="USALI 12th Edition EWW Schedule: Electricity, Water & Waste aggregate"
            />
          )}
```

### Collapsed branch (around line 396)

**BEFORE:**
```tsx
          <LineItem label="Utilities"                 values={yd.map((y) => y.expenseUtilities)} tooltip="Split into variable (scales with revenue) and fixed (anchored to Year 1 base revenue)." />
          {/* ADR-009 Phase 1: USALI 12th Edition EWW Schedule. Equals the engine's
              expenseEWW (= expenseUtilitiesVar + expenseUtilitiesFixed), surfaced as
              a discrete USALI-named row alongside the legacy Utilities line. */}
          {yd.some((y) => y.expenseUtilities !== 0) && (
            <LineItem label="Energy, Water & Waste"   values={yd.map((y) => y.expenseUtilities)} tooltip="USALI 12th Edition EWW Schedule: Electricity, Water & Waste aggregate" />
          )}
```

**AFTER:**
```tsx
          <LineItem label="Energy, Water & Waste"     values={yd.map((y) => y.expenseUtilities)} tooltip="USALI 12th Edition EWW Schedule: Electricity, Water & Waste aggregate" />
```

**Acceptance criteria:**
- Income statement accordion shows ONE row for energy/water/waste (not two)
- Expanded view: "Energy, Water & Waste" is the parent with the variable/fixed sub-breakdown
- Collapsed view: single "Energy, Water & Waste" row

---

## S2: Fix `client/src/components/dashboard/statementBuilders.ts`

**BEFORE (around line 245):**
```ts
    rows.push({ category: "Utilities", values: years.map((_, i) => (c(i)?.expenseUtilitiesVar ?? 0) + (c(i)?.expenseUtilitiesFixed ?? 0)), indent: 1 });
    // ADR-009 Phase 1: USALI 12th Edition EWW Schedule. The yearly aggregator's
    // `expenseUtilities` field equals the engine's `expenseEWW`
    // (= expenseUtilitiesVar + expenseUtilitiesFixed) per yearlyAggregator.ts.
    rows.push({ category: "Energy, Water & Waste", values: years.map((_, i) => c(i)?.expenseUtilities ?? 0), indent: 1 });
```

**AFTER:**
```ts
    rows.push({ category: "Energy, Water & Waste", values: years.map((_, i) => (c(i)?.expenseUtilitiesVar ?? 0) + (c(i)?.expenseUtilitiesFixed ?? 0)), indent: 1 });
```

(Remove the comment and the second `rows.push`. Keep the first one, just rename the category.)

**Acceptance criteria:**
- One row in dashboard income statement for energy/water/waste

---

## S3: Fix `client/src/components/dashboard/IncomeStatementTab.tsx`

**BEFORE (around line 282):**
```ts
      rows.push({ category: "Utilities", values: years.map((_, i) => (c(i)?.expenseUtilitiesVar ?? 0) + (c(i)?.expenseUtilitiesFixed ?? 0)), indent: 1 });
      // ADR-009 Phase 1: USALI 12th Edition EWW Schedule. The yearly aggregator's
      // `expenseUtilities` field equals the engine's `expenseEWW`
      // (= expenseUtilitiesVar + expenseUtilitiesFixed) per yearlyAggregator.ts.
      rows.push({ category: "Energy, Water & Waste", values: years.map((_, i) => c(i)?.expenseUtilities ?? 0), indent: 1, tooltip: "USALI 12th Edition EWW Schedule: Electricity, Water & Waste aggregate" });
```

**AFTER:**
```ts
      rows.push({ category: "Energy, Water & Waste", values: years.map((_, i) => (c(i)?.expenseUtilitiesVar ?? 0) + (c(i)?.expenseUtilitiesFixed ?? 0)), indent: 1, tooltip: "USALI 12th Edition EWW Schedule: Electricity, Water & Waste aggregate" });
```

(Remove the comment and the second `rows.push`. Keep the first one, rename category, add tooltip from the removed line.)

**Acceptance criteria:**
- One row in dashboard income statement tab for energy/water/waste

---

## Verification

```
npx tsc --noEmit
npm run lint
npm run test:file -- tests/audit/vocabulary-compliance.test.ts
npm run test:summary
npm run verify:summary
```

All five must pass. Commit with:
```
Surfaces: S-income-statement, S-dashboard
ADR: ADR-009 — rename Utilities → Energy, Water & Waste (USALI 12th de-dup)
Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED
```

---

## What CC already fixed (do not re-implement)

| File | Fix |
|------|-----|
| `client/src/lib/exports/propertyExportShared.ts` | "Utilities" row removed; single "Energy, Water & Waste" row kept |
| `client/src/lib/exports/excel/property-sheets.ts` | Summary "Utilities" → "Energy, Water & Waste"; detail sub-items renamed to "Energy, Water & Waste (Variable/Fixed)" |
