---
name: hbg-design-philosophy
description: Visual identity, UX principles, and hospitality-appropriate design language for HBG Portal. Covers Swiss Modernist design, typography, color philosophy, motion, layout, data presentation, and chart styling. Use when building pages or making visual decisions.
---

The visual identity, UX principles, and hospitality-appropriate design language governing every screen in the HBG Portal. Covers Swiss Modernist design identity, typography system, color philosophy, motion design, layout principles, data presentation patterns, hospitality vocabulary, navigation structure, responsive design, and chart styling. Use this skill when building new pages, designing UI, choosing terminology, or making any visual decision.

## Brand Palette

### CSS Custom Properties

| Token | HSL Value | Hex | Usage |
|-------|-----------|-----|-------|
| `--primary` | `131 18% 68%` | `#9FBCA4` (sage) | Accents, active states, borders, glows |
| `--secondary` | `145 55% 31%` | `#257D41` (forest) | Secondary buttons, section headers |
| `--background` | `30 100% 98%` | `#FFF9F5` (cream) | Main content background |
| `--foreground` | `0 0% 24%` | `#3D3D3D` | Body text |
| `--destructive` | `0 84% 60%` | `#EF4444` | Negative values, errors |
| `--card` | `0 0% 100%` | `#FFFFFF` | Card backgrounds |

### Signature Colors

| Color | Hex | Where |
|-------|-----|-------|
| Midnight | `#0a0a0f` | Sidebar base, tab bar |
| Teal-blue | `#2d4a5e` | Page header gradient start |
| Teal-green | `#3a5a5e` | Page header gradient end |
| Sky glow | `#38BDF8` | Login card borders (login only) |

### Chart Colors
Use `--chart-1` through `--chart-5` CSS variables. Never hardcode hex in chart components.

### Rule: Zero hardcoded hex in core components
All components must use CSS variable tokens or `hsl()` wrappers. No raw hex or Tailwind named colors.

## Typography

| Context | Classes |
|---------|---------|
| Display/page titles | `font-display` + bold + white (on dark headers) |
| Body text | default sans-serif, `text-foreground` |
| Financial numbers | `font-mono tabular-nums` — ALWAYS |
| Labels/captions | `text-xs uppercase tracking-wider text-muted-foreground` |
| Section headers | `text-[hsl(var(--secondary))] font-semibold text-sm` |
| Chart KPI value | `text-5xl font-bold text-[#2d4a5e] tracking-tight font-mono` |

**Fonts:** Inter (body), IBM Plex Sans (headings), JetBrains Mono (numbers). No emojis — use Lucide icons.

## Multi-Column Layout Principle

**Pages should default to 2 or 3 column layouts.** Single-column pages are rare exceptions (login, simple wizards). When building any page, always group related content into side-by-side columns at desktop widths. All grids must collapse to single column on mobile. See the `consistent-card-widths` skill for specific width categories and grid patterns.

## Page Structure

Every page follows this layout:

```
+----------+----------------------------------------------+
|          |  Page Header (teal gradient, rounded-3xl)     |
| Sidebar  +----------------------------------------------+
| (dark,   |  Tab Navigation (midnight, rounded-2xl)       |
|  7-layer +----------------------------------------------+
|  glass)  |                                               |
|  w-64    |  Content Area (bg-background cream)           |
|          |    max-w-7xl mx-auto, p-6 md:p-8              |
+----------+----------------------------------------------+
```

### Page Header
```
bg-gradient-to-br from-[#2d4a5e] via-[#3d5a6a] to-[#3a5a5e] rounded-3xl overflow-hidden
```
White title, optional right-side badge in glass pill (`bg-white/10 backdrop-blur-xl rounded-xl`).

### Tab Navigation
```
bg-[#0a0a0f] rounded-2xl
```
Active tab: sage green pill. Inactive: cream/60 text.

### Sidebar (7-Layer Glass Construction)
```
Layer 1: bg-[#0a0a0f]                           solid near-black base
Layer 2: bg-gradient-to-b from-white/[0.03]      subtle shimmer
Layer 3: w-[1px] sage green glow line             right edge
Layer 4: h-[1px] sage green glow line             top edge
Layer 5: overflow-hidden pointer-events-none      animated orbs
Layer 6: shadow-[inset_0_0_80px_rgba(159,188,164,0.08)]  inner glow
Layer 7: relative flex flex-col h-full            actual content
```

Active nav item: glass pill (`bg-white/12 backdrop-blur-xl`), icon badge (sage-to-forest gradient).

## Financial Tables

### Row Types

| Type | Classes | Usage |
|------|---------|-------|
| Section Header | `text-[hsl(var(--secondary))] font-semibold text-sm` | "Revenue", "Operating Expenses" |
| Line Item | `pl-8` (indented) | Individual expense/revenue lines |
| Subtotal | `bg-[hsl(var(--primary)/0.08)] font-semibold` | "Total Revenue", "GOP" |
| Grand Total | `bg-[hsl(var(--primary)/0.15)] font-bold` | "TOTAL ASSETS" |
| Metric/KPI | `border-t`, muted text | "NOI Margin", percentages |

### Negative Values
Always red (`text-destructive`), always parenthesized: `($1,234)` not `-$1,234`. Use the `Money` component.

### Shared Table Components

**Declarative `<FinancialTable>`** (`components/ui/financial-table.tsx`) — for simple tables where all rows are label + numbers.

**Compositional Row Components** (`components/financial-table-rows.tsx`) — for complex tables with expandable sections, tooltips, per-cell formatting:
- `TableShell`, `SectionHeader`, `LineItem`, `SubtotalRow`, `GrandTotalRow`
- `ExpandableLineItem`, `SpacerRow`, `MetricRow`, `BalanceSheetSection`

## Cards & Containers

### Standard Card (on cream background)
```
rounded-xl border bg-card text-card-foreground shadow
```

### Glass Card (on dark/colored backgrounds)
```
bg-white/95 backdrop-blur-xl rounded-[2rem] p-8 border border-[#9FBCA4]/40 shadow-xl
```

### KPI Metric Cards
```
bg-white/90 backdrop-blur-xl rounded-2xl p-5 border border-white/40 shadow-lg
```

## Buttons

### Default (glass gradient)
```
bg-gradient-to-br from-primary/90 via-primary/70 to-primary/50 backdrop-blur-sm
text-primary-foreground border border-white/30 shadow-lg shadow-primary/20
```

Variants: `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`.

## Icons

**Library:** `lucide-react`

| Size | Usage |
|------|-------|
| `h-4 w-4` | Inline / table |
| `h-5 w-5` | Navigation |
| `h-6 w-6` | Page-level / feature |

## Responsive Behavior

- Sidebar: `fixed -translate-x-full` mobile -> `lg:sticky lg:translate-x-0`
- Financial tables: horizontal `ScrollArea` — never wrap columns
- Property cards: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`
- KPI cards: `grid gap-4 md:grid-cols-4`

## Component Catalog

### Layout
| Component | Path | Usage |
|-----------|------|-------|
| `PageHeader` | `components/ui/page-header.tsx` | Page title bar (dark/light) |
| `ContentPanel` | `components/ui/content-panel.tsx` | Section wrapper |
| `SectionCard` | `components/ui/section-card.tsx` | Section wrapper card |

### Data Display
| Component | Path | Usage |
|-----------|------|-------|
| `FinancialChart` | `components/ui/financial-chart.tsx` | Recharts line chart |
| `FinancialTable` | `components/ui/financial-table.tsx` | Declarative table |
| `Money` | `components/Money.tsx` | Currency display — ALWAYS use |
| `InfoTooltip` | `components/ui/info-tooltip.tsx` | Info icon tooltip |

### Actions
| Component | Path | Usage |
|-----------|------|-------|
| `Button` | `components/ui/button.tsx` | Primary CTA button |
| `SaveButton` | `components/ui/save-button.tsx` | Loading/success save |
| `ExportMenu` | `components/ui/export-toolbar.tsx` | Export dropdown |

## Do / Don't

### DO
- Use CSS custom property tokens for all palette colors
- Use `font-mono tabular-nums` for every financial number
- Use the `Money` component for currency display
- Use `ScrollArea` for horizontally-scrollable tables
- Parenthesize negative values: `($1,234)` not `-$1,234`
- Use `rounded-2xl` or `rounded-3xl` for major containers
- Use teal gradient for page headers

### DON'T
- Write raw hex colors in feature components
- Use `font-sans` for financial numbers
- Put plain white Card on dark backgrounds
- Create new button styles
- Add emojis to the UI
- Use Tailwind gray defaults (`border-gray-200`) — use `border`
- Use `rounded-md` or `rounded-lg` for major cards

## data-testid Convention

| Type | Pattern |
|------|---------|
| Buttons | `button-{action}` |
| Inputs | `input-{field}` |
| Cards | `card-{type}-{id}` |
| Display values | `text-{metric}` |
| Banners | `banner-{type}` |

## New Page Checklist

1. Page header: teal gradient, `rounded-3xl`, white title
2. Tab navigation (if sub-views): midnight `rounded-2xl`, sage active pill
3. Content wrapper: `flex-1 overflow-auto p-6 md:p-8` -> `max-w-7xl mx-auto`
4. Cards: Standard on cream, glass on colored backgrounds
5. Financial tables: Section -> Line Items (indented) -> Subtotal (tinted) -> Grand Total
6. Numbers: `Money` component, `font-mono tabular-nums`, red for negatives
7. Charts: `ChartContainer` + chart color tokens
8. Icons: Lucide, consistent sizing
9. Responsive: Sidebar collapse, `ScrollArea` for tables, grid breakpoints
10. Border radii: `rounded-2xl` for cards, `rounded-3xl` for major sections
