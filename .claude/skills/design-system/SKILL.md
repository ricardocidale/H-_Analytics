---
name: design-system
description: >
  H+ Analytics by Norfolk AI UI design system. Use when building or modifying pages,
  creating components, or ensuring visual consistency. Covers exact CSS classes
  (production-audited), color palette, typography, component catalog, shared
  financial table components, layout patterns, and migration guides.
---

# Hospitality Business Partner Portal — Design System

> Single source of truth for the visual language of the Partner Portal.
> Every new page, component, or feature must follow these patterns.
> When in doubt, match the live production site at https://partner-portal-landb.replit.app/ exactly.

---

## 1. Brand Palette

### CSS Custom Properties (from `:root`)

| Token                | HSL Value          | Hex / RGB         | Usage                                      |
| -------------------- | ------------------ | ----------------- | ------------------------------------------ |
| `--primary`          | `131 18% 68%`     | `#9FBCA4` (sage)  | Accents, active states, borders, glows     |
| `--secondary`        | `145 55% 31%`     | `#257D41` (forest)| Secondary buttons, section header text     |
| `--background`       | `30 100% 98%`     | `#FFF9F5` (cream) | Main content area background               |
| `--foreground`       | `0 0% 24%`        | `#3D3D3D`         | Body text                                  |
| `--sidebar`          | `0 0% 24%`        | `#3D3D3D`         | Sidebar CSS variable (but actual is below) |
| `--destructive`      | `0 84% 60%`       | `#EF4444`         | Negative values, errors                    |
| `--card`             | `0 0% 100%`       | `#FFFFFF`         | Card backgrounds                           |
| `--muted`            | `30 20% 95%`      |                   | Subtle backgrounds                         |
| `--muted-foreground` | `0 0% 40%`        |                   | Subdued text, labels                       |
| `--border`           | `30 15% 88%`      |                   | Default borders                            |

### Hardcoded Signature Colors (used in specific contexts)

| Color       | Hex         | Where It Appears                               |
| ----------- | ----------- | ---------------------------------------------- |
| Midnight    | `#0a0a0f`   | Sidebar base, tab bar                          |
| Teal-blue   | `#2d4a5e`   | Page header gradient start, chart title text   |
| Mid-teal    | `#3d5a6a`   | Page header gradient via                       |
| Teal-green  | `#3a5a5e`   | Page header gradient end                       |
| Sky glow    | `#38BDF8`   | Login card borders and ambient glow (login only)|

### Rule: Zero hardcoded hex colors in core components

All components (notably `OverviewTab.tsx`) must use CSS variable tokens or hsl() wrappers around tokens. No raw hex (`#FFFFFF`) or Tailwind named colors (`text-emerald-700`) should remain in production-ready feature components.

### Chart Colors

| Token       | Purpose                    | CSS Variable |
| ----------- | -------------------------- | ------------ |
| `--chart-1` | Sage green — revenue       | `hsl(var(--chart-1))` |
| `--chart-2` | Forest green — GOP / Inv   | `hsl(var(--chart-2))` |
| `--chart-3` | Purple accent              | `hsl(var(--chart-3))` |
| `--chart-4` | Orange accent — NOI        | `hsl(var(--chart-4))` |
| `--chart-5` | Red accent                 | `hsl(var(--chart-5))` |

Gradients must also use these tokens (e.g., `url(#irrTube3D)` defined with chart-n stops).

---

## 2. Sidebar — Layered Glass Construction

The sidebar is the most complex visual element. It uses 7 stacked layers:

```
Layer 1: bg-[#0a0a0f]                                         ← solid near-black base
Layer 2: bg-gradient-to-b from-white/[0.03] via-transparent 
         to-black/20                                           ← subtle top-light shimmer
Layer 3: w-[1px] bg-gradient-to-b from-[#9FBCA4]/40 
         via-white/10 to-[#9FBCA4]/30                          ← right edge: sage green glow line
Layer 4: h-[1px] bg-gradient-to-r from-transparent 
         via-[#9FBCA4]/30 to-transparent                       ← top edge: sage green glow line
Layer 5: overflow-hidden pointer-events-none                   ← container for animated ambient orbs
Layer 6: shadow-[inset_0_0_80px_rgba(159,188,164,0.08)]       ← inner sage green glow
Layer 7: relative flex flex-col h-full                         ← actual content
```

### Sidebar Container

```
fixed lg:sticky top-0 left-0 z-50 h-screen w-64 
transition-all duration-500 ease-out flex flex-col overflow-hidden
```

### Navigation Items

**Inactive:**
```
group relative flex items-center gap-3 px-4 py-3 text-sm font-medium 
transition-all duration-300 ease-out rounded-2xl cursor-pointer 
overflow-hidden text-[#FFF9F5]/60 hover:text-white
```

**Active:** Same base classes plus `text-white`, with three inner layers:
1. **Glass pill**: `absolute inset-0 bg-white/12 backdrop-blur-xl rounded-2xl`
2. **Top glow line**: `absolute top-0 left-2 right-2 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent`
3. **Icon badge**: `relative w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#9FBCA4] to-[#257D41] shadow-[0_0_16px_rgba(159,188,164,0.5)]`

### User Card (bottom of sidebar)

Green avatar circle (sage-to-forest gradient), name in white, role in cream/60.

---

## 3. Page Header

A teal-blue gradient banner with rounded corners:

```
bg-gradient-to-br from-[#2d4a5e] via-[#3d5a6a] to-[#3a5a5e] 
rounded-3xl overflow-hidden
```

- Title: white, large, bold
- Subtitle: white/60 or cream/60
- Right side: contextual badge or button (e.g., "Investment Period 2026-2035" in a glass pill)

### Header Badge (e.g., "Investment Period")

```
bg-white/10 backdrop-blur-xl rounded-xl px-5 py-3 
border border-white/20 text-center
```

---

## 4. Tab Navigation Bar

Sits directly below the page header. Dark midnight base with subtle glass overlay:

**Container:**
```
bg-[#0a0a0f] rounded-2xl
```

**Glass overlay:**
```
bg-gradient-to-r from-white/[0.02] via-transparent to-white/[0.02] rounded-2xl
```

**Active tab:** Sage green background pill with icon
**Inactive tabs:** Cream/60 text, icon, no background
**Export button:** Right-aligned, outline style with download icon

---

## 5. Dashboard — Investment Performance Section

The signature sage-green backdrop-blur area on the Dashboard Overview.

### Container

```
relative overflow-hidden rounded-3xl p-8 
border border-[#9FBCA4]/30 shadow-2xl
```

### Background layers (inside container)

```
Layer 1: absolute inset-0 bg-[#9FBCA4]/25 backdrop-blur-3xl   ← sage green at 25% with heavy blur
Layer 2: absolute inset-0 [texture/pattern overlay]
Content: relative                                                ← actual charts sit here
```

### Chart Cards (inside performance section)

White glass cards with large border radius and sage green border accent:

```
bg-white/95 backdrop-blur-xl rounded-[2rem] p-8 
border border-[#9FBCA4]/40 shadow-xl shadow-black/10
```

### KPI Metric Cards (4-column row below charts)

```
bg-white/90 backdrop-blur-xl rounded-2xl p-5 
border border-white/40 shadow-lg shadow-black/10 
hover:shadow-xl transition-all duration-300
```

Layout: `grid gap-4 md:grid-cols-4 max-w-5xl mx-auto`

Each card contains:
- Small radial/donut indicator (blue for Equity Multiple, gray for Cash-on-Cash)
- Large number: `text-2xl font-bold font-mono tabular-nums`
- Label: `text-sm text-muted-foreground`
- Optional accent: green progress bar (Equity Invested), green percentage (Projected Exit +116% gain)

### Summary Data Cards (Portfolio Composition, Capital Structure)

Standard white cards on the cream background area — not glass:
```
rounded-xl border bg-card text-card-foreground shadow
```

With key-value rows: label left-aligned, value right-aligned with `font-mono tabular-nums`.

### 10-Year Summary Cards (Revenue, NOI, Cash Flow)

Same glass style as KPI cards:
```
bg-white/90 backdrop-blur-xl rounded-xl p-4 
border border-white/40 shadow-lg shadow-black/10 text-center
```

---

## 6. Financial Tables

### Common Structure

All financial tables use shadcn/ui `Table` components inside a `ScrollArea` for horizontal scrolling on 10-year projections.

### Table Header

```
text-xs uppercase tracking-wider text-muted-foreground
```

First column: "CATEGORY", "ACCOUNT", or "INCOME STATEMENT"
Year columns: right-aligned

### Row Types

**Section Headers** — Green text, no background:
```tsx
<TableCell className="text-[hsl(var(--secondary))] font-semibold text-sm py-2">
  Revenue
</TableCell>
```
Used for: "Revenue", "Operating Expenses", "Non-Operating Expenses", "ASSETS", "LIABILITIES", "EQUITY"

**Line Items** — Regular text, indented:
```tsx
<TableCell className="pl-8">Room Revenue</TableCell>
<TableCell className="text-right font-mono tabular-nums">
  <Money value={amount} />
</TableCell>
```

**Subtotal Rows** — Sage tinted background, bold, green values:
```tsx
<TableRow className="bg-[hsl(var(--primary)/0.08)] font-semibold">
```
Used for: "Total Revenue", "Gross Operating Profit (GOP)", "Net Fixed Assets"

**Grand Total Rows** — Darker tint, bold uppercase:
```tsx
<TableRow className="bg-[hsl(var(--primary)/0.15)] font-bold">
  <TableCell className="uppercase">TOTAL ASSETS</TableCell>
```

**KPI/Metric Rows** — Percentages, border-top separator:
```tsx
<TableRow className="border-t">
  <TableCell className="text-muted-foreground text-sm">NOI Margin</TableCell>
  <TableCell className={cn("text-right text-sm", value < 0 && "text-destructive")}>
```

### Negative Values — Always Red, Always Parenthesized

The `Money` component handles this:
- Positive: `$1,431,561` — default text color
- Negative: `($3,322,984)` — `text-destructive`, wrapped in parentheses

### Expandable Rows

Consolidated Income Statement uses collapsible rows with chevron `>`. Use shadcn `Collapsible`.

---

## 7. Property Cards (Portfolio Page)

Dark teal glass cards with property imagery:

```
relative overflow-hidden rounded-3xl 
bg-gradient-to-br from-[#2d4a5e] via-[#3d5a6a] to-[#3a5a5e]
border border-[#9FBCA4]/30
```

- Full-width property photo at top
- Status badges overlay on image: colored pills ("Full Equity" green, "Financed" orange, "Planned" red, "Acquisition" teal)
- Property name: white bold text
- Location: MapPin icon + cream text
- Stats grid: Acquisition cost, Room capacity in subtle cards
- "View Details →" link at bottom right

Portfolio layout: `grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3`

---

## 8. Login Page

Full-screen dark background with property lifestyle photo (darkened). Centered glass card.

### Login Card

```
relative overflow-hidden rounded-2xl 
bg-gradient-to-br from-[#E0F2FE]/22 via-[#BAE6FD]/18 to-[#7DD3FC]/15 
backdrop-blur-2xl 
border border-[#38BDF8]/25 
shadow-[0_0_40px_rgba(56,189,248,0.35),0_0_80px_rgba(56,189,248,0.18),0_8px_32px_rgba(0,0,0,0.3)]
```

- Ambient glow orbs behind: `bg-[#38BDF8]/10 blur-[120px]`
- Logo + "Hospitality Business" branding at top
- Input fields: dark glass with subtle borders
- **Circular orb button** for Sign In (112×112px, `rounded-full`) — unique to login, do not replicate

---

## 9. Sensitivity Analysis Page

### KPI Summary Row

4-5 metric cards in a horizontal row (same as Dashboard):
```
bg-white/90 backdrop-blur-xl rounded-xl p-4 border border-white/40
```

### Variable Adjustments Card

Standard `Card` on cream background containing sliders (uses shared `Slider` from `@/components/ui/slider`):
- Track: `h-2 bg-gray-200/80 shadow-inner rounded-full`
- Range fill: gradient `from-[#9FBCA4] to-[#85a88b]`
- Thumb: `h-5 w-5 bg-white border-2 border-[#9FBCA4] shadow-md` with `hover:scale-110` and `active:scale-95` animations
- Value display: right-aligned, `font-mono font-semibold text-[#9FBCA4]` (or read-only `text-sm font-mono text-primary`)
- Labels: `text-sm text-muted-foreground` at left, value at right
- Pair with `EditableValue` for editable fields or `<span>` for read-only

### Impact Chart Card

Horizontal bar chart (Recharts) with green (upside) and red (downside) bars.

---

## 10. Methodology Page

No dark header on this page — uses cream background throughout.

### Overview Box

```
rounded-xl border bg-card p-6
```
With document icon, bold title, body text with **bold** keywords.

### Accordion Sections

shadcn/ui `Accordion` with:
- Colored circle icon per section (varied colors: red, green, blue, orange, purple)
- Title: bold, `text-sm font-medium`
- Subtitle: `text-muted-foreground text-sm`
- Chevron expand/collapse at right

---

## 11. Typography

| Context              | Classes                                              |
| -------------------- | ---------------------------------------------------- |
| Display/page titles  | `font-display` + bold + white (on dark headers)      |
| Body text            | default sans-serif, `text-foreground`                |
| Financial numbers    | `font-mono tabular-nums` — ALWAYS                    |
| Labels/captions      | `text-xs uppercase tracking-wider text-muted-foreground` |
| Section headers      | `text-[hsl(var(--secondary))] font-semibold text-sm` |
| Chart KPI value      | `text-5xl font-bold text-[#2d4a5e] tracking-tight font-mono` |
| Card title           | `font-display text-lg leading-none tracking-tight`   |
| Card description     | `label-text text-muted-foreground`                   |

No emojis in the UI. Use Lucide icons exclusively.

---

## 12. Icons

**Library:** `lucide-react`

**Sizes:**
- Inline / table: `h-4 w-4`
- Navigation: `h-5 w-5`
- Page-level / feature: `h-6 w-6`

**Common icons:** LayoutDashboard, Building2, Search, BarChart3, Settings2, User, FolderOpen, Shield, BookOpen, Download, ChevronDown, ChevronRight, ArrowLeft, Plus, Eye, EyeOff, DollarSign, TrendingUp, PieChart, MapPin, BedDouble, Calendar

---

## 13. Buttons

### Default (Replit "liquidy ice" glass)

```
bg-gradient-to-br from-primary/90 via-primary/70 to-primary/50 
backdrop-blur-sm text-primary-foreground 
border border-white/30 shadow-lg shadow-primary/20
```

With `hover-elevate active-elevate-2` classes for interaction.

### Variants

| Variant       | Usage                                     |
| ------------- | ----------------------------------------- |
| `default`     | Primary actions (glass gradient)          |
| `secondary`   | Alternative actions                       |
| `outline`     | Tertiary/subtle actions, Export buttons   |
| `ghost`       | Minimal actions, icon-only buttons        |
| `destructive` | Delete, cancel, dangerous actions         |
| `link`        | Text links with underline on hover        |

---

## 14. Responsive Behavior

- Sidebar: `fixed -translate-x-full` on mobile → `lg:sticky lg:translate-x-0`
- Financial tables: horizontal `ScrollArea` — never wrap year columns
- Property cards: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`
- KPI cards: `grid gap-4 md:grid-cols-4`
- Dashboard charts: `flex flex-col md:flex-row gap-8`

---

## 15. Page Structure Template

Every page follows this formula:

```
┌─────────┬─────────────────────────────────────────────┐
│         │  Page Header (teal gradient, rounded-3xl)    │
│ Sidebar ├─────────────────────────────────────────────┤
│ (dark,  │  Tab Navigation (midnight, rounded-2xl)      │
│  7-layer├─────────────────────────────────────────────┤
│  glass) │                                              │
│  w-64   │  Content Area (bg-background cream)          │
│         │    max-w-7xl mx-auto                         │
│         │    p-6 md:p-8                                │
│         │                                              │
└─────────┴─────────────────────────────────────────────┘
```

Main content area wrapper: `flex-1 overflow-auto p-6 md:p-8` → `max-w-7xl mx-auto`

---

## 16. Do / Don't

### DO:
- Use CSS custom property tokens for all palette colors
- Use `font-mono tabular-nums` for every financial number
- Use the `Money` component for currency display
- Use `ScrollArea` for horizontally-scrollable tables
- Use GlassCard on dark surfaces, standard Card on cream
- Parenthesize negative values: `($1,234)` not `-$1,234`
- Match the 7-layer sidebar structure exactly
- Use the teal gradient for page headers (not flat black)
- Use `backdrop-blur-xl` and transparent white/sage borders for glass effects
- Use `rounded-2xl` or `rounded-3xl` for major containers (not `rounded-lg`)

### DON'T:
- Write raw hex colors in feature components — use tokens
- Use `font-sans` for financial numbers
- Put plain white Card on dark backgrounds
- Create new button styles
- Add emojis to the UI
- Skip the page header pattern
- Use Tailwind gray defaults (`border-gray-200`) — use `border`
- Use `rounded-md` or `rounded-lg` for major cards — the app uses larger radii

---

## 17. File Locations

| What                     | Where                                      |
| ------------------------ | ------------------------------------------ |
| shadcn/ui primitives     | `client/src/components/ui/`                |
| Composed components      | `client/src/components/`                   |
| Feature modules          | `client/src/features/`                     |
| Pages                    | `client/src/pages/`                        |
| Design tokens            | `components.json` + `tailwind.config.ts`   |
| This skill               | `.claude/skills/design-system/SKILL.md`    |
| Claude Code rules        | `.claude/rules/`                           |
| Project instructions     | `.claude/claude.md`                        |

---

## 18. New Page Checklist

When building a new page:

1. ☐ **Page header**: Teal gradient (`from-[#2d4a5e] via-[#3d5a6a] to-[#3a5a5e]`), `rounded-3xl`, white title, optional right badge
2. ☐ **Tab navigation** (if sub-views): Midnight `bg-[#0a0a0f] rounded-2xl`, active tab = sage pill, Lucide icons
3. ☐ **Content wrapper**: `flex-1 overflow-auto p-6 md:p-8` → `max-w-7xl mx-auto`
4. ☐ **Cards**: Standard `Card` on cream, glass cards on colored backgrounds
5. ☐ **Financial tables**: Section Header → Line Items (indented) → Subtotal (tinted) → Grand Total (bold tinted)
6. ☐ **Numbers**: `Money` component, `font-mono tabular-nums`, red for negatives, parenthesized
7. ☐ **Charts**: `ChartContainer` + `ChartConfig`, chart color tokens
8. ☐ **Icons**: Lucide, consistent sizing (`h-4 w-4` inline, `h-5 w-5` nav)
9. ☐ **Responsive**: Sidebar collapse, `ScrollArea` for tables, grid breakpoints
10. ☐ **Border radii**: `rounded-2xl` for cards, `rounded-3xl` for major sections

---

## 19. Known Couplings

**ColorPicker + Theme**: `components/ui/color-picker.tsx` hardcodes brand colors in `PRESET_COLORS` separately from `tailwind.config.ts`. Update both when brand colors change.

**Layout + Hex colors**: `Layout.tsx` uses hardcoded hex values for the sidebar layers and page header gradient. These are intentional — the sidebar construction is too specific for CSS variables. But if the brand palette shifts, update Layout.tsx manually.

---

## 20. Shared Financial Table Components

Financial tables use TWO approaches depending on complexity:

### A. Declarative `<FinancialTable>` — for simple tables

Path: `client/src/components/ui/financial-table.tsx`

Use when every row follows the same shape (label + array of numbers). Pass all data as props.

```tsx
import { FinancialTable } from "@/components/ui/financial-table";

<FinancialTable
  title="Income Statement"
  columns={["2026", "2027", "2028"]}
  stickyLabel="Category"
  variant="light"
  rows={[
    { label: "Revenue",       values: [],             isSection: true },
    { label: "Room Revenue",  values: [800, 880, 960], indent: 1 },
    { label: "F&B Revenue",   values: [200, 220, 240], indent: 1 },
    { label: "Total Revenue", values: [1000, 1100, 1200], isTotal: true },
    { label: "",              values: [],              isSeparator: true },
    { label: "NOI",           values: [400, 450, 500], bold: true },
  ]}
/>
```

Row flags: `indent` (number), `bold`, `isSection`, `isSeparator`, `isSubtotal`, `isTotal`, `negative`, `formatAsPercent`.

### B. Compositional Row Components — for complex tables

Path: `client/src/components/financial-table-rows.tsx`

Use when rows need expandable sections, per-cell formatting, custom calculations, tooltips, or mixed row types. Lay out JSX children inside a `<TableShell>`.

```tsx
import {
  TableShell,
  SectionHeader,
  SubtotalRow,
  LineItem,
  ExpandableLineItem,
  GrandTotalRow,
  SpacerRow,
  MetricRow,
} from "@/components/financial-table-rows";

<TableShell
  title="Cash Flow Statement"
  subtitle="Operating, investing, and financing activities"
  columns={yearLabels}
  stickyLabel="Cash Flow Statement"
>
  <SectionHeader label="Operating Cash Flow" colSpan={colSpan} tooltip="..." />

  <ExpandableLineItem
    label="Cash Received from Guests"
    values={revenueByYear}
    expanded={expanded.revenue}
    onToggle={() => toggle("revenue")}
  >
    <LineItem label="Room Revenue"  values={roomRevByYear}  indent />
    <LineItem label="F&B Revenue"   values={fbRevByYear}    indent />
  </ExpandableLineItem>

  <LineItem label="Less: Interest" values={interestByYear} negate />
  <SubtotalRow label="Cash from Operations" values={cfoByYear} positive />
  <SpacerRow colSpan={colSpan} />

  <GrandTotalRow label="Net Change in Cash" values={netCashByYear} />
  <MetricRow
    label="Cash-on-Cash Return"
    values={cocByYear.map(v => `${v.toFixed(1)}%`)}
    highlights={cocByYear.map(v => v > 0 ? "text-accent" : "text-muted-foreground")}
  />
</TableShell>
```

### Component Reference

| Component              | Purpose                                          | Key Props                                       |
| ---------------------- | ------------------------------------------------ | ----------------------------------------------- |
| `TableShell`           | Card + header + scrollable table wrapper          | `title`, `subtitle`, `columns`, `stickyLabel`, `banner` |
| `SectionHeader`        | Green-text section divider                        | `label`, `colSpan`, `tooltip`                    |
| `LineItem`             | Standard data row                                 | `label`, `values`, `indent`, `negate`, `showZero`, `tooltip` |
| `SubtotalRow`          | Bold tinted intermediate total                    | `label`, `values`, `tooltip`, `positive`         |
| `GrandTotalRow`        | Primary gradient final total                      | `label`, `values`, `tooltip`                     |
| `ExpandableLineItem`   | Collapsible detail section                        | `label`, `values`, `expanded`, `onToggle`, `negate` |
| `SpacerRow`            | Visual breathing room                             | `colSpan`, `height`                              |
| `MetricRow`            | KPI row (%, x, text)                              | `label`, `values` (strings), `highlights`        |
| `BalanceSheetSection`  | "ASSETS" / "LIABILITIES" / "EQUITY" divider       | `label`, `colSpan`                               |
| `BalanceSheetLineItem` | Indented BS row with optional subtotal/total style | `label`, `amount`, `indent`, `bold`, `isSubtotal`, `isTotal` |

### When to use which

| Situation                             | Use                        |
| ------------------------------------- | -------------------------- |
| All rows are label + numbers[]        | `FinancialTable`           |
| Expandable/collapsible sections       | Row components             |
| Per-cell conditional formatting       | Row components             |
| Tooltips on specific rows             | Row components             |
| Custom calculation per cell           | Row components             |
| Simple summary table (BS style)       | `FinancialTable` or BS row components |
| Table with warnings/banners           | `TableShell` + row components |

---

## 21. Component Catalog (Existing)

### Layout Components

| Component       | Path                                           | Usage                                    |
| --------------- | ---------------------------------------------- | ---------------------------------------- |
| `PageHeader`    | `components/ui/page-header.tsx`                | Page title bar (dark/light variants)     |
| `ContentPanel`  | `components/ui/content-panel.tsx`              | Section wrapper with consistent padding  |
| `GlassCard`     | `components/ui/glass-card.tsx`                 | Dark glass card (default/success/warning/chart) |

### Data Display

| Component        | Path                                          | Usage                                    |
| ---------------- | --------------------------------------------- | ---------------------------------------- |
| `FinancialChart` | `components/ui/financial-chart.tsx`            | Recharts line chart with preset colors   |
| `FinancialTable` | `components/ui/financial-table.tsx`            | Declarative data-driven table            |
| `Money`          | `components/Money.tsx`                         | Inline currency display — ALWAYS use     |
| `HelpTooltip`    | `components/ui/help-tooltip.tsx`               | Info icon with hover tooltip             |

Preset chart series keys: `revenue`, `gop`, `noi`, `expenses`, `netIncome`, `cashFlow`, `fcfe`, `btcf`, `atcf`

### Action Components

| Component     | Path                                            | Usage                                    |
| ------------- | ----------------------------------------------- | ---------------------------------------- |
| `GlassButton` | `components/ui/glass-button.tsx`               | Primary CTA on dark backgrounds          |
| `SaveButton`  | `components/ui/save-button.tsx`                | Loading/success save button              |
| `ExportMenu`  | `components/ui/export-toolbar.tsx`             | Export dropdown (PDF, Excel, CSV, PPTX)  |

### Existing Financial Statement Files (to be migrated)

| File                          | Status                                          |
| ----------------------------- | ----------------------------------------------- |
| `YearlyCashFlowStatement.tsx` | Has local row components — **extract to shared** |
| `YearlyIncomeStatement.tsx`   | Hardcoded markup — **migrate to shared rows**    |
| `ConsolidatedBalanceSheet.tsx` | Hardcoded markup — **migrate to shared rows**   |
| `FinancialStatement.tsx`      | Monthly table, hardcoded — **migrate**           |

---

## 22. Migration Pattern

When refactoring an existing financial table to use shared components:

### Before (hardcoded in YearlyIncomeStatement.tsx):
```tsx
<TableRow className="bg-gray-50">
  <TableCell colSpan={years + 1} className="font-bold text-[#257D41]">Revenue</TableCell>
</TableRow>
<TableRow className="bg-white">
  <TableCell className="pl-6 text-gray-700">Room Revenue</TableCell>
  {yearlyData.map((y) => (
    <TableCell key={y.year} className="text-right text-gray-700">
      <Money amount={y.revenueRooms} />
    </TableCell>
  ))}
</TableRow>
<TableRow className="bg-[#257D41]/10 font-bold">
  <TableCell className="text-gray-900">Total Revenue</TableCell>
  {yearlyData.map((y) => (
    <TableCell key={y.year} className="text-right text-[#257D41]">
      <Money amount={y.revenueTotal} />
    </TableCell>
  ))}
</TableRow>
```

### After (shared components):
```tsx
<SectionHeader label="Revenue" colSpan={colSpan} />
<LineItem label="Room Revenue" values={yearlyData.map(y => y.revenueRooms)} />
<SubtotalRow label="Total Revenue" values={yearlyData.map(y => y.revenueTotal)} positive />
```

The visual output is identical. The code is 3 lines instead of 15, and the styling is centralized.

---

## 23. data-testid Convention

All interactive/meaningful elements need a `data-testid`:

| Type           | Pattern                                     |
| -------------- | ------------------------------------------- |
| Buttons        | `button-{action}` (e.g. `button-export-pdf`) |
| Inputs         | `input-{field}` (e.g. `input-adr`)          |
| Cards          | `card-{type}-{id}` (e.g. `card-property-123`) |
| Display values | `text-{metric}` (e.g. `text-total-revenue`) |
| Banners        | `banner-{type}` (e.g. `banner-equity-warning`) |
