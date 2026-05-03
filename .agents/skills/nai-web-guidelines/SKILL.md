---
name: nai-web-guidelines
description: "NAI web UI quality guidelines for any React app. Covers accessibility (ARIA, keyboard, focus, touch targets), form best practices, animation/motion rules, dark mode, typography conventions (ellipsis, quotes, tabular-nums), content handling (truncation, empty states), performance (virtualization, font preloading), navigation patterns, and anti-patterns to flag in code review. Framework-agnostic rules; examples in React + Tailwind. Use when reviewing new pages/components, auditing accessibility, or establishing quality gates for any NAI web product. Deployment: Railway."
---

# NAI Web UI Guidelines

Quality rules for all NAI web applications. Apply during code review, new page construction, and pre-ship audits. These are framework-agnostic principles implemented in React + Tailwind examples.

---

## Accessibility

### ARIA & Semantic HTML

- **Icon-only buttons** must have `aria-label`: `<Button size="icon" aria-label="Close panel">`
- **Form controls** need `<label htmlFor>` or `aria-label`
- **Decorative icons** need `aria-hidden="true"`: `<IconInfo aria-hidden="true" />`
- **Async updates** (toasts, inline validation) need `aria-live="polite"`
- Use semantic HTML (`<button>`, `<a>`, `<label>`, `<table>`) before ARIA attributes
- `<button>` for actions, `<a>`/`<Link>` for navigation — never `<div onClick>`
- Heading hierarchy: `<h1>` → `<h2>` → `<h3>` in order; never skip levels for styling
- Images need `alt` (or `alt=""` if decorative)
- Include a skip-to-main-content link for keyboard users on pages with nav

### Focus States

- Interactive elements must have visible focus: `focus-visible:ring-2 focus-visible:ring-ring`
- **Never** `outline-none` / `outline: none` without a `focus-visible:` replacement
- Use `:focus-visible` over `:focus` to avoid focus ring on pointer click
- Compound controls (e.g., combobox with input + list): use `:focus-within`

### Touch & Interaction

- Minimum touch target: **40px height** on all interactive elements
- `touch-action: manipulation` on interactive elements (prevents double-tap zoom delay)
- `overscroll-behavior: contain` inside modals, drawers, and sheets
- During drag: disable text selection; use `inert` on dragged elements
- `autoFocus` sparingly — desktop only, single primary input; avoid on mobile

---

## Forms

### Input Rules

- Use correct `type` attribute: `email`, `tel`, `url`, `number` (not just `text`)
- Match `inputmode` to the expected input: `inputmode="numeric"` for number-only fields
- Disable spellcheck on emails, codes, usernames: `spellCheck={false}`
- Every input needs `autoComplete` with a meaningful value
- **Never block paste**: do not combine `onPaste` with `preventDefault`
- Labels must be clickable: use `htmlFor` matching the input's `id`, or wrap input with `<label>`
- Placeholders end with `…` and show an example pattern

### Submission & Errors

- Submit button stays **enabled** until the request starts; show spinner during the request
- Show errors **inline** next to the failing field (not only in a toast)
- Focus the first error field on failed submit
- Warn before navigation with unsaved changes (`beforeunload` event or router guard)

### Advanced Inputs

- `autocomplete="off"` on non-auth fields to prevent password manager triggers
- Checkboxes / radios: label and control share a single hit target (no dead zones)
- Sliders: display current value as JetBrains Mono text above the slider

---

## Typography

### Punctuation

- `…` (U+2026 ellipsis) not `...` (three dots)
- Curly quotes `"` `"` not straight `"` in displayed prose
- Non-breaking spaces for units: `10&nbsp;MB`, keyboard shortcuts: `⌘&nbsp;K`, brand names
- Loading states end with `…`: `"Loading…"`, `"Saving…"`, `"Generating…"`

### Numbers

- `font-variant-numeric: tabular-nums` (Tailwind: `tabular-nums`) on all number columns and comparisons
- Monospace font (`font-mono`) for all financial figures, metrics, dates
- Never use raw `.toFixed()` for display — use `Intl.NumberFormat`
- Never hardcode date format strings — use `Intl.DateTimeFormat`

### Text Balance

- Add `text-wrap: balance` or `text-pretty` to headings to prevent widows / awkward line breaks

---

## Content Handling

### Long Content

- Text containers must handle overflow: `truncate`, `line-clamp-*`, or `break-words`
- Flex children that contain text need `min-w-0` to allow truncation to work
- Maximum line length for body text: 80 characters (`max-w-prose`)

### Empty States

Always handle the empty case — never render broken UI for empty arrays or null data.

Required structure:
1. Icon (illustrative, not decorative)
2. Title (what's missing)
3. Description (why it's empty / how to fix)
4. At least one action button (if actionable)

### User-Generated Content

Anticipate and test: very short inputs, average inputs, and very long inputs. All three must render without breaking the layout.

---

## Animation & Motion

### Rules

- Animate `transform` and `opacity` only — these are compositor-friendly and cause no layout reflow
- **Never** `transition: all` — list properties explicitly: `transition-property: opacity, transform`
- Set correct `transform-origin` for scaling/rotating elements
- Always honor `prefers-reduced-motion`:

```tsx
import { useReducedMotion } from "framer-motion";

const shouldReduce = useReducedMotion();
const variants = shouldReduce
  ? { hidden: {}, visible: {} }
  : { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } };
```

### Timing Constraints

| Action | Max Duration |
|---|---|
| Hover state | 150ms |
| Button press feedback | 100ms |
| Expand/collapse | 200ms |
| Dialog open/close | 200ms |
| Page entry | 300ms |

- Animations must be interruptible — respond to user input mid-animation
- Never use looping animations on data or content elements

---

## Images

- `<img>` must have explicit `width` and `height` to prevent CLS (content layout shift)
- Below-fold images: `loading="lazy"`
- Above-fold critical images: `fetchpriority="high"` or Next.js `priority`
- All images need `alt` text; purely decorative images: `alt=""`
- SVG icon transforms: apply on `<g>` wrapper with `transform-box: fill-box; transform-origin: center`

---

## Performance

### Lists

- Lists with >50 items must be virtualized (`virtua`, `@tanstack/virtual`, or `content-visibility: auto`)
- Never read layout properties (`getBoundingClientRect`, `offsetHeight`, `scrollTop`) during render
- Batch DOM reads/writes; never interleave read/write operations in the same tick

### Inputs

- Prefer uncontrolled inputs for non-validated fields
- Controlled inputs must be cheap per keystroke — no synchronous expensive operations in `onChange`

### Font Loading

```html
<!-- Preconnect first -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<!-- Then load -->
<link href="https://fonts.googleapis.com/..." rel="stylesheet">
```

For critical above-fold fonts, also add a `<link rel="preload" as="font" crossorigin>` for the specific font file.

---

## Navigation & URL State

- **URL reflects state**: filters, active tabs, pagination, and expanded panels should be in query params (`?tab=cashflow`, `?page=2`)
- Navigation links use `<a>`/`<Link>` — supports Cmd+click, middle-click, and browser history
- Deep-link all stateful UI: if something uses `useState` that a user would want to share or bookmark, consider URL sync
- Destructive actions (delete, reset) need a confirmation modal or undo window — never execute immediately on click

---

## Dark Mode & Theming

- Set `color-scheme: dark` on `<html>` when dark theme is active — this fixes native scrollbar, input, and `<select>` appearance on all platforms
- `<meta name="theme-color">` must match the page background color in both modes
- Native `<select>` elements: provide explicit `background-color` and `color` for Windows dark mode compatibility
- Theming flows through CSS custom properties (`:root` / `.dark`) — do not use Tailwind `dark:` prefix as the primary mechanism

---

## Locale & Internationalization

- Dates and times: `Intl.DateTimeFormat` only — never `new Date().toLocaleDateString()` with hardcoded locale
- Numbers and currency: `Intl.NumberFormat` only — never `.toFixed(2)` for display
- Detect user language via `navigator.languages`, not IP geolocation
- Brand names, code tokens, and identifiers: `<span translate="no">` to prevent garbled auto-translation

---

## Safe Areas & Layout

- Full-bleed layouts that reach screen edges: use `env(safe-area-inset-*)` for device notch clearance
- Prevent unwanted horizontal scroll: `overflow-x-hidden` on the outermost container
- Use flex/grid for layout instead of JS-measured positioning

---

## Code Quality Anti-Patterns

Flag these in code review:

| Anti-Pattern | Rule |
|---|---|
| `user-scalable=no` or `maximum-scale=1` in viewport meta | Never disable user zoom |
| `onPaste` + `preventDefault` | Never block paste |
| `transition: all` | List specific properties |
| `outline-none` without `focus-visible:` replacement | Focus rings are required |
| `<div onClick>` for navigation | Use `<Link>` |
| `<div onClick>` for actions | Use `<button>` |
| `<img>` without `width` + `height` | Prevents CLS |
| Large array `.map()` without virtualization | Virtualise > 50 items |
| Form inputs without labels | Every input needs a label |
| Icon buttons without `aria-label` | Required for screen readers |
| Hardcoded date/number format strings | Use `Intl.*` |
| `autoFocus` without justification | Desktop only, single input |
| Raw hex/rgba in component style props | Use CSS token classes |

---

## Content & Copy

- **Active voice**: "Install the CLI" not "The CLI will be installed"
- **Title Case** for headings and button labels (Chicago style)
- **Numerals for counts**: "8 items" not "eight items"
- **Specific button labels**: "Save Changes" not "Continue"; "Delete Property" not "Confirm"
- **Error messages** include the fix/next step, not just the problem: "DSCR (1.1x) is below the lender minimum (1.25x). Reduce the loan amount or increase NOI."
- Second person (`you`, `your`) — avoid first person
- `&` over "and" in space-constrained UI (buttons, badges, table headers)

---

## Pre-Ship Checklist

Run before marking any new page or component as done:

**Accessibility**
- [ ] All icon-only buttons have `aria-label`
- [ ] All form inputs have labels
- [ ] Focus states visible on all interactive elements
- [ ] Heading hierarchy not skipped

**Typography & Numbers**
- [ ] Financial figures use `font-mono tabular-nums`
- [ ] No hardcoded date/number format strings (`Intl.*` only)
- [ ] Ellipsis `…` not `...`

**States**
- [ ] Loading skeleton or spinner shown while data fetches
- [ ] Empty state implemented with icon + title + description + action
- [ ] Error state with retry button

**Interaction**
- [ ] No `transition: all`
- [ ] Destructive actions have confirmation
- [ ] No `<div onClick>` for actions or navigation
- [ ] Motion respects `prefers-reduced-motion`

**Data**
- [ ] All `data-testid` on interactive elements and key data displays
- [ ] Lists >50 items virtualized

**Theming**
- [ ] Dark mode works correctly
- [ ] No raw hex/rgba in JSX style props
- [ ] `color-scheme` and `theme-color` meta tag set
