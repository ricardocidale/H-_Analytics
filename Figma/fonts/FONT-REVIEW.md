# Font Review — Pre-Task Audit (2026-05-09)

This document records the state of the H+ Analytics portal typography system
**before** the three-font Swiss Modernist refactor (Task #1245) was applied.
It serves as a baseline for future audits.

---

## System Inventory

### Fonts declared (index.css `@theme inline`)

| Token | Value | Role |
|---|---|---|
| `--font-sans` | `'IBM Plex Sans', sans-serif` | Tailwind's default `font-sans` utility |
| `--font-display` | `'IBM Plex Sans', sans-serif` | Display headings |
| `--font-mono` | `'JetBrains Mono', monospace` | Numerical data |

**Missing:** `--font-body` was not declared. Inter had no Tailwind theme token.

### Font loading

**CRITICAL:** No `@import url(fonts.googleapis.com/...)` existed anywhere
in the portal's CSS. The three font families were declared in CSS variables
but never fetched — browsers fell back silently to system fonts
(usually system-ui / -apple-system on macOS/iOS, which visually resembles
Inter but is not it, and differs significantly from IBM Plex Sans and JetBrains Mono).

---

## Bug Inventory

### BUG-1 (Critical) — Body font wrong: IBM Plex Sans instead of Inter

**Root cause:**
```css
/* @theme inline */
--font-sans: 'IBM Plex Sans', sans-serif;   /* ← IBM Plex Sans as the Tailwind default */

/* @layer base */
body {
  @apply font-sans antialiased bg-background text-foreground;   /* ← resolves to IBM Plex Sans */
}
```

**Effect:** Every paragraph, label, button, description, form input, and nav
item rendered in IBM Plex Sans. Inter was defined in `.font-body` utility class
but never used — 0 occurrences of `font-body` in any TSX file.

**Severity:** Critical. Destroys the entire purpose of the three-font system
by assigning the display typeface to all body text.

---

### BUG-2 (Minor) — `h1–h4` base rule lacked explicit `font-family`

**Root cause:**
```css
h1, h2, h3, h4 {
  font-weight: 600;
  /* font-family not set — cascades from body (IBM Plex Sans) accidentally */
}
```

**Effect:** Headings accidentally rendered in IBM Plex Sans via body cascade,
which was the correct result — but only because BUG-1 made everything IBM
Plex Sans. Once BUG-1 is fixed (body → Inter), headings would have inherited
Inter without this explicit fix.

**Severity:** Minor (design was accidentally correct). Fixed for robustness.

---

### BUG-3 (Major) — Google Fonts not loaded

No `@import url(https://fonts.googleapis.com/...)` existed. The three declared
font families never had their font files fetched. Browsers silently fell back
to system fonts, meaning the visual identity was dependent on OS defaults
rather than the designed typefaces.

**Severity:** Major. No intentional fonts were actually rendering.

---

## Adoption Metrics (pre-task)

| Utility class | TSX files using it | Notes |
|---|---|---|
| `font-mono` | 658 | Excellent adoption — financial data is well-covered |
| `font-display` | 294 | Good adoption — but ~20 bare heading elements missing it |
| `font-body` | 0 | Never used anywhere — Inter had no adoption path |
| `font-sans` | 6 | Intentional usages in textareas/inputs (acceptable fallback) |

## Heading gap (pre-task)

~20 heading elements across the component layer used bare `h2`/`h3` with
`text-lg font-semibold` without `font-display`. These relied on the accidental
IBM Plex Sans cascade from BUG-1. After BUG-1 is fixed, they would receive
Inter (wrong) without the `font-display` class being explicitly added.

**Affected components:**
- `ErrorBoundary.tsx` — 3 headings
- `VerificationResults.tsx` — 4 headings
- `AnalystRefreshTheater.tsx` — 1 heading
- `SlideDecksTab.tsx` — 1 heading
- `NotificationsTab.tsx` — 1 heading
- `PropertyHeroImagesTab.tsx` — 1 heading
- `AgentPersonasTab.tsx` — 2 (1 CardTitle + 1 h3)
- `TestingDashboard.tsx` — 1 heading
- `AIReviewPanel.tsx` — 1 heading
- `HealthCheckDashboard.tsx` — 1 heading
- `verification/index.tsx` — 1 CardTitle
- `RadarChart.tsx` — 1 heading
- `table-shell.tsx` — 1 CardTitle
- `AssumptionsGate.tsx` — 1 heading
- `App.tsx` (Sentry fallback) — 1 heading

---

## What was already correct

These DO NOT need changes and were preserved exactly:

- `.font-display`, `.font-body`, `.font-mono`, `.font-mono-bold` in `@layer components` ✅
- `.heading-page`, `.heading-section`, `.heading-card`, `.heading-subsection` semantic classes ✅
- `.metric-lg`, `.metric-md`, `.metric-table`, `.metric-sm` metric classes ✅
- All card, table, badge, button, input, chart, slider, dialog utility classes ✅
- `Money.tsx` — `font-mono tabular-nums` ✅
- 658 `font-mono` usages across financial tables, KPI cards, metric cells ✅
- 294 `font-display` usages across page titles, section headers, card titles ✅
