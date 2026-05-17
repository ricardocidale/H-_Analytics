---
title: "Move Animations to Intelligence / Knowledge & Resources — Rebecca + Analyst tabs"
date: 2026-05-16
status: active
plan_depth: standard
---

# Move Animations to Intelligence / Knowledge & Resources — Rebecca + Analyst tabs

## Problem Frame

The Animations panel currently lives inside the Admin section under Brand Assets (a sub-tab of `BrandAssetsPage`). Animations are agent-centric content, not brand configuration — they belong in the AI Intelligence section where agents are managed and explored.

The user also supplied a set of new advanced animation components for Rebecca and wants the page to be the canonical home for all agent persona animations, split between two agents via a horizontal tab menu.

## Scope

**In scope:**
- Add `"animations"` nav entry to Intelligence sidebar under **Knowledge & Resources**
- Create `src/pages/intelligence/AnimationsPage.tsx` with `CurrentThemeTab` (two tabs: Rebecca, The Analyst)
- Add `RebeccaAdvancedOrbit` (and any other components from the attached file) to `src/components/agent-animations/`
- Wire the new page into `Intelligence.tsx` (lazy import, `sectionMeta`, section switch)
- Remove Animations from its Admin home (`BrandAssetsPage.tsx` — drop the `animations` sub-tab)
- Adapt `motion/react` imports in any new components to `framer-motion` (the library already installed)

**Out of scope:**
- Deleting `AnimationsTab.tsx` immediately — it is refactored into a named panel component; the file may be cleaned up separately
- Adding new Analyst animations beyond what already exists (`HplusLogoAnimated`, `AnalystCubeIcon`, `GustavoOrb`)
- Any backend or API changes

## Key Decisions (with rationale)

| Decision | Choice | Rationale |
|---|---|---|
| Tab library | `CurrentThemeTab` (not Radix) | Project convention established 2026-05-16. All new horizontal tab menus must use `CurrentThemeTab` from `@/components/ui/tabs`. |
| Tab content split | Rebecca tab: `RebeccaOrb` + new `RebeccaAdvancedOrbit`. Analyst tab: `HplusLogoAnimated`, `AnalystCubeIcon`, `GustavoOrb` | Rebecca-themed persona animations belong on her tab. Brand/cube/Analyst orb are Gustavo-associated. |
| Motion library | `framer-motion` (existing install) | `motion/react` is the new unified export of the same library (motion v11+). Repo installs `framer-motion` via catalog. Adapt new component imports to `framer-motion` to avoid a dependency change. |
| `AnimationsTab.tsx` fate | Extract reusable content into `AnalystAnimationsPanel.tsx`, keep original as thin compatibility shim until all references are gone | Avoids `Intelligence.tsx` importing from `components/admin/`. |
| Admin removal target | `BrandAssetsPage.tsx` (not `AdminSidebar.tsx`) | Animations is a sub-tab of `BrandAssetsPage`; AdminSidebar has no direct reference. |

## Implementation Units

### Phase 1 — New animation components

**1A. `RebeccaAdvancedOrbit.tsx`**
- File: `artifacts/hospitality-business-portal/src/components/agent-animations/RebeccaAdvancedOrbit.tsx`
- Source: attached `Rebecca-Components_1778957582735.md` (the `RebeccaAdvancedOrbit` block)
- Adapt import: change `from 'motion/react'` → `from 'framer-motion'`
- Export named: `export function RebeccaOrbitAdvanced(...)` (keep name as in source)
- Also export `REBECCA_ORBIT_ADVANCED_META` const

**1B. Any additional components from the attached file**
- Read the full attached markdown for additional component blocks beyond `RebeccaAdvancedOrbit`
- Each block that names a new `.tsx` file gets its own file under `src/components/agent-animations/`
- Same `framer-motion` import adaptation applies

**1C. Barrel export update**
- File: `artifacts/hospitality-business-portal/src/components/agent-animations/index.ts` (create if not present)
- Add named exports for all new components

### Phase 2 — Intelligence nav + routing

**2A. `IntelligenceSidebar.tsx`**
- Add `"animations"` to the `IntelligenceSection` union type
- Add a nav entry inside the `"knowledge-resources"` group:
  ```ts
  {
    value: "animations",
    label: "Animations",
    icon: IconWand2,  // or IconActivity — whichever reads best; check existing group icons
    tooltip: "Agent persona animations and motion assets for Rebecca and The Analyst.",
  }
  ```

**2B. `Intelligence.tsx`**
- Add `"animations"` to the `sectionMeta` record:
  ```ts
  "animations": { title: "Animations", subtitle: "Agent persona animations and motion assets — Rebecca and The Analyst" },
  ```
- Add lazy import:
  ```ts
  const AnimationsPage = lazy(() => import("@/pages/intelligence/AnimationsPage"));
  ```
- Add case in the section render switch/conditional: `section === "animations" && <AnimationsPage />`
- No `VALID_SECTIONS` array found — if one exists, add `"animations"` to it

### Phase 3 — New AnimationsPage

**File: `artifacts/hospitality-business-portal/src/pages/intelligence/AnimationsPage.tsx`**

Structure:
```tsx
// Two tabs: "rebecca" and "analyst"
// Uses CurrentThemeTab (mandatory convention)
const TABS: CurrentThemeTabItem[] = [
  { value: "rebecca", label: "Rebecca" },
  { value: "analyst", label: "The Analyst" },
];

// Rebecca tab content:
//   - RebeccaOrb at multiple phases (idle, thinking, synthesizing) for comparison
//   - RebeccaOrbitAdvanced (the new Deep Thinking Orbital)
//   Each shown in a card grid matching AnimationsTab's existing card layout

// Analyst tab content:
//   - GustavoOrb at multiple phases
//   - HplusLogoAnimated
//   - AnalystCubeIcon
//   These migrate from the existing AnimationsTab card data

// Play/pause toggle state: same pattern as AnimationsTab.playingIds (Set<string>)
```

Do **not** import from `components/admin/AnimationsTab` — copy the card render pattern inline or extract a shared `AnimationCard` component.

Card UI pattern to preserve from `AnimationsTab.tsx`:
- `Card` with a preview area (`bg-muted/40`, `min-h-[180px]`, centered content)
- `CardContent` with name, description, and Play/Pause `Button`
- `flex items-start justify-between gap-3` layout with `min-w-0` on text block, `shrink-0` on button

### Phase 4 — Remove from Admin

**`BrandAssetsPage.tsx`**
- Remove the `"animations"` entry from the `BrandAssetsSubTab` type
- Remove the `AnimationsTab` lazy import
- Remove the `animations` tab from the `CurrentThemeTab` tabs array
- Remove the `{activeTab === "animations" && <AnimationsTab />}` conditional render
- If `BrandAssetsSubTab` only has one remaining value after removal, remove the tab bar entirely and render the remaining content directly

## File Map

| Action | File |
|---|---|
| CREATE | `artifacts/hospitality-business-portal/src/components/agent-animations/RebeccaAdvancedOrbit.tsx` |
| CREATE (if more components in attached file) | `artifacts/hospitality-business-portal/src/components/agent-animations/<Name>.tsx` |
| CREATE or EDIT | `artifacts/hospitality-business-portal/src/components/agent-animations/index.ts` |
| CREATE | `artifacts/hospitality-business-portal/src/pages/intelligence/AnimationsPage.tsx` |
| EDIT | `artifacts/hospitality-business-portal/src/components/intelligence/IntelligenceSidebar.tsx` |
| EDIT | `artifacts/hospitality-business-portal/src/pages/Intelligence.tsx` |
| EDIT | `artifacts/hospitality-business-portal/src/components/admin/BrandAssetsPage.tsx` |
| KEEP (refactor later) | `artifacts/hospitality-business-portal/src/components/admin/AnimationsTab.tsx` |

## Sequencing

```
Phase 1 (new components) → Phase 2 (nav wiring) → Phase 3 (page) → Phase 4 (admin cleanup)
```

Phases 1 and 2 can run in parallel. Phase 3 depends on both. Phase 4 is independent of Phase 3 and can run in parallel with it, but running it last reduces risk of a broken state between removal and the new page going live.

## Risks & Gotchas

1. **`motion/react` vs `framer-motion`**: New components use `motion/react` (the v11 unified package). The repo has `framer-motion` in the catalog. These are the same underlying library — swap the import string only. Do not run `pnpm add motion`; that would introduce a duplicate.

2. **Fragment wrappers**: `AnimationsPage.tsx` tabs likely have multiple root elements (description paragraph + card grid). Wrap multi-root tab content in `<>…</>`.

3. **`BrandAssetsSubTab` after removal**: If Animations is the only non-logo sub-tab, removing it may leave `BrandAssetsPage` with only one tab, making the tab bar redundant. Check how many tabs remain and simplify accordingly.

4. **Deep-link backward compat**: There is no existing URL deep-link for `?section=animations` in admin, so no redirect is needed. Only the new `?section=animations` in Intelligence needs to work.

5. **`AgentThinkingState.tsx` usage**: The new `AnimationsPage` Rebecca tab should ideally demonstrate the orb in context — consider showing `RebeccaOrb` at a fixed `phase="thinking"` display rather than requiring a live agent connection. Static phase props are sufficient for the showcase page.

6. **Icon choice**: `IconWand2` is already used for Iris in the sidebar. Choose a distinct icon — `IconActivity`, `IconPlay`, or a Sparkles icon — to avoid visual duplication in the nav group.

## Validation Checklist

- [ ] `pnpm run typecheck` — all packages green
- [ ] `pnpm run check:lint` — portal lint clean (pre-existing `rebecca-tool-impls` failure is CC-owned, ignore)
- [ ] `pnpm run check:flex-label-overflow` — baseline ≤ 177
- [ ] Navigate to `/intelligence?section=animations` — page loads, both tabs render, play/pause works
- [ ] Navigate to Admin → Brand Assets — Animations sub-tab is gone
- [ ] `RebeccaOrbitAdvanced` renders without errors in the Rebecca tab
