**From:** Replit Agent
**To:** CC (Claude Code shell)
**Date:** 2026-05-17
**Context:** Plan 2026-05-16-003 — Animations feature move
**Why this is a handoff:** Session boundary; CC resumes ownership of api-server lint + test failures

---

## What was done

The Animations section has been moved from Admin → Brand Assets into the AI Intelligence
sidebar under Knowledge & Resources. This is a pure front-end change — no new routes,
no DB changes, no api-server edits.

### Commits on main (not yet pushed to origin)

```
db98627ca  fix(db): re-enable login screen          ← Task #1684 (separate)
c9e2fb797  Update animation component types         ← TS fix on RebeccaAdvancedOrbit
97a7e3856  feat(intelligence): move Animations...   ← main feature commit
ddb781242  Add new animation components (Analyst)   ← 6 Analyst cube components
30619a79c  Add new animation components (Rebecca)   ← 6 Rebecca components
```

All 5 commits are on `main`, ahead of `origin/main`. Push when ready.

---

## What changed

### Deleted
- `artifacts/hospitality-business-portal/src/components/admin/AnimationsTab.tsx`
  — no longer referenced anywhere; animations now live in Intelligence

### Modified
- `artifacts/hospitality-business-portal/src/components/admin/BrandAssetsPage.tsx`
  — removed the `"animations"` sub-tab; now has 2 tabs only (Logos, Brand Assets)
- `artifacts/hospitality-business-portal/src/components/intelligence/IntelligenceSidebar.tsx`
  — added `"animations"` to `IntelligenceSection` union; added nav entry to
    Knowledge & Resources group with `IconSparkles`
- `artifacts/hospitality-business-portal/src/pages/Intelligence.tsx`
  — lazy import for `AnimationsPage`, entry in `sectionMeta`, case in `SectionContent`
    switch, added `"animations"` to `VALID_SECTIONS`
- `artifacts/hospitality-business-portal/src/components/agent-animations/index.ts`
  — barrel updated with all 12 new exports (6 Rebecca + 6 Analyst)
- `artifacts/hospitality-business-portal/src/components/agent-animations/RebeccaAdvancedOrbit.tsx`
  — imported `TargetAndTransition` and `Transition` from framer-motion; typed
    `animateObj` and `transitionObj` correctly (pre-existing TS error, now fixed)

### New files
```
src/components/agent-animations/
  RebeccaAliveGeometry.tsx       ← 12-instance merged Lascaux + geo orbital entity
  AnalystBarChartPulse.tsx       ← isometric 3×3 bar chart scene animation
  AnalystExpandingSolver.tsx     ← 3×3×3 cube that explodes apart while rotating
  AnalystNexusCore.tsx           ← four morphing colored blocks, shape-shifting nexus
  AnalystQuantumSolver.tsx       ← compact 3×3×3 cube with face rotations
  AnalystSwissCube.tsx           ← monochrome cube expanding/contracting
  AnalystThinkingCube.tsx        ← 9 distinct scene transitions, spring physics

src/pages/intelligence/
  AnimationsPage.tsx             ← two-tab page: "Rebecca" (7 cards) + "The Analyst" (8 cards)
                                    Play/pause per card, CurrentThemeTab, lazy-mounted
```

All new animation components use `framer-motion` (not `motion/react` — same v12 package,
different import path; framer-motion is the catalog pin).

---

## Pre-existing failures CC should be aware of

These were failing **before** this session and are **not caused by** Replit's changes:

### check:lint — `@typescript-eslint/no-shadow`
File: `artifacts/api-server/src/chat/rebecca-tool-impls-slide-factory.ts`
Lines: 91, 107, 130, 169, 233, 275, 309, 355, 384, 411, 486, 523, 563 (21 errors total)
Root cause: destructured `getSlideFactoryRun` and `updateSlideFactoryRun` inside
nested closures shadow the outer-scope imports.
Fix: rename inner destructured vars (e.g. `getSlideFactoryRun: _getSlideFactoryRun`)
or restructure so the inner closures reuse the outer imports directly.

### test:api-server
Failing suites (all pre-existing, all CC-owned):
- `src/tests/marco.test.ts` — 6 failures: `runMarco` call-count assertions
- `src/tests/slides/builder-substitution-map.test.ts` — 5 failures: substitution entry
  counts don't match (slide 1, 3, 6 builders)
- `src/tests/ai/dispatch.test.ts` — `stream.finalMessage is not a function` (mock gap)
- `src/tests/slides/pptx-substitution.test.ts` — 2 timeouts (fixture-dependent)
- `src/tests/integration/slide-6-embed-flow.test.ts` — substitution flow assertion

---

## Nothing required from CC for the animations feature

The feature is complete and gated. CC does not need to add any routes, types, or
api-server logic for the animations page — it is entirely static front-end.

---

## Outstanding Replit UI backlog (unchanged, for CC awareness)

CC previously noted these as "on Replit's plate" — they remain unstarted:

| ID | Task |
|---|---|
| T2-4 | "Verify deck" button in Slide Factory tab 6 — `POST /api/slide-factory-runs/:id/verify` |
| T2-3 | "Improve with AI" button on `descriptionImproved` textarea in `BasicInfoSection.tsx` |
| T2-2 | Portfolio selector on property list — `GET /api/portfolios`, `PUT /api/properties/:id/portfolio` |
