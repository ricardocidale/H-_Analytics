# UI Patterns

> **Before writing any user-facing text**, read `.claude/skills/vocabulary/SKILL.md`.
> It is the single source of truth for every term, label, and the AI-as-colleague voice.

## Button Labels

- **Always "Save"** for create/update actions — never "Update"
- Save icon: `<Save>` from lucide-react
- Create: "Add [Entity]" or "New [Entity]" with Plus icon
- Delete: "Delete" with Trash2 icon, always with confirmation dialog
- Cancel: "Cancel" with no icon
- Research: **"Ask the Analysts"** (main button) or **"Consult"** (secondary) — never "Generate", "Run", or "Regenerate"
- Disabled when: form empty, no changes, mutation pending. Show Loader2 spinner when pending.

## Accordion Summaries

- **Always use accordion/collapsible sections** when displaying grouped or detailed content
- Prefer collapsed-by-default for secondary details; expand-by-default for primary content
- Use `<Accordion>` or `<Collapsible>` from shadcn/ui components
- Applies to: financial breakdowns, settings groups, admin panels, report sections, help text, diagnostic results
- Goal: reduce visual clutter, let users drill into details on demand

## Entity Card Hierarchy

All admin/management pages displaying editable entity collections must use:

1. **Container Card** (Level 1) — `bg-white/80 backdrop-blur-xl border-primary/20`. Header (icon + title + add button) + content area.
2. **Featured Entity Card** (Level 2) — `bg-gradient-to-br from-primary/5 to-primary/10`. For singleton entities (Management Company).
3. **Entity Item Card** (Level 3) — `bg-primary/5 border border-primary/20 rounded-xl p-4`. Individual items with logo thumbnail, name, badges, CRUD actions.

### Mandatory Elements
- Icon in title, `font-display` on title, `label-text` on description
- Empty state with icon when list is empty
- `data-testid` on cards (`{entity}-card-${id}`) and actions (`button-edit-{entity}-${id}`)
- Logo thumbnail or fallback, type badge, color-coded accents
- Delete actions use confirmation dialogs

### Related Skill
- `.claude/skills/ui/entity-cards.md` — Full card pattern reference with code examples
