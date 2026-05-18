**From:** Replit Agent
**To:** CC (Claude Code Shell)
**Date:** 2026-05-18
**Context:** 2 commits on `main` ahead of `origin/main` — not yet pushed
**Why this is a handoff:** Canvas mockup session complete; briefing CC before implementation begins

---

## Scope of work (what Replit just completed)

**Canvas mockup — `AgentProcessingCard` floating wait-state UI**

Built a fully interactive canvas mockup of the `AgentProcessingCard` component
(the floating Zustand-driven wait-state card described in the plan doc
`docs/plans/2026-05-18-001-feat-agent-processing-card-plan.md`).

The mockup lives at:

```
artifacts/mockup-sandbox/src/components/mockups/agent-processing-card/AgentProcessingCard.tsx
artifacts/mockup-sandbox/src/components/mockups/agent-processing-card/_group.css
```

Canvas shape ID: `agent-processing-card-mockup` (420 × 620 px iframe, live)

---

## Mockup design — approved by user

### Layout (top to bottom)

```
┌─────────────────────────────────────────────────┐
│  [dark stage #111009, full-width, 224px tall]    │
│         <RebeccaOrbit size={168} />              │
│          (all 3 orbital tracks visible)          │
├─────────────────────────────────────────────────┤
│  Analyst                                   [×]  │
│  Research in progress                           │
├─────────────────────────────────────────────────┤
│  Cross-referencing industry benchmarks…         │
│  ████████░░░░░░░░░░░  (amber progress bar)      │
├─────────────────────────────────────────────────┤
│  5s                                  [Cancel]   │
└─────────────────────────────────────────────────┘
```

### Key design decisions (user-approved)

| Decision | Detail |
|---|---|
| Animation zone | Full-width dark panel (`#111009`) — dedicated stage above card content so orbital rings + spark glow read at full contrast |
| Animation | `RebeccaOrbit` (`RebeccaSwissOrbit.tsx`) at 168 px — Swiss Orbit stone-palette beads on dark field |
| Animation in plan | Plan spec says `AnalystSwissCube` as default; user iterated to `RebeccaOrbit` on dark stage |
| Progress bar | Deterministic asymptotic curve: `90 × (1 − e^(−elapsed/22))` — surges fast, decelerates near 90%, never falsely hits 100% |
| Typography | IBM Plex Sans throughout: title 16px/600, description + caption + button 14px; JetBrains Mono 12px for elapsed timer |
| Card tokens | `bg-card`, `border border-border`, `rounded-xl` (12px), `shadow-sm` |
| Close button | Top-right of header row, 28×28 ghost, `border-radius: 6px` |
| Cancel button | Bottom-right footer, ghost style, 14px IBM Plex Sans |
| Elapsed timer | Appears after 5 s (asymptotic tick), bottom-left, JetBrains Mono 12px |
| Card entrance | `opacity 0→1 + y 18→0 + scale 0.95→1`, 0.28 s `[0.16,1,0.3,1]` easing |
| Caption rotation | `AnimatePresence mode="wait"`, blur/fade 0.35 s, cycles 9 captions at 4 s interval |

### Deviation from plan spec

The plan (R5 / A4) specified `AnalystSwissCube` as the default animation, rendered small
(40 × 40 px) in a side-by-side header row with the title. After user iteration:

- Animation occupies a dedicated full-width dark stage (not a side-by-side icon)
- `RebeccaOrbit` (168 px) is the mockup animation — but **the store's `animation` prop
  accepts any `React.ReactNode`** so the production default can be `AnalystSwissCube` or
  any other animation; the card layout (dedicated dark stage) stays the same
- Implementation should wire the animation zone to `job.animation ?? <DefaultAnimation />`

---

## Commits on main (not yet pushed to origin)

```
84749470c  Enhance animation display with more space and contrast
f6e8ea8a3  Improve progress bar accuracy and standardize font sizes
b6f193206  origin/main — Update default room count and animation component
```

---

## What comes next — U1–U7 implementation

The full implementation plan is at:
`docs/plans/2026-05-18-001-feat-agent-processing-card-plan.md`

**All U1–U7 units are Replit-safe** (frontend-only, no engine/finance/DB/API changes).
CC does not need to touch any of these files.

| Unit | File | Notes |
|---|---|---|
| U1 | `src/lib/processing-card.ts` | Zustand store — spawn/update/dismiss |
| U2 | `src/components/ui/agent-processing-card.tsx` | Component — use dark stage layout from mockup |
| U3 | `src/components/Layout.tsx` | Mount alongside CommandPalette / GuidedWalkthrough |
| U4 | `src/hooks/useProcessingCard.ts` | Thin wrapper + ANALYST_CAPTIONS export |
| U5 | `src/components/intelligence/AnalystButton.tsx` | Wire spawn/dismiss on job start/end |
| U6 | `useResearchStream.ts` + `useCompanyResearchStream.ts` | Wire update({ caption }) on phase events |
| U7 | `.agents/skills/analyst-processing-card/SKILL.md` | API docs (already exists as skeleton) |

Dependency chain: U1 → U2 → U3 → U4 → U5/U6 (parallel) · U7 any time

**Verification gates before marking done:**
- `pnpm run typecheck` clean
- `pnpm run check:lint:libs` clean
- `pnpm run check:magic-numbers` clean
- `pnpm run check:flex-label-overflow` clean
- `pnpm run check:ui-canonical` clean
- Screenshot: card floating above a page, cancel dismisses it

---

## Pre-existing failures (not introduced this session)

- `check:taxonomy-mirror` — pre-existing, CC-owned
- `test:api-server` — pre-existing (marco, dispatch, pptx-substitution, slide-6-embed-flow, builder-substitution-map)

---

## Files Replit owns right now

None — both commits are on `main`, working tree clean.
