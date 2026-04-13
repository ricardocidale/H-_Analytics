---
name: mobile-responsive
description: Mobile and tablet responsive design patterns, breakpoint strategy, and common fixes for iPhone/iPad layouts. Load this skill for any mobile responsiveness work.
---

# Mobile & Tablet Responsive Design

## Purpose
Documents all responsive design patterns, Tailwind breakpoint strategy, and proven fixes for mobile/tablet rendering issues across the portal. This is the single source of truth for making any page mobile-friendly.

## Key Files
- `client/src/hooks/use-mobile.tsx` — `useIsMobile()` hook (breakpoint: 768px)
- `client/src/components/graphics/KPIGrid.tsx` — Responsive KPI card grid (reference implementation)
- `client/src/components/Layout.tsx` — Main layout with sidebar collapse
- `client/src/components/ui/tabs.tsx` — CurrentThemeTab responsive tab bar

## Related Rules
- `rules/design-standards.md` — Every page must be graphics-rich (mobile too)

## Breakpoint Strategy

### Tailwind Breakpoints (mobile-first)
| Prefix | Min Width | Device Target |
|--------|-----------|---------------|
| (none) | 0px | iPhone SE, small phones |
| `sm:` | 640px | iPhone 14 Pro Max, large phones |
| `md:` | 768px | iPad Mini, small tablets |
| `lg:` | 1024px | iPad Pro 11", iPad Air |
| `xl:` | 1280px | iPad Pro 12.9", small laptops |
| `2xl:` | 1536px | Desktop monitors |

### JS Hook Breakpoint
```tsx
import { useIsMobile } from "@/hooks/use-mobile";
const isMobile = useIsMobile(); // true when viewport < 768px
```

## Common Mobile-Breaking Patterns & Fixes

### 1. Text Overflow
**Problem:** Large text sizes overflow cards on small screens.
```tsx
// BAD
<p className="text-2xl font-bold">$12,500,000</p>

// GOOD
<p className="text-lg sm:text-2xl font-bold truncate">$12,500,000</p>
```

**Key utilities:**
- `truncate` — Single-line ellipsis
- `min-w-0` — Allow flex children to shrink below content size
- `break-words` — Wrap long words
- `text-base sm:text-2xl` — Scale text with breakpoint

### 2. Padding & Spacing
**Problem:** Desktop padding wastes space on mobile.
```tsx
// BAD
<div className="p-6 gap-6">

// GOOD — Tighter on mobile, spacious on desktop
<div className="p-3 sm:p-6 gap-2 sm:gap-4">
```

**Standard padding scale:**
| Element | Mobile | Desktop |
|---------|--------|---------|
| Card body | `p-3` | `sm:p-5` or `sm:p-6` |
| Page container | `p-0` or `px-2` | `sm:p-6` |
| Section spacing | `space-y-4` | `sm:space-y-6` or `sm:space-y-8` |
| Grid gap | `gap-2` | `sm:gap-4` |
| Inner margins | `mb-2` | `sm:mb-3` or `sm:mb-4` |

### 3. Grid Layouts
**Problem:** Too many columns on small screens.
```tsx
// BAD — 4 columns even on phone
<div className="grid grid-cols-4 gap-4">

// GOOD — 2 on mobile, 4 on desktop
<div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
```

**Standard grid patterns:**
| Content Type | Pattern |
|-------------|---------|
| KPI cards (4) | `grid-cols-2 lg:grid-cols-4` |
| KPI cards (3) | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` |
| KPI cards (5) | `grid-cols-2 lg:grid-cols-5` |
| Form fields | `grid-cols-1 md:grid-cols-2` |
| Summary cards (2) | `grid-cols-1 md:grid-cols-2` |
| Property cards | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` |

### 4. Recharts / ResponsiveContainer
**Problem:** `ResponsiveContainer` with `height="100%"` renders 0px height when parent has no explicit height.

```tsx
// BAD — height="100%" with flex parent = 0px on mobile
<div className="flex-1 min-h-[220px]">
  <ResponsiveContainer width="100%" height="100%">

// GOOD — Explicit pixel height
<div style={{ width: '100%', height: 220 }}>
  <ResponsiveContainer width="100%" height={220}>
```

**Chart height recommendations:**
| Chart Type | Mobile Height | Desktop Height |
|-----------|---------------|----------------|
| Line/Bar chart | 200-220px | 300px |
| Pie/Donut chart | 200px | 250px |
| Hero gauge (IRR) | 128x128 | 200x200 |

### 5. Border Radius
**Problem:** Large rounded corners look oversized on small screens.
```tsx
// BAD
<div className="rounded-3xl">
<div className="rounded-[2rem]">

// GOOD
<div className="rounded-2xl sm:rounded-3xl">
<div className="rounded-2xl sm:rounded-[2rem]">
```

### 6. Icons & SVGs
**Problem:** Fixed-size icons crowd text on mobile.
```tsx
// BAD
<div className="w-14 h-14">
  <svg className="w-14 h-14">

// GOOD
<div className="w-10 h-10 sm:w-14 sm:h-14 flex-shrink-0">
  <svg className="w-10 h-10 sm:w-14 sm:h-14">
```

### 7. Flex Layout Direction
**Problem:** Horizontal layouts overflow on mobile.
```tsx
// BAD — stays horizontal even on tiny screens
<div className="flex items-center justify-between">

// GOOD — stacks vertically on mobile
<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
```

### 8. Tables (Financial Statements)
**Problem:** Wide tables with many year columns overflow on mobile.
```tsx
// GOOD — Horizontal scroll wrapper
<div className="overflow-x-auto -mx-3 sm:mx-0">
  <div className="min-w-[600px] sm:min-w-0">
    <Table>...</Table>
  </div>
</div>
```

### 9. Label Text
**Problem:** Labels too large for mobile cards.
```tsx
// Standard label sizing
<p className="text-[10px] sm:text-xs uppercase tracking-wider">Label</p>
<p className="text-xs sm:text-sm text-muted-foreground">Subtitle</p>
```

### 10. Card Overflow Protection
**Problem:** Card content spills outside rounded borders on mobile.
```tsx
// Always add overflow-hidden to cards with absolute positioned elements
<div className="group relative rounded-xl sm:rounded-2xl overflow-hidden">
```

## CurrentThemeTab Mobile Pattern
The tab bar must be scrollable on mobile with smaller touch targets:
```tsx
// Tab container: scrollable on mobile
<div className="overflow-x-auto -mx-2 px-2">
  <div className="flex gap-1 sm:gap-2 min-w-max">

// Tab button: smaller padding on mobile
<button className="px-2.5 py-2 sm:px-4 sm:py-3 gap-1.5 sm:gap-3">
  <div className="w-6 h-6 sm:w-8 sm:h-8">
    <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
  </div>
  <span className="text-xs sm:text-sm whitespace-nowrap">Tab Label</span>
</button>
```

## Hero / Header Sections
```tsx
// Image hero height: shorter on mobile
<div className="h-[180px] sm:h-[280px]">

// Info bar padding
<div className="p-3 sm:p-6">

// Title sizing
<h1 className="text-lg sm:text-2xl font-display">

// Metadata row: wrap on mobile
<div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
```

## Reference Implementations
- **KPIGrid** (`client/src/components/graphics/KPIGrid.tsx`) — Best example of responsive card grid with all patterns applied
- **Dashboard** (`client/src/pages/Dashboard.tsx`) — Full responsive page with charts, KPIs, tables, hero section
- **Layout** (`client/src/components/Layout.tsx`) — Sidebar collapse and mobile menu

## Anti-Patterns (Never Do)
| Don't | Why | Do Instead |
|-------|-----|------------|
| `height="100%"` on ResponsiveContainer | Renders 0px | Use explicit `height={220}` |
| `rounded-3xl` without `sm:` prefix | Oversized corners on phone | `rounded-2xl sm:rounded-3xl` |
| `p-6` on cards without `sm:` | Wastes space on mobile | `p-3 sm:p-6` |
| `text-3xl` on KPI values | Overflows card | `text-xl sm:text-3xl` |
| `grid-cols-4` without breakpoint | 4 tiny columns on phone | `grid-cols-2 lg:grid-cols-4` |
| Fixed `w-[400px]` on anything | Overflows viewport | `w-full max-w-[400px]` |
| `gap-8` between elements | Too much spacing on mobile | `gap-3 sm:gap-8` |
| Inline `min-width: 340px` | Forces horizontal scroll | Remove or use `lg:min-w-[340px]` |
