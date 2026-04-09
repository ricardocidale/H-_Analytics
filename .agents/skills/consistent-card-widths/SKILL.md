---
name: consistent-card-widths
description: Card width and page layout container rules for HBG Portal. Covers max-width constraints, grid patterns, PageHeader alignment, and full-width vs constrained layouts. Use when building page layouts or card grids.
---

Rules for consistent card widths and page layout containers across all pages. Covers max-width constraints, grid patterns, PageHeader alignment, and when to use full-width vs constrained layouts.

## Multi-Column Default Rule

**Pages should use 2 or 3 column layouts by default.** Single-column pages are rare exceptions reserved only for narrow, focused workflows (e.g. a login form or a simple wizard). When building or modifying any page, always evaluate whether the content can be grouped into side-by-side columns at desktop widths.

| Content type | Preferred layout |
|---|---|
| Settings/profile forms with multiple card groups | `grid-cols-1 lg:grid-cols-3` (3 columns) |
| Dashboard / analytics with charts + summaries | `grid-cols-1 lg:grid-cols-2` or `lg:grid-cols-3` |
| Detail pages with related sidebar info | `grid-cols-1 lg:grid-cols-3` (main 2/3 + sidebar 1/3 via `lg:col-span-2`) |
| Admin tab list/card views | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` |
| Long sequential form (rare) | Single column `max-w-4xl` — only when fields depend on each other sequentially |

When a page currently uses a single column, ask: "Can these cards be logically grouped into 2–3 columns?" If yes, restructure. All multi-column grids must collapse to 1 column on mobile (`grid-cols-1`).

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

### 3. Multi-Column Settings Pages (`max-w-7xl mx-auto`)

Multiple card groups arranged in a responsive grid. Each column groups related settings.

**Examples:** `Profile.tsx` (3-column: Personal Info | Appearance + Theme | Password)

```tsx
<div className="max-w-7xl mx-auto space-y-6">
  <PageHeader ... />
  {/* Full-width banner cards above the grid (optional) */}
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div className="space-y-6">{/* Column 1 cards */}</div>
    <div className="space-y-6">{/* Column 2 cards */}</div>
    <div className="space-y-6">{/* Column 3 cards */}</div>
  </div>
</div>
```

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
| `client/src/pages/Profile.tsx` | `max-w-7xl mx-auto` 3-column grid |
| `client/src/pages/Admin.tsx` | Full-width admin shell |

## New Page Checklist

- [ ] **Default to multi-column** — evaluate whether content groups into 2 or 3 columns before choosing single-column
- [ ] Decide the width category based on content type
- [ ] Wrap content in `<div className="space-y-6 {max-w-class}">` inside `<Layout>` / `<AnimatedPage>`
- [ ] Place `<PageHeader>` as the first child **inside** the width wrapper
- [ ] Use `grid gap-6 lg:grid-cols-2` or `lg:grid-cols-3` for side-by-side card groups
- [ ] Ensure grid collapses to `grid-cols-1` on mobile
- [ ] Verify the page visually matches the width of other pages in the same category
