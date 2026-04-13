---
name: tablet-layouts
description: iPad-specific layout patterns for iPad Mini, iPad Air, and iPad Pro form factors.
---

# Tablet Layout Patterns (iPad)

## Purpose
Covers iPad-specific responsive behavior at `md:` (768px) and `lg:` (1024px) breakpoints. iPads display sidebar + content simultaneously, so layouts need different treatment than phones.

## Key Files
- `client/src/components/Layout.tsx` — Sidebar visibility and width
- `client/src/components/ui/sidebar.tsx` — Sidebar responsive behavior
- `client/src/hooks/use-mobile.tsx` — `useIsMobile()` threshold at 768px

## iPad Viewport Sizes
| Device | Portrait | Landscape | Breakpoint |
|--------|----------|-----------|------------|
| iPad Mini | 768px | 1024px | `md:` / `lg:` |
| iPad Air | 820px | 1180px | `md:` / `lg:` |
| iPad Pro 11" | 834px | 1194px | `md:` / `lg:` |
| iPad Pro 12.9" | 1024px | 1366px | `lg:` / `xl:` |

## Sidebar Behavior on Tablets
- **Portrait iPad (md: 768px):** Sidebar collapses to icon-only mode. Content gets full width minus 64px.
- **Landscape iPad (lg: 1024px):** Sidebar expands with labels. Content gets full width minus sidebar width.
- **iPad Pro 12.9" (xl: 1280px):** Full desktop layout.

## Grid Patterns for Tablets

### KPI Cards
```tsx
// 2 columns phone → 2 columns iPad portrait → 4 columns iPad landscape+
<div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
```

### Form Fields
```tsx
// Stacked on phone → 2 columns from iPad portrait up
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
```

### Content Cards
```tsx
// Single column phone → 2 columns tablet → 3 columns desktop
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

### Financial Tables
Tables are the most challenging on tablets. The sidebar eats width, so year columns can overflow:
```tsx
// Always use horizontal scroll wrapper for financial tables
<div className="overflow-x-auto">
  <Table className="min-w-[700px]">
```

## Chart Sizing on Tablets
Charts need consistent heights regardless of tablet orientation:
```tsx
// Fixed height for consistent rendering
<div style={{ width: '100%', height: 280 }}>
  <ResponsiveContainer width="100%" height={280}>
```

## Tab Bar on Tablets
CurrentThemeTab should show full labels on tablet, with scrolling only needed on phone:
```tsx
// Tabs: icon-only on phone, icon+label on tablet+
<span className="hidden sm:inline text-sm">Tab Label</span>
// Or always show but smaller on phone:
<span className="text-xs sm:text-sm whitespace-nowrap">Tab Label</span>
```

## Split-View Layouts (iPad-Specific)
Some pages benefit from side-by-side layout on iPad landscape:
```tsx
// Stacked on phone/portrait iPad, side-by-side on landscape iPad+
<div className="flex flex-col lg:flex-row gap-4">
  <div className="w-full lg:w-1/2">Left panel</div>
  <div className="w-full lg:w-1/2">Right panel</div>
</div>
```

## Dialog/Modal Sizing
Dialogs should be more constrained on tablets than desktop:
```tsx
<DialogContent className="max-w-lg sm:max-w-xl md:max-w-2xl max-h-[85vh] overflow-y-auto">
```

## Touch Targets
iPad users use fingers, not mouse pointers. Minimum touch target: 44x44px.
```tsx
// Buttons: adequate touch target size
<button className="px-4 py-2.5 min-h-[44px]">

// Table rows: adequate row height for touch
<TableRow className="h-12">
```

## Page Header Actions on Tablet
Action buttons should not wrap awkwardly on tablet portrait:
```tsx
// Header with actions
<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
  <div>
    <h1 className="text-xl sm:text-2xl">Title</h1>
    <p className="text-sm text-muted-foreground">Subtitle</p>
  </div>
  <div className="flex items-center gap-2 flex-wrap">
    <Button>Action 1</Button>
    <Button>Action 2</Button>
  </div>
</div>
```

## Examples

### iPad Portrait KPI Grid
```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
  <KPICard label="IRR" value="18.5%" />
  <KPICard label="Multiple" value="2.1x" />
  <KPICard label="CoC" value="12.3%" />
  <KPICard label="Exit" value="$4.2M" />
</div>
```

### iPad Split-View Financial Page
```tsx
<div className="flex flex-col lg:flex-row gap-4">
  <div className="w-full lg:w-1/2">
    <Card><ChartContainer height={280}><LineChart /></ChartContainer></Card>
  </div>
  <div className="w-full lg:w-1/2">
    <div className="overflow-x-auto"><Table /></div>
  </div>
</div>
```

## Related Rules
- `rules/design-standards.md` — Graphics must render properly on all devices
- `.claude/skills/mobile-responsive/SKILL.md` — Base mobile patterns (load first)
