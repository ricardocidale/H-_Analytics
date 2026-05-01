# Tab-Bar System

**Component**: `CurrentThemeTab` (`client/src/components/ui/tabs.tsx`)

## Overview

Filing-system style dark glass tabs used on multi-view pages. The `rightContent` slot is the standard location for export controls via `ExportMenu`.

## CurrentThemeTab Props

| Prop | Type | Description |
|------|------|-------------|
| `tabs` | `CurrentThemeTabItem[]` | Array of `{ value: string, label: string, icon?: ComponentType }` |
| `activeTab` | `string` | Currently active tab value |
| `onTabChange` | `(value: string) => void` | Tab change handler |
| `rightContent` | `ReactNode` | Right-aligned slot — use for `ExportMenu` |

## CurrentThemeTabItem

```typescript
interface CurrentThemeTabItem {
  value: string;       // Unique tab identifier
  label: string;       // Display label
  icon?: ComponentType<{ className?: string }>;  // Optional lucide icon
}
```

## Wiring Pattern

### Step 1: State setup

```tsx
const [activeTab, setActiveTab] = useState("income");
```

### Step 2: Define tabs

```tsx
const tabs: CurrentThemeTabItem[] = [
  { value: "income", label: "Income Statement", icon: DollarSign },
  { value: "balance", label: "Balance Sheet", icon: Scale },
  { value: "cashflow", label: "Cash Flow", icon: TrendingUp },
];
```

### Step 3: Wire exports into rightContent

```tsx
import { ExportMenu, pdfAction, excelAction, csvAction, pptxAction, chartAction, pngAction } from "@/components/ui/export-toolbar";

<CurrentThemeTab
  tabs={tabs}
  activeTab={activeTab}
  onTabChange={setActiveTab}
  rightContent={
    <ExportMenu
      actions={[
        pdfAction(() => handleExportPdf(activeTab)),
        excelAction(() => handleExportExcel(activeTab)),
        csvAction(() => handleExportCsv(activeTab)),
        pptxAction(() => handleExportPptx()),
        chartAction(() => handleExportChart()),
        pngAction(() => handleExportPng(activeTab)),
      ]}
    />
  }
/>
```

### Step 4: Render tab content

```tsx
{activeTab === "income" && <IncomeStatementTable data={...} />}
{activeTab === "balance" && <BalanceSheetTable data={...} />}
{activeTab === "cashflow" && <CashFlowTable data={...} />}
```

## Full Copy-Paste Example

```tsx
import { useState } from "react";
import { CurrentThemeTab, type CurrentThemeTabItem } from "@/components/ui/tabs";
import { ExportMenu, pdfAction, excelAction, csvAction, pptxAction, chartAction, pngAction } from "@/components/ui/export-toolbar";
import { DollarSign, Scale, TrendingUp } from "lucide-react";

const tabs: CurrentThemeTabItem[] = [
  { value: "income", label: "Income Statement", icon: DollarSign },
  { value: "balance", label: "Balance Sheet", icon: Scale },
  { value: "cashflow", label: "Cash Flow", icon: TrendingUp },
];

function FinancialPage() {
  const [activeTab, setActiveTab] = useState("income");

  const handlePdf = () => { /* PDF export logic */ };
  const handleExcel = () => { /* Excel export logic */ };
  const handleCsv = () => { /* CSV export logic */ };
  const handlePptx = () => { /* PPTX export logic */ };
  const handleChart = () => { /* Chart PNG logic */ };
  const handlePng = () => { /* Table PNG logic */ };

  return (
    <div>
      <CurrentThemeTab
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        rightContent={
          <ExportMenu
            actions={[
              pdfAction(handlePdf),
              excelAction(handleExcel),
              csvAction(handleCsv),
              pptxAction(handlePptx),
              chartAction(handleChart),
              pngAction(handlePng),
            ]}
          />
        }
      />

      {activeTab === "income" && <div>Income content...</div>}
      {activeTab === "balance" && <div>Balance content...</div>}
      {activeTab === "cashflow" && <div>Cash flow content...</div>}
    </div>
  );
}
```

## Rules

- Use `CurrentThemeTab` on all dark-themed pages with multiple views
- Standard shadcn `Tabs`/`TabsList`/`TabsTrigger` should NOT be used on dark pages
- Export controls always go in `rightContent`, never in page header or body
- Each tab button has `data-testid={`tab-${tab.value}`}`
- Active tab shows glass morphism effect with white border and shine line

## Visual Structure

```
┌──────────────────────────────────────────────────────────┐
│  [Tab 1*] [Tab 2] [Tab 3]                    [Export ▾] │
│  *(active tab has glass highlight)         (rightContent)│
└──────────────────────────────────────────────────────────┘
```

## Related Skills

- **exports/SKILL.md** — ExportMenu component and export format implementations
- **button-system.md** — GlassButton used inside tab triggers
