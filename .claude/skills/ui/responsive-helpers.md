---
name: responsive-helpers
description: Reusable responsive utility hooks, helper patterns, and component conventions for mobile/tablet support.
---

# Responsive Helpers & Utilities

## Purpose
Documents the available responsive utility hooks, shared responsive patterns in components, and conventions for writing mobile-aware code.

## Key Files
- `client/src/hooks/use-mobile.tsx` — Primary mobile detection hook
- `client/src/components/graphics/KPIGrid.tsx` — Reference responsive component
- `client/src/components/ui/tabs.tsx` — CurrentThemeTab responsive implementation

## useIsMobile Hook

### Location
`client/src/hooks/use-mobile.tsx`

### API
```tsx
import { useIsMobile } from "@/hooks/use-mobile";

function MyComponent() {
  const isMobile = useIsMobile(); // boolean, true when < 768px
  
  return isMobile ? <MobileLayout /> : <DesktopLayout />;
}
```

### Breakpoint
- Threshold: **768px** (matches Tailwind `md:` breakpoint)
- Uses `window.matchMedia` with event listener for live updates
- Initial state is `undefined` (falsy) until first measurement

### When to Use
- **Use for:** Conditional rendering of completely different layouts, changing chart configs, hiding heavy components on mobile
- **Don't use for:** Simple styling differences (use Tailwind responsive classes instead)

```tsx
// GOOD — Different component structure
const isMobile = useIsMobile();
return isMobile ? <MobileNav /> : <SidebarNav />;

// BAD — Just styling (use Tailwind instead)
const isMobile = useIsMobile();
return <div className={isMobile ? "p-2" : "p-6"}>  // Use "p-2 md:p-6" instead
```

## Responsive Component Patterns

### KPIGrid (Reference Implementation)
`client/src/components/graphics/KPIGrid.tsx` is the gold standard for responsive cards:

```tsx
// Grid columns adapt by count
const colClass: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 lg:grid-cols-5",
};

// Card styling with responsive utilities
<div className="grid gap-2 sm:gap-4 {colClass}">
  <div className="rounded-xl sm:rounded-2xl p-3 sm:p-5 overflow-hidden">
    <p className="text-[10px] sm:text-xs uppercase truncate">Label</p>
    <span className="text-lg sm:text-2xl font-bold truncate">Value</span>
  </div>
</div>
```

### CurrentThemeTab (Responsive Tab Bar)
`client/src/components/ui/tabs.tsx` handles tabs across devices:
- Phone: Smaller buttons, horizontally scrollable
- Tablet: Full labels with icons
- Desktop: Spacious with hover effects

### Page Container Pattern
Standard responsive page wrapper:
```tsx
<div className="space-y-4 sm:space-y-6 md:space-y-8">
  <PageHeader title="..." subtitle="..." variant="dark" />
  {/* Page content */}
</div>
```

## Responsive Text Scale

Standard text sizing conventions used across the app:

| Element | Mobile | sm: (640px+) | md: (768px+) |
|---------|--------|-------------|-------------|
| Page title | `text-xl` | `sm:text-2xl` | — |
| Section heading | `text-base` | `sm:text-lg` | — |
| KPI value | `text-lg` | `sm:text-2xl` | — |
| KPI label | `text-[10px]` | `sm:text-xs` | — |
| Body text | `text-sm` | — | — |
| Subtitle | `text-xs` | `sm:text-sm` | — |
| Chart tick labels | `fontSize={10}` | — | — |
| Tooltip text | `text-xs` | — | — |
| Badge text | `text-[10px]` | `sm:text-xs` | — |
| Gauge center value | `text-3xl` | `sm:text-5xl` | — |

## Responsive Spacing Scale

| Context | Mobile | Desktop (sm:) |
|---------|--------|--------------|
| Card padding | `p-3` | `sm:p-5` or `sm:p-6` |
| Grid gap | `gap-2` | `sm:gap-4` |
| Section margin | `mb-2` | `sm:mb-3` |
| Flex gap | `gap-1.5` | `sm:gap-3` |
| Page padding | `p-0` or `px-2` | `sm:p-6` |
| Container spacing | `space-y-4` | `sm:space-y-6` |

## Chart Height Helper Pattern

For Recharts, always use explicit pixel heights:
```tsx
// Reusable chart container
function ChartContainer({ height = 220, children }: { height?: number; children: React.ReactNode }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}
```

## Overflow Protection Patterns

### Card with Absolute Elements
```tsx
<div className="group relative overflow-hidden rounded-xl sm:rounded-2xl">
  <div className="absolute inset-0 ..." /> {/* Gradient overlay */}
  <div className="relative ...">  {/* Content */}
```

### Flex Children with Long Text
```tsx
<div className="flex items-center gap-2 min-w-0">
  <Icon className="flex-shrink-0 w-4 h-4" />
  <span className="truncate">Long text that might overflow</span>
</div>
```

### Table Horizontal Scroll
```tsx
<div className="overflow-x-auto -mx-3 sm:mx-0 rounded-xl">
  <div className="min-w-[600px]">
    <Table>...</Table>
  </div>
</div>
```

## Related Rules
- `rules/design-standards.md` — Graphics must render on all devices

## Examples

### Using useIsMobile for Conditional Rendering
```tsx
import { useIsMobile } from "@/hooks/use-mobile";

function PropertyHeader({ property }) {
  const isMobile = useIsMobile();
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <h1 className="text-lg sm:text-2xl">{property.name}</h1>
      {!isMobile && <PropertyActions property={property} />}
    </div>
  );
}
```

### Chart with Explicit Height (Avoiding 0px Bug)
```tsx
<div style={{ width: '100%', height: 220 }}>
  <ResponsiveContainer width="100%" height={220}>
    <BarChart data={data}>
      <XAxis dataKey="name" fontSize={10} />
      <Bar dataKey="value" fill="#9FBC94" />
    </BarChart>
  </ResponsiveContainer>
</div>
```

## Related Skills
- `mobile-responsive/SKILL.md` — Complete pattern reference (load first)
- `mobile-responsive/tablet-layouts.md` — iPad-specific patterns
- `mobile-responsive/device-testing-checklist.md` — Testing verification
- `ui/charts.md` — Chart component conventions
- `component-library/SKILL.md` — UI component catalog
