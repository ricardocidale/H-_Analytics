# Phase 11 — Export Excellence (UI Tasks)

**Owner:** Replit Agent  
**Lane:** UI only — components, pages, icons  
**Atomic budget:** 4 tasks, ≤3 files each  
**Reference rules:** `.claude/rules/exports.md`, `.claude/skills/exports/SKILL.md`

---

## Context

The export system is mature (all 6 formats implemented, used on 8 pages) but has three gaps this packet closes:

1. No loading feedback while exports generate (3–8 seconds for PDF/PPTX)
2. `CompanyIcpDefinition` only offers PDF + PPTX; the rule requires all 6
3. `FinancingAnalysis` has no export at all despite showing calculator result tables
4. CSV and DOCX share the same icon in the ExportMenu (both use `IconFileDown`)

Server-side export logic (async/sync fixes, Excel formatting) is CC's lane and is NOT in scope here.

---

## Task T1 — ExportMenu loading state

**File:** `client/src/components/ui/export-toolbar.tsx`

**What:** Add an `isPending` prop to `ExportMenu` and `ExportToolbarProps`. When `isPending={true}`, the trigger button shows a `Loader2` spinner (replacing the `IconDownload`) and becomes `disabled`. This gives users feedback during the 3–8 second generation window.

**How:**

```tsx
// Add to ExportToolbarProps interface:
isPending?: boolean;

// Add to ExportMenu function signature:
function ExportMenu({ actions, className, isPending }: ExportToolbarProps) {

// Change the trigger button:
<Button
  variant="outline"
  size="sm"
  className={cn("gap-2 h-9 text-xs font-medium", className)}
  data-testid="button-export-menu"
  disabled={isPending}
>
  {isPending
    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
    : <IconDownload className="w-3.5 h-3.5" />}
  <span>{isPending ? "Exporting…" : "Export"}</span>
</Button>
```

Import `Loader2` from `@/components/icons/themed-icons`.

**Acceptance criteria:**
- [ ] `ExportMenu` accepts `isPending?: boolean` prop
- [ ] When `isPending={true}`, button shows spinner + "Exporting…" and is disabled
- [ ] When `isPending={false}` (default), button behaves exactly as before
- [ ] TypeScript compiles with zero errors (`npx tsc --noEmit`)
- [ ] No other files changed in this task

---

## Task T2 — Fix duplicate icons in export-toolbar

**File:** `client/src/components/ui/export-toolbar.tsx`

**What:** CSV and DOCX both use `IconFileDown` — same icon, visually indistinguishable. Fix:
- CSV → `IconFileSpreadsheet` (same as Excel, which is fine — it's a table format)
- DOCX → `IconFileText` (Word document icon)

**How:**

```tsx
// docxAction — change icon from IconFileDown to IconFileText:
function docxAction(onClick: () => void): ExportAction {
  return {
    label: "Word",
    icon: <IconFileText className="w-3.5 h-3.5" />,
    onClick,
    testId: "button-export-docx",
  };
}
```

Check that `IconFileText` is available in `@/components/icons`. If not, use `IconFile` or `FileText` from `lucide-react` imported directly.

**Acceptance criteria:**
- [ ] `csvAction` uses a spreadsheet/grid icon
- [ ] `docxAction` uses a document/text icon distinct from PDF's `IconFileDown`
- [ ] No other functions changed
- [ ] TypeScript compiles with zero errors

---

## Task T3 — CompanyIcpDefinition: add missing 4 formats

**File:** `client/src/pages/CompanyIcpDefinition.tsx`

**What:** The page currently only has PDF + PPTX. The exports rule requires all 6. Add Excel, CSV, PNG, and DOCX handlers using the same pattern as the existing `handleExportPDF` and `handleExportPPTX` functions.

**The existing pattern (follow exactly):**
```tsx
const handleExportPDF = async (customFilename?: string) => {
  try {
    const response = await fetch("/api/premium-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "pdf",
        reportType: "company-research-criteria",
        title: `${companyName} Co. — ICP Definition`,
        data: exportData,
      }),
    });
    if (!response.ok) throw new Error("Export failed");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = customFilename || `${companyName.replace(/\s+/g, "-")}-ICP-Definition.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "PDF downloaded successfully." });
  } catch {
    toast({ title: "Export failed", description: "Could not generate PDF.", variant: "destructive" });
  }
};
```

**Add these three server-side handlers** (same pattern, different `format` and extension):
- `handleExportExcel` — format: `"excel"`, extension: `.xlsx`, description: `"Excel downloaded successfully."`
- `handleExportCSV` — format: `"csv"`, extension: `.csv`, description: `"CSV downloaded successfully."`
- `handleExportDOCX` — format: `"docx"`, extension: `.docx`, description: `"Word document downloaded successfully."`

**Add PNG handler** (DOM capture pattern — different from server pipeline):
```tsx
// At top of component, add:
const contentRef = useRef<HTMLDivElement>(null);

// Handler:
const handleExportPNG = async () => {
  try {
    const { captureToPng } = await import("@/lib/exports/domCapture");
    const dataUrl = await captureToPng(contentRef.current!);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${companyName.replace(/\s+/g, "-")}-ICP-Definition.png`;
    a.click();
    toast({ title: "Exported", description: "PNG downloaded successfully." });
  } catch {
    toast({ title: "Export failed", description: "Could not capture PNG.", variant: "destructive" });
  }
};
```

Wrap the main content area with `<div ref={contentRef}>...</div>`.

**Update ExportMenu** to include all 6 actions:
```tsx
<ExportMenu
  actions={[
    pdfAction(() => requestSave(`${companyName} ICP Definition`, ".pdf", (f) => handleExportPDF(f))),
    excelAction(() => requestSave(`${companyName} ICP Definition`, ".xlsx", (f) => handleExportExcel(f))),
    csvAction(() => requestSave(`${companyName} ICP Definition`, ".csv", (f) => handleExportCSV(f))),
    pptxAction(() => requestSave(`${companyName} ICP Definition`, ".pptx", (f) => handleExportPPTX(f))),
    pngAction(() => handleExportPNG()),
    docxAction(() => requestSave(`${companyName} ICP Definition`, ".docx", (f) => handleExportDOCX(f))),
  ]}
/>
```

Add `excelAction, csvAction, pngAction, docxAction` to the import from `@/components/ui/export-toolbar`.

**Acceptance criteria:**
- [ ] ExportMenu shows all 6 format options (PDF, Excel, CSV, PowerPoint, PNG, Word)
- [ ] Each handler calls `/api/premium-export` with the correct `format` string, OR uses DOM capture for PNG
- [ ] `contentRef` wraps the scrollable content area
- [ ] Toast messages are format-specific ("Excel downloaded", "CSV downloaded", etc.)
- [ ] TypeScript compiles with zero errors
- [ ] `npm run lint` passes

---

## Task T4 — FinancingAnalysis: add PNG export

**File:** `client/src/pages/FinancingAnalysis.tsx`

**What:** FinancingAnalysis shows four calculator tabs (DSCR Sizing, Debt Yield, Stress Test, Prepayment). None are exportable today. Add a PNG export that captures the active tab's content panel. PNG is the right format for calculator-style tools — it captures exactly what the user sees.

**How:**

1. Add a `ref` to the `ContentPanel` wrapping the active tab:
```tsx
const tabContentRef = useRef<HTMLDivElement>(null);
```

2. Wrap the `ContentPanel` element (it already exists around line 67):
```tsx
<div ref={tabContentRef}>
  <ScrollReveal>
    <ContentPanel variant="light" className="mt-6">
      {/* existing content */}
    </ContentPanel>
  </ScrollReveal>
</div>
```

3. Add the export handler:
```tsx
const handleExportPNG = async () => {
  try {
    const { captureToPng } = await import("@/lib/exports/domCapture");
    const label = TABS.find(t => t.id === activeTab)?.label ?? "Financing Analysis";
    const dataUrl = await captureToPng(tabContentRef.current!);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${label.replace(/\s+/g, "-")}.png`;
    a.click();
  } catch {
    // silent — PNG capture is best-effort
  }
};
```

4. Add ExportMenu next to the tab list. The page currently has `PageHeader` + `Tabs` with a `TabsList`. Place the ExportMenu in a flex row alongside the `TabsList`:
```tsx
<div className="flex items-center justify-between gap-4">
  <TabsList className="...existing classes...">
    {/* existing tab triggers */}
  </TabsList>
  <ExportMenu
    actions={[pngAction(handleExportPNG, "button-financing-export-png")]}
  />
</div>
```

5. Add imports:
```tsx
import { useRef } from "react"; // add to existing React import
import { ExportMenu, pngAction } from "@/components/ui/export-toolbar";
```

**Acceptance criteria:**
- [ ] ExportMenu with PNG option appears to the right of the tab bar
- [ ] Clicking PNG captures the active tab content panel (not the whole page)
- [ ] PNG downloads with the active tab's label as filename (e.g. `DSCR-Sizing.png`)
- [ ] ExportMenu does not appear when `embedded={true}` (check the `embedded` prop pattern already used for `PageHeader`)
- [ ] TypeScript compiles with zero errors
- [ ] `npm run lint` passes

---

## Verification (run after all 4 tasks)

```bash
npx tsc --noEmit
npm run lint
npm run test:file -- tests/audit/vocabulary-compliance.test.ts
```

All three must pass. Then do a visual check in the browser:
- [ ] `CompanyIcpDefinition` — ExportMenu has 6 items
- [ ] `FinancingAnalysis` — ExportMenu with PNG appears next to tabs; clicking PNG downloads a file
- [ ] Any page with ExportMenu — no visual regression on button appearance
- [ ] CSV and DOCX icons are now visually distinct from each other

## What is NOT in scope for this packet

- Excel formatting consistency (touches server export logic — CC's lane)
- Fixing async/sync mismatches in export helpers (CC's lane)
- Adding exports to Scenarios, FundingPredictor, or TimelineView (low ROI)
- Server-side export pipeline changes

## Files changed

| File | Task | Change |
|---|---|---|
| `client/src/components/ui/export-toolbar.tsx` | T1, T2 | Add `isPending` prop; fix DOCX icon |
| `client/src/pages/CompanyIcpDefinition.tsx` | T3 | Add Excel, CSV, PNG, DOCX handlers + update ExportMenu |
| `client/src/pages/FinancingAnalysis.tsx` | T4 | Add PNG export + ExportMenu |
