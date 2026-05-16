---
title: "pptx-automizer setTableData per-cell calls corrupt table to 1x1"
date: 2026-05-16
category: docs/solutions/logic-errors
module: slide-factory-pptx-substitution
problem_type: logic_error
component: background_job
severity: high
symptoms:
  - "Transformation table renders as 1 rows x 1 cols instead of the expected N rows x 3 cols"
  - "Only the first cell's content appears in the output PPTX; all subsequent rows are silently dropped"
  - "PPTX downloads successfully and pptxR2Key is set, but table structure is visibly wrong in the deck"
  - "No runtime error is thrown — the corruption is completely silent"
root_cause: logic_error
resolution_type: code_fix
related_components:
  - artifacts/api-server/src/slides/pptx-substitution.ts
  - artifacts/api-server/src/slides/builder-substitution-entries.ts
tags:
  - pptx-automizer
  - slide-factory
  - table-substitution
  - setTableData
  - sliceRows
  - batching
  - pptx
  - silent-data-loss
---

# pptx-automizer setTableData per-cell calls corrupt table to 1x1

## Problem

In the H+ Analytics slide factory PPTX pipeline, the transformation table (Table 4, template slide 3 / code slide 5) was silently truncated to `1 rows x 1 cols` after `pptx-automizer` substitution. All rows beyond the first were destroyed, leaving a broken table in the downloaded PPTX despite the factory reporting `status=complete`.

## Symptoms

- Factory run completes with all 6 slides approved, but python-pptx inspection shows `Table 4: 1 rows x 1 cols` instead of `N rows x 3 cols`
- First cell content is correct; all subsequent rows are completely absent
- PPTX downloads at full size (44 MB) and `pptxR2Key` is set — the corruption is invisible until the file is opened or inspected
- No exception thrown during PPTX generation; pptx-automizer processes each per-cell call without error

## What Didn't Work

- **Fixing shape names and slide numbers** in `builder-substitution-entries.ts` resolved the upstream `sourceElement bug` (which caused `pptxR2Key=null`) but exposed the table truncation issue as a separate bug
- **Adding `skipOverflowCheck: true`** resolved a `SlotOverflowError` (header subtitle 84 chars vs 62-char template budget) but did not affect the table
- **Fixing the `TableRow` object format** (from plain arrays to `{ values: (string|number)[] }` objects) resolved `TypeError: row3.values.forEach is not a function` but still produced a 1×1 table — the per-cell calling pattern was still wrong
- **LibreOffice PDF export** was a separate compounding blocker: the `soffice` process was unavailable in the Replit dev environment (exit 144/126), which had masked the table corruption issue in earlier investigation passes *(session history)*

## Solution

Refactor `substituteSlots` in `artifacts/api-server/src/slides/pptx-substitution.ts` to batch all `table_cell` substitution entries for the same shape into a single `setTableData` call.

**Before — per-cell approach (broken):**

```typescript
// applyTableCellSubstitution called once per table_cell entry in the loop.
// Entry for row 0 passes a 1-row body → sliceRows(1) deletes rows 1–N.
// Entry for row 1 can't find row 1 (already gone), and so on.
function applyTableCellSubstitution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slide: any,
  shapeName: string,
  payload: TableCellPayload,
): void {
  const rows: Array<{ values: (string | undefined)[] }> = [];
  for (let r = 0; r <= payload.rowIndex; r++) {
    const values: (string | undefined)[] = [];
    for (let c = 0; c <= payload.columnIndex; c++) {
      values.push(r === payload.rowIndex && c === payload.columnIndex ? payload.text : undefined);
    }
    rows.push({ values });
  }
  slide.modifyElement(shapeName, [modify.setTableData({ body: rows })]);
}
```

**After — batched approach (correct):**

```typescript
// Collect all table_cell entries per shape, then call setTableData once
// with the full grid. Guard on line 1 prevents Math.max(-Infinity) for empty input.
function applyTableCellsBatched(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slide: any,
  shapeName: string,
  payloads: TableCellPayload[],
): void {
  if (payloads.length === 0) return;
  const maxRow = Math.max(...payloads.map((p) => p.rowIndex));
  const maxCol = Math.max(...payloads.map((p) => p.columnIndex));
  const cellMap = new Map<string, string>();
  for (const p of payloads) cellMap.set(`${p.rowIndex},${p.columnIndex}`, p.text);
  const rows: Array<{ values: (string | undefined)[] }> = [];
  for (let r = 0; r <= maxRow; r++) {
    const values: (string | undefined)[] = [];
    for (let c = 0; c <= maxCol; c++) values.push(cellMap.get(`${r},${c}`));
    rows.push({ values });
  }
  slide.modifyElement(shapeName, [modify.setTableData({ body: rows })]);
}

// In substituteSlots's addSlide callback:
// 1. Accumulate table_cell entries by shape during the entry loop
const tableCellsByShape = new Map<string, TableCellPayload[]>();
for (const entry of slideEntries) {
  // text/image entries applied directly as before ...
  if (entry.op === "table_cell") {
    const existing = tableCellsByShape.get(shapeName);
    if (existing) existing.push(entry.payload as TableCellPayload);
    else tableCellsByShape.set(shapeName, [entry.payload as TableCellPayload]);
  }
}
// 2. Apply each shape's full batch after the loop — one setTableData call per shape
for (const [shapeName, payloads] of tableCellsByShape) {
  applyTableCellsBatched(slide, shapeName, payloads);
}
```

**Verification:** python-pptx inspection of the rebuilt PPTX confirmed `Table 4: 4 rows x 3 cols` with all cell content correct (4 rows because run 10's LLM produced 4 transformation rows). *(session history)*

## Why This Works

`pptx-automizer`'s `setTableData()` internally calls `sliceRows(n)` and `sliceCols(m)` where `n = data.body.length` and `m = data.body[0].values.length`. These methods physically trim the underlying table XML to exactly those dimensions — they are destructive and irreversible within the same modification pass.

When `setTableData` was called once per `table_cell` entry (e.g., an entry for row index 0 with a 1-row body), `sliceRows(1)` immediately removed rows 1 through 4 from the original 5-row table XML. The next call for row index 1 found no row 1 to modify, and each subsequent row was equally unreachable.

Batching collects all cell entries for a given shape, computes the full grid dimensions, builds the complete body matrix in one pass, and makes a single `setTableData` call. `sliceRows` and `sliceCols` receive the full intended dimensions and all cells are populated correctly. Non-addressed cells use `undefined`, which causes `ModifyTextHelper.content(undefined)` to be a no-op, leaving template text intact in those positions — this is observed behavior in pptx-automizer v0.8.1, not a guaranteed API contract; verify after library upgrades.

## Prevention

1. **One `setTableData` call per shape, ever.** Treat it as a destructive full-replace, not a patch. Calling it multiple times on the same shape resets the table XML dimensions on each call.

2. **Accumulate first, apply second.** Collect all `table_cell` entries for a shape into a bucket during the iteration loop. After the loop, call `applyTableCellsBatched` per bucket — it builds the `(maxRow+1) × (maxCol+1)` grid and calls `setTableData` once. Never call `setTableData` inside the collection loop, and never infer table size from a single entry's `rowIndex`/`columnIndex`.

3. **Assert table dimensions in QA.** After PPTX generation, run a python-pptx check that asserts expected row/col counts (e.g., `assert len(table.rows) == 4 and len(table.columns) == 3`). A `1 rows x 1 cols` result is a reliable sentinel for this class of bug.

## Related Issues

- `docs/solutions/architecture-patterns/pptx-substitution-library-decision-2026-05-11.md` — covers the other pptx-automizer behavioral traps (`cleanup: false`, `setText` not `replaceText`, fragile image-swap). The `setTableData` batching requirement is the fourth trap in this family; a summary was appended to that doc's "Constraints discovered" section alongside this learning.
