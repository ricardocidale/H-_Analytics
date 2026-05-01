---
name: steady-state-naming
description: Use whenever you create, modify, or review a sidebar label, nav group, menu item, or user-facing copy that references "Financial Defaults" in the admin surface. The canonical user-facing name for this admin sidebar group is "Steady State" — never "Financial Defaults", never "Defaults", never "Model Defaults". Applies to `AdminSidebar.tsx`, the locked-in sidebar structure test, and any new menu/nav copy that points at the same group. Does NOT apply to internal `id`s, route slugs, file paths, in-page card section titles, or the `AddPropertyDialog` "Country & Financial Defaults" heading.
---

# Steady State — Canonical Sidebar Name

## The rule (non-negotiable)

The admin sidebar nav group whose internal `id` is `financial-defaults` MUST display to the user as **`Steady State`**. Nothing else. Not "Financial Defaults", not "Defaults", not "Model Defaults", not "Steady-State Defaults".

This applies to:

- The `label` field on the nav group in `client/src/components/admin/AdminSidebar.tsx`.
- Any new menu, breadcrumb, page header, or nav copy that names the same group.
- The locked-in structure test that asserts the sidebar shape.

## Why

The user has chosen "Steady State" as the canonical name for this surface and wants it locked in so it does not regress. "Financial Defaults" leaks the implementation framing (a bag of default values) instead of the user-facing concept (the steady-state operating model). Keeping the name consistent across the sidebar and any future nav copy preserves the singular voice of the admin UI.

## How to comply

### Where the label lives
- **File:** `client/src/components/admin/AdminSidebar.tsx`
- **Field:** the `label` on the nav group whose `id` is `"financial-defaults"`.
- **Locked-in test:** `tests/client/admin-sidebar-structure.test.ts` asserts `label: "Steady State"` for that group. If you change the label, update the test in lockstep.

### What to rename when you see "Financial Defaults" in a sidebar / nav context
- Sidebar group label → `Steady State`.
- Any new top-level menu item, breadcrumb, or page header pointing at this group → `Steady State`.

### What NOT to rename
Leave these alone — they are deliberately out of scope:

- The internal `id: "financial-defaults"` on the nav group. Internal ids stay stable.
- Route slugs, query params, and file paths that contain `financial-defaults` or `financial_defaults`.
- The doc header / comments in `shared/constants.ts`.
- The in-page card section title `"Financial Defaults"` inside `client/src/components/admin/model-defaults/CompanyTab.tsx` — that's a card section, not a menu item.
- The `"Country & Financial Defaults"` heading inside `client/src/components/portfolio/AddPropertyDialog.tsx` — different surface, different meaning.
- Historical references in `docs/planning/MASTER-PLAN.md`.

## Quick checklist before committing a sidebar/nav change in this area

1. Sidebar group with `id: "financial-defaults"` has `label: "Steady State"`. ✅
2. `tests/client/admin-sidebar-structure.test.ts` expects `label: "Steady State"` and passes. ✅
3. No new user-facing menu / breadcrumb / page-level nav copy says "Financial Defaults". ✅
4. Internal `id`, route slugs, file paths, and the in-page `CompanyTab` / `AddPropertyDialog` headings are untouched. ✅
