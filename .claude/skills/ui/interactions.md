---
name: interactions
description: Interactive analysis components — What-If sliders, Variance Analysis, Guided Walkthrough, Inline Editing. Use when building interactive financial tools.
theme: light-cream / inherit
---

# Interactive Components

## What-If Slider Panel
Adjustable sliders for key assumptions with real-time projection updates.

- **File**: `client/src/components/WhatIfPanel.tsx`
- **Placement**: Collapsible side panel on property/portfolio pages
- **Sliders**: ADR Growth (0-10%), Occupancy (40-100%), Cost Escalation (0-8%), Cap Rate (3-12%), LTV (0-80%), Interest Rate (2-10%)
- **Behavior**: Debounced 150ms recalculation, Reset button, Save as Scenario button
- **Slider styling**: Uses shared `Slider` from `@/components/ui/slider` — track `h-2 bg-gray-200/80`, range gradient `from-[#9FBCA4] to-[#85a88b]`, thumb `h-5 w-5 bg-white border-[#9FBCA4]` with hover/active scale animations
- **Value display**: `font-mono tabular-nums` for aligned numeric readouts

---

## Variance Analysis
Side-by-side comparison of two scenarios with variance highlighting.

- **File**: `client/src/components/VarianceAnalysis.tsx`
- **Layout**: Scenario A/B selectors, table with Metric | A | B | Variance ($) | Variance (%)
- **Colors**: Favorable (higher revenue / lower costs) = `accent`, Unfavorable = `destructive`, Immaterial (<1%) = `muted-foreground`
- **Metrics**: Revenue, GOP, NOI, FCF, IRR, DSCR, Occupancy, ADR, Debt Service, Cap Rate

---

## Guided Walkthrough
Step-by-step interactive tour explaining the recommended workflow for new users.

**Full reference:** `.claude/skills/tour/SKILL.md` and `.claude/tools/ui/tour-steps.json`

- **File**: `client/src/components/GuidedWalkthrough.tsx`
- **9 steps**: Welcome → Properties → Company → Assumptions → Scenarios → Analysis → Help → Search → Notifications
- **Store**: `useWalkthroughStore` (Zustand, localStorage `walkthrough-store`) — fields: `shownThisSession`, `tourActive`, `promptVisible`
- **API**: `PATCH /api/profile/tour-prompt` with `{ hide: boolean }` persists "Do not show again"
- **Rebecca gating**: Chat panel hidden when `tourActive || promptVisible`
- **Restartable**: Help page → Guided Tour tab

---

## Inline Cell Editing
Click any editable cell in a financial table to modify directly with instant recalculation.

- **File**: Extends `FinancialTable` component with `editable` prop
- **Editable**: Assumption inputs (ADR, occupancy, growth rates, cost rates)
- **Read-Only**: Calculated outputs (revenue, NOI, FCF, totals)
- **States**: Default → Hover (`bg-accent/5` + pencil) → Editing (`ring-2 ring-accent`) → Changed (`bg-amber-50` dot) → Saved (green flash)
- **Integration**: Optimistic updates via TanStack Query, debounced 300ms save
