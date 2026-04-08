---
name: consistent-card-widths
description: Card width and page layout container rules for HBG Portal. Covers max-width constraints, grid patterns, PageHeader alignment, and full-width vs constrained layouts. Use when building page layouts or card grids.
---

Rules for consistent card widths and page layout containers across all pages. Covers max-width constraints, grid patterns, PageHeader alignment, and when to use full-width vs constrained layouts.

## Standard Page Content Wrapper

Every page wraps its content in a `space-y-6` container inside `<Layout>` and `<AnimatedPage>`:

```tsx
<Layout>
  <AnimatedPage>
    <div className="space-y-6">
      <PageHeader ... />
      {/* content cards / grids */}
    </div>
  </AnimatedPage>
</Layout>
```

## Width Categories

### 1. Dashboard / Multi-Column Pages (full width — no `max-w-*`)

Pages using side-by-side card grids should **not** apply a `max-w-*` class on the outer wrapper.

**Examples:** `CompanyAssumptions.tsx`, `Admin.tsx`

```tsx
<div className="space-y-6">
  <PageHeader ... />
  <div className="grid gap-6 lg:grid-cols-2">
    <SectionCard ... />
    <SectionCard ... />
  </div>
</div>
```

### 2. Form / Single-Column Detail Pages (`max-w-4xl`)

Single column of form fields or stacked cards. Caps width for readable line lengths.

**Examples:** `PropertyEdit.tsx`, `Settings.tsx`

```tsx
<div className="space-y-6 max-w-4xl">
  <PageHeader ... />
  <SectionCard ... />
</div>
```

### 3. Narrow Profile / Account Pages (`max-w-2xl mx-auto`)

Minimal form content, centered narrow column.

**Examples:** `Profile.tsx`

### 4. Admin Tab Pages (full width, delegated to tab content)

Admin shell uses `space-y-5` with no max-width. Individual tab components control their own layout.

## Responsive Multi-Column List Grid Pattern

Admin list/card views (e.g. the Users tab) use a **3-column responsive grid** as the standard:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
  {items.map(item => <Card key={item.id} ... />)}
</div>
```

When the list has **section header dividers** (e.g. sorted by Company or Group), the divider row must span all active columns:

```tsx
<div className="col-span-1 md:col-span-2 lg:col-span-3 py-1.5 px-4">
  {/* section label with decorative rule lines */}
</div>
```

| Breakpoint | Columns |
|------------|---------|
| `sm` (default) | 1 |
| `md` | 2 |
| `lg+` | 3 |

Use this pattern for any admin tab that renders a flat list of entity cards.

## Key Rules

1. **PageHeader must sit inside the same width-constraining container as the content cards.** Never place PageHeader outside the `max-w-*` wrapper.
2. **Use `grid gap-6 lg:grid-cols-2` for side-by-side cards.** Standard two-column grid pattern.
3. **Use `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3` for admin list/card views.** Standard three-column responsive grid for entity lists.
4. **Do not mix width categories on one page.** Pick one category for the entire page wrapper.
5. **SectionCard and PageHeader carry no built-in width constraints.** Parent wrapper is solely responsible.
6. **Admin card styling uses constants from `styles.ts`.** Reference `ADMIN_CARD`, `ADMIN_LINK_CARD` from `client/src/components/admin/styles.ts`.

## Key Files

| File | Role |
|------|------|
| `client/src/components/ui/page-header.tsx` | Shared page header component |
| `client/src/components/ui/section-card.tsx` | Collapsible section card component |
| `client/src/components/admin/styles.ts` | Admin card style constants |
| `client/src/pages/CompanyAssumptions.tsx` | Full-width with `lg:grid-cols-2` grids |
| `client/src/pages/PropertyEdit.tsx` | `max-w-4xl` single-column form |
| `client/src/pages/Settings.tsx` | `max-w-4xl` single-column form |
| `client/src/pages/Profile.tsx` | `max-w-2xl mx-auto` narrow column |
| `client/src/pages/Admin.tsx` | Full-width admin shell |

## New Page Checklist

- [ ] Decide the width category based on content type
- [ ] Wrap content in `<div className="space-y-6 {max-w-class}">` inside `<Layout>` / `<AnimatedPage>`
- [ ] Place `<PageHeader>` as the first child **inside** the width wrapper
- [ ] Use `grid gap-6 lg:grid-cols-2` for any side-by-side card pairs
- [ ] Verify the page visually matches the width of other pages in the same category
