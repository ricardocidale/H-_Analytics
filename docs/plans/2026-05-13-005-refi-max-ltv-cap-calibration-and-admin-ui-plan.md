---
id: 2026-05-13-005
title: "Refi Max LTV Cap — Calibration, DB Fix, and Admin UI"
status: active
created: 2026-05-13
author: Replit Agent
---

## Problem Frame

The refinance loan cap (`refiMaxLtvToOriginal`) is currently calibrated to `1.00` on all
seeded properties, meaning the engine allows refinancing up to 100% of the original
purchase price. On Full Equity properties, this lets investors pull out 100% of their
equity via refi while still owning the asset — producing astronomical combined IRRs
(60%+). The correct cap is **70% of purchase price** (`0.70`).

The engine already applies the cap correctly against `purchasePrice` only (not total
cost basis including improvements). The bug is entirely in the stored values, not the
engine logic.

The admin also has no UI surface to view or adjust this cap default — it lives in
`model_defaults` under key `mc.funding.refiMaxLtvToOriginal` (already seeded at `0.70`,
the correct value) but is inaccessible from the admin Model Defaults panel.

The user-facing property edit slider was wired by Replit (U3, commit
`feat(property-edit): wire refiMaxLtvToOriginal slider`) but its **display format needs
fixing** — it currently shows "X.XX×" (a multiplier) rather than "XX%" (a percentage),
which is how users think about this field.

---

## Scope

| # | What | Files | Territory |
|---|------|-------|-----------|
| P1 | Lower seed constant `SEED_REFI_MAX_LTV_TO_ORIGINAL` from `1.00` → `0.70` | `artifacts/api-server/src/seeds/property-data.ts` | CC |
| P2 | DB migration: set `refi_max_ltv_to_original = 0.70` on existing properties where value > 0.70 or is NULL and refinancing is enabled | New Drizzle migration + runtime guard | CC |
| P3 | Admin UI: add `refiMaxLtvToOriginal` control to Refinance Terms section of Property Underwriting tab | `artifacts/hospitality-business-portal/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx` | CC |
| P4 | Property edit display fix: change U3 slider display from "X.XX×" to "XX%" and update tooltip copy | `artifacts/hospitality-business-portal/src/components/property-edit/CapitalStructureSection.tsx` | CC |

---

## Out of Scope

- Engine cap logic — already correct (`loanCalculations.ts`, `refinance-pass.ts` both cap
  against `property.purchasePrice`)
- `DEFAULT_REFI_MAX_LTV_TO_ORIGINAL` constant — already `0.70` in
  `lib/shared/src/constants-funding.ts`; do **not** change it
- `mc.funding.refiMaxLtvToOriginal` model_defaults row value — already seeded at `0.70`
  from `DEFAULT_REFI_MAX_LTV_TO_ORIGINAL`; no seed change needed for that row

---

## Implementation Units

### P1 — Seed constant correction
**File:** `artifacts/api-server/src/seeds/property-data.ts`

Change:
```
const SEED_REFI_MAX_LTV_TO_ORIGINAL = 1.00;
```
to:
```
const SEED_REFI_MAX_LTV_TO_ORIGINAL = 0.70;
```

No other changes needed in this file — the constant is already referenced correctly on
all properties that have `refiMaxLtvToOriginal` set.

**Test scenarios:**
- Verify the constant is `0.70` after the change
- Verify no other file references the old literal `1.00` for this field

---

### P2 — DB migration for existing properties

**Pattern:** Follow the established Drizzle migration + runtime guard topology documented
in `docs/runbooks/schema-migrations.md`. The column `refi_max_ltv_to_original` was added
in migration `0058` / `0064` — this migration only updates values, not schema.

**Migration file:** `artifacts/api-server/src/migrations/properties-refi-ltv-recalibration-001.ts`

**SQL intent:**
```sql
UPDATE properties
SET refi_max_ltv_to_original = 0.70
WHERE will_refinance = 'Yes'
  AND (refi_max_ltv_to_original IS NULL OR refi_max_ltv_to_original > 0.70);
```

**Runtime guard:** `artifacts/api-server/src/startup/runtime-guards/properties-refi-ltv-recalibration-001.ts`

Guard checks: `SELECT COUNT(*) FROM properties WHERE will_refinance = 'Yes' AND refi_max_ltv_to_original > 0.70`
→ if count > 0, throw with a clear message directing operator to run the migration.

**Register** the guard in `artifacts/api-server/src/startup/runtime-guards/index.ts` (or
equivalent guard runner — check the existing pattern for `properties-refi-ltv-cap-001.ts`
which was added in Plan 2026-05-13-003).

**Test scenarios:**
- Migration idempotency: running twice does not error
- Properties with `will_refinance != 'Yes'` are not touched
- Properties that already have `refi_max_ltv_to_original <= 0.70` are not changed
- Runtime guard passes after migration runs
- Runtime guard fails (throws) when a row with `> 0.70` exists

---

### P3 — Admin UI: Refinance Terms field

**File:** `artifacts/hospitality-business-portal/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx`

**Pattern to follow:** The existing STR Platform Fee field (lines ~130–164 and ~807–835)
which fetches a `model_defaults` row directly via `GET /api/admin/model-defaults?...`,
stores a local `useState` draft, and saves via `PATCH /api/admin/model-defaults/:id`.

**Query:**
```ts
const { data: refiMaxLtvRow, refetch: refetchRefiMaxLtv } = useQuery({
  queryKey: ["model-defaults", "funding", "refiMaxLtvToOriginal"],
  queryFn: async () => {
    const res = await fetch(
      "/api/admin/model-defaults?category=management_company&cardKey=funding",
      { credentials: "include" }
    );
    if (!res.ok) throw new Error("Failed to fetch refi LTV defaults");
    const json = await res.json() as { rows: Array<{ id: number; defaultKey: string; value: unknown }> };
    return json.rows.find(r => r.defaultKey === "mc.funding.refiMaxLtvToOriginal") ?? null;
  },
});
```

Note: If `category=management_company&cardKey=funding` does not return the row, fall back
to querying without `cardKey` and filtering by `defaultKey` client-side. The row
definitely exists — it is in `REQUIRED_MODEL_DEFAULT_KEYS` and would cause a boot failure
if absent.

**Local state:**
```ts
const [refiMaxLtvDraft, setRefiMaxLtvDraft] = useState("");
useEffect(() => {
  if (refiMaxLtvRow?.value != null)
    setRefiMaxLtvDraft(((refiMaxLtvRow.value as number) * 100).toFixed(0));
}, [refiMaxLtvRow]);
```

**Save handler:**
```ts
const saveRefiMaxLtv = async () => {
  if (!refiMaxLtvRow) return;
  const parsed = parseFloat(refiMaxLtvDraft);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 200) return;
  try {
    await apiRequest("PATCH", `/api/admin/model-defaults/${refiMaxLtvRow.id}`, {
      value: parsed / 100,
      reason: "Admin updated refi LTV cap default",
    });
  } catch { /* preserve fire-and-forget */ }
  refetchRefiMaxLtv();
};
```

**Field placement:** Add at the END of the existing "Refinance Terms" `<Section>` block
(after Refinance Closing Costs, before the closing `</Section>`).

**Field UI:**
```tsx
<div className="space-y-2" data-testid="field-refiMaxLtvToOriginal">
  <Label className="label-text text-foreground flex items-center gap-1.5">
    Max Loan vs. Purchase Price
    <InfoTooltip text="Caps the refinance loan as a percentage of the original purchase price, preventing excessive leverage regardless of appraised value at refinancing time. 70% means the refi loan cannot exceed 70% of what the property was purchased for. Applied to new properties; existing properties use their per-property setting." />
  </Label>
  <div className="flex gap-2 items-center">
    <Input
      type="number"
      step="1"
      min="30"
      max="150"
      value={refiMaxLtvDraft}
      onChange={(e) => setRefiMaxLtvDraft(e.target.value)}
      className="bg-card border-primary/30 text-foreground w-24"
      data-testid="input-refiMaxLtvToOriginal"
    />
    <span className="text-sm text-muted-foreground">% of purchase price</span>
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        if (refiMaxLtvRow?.value != null)
          setRefiMaxLtvDraft(((refiMaxLtvRow.value as number) * 100).toFixed(0));
      }}
    >
      Cancel
    </Button>
    <Button size="sm" variant="outline" onClick={saveRefiMaxLtv}>
      Save
    </Button>
  </div>
  <p className="text-xs text-muted-foreground">
    Recommended: 65%–75%. Controls equity extraction at refi. 70% = cap at 70% of purchase price.
  </p>
</div>
```

**Imports:** `apiRequest` is already imported. `useState`, `useEffect`, `useQuery`,
`Input`, `Label`, `Button`, `InfoTooltip` are all already imported in this file.

**Test scenarios:**
- Field renders with the current stored value (displayed as an integer %)
- Typing a new value and clicking Save updates the model_defaults row via PATCH
- Cancel resets the input to the last saved value
- Input is clamped: values outside 30–150 are not saved
- Field renders the helper text with recommended range

---

### P4 — Property edit display fix (U3)

**File:** `artifacts/hospitality-business-portal/src/components/property-edit/CapitalStructureSection.tsx`

**Current display (to replace):**
- Label tooltip: `"Caps the refinance loan at a multiple of the original purchase price, preventing excessive leverage regardless of appraised value. 1.0× = loan cannot exceed purchase price; 1.5× = loan capped at 150% of purchase price."`
- Value badge: `{((draft.refiMaxLtvToOriginal ?? DEFAULT_REFI_MAX_LTV_TO_ORIGINAL)).toFixed(2)}×`
- Slider min/max/step: `min={50} max={200} step={5}` (stored as integer, divided by 100)
- Helper text: `Cap: $...`

**New display:**
- Label tooltip: `"Caps the refinance loan as a percentage of the original purchase price, preventing equity stripping regardless of appraised value at refinancing time. 70% means the loan cannot exceed 70% of what the property cost to purchase."`
- Value badge: `{Math.round((draft.refiMaxLtvToOriginal ?? DEFAULT_REFI_MAX_LTV_TO_ORIGINAL) * 100)}%`
- Slider range: `min={30} max={150} step={5}` — tighten the upper bound from 200 to 150 for a practical admin range; users who need higher can type a value in the property edit form... actually, keep the property-level slider generous: `min={30} max={150} step={5}`
- Helper text: `Max refi loan: $...` (same dollar calculation, just relabeled)

**Test scenarios:**
- Value `0.70` displays as `"70%"` not `"0.70×"`
- Slider moving to 65 (int) stores `0.65` and displays `"65%"`
- Helper text dollar amount is correct: `0.70 × purchasePrice`
- Tooltip no longer mentions "multiple" or "×"

---

## Sequencing

```
P1 (seed constant) → no blockers
P2 (DB migration)  → no blockers; run after P1 for conceptual consistency
P3 (admin UI)      → no blockers (model_defaults row already exists)
P4 (U3 display)    → no blockers (slider already wired by Replit U3 commit)

All four can be implemented in parallel; P2 migration must be tested idempotently.
```

---

## Verification Gates (run before marking complete)

```bash
pnpm run typecheck
pnpm run check:lint
pnpm --filter @workspace/scripts run check:magic-numbers
pnpm --filter @workspace/scripts run check:migration-guards
pnpm --filter @workspace/scripts run check:schema-drift
```

After server restart:
- Load a Full Equity + refi property in the property edit page → slider shows e.g. "70%"
- Load Admin → Model Defaults → Property Underwriting → Refinance Terms → "Max Loan vs.
  Purchase Price" field should show 70 with Save/Cancel buttons
- Change the admin field to 65, Save → verify the model_defaults row updates
- Confirm no existing property has `refi_max_ltv_to_original > 0.70` via the runtime guard
  (should pass on boot after migration runs)

---

## Context for CC

- Replit already committed the U3 slider wiring (commit
  `feat(property-edit): wire refiMaxLtvToOriginal slider in Refinance Terms`). The slider
  is live; this plan only fixes its display format (P4) and adds the admin equivalent (P3).
- The engine cap logic is correct — do NOT touch `lib/engine/src/debt/loanCalculations.ts`
  or `refinance-pass.ts`. Both already cap against `property.purchasePrice`.
- `DEFAULT_REFI_MAX_LTV_TO_ORIGINAL = 0.70` in `lib/shared/src/constants-funding.ts` —
  do NOT change.
- The `mc.funding.refiMaxLtvToOriginal` row in `model_defaults` is already seeded at
  `0.70` (from `DEFAULT_REFI_MAX_LTV_TO_ORIGINAL`). Only the per-property stored values
  need correcting (P2).
- Existing runtime guard for the column: `properties-refi-ltv-cap-001.ts` (added in Plan
  2026-05-13-003). P2 adds a new guard for the recalibration, not a replacement.
