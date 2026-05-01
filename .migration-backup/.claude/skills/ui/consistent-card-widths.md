# Consistent Card Widths

Rules for consistent card widths and page layout containers across all pages. Covers max-width constraints, grid patterns, PageHeader alignment, and when to use full-width vs constrained layouts.

**Related skills:** `design-system/` (visual identity), `ui/save-button-placement.md` (form interaction patterns), `settings/` (settings page layout)

---

## Problem

Pages historically used inconsistent `max-width` classes (`max-w-2xl`, `max-w-4xl`, `max-w-5xl`, or none), causing cards to render at different widths depending on the page. The rules below eliminate that drift.

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

The `space-y-6` div is the single source of vertical spacing between the PageHeader and content cards.

## Width Categories

### 1. Dashboard / Multi-Column Pages (full width — no `max-w-*`)

Pages that use side-by-side card grids should **not** apply a `max-w-*` class on the outer wrapper. The grid itself controls how wide each card grows.

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

Pages with a single column of form fields or stacked cards should cap width at `max-w-4xl` to keep line lengths readable.

**Examples:** `PropertyEdit.tsx`, `Settings.tsx`

```tsx
<div className="space-y-6 max-w-4xl">
  <PageHeader ... />
  <SectionCard ... />
</div>
```

### 3. Narrow Profile / Account Pages (`max-w-2xl mx-auto`)

Pages with minimal form content (profile, account settings) use `max-w-2xl mx-auto` to center a narrow column.

**Examples:** `Profile.tsx`

```tsx
<div className="max-w-2xl mx-auto p-0 sm:p-6 space-y-6 sm:space-y-8">
  <PageHeader ... />
  {/* profile form */}
</div>
```

### 4. Admin Tab Pages (full width, delegated to tab content)

The Admin shell itself uses `space-y-5` with no max-width. Individual tab components control their own internal layout and may use grids or constrained widths as needed.

**Example:** `Admin.tsx`

```tsx
<div className="space-y-5">
  <PageHeader ... />
  <div className="space-y-6">
    <SectionContent ... />
  </div>
</div>
```

## Key Rules

1. **PageHeader must sit inside the same width-constraining container as the content cards.** Never place PageHeader outside the `max-w-*` wrapper — it must align with the cards below it.

2. **Use `grid gap-6 lg:grid-cols-2` for side-by-side cards.** This is the standard two-column grid. Do not invent alternative column patterns unless the design explicitly requires it.

3. **Do not mix width categories on one page.** Pick one category above and apply it to the entire page wrapper.

4. **SectionCard and PageHeader carry no built-in width constraints.** They expand to fill their parent container, so the parent wrapper is solely responsible for width.

5. **Admin card styling uses constants from `styles.ts`.** Reference `ADMIN_CARD`, `ADMIN_LINK_CARD`, etc. from `client/src/components/admin/styles.ts` for admin-specific card variants.

## Key Files

| File | Role |
|------|------|
| `client/src/components/ui/page-header.tsx` | Shared page header component |
| `client/src/components/ui/section-card.tsx` | Collapsible section card component |
| `client/src/components/admin/styles.ts` | Admin card style constants (`ADMIN_CARD`, etc.) |
| `client/src/pages/CompanyAssumptions.tsx` | Example: full-width with `lg:grid-cols-2` grids |
| `client/src/pages/PropertyEdit.tsx` | Example: `max-w-4xl` single-column form |
| `client/src/pages/Settings.tsx` | Example: `max-w-4xl` single-column form |
| `client/src/pages/Profile.tsx` | Example: `max-w-2xl mx-auto` narrow column |
| `client/src/pages/Admin.tsx` | Example: full-width admin shell with delegated tab content |

## New Page Checklist

- [ ] Decide the width category (full-width, `max-w-4xl`, or `max-w-2xl mx-auto`) based on content type
- [ ] Wrap content in `<div className="space-y-6 {max-w-class}">` inside `<Layout>` / `<AnimatedPage>`
- [ ] Place `<PageHeader>` as the first child **inside** the width wrapper
- [ ] Use `grid gap-6 lg:grid-cols-2` for any side-by-side card pairs
- [ ] Verify the page visually matches the width of other pages in the same category
- [ ] If adding an admin tab, use style constants from `client/src/components/admin/styles.ts`
