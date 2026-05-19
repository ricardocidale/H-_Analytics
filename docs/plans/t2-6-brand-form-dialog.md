# T2-6 — Brand Create/Edit Dialog in BrandsTab.tsx

**Status:** Ready to implement  
**Date:** 2026-05-19  
**Owner:** Replit-safe (frontend-only; POST/PATCH /api/admin/brands already live)

---

## Objective

Add a create/edit dialog to `BrandsTab.tsx` so admins can create new brands and edit the metadata (name, business model, segment, description, active status) of existing ones. Fee-rate editing is already handled inline and is not in scope.

---

## Background

- **POST /api/admin/brands** — creates a brand. Required: `slug` (kebab-case, unique), `name`. Optional: `description`, `businessModel` (`"hotel" | "str"`), `segment`, `sortOrder`, `isActive`.
- **PATCH /api/admin/brands/:slug** — updates brand metadata. `slug` is path-only and immutable once created; all body fields optional (updateBrandSchema is a `.partial()`).
- Admin CRUD canonical pattern: `Dialog` (not Sheet). Reference: `CreateUserDialog.tsx` / `EditUserDialog.tsx` under `components/admin/users/`.
- `BrandsTab.tsx` uses raw `useQuery`/`useMutation` with `fetch` and `credentials: "include"` — maintain this pattern. Wrap mutations in `useMutation` for pending/error/success lifecycle (not bare async functions).
- `isDefault` is always forced to `false` for user-created brands by the backend — no frontend field needed.
- `sortOrder` is managed by the backend default — not exposed in the UI form.
- Single `BrandFormDialog` component with `mode: "create" | "edit"` is preferred over two separate components — the fields and validation are nearly identical, unlike `CreateUserDialog`/`EditUserDialog` which differ materially in permissions handling.

---

## Scope

**In:**
- New `BrandFormDialog.tsx` component (create and edit modes via `mode` prop)
- "New brand" button in the `BrandsTab` card header
- "Edit" icon button per brand row
- Slug auto-generation from name on create with override-lock behavior; slug shown read-only on edit
- Success toast + query invalidation on save
- Centralized `parseApiError(res)` helper for consistent error messages

**Out:**
- Logo / image upload
- Fee-rate editing (already handled inline)
- Brand deletion
- `sortOrder` field in the UI

---

## Implementation Tasks

### T2-6-A — Create `BrandFormDialog.tsx`

**New file:** `artifacts/hospitality-business-portal/src/components/admin/model-defaults/BrandFormDialog.tsx`

**Props interface:**
```ts
interface BrandFormDialogProps {
  mode: "create" | "edit";
  brand?: BrandRow;          // required when mode === "edit"
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;     // parent invalidates query on call
}
```

**Fields:**

| Field | Component | Notes |
|---|---|---|
| Name | `Input` | Required; drives slug in create mode |
| Slug | `Input` | Auto-derived on create; read-only (`disabled`) on edit |
| Business Model | `Select` | Options: `hotel`, `str`, plus `""` (not set) |
| Segment | `Input` | Free text, e.g. "Luxury", "Boutique" |
| Description | `Textarea` | Optional, max 255 chars |
| Active | `Switch` + `Label` | Default `true` on create |

**Slug override-lock behavior (create mode only):**

Use a `slugManuallyEdited` boolean ref to implement "auto-fill until user touches slug directly":

```ts
const [name, setName] = useState("");
const [slug, setSlug] = useState("");
const slugManuallyEdited = useRef(false);

const toSlug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const handleNameChange = (v: string) => {
  setName(v);
  if (!slugManuallyEdited.current) {
    setSlug(toSlug(v));
  }
};

const handleSlugChange = (v: string) => {
  slugManuallyEdited.current = true;
  setSlug(v);
};
```

On dialog close/reset, reset `slugManuallyEdited.current = false`.

On edit mode, slug is shown in a `disabled` `Input` with a small `"(immutable)"` note below it.

**Error parsing helper (inline in file, or extract to `components/admin/utils.ts` if it doesn't already exist):**
```ts
async function parseApiError(res: Response, fallback = "Request failed"): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? fallback;
  } catch {
    return fallback;
  }
}
```

**Mutations — both wrapped in `useMutation`:**

```ts
const createMutation = useMutation({
  mutationFn: async (data: CreateBrandPayload) => {
    const res = await fetch("/api/admin/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
  },
  onSuccess: () => {
    toast({ title: "Brand created" });
    onSuccess();
    onOpenChange(false);
  },
  onError: (err) => {
    toast({ title: "Error", description: err.message, variant: "destructive" });
  },
});

const editMutation = useMutation({
  mutationFn: async (data: UpdateBrandPayload) => {
    const res = await fetch(`/api/admin/brands/${brand!.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
  },
  onSuccess: () => {
    toast({ title: "Brand updated" });
    onSuccess();
    onOpenChange(false);
  },
  onError: (err) => {
    toast({ title: "Error", description: err.message, variant: "destructive" });
  },
});
```

**Dialog structure:**
- `DialogHeader`: title "New brand" (create) or "Edit brand" (edit)
- Field rows using `Label` + component pattern consistent with other admin forms
- `DialogFooter`: Cancel (`variant="outline"`) + Save (`variant="default"`, `disabled` while pending, shows `Loader2` spinner)

### T2-6-B — Wire into BrandsTab.tsx

1. Import `BrandFormDialog`.
2. Add state:
   ```ts
   const [createOpen, setCreateOpen] = useState(false);
   const [editBrand, setEditBrand] = useState<BrandRow | null>(null);
   ```
3. Add "New brand" button in the card header (variant `"outline"`, size `"sm"`).
4. Add "Edit" icon button per brand row using `IconPencil` from `@/components/icons`.
5. Render dialogs:
   ```tsx
   <BrandFormDialog
     mode="create"
     open={createOpen}
     onOpenChange={setCreateOpen}
     onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["/api/admin/brands"] })}
   />
   <BrandFormDialog
     mode="edit"
     brand={editBrand ?? undefined}
     open={editBrand !== null}
     onOpenChange={(open) => { if (!open) setEditBrand(null); }}
     onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["/api/admin/brands"] })}
   />
   ```

---

## Files

| File | Change |
|---|---|
| `artifacts/hospitality-business-portal/src/components/admin/model-defaults/BrandsTab.tsx` | Add buttons + dialog wiring |
| `artifacts/hospitality-business-portal/src/components/admin/model-defaults/BrandFormDialog.tsx` | New component |

---

## Verification Gates

- [ ] `pnpm run typecheck` passes
- [ ] "New brand" button opens empty dialog; submitting POSTs and the new brand appears in the list
- [ ] Slug auto-fills from name; manually editing slug stops auto-fill; reopening dialog resets the lock
- [ ] "Edit" button opens dialog pre-filled with brand data; PATCH updates correctly
- [ ] Slug field is `disabled` on edit with "(immutable)" note
- [ ] `isActive` toggle persists correctly
- [ ] Success toast on create and on edit
- [ ] Error toast if POST/PATCH returns non-ok — message comes from the server response body
- [ ] Query invalidated after success (list refreshes without page reload)
- [ ] `check:ui-canonical` passes — no bare `TabsList`/`TabsTrigger` introduced
