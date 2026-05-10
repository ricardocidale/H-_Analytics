# Typography Mastery Guide — H+ Analytics Portal

Swiss Modernist three-font system. Last updated: 2026-05-09.

---

## The Three-Font System

| Font | Token | Role | Never use for |
|---|---|---|---|
| **IBM Plex Sans** | `font-display` | ALL headings, page titles, section headers, card titles, nav labels | Body text, numbers |
| **Inter** | `font-body` | ALL body text, labels, descriptions, buttons, form inputs, UI prose | Headings, numbers |
| **JetBrains Mono** | `font-mono` | ALL numerical data: currency, percentages, metrics, dates, table numbers | Prose, headings |

The system is **exclusive** — each typeface has exactly one role. Mixing breaks
the institutional precision that makes the app feel like a Bloomberg terminal.

---

## Typography Scale

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

---

## CSS Token Contract

### Font loading (`index.css` top — before `@import "tailwindcss"`)

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
```

### Theme tokens (`@theme inline` block in `index.css`)

```css
--font-sans: 'IBM Plex Sans', sans-serif;    /* Tailwind's font-sans — legacy, don't expand usages */
--font-display: 'IBM Plex Sans', sans-serif; /* Preferred token for heading font */
--font-body: 'Inter', sans-serif;            /* Body font token */
--font-mono: 'JetBrains Mono', monospace;    /* Numeric data token */
```

### Base layer rules (`@layer base` in `index.css`)

```css
body {
  font-family: 'Inter', sans-serif;   /* Direct property — @apply font-body is Tailwind v4 incompatible */
}

h1, h2, h3, h4 {
  font-family: 'IBM Plex Sans', sans-serif;   /* Explicit — don't rely on cascade */
}
```

### Utility classes (`@layer components` in `index.css`)

```css
.font-display  { font-family: 'IBM Plex Sans', sans-serif; font-weight: 600; }
.font-body     { font-family: 'Inter', sans-serif; font-weight: 400; }
.font-mono     { font-family: 'JetBrains Mono', monospace; }
.font-mono-bold { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
```

### Semantic heading classes

```css
.heading-page       { font-family: IBM Plex Sans; font-size: 30px; font-weight: 600; letter-spacing: -0.02em; }
.heading-section    { font-family: IBM Plex Sans; font-size: 24px; font-weight: 600; letter-spacing: -0.01em; }
.heading-card       { font-family: IBM Plex Sans; font-size: 18px; font-weight: 600; }
.heading-subsection { font-family: IBM Plex Sans; font-size: 16px; font-weight: 600; }
```

### Metric classes

```css
.metric-lg    { JetBrains Mono; 32px; weight 600 }   /* Large KPI */
.metric-md    { JetBrains Mono; 20px; weight 600 }   /* Medium metric */
.metric-table { JetBrains Mono; 14px; weight 400 }   /* Table number */
.metric-sm    { JetBrains Mono; 12px; weight 400 }   /* Small number */
```

---

## Application Rules

### Every number → `font-mono`

```tsx
// Currency
<span className="font-mono">{formatMoney(amount)}</span>

// Percentage
<span className="font-mono">{rate.toFixed(1)}%</span>

// Large KPI
<span className="metric-lg">{occupancy}%</span>

// Table cell
<td className="table-cell-number">{revenue}</td>

// Use Money component for all dollar amounts — it already applies font-mono
<Money amount={noi} />
```

### Every heading → `font-display` (or a `.heading-*` class)

```tsx
// Page title
<h1 className="heading-page">Property Overview</h1>

// Section heading
<h2 className="text-xl font-semibold font-display">Financial Summary</h2>

// Card title (shadcn CardTitle doesn't render as h* — must be explicit)
<CardTitle className="font-display">Revenue Analysis</CardTitle>

// When using heading scale exactly
<h3 className="heading-card">Operating Metrics</h3>
```

### Body text inherits Inter

```tsx
// Paragraphs inherit from body — no class needed
<p>This is body text in Inter.</p>

// Labels inherit — no class needed
<label>Property Name</label>

// Explicit body font when needed (overriding a heading context)
<span className="font-body">Description text inside a heading parent</span>
```

---

## Common Mistakes to Avoid

| ❌ Wrong | ✅ Right | Why |
|---|---|---|
| `@apply font-body` in CSS | `font-family: 'Inter', sans-serif;` | Tailwind v4 incompatible |
| `<h3 className="text-lg font-semibold">` | `<h3 className="text-lg font-semibold font-display">` | Heading needs explicit font class (CardTitle especially) |
| Number in `<span>` without `font-mono` | `<span className="font-mono">$1,234</span>` | Every number must use JetBrains Mono |
| `font-sans` on new elements | `font-body` | `font-sans` maps to IBM Plex Sans (legacy), not Inter |
| Expanding `font-sans` usages | Use `font-body` for Inter, `font-display` for IBM Plex Sans | `font-sans` should shrink to zero eventually |

---

## Known Technical Debt

- **1 remaining `font-sans` usage** — `kbd.tsx` uses `font-sans` (IBM Plex Sans)
  for the `<kbd>` element. This is **intentional**: IBM Plex Sans gives keyboard
  shortcut labels a slightly technical, distinct look. Do not migrate.

- **`--font-sans` token** remains mapped to IBM Plex Sans (not Inter) for
  backwards compatibility. Do not add new `font-sans` usages — use `font-body`
  for Inter and `font-display` for IBM Plex Sans.

### Migrated (2026-05-10)

Previously `font-sans` (IBM Plex Sans); now `font-body` (Inter):

| File | Element | Reason |
|---|---|---|
| `IndustryResearchTab.tsx` | prose div | Long-form streamed text → Inter for readability |
| `Icp.tsx` | textarea | Long-form definition input → Inter for readability |
| `icp/IcpProfileTab.tsx` | textarea | Long-form definition input → Inter for readability |

---

## DevTools Quick Verification

```text
body                → font-family: Inter, sans-serif
h2, h3              → font-family: IBM Plex Sans, sans-serif
.font-mono element  → font-family: JetBrains Mono, monospace
<Money> output      → font-family: JetBrains Mono, monospace
Network tab         → 3 fonts.googleapis.com requests (200)
```
