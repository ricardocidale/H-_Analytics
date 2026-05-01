---
name: entity-cards
description: Entity Card design patterns for admin and management pages. Covers container cards, inline entity cards, logo/icon display, member badges, and CRUD action placement. Use this skill when building any card-based admin UI.
---

# Entity Card Patterns

## Purpose

Documents the card-based UI patterns used throughout Administration and management pages. These patterns create a consistent, visually-rich approach to displaying and editing entities like companies, user groups, logos, and asset descriptions.

## Key Files

- `client/src/components/ui/entity-card.tsx` — Reusable EntityCardContainer, EntityCardItem, EntityEmptyState components
- `client/src/pages/Admin.tsx` — Primary usage of all card patterns
- `client/src/pages/Logos.tsx` — Logo management grid cards
- `client/src/components/ui/card.tsx` — Base Card, CardHeader, CardTitle, CardDescription, CardContent from shadcn/ui
- `client/src/components/ui/glass-card.tsx` — Dark-themed glass card variant

## Reusable Components

### EntityCardContainer
Section wrapper that provides consistent header with icon, title, description, and optional "New" button.

```tsx
import { EntityCardContainer } from "@/components/ui/entity-card";

<EntityCardContainer
  icon={<Building2 className="w-5 h-5 text-primary" />}
  title="SPV Companies"
  description="Manage special purpose vehicle companies."
  onAdd={() => openDialog()}
  addLabel="New SPV"
  variant="default"  // or "featured" for gradient background
  data-testid="spv-companies"
>
  {/* Entity items inside */}
</EntityCardContainer>
```

### EntityCardItem
Individual entity row with logo/icon, name, badges, metadata pills, member list, and CRUD actions.

```tsx
import { EntityCardItem } from "@/components/ui/entity-card";

<EntityCardItem
  id={company.id}
  name={company.name}
  logoUrl={companyLogo?.url}
  fallbackIcon={<Building2 className="w-5 h-5 text-blue-500" />}
  badge={<span className="text-xs px-2 py-0.5 rounded font-mono bg-blue-500/20 text-blue-600">SPV</span>}
  description={company.description}
  metadata={[`Logo: ${logoName}`, `${memberCount} members`]}
  members={users.map(u => ({ id: u.id, label: u.name || u.email }))}
  onEdit={() => openEditDialog(company)}
  onDelete={() => confirmDelete(company)}
  accentColor="blue"  // or "primary"
  data-testid={`company-card-${company.id}`}
/>
```

### EntityEmptyState
Centered empty state with icon, title, and optional subtitle.

```tsx
import { EntityEmptyState } from "@/components/ui/entity-card";

<EntityEmptyState
  icon={<Building2 className="w-10 h-10" />}
  title="No companies created yet."
  subtitle="Create a company to get started."
/>
```

## Related Rules

- `.claude/rules/design-standards.md` — Every page must be graphics-rich

## Card Hierarchy

There are three levels of card patterns used in admin pages:

### Level 1: Container Card (Section Wrapper)

Wraps an entire section (e.g., "SPV Companies", "User Groups"). Contains a header with title/description and a content area with entity cards inside.

```tsx
<Card className="bg-white/80 backdrop-blur-xl border-primary/20 shadow-[0_8px_32px_rgba(159,188,164,0.1)]">
  <CardHeader>
    <div className="flex items-center justify-between">
      <div>
        <CardTitle className="font-display flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary" /> Section Title
        </CardTitle>
        <CardDescription className="label-text">
          Section description text
        </CardDescription>
      </div>
      <Button variant="outline" className="flex items-center gap-2">
        <Plus className="w-4 h-4" /> New Item
      </Button>
    </div>
  </CardHeader>
  <CardContent className="relative space-y-4">
    {/* Entity cards go here */}
  </CardContent>
</Card>
```

**Styling tokens:**
- Background: `bg-white/80 backdrop-blur-xl`
- Border: `border-primary/20`
- Shadow: `shadow-[0_8px_32px_rgba(159,188,164,0.1)]`
- Title uses `font-display` with a Lucide icon
- Action button in header (top-right)

### Level 2: Featured Entity Card (Inline Editing)

For singleton entities that need prominent inline editing (e.g., Management Company). Uses a gradient background to visually distinguish from regular container cards.

```tsx
<Card className="bg-gradient-to-br from-primary/5 to-primary/10 backdrop-blur-xl border-primary/30 shadow-[0_8px_32px_rgba(159,188,164,0.15)]">
  <CardHeader>
    <CardTitle className="font-display flex items-center gap-2">
      <Icon className="w-5 h-5 text-primary" /> Entity Name
    </CardTitle>
    <CardDescription className="label-text">Description</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="flex items-start gap-6">
      {/* Large logo/image preview (left) */}
      <div className="flex-shrink-0">
        <div className="w-20 h-20 rounded-xl bg-white border-2 border-primary/30 flex items-center justify-center overflow-hidden shadow-md">
          <img src={logoUrl} className="max-w-full max-h-full object-contain" />
        </div>
      </div>
      {/* Form fields (right) */}
      <div className="flex-1 space-y-4">
        <div className="space-y-2">
          <Label>Field Name</Label>
          <Input value={value} onChange={...} className="max-w-md" />
        </div>
        <div className="space-y-2">
          <Label>Logo</Label>
          <Select ...>
            <SelectTrigger className="max-w-md" />
          </Select>
        </div>
        <Button variant="outline" className="flex items-center gap-2 mt-2">
          <Save className="w-4 h-4" /> Save
        </Button>
      </div>
    </div>
  </CardContent>
</Card>
```

**Styling tokens:**
- Gradient background: `bg-gradient-to-br from-primary/5 to-primary/10`
- Stronger border: `border-primary/30`
- Larger shadow: `shadow-[0_8px_32px_rgba(159,188,164,0.15)]`
- Large logo preview: `w-20 h-20 rounded-xl`
- Input fields constrained: `max-w-md`

### Level 3: Entity Item Card (List Item)

Individual entity rows inside a container card. Used for companies, user groups, logos, asset descriptions.

```tsx
<div className="bg-primary/5 border border-primary/20 rounded-xl p-4" data-testid={`entity-card-${id}`}>
  <div className="flex items-start justify-between mb-3">
    {/* Left: Icon/logo + name + badges */}
    <div className="flex items-center gap-3">
      {/* Logo thumbnail */}
      <div className="w-10 h-10 rounded-lg bg-white border border-primary/20 flex items-center justify-center overflow-hidden">
        <img src={logoUrl} className="max-w-full max-h-full object-contain" />
      </div>
      {/* Or fallback icon */}
      <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      {/* Name + type badge */}
      <div>
        <h3 className="font-display text-foreground font-medium">{name}</h3>
        <span className="text-xs px-2 py-0.5 rounded font-mono bg-primary/20 text-primary">Type</span>
      </div>
    </div>
    {/* Right: Edit/Delete actions */}
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" className="text-primary hover:text-foreground hover:bg-primary/10">
        <Pencil className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  </div>
  {/* Optional description */}
  {description && <p className="text-sm text-muted-foreground mb-3">{description}</p>}
  {/* Metadata badges */}
  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-3">
    <span className="bg-primary/10 px-2 py-0.5 rounded">Logo: {logoName}</span>
    <span className="bg-primary/10 px-2 py-0.5 rounded">{count} members</span>
  </div>
  {/* Member pills */}
  <div className="flex flex-wrap gap-2">
    <span className="inline-flex items-center gap-1 bg-white/80 border border-primary/20 rounded-full px-3 py-1 text-sm">
      <span className="font-medium">{memberName}</span>
    </span>
  </div>
</div>
```

**Styling tokens:**
- Background: `bg-primary/5` (or `bg-blue-500/5` for alternate color schemes like SPVs)
- Border: `border border-primary/20` (or `border-blue-500/20`)
- Rounded: `rounded-xl`
- Padding: `p-4`
- Logo thumbnail: `w-10 h-10 rounded-lg`
- Type badge: `text-xs px-2 py-0.5 rounded font-mono`
- Member pills: `rounded-full px-3 py-1`

## Color-Coded Variants

Entity cards use color accents to distinguish types:

| Entity Type | Background | Border | Icon/Badge Color | Use Case |
|------------|-----------|--------|-----------------|----------|
| Primary/Management | `bg-primary/5` | `border-primary/20` | `text-primary` | Management company, default entities |
| SPV/Property | `bg-blue-500/5` | `border-blue-500/20` | `text-blue-500` | SPV companies |
| Inactive/Warning | — | — | `bg-red-500/20 text-red-600` | Inactive status badge |
| Default marker | — | — | `bg-primary/20 text-primary` | Default logo/theme indicator |

## Empty State Pattern

When a section has no entities, show a centered empty state:

```tsx
<div className="text-center py-8 text-muted-foreground">
  <Icon className="w-10 h-10 mx-auto mb-2 opacity-40" />
  <p>No items created yet.</p>
  <p className="text-sm">Create an item to get started.</p>
</div>
```

## Logo Display Patterns

### Logo Thumbnail (in entity card)
```tsx
<div className="w-10 h-10 rounded-lg bg-white border border-primary/20 flex items-center justify-center overflow-hidden">
  <img src={url} alt={name} className="max-w-full max-h-full object-contain" />
</div>
```

### Logo Preview (in featured card)
```tsx
<div className="w-20 h-20 rounded-xl bg-white border-2 border-primary/30 flex items-center justify-center overflow-hidden shadow-md">
  <img src={url} alt={name} className="max-w-full max-h-full object-contain" />
</div>
```

### Logo Placeholder (no logo)
```tsx
<div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
  <Building2 className="w-5 h-5 text-primary" />
</div>
```

### Logo Placeholder (large, dashed border)
```tsx
<div className="w-20 h-20 rounded-xl bg-primary/10 border-2 border-dashed border-primary/30 flex items-center justify-center">
  <Building2 className="w-8 h-8 text-primary/40" />
</div>
```

## Logo Selector Pattern

Dropdown with inline logo preview thumbnails:

```tsx
<Select value={logoId != null ? String(logoId) : "none"} onValueChange={...}>
  <SelectTrigger className="max-w-md"><SelectValue placeholder="Select a logo" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="none">No Logo</SelectItem>
    {logos?.map(logo => (
      <SelectItem key={logo.id} value={String(logo.id)}>
        <span className="flex items-center gap-2">
          <img src={logo.url} alt={logo.name} className="w-5 h-5 object-contain rounded" />
          {logo.name}{logo.isDefault ? " (Default)" : ""}
        </span>
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

## CRUD Action Patterns

### Edit + Delete (ghost buttons, top-right of entity card)
```tsx
<div className="flex items-center gap-1">
  <Button variant="ghost" size="sm" onClick={onEdit}
    className="text-primary hover:text-foreground hover:bg-primary/10"
    data-testid={`button-edit-${entity}-${id}`}>
    <Pencil className="w-4 h-4" />
  </Button>
  <Button variant="ghost" size="sm" onClick={onDelete}
    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
    data-testid={`button-delete-${entity}-${id}`}>
    <Trash2 className="w-4 h-4" />
  </Button>
</div>
```

### New Item (outline button, in container header)
```tsx
<Button variant="outline" onClick={onAdd}
  className="flex items-center gap-2"
  data-testid="button-add-entity">
  <Plus className="w-4 h-4" /> New Item
</Button>
```

### Save (inline, in featured card)
```tsx
<Button variant="outline" onClick={onSave}
  disabled={!isValid || !isDirty || isPending}
  className="flex items-center gap-2 mt-2"
  data-testid="button-save-entity">
  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
  {isEditing ? "Save" : "Create"}
</Button>
```

## data-testid Conventions

| Element | Pattern | Example |
|---------|---------|---------|
| Entity card | `{entity}-card-${id}` | `company-card-5` |
| Edit button | `button-edit-{entity}-${id}` | `button-edit-company-5` |
| Delete button | `button-delete-{entity}-${id}` | `button-delete-company-5` |
| Add button | `button-add-{entity}` | `button-add-company` |
| Save button | `button-save-{entity}` | `button-save-mgmt-company` |
| Form input | `input-{entity}-{field}` | `input-mgmt-company-name` |
| Select trigger | `trigger-{entity}-{field}` | `trigger-mgmt-company-logo` |

## Grid Card Pattern (for galleries)

Used for logos and visual assets in grid layouts:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(item => (
    <div key={item.id} className="relative bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-4">
      <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden border border-primary/20">
        <img src={item.url} className="max-w-full max-h-full object-contain" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{item.name}</p>
        <p className="text-xs text-muted-foreground">{item.meta}</p>
      </div>
    </div>
  ))}
</div>
```

## Checklist for New Entity Card Sections

1. Use Container Card (Level 1) as the wrapper
2. Include icon + title + description in CardHeader
3. Add "New" button in header if CRUD is needed
4. Show Empty State when no items exist
5. Use Entity Item Cards (Level 3) for each row
6. Include logo thumbnail or fallback icon
7. Add type badges and metadata pills
8. Place Edit/Delete actions top-right of each entity card
9. Show member count and member pills if applicable
10. Add appropriate `data-testid` attributes to all interactive elements
11. Use color-coded variants to distinguish entity types
12. For singleton entities, use Featured Entity Card (Level 2) with inline editing

## Related Skills

- **glass-components.md** — GlassCard and GlassButton for dark-themed variants
- **section-card.md** — Collapsible section card for manuals
- **page-header.md** — PageHeader component
- **button-system.md** — Full button variant guide
- **graphics-component-catalog.md** — All reusable graphics components
