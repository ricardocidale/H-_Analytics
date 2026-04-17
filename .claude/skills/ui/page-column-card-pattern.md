# Page Column Card Pattern (Outer Card → Inner Cards)

**Audience:** all AI coders working on user-facing pages in this app
**Priority:** high — visual consistency rule
**Trigger:** any time you build, edit, split, or reorder a page that has multiple columns of stacked sections (Company Assumptions, Property Edit, Property Detail, Admin sub-pages, Settings sub-pages, etc.)

---

## The rule (one sentence)

**Every page column is one outer card, and every sub-section inside that column is its own inner Card with the same header shape (icon + title + description) — no bare `h3` sections, no mixing of "card" and "no-card" sub-sections within the same column.**

This rule is what makes column 1 and column 2 read as peers. Mixing inner cards with bare headings inside the same column makes the page look broken even when the logic is right.

---

## The shape

```
Page (2-col grid)
├── Column 1 — outer wrapper (rounded-lg, p-6, bg-card, border, shadow-sm)
│   ├── Outer title: <h2 class="text-xl font-display"> + 1-line subtitle <p class="label-text text-muted-foreground">
│   └── Inner stack (space-y-6)
│       ├── Inner Card 1  ← <Card> with <CardHeader>(icon + title + description) + <CardContent>
│       ├── Inner Card 2  ← same shape
│       └── Inner Card N  ← same shape
└── Column 2 — outer wrapper (same classes)
    ├── Outer title (same shape as column 1)
    └── Inner stack
        ├── Inner Card 1  ← <Card>, NEVER a bare <h3>
        ├── Inner Card 2
        └── Inner Card N
```

---

## Inner Card boilerplate (copy this exactly)

```tsx
<Card className="bg-card border border-border/80 shadow-sm">
  <CardHeader className="pb-3">
    <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
      <IconX className="w-4 h-4 text-muted-foreground" /> Sub-section Title
    </CardTitle>
    <CardDescription className="label-text">One-line description of what's inside</CardDescription>
  </CardHeader>
  <CardContent className="space-y-3">
    {/* fields */}
  </CardContent>
</Card>
```

Where `IconX` comes from `@/components/icons` (use the financial / status / navigation icon set already in the app — never lucide-react directly in user pages).

## Outer column wrapper boilerplate

```tsx
<div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
  <div className="mb-6">
    <h2 className="text-xl font-display text-foreground">Outer Section Name</h2>
    <p className="label-text text-muted-foreground mt-1">One-line description of the column's purpose</p>
  </div>
  <div className="relative space-y-6">
    {/* inner Cards */}
  </div>
</div>
```

---

## Forbidden anti-patterns

1. **Bare `<h3>` sub-sections inside a column.** If you find yourself writing `<h3 class="text-lg font-display">Some Section</h3>` directly under the column wrapper, stop and wrap it in a `<Card>` with a `<CardHeader>`. Bare h3 sections look like leftover scaffolding next to proper Card siblings.
2. **Mixing inner Card and non-Card sub-sections in the same column.** Either every sub-section is a Card (correct), or none of them are (only acceptable for very simple single-purpose columns). Never mix.
3. **Inner Card headers that drop the icon, the title weight, or the description.** All three pieces are part of the shape. A Card with only a title looks unfinished next to a sibling that has icon + title + description.
4. **Different border / background / shadow classes between sibling inner Cards.** Use `bg-card border border-border/80 shadow-sm` for every inner Card. Only the `GovernedFieldWrapper` block (regulatory amber accent) is allowed to deviate, because its accent IS its semantic.
5. **Outer wrappers that have no title** when the sibling column does have one. Both columns must either both have an outer `<h2>` + subtitle, or neither — never asymmetric.
6. **Sub-section icons pulled from a different icon family than the one in column 1.** Use the same icon set across both columns (the app's `@/components/icons` modules: `financial-icons`, `status-icons`, `navigation-icons`).

---

## When to use multiple inner Cards vs one big Card

- **Multiple inner Cards** — when the column groups *distinct concepts* the user thinks of separately (Identity, Contact, Financial, Headquarters; or Projection Horizon, Income Tax, Inflation, Model Constants). This is the default.
- **One big Card with no inner Cards** — only acceptable for single-purpose columns (e.g. a column that holds a single fee table, or a single chart). The moment you add a second sub-section, switch to the inner-Card pattern.

---

## Reference implementations

- `client/src/components/company-assumptions/CompanySetupSection.tsx` — canonical column 1 shape (Identity → Contact → Financial → Headquarters, all inner Cards).
- `client/src/components/company-assumptions/TaxSection.tsx` — canonical column 2 shape (Projection Horizon → Income Tax → Inflation → Model Constants, all inner Cards).
- Both rendered side-by-side in `client/src/pages/CompanyAssumptions.tsx` (Company tab).

---

## Pre-merge checklist (run mentally before declaring a column-layout task done)

- [ ] Both columns have the same outer wrapper classes
- [ ] Both columns either both have or both lack an outer `<h2>` + subtitle (no asymmetry)
- [ ] Every sub-section in every column is a `<Card>` (no bare `<h3>` sections)
- [ ] Every inner Card has icon + title + description in its `<CardHeader>`
- [ ] All inner Cards in a column use identical border / bg / shadow classes
- [ ] Icons come from `@/components/icons`, not from lucide-react directly
- [ ] Sub-sections are grouped by user-facing *concept*, not by data-shape convenience

---

## Why this matters

The user reads the page left-to-right and expects column 2 to be the visual peer of column 1. When column 1 has four neat inner Cards and column 2 has two bare headings followed by two inner Cards, the page looks half-finished — even if every field is correct, every save works, and every test passes. Layout consistency is part of "done."
