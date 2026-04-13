---
name: save-button-placement
description: Rules for consistent Save Changes button placement. Covers SaveButton component API, three placement patterns, dirty-tracking flow, and dialog exceptions. Use when adding save buttons or form submission to any page.
---

Rules for placing Save Changes buttons consistently across the app. Covers the SaveButton component API, three placement patterns (PageHeader actions, bottom-of-form, tab/section level), dirty-tracking flow, and dialog exceptions. Use when adding save buttons, form submission buttons, or save changes functionality to any page.

## SaveButton Component

**File:** `client/src/components/ui/save-button.tsx`

### Props

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `onClick` | `() => void` | — | Trigger the save mutation |
| `isPending` | `boolean` | `false` | Show spinner and disable while mutation runs |
| `hasChanges` | `boolean` | `true` | Disable and fade when nothing has changed |
| `disabled` | `boolean` | `false` | Extra disable flag (e.g. validation errors) |
| `children` | `ReactNode` | `"Save Changes"` | Button label override |
| `type` | `"button" \| "submit" \| "reset"` | `"button"` | HTML button type |
| `size` | `"default" \| "sm" \| "lg" \| "icon"` | — | Button size variant |
| `data-testid` | `string` | `"button-save-changes"` | Test identifier |

Disabled when `disabled || isPending || !hasChanges`. Fades to 50% opacity when `!hasChanges && !isPending`.

## Placement Patterns

### Pattern A — PageHeader actions (primary)

Place `SaveButton` inside the `actions` prop of `PageHeader`. Top-right of page header.

**When to use:** Every page with a `PageHeader` and editable content.

```tsx
<PageHeader
  title="Property Details"
  backLink="/properties"
  actions={
    <div className="flex items-center gap-2">
      <SaveButton onClick={handleSave} isPending={mutation.isPending} hasChanges={isDirty} />
    </div>
  }
/>
```

**Examples:** `PropertyEdit.tsx`, `CompanyAssumptions.tsx`

### Pattern B — Bottom-of-form (mirror)

Second `SaveButton` at the end of a long scrollable form, right-aligned. Always pair with Pattern A — never use alone.

```tsx
<div className="flex justify-end pb-8">
  <SaveButton onClick={handleSave} isPending={mutation.isPending} hasChanges={isDirty}>
    Save All Changes
  </SaveButton>
</div>
```

**Examples:** `PropertyEdit.tsx`, `CompanyAssumptions.tsx`

### Pattern C — Tab / section level

`SaveButton` at the bottom of the active tab's content area. Each tab manages its own dirty state and save handler.

```tsx
<div className="space-y-6 mt-6">
  {/* tab form fields */}
  <SaveButton onClick={handleSaveGlobal} disabled={!globalDraft} isPending={updateGlobalPending} />
</div>
```

**Examples:** `settings/OtherTab.tsx`, `settings/MacroTab.tsx`, `admin/IcpLocationTab.tsx`, `admin/marcela/MarcelaTab.tsx`

## Dirty-Tracking Flow

1. **Local draft state** — Clone server data into local state. Edits modify the local copy only.
2. **`isDirty` boolean** — Compare draft to last-saved version. Pass as `hasChanges`.
3. **`beforeunload` listener** — When `isDirty`, warn users about unsaved changes on navigation.
4. **Mutation via TanStack Query** — `onClick` calls `useMutation`. Pass `mutation.isPending` as `isPending`. On success, reset dirty flag and show toast.

```tsx
const [draft, setDraft] = useState(serverData);
const isDirty = JSON.stringify(draft) !== JSON.stringify(serverData);

useEffect(() => {
  if (!isDirty) return;
  const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}, [isDirty]);
```

## Dialog Exception

Dialogs use standard `Button` inside `DialogFooter`, not `SaveButton`:

```tsx
<DialogFooter>
  <Button variant="outline" onClick={onClose}>Cancel</Button>
  <Button onClick={handleSubmit} disabled={isPending}>Save</Button>
</DialogFooter>
```

## Key Files

| File | Role |
|------|------|
| `client/src/components/ui/save-button.tsx` | SaveButton component |
| `client/src/components/ui/page-header.tsx` | PageHeader with `actions` prop |
| `client/src/pages/PropertyEdit.tsx` | Pattern A + B example |
| `client/src/pages/CompanyAssumptions.tsx` | Pattern A + B example |
| `client/src/components/settings/OtherTab.tsx` | Pattern C example |
| `client/src/components/settings/MacroTab.tsx` | Pattern C example |
| `client/src/components/admin/marcela/MarcelaTab.tsx` | Pattern C example |
