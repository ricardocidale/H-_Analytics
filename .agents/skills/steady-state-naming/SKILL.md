---
name: steady-state-naming
description: Use whenever you create, modify, or review a sidebar label, nav group, menu item, or user-facing copy that references the admin "Defaults" sidebar group. The canonical user-facing name for this admin sidebar group is "Model Defaults" — never "Financial Defaults", never "Defaults" alone, never "Steady State" (the prior name, retired 2026-05-13). Applies to `AdminSidebar.tsx` and any new menu/nav copy that points at the same group. Does NOT apply to internal `id`s, route slugs, file paths, in-page card section titles, or the `AddPropertyDialog` "Country & Financial Defaults" heading.
---

# Model Defaults — Canonical Sidebar Name

## The rule (non-negotiable)

The admin sidebar nav group whose internal `id` is `financial-defaults` MUST display to the user as **`Model Defaults`**. Nothing else. Not "Financial Defaults", not "Defaults", not "Steady State", not "Steady-State Defaults", not "Model Defaults & Constants".

This applies to:

- The `label` field on the nav group in `client/src/components/admin/AdminSidebar.tsx`.
- Any new menu, breadcrumb, page header, error toast, or nav copy that names the same group.
- Any cross-app deep-link label (e.g. specialist-nav targets that say "Open … — Constants").

## Why

The user has chosen "Model Defaults" as the canonical name for this surface and wants it locked in so it does not regress. The prior name "Steady State" is retired as of 2026-05-13 — see commit history. "Financial Defaults" was the pre-Steady-State name and is also retired. Keeping the name consistent across the sidebar and any future nav copy preserves the singular voice of the admin UI.

## How to comply

### Where the label lives
- **File:** `client/src/components/admin/AdminSidebar.tsx`
- **Field:** the `label` on the nav group whose `id` is `"financial-defaults"`.
- The internal `id` stays `"financial-defaults"` — only the user-visible `label` is renamed.

### What to rename when you see "Steady State" or "Financial Defaults" in a sidebar / nav context
- Sidebar group label → `Model Defaults`.
- Any new top-level menu item, breadcrumb, page header, or deep-link label pointing at this group → `Model Defaults`.
- Error toasts and inline help text that reference the admin path → `Admin → Model Defaults → …`.

### What NOT to rename
Leave these alone — they are deliberately out of scope:

- The internal `id: "financial-defaults"` on the nav group. Internal ids stay stable.
- Route slugs, query params, and file paths that contain `financial-defaults`, `financial_defaults`, or `steady-state`.
- The `STEADY-STATE.md` architecture doc filename — it is a historical document reference, not user-facing.
- The in-page card section title `"Financial Defaults"` inside `client/src/components/admin/model-defaults/CompanyTab.tsx` (if still present) — that's a card section, not a menu item.
- The `"Country & Financial Defaults"` heading inside `client/src/components/portfolio/AddPropertyDialog.tsx` — different surface, different meaning.
- Historical references in `docs/plans/archive/**` and committed migration SQL comments.

## Quick checklist before committing a sidebar/nav change in this area

1. Sidebar group with `id: "financial-defaults"` has `label: "Model Defaults"`. ✅
2. No new user-facing menu / breadcrumb / page-level nav copy says "Financial Defaults" or "Steady State". ✅
3. Internal `id`, route slugs, file paths, and the in-page `CompanyTab` / `AddPropertyDialog` headings are untouched. ✅

## Naming history

| Date | Canonical name | Notes |
|---|---|---|
| (initial) | Financial Defaults | Original implementation framing — retired |
| (mid) | Steady State | User-chosen rename — retired 2026-05-13 |
| 2026-05-13 | **Model Defaults** | Current canonical name |
