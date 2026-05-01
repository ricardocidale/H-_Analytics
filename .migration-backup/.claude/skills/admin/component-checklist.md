---
name: component-checklist
description: Pre-flight checklist for verifying an extracted admin tab component is correct before integration.
---

# Admin Tab Component Extraction Checklist

## Before Creating

- [ ] Read the original render function in Admin.tsx
- [ ] Identify ALL state variables used by this tab
- [ ] Identify ALL queries used by this tab
- [ ] Identify ALL mutations used by this tab
- [ ] Identify ALL helper functions used by this tab
- [ ] Identify ALL dialogs owned by this tab
- [ ] Identify ALL imports needed (icons, UI components, libs)

## During Creation

- [ ] Component is a named export: `export function XxxTab()`
- [ ] No props — component fetches own data
- [ ] All types imported from `./types` (not redefined inline)
- [ ] Removed `enabled` tab guards from queries (tab mounting = enabled)
- [ ] All `data-testid` attributes preserved exactly
- [ ] All `className` strings preserved exactly
- [ ] All toast messages preserved exactly
- [ ] All query invalidation patterns preserved exactly
- [ ] Dialogs that belong to this tab are included inside the component
- [ ] Only necessary icons imported from lucide-react

## After Creation

- [ ] File compiles with no TypeScript errors
- [ ] No unused imports
- [ ] No references to state/functions that weren't moved
- [ ] Component renders identically to original

## Common Gotchas

1. **Missing `credentials: "include"`** — Every fetch call needs this
2. **Missing error handler** — Every mutation needs onError with toast
3. **Forgetting queryClient import** — Needed for invalidation
4. **Wrong query key** — Must match the API route patterns exactly
5. **Missing dialog state** — Dialog open/close state must come with the dialog
6. **Broken cross-tab references** — Some tabs reference data from other queries (e.g., users list in UserGroups)
