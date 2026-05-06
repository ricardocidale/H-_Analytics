---
title: "Refactor Admin Sidebar IA — Group Merge, Label Rename, Icon Deduplication"
date: 2026-05-06
status: completed
plan_type: refactor
origin: docs/solutions/design-patterns/admin-sidebar-navigation-design-2026-05-05.md
---

# Refactor Admin Sidebar IA — Group Merge, Label Rename, Icon Deduplication

## Problem Frame

The admin sidebar has two structural problems identified in the design audit:

1. **Icon duplication** — `reference-ranges` and `constants` both use `IconCalculator` within the same group; `All Scenarios` sub-item and the `"scenarios"` group header both use `IconScenarios`. Admins cannot distinguish items by glance.

2. **Unclear labels and false group separation** — "Steady State" is an opaque internal term. "Properties" and "Scenarios" are separate sidebar groups despite describing the same entity (a Property is the parent; a Scenario is a child).

The design doc at the origin path above specifies the target state. This plan implements it.

## Scope

**In scope:**
- Rename "Steady State" group → "Model Defaults", update icon
- Fix `reference-ranges` sub-item icon duplication
- Merge `"properties"` and `"scenarios"` groups into `"portfolio"`
- Fix `All Scenarios` sub-item icon duplication
- Update all Phosphor icon imports to match

**Out of scope:**
- Navigation routing logic, URL structure, or deep-link changes
- Any group other than `"financial-defaults"`, `"properties"`, and `"scenarios"`
- Backend changes

## Files

- `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx` — primary file. Changes are in `buildNavGroups()` and the Phosphor icon import block at the top of the file.
- `artifacts/hospitality-business-portal/src/components/icons/index.ts` — icon barrel. Add `IconGitFork` (and any other newly used Phosphor icons that need to be re-exported from this barrel) so consumers outside `AdminSidebar.tsx` can import them.
- `artifacts/hospitality-business-portal/src/components/icons/navigation-icons.tsx` — if `IconGitFork` is added to the barrel, ensure the underlying Phosphor import lives here per the existing icon-organization convention.

A clean-room implementation following only the AdminSidebar.tsx changes would miss the icon-barrel updates and break consumers; both the barrel and navigation-icons surfaces must be updated alongside `AdminSidebar.tsx`.

## Implementation Units

### U1 — Rename "Steady State" → "Model Defaults" and fix within-group icon duplication

**Goal:** The `"financial-defaults"` group label and icon are updated. The `reference-ranges` sub-item icon changes from the duplicate `IconCalculator` to `IconRuler`.

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx`

**Approach:**

In `buildNavGroups()`, locate the `"financial-defaults"` group object and make these changes:

| Field | Before | After |
|---|---|---|
| `label` | `"Steady State"` | `"Model Defaults"` |
| `icon` | `IconSliders` | `IconSlidersHorizontal` |
| `description` | (existing or absent) | `"Default values and constants applied to new entities and financial model"` |
| `reference-ranges` sub-item `icon` | `IconCalculator` | `IconRuler` |

In the Phosphor icon import block:
- Add `IconSlidersHorizontal` if not already imported (it is distinct from `IconSliders`)
- Add `IconRuler` if not already imported
- `IconSliders` may be removed if no longer referenced elsewhere after this change — verify before removing

**Patterns to follow:** Existing `buildNavGroups()` object structure in the same file.

**Verification:**
- [ ] `pnpm run typecheck` — clean (TypeScript confirms icon names are valid Phosphor exports)
- [ ] `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS (no numeric literals added)
- [ ] `pnpm --filter @workspace/hospitality-business-portal test` — no automated tests apply to sidebar nav structure (visual-only change); existing suite must remain green
- [ ] Visual: "Model Defaults" label appears in sidebar; `reference-ranges` row shows `IconRuler` not `IconCalculator`

---

### U2 — Merge Properties + Scenarios → Portfolio group

**Goal:** The two separate `"properties"` and `"scenarios"` group objects are replaced by a single `"portfolio"` group. The `All Scenarios` sub-item icon changes from the duplicate `IconScenarios` to `IconGitFork`.

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx`

**Approach:**

Replace the `"properties"` group object and the `"scenarios"` group object with a single `"portfolio"` entry:

```typescript
{
  id: "portfolio",
  label: "Portfolio",
  icon: IconBuildings,
  description: "Properties, scenarios, and default assignments",
  sections: [
    { value: "required-fields",     label: "Required Fields",     icon: IconFileCheck },
    { value: "property-heroes",     label: "Property Heroes",     icon: IconImage },
    { value: "scenarios",           label: "All Scenarios",       icon: IconGitFork },
    { value: "default-assignments", label: "Default Assignments", icon: IconUserCog },
  ],
}
```

Section `value` strings are unchanged — these are the `AdminSection` union discriminants. Only the group `id` changes from `"properties"` / `"scenarios"` to `"portfolio"`.

In the Phosphor icon import block:
- Add `IconBuildings`, `IconGitFork` if not already imported
- Remove `IconScenarios` and `IconProperties` (the old group-header icons) if they are no longer referenced after this change — grep the file to confirm before removing

**Check `SECTION_REDIRECTS`** — if the file defines a `SECTION_REDIRECTS` map keyed by group id (`"properties"`, `"scenarios"`), update those keys to `"portfolio"`. Section value strings are unaffected.

**Check for any URL or hash routing** — grep the file and `AiIntelligence.tsx` for `"properties"` and `"scenarios"` as literal strings to confirm no group-id-based deep links exist outside `buildNavGroups()`.

**Patterns to follow:** Existing group object shape; the Portfolio group above follows the same interface as all other groups.

**Verification:**
- [ ] `pnpm run typecheck` — clean (`AdminSection` union is derived from section `value` strings, which are unchanged; TypeScript will catch any broken references)
- [ ] `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- [ ] `pnpm --filter @workspace/hospitality-business-portal test` — no automated tests apply to sidebar nav structure (visual-only change); existing suite must remain green
- [ ] Visual: "Portfolio" group appears with Buildings icon; "Properties" and "Scenarios" groups are gone; all four sub-items render under Portfolio; "All Scenarios" shows GitFork icon

---

## Sequencing

U1 then U2, or parallel — no shared state. Either order is safe; U1 first reduces diff noise when reviewing U2.

## Risks and Notes

- **Phosphor import names**: `IconSlidersHorizontal` is a distinct export from `IconSliders`. Confirm the exact export name against the installed `@phosphor-icons/react` version before using. Similarly confirm `IconBuildings`, `IconGitFork`, `IconRuler`.
- **Group id change**: Any admin URL that deep-links to a group by id (`?group=properties`, `?group=scenarios`) would break. Grep the portal codebase for these strings as part of U2.
- **Flat-render groups**: "Users" and "Brand & Appearance" each have a single sub-item and render flat (no expand/collapse). The Portfolio merge does not affect this behavior.
- **No tests**: This is a pure structural/visual change with no behavioral logic. No test files exist for sidebar navigation structure and none need to be added.

## Test Scenarios

Not applicable — purely structural UI change. Verification is visual (dev server) plus typecheck.

## Definition of Done

- `pnpm run typecheck` clean on the portal package
- Magic numbers gate passes
- Dev server shows: "Model Defaults" label, Sliders icon, Reference Ranges with Ruler icon, single "Portfolio" group with Buildings icon containing all four sections, All Scenarios with GitFork icon
