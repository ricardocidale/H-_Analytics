# SectionCard Component

**Location:** `client/src/components/ui/section-card.tsx`

## Purpose
Collapsible section card used by both the User Manual (`/methodology`) and Checker Manual (`/checker-manual`). Provides a consistent expand/collapse pattern with icon, title, optional subtitle, and chevron indicator.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | required | Section identifier (used for scroll targets and test IDs) |
| `title` | `string` | required | Section heading text |
| `subtitle` | `string` | optional | Secondary text below title |
| `icon` | `React.ElementType` | required | Lucide icon component |
| `expanded` | `boolean` | required | Whether section content is visible |
| `onToggle` | `() => void` | required | Click handler for expand/collapse |
| `sectionRef` | `(el: HTMLDivElement \| null) => void` | required | Ref callback for scroll-to-section |
| `children` | `React.ReactNode` | required | Section content |
| `variant` | `"dark" \| "light"` | `"dark"` | Visual theme variant |
| `className` | `string` | optional | Additional CSS classes on the Card |

## Variants

### Dark (default)
- Card: `bg-white/5 backdrop-blur-xl border-white/10 shadow-xl`
- Icon: `text-[#9FBCA4]` (sage green)
- Title: `text-lg text-white font-semibold`
- Chevron: `text-white/60`
- Hover: `hover:bg-white/5`
- Used by: Checker Manual

### Light
- Card: default `border rounded-lg`
- Icon: `text-primary` inside `bg-primary/20` circle
- Title: `text-base font-semibold`
- Subtitle: `text-sm text-muted-foreground`
- Chevron: `text-muted-foreground`
- Hover: `hover:bg-muted/50`
- Used by: User Manual (Methodology)

## Behavior
- Wraps content in `<Card>` with a `<button>` trigger
- Adds `scroll-mt-24` for smooth scroll offset
- `data-testid={`section-toggle-${id}`}` on the toggle button
- Content appears inside `<CardContent>` only when `expanded` is true

## Typical Usage Pattern

```tsx
import { SectionCard } from "@/components/ui/section-card";

const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

const toggleSection = (id: string) => {
  setExpandedSections(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
};

{sections.map(s => (
  <SectionCard
    key={s.id}
    id={s.id}
    title={s.title}
    subtitle={s.subtitle}
    icon={s.icon}
    expanded={expandedSections.has(s.id)}
    onToggle={() => toggleSection(s.id)}
    sectionRef={el => { sectionRefs.current[s.id] = el; }}
    variant="light"
    className={s.className}
  >
    {/* Section content */}
  </SectionCard>
))}
```

## Related Skills
- **manual-table.md** — Data table component used inside sections
- **callout.md** — Alert/callout component used inside sections
- **page-header.md** — PageHeader used at the top of manual pages
