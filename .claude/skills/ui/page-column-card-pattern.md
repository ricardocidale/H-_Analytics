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
  {/* min-h reserves the same vertical space across columns so the first
      inner Card aligns horizontally even when one subtitle is one line and
      the other wraps to two. See §"Header alignment" below. */}
  <div className="mb-6 min-h-[4.5rem]">
    <h2 className="text-xl font-display text-foreground">Outer Section Name</h2>
    <p className="label-text text-muted-foreground mt-1">One-line description of the column's purpose</p>
  </div>
  <div className="relative space-y-6">
    {/* inner Cards */}
  </div>
</div>
```

---

## Header alignment (the "close-but-not-aligned" rule)

**When two columns sit side-by-side, the first inner Card in each column must start at the same vertical Y.** The most common breakage is asymmetric subtitle wrap: column 1's subtitle is one line, column 2's wraps to two — and now the inner cards are off by ~20px and the eye reads it as "broken."

**The rule:** every column's outer header block (the wrapper around the `<h2>` + subtitle) must carry a matching `min-h-[Xrem]` class, where X is large enough to fit the **worst-case rendered height across all columns**. Today the canonical value is `min-h-[5.5rem]` (≈ 88px) because column 1 (`CompanySetupSection`) carries a right-aligned action link ("Edit ICP Definition") that shrinks the title block and forces its subtitle to wrap to three lines.

```tsx
<div className="mb-6 min-h-[5.5rem]">          {/* ✓ both columns identical */}
  <h2 className="text-xl font-display ...">…</h2>
  <p className="label-text text-muted-foreground mt-1">…</p>
</div>
```

### Side-action gotcha (the regression that keeps coming back)

If **either** column's outer header carries a side action — `<Link>`, `<Button>`, badge, dropdown, anything to the right of the title — then the title block is wrapped in a `flex items-start justify-between gap-4` row, which **steals horizontal space from the title/subtitle and forces the subtitle to wrap one extra line**. The peer column's subtitle (with no side action) still wraps the original number of lines, and the inner cards drift apart by ~16–24px.

**Required check whenever you add, remove, move, or rename a side action OR change the length of any outer subtitle:**

1. Open the page side-by-side in the dev preview at the realistic viewport (≥ `lg` — the canonical 2-col split breakpoint).
2. Place a horizontal mental ruler at the top edge of the first inner card in column 1.
3. The first inner card in column 2 must touch that same ruler. If it doesn't, the headers are misaligned.
4. If they're misaligned, **bump the `min-h` value on every column's header in lockstep** (don't bump just one). Use the smallest value that fits the tallest rendered header at the breakpoint of interest.

Common trigger combos that force a `min-h` bump:

| Column 1 header | Column 2 header | Likely needed `min-h` |
|---|---|---|
| Title only + 1-line subtitle | Title only + 1-line subtitle | `4rem` |
| Title only + ≤2-line subtitle | Title only + ≤2-line subtitle | `4.5rem` |
| Title + side action (subtitle wraps to 3) | Title only + ≤2-line subtitle | **`5.5rem`** ← current canonical |
| Title + side action (subtitle wraps to 3) | Title + side action (subtitle wraps to 3) | `5.5rem` |
| Title + tall side action (e.g. button row) | anything | measure both and round up |

Anti-patterns specific to this rule:

- **Different heading levels or sizes between columns** (`h3 text-lg` in column 1 vs `h2 text-xl` in column 2). Always `<h2 className="text-xl font-display text-foreground">` for both.
- **Manually padding the shorter subtitle to two lines** with filler words. Use `min-h`, not prose hacks.
- **Using `min-h` on only one column.** It must be on both, with the same value. The values must be string-identical (`grep` the file and confirm).
- **Using a smaller `min-h` and accepting "close enough."** If the design rule is alignment, anything visibly off is wrong. Bump together until the inner cards line up at every breakpoint where the columns sit side-by-side.
- **Adding a side action in column 1 without re-checking column 2.** This is the #1 cause of the misalignment regression — the side action silently steals title-block width and bumps the subtitle to 3 lines while column 2 stays at 2 lines. Always re-measure after touching either header.

If you ever rework outer subtitles to be longer/shorter, **re-verify both columns still align** by viewing the page side-by-side — don't trust the type-check or the lint to catch this; it's purely visual.

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
