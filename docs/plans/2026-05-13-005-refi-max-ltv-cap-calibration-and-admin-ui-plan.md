---
id: 2026-05-13-005
title: "Refi Max LTV Cap — Calibration, No-NULL Enforcement, and Admin UI"
status: active
created: 2026-05-13
author: Replit Agent
---

## Problem Frame

### Root cause: IRR inflation from uncapped refi proceeds

`SEED_REFI_MAX_LTV_TO_ORIGINAL = 1.00` is stored at the property level on all seeded
properties. The engine cap (`refiMaxLtvToOriginal × purchasePrice`) is therefore
effectively `purchasePrice × 1.00`, meaning a Full Equity property can receive 100% of
its original cost back as refi loan proceeds while still owning the asset. Net equity
invested approaches zero; IRR approaches infinity.

The correct cap is **0.70** (70% of purchase price). The engine already applies the cap
against `purchasePrice` only — not purchase + improvements. No engine changes needed.

### Design rule: no NULLs in assumption fields

Assumption fields must never be NULL in the database. The admin model default exists so
that every property has a valid value even if a user never visits its edit screen. A NULL
is a silent bug: the engine falls back at runtime, but that fallback is invisible and
fragile. All properties must carry explicit values so the DB state is always the source
of truth for what the engine will compute.

**How creation already handles this:** `createPropertyRecord` calls
`hydratePropertyFinancials` (CC's `artifacts/api-server/src/defaults.ts`) which writes
`refiMaxLtvToOriginal` from `model_defaults` key `mc.funding.refiMaxLtvToOriginal`
(currently `0.70`) onto any property row where the field is still NULL. This runs before
the DB insert, so **new properties always get an explicit value**. The issue is
exclusively pre-existing rows seeded with `1.00`.

### Admin UI gap

The admin has no way to view or adjust the `refiMaxLtvToOriginal` default. It lives in
`model_defaults` as `mc.funding.refiMaxLtvToOriginal` (correctly set to `0.70`) but is
not exposed in the Admin → Model Defaults → Property Underwriting panel.

### Display bug (U3)

The property-edit slider added by Replit (commit `feat(property-edit): wire
refiMaxLtvToOriginal slider`) displays `0.70×` (a multiplier) instead of `70%` (a
percentage). Users think of this as "70% of purchase price", not as "0.70×".

---

## Scope — Four Phases

| # | What | Primary files | Notes |
|---|------|--------------|-------|
| P1 | Seed constant: `1.00` → `0.70` | `artifacts/api-server/src/seeds/property-data.ts` | One line |
| P2 | DB migration: enforce no-NULL + recalibrate all bad rows | New migration + runtime guard | ALL properties, not just refinancing ones |
| P3 | Admin UI: add `refiMaxLtvToOriginal` to Property Underwriting → Refinance Terms | `artifacts/hospitality-business-portal/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx` | Follow STR platform fee pattern |
| P4 | Display fix: U3 slider shows `70%` not `0.70×` | `artifacts/hospitality-business-portal/src/components/property-edit/CapitalStructureSection.tsx` | Format + tooltip only |

**Do not touch:**
- `lib/engine/src/` — engine cap logic is correct
- `lib/shared/src/constants-funding.ts` — `DEFAULT_REFI_MAX_LTV_TO_ORIGINAL = 0.70` is correct
- `artifacts/api-server/src/defaults.ts` — hydration already covers this field

---

## P1 — Seed constant correction

**File:** `artifacts/api-server/src/seeds/property-data.ts`

Change line ~116:
```
const SEED_REFI_MAX_LTV_TO_ORIGINAL = 1.00;
```
to:
```
const SEED_REFI_MAX_LTV_TO_ORIGINAL = 0.70;
```

This stops any future re-seed from writing the bad value. The constant is already used
correctly on all properties that reference it.

**Test scenarios:**
- Constant reads `0.70` after change
- No remaining literal `1.00` used for this field anywhere in the file

---

## P2 — DB migration: no-NULL enforcement + recalibration

### Design rule applied here

The migration must fix **every** property — not just ones currently set to refinance.
A property that has `will_refinance = 'No'` today may be switched to `'Yes'` by a user
tomorrow without ever visiting the refinance assumptions screen. When that happens,
`refiMaxLtvToOriginal` must already carry a valid value. NULLs are never acceptable.

### Files

- **Migration:** `artifacts/api-server/src/migrations/properties-refi-ltv-recalibration-001.ts`
- **Runtime guard:** `artifacts/api-server/src/startup/runtime-guards/properties-refi-ltv-recalibration-001.ts`
- **Guard registration:** `artifacts/api-server/src/startup/runtime-guards/index.ts` (or
  equivalent — follow the same pattern as `properties-refi-ltv-cap-001.ts` added in Plan
  2026-05-13-003)

### Migration SQL intent

```sql
-- Fix all properties: set explicit 0.70 where NULL or over-calibrated
UPDATE properties
SET refi_max_ltv_to_original = 0.70
WHERE refi_max_ltv_to_original IS NULL
   OR refi_max_ltv_to_original > 0.70;
```

No `will_refinance` filter. Every property row must have an explicit, valid value.

### Runtime guard logic

```
FAIL if: COUNT(*) > 0
  FROM properties
  WHERE refi_max_ltv_to_original IS NULL
     OR refi_max_ltv_to_original > 0.70

Error message: "Migration properties-refi-ltv-recalibration-001 has not run.
  N properties have refi_max_ltv_to_original NULL or > 0.70.
  Run the migration and restart."
```

Guard must run at every boot (registered in the guard runner), not just once.

**Test scenarios:**
- Migration is idempotent: running twice does not error and does not change rows a
  second time
- Properties with `will_refinance = 'No'` are updated (no filter exclusion)
- Properties already at `0.70` or below are untouched
- Properties with NULL are set to `0.70`
- Runtime guard passes cleanly after migration
- Runtime guard throws with a clear message when a bad row exists

---

## P3 — Admin UI: Refinance Terms field

**File:** `artifacts/hospitality-business-portal/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx`

### Pattern

Follow the **STR Platform Fee** field pattern already in this file (~lines 130–164 and
807–835). It fetches a specific `model_defaults` row directly, holds local `useState`
draft, and patches the row on explicit Save — **separate from** the main
`globalAssumptions` draft/save cycle. This is correct because `refiMaxLtvToOriginal`
lives in `model_defaults`, not in `globalAssumptions.debtAssumptions`.

### Query

```ts
const { data: refiMaxLtvRow, refetch: refetchRefiMaxLtv } = useQuery({
  queryKey: ["model-defaults", "funding", "refiMaxLtvToOriginal"],
  queryFn: async () => {
    const res = await fetch(
      "/api/admin/model-defaults?category=management_company&cardKey=funding",
      { credentials: "include" },
    );
    if (!res.ok) throw new Error("Failed to fetch refi LTV cap default");
    const json = await res.json() as {
      rows: Array<{ id: number; defaultKey: string; value: unknown }>;
    };
    return json.rows.find(r => r.defaultKey === "mc.funding.refiMaxLtvToOriginal") ?? null;
  },
});
```

If the `cardKey=funding` filter doesn't return the row, omit the `cardKey` param and
filter by `defaultKey` client-side. The row is guaranteed to exist (`REQUIRED_MODEL_DEFAULT_KEYS`
— boot fails if absent).

### Local state + sync

```ts
const [refiMaxLtvDraft, setRefiMaxLtvDraft] = useState("");
useEffect(() => {
  if (refiMaxLtvRow?.value != null)
    setRefiMaxLtvDraft(Math.round((refiMaxLtvRow.value as number) * 100).toString());
}, [refiMaxLtvRow]);
```

### Save handler

```ts
const saveRefiMaxLtv = async () => {
  if (!refiMaxLtvRow) return;
  const parsed = parseFloat(refiMaxLtvDraft);
  if (!Number.isFinite(parsed) || parsed < 30 || parsed > 150) return;
  try {
    await apiRequest("PATCH", `/api/admin/model-defaults/${refiMaxLtvRow.id}`, {
      value: parsed / 100,
      reason: "Admin updated refi max LTV cap default",
    });
  } catch { /* preserve fire-and-forget */ }
  refetchRefiMaxLtv();
};
```

### Field placement

Add at the **end** of the "Refinance Terms" `<Section>` block, after Refinance Closing
Costs and before the closing `</Section>` tag (~line 652).

### Field JSX

```tsx
<div className="space-y-2" data-testid="field-refiMaxLtvToOriginal">
  <Label className="label-text text-foreground flex items-center gap-1.5">
    Max Loan vs. Purchase Price
    <InfoTooltip text="Caps the refinance loan as a percentage of the original purchase price. 70% means the refi loan cannot exceed 70% of the purchase price, regardless of how much the property has appreciated. Applies to new properties; each property stores its own value once saved." />
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
          setRefiMaxLtvDraft(Math.round((refiMaxLtvRow.value as number) * 100).toString());
      }}
    >
      Cancel
    </Button>
    <Button size="sm" variant="outline" onClick={saveRefiMaxLtv}>
      Save
    </Button>
  </div>
  <p className="text-xs text-muted-foreground">
    Recommended: 65%–75%. Lower values reduce equity extraction at refinancing and
    produce more realistic IRR projections.
  </p>
</div>
```

All imports (`useState`, `useEffect`, `useQuery`, `Input`, `Label`, `Button`,
`InfoTooltip`, `apiRequest`) are already present in this file.

**Test scenarios:**
- Field renders with `70` pre-filled (from the stored `0.70` value)
- Typing `65` and clicking Save sends `PATCH` with `{ value: 0.65 }`
- Cancel resets input to the last saved value
- Values outside 30–150 are not saved (guard in save handler)
- Helper text visible below the input

---

## P4 — Property edit display fix (U3)

**File:** `artifacts/hospitality-business-portal/src/components/property-edit/CapitalStructureSection.tsx`

The slider is already wired correctly (Replit U3 commit). Only the display format and
tooltip need changing. Do not change `onChange`, `min`, `max`, `step`, or the dollar cap
calculation.

### Changes

**Value badge** — change from:
```tsx
{((draft.refiMaxLtvToOriginal ?? DEFAULT_REFI_MAX_LTV_TO_ORIGINAL)).toFixed(2)}×
```
to:
```tsx
{Math.round((draft.refiMaxLtvToOriginal ?? DEFAULT_REFI_MAX_LTV_TO_ORIGINAL) * 100)}%
```

**Tooltip text** — change from:
```
"Caps the refinance loan at a multiple of the original purchase price, preventing
excessive leverage regardless of appraised value. 1.0× = loan cannot exceed purchase
price; 1.5× = loan capped at 150% of purchase price."
```
to:
```
"Caps the refinance loan as a percentage of the original purchase price, preventing
equity stripping regardless of appraised value at refinancing. 70% means the loan
cannot exceed 70% of what the property originally cost to purchase."
```

**Helper text** — change from:
```tsx
Cap: ${...}
```
to:
```tsx
Max refi loan: ${...}
```
(dollar calculation unchanged — same formula)

**Slider range** — tighten upper bound from `max={200}` to `max={150}`. A cap above
150% of purchase price is economically incoherent for this use case.

**Test scenarios:**
- Value `0.70` renders as `"70%"` in the badge
- Moving slider to position that stores `0.65` renders `"65%"`
- Tooltip contains no `×` or "multiple" language
- Helper text shows correct dollar cap amount
- No change to how the value is stored or sent to the server

---

## Sequencing

All four phases are independent and can be executed in parallel. Suggested order for a
single developer:

```
P1  →  commit (one line, zero risk)
P2  →  commit (migration + guard)
P3  →  commit (admin UI)
P4  →  commit (display fix)
```

P2 migration must be verified idempotent before merging.

---

## Verification Gates

Run before marking complete:

```bash
pnpm run typecheck
pnpm run check:lint
pnpm --filter @workspace/scripts run check:magic-numbers
pnpm --filter @workspace/scripts run check:migration-guards
pnpm --filter @workspace/scripts run check:schema-drift
```

After server restart:
1. Boot succeeds with no runtime guard errors (P2 migration ran)
2. Property edit → Refinance Terms → slider shows `70%` not `0.70×` (P4)
3. Admin → Model Defaults → Property Underwriting → Refinance Terms shows "Max Loan vs.
   Purchase Price" field with value `70` and `% of purchase price` label (P3)
4. Change admin field to `65`, Save → confirm `model_defaults` row updated to `0.65`
5. Query `SELECT COUNT(*) FROM properties WHERE refi_max_ltv_to_original IS NULL OR
   refi_max_ltv_to_original > 0.70` returns `0` (P2)

---

## Architecture notes for CC

- **Engine is untouched.** Both cap paths in `loanCalculations.ts` and `refinance-pass.ts`
  already multiply `refiMaxLtvToOriginal × property.purchasePrice` — purchase price only,
  not total cost basis. This is correct.
- **Creation path is already correct.** `createPropertyRecord` →
  `hydratePropertyFinancials` writes `refiMaxLtvToOriginal` from model_defaults at insert
  time. New properties will never have NULL for this field as long as the model_defaults
  row exists (boot-guarded by `REQUIRED_MODEL_DEFAULT_KEYS`).
- **The no-NULL rule is a broader platform principle.** This plan enforces it for
  `refiMaxLtvToOriginal`. Future migrations for any new assumption column should follow
  the same pattern: write the model default to every existing property row, not rely on
  runtime NULL fallback.
- **model_defaults row value is already correct.** `mc.funding.refiMaxLtvToOriginal` is
  seeded from `DEFAULT_REFI_MAX_LTV_TO_ORIGINAL = 0.70`. Only the per-property rows need
  fixing (P2) and the seed constant (P1).
- **Existing guard:** `properties-refi-ltv-cap-001.ts` (Plan 2026-05-13-003) guards the
  column's existence. P2 adds a new guard for the recalibration — do not modify the
  existing guard.
