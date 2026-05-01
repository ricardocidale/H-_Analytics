# Admin Save State Pattern

## Rule

Admin tabs that report save state to the parent via `onSaveStateChange` must use a **ref-based save handler** to avoid infinite re-render loops.

## The Problem

The admin page passes `onSaveStateChange` to each tab. The tab calls it in a `useEffect` to report dirty state and provide a save function. If the save function depends on mutable state (like a `draft` object), it creates an infinite loop:

```
draft changes → handleSave recreated → useEffect fires → onSaveStateChange called
→ parent re-renders → child re-renders → draft reference changes → loop
```

## The Safe Pattern

Store mutable data in a ref. The save function reads from the ref, so it has a stable identity:

```typescript
// CORRECT — stable handleSave, reads from ref
const draftRef = useRef<Draft>({});

const handleChange = useCallback((field: string, value: any) => {
  setDraft((prev) => {
    const next = { ...prev, [field]: value };
    draftRef.current = next;
    return next;
  });
  setIsDirty(true);
}, []);

const handleSave = useCallback(() => {
  saveMutation.mutate(draftRef.current);  // reads from ref, not state
}, [saveMutation]);  // stable — doesn't depend on draft

// OR use the saveRef pattern:
const saveRef = useRef<() => void>();
saveRef.current = () => saveMutation.mutate(draft);

useEffect(() => {
  onSaveStateChange?.({
    isDirty,
    isPending: saveMutation.isPending,
    onSave: () => saveRef.current?.(),  // stable inline arrow + ref
  });
  return () => onSaveStateChange?.(null);
}, [isDirty, saveMutation.isPending, onSaveStateChange]);
```

## The Broken Pattern

```typescript
// WRONG — handleSave depends on draft, which changes every render
const handleSave = useCallback(() => {
  saveMutation.mutate(draft);  // draft in closure → recreated when draft changes
}, [draft, saveMutation]);  // ← draft in deps causes infinite loop

useEffect(() => {
  onSaveStateChange?.({ isDirty, isPending, onSave: handleSave });
}, [isDirty, isPending, handleSave, onSaveStateChange]);
// handleSave changes → effect fires → parent re-renders → loop
```

## Current Tabs Using This Pattern

All 5 admin tabs with `onSaveStateChange` use the safe ref pattern:
- `ModelDefaultsTab` — `draftRef.current` (fixed 2026-03-17)
- `AIAgentsTab` — `rebeccaSaveRef.current?.()`
- `ResearchCenterTab` — `saveRef.current?.()`
- `IcpLocationTab` — `handleSaveRef.current()`
- `AssetDefinitionTab` — `handleSaveRef.current()`

## When Adding New Admin Tabs

If your tab has `onSaveStateChange`, always use a ref for the save handler. Never put mutable state (draft objects, form data) in a `useCallback` dependency array that feeds into the save-state `useEffect`.
