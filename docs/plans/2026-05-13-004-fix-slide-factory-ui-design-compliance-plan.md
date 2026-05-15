---
title: "fix: Slide Factory UI — design compliance sweep"
type: fix
status: active
date: 2026-05-13
---

# fix: Slide Factory UI — design compliance sweep

## Summary

Forty design findings from a `ce-design-implementation-reviewer` pass on the slide factory
surfaces (SlideFactoryPanel, six tabs, admin SlideDecksTab, intelligence SlideFactoryDetail,
MarcoOrb). This plan groups them into ten implementation units by theme: token violations,
text-size floor, tooltip migration, icon cleanup, accessibility, empty states, UX dead-ends,
DownloadTab, admin surface, and intelligence/animation. All units are frontend-only —
no schema, engine, or API changes.

---

## Requirements

- R1. All status-colour usages must use CSS custom-property tokens (`bg-warning/10 text-warning`,
  `bg-success/10 text-success`, `bg-destructive/10 text-destructive`, `bg-muted text-muted-foreground`),
  never raw Tailwind palette classes (`bg-amber-50`, `bg-green-100`, `text-blue-600`).
- R2. Minimum text size is `text-xs` (12 px). No `text-[10px]` or `text-[11px]` in any
  user-visible label, badge, or chip.
- R3. All numeric values displayed to users must carry `font-mono` (JetBrains Mono).
- R4. Every hover-help affordance must use the `<Tooltip>` component; native `title` attributes
  are banned on interactive elements.
- R5. All iconography must use Phosphor icon components; Unicode characters (✓ × ▶) are banned.
- R6. Interactive touch targets must meet 44 × 44 px minimum (WCAG 2.5.5).
- R7. Empty / zero-data states must use the `<Empty>` component family.
- R8. Form labels must be `<Label htmlFor="…">` associated with their control.
- R9. Status icons must carry `aria-label` / `role="img"` so screen readers announce them.
- R10. Errors must render as `<Alert variant="destructive">`, not bare paragraphs.
- R11. The admin `SlideDecksTab` must open with `<PageHeader>` not a raw `<h2>`.
- R12. Download errors must surface via toast; failures must not be silently swallowed.
- R13. The download filename must include brief name / date, not the raw DB run id.
- R14. Terminal error states must offer a retry or navigation affordance.
- R15. The `MarcoOrb` infinite-loop animation phases must be documented in the
  nai-design-system animation-exceptions table.

---

## Scope Boundaries

- Engine, API, DB schema, and agent behaviour are unchanged.
- No new features — every unit is a fix to an existing surface.
- The accordion line format for Agent Roster, LLMs, APIs, and Links pages is not touched.
- Admin Knowledge & Resources surfaces are out of scope.

---

## Context & Research

### Relevant Code and Patterns

- Token reference: `artifacts/hospitality-business-portal/src/index.css` —
  `--warning`, `--success`, `--destructive`, `--muted` custom properties confirmed live.
- `text-warning` usage confirmed in `src/components/scenarios/LoadSharedWarningDialog.tsx`.
- `<Empty>` component: `artifacts/hospitality-business-portal/src/components/ui/empty.tsx` —
  slot-based API (`<Empty>`, `<EmptyHeader>`, `<EmptyTitle>`, `<EmptyDescription>`, `<EmptyActions>`).
- Tooltip reference: `artifacts/hospitality-business-portal/src/components/ui/factory-source-badge.tsx` —
  canonical `<Tooltip><TooltipTrigger asChild>…<TooltipContent>` pattern.
- Dino verdict colouring reference: `AgentsTab.tsx` — `dinoPctVerdict` + `DINO_VERDICT_CLASS`.
- `aria-label` pattern: `AgentsTab.tsx` lines 100–102 — `<IconCheckCircle>` and
  `<IconAlertCircle>` status icons are the reference; pending/running icons lack labels.
- `<PageHeader>` usage: `artifacts/hospitality-business-portal/src/components/ui/page-header.tsx`.

### Institutional Learnings

- CLAUDE.md § "Frontend Design Standards": every `.tsx` unit that renders UI must invoke
  `/post-coding-design-review` before declaring done.
- nai-design-system SKILL: "Never use raw hex, hsl(), or rgba() in component JSX/TSX — always
  use CSS token classes." Raw named Tailwind palette classes carry the same prohibition.
- HBG design philosophy: "All numerical data MUST use JetBrains Mono."

---

## Key Technical Decisions

- **Token class names for warning:** Use `text-warning` / `bg-warning/10` / `border-warning/30`
  (CSS custom property confirmed at `--warning: 38 92% 50%`). Do not introduce new token aliases.
- **Empty component API:** Use the slot-based `<Empty>` + `<EmptyHeader>` + `<EmptyTitle>` +
  `<EmptyDescription>` pattern already in the codebase; do not wrap or re-export.
- **Tooltip wrapping strategy:** Follow `FactorySourceBadge.tsx` exactly —
  `<Tooltip><TooltipTrigger asChild><…/><TooltipContent>…</TooltipContent></Tooltip>`.
- **Download filename format:** `${briefNameSlug}-deck-${YYYY-MM-DD}.pdf`. Derive slug from
  `run.briefFilename` (strip extension, kebab-case). Fall back to `deck-${YYYY-MM-DD}.pdf`
  when `briefFilename` is null.
- **MarcoOrb animation exceptions:** Add a row to the exceptions table in
  `.agents/skills/nai-design-system/SKILL.md` (or wherever the table lives) with
  phase names, rationale (brand / build-status indicator), and add the inline comment
  `/* Animation exception: brand/active-build indicator — see nai-design-system Animation Exceptions */`
  to each `repeat: Infinity` usage.

---

## Open Questions

### Deferred to Implementation

- `PropertiesTab.tsx` "Edit assignments" button: confirm whether resetting `setSaved(false)`
  is sufficient or whether the run needs to be patched on the server (check whether Lorenzo
  has already started based on run status before showing the edit affordance).
- `DownloadTab.tsx` tab-navigation callback: verify the parent `SlideFactoryPanel` already
  passes an `onTabChange` prop or equivalent; wire it if absent.

---

## Implementation Units

- U1. **Token violations — amber/raw colour sweep (Critical)**

**Goal:** Replace every raw Tailwind palette class used for status colouring with the
correct CSS custom-property token class across all three affected files.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/AgentsOverridePanel.tsx`
- Modify: `artifacts/hospitality-business-portal/src/components/admin/SlideDecksTab.tsx`
- Modify: `artifacts/hospitality-business-portal/src/pages/intelligence/UnifiedRunsDetails/SlideFactoryDetail.tsx`

**Approach:**
- `AgentsOverridePanel.tsx` line ~92–95 "overridden" badge: `text-amber-600 bg-amber-50
  border-amber-200` → `text-warning bg-warning/10 border-warning/30`.
- `SlideDecksTab.tsx` `ACQSTATUS_STYLES` + `DECK_READINESS_STYLES` maps: replace each
  raw colour set with the matching semantic token — success (emerald maps to `text-success
  bg-success/10`), info/building (`text-info bg-info/10` or `text-primary/80 bg-primary/10`
  — pick whichever token exists), warning (`text-warning bg-warning/10`), destructive
  (`text-destructive bg-destructive/10`), muted (`text-muted-foreground bg-muted`).
  Also replace `text-blue-600 dark:text-blue-400` queue stat classes.
- `SlideFactoryDetail.tsx` cancel banner line ~131–149: same amber → warning token swap.

**Test scenarios:**
- Happy path: render each badge/banner with each status value; confirm rendered className
  contains token class, not `amber-*` / `green-*` / `blue-*`.
- Edge case: unknown status falls back to `bg-muted text-muted-foreground`.
- Integration: verify badge colours are visible in both light and dark mode (manual check
  in browser; dark mode toggle is available in the app).

**Verification:**
- `grep -rn "amber-\|green-100\|green-800\|blue-100\|blue-600\|yellow-100\|emerald-100"
  artifacts/hospitality-business-portal/src/features/slide-factory/
  artifacts/hospitality-business-portal/src/components/admin/SlideDecksTab.tsx
  artifacts/hospitality-business-portal/src/pages/intelligence/UnifiedRunsDetails/SlideFactoryDetail.tsx`
  returns zero results.

---

- U2. **Text-size floor — `text-[10px]` → `text-xs` sweep**

**Goal:** Raise every sub-12 px label in factory UI surfaces to the `text-xs` minimum.

**Requirements:** R2

**Dependencies:** None

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/LorenzoTab.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/AgentsTab.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/AgentsOverridePanel.tsx`
- Modify: `artifacts/hospitality-business-portal/src/pages/intelligence/UnifiedRunsDetails/SlideFactoryDetail.tsx`

**Approach:**
- Global search-replace `text-[10px]` → `text-xs` and `text-[11px]` → `text-xs` across
  all four files. Review each occurrence in context to confirm the surrounding spacing
  still looks correct at the larger size — tighten `px-` or `py-` padding on badges if
  needed to preserve compact appearance.
- `AgentsTab.tsx`: also remove the redundant `Slide N` from the "Team · Slide N" badge
  text (Finding 21) — the slide number is already in the heading line.

**Test scenarios:**
- Happy path: render each badge/label with a sample value; inspect className for `text-xs`.
- Visual regression: badge rows should not overflow their containing card at `text-xs`.

**Verification:**
- `grep -rn "text-\[10px\]\|text-\[11px\]"` across factory + SlideFactoryDetail returns
  zero results.

---

- U3. **`font-mono` on all numeric displays**

**Goal:** Every number shown to users carries JetBrains Mono so it reads as data.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/LorenzoTab.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/LuccaTab.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/PropertiesTab.tsx`

**Approach:**
- `LorenzoTab.tsx`: add `font-mono` to the `className` of every stat-card value element
  (chunk count, character count, duration). Current classes include `tabular-nums` — keep
  both; `font-mono` sets the typeface, `tabular-nums` aligns glyphs.
- `LuccaTab.tsx`: wrap `{approvedCount} / {slots.length}` in
  `<span className="font-mono">{approvedCount} / {slots.length}</span>`.
- `PropertiesTab.tsx`: wrap slide-number strings in `<span className="font-mono">` where
  they appear in description text, or use `font-mono` on the element that renders them.

**Test scenarios:**
- Happy path: render stat cards and counters; inspect className for `font-mono`.

**Verification:**
- All numeric stat/counter elements in the three files carry `font-mono` in their
  className.

---

- U4. **Tooltip migration — replace all native `title` attributes**

**Goal:** Every hover-help affordance uses `<Tooltip>` / `<TooltipContent>` from the
design system; no `title="…"` remains on interactive elements in factory surfaces.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/SlideFactoryPanel.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/AgentsTab.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/AgentsOverridePanel.tsx`

**Approach:**
- `SlideFactoryPanel.tsx`: each disabled `TabsTrigger` currently shows `title="Complete the
  previous step to unlock"`. Wrap each trigger in
  `<Tooltip><TooltipTrigger asChild>{trigger}</TooltipTrigger>
  <TooltipContent>Complete the previous step to unlock</TooltipContent></Tooltip>`.
  The trigger remains `disabled`; Radix Tooltip still fires on hover for disabled elements
  when the `TooltipTrigger` wraps them.
- `AgentsTab.tsx` Dino badge span: replace `title={…}` with Tooltip wrapping the badge
  span. Content: `"{MINIONS.dino.role}: {result.pixelDiffPct.toFixed(N)}% pixel diff"`.
- `AgentsOverridePanel.tsx` Suggest button + Clear photo button: replace both `title`
  attributes with Tooltip wrappers. Content mirrors current title text.
- Follow `FactorySourceBadge.tsx` exactly for the wrapping pattern.

**Test scenarios:**
- Happy path: hover over a disabled tab; tooltip appears.
- Happy path: hover over Dino badge; tooltip shows percentage.
- Happy path: hover over Suggest / Clear buttons; tooltip shows.
- Edge case: keyboard focus on tooltip trigger shows tooltip (Radix default behaviour).

**Verification:**
- `grep -rn 'title="'` across all four modified files returns zero results on interactive
  elements.

---

- U5. **Icon cleanup — Unicode chars → Phosphor + touch target fixes**

**Goal:** Remove all Unicode character icons; replace with Phosphor components. Fix the
clear-photo button touch target.

**Requirements:** R5, R6

**Dependencies:** None

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/LuccaTab.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/LorenzoTab.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/AgentsOverridePanel.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/DownloadTab.tsx`

**Approach:**
- `LuccaTab.tsx` approved-state button: replace `✓` with
  `<IconCheckCircle weight="fill" className="w-3.5 h-3.5 mr-1" />`. The
  `<IconCheckCircle>` import is already used in `AgentsTab.tsx` — follow that import.
- `LorenzoTab.tsx` collapsible chevron: replace `▶` with
  `<IconChevronRight className="w-3.5 h-3.5 transition-transform data-[state=open]:rotate-90" />`.
- `AgentsOverridePanel.tsx` clear-photo button: replace `×` with
  `<IconX className="w-2.5 h-2.5" />`. Increase the button's touch target: change from
  `h-4 w-4 p-0` to `h-6 w-6 p-1` (24 px base + 4 px padding each side = 32 px rendered;
  absolute-positioned so it doesn't push layout). If 44 px is unachievable inside the
  thumbnail without layout breakage, accept 32 px and add a comment that WCAG AA requires
  44 px and this is a known accepted deviation at this scale.
- `DownloadTab.tsx` "Deck not yet available" state: replace `<IconAlertCircle>` with
  `<IconClock>` or `<IconHourglass>`. "Rebuild PDF" button: replace `<IconDownload>` with
  `<IconArrowsClockwise>`.

**Test scenarios:**
- Happy path: render each component; confirm no Unicode characters in rendered output.
- Happy path: render clear-photo button at full size; button element has padding ≥ `p-1`.

**Verification:**
- No `✓`, `×`, or `▶` Unicode chars in the four modified files.
- Clear-photo button classNames include padding giving ≥ 24 px target.

---

- U6. **Empty states — `<Empty>` component**

**Goal:** Replace bare paragraph empty states with the `<Empty>` component family.

**Requirements:** R7

**Dependencies:** None

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/SharedComponents.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/LuccaTab.tsx`

**Approach:**
- `SharedComponents.tsx` `PlaceholderTab`: replace the two bare `<p>` tags with:
  ```
  <Empty>
    <EmptyHeader>
      <IconClock className="w-8 h-8 text-muted-foreground" />
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
  </Empty>
  ```
  Pass icon, title, description as props (or inline if `PlaceholderTab` already accepts them).
- `LuccaTab.tsx` "No draft slots found." `<p>`: replace with the same pattern using
  `<IconFileText>`, title "No draft slots yet", description "Lucca hasn't produced any
  content yet. Check back shortly."
- Import `Empty`, `EmptyHeader`, `EmptyTitle`, `EmptyDescription` from
  `@/components/ui/empty`.

**Test scenarios:**
- Happy path: render `PlaceholderTab` with no data; `<Empty>` component renders with icon,
  title, and description.
- Happy path: render `LuccaTab` with empty slots array; `<Empty>` renders.
- Edge case: `PlaceholderTab` title/description props are undefined → fallback text renders,
  no crash.

**Verification:**
- Neither file contains a bare `<p>` element as an empty-state holder.

---

- U7. **Accessibility fixes — labels, aria-labels, Alert errors**

**Goal:** All form controls have programmatically associated labels; all status icons have
`aria-label`; errors use `<Alert variant="destructive">`.

**Requirements:** R8, R9, R10

**Dependencies:** None

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/SharedComponents.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/AgentsTab.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/BriefTab.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/AgentsOverridePanel.tsx`

**Approach:**
- `SharedComponents.tsx` property selector: change `<span>` label to
  `<Label htmlFor="factory-property-select">` and add `id="factory-property-select"` to the
  `<Select>` trigger (or pass via the existing `id` prop if present).
- `AgentsTab.tsx` status icons: add `aria-label` to each status variant —
  `aria-label="Approved"`, `aria-label="Failed"`, `aria-label="In progress"`,
  `aria-label="Pending"`. Pending state is a raw `<div>`; add `role="img"` as well.
- `BriefTab.tsx` upload error `<p className="text-xs text-destructive">`: replace with
  `<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>`.
  Import `Alert`, `AlertDescription` from `@/components/ui/alert`.
- `BriefTab.tsx` spinner in primary button: add `text-white` to the `<Loader2>` className.
- `AgentsOverridePanel.tsx` photo URL placeholder: change `"Paste R2 photo URL…"` →
  `"Paste a photo URL…"`.

**Test scenarios:**
- Happy path: render property selector; `<label>` element has `htmlFor` matching input `id`.
- Happy path: render approved/failed/in-progress/pending icons; each has `aria-label`.
- Happy path: render BriefTab with upload error; `<Alert>` renders with correct variant.
- Happy path: render BriefTab submitting; spinner is `text-white`.
- Happy path: render photo URL input; placeholder text does not contain "R2".

**Verification:**
- No `<span>` form label in SharedComponents.
- All four status icon variants carry `aria-label` in AgentsTab.
- No bare `<p className="text-xs text-destructive">` in BriefTab.

---

- U8. **UX dead-ends — helper text, edit affordance, label consistency**

**Goal:** Users are never left without a forward path; copy is consistent across trigger
and confirmation.

**Requirements:** (design quality — no R-ID from requirements list, but addresses Findings
6, 12, 18)

**Dependencies:** None

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/BriefTab.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/PropertiesTab.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/LuccaTab.tsx`

**Approach:**
- `BriefTab.tsx` before "Accept brief" button: add a single `<p className="text-xs
  text-muted-foreground">Accepting the brief starts Lorenzo, the ingestion agent. This
  cannot be undone once started.</p>` immediately above the submit button.
- `PropertiesTab.tsx` success state: add a secondary `<Button variant="outline" size="sm"
  onClick={() => setSaved(false)}>Edit assignments</Button>` in the success card. Check
  run status before rendering: if the run has already moved past the properties step,
  show the button as disabled with tooltip "Lucca is already drafting — assignments are
  locked."
- `LuccaTab.tsx` trigger-build affordance: rename button from "Proceed to build" →
  "Start Build". Update the success toast title from "Build triggered" → "Build started."

**Test scenarios:**
- Happy path: render BriefTab in idle state; helper paragraph is visible above submit button.
- Happy path: render PropertiesTab after save; "Edit assignments" button is visible.
- Happy path: click "Edit assignments"; saved state resets and slot assignment UI re-renders.
- Edge case: run already in building/complete status; "Edit assignments" button is disabled.
- Happy path: render LuccaTab trigger button; label reads "Start Build".
- Happy path: trigger build; toast title reads "Build started."

**Verification:**
- Helper text present in BriefTab above submit button.
- "Edit assignments" button present in PropertiesTab success state.
- LuccaTab trigger button and toast title are consistent.

---

- U9. **DownloadTab improvements**

**Goal:** Meaningful download filename; error state offers navigation; correct icons for
waiting and rebuild states.

**Requirements:** R13, R14 (also R5 for icon fixes)

**Dependencies:** None

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/DownloadTab.tsx`

**Approach:**
- Download filename: compute `${briefSlug}-deck-${dateStr}.pdf` where `briefSlug` is
  `run.briefFilename` stripped of extension and kebab-cased (use a small local helper),
  `dateStr` is `run.createdAt` formatted as `YYYY-MM-DD`. Fall back to
  `deck-${dateStr}.pdf` when `briefFilename` is null.
- Error state: add `<Button variant="outline" size="sm"
  onClick={() => onTabChange?.("agents")}>View build errors</Button>`. The parent must
  pass `onTabChange?: (tab: string) => void` — verify this prop exists or add it.
- Waiting icon: already addressed in U5 (`<IconClock>` replacing `<IconAlertCircle>`).
- Rebuild icon: already addressed in U5 (`<IconArrowsClockwise>` replacing `<IconDownload>`).

**Test scenarios:**
- Happy path: `run.briefFilename = "Beachfront Hotel Brief.pdf"` →
  filename is `"beachfront-hotel-brief-deck-2026-05-13.pdf"`.
- Edge case: `run.briefFilename = null` → filename is `"deck-2026-05-13.pdf"`.
- Edge case: `run.briefFilename` contains special characters → slugified safely (no spaces,
  no slashes).
- Happy path: run status is "error"; "View build errors" button is visible.
- Happy path: click "View build errors"; `onTabChange` is called with `"agents"`.

**Verification:**
- Download `<a>` element `download` attribute is never `"slide-deck-run-N.pdf"`.
- "View build errors" button renders when `run.status === "error"`.

---

- U10. **Admin + intelligence surface fixes**

**Goal:** `SlideDecksTab` uses `<PageHeader>` and surfaces download errors; `SlideFactoryDetail`
has a retry button and consistent Dino verdict colouring.

**Requirements:** R11, R12, R14

**Dependencies:** U1 (colour tokens already fixed in U1)

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/components/admin/SlideDecksTab.tsx`
- Modify: `artifacts/hospitality-business-portal/src/pages/intelligence/UnifiedRunsDetails/SlideFactoryDetail.tsx`

**Approach:**
- `SlideDecksTab.tsx`: replace the raw `<h2>Slide Decks</h2>` heading with
  `<PageHeader title="Slide Decks" description="Manage factory runs and download generated decks." />`.
  Import `PageHeader` from `@/components/ui/page-header`. Keep surrounding layout spacing
  consistent with other admin tabs.
- `SlideDecksTab.tsx` `handleDownloadDeck` catch block: add
  `toast({ title: "Download failed", description: err instanceof Error ? err.message :
  "Please try again.", variant: "destructive" })`. Confirm `useToast` is imported.
- `SlideFactoryDetail.tsx` error state ("Couldn't load run details."): add a
  `<Button variant="ghost" size="sm" onClick={() => refetch()}>Retry</Button>` below the
  message. Destructure `refetch` alongside `data`, `isLoading`, `error` from the query hook.
- `SlideFactoryDetail.tsx` Dino badge: import `dinoPctVerdict` and `DINO_VERDICT_CLASS`
  (or their equivalents) from the shared constants / utilities that `AgentsTab.tsx` already
  uses. Apply verdict-based colour to the badge className, same as in `AgentsTab.tsx`.

**Test scenarios:**
- Happy path: render `SlideDecksTab`; `<PageHeader>` renders with correct title.
- Error path: `handleDownloadDeck` throws; destructive toast fires with error message.
- Happy path: render `SlideFactoryDetail` in error state; Retry button is visible.
- Happy path: click Retry; `refetch()` is called.
- Happy path: render Dino badge with a "pass" percentage; badge colour matches AgentsTab.
- Happy path: render Dino badge with a "fail" percentage; badge colour matches AgentsTab.

**Verification:**
- No raw `<h2>` heading in `SlideDecksTab.tsx`.
- `handleDownloadDeck` catch block calls `toast(...)`.
- Retry button present in `SlideFactoryDetail` error state.
- Dino badge in `SlideFactoryDetail` uses the same verdict colour logic as `AgentsTab`.

---

- U11. **MarcoOrb animation exceptions documentation**

**Goal:** The three `repeat: Infinity` phases in `MarcoOrb.tsx` are registered in the
animation exceptions table so they comply with the nai-design-system rule.

**Requirements:** R15

**Dependencies:** None

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/components/agent-animations/MarcoOrb.tsx`
- Modify: `.agents/skills/nai-design-system/SKILL.md`

**Approach:**
- `MarcoOrb.tsx`: add the inline comment
  `/* Animation exception: brand/active-build indicator — see nai-design-system Animation Exceptions */`
  immediately above each `repeat: Infinity` declaration in the `idle`, `dispatching`,
  `thinking`, and `synthesizing` phase variants.
- `nai-design-system/SKILL.md`: locate the Animation Exceptions table and add a row for
  `MarcoOrb` with columns: Component, Phase(s), Rationale. Rationale: "Orb pulses while
  Marco is actively building a run — finite repeat would stop pulsing mid-build; brand
  persona indicator while idle."
- Note: `complete` and `error` phases already use `repeat: 0` and need no change.

**Test scenarios:**
- Test expectation: none — this is a documentation-only change. No runtime behaviour changes.

**Verification:**
- `grep -n "repeat: Infinity" MarcoOrb.tsx` shows a comment above each match.
- nai-design-system SKILL.md exceptions table contains a row for MarcoOrb.

---

## System-Wide Impact

- **Interaction graph:** All changes are isolated to rendering; no callbacks, middleware, or
  server interactions are added except the DownloadTab `onTabChange` prop and the
  SlideDecksTab toast wiring (both lightweight).
- **Error propagation:** Download errors now surface as toasts instead of being swallowed;
  SlideFactoryDetail query failures now offer retry.
- **State lifecycle risks:** PropertiesTab edit-affordance reset (`setSaved(false)`) must
  check run status before un-locking assignments (see Open Questions).
- **API surface parity:** No API changes; Rebecca tools are unaffected.
- **Unchanged invariants:** Engine, DB schema, admin Knowledge & Resources surfaces, agent
  roster accordion, and all non-factory UI surfaces are unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `info` token may not exist as a Tailwind class | Verify `--info` CSS var in `index.css` before using `text-info`; fall back to `text-primary/80 bg-primary/10` |
| Radix Tooltip on disabled `TabsTrigger` may not fire | Radix docs state `TooltipTrigger asChild` on a `disabled` child uses a `<span>` wrapper to restore hover events; confirm this works with `TabsTrigger` or add a span wrapper manually |
| PropertiesTab `setSaved` reset when Lucca already started | Check `run.status` before showing edit button as active; see Open Questions |
| DownloadTab `onTabChange` prop not yet present on parent | Read `SlideFactoryPanel.tsx` prop interface; add if absent |
| BriefTab drop-zone redesign (Finding 5) | Not included in this plan — the ghost-button-to-drop-zone change is a layout restructure; scope it as a follow-up |

### Deferred to Follow-Up Work

- **BriefTab drop-zone redesign** (Finding 5, Major): ghost button → dashed drop zone is a
  layout restructure that warrants its own unit. Deferred to follow-up work.

---

## Sources & References

- Design review findings: ce-design-implementation-reviewer output, 2026-05-13 session
- Token reference: `artifacts/hospitality-business-portal/src/index.css`
- Empty component: `artifacts/hospitality-business-portal/src/components/ui/empty.tsx`
- Tooltip pattern: `artifacts/hospitality-business-portal/src/components/ui/factory-source-badge.tsx`
- Dino verdict: `artifacts/hospitality-business-portal/src/features/slide-factory/tabs/AgentsTab.tsx`
- PageHeader: `artifacts/hospitality-business-portal/src/components/ui/page-header.tsx`
- nai-design-system: `.agents/skills/nai-design-system/SKILL.md`
