# Glass Components

## GlassButton

**Location:** `client/src/components/ui/glass-button.tsx`

> For full variant reference, decision guide, and anti-patterns, see **`.claude/skills/ui/button-system.md`**.

### Variants

| Variant | Background | Text | Border | Use Case |
|---------|-----------|------|--------|----------|
| `default` | `bg-white/10 backdrop-blur-xl` | `text-[#FFF9F5]` | `border-white/20` | General buttons on dark backgrounds |
| `settings` | `bg-white/10 backdrop-blur-xl` | `text-[#FFF9F5]` | `border-white/20` | Settings-related actions |
| `primary` | `linear-gradient(135deg, #2d4a5e, #3d5a6a, #3a5a5e)` | white | `border-white/25` | **MUST use for action buttons on dark backgrounds** |
| `ghost` | `bg-white/10` → `bg-white/20` on hover | `text-[#FFF9F5]` | `border-white/15` | Secondary/subtle actions |
| `icon` | `bg-white/10` → `bg-white/20` on hover | `text-[#FFF9F5]` | `border-white/15` | Icon-only buttons (back arrows, etc.) |
| `export` | `bg-transparent` → `bg-gray-100/50` on hover | `text-gray-600` | `border-gray-300` | PDF/CSV/Chart export buttons |

### Primary Variant Details
- Dark glass gradient matching PageHeader background
- Top shine line: `h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent`
- Hover glow: `shadow-[0_0_20px_rgba(159,188,164,0.3)]` (sage green)
- Disabled state: flat `#4a5a6a` background, reduced shine opacity

### Sizes

| Size | Classes |
|------|---------|
| `default` | `px-5 py-2.5 text-sm` |
| `sm` | `px-4 py-2 text-xs` |
| `lg` | `px-6 py-3 text-base` |
| `icon` | `p-2.5` |

### Common Properties
- `rounded-xl`
- `transition-all duration-300`
- `disabled:opacity-70 disabled:pointer-events-none`
- Children wrapped in `<span>` with `flex items-center justify-center gap-2`

### Usage

```tsx
import { GlassButton } from "@/components/ui/glass-button";
import { Plus, FileDown } from "lucide-react";

<GlassButton variant="primary">
  <Plus className="w-4 h-4" /> Add Property
</GlassButton>

<GlassButton variant="export" size="sm">
  <FileDown className="w-4 h-4" /> Export PDF
</GlassButton>

<GlassButton variant="icon" size="icon">
  <ChevronLeft className="w-5 h-5" />
</GlassButton>
```

---

## GlassCard

**Location:** `client/src/components/ui/glass-card.tsx`

### Variants

| Variant | Background Gradient | Highlight | Border | Use Case |
|---------|-------------------|-----------|--------|----------|
| `default` | `from-[#2d4a5e]/80 via-[#3d5a6a]/70 to-[#3a5a5e]/80` | `via-white/20` | `border-white/10` | General content cards |
| `success` | `from-[#257D41]/20 via-[#3d5a6a]/50 to-[#3a5a5e]/60` | `via-[#9FBCA4]/30` | `border-[#9FBCA4]/30` | Positive metrics |
| `warning` | `from-red-900/30 via-[#3d5a6a]/50 to-[#3a5a5e]/60` | `via-red-400/30` | `border-red-500/30` | Alerts, negative metrics |
| `chart` | `from-[#2d4a5e] via-[#3a5a5e] to-[#3d5a6a]` | `via-white/30` | `border-white/15` | Chart containers |

### Common Properties
- `rounded-2xl`
- `p-6`
- `overflow-hidden`
- Top shine line at top edge
- Chart variant includes decorative sage green blur circles

### Usage

```tsx
import { GlassCard } from "@/components/ui/glass-card";

<GlassCard variant="default">
  <h3 className="text-white font-display">Revenue</h3>
  <p className="text-white/60">$1,234,567</p>
</GlassCard>

<GlassCard variant="chart">
  {/* Chart content */}
</GlassCard>
```

---

## SaveButton

**Location:** `client/src/components/ui/save-button.tsx`

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onClick` | `() => void` | optional | Click handler |
| `disabled` | `boolean` | `false` | Disable button |
| `isPending` | `boolean` | `false` | Shows loading spinner |
| `children` | `ReactNode` | `"Save Changes"` | Button label text |

### Behavior
- Wraps `GlassButton variant="primary"`
- Shows `Save` icon (lucide) normally, `Loader2` spinning icon when `isPending`
- Disabled when `disabled || isPending`
- Has `data-testid="button-save-changes"`

### Usage

```tsx
import { SaveButton } from "@/components/ui/save-button";

<SaveButton
  onClick={handleSave}
  isPending={mutation.isPending}
  disabled={!hasChanges}
/>

<SaveButton onClick={handleSave} isPending={saving}>
  Update Settings
</SaveButton>
```

---

## Related Skills

- **button-system.md** — Full GlassButton decision guide, anti-patterns, and variant reference
- **tab-bar-system.md** — CurrentThemeTab component that uses glass-styled tab triggers
- **exports/SKILL.md** — ExportMenu component and export format implementations
- **page-header.md** — PageHeader component that uses GlassButton for back navigation and actions
