---
name: design-export
description: Replicate the HBG design system in another project. Covers components, themes, icons, charts, and animations with related skill references. Use when setting up a new app with HBG visual identity.
---

# Design System Export

Replicate the HBG design system in another project. Use when setting up a new app that should share the same UI look and feel — components, themes, icons, charts, animations.

**Related skills:** `design-system/` (visual identity and UX principles), `ui/consistent-card-widths.md` (layout conventions), `exports/` (document export styling)

---

## Architecture Overview

The design system has 5 layers:

1. **Theme** — CSS variables + Tailwind v4 config (colors, fonts, radii)
2. **Primitives** — shadcn/ui components built on Radix UI
3. **Icons** — Custom brand SVG icon library (no external icon font)
4. **Graphics** — Higher-order components (KPI grids, insight panels, animations)
5. **Charts** — Recharts + Mermaid wrappers

## Step-by-Step Setup

### 1. Install Dependencies

```bash
# Core React + routing
npm i react react-dom wouter

# Styling
npm i tailwindcss tw-animate-css class-variance-authority tailwind-merge clsx

# Radix UI primitives (install only what you need)
npm i @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-popover \
  @radix-ui/react-tooltip @radix-ui/react-tabs @radix-ui/react-select \
  @radix-ui/react-checkbox @radix-ui/react-switch @radix-ui/react-label \
  @radix-ui/react-separator @radix-ui/react-scroll-area @radix-ui/react-slot \
  @radix-ui/react-avatar @radix-ui/react-accordion @radix-ui/react-progress \
  @radix-ui/react-toggle @radix-ui/react-toggle-group @radix-ui/react-slider \
  @radix-ui/react-radio-group

# UI utilities
npm i lucide-react sonner cmdk vaul next-themes

# Charts (if needed)
npm i recharts mermaid

# Animation
npm i framer-motion

# Data & forms
npm i @tanstack/react-query @tanstack/react-table zustand react-hook-form @hookform/resolvers zod

# Dev
npm i -D @tailwindcss/vite typescript @types/react vite
```

### 2. Copy Theme CSS

Copy `client/src/index.css` to the target project. The critical sections:

- `@theme inline { ... }` — Tailwind v4 design tokens (fonts, radii, color mappings)
- `:root { ... }` — Default theme (Tuscan Olive Grove) HSL color variables
- `.dark { ... }` — Dark mode overrides
- `.theme-indigo-blue { ... }` — Alternate theme preset

**Default theme: Tuscan Olive Grove**
```
--primary: 91 13% 54%        (olive green)
--secondary: 100 20% 30%     (dark forest)
--background: 30 100% 98%    (warm cream)
--accent-pop: 43 90% 55%     (Tuscan gold)
--accent-pop-2: 155 41% 30%  (sage)
```

**Fonts (loaded via Google Fonts in index.html):**
- `Inter` — body text (--font-sans)
- `IBM Plex Sans` — headings (--font-display)
- `JetBrains Mono` — code/numbers (--font-mono)

### 3. Copy Component Directories

Copy these directories from the source project:

| Source | Purpose | Dependencies |
|--------|---------|-------------|
| `client/src/components/ui/` | shadcn/ui primitives | Radix, cva, tailwind-merge |
| `client/src/components/icons/` | Brand SVG icons | None (pure React SVG) |
| `client/src/components/graphics/` | KPI grids, insight panels, animations | framer-motion |
| `client/src/lib/charts/` | Recharts + Mermaid wrappers | recharts, mermaid |
| `client/src/lib/utils.ts` | `cn()` helper | clsx, tailwind-merge |

### 4. Utility Function (`lib/utils.ts`)

Every component uses this:
```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 5. Vite Config

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
    },
  },
});
```

## Key Components Reference

### UI Primitives (`components/ui/`)

Most-used components and their import patterns:

```ts
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger, CurrentThemeTab } from "@/components/ui/tabs";
import { ContentPanel } from "@/components/ui/content-panel";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
```

**`CurrentThemeTab`** — styled sub-tab navigation:
```tsx
<CurrentThemeTab
  tabs={[
    { value: "tab1", label: "First", icon: SomeIcon },
    { value: "tab2", label: "Second" },
  ]}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>
```

### Brand Icons (`components/icons/`)

Custom SVG icons — no external icon font. Import from barrel:
```ts
import { IconWallet, IconTrending, IconTarget, IconDollarSign, IconSettings } from "@/components/icons";
```

Structural icons (Check, ChevronDown, Loader2, Search, X, ArrowLeft, etc.) come from `lucide-react`.

### Graphics (`components/graphics/`)

```ts
import { AnimatedPage, ScrollReveal, KPIGrid, InsightPanel, formatCompact } from "@/components/graphics";
```

- **`AnimatedPage`** — wraps a page with fade-in animation
- **`ScrollReveal`** — reveals children on scroll
- **`KPIGrid`** — metric cards grid (value, label, sublabel, trend, format)
- **`InsightPanel`** — bulleted insights with positive/negative/warning types
- **`formatCompact`** — formats numbers as $1.2M, $450K, etc.

### Charts (`lib/charts/`)

```ts
import { BarChartCard, LineChartMulti, DonutChart, RadialGauge, MermaidChart } from "@/lib/charts";
```

All chart components are thin wrappers around Recharts with consistent theming. `MermaidChart` renders Mermaid DSL diagrams.

## Design Patterns

### Content Layout
```tsx
<AnimatedPage>
  <div className="space-y-6 p-4 md:p-6">
    <PageHeader title="Page Title" subtitle="Description" />
    <ScrollReveal>
      <KPIGrid items={[...]} columns={4} variant="glass" />
    </ScrollReveal>
    <ScrollReveal>
      <ContentPanel title="Section" subtitle="Details">
        {/* content */}
      </ContentPanel>
    </ScrollReveal>
  </div>
</AnimatedPage>
```

### Stat Row Pattern
```tsx
<div className="flex justify-between items-center py-2 border-b border-border/40">
  <span className="text-sm text-muted-foreground">Label</span>
  <span className="text-sm font-mono font-medium text-foreground">Value</span>
</div>
```

### Typography Classes
- Headings: `text-lg font-display text-foreground`
- Body: `text-sm text-muted-foreground/80 leading-relaxed`
- Labels: `text-xs text-muted-foreground`
- Micro: `text-[11px] text-muted-foreground/60 uppercase tracking-wider`
- Mono values: `font-mono font-semibold text-foreground`

### data-testid Convention
Every interactive or data-display element gets a `data-testid`:
- Buttons: `button-{action}` (e.g., `button-save`)
- Inputs: `input-{field}` (e.g., `input-email`)
- Panels: `panel-{name}` (e.g., `panel-cash-runway`)
- Cards: `card-{type}-{id}` (e.g., `card-tranche-1`)
- Text: `text-{content}` (e.g., `text-investor-thesis`)

## UI Component Conventions

### Tab Alignment
- `TabsList` defaults to `justify-start` (left-aligned). Tabs must always be flush to the left edge of their container.
- Never add `justify-center` to `TabsList`. If you need a centered layout, use a wrapper element instead.
- For responsive wrapping tab rows, use `flex flex-wrap h-auto gap-1` on `TabsList`:
  ```tsx
  <TabsList className="flex flex-wrap h-auto gap-1 w-full">
    <TabsTrigger value="a">Alpha</TabsTrigger>
    <TabsTrigger value="b">Beta</TabsTrigger>
  </TabsList>
  ```
- For equal-width tab grids (e.g., admin panels with a fixed number of tabs), `grid grid-cols-N` is acceptable — the grid overrides flexbox alignment and fills the container evenly:
  ```tsx
  <TabsList className="grid w-full grid-cols-3">
    <TabsTrigger value="a">Alpha</TabsTrigger>
    <TabsTrigger value="b">Beta</TabsTrigger>
    <TabsTrigger value="c">Gamma</TabsTrigger>
  </TabsList>
  ```
- `CurrentThemeTab` already uses left-aligned flex layout internally — no overrides needed.

## What NOT to Copy

- `server/` — backend is project-specific
- `shared/schema.ts` — data models are project-specific
- `client/src/lib/financial/` — financial engine (simulation-specific)
- `client/src/features/ai-agent/` — AI agent components (Rebecca)
- `client/src/pages/` — page components are project-specific
- Theme database tables — themes are CSS-only in the design system

## Minimal Starter

For the fastest setup, copy only:
1. `client/src/index.css` (theme)
2. `client/src/lib/utils.ts` (cn helper)
3. `client/src/components/ui/button.tsx` + `card.tsx` + `tabs.tsx` + `dialog.tsx` + `input.tsx` + `label.tsx` + `select.tsx` + `tooltip.tsx` + `content-panel.tsx` + `page-header.tsx`
4. `client/src/components/graphics/` (whole directory)
5. `client/src/components/icons/` (whole directory)

This gives you the full visual identity with the fewest files.
