---
name: hbg-design-philosophy
description: "Visual identity, UX principles, and hospitality-appropriate design language for the HBG (L+B Hospitality) portal. Covers Swiss Modernist Precision design identity, triple-font system (IBM Plex Sans / Inter / JetBrains Mono), Tuscan Olive Grove earth-tone color philosophy, framer-motion restrained animation conventions, 8px grid layout system, hospitality vocabulary rules, financial table patterns, KPI card patterns, dark mode, responsive behavior, admin visual patterns, and chart styling. Use whenever designing new pages, components, or reviewing UI for brand/design consistency. Cross-references: consistent-card-widths, save-button-placement, design-system-export, export-system."
---

# HBG Design Philosophy

**Design Identity: Swiss Modernist Precision**

The HBG portal must feel like a premium institutional tool used by hospitality investment professionals — the "Bloomberg Terminal for boutique hospitality." Every design decision must reinforce authority, clarity, and mathematical precision. This is not a consumer SaaS product. It should look and feel like an investment committee presentation or offering memorandum.

Four foundational principles govern every visual and structural decision:

1. **Data-First**: Information density is maximized without sacrificing clarity. Every visual element reveals financial insights. Decorative elements are eliminated in favor of functional design that communicates meaning through position, proportion, and typography.
2. **Mathematical Precision**: All spacing, sizing, and layout follow an 8px grid. Asymmetric layouts create dynamic tension while maintaining balance.
3. **Functional Hierarchy**: Visual weight follows information importance. Primary metrics use larger type and prominent positioning. Hierarchy is achieved through size, weight, and spatial relationships — never through decorative elements.
4. **Restrained Motion**: Animations serve information revelation, not decoration. Transitions are swift (200ms) and purposeful. Motion never distracts from data comprehension.

---

## Typography System

The portal uses a **triple-font system**. Each typeface serves a specific, exclusive purpose.

### Font Families

| Font | Purpose | Weights | Notes |
|---|---|---|---|
| **IBM Plex Sans** | Display & Headers — page titles, section headers, card titles, navigation labels | 600 (Semi-Bold) only | Geometric precision with humanist warmth; authoritative at large sizes |
| **Inter** | Body & Labels — body text, form labels, descriptions, button text, table headers | 400 (Regular), 500 (Medium) | Optimized for screen readability; neutral and professional |
| **JetBrains Mono** | Numerical Data — ALL financial figures, percentages, currency values, dates, numerical table cells | 400 (Regular), 600 (Semi-Bold) | Monospaced for perfect vertical alignment; critical for financial data column scanning |

### Typography Scale

| Element | Font | Size | Weight | Line Height | Letter Spacing |
|---|---|---|---|---|---|
| Page Title | IBM Plex Sans | 30px | 600 | 1.2 | -0.02em |
| Section Header | IBM Plex Sans | 24px | 600 | 1.3 | -0.01em |
| Card Title | IBM Plex Sans | 18px | 600 | 1.4 | 0 |
| Subsection Header | IBM Plex Sans | 16px | 600 | 1.4 | 0 |
| Body Text | Inter | 14px | 400 | 1.5 | 0 |
| Label Text | Inter | 13px | 500 | 1.4 | 0 |
| Small Text | Inter | 12px | 400 | 1.4 | 0 |
| Large KPI Metric | JetBrains Mono | 32px | 600 | 1.2 | 0 |
| Medium Metric | JetBrains Mono | 20px | 600 | 1.3 | 0 |
| Table Number | JetBrains Mono | 14px | 400 | 1.5 | 0 |
| Small Number | JetBrains Mono | 12px | 400 | 1.4 | 0 |

### Typography Rules

- **All numerical data MUST use JetBrains Mono** — financial tables, KPI values, percentages, currency amounts, dates. This ensures vertical column alignment. Never use Inter or IBM Plex Sans for numbers.
- **Never mix font weights** beyond the defined palette. Maximum two weights per component.
- **Letter spacing**: Large display text (30px+) uses negative letter spacing (-0.02em). Body text and smaller sizes use 0.
- **Minimum sizes**: Body text ≥ 14px, labels ≥ 12px, never smaller.
- **Line length**: Maximum 80 characters per line for body text.

### CSS Implementation

```css
:root {
  --font-display: 'IBM Plex Sans', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

```css
.text-display  { font-family: var(--font-display); font-weight: 600; }
.text-body     { font-family: var(--font-body); font-weight: 400; }
.text-label    { font-family: var(--font-body); font-weight: 500; }
.text-mono     { font-family: var(--font-mono); font-weight: 400; }
.text-mono-bold { font-family: var(--font-mono); font-weight: 600; }
```

---

## Color System

### Default Theme: "Tuscan Olive Grove"

The primary visual identity uses earth tones evoking the warmth of hospitality properties:

| Role | Description | CSS Token |
|---|---|---|
| Primary | Olive green | `--primary` |
| Background | Warm cream | `--background` |
| Accent | Tuscan gold / amber | `--accent-pop` |
| Secondary Accent | Forest green | `--accent-pop-2` |
| Card Surface | Off-white / dark glass | `--card` |
| Border | Subtle gray | `--border` |
| Muted Text | Gray/60 | `--muted-foreground` |

**Accent-pop gold** (`hsl(43, 90%, 55%)`) = premium, money, investment. Use for: primary badge highlights, "generated by AI" indicators, key financial callouts, investor-facing metric values.

**Accent-pop-2 green** (`hsl(155, 41%, 30%)`) = approved, active, operating. Use for: active property status, positive delta indicators, success states.

### Alternative Theme Presets

| Theme | Character |
|---|---|
| Studio Noir | Dark luxury — near-black background, silver accents |
| Starlit Harbor | Deep navy with coastal teal highlights |
| Coastal Breeze | Light, airy, soft blue-gray |

### Color Rules

- **Never use raw hex or hsl values in component code** — always reference CSS custom property tokens
- Status semantics: success = green (`accent-pop-2`), warning = amber (`accent-pop`), error = destructive red, info = blue
- Dark mode: Full support via `:root` / `.dark` CSS variable switching — every color token has both variants

---

## Layout System

### 8px Grid

All spacing, sizing, and layout decisions use multiples of 8px:

| Token | Value | Usage |
|---|---|---|
| `xs` | 4px | Icon gaps, tight inline spacing |
| `sm` | 8px | Element padding, small gaps (`gap-2`) |
| `md` | 16px | Card internal padding, section gaps (`gap-4`) |
| `lg` | 24px | Large section spacing (`gap-6`) |
| `xl` | 32px | Card padding, major section breaks (`p-8`) |
| `2xl` | 48px | Hero spacing, major divisions |
| `3xl` | 64px | Maximum spacing for emphasis |

### Vertical Rhythm

- Between page sections: `space-y-6` (24px)
- Inside cards: `space-y-4` (16px)
- Between related inline elements: `gap-2` or `gap-3`

### Card Internal Structure

- Padding: 32px (`p-8`)
- Internal section gaps: 24px
- Related item gaps: 16px
- Border: 1px solid `border-color`
- Border radius: 12px (`rounded-xl`)

### Page Header

`PageHeader` from `@/components/ui/page-header` MUST be used as the first element on every page. Never build a custom header div.

```tsx
<PageHeader
  title="Page Title"         // IBM Plex Sans 24px Semi-Bold
  subtitle="Description"     // Inter 14px, muted-foreground
  backLink="/parent"         // optional
  actions={<Button>...</Button>}
/>
```

### Width Categories

Reference the `consistent-card-widths` skill for approved layout width categories. PageHeader must be inside the width container.

### Sidebar

- Left sidebar: 180px fixed, from `@/components/ui/sidebar.tsx`
- Item height: 40px with 8px gaps
- Active state: Subtle background change + 4px left border accent
- Typography: Inter 14px Medium for navigation labels
- Right collapsible panel (Rebecca / co-pilot): framer-motion width animation

### Responsive Breakpoints

| Breakpoint | Width | Behavior |
|---|---|---|
| Mobile | < 640px | Single column; sidebar becomes bottom navigation or hamburger; tables scroll horizontally; font sizes reduce 10-15% |
| Tablet | 640px–1024px | Two-column grid; sidebar remains or becomes collapsible drawer; tables full width with scroll if needed |
| Desktop | > 1024px | Full multi-column layout; 180px fixed sidebar; max content width 1280px |

---

## Component Patterns

### KPI / Metric Cards

```tsx
<Card className="p-8">
  <p className="text-label text-muted-foreground mb-2">Total Portfolio Value</p>
  <p className="text-mono-bold text-[32px] leading-tight">$48.2M</p>
  <p className="text-mono text-xs text-muted-foreground mt-2">+12.4% vs last quarter</p>
</Card>
```

Use `KPIGrid` component for consistent KPI card grids. Metric values always use JetBrains Mono.

### Financial Tables

High-density grids with strict formatting rules:

**Header row**: Inter 12px Medium, uppercase, `letter-spacing: 0.05em`, 12px vertical padding, 1px bottom border

**Data rows**: JetBrains Mono 14px for numbers, Inter 14px for text labels, 16px padding, 1px bottom border on all rows except last, hover background tint with 200ms transition

**Subtotal rows**: `font-semibold border-t border-border`

**Section header rows** (REVENUE, EXPENSES, etc.): `text-xs font-bold text-muted-foreground uppercase tracking-wider bg-muted/40`

**Sub-rows**: `pl-4` or `pl-6` indent

**Numerical alignment**: ALL currency, percentages, and numbers must be right-aligned (`text-right`) using JetBrains Mono for vertical column scanning

**Expandable rows**: 16px chevron on left, child rows indent 24px, smooth 200ms height transition

### Section Cards (Collapsible)

Use `SectionCard` for collapsible content sections. Reference the `consistent-card-widths` skill for approved patterns.

### Empty States

```tsx
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyActions } from "@/components/ui/empty";
```

Always include: icon (`EmptyMedia`), title, description, and at least one action. Renders in a dashed-border rounded container with 48px padding.

### Dialogs / Modals

- Max width: 768px (standard), 1024px (wide)
- Padding: 32px
- Border radius: 12px
- Header title: IBM Plex Sans 24px Semi-Bold
- Footer: right-aligned button group, 12px gap between buttons, 1px top border, 24px padding-top
- Form element gaps: 16px; section gaps: 24px

### Buttons

- Height: 40px (default), 36px (small)
- Padding: 16px horizontal
- Font: Inter 14px Medium
- Icon size: 16px with 8px gap from text
- Transition: all properties 150ms ease
- Reference `save-button-placement` skill for form interaction patterns and save button placement

### Badges

Pill shape (border-radius: 12px), height 24px, padding 6px horizontal, Inter 12px Medium, subtle semantic color tint

### Charts

- Library: Recharts via `@/components/ui/chart` wrappers — never configure Recharts directly in pages
- Line width: 2px; point size: 4px (hover-visible)
- Grid lines: 1px subtle
- Margins: top 24px, right 32px, bottom 48px (x-axis labels), left 64px (y-axis labels)
- Color mapping: always CSS variable tokens, never raw hex
- Chart types in use: Tornado, Heatmap, Waterfall, Radar, Donut, Line, Bar
- Reference `export-system` and `design-system-export` skills for how charts translate to PDF/PPTX

### InfoTooltip and GaapBadge

Use `InfoTooltip` for contextual education (hover reveals formula or definition). Use `GaapBadge` to indicate which GAAP standard governs a line item. Both provide institutional credibility without cluttering the layout.

### Forms

```tsx
<div className="space-y-4">
  <div className="space-y-1.5">
    <Label htmlFor="id">Field Label</Label>
    <Input id="id" placeholder="..." />
    <p className="text-xs text-muted-foreground">Helper text</p>
  </div>
</div>
```

Currency/number inputs: `type="number"` with `step="any"`; display format via `Intl.NumberFormat`, never raw `.toFixed()`.

---

## Motion & Animation

All animations use Framer Motion with restrained, polished transitions.

### Page Entry (Standard)

```tsx
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2 }}
>
```

`AnimatedPage` wraps every route. `ScrollReveal` is used for progressive disclosure of off-screen sections.

### Transition Timing

| Action | Duration | Easing |
|---|---|---|
| Hover state | 150ms | ease |
| Button press | 100ms | ease-out |
| Expandable content | 200ms | ease-in-out |
| Dialog open/close | 200ms | ease-in-out |
| Tooltip | 150ms | ease |
| Page transition | 300ms | ease-in-out |
| Staggered list items | 50ms stagger | ease |

### Collapsible Panel (Rebecca / Co-pilot)

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

### Rules

- Motion is a "polish layer" — never distracting or looping on data elements
- Do NOT animate on every re-render — use `key` to gate enter transitions
- Use `duration` easing for width/height transitions, not springs

---

## Hover & Interaction States

- **Buttons**: Background lightens/darkens slightly; icon buttons use `hover:scale-[1.03] active:scale-[0.97] transition-transform`
- **Table rows**: Background tint with 150ms transition
- **Cards**: Subtle shadow increase (optional)
- **Icons**: Opacity change or subtle scale (1.05x)
- **Focus**: Always visible 2px outline (`focus-visible:ring-2`) at 2px offset — never remove

---

## Hospitality Vocabulary

All labels, tooltips, section headers, navigation items, and error messages MUST use industry-standard hospitality vocabulary. Never use generic software terms.

| Use This | Not This |
|---|---|
| Properties | Items, Assets (except in formal financial context) |
| Rooms | Units |
| Average Daily Rate (ADR) | Average Price |
| Occupancy | Utilization Rate |
| Guests | Users (when referring to hotel customers) |
| Gross Operating Profit (GOP) | Gross Margin |
| Housekeeping | Cleaning Costs |
| Food & Beverage (F&B) | Dining |
| Pre-Opening | Setup Period |
| Hold Period | Duration |
| Disposition | Sale (in formal contexts) |
| Capital Improvements | Upgrades |
| RevPAR | Revenue per Room (use full term on first mention) |
| Management Fees | Service Fees (unless specifically referring to the service fee category system) |

### Navigation Vocabulary

| Section | Label |
|---|---|
| Portfolio overview | Dashboard |
| Asset list | Properties |
| Corporate entity view | Management Company |
| Analysis tools | Simulation |
| Acquisition search | Property Finder |
| Global configuration | General Settings |
| What-if snapshots | My Scenarios |

---

## Tone of Voice

**Professional, confident, precise** — the language of investment memos and offering memoranda.

- Tooltips educate without condescending: "Gross Operating Profit (GOP) equals total revenue less departmental operating expenses, before management fees and fixed charges."
- Error messages are specific and actionable: "Debt service coverage ratio (1.1x) is below the minimum lender threshold (1.25x). Reduce the loan amount or increase projected NOI."
- Never casual or playful in financial contexts.
- Validation messages reference GAAP standards where applicable.

---

## Admin Visual Patterns

- Use style constants from `admin/styles.ts`: `ADMIN_CARD`, `ADMIN_LINK_CARD`
- Admin has its own sidebar with sections: Brand, Business, Research, Design, AI Agents, System, Logs
- Reference `save-button-placement` skill for form interaction patterns within admin panels

---

## Accessibility Standards

- **Minimum touch targets**: 40px height on all interactive elements
- **Keyboard navigation**: All interactive elements reachable via keyboard; tab order follows logical reading order
- **Focus indicators**: Always visible 2px outline; never removed
- **Heading hierarchy**: Use proper heading levels (h1, h2, h3) in order; never skip levels for styling
- **ARIA labels**: Required on icon-only buttons, icon buttons, and interactive elements without visible text
- **Table structure**: Use `thead`, `tbody`, `th` (with `scope`), `td` — never style divs as tables
- **Line height**: Minimum 1.4 for body text, 1.5 for dense content

---

## testing (`data-testid`) Requirements

Every interactive element and key data display must have a `data-testid`:

| Pattern | Example |
|---|---|
| Page container | `data-testid="page-properties"` |
| Button triggering state change | `data-testid="property-list-refresh-btn"` |
| Tab panel | `data-testid="income-statement-tab"` |
| Accordion section | `data-testid="market-data-accordion-benchmarks"` |
| Critical data row | `data-testid="row-noi"` |

---

## Dark Mode

Full dark mode support via CSS variables. Every color token has a `:root` (light) and `.dark` variant. Do not use Tailwind `dark:` prefix classes as the primary theming mechanism — they are a supplement for edge cases only. Core theming flows through CSS custom properties.

---

## Quick Checklist for New Pages

- [ ] `PageHeader` with title, subtitle, optional back link
- [ ] `data-testid="page-<name>"` on root container
- [ ] All buttons have `data-testid`
- [ ] Loading skeleton or spinner while data fetches
- [ ] Empty state using `<Empty>` component (with icon, title, description, action)
- [ ] Error state with retry button
- [ ] Numbers use JetBrains Mono (never Inter for financial figures)
- [ ] No raw hex / hsl in JSX — only CSS token classes
- [ ] Responsive: verified at 375px mobile width
- [ ] Dark mode compatible
- [ ] All interactive elements have `aria-label` if icon-only
- [ ] Animation only on enter/exit, gated by `key` or `AnimatePresence`
- [ ] Hospitality vocabulary used throughout labels, tooltips, headers
- [ ] Reference `consistent-card-widths` for layout width category

---

## Cross-Skill References

| Skill | When to Reference |
|---|---|
| `consistent-card-widths` | Any layout with cards — width categories and constraints |
| `save-button-placement` | Any form with save/cancel actions |
| `design-system-export` | Exporting UI elements to PDF or design tools |
| `export-system` | PPTX/PDF export pipeline and chart-to-export mapping |
| `hbg-business-model` | When labels or tooltips need hospitality business context |
| `financial-engine` | When displaying or formatting financial output values |
| `hbg-product-vision` | When making product-level design decisions about new features |

---

*Source: L+B Hospitality Dashboard Design Style Guide v1.0 (Manus AI, January 2026) + HBG Domain Skills task spec*
