# Button System

**Component**: `GlassButton` (`client/src/components/ui/glass-button.tsx`)

## Golden Rule

**All buttons MUST use `GlassButton`**. No raw `<button>` elements with inline glass/gradient styling anywhere in the codebase. The only exception is internal implementation within component library files themselves (e.g., `CurrentThemeTab` tab triggers, `ExportMenu` glass buttons).

## Variants

### `primary` — Main Action Buttons
- **Use for**: Save, Add, Submit, Create, and all primary actions on dark backgrounds
- **Background**: `linear-gradient(135deg, #2d4a5e, #3d5a6a, #3a5a5e)`
- **Text**: White
- **Border**: `border-white/25`
- **Shine**: Top `1px` gradient line `from-transparent via-white/40 to-transparent`
- **Hover**: Sage green glow `shadow-[0_0_20px_rgba(159,188,164,0.3)]`
- **Disabled**: Flat `#4a5a6a`, reduced shine opacity

```tsx
<GlassButton variant="primary">Add Property</GlassButton>
```

### `export` — Export/Download Buttons
- **Use for**: PDF, Excel, CSV, PNG, Chart export buttons
- **Background**: Transparent → `bg-gray-100/50` on hover
- **Text**: `text-gray-600`
- **Border**: `border-gray-300`

```tsx
<GlassButton variant="export" size="sm">
  <FileDown className="w-4 h-4" /> Export PDF
</GlassButton>
```

### `ghost` — Secondary/Subtle Actions
- **Use for**: Cancel, Close, secondary navigation, toggles
- **Background**: `bg-white/10` → `bg-white/20` on hover
- **Text**: `text-[#FFF9F5]`
- **Border**: `border-white/15`

```tsx
<GlassButton variant="ghost">Cancel</GlassButton>
```

### `icon` — Icon-Only Buttons
- **Use for**: Back arrows, close buttons, icon toggles
- **Background**: `bg-white/10` → `bg-white/20` on hover
- **Text**: `text-[#FFF9F5]`
- **Border**: `border-white/15`
- **Size**: Use with `size="icon"` for square layout

```tsx
<GlassButton variant="icon" size="icon">
  <ChevronLeft className="w-5 h-5" />
</GlassButton>
```

### `default` — General Dark Background Buttons
- **Use for**: General-purpose buttons on dark surfaces
- **Background**: `bg-white/10 backdrop-blur-xl`
- **Text**: `text-[#FFF9F5]`
- **Border**: `border-white/20`

```tsx
<GlassButton>View Details</GlassButton>
```

## Sizes

| Size | Classes | Use Case |
|------|---------|----------|
| `default` | `px-5 py-2.5 text-sm` | Standard buttons |
| `sm` | `px-4 py-2 text-xs` | Compact buttons (export, inline) |
| `lg` | `px-6 py-3 text-base` | Hero/CTA buttons |
| `icon` | `p-2.5` | Square icon-only buttons |

## SaveButton Wrapper

**Component**: `SaveButton` (`client/src/components/ui/save-button.tsx`)

Convenience wrapper for save operations:

```tsx
import { SaveButton } from "@/components/ui/save-button";

<SaveButton
  onClick={handleSave}
  isPending={mutation.isPending}
  disabled={!hasChanges}
/>

// Custom label:
<SaveButton onClick={handleSave} isPending={saving}>
  Update Settings
</SaveButton>
```

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onClick` | `() => void` | optional | Click handler |
| `disabled` | `boolean` | `false` | Disable button |
| `isPending` | `boolean` | `false` | Shows `Loader2` spinner |
| `children` | `ReactNode` | `"Save Changes"` | Button label |

**Behavior**: Renders `GlassButton variant="primary"` with `Save` icon (or `Loader2` when pending). Has `data-testid="button-save-changes"`.

## Decision Guide

| Scenario | Variant | Example |
|----------|---------|---------|
| Save form data | `SaveButton` | `<SaveButton onClick={save} isPending={pending} />` |
| Add/Create new item | `primary` | `<GlassButton variant="primary"><Plus /> Add</GlassButton>` |
| Export PDF/Excel/PNG | `export` | `<GlassButton variant="export" size="sm">PDF</GlassButton>` |
| Back navigation | `icon` | `<GlassButton variant="icon" size="icon"><ChevronLeft /></GlassButton>` |
| Cancel/dismiss | `ghost` | `<GlassButton variant="ghost">Cancel</GlassButton>` |
| General action | `default` | `<GlassButton>View Details</GlassButton>` |

## Anti-Patterns

```tsx
// BAD: Raw button with inline glass gradient
<button className="bg-gradient-to-br from-[#2d4a5e] via-[#3d5a6a] to-[#3a5a5e] text-white rounded-xl px-5 py-2.5">
  Save Changes
</button>

// BAD: Using shadcn Button on dark glass pages
<Button variant="default">Save</Button>

// GOOD:
<GlassButton variant="primary">Save Changes</GlassButton>

// BEST (for save operations):
<SaveButton onClick={handleSave} isPending={mutation.isPending} />
```

## Common Properties (all variants)

- `rounded-xl`
- `transition-all duration-300`
- `disabled:opacity-70 disabled:pointer-events-none`
- Children wrapped in `<span>` with `flex items-center justify-center gap-2`

## Related Skills

- **glass-components.md** — GlassCard and full component specs
- **tab-bar-system.md** — CurrentThemeTab uses glass-styled tab triggers internally
- **exports/SKILL.md** — ExportMenu component and export format implementations
