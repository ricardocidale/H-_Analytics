---
name: design-system-export
description: Replicate the HBG design system in another project. Covers components, themes, icons, charts, and animations. Use when setting up a new app that should share the same UI look and feel.
---

Replicate the HBG design system in another project. Use when setting up a new app that should share the same UI look and feel — components, themes, icons, charts, animations.

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
npm i react react-dom wouter tailwindcss tw-animate-css class-variance-authority tailwind-merge clsx
npm i @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-tabs @radix-ui/react-select @radix-ui/react-checkbox @radix-ui/react-switch @radix-ui/react-label @radix-ui/react-separator @radix-ui/react-scroll-area @radix-ui/react-slot @radix-ui/react-accordion @radix-ui/react-slider
npm i lucide-react sonner cmdk vaul next-themes framer-motion recharts
npm i @tanstack/react-query zustand react-hook-form @hookform/resolvers zod
```

### 2. Copy Theme CSS

Copy `client/src/index.css` to the target project. Critical sections:
- `@theme inline { ... }` — Tailwind v4 design tokens
- `:root { ... }` — Default theme (Tuscan Olive Grove) HSL color variables
- `.dark { ... }` — Dark mode overrides

**Default theme: Tuscan Olive Grove**
```
--primary: 91 13% 54%        (olive green)
--secondary: 100 20% 30%     (dark forest)
--background: 30 100% 98%    (warm cream)
--accent-pop: 43 90% 55%     (Tuscan gold)
--accent-pop-2: 155 41% 30%  (sage)
```

**Fonts:** Inter (body), IBM Plex Sans (headings), JetBrains Mono (code/numbers)

### 3. Copy Component Directories

| Source | Purpose | Dependencies |
|--------|---------|-------------|
| `client/src/components/ui/` | shadcn/ui primitives | Radix, cva, tailwind-merge |
| `client/src/components/icons/` | Brand SVG icons | None (pure React SVG) |
| `client/src/components/graphics/` | KPI grids, insight panels, animations | framer-motion |
| `client/src/lib/charts/` | Recharts + Mermaid wrappers | recharts, mermaid |
| `client/src/lib/utils.ts` | `cn()` helper | clsx, tailwind-merge |

### 4. Utility Function

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
  resolve: { alias: { "@": path.resolve(__dirname, "client/src") } },
});
```

## Key Components Reference

### UI Primitives (`components/ui/`)
```ts
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger, CurrentThemeTab } from "@/components/ui/tabs";
import { ContentPanel } from "@/components/ui/content-panel";
import { PageHeader } from "@/components/ui/page-header";
```

### Graphics (`components/graphics/`)
- **`AnimatedPage`** — fade-in page animation
- **`ScrollReveal`** — reveals children on scroll
- **`KPIGrid`** — metric cards grid (value, label, sublabel, trend, format)
- **`InsightPanel`** — bulleted insights with positive/negative/warning types
- **`formatCompact`** — formats numbers as $1.2M, $450K, etc.

### Design Patterns

```tsx
<AnimatedPage>
  <div className="space-y-6 p-4 md:p-6">
    <PageHeader title="Page Title" subtitle="Description" />
    <ScrollReveal>
      <KPIGrid items={[...]} columns={4} variant="glass" />
    </ScrollReveal>
  </div>
</AnimatedPage>
```

### Typography Classes
- Headings: `text-lg font-display text-foreground`
- Body: `text-sm text-muted-foreground/80 leading-relaxed`
- Labels: `text-xs text-muted-foreground`
- Mono values: `font-mono font-semibold text-foreground`

### Tab Alignment
- `TabsList` defaults to `justify-start` (left-aligned). Never add `justify-center`.
- For wrapping: `flex flex-wrap h-auto gap-1`
- For equal-width grids: `grid w-full grid-cols-N`

## What NOT to Copy

- `server/` — backend is project-specific
- `shared/schema/` — data models are project-specific
- `client/src/lib/financial/` — financial engine (simulation-specific)
- `client/src/features/ai-agent/` — ElevenLabs/Marcela integration
- `client/src/pages/` — page components are project-specific

## Minimal Starter

Copy only: `index.css`, `lib/utils.ts`, core `components/ui/` files (button, card, tabs, dialog, input, label, select, tooltip, content-panel, page-header), `components/graphics/`, `components/icons/`.
