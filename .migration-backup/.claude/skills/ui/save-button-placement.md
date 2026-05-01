# Save Button Placement

Rules for placing Save Changes buttons consistently across the app. Covers the SaveButton component API, three placement patterns (PageHeader actions, bottom-of-form, tab/section level), dirty-tracking flow, and dialog exceptions. Use when adding save buttons, form submission buttons, or save changes functionality to any page.

**Related skills:** `design-system/` (form interaction patterns), `ui/consistent-card-widths.md` (page layout conventions), `settings/` (settings page save patterns)

---

## SaveButton Component

**File:** `client/src/components/ui/save-button.tsx`

The `SaveButton` component wraps the standard `Button` with save-specific behaviour: a save icon, a spinner while saving, and automatic disabling when there are no changes.

### Props

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `onClick` | `() => void` | — | Trigger the save mutation |
| `isPending` | `boolean` | `false` | Show spinner and disable while the mutation runs |
| `hasChanges` | `boolean` | `true` | Disable and fade when nothing has changed |
| `disabled` | `boolean` | `false` | Extra disable flag (e.g. validation errors) |
| `children` | `ReactNode` | `"Save Changes"` | Button label — override for context-specific text like `"Save Locations"` |
| `className` | `string` | — | Additional Tailwind classes |
| `type` | `"button" \| "submit" \| "reset"` | `"button"` | HTML button type |
| `size` | `"default" \| "sm" \| "lg" \| "icon"` | — | Button size variant |
| `data-testid` | `string` | `"button-save-changes"` | Test identifier |

### Disable logic

The button is disabled when `disabled || isPending || !hasChanges`. When `!hasChanges && !isPending`, it also fades to 50 % opacity.

---

## Placement Patterns

### Pattern A — PageHeader actions (primary)

Place the `SaveButton` inside the `actions` prop of `PageHeader`. This puts it in the top-right of the page header alongside other action buttons.

**When to use:** Every page that has a `PageHeader` and editable content.

```tsx
<PageHeader
  title="Property Details"
  backLink="/properties"
  actions={
    <div className="flex items-center gap-2">
      {/* other action buttons */}
      <SaveButton
        onClick={handleSave}
        isPending={mutation.isPending}
        hasChanges={isDirty}
      />
    </div>
  }
/>
```

**Examples:**
- `client/src/pages/PropertyEdit.tsx` — SaveButton inside PageHeader actions
- `client/src/pages/CompanyAssumptions.tsx` — SaveButton inside PageHeader actions

---

### Pattern B — Bottom-of-form (mirror)

Add a second `SaveButton` at the very end of a long scrollable form, right-aligned inside `<div className="flex justify-end pb-8">`. This mirrors the PageHeader save button so users don't have to scroll back up.

**When to use:** Long pages with many form sections where the PageHeader scrolls out of view. Always pair with Pattern A — never use Pattern B alone.

```tsx
<div className="flex justify-end pb-8">
  <SaveButton
    onClick={handleSave}
    isPending={mutation.isPending}
    hasChanges={isDirty}
  >
    Save All Changes
  </SaveButton>
</div>
```

**Examples:**
- `client/src/pages/PropertyEdit.tsx` — bottom save button
- `client/src/pages/CompanyAssumptions.tsx` — bottom save button

---

### Pattern C — Tab / section level

Place a `SaveButton` at the bottom of the active tab's content area. Each tab manages its own dirty state and save handler.

**When to use:** Settings pages and admin pages where each tab edits an independent slice of data. The save button sits at the end of the tab content, not in a shared page header.

```tsx
<div className="space-y-6 mt-6">
  {/* tab form fields */}
  <SaveButton
    onClick={handleSaveGlobal}
    disabled={!globalDraft}
    isPending={updateGlobalPending}
  />
</div>
```

**Examples:**
- `client/src/components/settings/OtherTab.tsx` — SaveButton at end of tab content
- `client/src/components/settings/MacroTab.tsx` — SaveButton at end of tab content
- `client/src/components/admin/IcpLocationTab.tsx` — fixed-position SaveButton for location editing

**Variant — section-level header save:** When a tab component manages its own complex layout (e.g. sub-tabs), the save button may sit in the section header rather than the bottom. This is acceptable when the section header stays visible while scrolling.
- `client/src/components/admin/marcela/MarcelaTab.tsx` — SaveButton in the section header above sub-tabs

---

## Dirty-Tracking Flow

Every page or tab that uses `SaveButton` follows the same pattern:

1. **Local draft state** — Clone server data into local state on load (e.g. `useState` or a draft object). Edits modify the local copy, never the server data directly.
2. **`isDirty` boolean** — Compare draft to the last-saved version, or set a `dirty` flag on any change. Pass this as `hasChanges` to `SaveButton`.
3. **`beforeunload` listener** — When `isDirty` is true, register a `window.addEventListener("beforeunload", ...)` handler to warn users about unsaved changes. Remove it when clean.
4. **Mutation via TanStack Query** — The `onClick` handler calls a TanStack Query mutation (`useMutation`). Pass `mutation.isPending` as `isPending` to `SaveButton`. On success, reset the dirty flag and show a toast.

```tsx
const [draft, setDraft] = useState(serverData);
const isDirty = JSON.stringify(draft) !== JSON.stringify(serverData);

useEffect(() => {
  if (!isDirty) return;
  const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}, [isDirty]);

const mutation = useSomeMutation();
const handleSave = () => {
  mutation.mutate(draft, {
    onSuccess: () => {
      toast({ title: "Saved" });
    },
  });
};
```

---

## Dialog Exception

Dialogs do **not** use `SaveButton`. Instead, use the standard `Button` component inside `DialogFooter`:

```tsx
<DialogFooter>
  <Button variant="outline" onClick={onClose}>Cancel</Button>
  <Button onClick={handleSubmit} disabled={isPending}>
    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
    Save
  </Button>
</DialogFooter>
```

This keeps dialog actions visually consistent with the dialog pattern (Cancel / Confirm side by side) rather than introducing the save-icon treatment.

---

## Key Files Reference

| File | Role |
|------|------|
| `client/src/components/ui/save-button.tsx` | SaveButton component definition |
| `client/src/components/ui/page-header.tsx` | PageHeader with `actions` prop |
| `client/src/pages/PropertyEdit.tsx` | Pattern A + B example |
| `client/src/pages/CompanyAssumptions.tsx` | Pattern A + B example |
| `client/src/components/settings/OtherTab.tsx` | Pattern C example (settings tab) |
| `client/src/components/settings/MacroTab.tsx` | Pattern C example (settings tab) |
| `client/src/components/admin/IcpLocationTab.tsx` | Pattern C example (admin tab) |
| `client/src/components/admin/marcela/MarcelaTab.tsx` | Pattern C example (admin tab) |
