---
title: "Slide Factory UI — Design Consistency Sweep (Floating States, No Embedded Cards)"
type: ui-refactor
status: active
date: 2026-05-13
owner: CC
priority: high
---

# Slide Factory UI — Design Consistency Sweep

## Problem Frame

The rest of the portal was swept to ban embedded inline spinners, embedded error cards, and
embedded status blocks inside page content. That work produced two shared components:

- `PageLoadingState` — skeleton shimmer, fixed floating position (used at page-load time)
- `PageErrorState` — fixed floating pill at bottom-centre of screen, icon + message + retry

The slide factory was **not included in that sweep**. Every tab in
`artifacts/hospitality-business-portal/src/features/slide-factory/` still uses the old pattern:
`<Card>` wrappers for loading states, embedded `<Loader2>` spinners inside `<CardContent>`,
and inline destructive `<Card className="border-destructive/50">` error blocks.

This plan makes the slide factory consistent with the rest of the portal. It is **design-only** —
the pipeline logic, API calls, agent behaviour, and state machine are untouched.

---

## Established Design Rules (from prior sweep — non-negotiable)

1. **No full-content-area loading cards.** A tab waiting for a pipeline stage must not render a
   `<Card>` containing a centred spinner and paragraph copy. Use a skeleton shimmer instead.
2. **No embedded error cards.** Errors surface as floating pills (matching `PageErrorState`'s
   pill shape) — never as `<Card className="border-destructive/50">` blocks inside tab content.
3. **No `<Loader2>` spinning inside a `<Card>` as the primary tab state.** A spinner may still
   appear inside an action `<Button>` while a mutation is in-flight (that is fine and stays).
4. **Progress/activity states use a floating rectangle.** When a long-running pipeline step is
   active (Lorenzo ingesting, Lucca drafting, agents building), the active state communicates
   progress through a floating or minimal surface — not a large embedded card that dominates
   the page.
5. **`PlaceholderTab` (locked future steps) stays as-is.** It is muted placeholder copy, not
   a loading or error state. No change needed there.

---

## Scope

**In scope — UI components only:**

| File | What changes |
|---|---|
| `tabs/LorenzoTab.tsx` | `LorenzoIngestingView` card → floating progress rectangle; `LorenzoCompleteView` status card → inline muted header row; inspector-rejected card → floating error pill |
| `tabs/LuccaTab.tsx` | Drafting state card+spinner → skeleton shimmer; `draft_review` Card wrapper → borderless section |
| `tabs/AgentsTab.tsx` | Outer `<Card>` wrapper → borderless section; embedded error lines stay (they are inline per-row, not card-level) |
| `tabs/DownloadTab.tsx` | Error state card → floating pill; "deck not rendered" inline alert block → floating pill; rebuilding card+spinner → skeleton shimmer |
| `tabs/BriefTab.tsx` | Audit for any embedded status cards; keep upload UI intact (not a status pattern) |
| `tabs/SharedComponents.tsx` | `PlaceholderTab` — no change; audit only |
| `SlideFactoryPanel.tsx` | Loading state (outer) → `PageLoadingState` skeleton pattern |

**Explicitly not in scope:**
- Pipeline logic, API calls, mutations, state machine, agent code
- Server routes, DB schema, agent implementations
- The content displayed once a step is complete (stat grids, slot rows, per-slide breakdown rows)
- Any file outside `artifacts/hospitality-business-portal/src/features/slide-factory/`

---

## Design Specification Per Tab

### Tab 1 — Brief (`BriefTab.tsx`)

**Current:** Upload area and accepted-run state are wrapped in `<Card>`. No loading or error
card pattern that violates the rules (upload UI is interactive, not a status card).

**Change:** Audit only. The Brief tab's cards are structural UI (upload target, accepted
state summary) — not status-loading patterns. Keep as-is unless a specific embedded error
or spinner card is found on re-read.

---

### Tab 2 — Lorenzo (`LorenzoTab.tsx`)

**Current — `LorenzoIngestingView`:**
A `<Card>` containing a centred `<Loader2>` header, paragraph, a step-by-step list
(Lorenzo-03, Lorenzo-05) with per-step spinners/check icons, a Technical Details collapsible
for Aldo/Carlo minion steps, and an elapsed-time footnote. This is the longest-running step
(2–4 minutes) and currently occupies the entire tab as a large embedded card.

**Change — floating progress rectangle:**
Replace the outer `<Card>` with a compact floating progress surface. Use the same visual
language as the rest of the portal's activity states:

- A fixed or sticky floating rectangle (matching `PageErrorState`'s pill shape language but
  wider, max-width ~480px, positioned bottom-centre or top-right of the tab panel area)
- Contains: animated progress bar (indeterminate, accent colour), current step label
  (e.g. "Lorenzo-03 · Vision pass"), elapsed time counter, and a muted caption
  ("Extracting and enriching slide data — 2–4 min")
- The tab panel background behind the floating rectangle shows a skeleton shimmer
  (three shimmer bars of varying widths) to indicate content will appear here when done
- The Technical Details collapsible (Aldo/Carlo minion steps) moves inside the floating
  rectangle as an expandable row — not a separate card

**Current — `LorenzoCompleteView` status header:**
A `<Card>` containing check icon + "Canonical spec ready" + schema/type/inspector summary.
Below it: a 2×4 stat grid of mini cards, a per-slide breakdown card, and optionally an
inspector-rejected error card.

**Change — complete view:**
- Remove the status header `<Card>` — replace with a single muted inline header row
  (icon + text, no border, no background fill) that sits above the stat grid
- The 2×4 stat grid of mini `<Card>` components: replace with a simple horizontal stat
  bar — four stat chips using `bg-muted rounded px-3 py-2` without the Card shell.
  Same data, lighter visual weight.
- The per-slide breakdown `<Card>`: replace with a borderless `<div>` with a
  `divide-y divide-border` list. The section label becomes a small uppercase muted heading.
- Inspector-rejected error `<Card className="border-destructive/50">`: replace with a
  floating error pill (matching `PageErrorState` style — fixed bottom-centre, icon + message,
  auto-dismiss or manual close). The inspector notes text truncates in the pill; a tooltip or
  expand icon shows the full text.

---

### Tab 3 — Properties (`PropertiesTab.tsx`)

**Current:** Property assignment dropdowns inside a structural card. No loading or error
card violations expected (read on audit before changing).

**Change:** Audit only. If a loading spinner card is found (e.g. while saving), apply
the same skeleton pattern. Inline mutation spinners inside buttons are fine and stay.

---

### Tab 4 — Lucca (`LuccaTab.tsx`)

**Current — drafting state:**
`<Card><CardContent className="py-10 flex flex-col items-center gap-3">` containing a
centred `<Loader2>` + two paragraphs. This is the classic banned pattern.

**Change:**
- Replace the entire drafting-state card with a skeleton shimmer: three shimmer bars
  (mimicking where slot rows will appear) + the same floating progress pill used for
  Lorenzo (narrower variant — "Lucca · Drafting slide content" with an indeterminate bar)
- The floating pill positions bottom-centre of the tab panel area

**Current — draft_review state:**
A `<Card>` wrapping the full Lucca Draft Review header + all slot rows. This is a
structural container, not a status card — but the outer Card adds visual weight that
pushes the content into a box.

**Change:**
- Remove the outer `<Card>` / `<CardContent>` wrapper from the draft_review state
- The header row (title + approved count + "Approve all" button) becomes a plain flex
  row with a bottom border (`border-b border-border pb-3 mb-3`)
- Each `SlotRow` stays as `<div className="border rounded-lg p-3">` — those are
  individual item borders, not a status card, so they stay exactly as-is
- The "Proceed to build" button row stays exactly as-is

---

### Tab 5 — Agents (`AgentsTab.tsx`)

**Current:** Everything is inside a single `<Card>`. The orchestrator row (Marco), the
"6 teams building…" header, and the per-slide agent rows are all wrapped in the card.

**Change:**
- Remove the outer `<Card>` / `<CardContent>` wrapper entirely
- The Marco orchestrator row becomes a top-level flex row with a bottom border
  (`border-b border-border pb-3 mb-3`)
- The status header ("6 teams building…" / "Build complete" / "Build failed") becomes
  an inline muted text label above the agent list — no card shell
- Per-slide agent rows (`divide-y divide-border`) continue exactly as-is (they are list
  rows, not cards)
- Error messages inline per-row (`text-destructive truncate`) stay exactly as-is —
  these are small per-item notes, not card-level error blocks
- When `isBuilding`, the footer note ("The pipeline advances to download when all
  slides are approved") stays as muted footnote text — no card needed

---

### Tab 6 — Download (`DownloadTab.tsx`)

**Current — error state (`run.status === "error"`):**
`<Card><CardContent>` with `IconAlertCircle` + "Build failed" + description paragraph.
Classic banned embedded error card.

**Change:** Replace with a floating error pill (same shape as `PageErrorState`):
- Fixed bottom-centre of the tab panel area
- Icon + "Build failed — review the Agents tab for details"
- No card, no embedded block

**Current — "deck not rendered" warning:**
`<div className="rounded-md border border-border bg-muted/30 p-4">` with `IconAlertCircle`
+ "Deck not yet rendered" + admin contact copy. This is an embedded inline warning block.

**Change:** Replace with a floating error pill — "Deck not yet rendered · Contact your
administrator." Same position as above.

**Current — rebuilding state:**
`<Card>` header showing `<Loader2>` + "Rebuilding PDF…" and a paragraph below.

**Change:** Replace with skeleton shimmer (two shimmer bars where the download buttons
will appear) + floating progress pill — "Rebuilding PDF…" with indeterminate bar.

**Current — complete state ("Deck ready"):**
`<Card>` containing the check icon + "Deck ready" header, completion timestamp, and
the PDF + PPTX download buttons. This is a structural success container.

**Change:** Remove the outer `<Card>`. Replace with a borderless section:
- Success indicator: small `IconCheckCircle` + "Deck ready" + timestamp as a single
  muted inline row (no card background, no border)
- Download buttons directly below — no wrapping card
- `FactoryOverridePanel` continues below as-is

---

### Outer Panel (`SlideFactoryPanel.tsx`)

**Current loading state:**
```tsx
<div className="flex items-center justify-center py-8">
  <Loader2 className="w-5 h-5 animate-spin text-accent-pop" />
</div>
```
This is a centred spinner, not inside a card, but still an embedded spinner pattern.

**Change:** Replace with a skeleton shimmer matching the factory panel's expected
shape — shimmer bars for the tab strip, then two or three content shimmer blocks.
Do not use `PageLoadingState` (that wraps `<Layout>` and is for full pages);
use `<Skeleton>` directly here since SlideFactoryPanel lives inside the Layout already.

---

## Shared Floating Progress Component

All three "long-running" active states (Lorenzo ingesting, Lucca drafting, agents building)
share the same visual language. CC should extract a single reusable component:

```
FactoryProgressPill
```

Props:
- `label: string` — primary label, e.g. "Lorenzo · Vision pass"
- `caption?: string` — secondary muted text, e.g. "2–4 min"
- `elapsed?: number` — seconds elapsed, shown as "0:42" formatted counter
- `expandable?: React.ReactNode` — optional collapsible content (Technical Details)

Shape: fixed-position floating rectangle, bottom-centre of the panel area
(`position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%)`),
`max-width: 480px`, `bg-background border rounded-xl shadow-lg px-5 py-4`.
Contains: indeterminate progress bar (accent colour, `animate-pulse` or CSS animation),
label row, optional caption, optional elapsed counter, optional expand toggle.

Location: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/FactoryProgressPill.tsx`
(co-located with the other tab components; not a shared global component since it is
factory-specific UI).

---

## Shared Floating Error Component (Factory-scoped)

For factory-specific inline errors (not page-level), CC should extract:

```
FactoryErrorPill
```

Props:
- `message: string`
- `detail?: string` — shown in tooltip on the pill
- `action?: { label: string; onClick: () => void }` — optional inline CTA

Shape: same floating pill as `PageErrorState`
(`position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%)`),
`bg-background border rounded-lg shadow-lg px-4 py-2.5 text-sm`.
Contains: `IconAlertTriangle` + message + optional action button.

The `FactoryProgressPill` and `FactoryErrorPill` should not stack — they are mutually
exclusive states (a step is either in-progress or has failed, not both).

Location: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/FactoryErrorPill.tsx`

---

## Files Summary

| File | Change type |
|---|---|
| `tabs/FactoryProgressPill.tsx` | **New** — shared floating progress rectangle for Lorenzo/Lucca/Agents active states |
| `tabs/FactoryErrorPill.tsx` | **New** — shared floating error pill for build-failed/deck-missing/inspector-rejected states |
| `tabs/LorenzoTab.tsx` | Replace ingesting Card+spinner → skeleton + FactoryProgressPill; remove status header card; flatten stat grid and breakdown card |
| `tabs/LuccaTab.tsx` | Replace drafting Card+spinner → skeleton + FactoryProgressPill; remove draft_review outer Card wrapper |
| `tabs/AgentsTab.tsx` | Remove outer Card wrapper; flatten orchestrator row and status header |
| `tabs/DownloadTab.tsx` | Replace error Card → FactoryErrorPill; replace inline warning block → FactoryErrorPill; replace rebuilding Card → skeleton + FactoryProgressPill; remove "Deck ready" Card wrapper |
| `tabs/BriefTab.tsx` | Audit only — no change expected |
| `tabs/PropertiesTab.tsx` | Audit only — no change expected |
| `tabs/SharedComponents.tsx` | Audit only — PlaceholderTab stays |
| `SlideFactoryPanel.tsx` | Replace outer loading spinner → Skeleton shimmer |

---

## Definition of Done

- [ ] No `<Card>` used as a loading-state container anywhere in `features/slide-factory/`
- [ ] No `<Loader2>` used as a primary tab content state (button-internal spinners are fine)
- [ ] No embedded destructive `<Card>` error blocks in any slide factory tab
- [ ] `FactoryProgressPill` used for Lorenzo ingesting, Lucca drafting, and agents building active states
- [ ] `FactoryErrorPill` used for build-failed, deck-missing, and inspector-rejected states
- [ ] `check:typecheck`, `check:lint`, `check:spinner-contrast` all pass
- [ ] Visual review: each tab state (loading, active, complete, error) looks consistent with the rest of the portal

---

## What CC Must NOT Touch

- `artifacts/api-server/src/` — any server route, agent, or pipeline code
- `artifacts/api-server/src/slides/` — slide builder agents (Marco, Sofia teams, etc.)
- `SlideFactoryHooks.ts`, `SlideFactoryTypes.ts`, `SlideFactoryUtils.ts` — business logic
- Any mutation handler, API call, or state transition in the tab components
- `lib/engine/`, `lib/calc/`, `lib/db/` — off-limits regardless
