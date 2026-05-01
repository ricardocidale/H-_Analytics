---
name: composite-tabbed-pages
description: Pattern for merging multiple standalone pages into a single unified page with tab navigation. Used for Analysis (Sensitivity + Financing + Executive Summary) and Properties (Portfolio + Map View).
---

# Composite Tabbed Pages

## Overview

Some pages combine multiple previously-standalone page components into a single unified view using tab-style button navigation in the page header. The child components render in **embedded mode** (no Layout wrapper, no duplicate PageHeader).

## Architecture Pattern

### Host Page

The host page owns `<Layout>`, `<PageHeader>`, and tab state. Tabs render inside PageHeader's `actions` slot.

```tsx
import { useState } from "react";
import Layout from "@/components/Layout";
import { PageHeader } from "@/components/ui/page-header";
import ChildPageA from "./ChildPageA";
import ChildPageB from "./ChildPageB";

type Tab = "a" | "b";

export default function CompositePage() {
  const [tab, setTab] = useState<Tab>("a");

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Page Title"
          subtitle="Description text"
          actions={
            <div className="flex gap-2">
              <TabButton active={tab === "a"} onClick={() => setTab("a")} icon={IconA} label="Tab A" testId="tab-a" />
              <TabButton active={tab === "b"} onClick={() => setTab("b")} icon={IconB} label="Tab B" testId="tab-b" />
            </div>
          }
        />
        {tab === "a" && <ChildPageA embedded />}
        {tab === "b" && <ChildPageB embedded />}
      </div>
    </Layout>
  );
}
```

### TabButton Component (inline)

Consistent tab-button styling used in PageHeader actions:

```tsx
function TabButton({ active, onClick, icon: Icon, label, testId }: {
  active: boolean; onClick: () => void; icon: any; label: string; testId: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
        active
          ? "bg-[#9FBCA4]/25 text-white border border-[#9FBCA4]/50"
          : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white/80"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
```

### Embedded Mode in Child Components

Child page components accept `embedded?: boolean` prop. When `embedded` is true, they skip their own `<Layout>` wrapper:

```tsx
export default function ChildPage({ embedded }: { embedded?: boolean }) {
  const Wrapper = embedded
    ? ({ children }: { children: React.ReactNode }) => <>{children}</>
    : Layout;

  return (
    <Wrapper>
      {/* page content — no PageHeader when embedded */}
      <div>...</div>
    </Wrapper>
  );
}
```

## Live Examples

### Analysis Page (`/analysis`)

Merges 3 tools into one page:

| Tab | Component | File |
|-----|-----------|------|
| Sensitivity | `SensitivityAnalysis` | `client/src/pages/SensitivityAnalysis.tsx` |
| Financing | `FinancingAnalysis` | `client/src/pages/FinancingAnalysis.tsx` |
| Executive Summary | `ExecutiveSummary` | `client/src/pages/ExecutiveSummary.tsx` |

Host: `client/src/pages/Analysis.tsx`

### Properties Page (`/portfolio`)

Embeds Map View as a second tab alongside the property list:

| Tab | Component | File |
|-----|-----------|------|
| Properties | (inline portfolio content) | `client/src/pages/Portfolio.tsx` |
| Map View | `MapView` | `client/src/pages/MapView.tsx` |

## Sidebar Integration

- Composite pages get a **single sidebar link** (e.g. "Analysis", "Properties")
- The individual sub-pages (Sensitivity, Financing, Map View, etc.) do **not** appear as separate sidebar items
- Sidebar visibility is controlled by the `sb()` helper combining relevant flags:
  ```tsx
  const showAnalysis = sb("sidebarSensitivity") || sb("sidebarFinancing") || sb("sidebarExecutiveSummary");
  ```

## Routing

- The host page has the primary route (e.g. `/analysis`, `/portfolio`)
- Old standalone routes (`/sensitivity`, `/financing`, `/map`, `/executive-summary`) should redirect to the host page for backward compatibility
- Use `<Redirect to="/analysis" />` for old routes

## Rules

1. **Never duplicate Layout** — only the host page wraps in `<Layout>`
2. **Always add `embedded` prop** to child components before embedding
3. **Tab buttons go in PageHeader `actions`** — not in page body
4. **Each tab button needs `data-testid={`tab-${value}`}`**
5. **Active tab styling**: `bg-[#9FBCA4]/25 text-white border border-[#9FBCA4]/50`
6. **Inactive tab styling**: `bg-white/5 text-white/60 border border-white/10`
7. When a child uses `useStore` (client-side state), it works as-is in embedded mode
8. When a child uses `useQuery` (API data), it works as-is in embedded mode

## Related Skills

- **tab-bar-system.md** — `CurrentThemeTab` for in-page content tabs (different from PageHeader tab buttons)
- **navigation.md** — Sidebar structure and `sb()` visibility helper
- **page-header.md** — PageHeader `actions` slot where tab buttons live
