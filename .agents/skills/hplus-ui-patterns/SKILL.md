---
name: hplus-ui-patterns
description: "H+ Hospitality Business Portal UI/UX design guide. Covers the app's specific design system: glassmorphism cards, IBM Plex Sans / Inter typography, accent-pop gold (#D4A017) and accent-pop-2 green color tokens, PageHeader / ContentPanel / Empty component patterns, sidebar layout, framer-motion animation conventions, data-testid requirements, icon system, micro-interaction standards, and dark/light mode rules. Use when building new pages, components, or reviewing UI for consistency with the portal's established design language."
---

# H+ Hospitality Business Portal — UI/UX Design Guide

This is the authoritative design reference for the **Hospitality+ (H+) Business Portal** (`artifacts/hospitality-business-portal/`). Use this guide whenever you are building new pages, components, or reviewing existing UI for design consistency.

---

## 1. Design Philosophy

The portal targets hospitality investment professionals. The visual language is:

- **Premium & Trustworthy** — clean, data-dense layouts that feel like institutional finance tools
- **Warm Hospitality Touch** — gold/amber accent pop, not cold blue SaaS
- **Dark-first** — dark mode is the primary experience; light mode is a supported variant
- **Glassmorphism cards** — frosted-glass surfaces with `backdrop-blur`, semi-transparent backgrounds
- **Subtle motion** — framer-motion for enter/exit only; never looping or distracting

---

## 2. Typography

### Font Stack

| Token | Value | Use |
|---|---|---|
| `--font-sans` | `IBM Plex Sans, sans-serif` | Body text, labels, form inputs |
| `--font-display` | `IBM Plex Sans, sans-serif` | Section headers, card titles (via `.font-display` class) |
| Fallback in CSS | `Inter, sans-serif` | Used via `@apply font-sans` in base layer |

### Scale

| Class | Size | Weight | Use |
|---|---|---|---|
| `text-2xl font-bold` | 1.5rem | 700 | Page-level hero titles |
| `text-xl font-semibold` | 1.25rem | 600 | `PageHeader` title |
| `text-lg font-display` | 1.125rem | — | `ContentPanel` title, section headers |
| `text-sm` | 0.875rem | — | Body copy, table cells |
| `text-xs` | 0.75rem | — | Badges, captions, helper text, button labels |

### Rules

- Do NOT use `font-bold` on card titles — use `font-semibold` or `font-display`
- `text-muted-foreground` for subtitles and helper text
- `text-foreground` for primary text
- `text-card-foreground` inside cards

---

## 3. Color Tokens

### Core Semantic Tokens (CSS variables → Tailwind classes)

| Token | Light | Dark | Class |
|---|---|---|---|
| `--background` | White-ish | Very dark | `bg-background` |
| `--foreground` | Dark | White | `text-foreground` |
| `--card` | White | Dark glass | `bg-card` |
| `--border` | Gray/20 | White/10 | `border-border` |
| `--muted-foreground` | Gray/60 | Gray/50 | `text-muted-foreground` |

### Accent Tokens (Brand Colors)

| Token | Value | Class | Use |
|---|---|---|---|
| `--accent-pop` | HSL 43 90% 55% (gold/amber) | `bg-accent-pop`, `text-accent-pop` | Primary CTAs, highlights, status badges |
| `--accent-pop-foreground` | White | `text-accent-pop-foreground` | Text on gold backgrounds |
| `--accent-pop-2` | HSL 155 41% 30% (forest green) | `bg-accent-pop-2` | Secondary CTAs, success states |
| `--accent` | Muted sage/blue | `bg-accent` | Hover backgrounds, selection states |

### Rules

- Gold (`accent-pop`) = premium, money, investment. Use for primary badges, "generated" states, investor-facing values.
- Green (`accent-pop-2`) = approved, active, operating. Use for active property status, positive deltas.
- Never use raw hex colors in component code — always use design tokens.
- Status variants: success = green, warning = amber/gold, error = destructive, info = blue.

---

## 4. Card & Surface Patterns

### Standard Card

```tsx
// Use the shadcn Card primitive — DO NOT build div-based cards
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

<Card className="rounded-xl border bg-card text-card-foreground shadow">
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

### ContentPanel (for page sections with title + subtitle)

```tsx
import { ContentPanel } from "@/components/ui/content-panel";

<ContentPanel title="Section Title" subtitle="Optional helper text">
  {children}
</ContentPanel>
```

`ContentPanel` renders `rounded-xl border-border bg-card shadow-sm p-6` with a `font-display` title.

### Glassmorphism variant (for modal overlays, floating panels)

```tsx
className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-lg"
```

Use only on surfaces that overlay a background (modals, drawers, floating Rebecca panel). Do NOT apply to inline page cards.

### PageHeader (every page top)

```tsx
import { PageHeader } from "@/components/ui/page-header";

<PageHeader
  title="Page Title"
  subtitle="Description of what this page does"
  backLink="/parent-route"
  actions={<Button>Action</Button>}
/>
```

`PageHeader` renders `rounded-xl border border-border/80 bg-card shadow-sm p-4 sm:p-5`. Always use it as the first element in a page layout — never build a custom header div.

---

## 5. Layout Patterns

### Standard Page Layout

```tsx
<div className="flex flex-col gap-6 p-4 sm:p-6">
  <PageHeader title="..." subtitle="..." />
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
    {/* content */}
  </div>
</div>
```

### Section Spacing

- Between page sections: `gap-6` (1.5rem)
- Inside a card/panel: `gap-4` (1rem)
- Between inline elements: `gap-2` or `gap-3`

### Sidebar Layout

- Left sidebar is always from `@/components/ui/sidebar.tsx`
- Right collapsible panel (Rebecca / co-pilot): uses framer-motion width animation, `min-w-0` on content area to prevent overflow

### Responsive Breakpoints

| Breakpoint | Width | Use |
|---|---|---|
| Base | < 640px | Mobile — stack columns, reduce padding |
| `sm:` | 640px | Inline header actions, `p-5` padding |
| `lg:` | 1024px | Multi-column grids, sidebar expansion |
| `xl:` | 1280px | Widescreen table views |

---

## 6. Component-Specific Rules

### Buttons

```tsx
// Primary action
<Button variant="default">Save</Button>

// Secondary / outline
<Button variant="outline" size="sm" className="gap-2 h-9 text-xs font-medium">
  <IconRefresh className="w-4 h-4" />
  Refresh
</Button>

// Icon button
<Button variant="outline" size="icon" className="h-9 w-9 hover:scale-[1.03] active:scale-[0.97] transition-transform">
  <ChevronLeft className="w-4 h-4" />
</Button>
```

Micro-interaction standard: `hover:scale-[1.03] active:scale-[0.97] transition-transform` on interactive icon buttons.

### Badges

```tsx
import { Badge } from "@/components/ui/badge";

// Status
<Badge variant="default">Active</Badge>     // accent-pop gold
<Badge variant="secondary">Draft</Badge>    // muted
<Badge variant="destructive">Error</Badge>  // red
<Badge variant="outline">Pending</Badge>    // bordered
```

### Tables

- Use the `data-table` component for sortable/paginated tables
- For simple read-only tables: `<table className="w-full text-sm">`
- Header: `<th className="text-xs text-muted-foreground font-medium text-left pb-2">`
- Row hover: `hover:bg-accent/30 transition-colors`
- Numeric cells: `text-right font-mono tabular-nums`

### Accordions

```tsx
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

// Use type="multiple" for independent sections
// Use type="single" collapsible for exclusive sections
```

### Empty States

```tsx
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyActions } from "@/components/ui/empty";

<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><IconDatabase className="w-6 h-6" /></EmptyMedia>
    <EmptyTitle>No data yet</EmptyTitle>
    <EmptyDescription>Description of what should appear here.</EmptyDescription>
  </EmptyHeader>
  <EmptyActions>
    <Button variant="outline" size="sm">Action</Button>
  </EmptyActions>
</Empty>
```

Empty states render in a dashed-border rounded container with `p-12` padding. Always include an icon, title, description, and at least one action if relevant.

### Loading / Skeleton

```tsx
import { Skeleton } from "@/components/ui/skeleton";

// Placeholder rows
<div className="space-y-2">
  <Skeleton className="h-4 w-full" />
  <Skeleton className="h-4 w-3/4" />
</div>

// Spinner for async actions
import { Spinner } from "@/components/ui/spinner";
<Spinner className="w-4 h-4" />
```

---

## 7. Icon System

All icons must come from `@/components/icons/` — never import directly from `lucide-react` or `@tabler/icons-react` in page/component code.

### Icon Files

| File | Category |
|---|---|
| `themed-icons.tsx` | ChevronLeft, ChevronDown, etc. — themed wrappers |
| `navigation-icons.tsx` | Sidebar navigation icons |
| `action-icons.tsx` | Buttons, CTAs |
| `data-display-icons.tsx` | Charts, tables, dashboards |
| `financial-icons.tsx` | Revenue, expenses, debt |
| `status-icons.tsx` | Check, X, Warning, Info |
| `brand-icons.tsx` | Hotel brand logos |

### Icon Sizing

| Context | Class |
|---|---|
| In button (sm) | `w-3.5 h-3.5` |
| In button (default) | `w-4 h-4` |
| Sidebar nav | `w-5 h-5` |
| Section icon | `w-5 h-5` or `w-6 h-6` |
| Empty state media | `w-6 h-6` |
| Hero illustration | `w-8 h-8` or larger |

---

## 8. Animation (Framer Motion)

### When to Use

- Page/panel **enter** transitions
- List item stagger on data load
- Collapsible panel width/height animations
- Toast/notification slide-in

### Standard Enter Transition

```tsx
import { motion } from "framer-motion";

// Single element
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2 }}
>

// Staggered list (wrap in variants)
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } }
};
```

### AnimatePresence

Always wrap conditional renders with `<AnimatePresence>` when using exit animations:

```tsx
import { AnimatePresence, motion } from "framer-motion";

<AnimatePresence>
  {isOpen && (
    <motion.div
      key="panel"
      initial={{ opacity: 0, width: 0 }}
      animate={{ opacity: 1, width: 320 }}
      exit={{ opacity: 0, width: 0 }}
      transition={{ duration: 0.25 }}
    />
  )}
</AnimatePresence>
```

### What NOT to Do

- Do NOT use looping animations on data rows
- Do NOT animate on every re-render — use `key` to control when enter fires
- Do NOT use spring animations for width/height transitions — use `duration` easing

---

## 9. Forms & Inputs

### Field Layout

```tsx
<div className="space-y-4">
  <div className="space-y-1.5">
    <Label htmlFor="fieldId">Field Label</Label>
    <Input id="fieldId" placeholder="..." />
    <p className="text-xs text-muted-foreground">Helper text</p>
  </div>
</div>
```

### Currency / Number Inputs

- Use `type="number"` with `step="any"` for financial inputs
- Format display values with `Intl.NumberFormat` — never raw `.toFixed()`
- Show currency symbol as a `InputAdornment` or prefix span inside the input group

### Form Section Headers

```tsx
<div className="space-y-1 mb-4">
  <h3 className="text-sm font-semibold text-foreground">Section Title</h3>
  <p className="text-xs text-muted-foreground">Optional description</p>
</div>
```

---

## 10. Data Display Patterns

### KPI / Stat Cards

```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
  <Card className="p-4">
    <p className="text-xs text-muted-foreground">Revenue</p>
    <p className="text-2xl font-bold tabular-nums mt-1">$2.4M</p>
    <p className="text-xs text-green-600 mt-1">+12% YoY</p>
  </Card>
</div>
```

### Charts (Recharts via shadcn chart)

- Use `@/components/ui/chart` wrappers — never configure Recharts directly in pages
- Chart containers: `<ChartContainer config={...} className="h-[240px]">`
- Color mapping: always use design token CSS vars (`hsl(var(--accent-pop))`)
- Tooltips: `<ChartTooltip content={<ChartTooltipContent />} />`

### Financial Tables

- Column widths: `w-[180px]` for label, `w-[100px]` for each year column
- Bold subtotal rows: `font-semibold border-t border-border`
- Header rows (REVENUE, EXPENSES): `text-xs font-bold text-muted-foreground uppercase tracking-wider bg-muted/40`
- Indent sub-rows with `pl-4` or `pl-6`

---

## 11. Testing & Accessibility

### `data-testid` Requirements

Every interactive element and key data display MUST have a `data-testid`:

```tsx
// Pattern: <component>-<context>-<action>
data-testid="property-list-refresh-btn"
data-testid="income-statement-tab"
data-testid="market-data-accordion-benchmarks"
```

Rules:
- All `<Button>` elements that trigger state changes
- All tab panels and navigation items
- Page-level containers: `data-testid="page-<name>"`
- Table rows for critical data: `data-testid="row-<key>"`

### Accessibility

- All `<Button size="icon">` must have `aria-label`
- All `<img>` must have `alt` text
- Use semantic HTML: `<nav>`, `<main>`, `<section>`, `<header>`
- Focus rings: never remove `outline` without replacement — use `focus-visible:ring-2`

---

## 12. Rebecca / AI Panel

The Rebecca co-pilot panel lives on the right side as a collapsible drawer-style panel:

- Width: `w-80` when open, `w-0` / hidden when closed
- Toggle: pull-tab on the left edge of the panel
- Background: `bg-card/95 backdrop-blur-xl border-l border-border`
- Message bubbles: user = `bg-accent/40 rounded-br-none`, assistant = `bg-muted rounded-bl-none`
- Streaming indicator: animated dots, NOT a spinner

When designing features that include AI suggestions, always plan for:
1. Empty state (no conversation yet)
2. Loading/streaming state
3. Error state with retry
4. Populated state with message history

---

## 13. Prohibited Patterns

| Anti-Pattern | Correct Approach |
|---|---|
| Raw `<div>` as card surface | Use `<Card>` from `@/components/ui/card` |
| Inline `style={{ color: '#D4A017' }}` | Use `text-accent-pop` CSS class |
| Direct `lucide-react` imports in pages | Import from `@/components/icons/` |
| `w-full h-full` on charts without container | Wrap in `<ChartContainer className="h-[240px]">` |
| Nested ternary `a ? x : b ? y : c` | Flatten with early return or lookup table |
| Comments explaining what code does | Remove; keep only non-obvious WHY |
| Custom header div instead of `PageHeader` | Use `<PageHeader>` from `@/components/ui/page-header` |
| Empty state without icon + action | Always include `EmptyMedia`, `EmptyTitle`, and at least one action |
| Framer motion on every re-render | Gate with `key` or `AnimatePresence` |
| Table numeric cell left-aligned | Use `text-right tabular-nums` for all numbers |

---

## 14. Quick Checklist for New Pages

Before declaring a new page complete:

- [ ] `PageHeader` with title, subtitle, and back link (if nested)
- [ ] `data-testid="page-<name>"` on root container
- [ ] Loading skeleton or spinner while data fetches
- [ ] Empty state using `<Empty>` component
- [ ] Error state with retry button
- [ ] All buttons have `data-testid`
- [ ] Icons from `@/components/icons/`
- [ ] Responsive: works at 375px mobile width
- [ ] No raw hex colors in JSX — only token classes
- [ ] Dark mode compatible (verify with `dark:` prefix classes as needed)
- [ ] Framer motion only on enter/exit, not on re-renders
