# Slider + EditableValue Pattern

**Components**:
- `Slider` (`client/src/components/ui/slider.tsx`) — Radix-based range slider
- `EditableValue` (`client/src/components/ui/editable-value.tsx`) — Click-to-edit value display

## Golden Rule

**Sliders MUST always be paired with a visible value display.** Use `EditableValue` for user-editable fields, or a `<span className="text-sm font-mono text-primary">` for read-only display. Never show a slider without its current value.

## Imports

```tsx
import { Slider } from "@/components/ui/slider";
import { EditableValue } from "@/components/ui/editable-value";
```

## Slider Component

Built on `@radix-ui/react-slider`. Always single-thumb (one value).

### Styling

| Part   | Style                                                                      |
| ------ | -------------------------------------------------------------------------- |
| Track  | `h-2 bg-gray-200/80 rounded-full shadow-inner`                            |
| Range  | `bg-gradient-to-r from-[#9FBCA4] to-[#85a88b] rounded-full`              |
| Thumb  | `h-5 w-5 rounded-full border-2 border-[#9FBCA4] bg-white shadow-md`      |
| Hover  | `hover:scale-110 hover:shadow-lg`                                          |
| Active | `active:cursor-grabbing active:scale-95` (cursor changes to grab)          |
| Focus  | `ring-2 ring-[#9FBCA4]/50 ring-offset-1`                                  |

### Props

Standard Radix `Slider` props. Key ones used:

| Prop            | Type         | Description                         |
| --------------- | ------------ | ----------------------------------- |
| `value`         | `number[]`   | Always wrap in array: `[myValue]`   |
| `onValueChange` | `(v) => void`| Callback receives array of numbers  |
| `min`           | `number`     | Minimum bound                       |
| `max`           | `number`     | Maximum bound                       |
| `step`          | `number`     | Step increment                      |

## EditableValue Component (Shared)

Displays a formatted value that becomes an inline `<input>` on click. Sage green monospace text.

### Props

| Prop        | Type                                        | Default     | Description                         |
| ----------- | ------------------------------------------- | ----------- | ----------------------------------- |
| `value`     | `number`                                    | —           | Current numeric value               |
| `onChange`   | `(val: number) => void`                     | —           | Called with clamped value on commit  |
| `format`    | `"percent" \| "dollar" \| "months" \| "number"` | `"percent"` | Display format                      |
| `min`       | `number`                                    | `0`         | Minimum allowed value               |
| `max`       | `number`                                    | `100`       | Maximum allowed value               |
| `step`      | `number`                                    | `1`         | Input step                          |
| `className` | `string`                                    | —           | Additional classes                  |

### Display Formats

| Format    | Example Output   |
| --------- | ---------------- |
| `percent` | `65.0%`          |
| `dollar`  | `$1,200`         |
| `months`  | `12 mo`          |
| `number`  | `42`             |

### Behavior

1. **Display mode**: `text-sm font-mono font-semibold text-[#9FBCA4]` with hover underline + cursor pointer
2. **Click**: Switches to inline `<input type="number">` (`w-16`, border-b, sage green text), value auto-selected
3. **Enter/Blur**: Parses, clamps to min/max, calls `onChange`
4. **Escape**: Cancels edit, reverts to display mode

---

## Responsive Column Alignment System

Sliders must align to a consistent virtual column grid that adapts to screen width. This creates visual rhythm and prevents sliders from stretching too wide on large screens.

### Core Principle

**Sliders within the same section must snap to aligned columns so their tracks line up vertically.** This creates clean visual columns regardless of label length. The number of columns adapts to screen width:

| Screen Width | Breakpoint | Columns | Slider Behavior |
|-------------|------------|---------|-----------------|
| < 640px     | (default)  | **1**   | Full width — only on extremely narrow screens (phones in portrait) |
| 640–1023px  | `sm:`      | **2**   | Side-by-side pairs |
| ≥ 1024px    | `lg:` / `xl:` | **2 or 3** | Use 3 only for sections with 6+ related sliders of the same type |

**Important:** Sliders should only go full-width on extremely narrow screens (below 640px). The `sm:` breakpoint (640px) is the standard threshold for switching to multi-column — not `md:` (768px). This ensures sliders are already in columns on most tablets and landscape phones.

### Column Class Patterns

Use these exact Tailwind grid patterns for slider groups:

```tsx
// DEFAULT: 2-column (most common — used for most sections)
<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
  {/* slider items */}
</div>

// 3-column: Only for large groups of similar fields (6+ sliders of same type)
<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
  {/* slider items — e.g., all cost rates, all revenue shares */}
</div>

// Section-level card pairing: wraps cards side-by-side
<div className="grid gap-6 lg:grid-cols-2">
  <Card>{/* card with sliders inside */}</Card>
  <Card>{/* card with sliders inside */}</Card>
</div>
```

### When to Use Each Column Count

| Columns | When to Use | Examples |
|---------|-------------|---------|
| **1 column** | Extremely narrow screens only (< 640px, phones in portrait). Never use 1-col as the default on any screen wider than a phone. | Phones in portrait mode |
| **2 columns** | Default for most sections starting at `sm:` (640px). Use for 2–5 related sliders, mixed field types, or financing parameters. | Acquisition details, financing terms, revenue assumptions, management fees, staffing |
| **3 columns** | Large groups of 6+ homogeneous sliders (same type/format). Steps to 2 on `sm:` and 1 below 640px. | Operating cost rates (10 sliders), revenue share splits (4+ sliders), boutique definition (5 sliders) |

### Page-Specific Column Assignments

| Page | Section | Column Pattern |
|------|---------|---------------|
| **PropertyEdit** | Property Details (name, location, rooms) | `grid-cols-1 sm:grid-cols-2` |
| **PropertyEdit** | Revenue (ADR, occupancy, growth) | `grid-cols-1 sm:grid-cols-2` |
| **PropertyEdit** | Operating Costs (10 cost rates) | `grid-cols-1 sm:grid-cols-2` (could be 3-col) |
| **PropertyEdit** | Revenue Shares (events, F&B, other) | `grid-cols-1 sm:grid-cols-2` |
| **PropertyEdit** | Financing (LTV, rate, term) | `grid-cols-1 sm:grid-cols-2` |
| **PropertyEdit** | Management Fees (base, incentive) | `grid-cols-1 sm:grid-cols-2` |
| **CompanyAssumptions** | Dates/identity (3 fields) | `grid-cols-1 sm:grid-cols-3` |
| **CompanyAssumptions** | Compensation sliders | `grid-cols-1 sm:grid-cols-2` via card pairing (`grid gap-6 lg:grid-cols-2`) |
| **CompanyAssumptions** | Overhead/costs | `grid-cols-1 sm:grid-cols-2` via card pairing |
| **Settings** | Boutique definition (5 sliders) | `grid-cols-1 sm:grid-cols-3` |
| **Settings** | Debt assumptions (LTV, rate, term, costs) | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` |

### Alignment Rules

1. **All sliders within the same grid container align to the same virtual column.** The grid handles this automatically via equal-width cells.
2. **Label + value row sits above the slider track.** Use `flex items-center justify-between` for the label/value row, then the slider below in a `space-y-2` wrapper.
3. **Gap consistency:** Always use `gap-6` between grid items. This is the standard spacing across all pages.
4. **Never mix column counts within the same grid.** If a section needs both 2-col and 3-col areas, use separate grid containers with a visual separator or heading between them.
5. **Standalone cards** with only 1–3 sliders should be paired with another card in a `grid gap-6 lg:grid-cols-2` wrapper — never left as full-width standalone.

---

## Standard Layout Pattern

The slider + label + value follows a consistent structure across all assumption pages:

### With EditableValue (editable fields)

```tsx
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <Label className="label-text text-gray-700 flex items-center gap-1">
      Starting ADR
      <HelpTooltip text="Average Daily Rate at the start of operations." />
    </Label>
    <EditableValue
      value={draft.startAdr}
      onChange={(val) => handleChange("startAdr", val.toString())}
      format="dollar"
      min={100}
      max={1200}
      step={10}
    />
  </div>
  <Slider
    value={[draft.startAdr]}
    onValueChange={(vals: number[]) => handleChange("startAdr", vals[0].toString())}
    min={100}
    max={1200}
    step={10}
  />
</div>
```

### With Read-Only Value (Settings page style)

```tsx
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <span className="text-sm text-muted-foreground">Min Rooms</span>
    <span className="text-sm font-mono text-primary">{value}</span>
  </div>
  <Slider
    value={[value]}
    onValueChange={(vals) => handleChange("minRooms", vals[0].toString())}
    min={5}
    max={50}
    step={5}
  />
</div>
```

### Full Section Example (2-column aligned)

```tsx
<h3 className="text-lg font-semibold mb-4">Revenue Assumptions</h3>
<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
  {/* Column 1 */}
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <Label className="label-text text-gray-700 flex items-center gap-1">
        Starting ADR <HelpTooltip text="..." />
      </Label>
      <EditableValue value={draft.startAdr} onChange={...} format="dollar" min={100} max={1200} step={10} />
    </div>
    <Slider value={[draft.startAdr]} onValueChange={...} min={100} max={1200} step={10} />
  </div>

  {/* Column 2 — aligns with Column 1 */}
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <Label className="label-text text-gray-700 flex items-center gap-1">
        ADR Growth Rate <HelpTooltip text="..." />
      </Label>
      <EditableValue value={draft.adrGrowthRate * 100} onChange={...} format="percent" min={0} max={10} step={0.5} />
    </div>
    <Slider value={[draft.adrGrowthRate * 100]} onValueChange={...} min={0} max={10} step={0.5} />
  </div>

  {/* Rows 2+ continue in the same grid — auto-placed into columns */}
  <div className="space-y-2">...</div>
  <div className="space-y-2">...</div>
</div>
```

### Full Section Example (3-column for homogeneous rates)

```tsx
<h3 className="text-lg font-semibold mb-4">Operating Cost Rates (% of Total Revenue)</h3>
<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <Label>Rooms <HelpTooltip text="..." /></Label>
      <EditableValue value={draft.costRateRooms * 100} ... format="percent" />
    </div>
    <Slider value={[draft.costRateRooms * 100]} ... />
  </div>
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <Label>F&B <HelpTooltip text="..." /></Label>
      <EditableValue value={draft.costRateFB * 100} ... format="percent" />
    </div>
    <Slider value={[draft.costRateFB * 100]} ... />
  </div>
  {/* ... 8 more cost rates, all same structure */}
</div>
```

---

## Percentage Fields — Value Scaling

When a field is stored as a decimal (0.65) but displayed as a percentage (65%):

```tsx
<EditableValue
  value={draft.startOccupancy * 100}
  onChange={(val) => handleChange("startOccupancy", (val / 100).toString())}
  format="percent"
  min={0}
  max={100}
  step={1}
/>
<Slider
  value={[draft.startOccupancy * 100]}
  onValueChange={(vals: number[]) => handleChange("startOccupancy", (vals[0] / 100).toString())}
  min={0}
  max={100}
  step={1}
/>
```

**Critical**: Both `EditableValue` and `Slider` must use identical `min`, `max`, `step`, and value scaling. They share the same `handleChange` callback to stay synchronized.

## Common Step Values

| Field Type              | Step   | Min      | Max        |
| ----------------------- | ------ | -------- | ---------- |
| Percentage rates        | `1`    | `0`      | `100`      |
| Fee rates (%)           | `0.5`  | `0`      | `10`       |
| Dollar (ADR)            | `10`   | `100`    | `1,200`    |
| Dollar (large amounts)  | `25000`| `100,000`| `1,500,000`|
| Dollar (salary)         | `5000` | `40,000` | `200,000`  |
| Months                  | `1`    | `0`      | `36`       |
| Count (rooms, spaces)   | `5`    | `0`      | `200`      |

## Where Used

- **PropertyEdit**: ADR, growth rates, occupancy, ramp months, revenue shares, catering, financing terms — uses shared `EditableValue` from `@/components/ui/editable-value`
- **CompanyAssumptions**: SAFE tranches, management fees, staffing, escalation rates, office lease, sales commission, event/other expense rates, utilities split, compensation — uses its own inline `EditableValue` (see below)
- **Settings**: Boutique definition sliders (rooms, ADR, events, acreage, parking), commission rate, debt assumptions (LTV, interest rate, amortization, closing costs, refi terms) — uses read-only `<span>` values, not `EditableValue`
- **SensitivityAnalysis**: Uses `Sliders` icon from lucide-react only (no actual `Slider` component); variable adjustments are via input fields

## CompanyAssumptions Inline EditableValue

`CompanyAssumptions.tsx` defines its own inline `EditableValue` function (not imported from shared component). Key differences from the shared version:

| Aspect              | Shared (`editable-value.tsx`)        | CompanyAssumptions inline          |
| ------------------- | ------------------------------------ | ---------------------------------- |
| **Color**           | `text-[#9FBCA4]` (sage green)        | `text-[#257D41]` (darker green)   |
| **Input style**     | `w-16` borderless, border-b only     | `w-24` with border+rounded+bg-white|
| **Input type**      | `type="number"`                      | `type="text"` (allows decimal entry)|
| **Percent scaling** | External (caller pre-multiplies ×100)| Internal (component handles ×100)  |
| **Format options**  | `percent\|dollar\|months\|number`    | `percent\|dollar\|number`          |
| **Formatting**      | Simple `toFixed`/`toLocaleString`    | Uses `formatPercent`/`formatMoney` from `@/lib/constants` |

**Not yet migrated** to the shared component because its percent-scaling API differs (percent scaling is internal vs external). When migrating: either update all call sites to pre-scale values, or add a `percentAsDecimal` prop to the shared component.

## Anti-Patterns

1. **Full-width slider on desktop** — Always place sliders in a responsive column grid so they occupy at most half the screen width on desktop
2. **Slider without visible value** — Always show the current value
3. **Mismatched min/max/step** between EditableValue and Slider — They must be identical
4. **Inline EditableValue definitions** — Import from `@/components/ui/editable-value` (except CompanyAssumptions legacy)
5. **Raw `<input type="range">`** — Always use the Radix-based `Slider` component
6. **Missing HelpTooltip** — Every slider field should have a HelpTooltip explaining the parameter
7. **Mixed column counts in one grid** — Don't mix 2-col and 3-col items in the same grid container; use separate grids with headings
8. **1-column sliders above 640px** — Sliders must always be in a multi-column grid on `sm:` (640px) and above. Full-width is only acceptable on extremely narrow screens (phones in portrait)
9. **Using `md:` for slider columns** — Use `sm:` (640px) not `md:` (768px) as the column breakpoint. Sliders should be in columns on tablets and landscape phones
10. **Inconsistent gap values** — Always use `gap-6` between grid items for uniform spacing
11. **Breaking column alignment** — All sliders in the same grid must share the same cell width (the grid handles this automatically; don't override with custom widths)
