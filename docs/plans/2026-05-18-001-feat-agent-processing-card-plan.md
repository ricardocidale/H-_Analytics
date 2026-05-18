---
title: "feat: Agent Processing Card — Floating Wait-State Standard"
type: feature
status: active
date: 2026-05-18
depth: standard
owner: replit
---

# Agent Processing Card — Floating Wait-State Standard

## Summary

Replace the current scatter of page-embedded analyst wait-state components with a
single, globally-mounted `AgentProcessingCard` that floats above the page plane.
Any hook or component in the app can spawn, update, and dismiss the card through a
Zustand store — the same pattern used by `usePanelManager`. The card shows a
`AnalystSwissCube` animation, a rotating caption, a progress bar, and a cancel
button. It renders via `createPortal` at `z-[60]` so it always sits above dialogs
and panels regardless of stacking context.

---

## Problem Frame

Four separate overlay/indicator components handle "analyst is working" states today:

| Component | Variant used | Problem |
|---|---|---|
| `ResearchLoadingOverlay` | inline / compact / fullscreen | Page-embedded; fullscreen variant rendered inside page tree, subject to stacking-context trapping; compact/inline have no cancel button |
| `ResearchTheater` | full-screen page block | Intentional — detailed multi-step view; stays |
| `ResearchRefreshOverlay` | full-screen takeover | Intentional — bulk portfolio refresh; stays |
| `ScheduledResearchOverlay` | page-embedded | No standard cancel; embedded in page flow |

The result: inconsistent cancellation, stacking-context risks on pages with
`transform` or `overflow-hidden` ancestors, no shared animation vocabulary for
wait states, and no easy way for a new job type (document analysis, slide factory,
etc.) to show polished "working" feedback without copy-pasting an overlay.

---

## Requirements

- **R1.** A single `AgentProcessingCard` component, `position: fixed bottom-6 right-6`, `z-[60]`, renders above dialogs/panels and below toasts/walkthrough.
- **R2.** Renders via React `createPortal` to `document.body` (same pattern as `RangePillsLayer.tsx`) to escape any stacking context on any page.
- **R3.** Mounted once in `Layout.tsx` alongside `CommandPalette` and `GuidedWalkthrough` (line ~572). No page imports the card directly.
- **R4.** Visual language inherits the H+ design system: `bg-card`, `border border-border/60`, `rounded-xl`, `shadow-xl`, `backdrop-blur-sm`. No new design tokens introduced.
- **R5.** Default animation: `AnalystSwissCube` (Swiss Modern — monochrome minimalist precision). Animation is configurable per job via `animation` prop on the store spawn call.
- **R6.** Rotating caption — accepts a `captions: string[]` array that rotates every 4 s, or a live `caption: string` for SSE streaming updates. Transitions use `AnimatePresence mode="wait"` with blur/fade matching the existing `ResearchLoadingOverlay` pattern.
- **R7.** Progress bar — `indeterminate` (pulsing, default) or `determinate` (0–100 `value` prop). Uses the `Progress` shadcn component (`components/ui/progress.tsx`) with `accent-pop` indicator.
- **R8.** Cancel button — `variant="ghost" size="sm"` per the app's button discipline. Calls the caller-supplied `onCancel()` callback and auto-dismisses the card.
- **R9.** Elapsed timer — appears after 5 s, `text-xs text-muted-foreground`, bottom-left of card (matches `ResearchLoadingOverlay` formatElapsed pattern).
- **R10.** Controlled via `useProcessingCardStore` Zustand store (`lib/processing-card.ts`), following the `usePanelManager` / `useResearchQueue` pattern.
- **R11.** `useProcessingCard` convenience hook (`hooks/useProcessingCard.ts`) wraps spawn/update/dismiss for calling code.
- **R12.** `AnalystButton` spawns the card when a research job starts and dismisses it on complete or error. Caption array sourced from `RESEARCH_TIPS` (migrated/shared from `ResearchLoadingOverlay`).
- **R13.** `useResearchStream` and `useCompanyResearchStream` call `store.update({ caption })` on each `phase` SSE event.
- **R14.** `ResearchLoadingOverlay` fullscreen variant marked `@deprecated` in JSDoc. Inline and compact variants stay — they are appropriate for page-embedded contexts (inside `CollapsibleSection`, form rows, etc.).
- **R15.** Skill doc at `.agents/skills/analyst-processing-card/SKILL.md` — documents spawn/update/dismiss API, animation selection guide, cancel wiring, and which overlay patterns stay vs. delegate to the card.
- **R16.** `prefers-reduced-motion` handled: `AnalystSwissCube` is replaced with a static monogram `A` avatar (matching `AgentThinkingState`'s `StaticAvatar` pattern) when `useReducedMotion()` returns `true`.
- **R17.** `aria-live="polite"` on the caption region; `role="status"` on the card root for screen reader announcements.

---

## Scope Boundaries

**In scope:**
- New card component, Zustand store, convenience hook
- Wiring `AnalystButton` to spawn/dismiss
- Wiring `useResearchStream` + `useCompanyResearchStream` to feed phase updates
- Soft-deprecating `ResearchLoadingOverlay` fullscreen variant
- Skill doc + agent team assignment

**Out of scope (stays unchanged):**
- `ResearchTheater` — intentional detailed multi-step view for `CompanyAssumptions`; keep
- `ResearchRefreshOverlay` — intentional full-screen takeover for bulk portfolio refresh; keep
- `ResearchLoadingOverlay` inline + compact variants — appropriate page-embedded contexts; keep
- `ScheduledResearchOverlay` — could be a follow-up migration; not in this plan
- Backend/API changes — zero server-side work required
- Per-specialist animation routing (e.g., `RebeccaOrb` for Rebecca jobs) — deferred; default `AnalystSwissCube` for all jobs initially

**Deferred:**
- Per-job animation selection UI in Admin (let admins choose the card animation per job type)
- Stacking multiple simultaneous cards (current: one card at a time; queue shows in header `ResearchQueueIndicator`)

---

## Context and Research

### Existing patterns to follow

| Pattern | File | What to inherit |
|---|---|---|
| Zustand store shape | `lib/panel-manager.ts` | `create<State>((set) => …)` skeleton, hydrate/reset pattern |
| Zustand store shape | `lib/research-queue.ts` | Concurrent-queue Zustand; shows how to track `active` item |
| `createPortal` usage | `components/company-assumptions/RangePillsLayer.tsx` line 53 | `createPortal(<element>, document.body)` pattern |
| Caption rotation hook | `components/research/ResearchLoadingOverlay.tsx` lines 28–43 | `useRotatingTip` and `RESEARCH_TIPS` array — extract to `lib/processing-captions.ts` |
| Elapsed timer hook | `components/research/ResearchLoadingOverlay.tsx` lines 282–306 | `useElapsedTimer` + `formatElapsed` — extract to same file |
| Animation: default | `components/agent-animations/AnalystSwissCube.tsx` | `<AnalystSwissCube size={40} />` |
| Reduced-motion fallback | `components/agent-animations/AgentThinkingState.tsx` lines 161–177 | `StaticAvatar` + `useReducedMotion` hook |
| Progress bar | `components/ui/progress.tsx` | Shadcn `Progress` component |
| Caption animation | `components/research/ResearchLoadingOverlay.tsx` lines 116–127 | `AnimatePresence mode="wait"` with `blur(4px)` / `x: 8` transition |
| Button cancel style | All `Dialog` cancel buttons in app | `variant="ghost" size="sm"` |
| Color tokens | `components/ui/ai-loader.tsx` | `accent-pop`, `bg-card`, `border-accent-pop/20` |
| Layout mount point | `components/Layout.tsx` lines 572–578 | Add alongside `CommandPalette` / `GuidedWalkthrough` |
| AbortController cancel | `components/property-research/useResearchStream.ts` | `abortRef.current.abort()` on cancel |

### Z-index ladder (do not violate)

| Z tier | Usage |
|---|---|
| `z-10` | Sticky headers |
| `z-40` | Mobile bottom nav |
| `z-[48/49/50]` | Rebecca Rail overlay/panel |
| `z-50` | Dialogs, Sheets (shadcn/Radix default) |
| **`z-[60]`** | **`AgentProcessingCard` — this plan** |
| `z-[100]` | Toast viewport |
| `z-[9997–9999]` | Guided walkthrough, ResearchRefreshOverlay |

### Design system (ce-frontend-design Module C — extending existing system)

**Visual thesis:** Compact, calm, authoritative. The card is a window into the
machine — it inherits the app's Swiss Modernist vocabulary. `bg-card` surface,
`border border-border/60`, `rounded-xl`, `shadow-xl backdrop-blur-sm`. The
`AnalystSwissCube` (monochrome) anchors the visual — suggesting precision and
calculation. Caption text is `text-sm text-foreground/80`. Progress bar uses
`accent-pop` on a muted track, consistent with `ai-loader.tsx` vocabulary.

**Content layout (top to bottom):**
1. Header row — `AnalystSwissCube` (40 × 40 px) left + title string right (e.g. "Analyst is working…")
2. Caption row — animated rotating text
3. Progress bar — full width
4. Footer row — elapsed time (left) + Cancel button (right)

**Interaction plan:**
1. Card entrance: `initial={{ opacity: 0, y: 16, scale: 0.95 }}` → `animate={{ opacity: 1, y: 0, scale: 1 }}`, `transition={{ duration: 0.25, ease: "easeOut" }}`
2. Caption cycle: `AnimatePresence mode="wait"` — `initial={{ opacity: 0, filter: "blur(4px)", x: 8 }}` → `animate={{ opacity: 1, filter: "blur(0px)", x: 0 }}` → `exit={{ opacity: 0, filter: "blur(4px)", x: -8 }}`, `transition={{ duration: 0.35 }}` (matches `ResearchLoadingOverlay` exactly)
3. Card exit: `exit={{ opacity: 0, y: 8, scale: 0.97 }}`, `transition={{ duration: 0.2 }}`

---

## Architecture Decisions

- **A1 — Global Zustand store, not React context.** `useProcessingCardStore` follows the `usePanelManager` pattern. Zustand avoids re-render cascades on progress-bar tick updates, is already the project standard for global UI state, and is easy to call from hooks outside the React tree.

- **A2 — `createPortal` to `document.body`.** `RangePillsLayer` already establishes this pattern. Portals guarantee escape from any `transform`, `filter`, or `overflow` stacking context that might trap a `fixed` element. Belt + suspenders: the component is also mounted at the end of the `Layout.tsx` root `div` (no isolated stacking context there), but the portal removes any ambiguity.

- **A3 — `z-[60]`.** Sits above dialogs/panels (z-50) and the Rebecca rail (z-[48/49/50]), below toasts (z-100) and the guided walkthrough (z-[9997+]). The card is informational during a job — it should never obscure destructive confirmation dialogs or system alerts.

- **A4 — `AnalystSwissCube` as universal default.** User-confirmed. All job types use it initially. The `animation` prop on the store accepts any React element, so callers can override with `<RebeccaOrb … />` or any other portfolio component in a follow-up without plan changes.

- **A5 — `onCancel` is a callback, not a store-level AbortController.** The card is job-agnostic. Research streams wire `onCancel → abortResearch()`. Slide factory could wire `onCancel → stopBuild()`. The card doesn't know or care which AbortController to reach.

- **A6 — Caption source is `captions[]` array or live `update({ caption })` calls, not SSE-only.** This keeps the card reusable for non-streaming jobs (document analysis returns a single status string; slide factory phases come from WebSocket). Callers choose the right pattern.

- **A7 — Card position: `fixed bottom-6 right-6`.** Matches the toast placement quadrant. Out of the primary workspace and form areas. The header `ResearchQueueIndicator` already lives in the top-right and shows queue depth; the card shows the *active job detail* in the bottom-right — complementary, not redundant.

---

## Implementation Units

### U1 — `useProcessingCardStore` (Zustand store)

**File:** `artifacts/hospitality-business-portal/src/lib/processing-card.ts`

**Shape:**

```ts
interface ProcessingCardJob {
  id: string;
  title: string;              // "Analyst is working…"
  captions: string[];         // rotates every 4 s
  caption?: string;           // live override (SSE phase updates)
  animation?: React.ReactNode; // defaults to <AnalystSwissCube size={40} />
  progress?: number;          // 0–100; undefined = indeterminate
  onCancel?: () => void;
}

interface ProcessingCardState {
  job: ProcessingCardJob | null;
  spawn: (job: ProcessingCardJob) => void;
  update: (patch: Partial<Pick<ProcessingCardJob, "caption" | "progress">>) => void;
  dismiss: () => void;
}
```

- `spawn` replaces any current job (one card at a time)
- `update` merges a patch into the current job (no-op if `job` is null)
- `dismiss` sets `job` to null

**Test scenarios:**
- spawn sets `job`; second spawn overwrites first
- update patches `caption` while keeping other fields
- update is a no-op when `job` is null (no throw)
- dismiss sets `job` to null
- dismiss is idempotent (second call is no-op)

---

### U2 — `AgentProcessingCard` component

**File:** `artifacts/hospitality-business-portal/src/components/ui/agent-processing-card.tsx`

**Behaviour:**
- Reads `job` from `useProcessingCardStore`
- When `job` is null, renders nothing (no DOM nodes)
- When `job` is non-null, renders via `createPortal` to `document.body`:

```
<AnimatePresence>          ← entrance/exit framer wrapper
  <div fixed bottom-6 right-6 z-[60] w-80 max-w-[90vw]>
    <Card rounded-xl shadow-xl backdrop-blur-sm border-border/60>
      <CardContent p-4 space-y-3>

        {/* Row 1: animation + title */}
        <div flex items-center gap-3>
          {reducedMotion ? <StaticMonogram /> : animation}
          <span text-sm font-medium text-foreground>{title}</span>
        </div>

        {/* Row 2: rotating caption */}
        <AnimatePresence mode="wait">
          <motion.p key={caption} blur-fade-transition
            text-sm text-muted-foreground aria-live="polite">
            {caption}
          </motion.p>
        </AnimatePresence>

        {/* Row 3: progress bar */}
        <Progress value={progress} className="h-1" />

        {/* Row 4: elapsed + cancel */}
        <div flex items-center justify-between>
          <span text-xs text-muted-foreground>{elapsed}</span>
          <Button variant="ghost" size="sm" onClick={handleCancel}>Cancel</Button>
        </div>

      </CardContent>
    </Card>
  </div>
</AnimatePresence>
```

**Internal hooks:**
- `useRotatingCaption(captions, liveCaption)` — rotates `captions[]` at 4 s interval; if `liveCaption` is set, shows it directly (no rotation)
- `useElapsedTimer(active)` + `formatElapsed(s)` — extracted from `ResearchLoadingOverlay`; shown after 5 s
- `useReducedMotion()` from `components/agent-animations/useReducedMotion.ts`
- `handleCancel` — calls `job.onCancel?.()` then `dismiss()`

**Test scenarios:**
- Renders nothing when `useProcessingCardStore.job` is null
- Renders card when `job` is non-null (snapshot or role check)
- Cancel button calls `onCancel` then `dismiss`
- Caption rotates after interval (fake timer)
- Live caption override suppresses rotation
- Progress bar shows indeterminate when `progress` is undefined
- Reduced-motion path: `StaticMonogram` rendered, no Framer Motion animation components
- `aria-live="polite"` present on caption element

---

### U3 — Mount in `Layout.tsx`

**File:** `artifacts/hospitality-business-portal/src/components/Layout.tsx`

**Change:** Add `<AgentProcessingCard />` at the end of the root `div`, alongside the existing `CommandPalette` / `GuidedWalkthrough` / `RebeccaPanel` cluster (lines 572–578).

```tsx
<CommandPalette />
<GuidedWalkthrough />
<GuidanceSideSheet />
{rebeccaEnabled && (
  <RebeccaPanel displayName={global?.rebeccaDisplayName || "Rebecca"} />
)}
<AgentProcessingCard />   {/* ← add here */}
```

No logic changes to `Layout.tsx` beyond this import + mount.

**Test scenarios:** n/a (visual integration — verified via screenshot).

---

### U4 — `useProcessingCard` convenience hook

**File:** `artifacts/hospitality-business-portal/src/hooks/useProcessingCard.ts`

Thin wrapper exposing `spawn`, `update`, `dismiss` from `useProcessingCardStore`.
Also exports the `ANALYST_CAPTIONS` constant (migrated from `RESEARCH_TIPS` in
`ResearchLoadingOverlay`) so callers don't import from an internal component.

```ts
export const ANALYST_CAPTIONS: string[] = [ … ]  // migrated from RESEARCH_TIPS

export function useProcessingCard() {
  const { spawn, update, dismiss } = useProcessingCardStore();
  return { spawn, update, dismiss, ANALYST_CAPTIONS };
}
```

**Test scenarios:** `spawn`, `update`, `dismiss` each delegate correctly to the store.

---

### U5 — Wire `AnalystButton`

**File:** `artifacts/hospitality-business-portal/src/components/intelligence/AnalystButton.tsx`

On job start: call `spawn({ id, title: "Analyst is working…", captions: ANALYST_CAPTIONS, onCancel: abortResearch })`.
On job complete or error: call `dismiss()`.

The existing inline "Studying…" label + `OrbitalDots` in the button itself stays — it
provides in-context feedback at the button. The card adds the global floating context.

**Test scenarios:**
- `spawn` called with correct args when `isGenerating` transitions false → true
- `dismiss` called when `isGenerating` transitions true → false (complete or error)
- `dismiss` called when component unmounts while `isGenerating` is true (cleanup)

---

### U6 — Wire research stream hooks

**Files:**
- `artifacts/hospitality-business-portal/src/components/property-research/useResearchStream.ts`
- `artifacts/hospitality-business-portal/src/components/company-research/useCompanyResearchStream.ts`

On each `phase` SSE event: call `store.update({ caption: phase })`.
On `done` event: call `store.dismiss()`.
On abort/error: call `store.dismiss()`.

The `onCancel` callback passed to `spawn` in U5 wires to `abortRef.current = new AbortController(); abortRef.current.abort()` (already the pattern in both hooks).

**Test scenarios (per hook):**
- `update({ caption })` called on each `phase` event
- `dismiss()` called on `done` event
- `dismiss()` called on fetch abort (AbortError)
- `dismiss()` called on non-abort error

---

### U7 — Skill doc

**File:** `.agents/skills/analyst-processing-card/SKILL.md`

Documents:
- When to use the card vs. inline `ResearchLoadingOverlay` compact/inline variants
- `spawn` / `update` / `dismiss` API with annotated examples
- Animation selection guide (which portfolio animation to pass for which job type)
- How to wire `onCancel` to an `AbortController`
- Captions: using `ANALYST_CAPTIONS` vs. custom array vs. SSE live updates
- What stays page-embedded (`ResearchTheater`, `ResearchRefreshOverlay`, inline/compact `ResearchLoadingOverlay`)

---

## Sequencing and Dependencies

```
U1 (store) ──► U2 (component) ──► U3 (Layout mount)
                                         │
                    U4 (hook) ◄──────────┘
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
     U5 (AnalystButton)    U6 (stream hooks)

U7 (skill doc) — no dependencies; write any time
```

Blocked sequence: U1 → U2 → U3 → U4 → U5/U6 (in that order).
U5 and U6 can be done in parallel once U4 is done.
U7 can be drafted as U1 is being written.

**Verification gates (run before marking done):**
- `pnpm run typecheck` clean
- `pnpm run check:lint:libs` clean
- `pnpm run check:magic-numbers` clean
- `pnpm run check:flex-label-overflow` clean
- `pnpm run check:ui-canonical` clean
- Screenshot: card visible, floating, above a dialog, cancel dismisses it

---

## Soft Deprecation Note for `ResearchLoadingOverlay`

Add to the `fullscreen` variant render path in `ResearchLoadingOverlay.tsx`:

```tsx
/**
 * @deprecated Use `useProcessingCard().spawn(…)` instead.
 * The floating `AgentProcessingCard` (z-[60], createPortal) replaces this variant.
 * Inline and compact variants remain valid for page-embedded contexts.
 */
```

Do **not** delete the component — it is still imported in `PropertyMarketResearch.tsx`
and `CompanyResearch.tsx`. Migration of those call sites is a follow-up task.

---

## Files Touched

```
NEW
  artifacts/hospitality-business-portal/src/lib/processing-card.ts
  artifacts/hospitality-business-portal/src/components/ui/agent-processing-card.tsx
  artifacts/hospitality-business-portal/src/hooks/useProcessingCard.ts
  .agents/skills/analyst-processing-card/SKILL.md

MODIFIED
  artifacts/hospitality-business-portal/src/components/Layout.tsx
  artifacts/hospitality-business-portal/src/components/intelligence/AnalystButton.tsx
  artifacts/hospitality-business-portal/src/components/property-research/useResearchStream.ts
  artifacts/hospitality-business-portal/src/components/company-research/useCompanyResearchStream.ts
  artifacts/hospitality-business-portal/src/components/research/ResearchLoadingOverlay.tsx  (deprecation comment only)

NO CHANGES (stays)
  lib/engine/  lib/calc/  lib/db/  api-server/src/finance/  api-server/src/report/
```

---

## Agent Team Assignment

This plan is **Replit-safe** — no engine, finance, DB schema, or API-server changes.
All work is frontend-only within `artifacts/hospitality-business-portal/src/`.

Assign to: **Replit** (implement U1 → U7 in sequence per the dependency graph above).

CC does not need to review or touch any of these files.
