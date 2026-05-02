---
name: nai-design-system
description: "NAI (Norfolk AI) portable design system for React + Tailwind apps. Covers the full implementation contract: triple-font system (IBM Plex Sans / Inter / JetBrains Mono), CSS custom property token schema (colors, radius, spacing, typography), 8px grid, Tailwind + shadcn/ui component patterns, dark mode via CSS variables, Railway deployment font-loading, and the shared design principles (Swiss Modernist Precision, data-first, restrained motion). App-agnostic — use this as the foundation layer for any NAI product. For H+ Hospitality portal specifics, cross-reference hbg-design-philosophy."
---

# NAI Design System

**Portable foundation for all Norfolk AI (NAI) web applications.**

Stack: React + TypeScript + Tailwind CSS v4 + shadcn/ui + Framer Motion, deployed on Railway.

---

## Design Principles

1. **Data-First** — information density without sacrificing clarity; every visual element serves to reveal data, not decorate
2. **Mathematical Precision** — all spacing on an 8px grid; asymmetric layouts preferred over centered compositions
3. **Functional Hierarchy** — visual weight follows information importance via size, weight, and spatial relationships
4. **Restrained Motion** — animations serve information revelation only; 200ms maximum; never looping

---

## Typography

### Font Stack

Three fonts, each with an exclusive role. Never mix roles.

| Font | Role | Weights | Tailwind Class | CSS Var |
|---|---|---|---|---|
| **IBM Plex Sans** | Display / headers — page titles, section headers, card titles, nav labels | 600 | `font-display` | `--font-display` |
| **Inter** | Body / labels — body text, form labels, descriptions, button text | 400, 500 | `font-sans` / `font-body` | `--font-sans` |
| **JetBrains Mono** | All numbers — financial figures, metrics, dates, table cells with numeric data | 400, 600 | `font-mono` | `--font-mono` |

### Font Loading (index.html)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Inter:opsz,wght@14..32,400;14..32,500&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
```

### CSS Variable Declaration (index.css)

```css
@theme inline {
  --font-display: 'IBM Plex Sans', sans-serif;
  --font-sans: 'IBM Plex Sans', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}

@layer components {
  .font-display  { font-family: 'IBM Plex Sans', sans-serif; font-weight: 600; }
  .font-body     { font-family: 'Inter', sans-serif; font-weight: 400; }
  .font-label    { font-family: 'Inter', sans-serif; font-weight: 500; }
  .font-mono     { font-family: 'JetBrains Mono', monospace; }
  .font-mono-bold { font-family: 'JetBrains Mono', monospace; font-weight: 600; }

  /* Financial metric utility classes */
  .metric-lg    { font-family: 'JetBrains Mono', monospace; font-size: 2rem;    font-weight: 600; line-height: 1.2; }
  .metric-md    { font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 600; line-height: 1.3; }
  .metric-table { font-family: 'JetBrains Mono', monospace; font-size: 0.875rem; font-weight: 400; }
  .metric-sm    { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; font-weight: 400; }
}
```

### Typography Scale

| Element | Font | Size | Weight | Letter Spacing |
|---|---|---|---|---|
| Page title | IBM Plex Sans | 30px | 600 | -0.02em |
| Section header | IBM Plex Sans | 24px | 600 | -0.01em |
| Card title | IBM Plex Sans | 18px | 600 | 0 |
| Subsection | IBM Plex Sans | 16px | 600 | 0 |
| Body text | Inter | 14px | 400 | 0 |
| Label | Inter | 13px | 500 | 0 |
| Small | Inter | 12px | 400 | 0 |
| Large KPI metric | JetBrains Mono | 32px | 600 | 0 |
| Table number | JetBrains Mono | 14px | 400 | 0 |

### Typography Rules

- **ALL numeric data → JetBrains Mono** — no exceptions in tables or KPI cards
- Add `tabular-nums` alongside `font-mono` for column alignment: `className="font-mono tabular-nums"`
- Minimum body text size: 14px. Minimum label/caption: 12px.
- Headings in display text (30px+): add `text-wrap: balance` or `text-pretty`
- Use `…` (ellipsis entity) not `...` for truncated text / loading states ("Loading…")
- Loading state buttons should show spinner and keep button disabled until request starts

---

## Color Token Schema

### Required CSS Custom Properties

Every NAI app must define these tokens in `index.css` under `:root` (light) and `.dark`:

```css
:root {
  /* Core surfaces */
  --background:          <hsl>;   /* page background */
  --foreground:          <hsl>;   /* primary text */
  --card:                <hsl>;   /* card surface */
  --card-foreground:     <hsl>;   /* text on cards */
  --popover:             <hsl>;
  --popover-foreground:  <hsl>;

  /* Interactive */
  --primary:             <hsl>;
  --primary-foreground:  <hsl>;
  --secondary:           <hsl>;
  --secondary-foreground: <hsl>;
  --muted:               <hsl>;
  --muted-foreground:    <hsl>;
  --accent:              <hsl>;
  --accent-foreground:   <hsl>;

  /* Accent pops (brand-specific, required) */
  --accent-pop:                  <hsl>;   /* primary brand accent */
  --accent-pop-foreground:       <hsl>;
  --accent-pop-2:                <hsl>;   /* secondary brand accent */
  --accent-pop-2-foreground:     <hsl>;

  /* Semantic status */
  --destructive:         <hsl>;
  --destructive-foreground: <hsl>;
  --warning:             <hsl>;
  --warning-foreground:  <hsl>;
  --info:                <hsl>;
  --info-foreground:     <hsl>;
  --success:             <hsl>;
  --success-foreground:  <hsl>;

  /* Input / border */
  --border:              <hsl>;
  --input:               <hsl>;
  --ring:                <hsl>;

  /* Border radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* Sidebar (if using sidebar layout) */
  --sidebar:                    <hsl>;
  --sidebar-foreground:         <hsl>;
  --sidebar-primary:            <hsl>;
  --sidebar-primary-foreground: <hsl>;
  --sidebar-accent:             <hsl>;
  --sidebar-accent-foreground:  <hsl>;
  --sidebar-border:             <hsl>;
  --sidebar-ring:               <hsl>;
}
```

### Color Rules

- **Never use raw hex, hsl(), or rgba() in component JSX/TSX** — always use CSS token classes
- Exception: renderer components that output to canvas, PDF, or PPTX thumbnails. Isolate these with named constants and a comment explaining the exception.
- Status semantics: `bg-destructive` (error), `text-warning` (caution), `bg-success` / `text-accent-pop-2` (success/active), `bg-info` (informational)
- Use `hsl(var(--token) / opacity)` syntax in CSS when alpha is needed

### Dark Mode

All color tokens must have `.dark` overrides. Theming flows through CSS custom properties — do **not** use Tailwind `dark:` prefix as the primary theming mechanism. Reserve `dark:` prefixes only for edge cases not covered by token switching.

```css
.dark {
  --background: <dark-hsl>;
  /* ... all tokens overridden ... */
}
```

Set `color-scheme: dark` on `<html>` when dark theme is active (fixes native scrollbar, inputs, and select widgets on all platforms).

---

## Spacing System (8px Grid)

All spacing uses multiples of 8px. Use Tailwind utilities; supplement with these custom layer classes:

| Token | Value | Tailwind equiv | Use |
|---|---|---|---|
| xs | 4px | `gap-1` / `p-1` | Icon gaps, tight inline |
| sm | 8px | `gap-2` / `p-2` | Element padding, small gaps |
| md | 16px | `gap-4` / `p-4` | Card internal, section gaps |
| lg | 24px | `gap-6` / `p-6` | Large section spacing |
| xl | 32px | `gap-8` / `p-8` | Card padding, major breaks |
| 2xl | 48px | `gap-12` / `p-12` | Hero spacing |
| 3xl | 64px | `gap-16` / `p-16` | Maximum emphasis |

**Standard page spacing**: `gap-6` between sections, `gap-4` inside cards, `gap-2`–`gap-3` between inline elements.

---

## Component Layer (shadcn/ui)

All base components come from shadcn/ui. **Never build div-based card or button replacements.**

### Required Components

Every NAI app must include at minimum:
- `card.tsx` — `rounded-xl border bg-card text-card-foreground shadow`
- `button.tsx` — variant system: default, destructive, outline, secondary, ghost, link
- `badge.tsx` — pill shape, semantic variants
- `page-header.tsx` — standard page top (title, subtitle, optional back link + actions)
- `empty.tsx` — structured empty state (media, title, description, actions)
- `skeleton.tsx` — loading placeholders
- `spinner.tsx` — async action indicator

### Card Pattern

```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

<Card>                           // rounded-xl border bg-card shadow
  <CardHeader className="p-6">
    <CardTitle className="font-display">Title</CardTitle>
  </CardHeader>
  <CardContent className="p-6 pt-0">
    {children}
  </CardContent>
</Card>
```

### PageHeader

Every page's first element. Props: `title`, `subtitle`, `backLink`, `actions`, `className`.

```tsx
import { PageHeader } from "@/components/ui/page-header";

<PageHeader
  title="Page Title"
  subtitle="What this page does"
  backLink="/parent"
  actions={<Button size="sm">Action</Button>}
/>
```

### Button Micro-interactions

Icon-only buttons: `hover:scale-[1.03] active:scale-[0.97] transition-transform`

All icon-only buttons **must** have `aria-label`.

### Empty State

```tsx
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyActions } from "@/components/ui/empty";

<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><SomeIcon /></EmptyMedia>
    <EmptyTitle>Nothing here yet</EmptyTitle>
    <EmptyDescription>Explain what should appear and how to add it.</EmptyDescription>
  </EmptyHeader>
  <EmptyActions>
    <Button variant="outline" size="sm">Add item</Button>
  </EmptyActions>
</Empty>
```

---

## Icon System

All icons must be imported from a project-local `@/components/icons/` barrel — never directly from `lucide-react`, `@tabler/icons-react`, or any other icon library in page/component code.

### Icon Sizing

| Context | Class |
|---|---|
| In button (sm) | `w-3.5 h-3.5` |
| In button (default) | `w-4 h-4` |
| Sidebar nav item | `w-5 h-5` |
| Section header | `w-5 h-5` or `w-6 h-6` |
| Empty state media | `w-6 h-6` |

### Barrel Structure

```
src/components/icons/
  index.ts            ← re-exports everything
  action-icons.tsx    ← buttons, CTAs
  navigation-icons.tsx
  status-icons.tsx    ← check, x, warning, info
  data-display-icons.tsx
  themed-icons.tsx    ← wrappers with design-system styling
```

---

## Animation (Framer Motion)

### Standard Page Entry

```tsx
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2 }}
>
```

Wrap every route with an `AnimatedPage` component that applies this transition.

### Staggered List

```tsx
const container = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.2 } } };
```

### Collapsible Panel

```tsx
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

### Transition Timing

| Action | Duration | Easing |
|---|---|---|
| Hover state | 150ms | ease |
| Button press | 100ms | ease-out |
| Expandable / collapsible | 200ms | ease-in-out |
| Dialog | 200ms | ease-in-out |
| Page entry | 200–300ms | ease-in-out |

### Motion Rules

- Animate `transform` and `opacity` only (compositor-friendly, no layout reflow)
- Never `transition: all` — list properties explicitly
- Honor `prefers-reduced-motion` — provide a no-animation fallback
- Never loop animations on data elements
- Gate enter transitions with `key` to prevent re-firing on re-renders

---

## Accessibility

| Rule | Implementation |
|---|---|
| Icon-only buttons | `aria-label` required |
| Form controls | `<label htmlFor>` or `aria-label` |
| Decorative icons | `aria-hidden="true"` |
| Async UI updates | `aria-live="polite"` |
| Focus rings | `focus-visible:ring-2` — never remove without replacement |
| Touch targets | 40px minimum height on all interactive elements |
| Heading hierarchy | Never skip levels (h1 → h2 → h3) |
| Tables | `<table>`, `<thead>`, `<tbody>`, `<th scope>`, `<td>` — never div tables |
| Number columns | `font-variant-numeric: tabular-nums` (or `tabular-nums` Tailwind class) |

---

## Forms

### Field Pattern

```tsx
<div className="space-y-1.5">
  <Label htmlFor="id">Field Label</Label>
  <Input
    id="id"
    type="text"          // or email, number, tel, url
    autoComplete="off"
    placeholder="Example value…"
  />
  <p className="text-xs text-muted-foreground">Helper text</p>
</div>
```

### Rules

- Use correct `type` attribute (`email`, `tel`, `url`, `number`) and matching `inputmode`
- Disable spellcheck on emails/codes: `spellCheck={false}`
- Never block paste (`onPaste` + `preventDefault`)
- Submit button stays enabled until request starts; show spinner during request
- Errors inline next to fields; focus first error field on failed submit
- Warn before navigation with unsaved changes (`beforeunload` or router guard)
- Numbers/currency: format via `Intl.NumberFormat` — never raw `.toFixed()`
- Dates: format via `Intl.DateTimeFormat` — never hardcoded format strings

---

## Testing (`data-testid`)

Every interactive element and key data display must have `data-testid`.

### Naming Convention

```
<component>-<context>-<action>
```

Examples:
- `data-testid="page-dashboard"`  — page root container
- `data-testid="property-list-refresh-btn"`
- `data-testid="income-statement-tab"`
- `data-testid="row-noi"`

### Required Coverage

- All `<Button>` elements that trigger state changes
- Page root container: `data-testid="page-<name>"`
- All navigation items and tabs
- Data rows for critical outputs

---

## Anti-Patterns

| ❌ Anti-Pattern | ✅ Correct |
|---|---|
| `style={{ color: '#D4A017' }}` raw hex in JSX | Use `text-accent-pop` CSS token class |
| `import { X } from "lucide-react"` in a page/component | Import from `@/components/icons/` |
| Custom `<div>` card surface | Use `<Card>` from shadcn/ui |
| Custom page header `<div><h1>` | Use `<PageHeader>` component |
| `transition: all` in CSS | List specific properties |
| `outline-none` without replacement | Use `focus-visible:ring-2` |
| `a ? x : b ? y : c` ternary chain | Flatten with early return or lookup object |
| `formatMoney(x).toFixed(2)` | Use `Intl.NumberFormat` |
| Hardcoded date string | Use `Intl.DateTimeFormat` |
| Large `.map()` list (>50) without virtualization | Use `virtua` or `content-visibility: auto` |
| Empty state with no action | Always include at least one call to action |
| Looping animation on data element | Animate enter/exit only |

---

## Railway Deployment Notes

- Fonts load from Google Fonts CDN — add `<link rel="preconnect" href="https://fonts.googleapis.com">` and `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` **before** the font stylesheet link
- For critical above-fold fonts, add `<link rel="preload" as="font" crossorigin>` with `font-display: swap`
- Railway does not inject `X-Forwarded-Proto` by default in all plans — handle `https` detection explicitly if needed
- Static assets are served from the app's dist output — no CDN prefix needed unless you've configured one

---

## Checklist: New App Bootstrap

When starting a new NAI app, verify:

- [ ] `index.html` loads IBM Plex Sans, Inter, JetBrains Mono from Google Fonts with `preconnect`
- [ ] `index.css` defines all required CSS custom property tokens for `:root` and `.dark`
- [ ] `@theme inline` maps `--font-display`, `--font-sans`, `--font-mono`
- [ ] `.font-mono` utility overrides Tailwind default with JetBrains Mono
- [ ] `.metric-*` utility classes declared
- [ ] shadcn/ui initialized with `rounded-xl` card defaults
- [ ] `PageHeader` component present in `src/components/ui/`
- [ ] `Empty` component present in `src/components/ui/`
- [ ] Icon barrel at `src/components/icons/index.ts`
- [ ] Framer Motion installed and `AnimatedPage` wrapper created
- [ ] `color-scheme: dark` set on `<html>` when dark mode active
- [ ] `<meta name="theme-color">` matches page background in both modes
