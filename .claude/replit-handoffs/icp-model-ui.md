# ICP Model Selection UI — Funding Tab Analyst Gate

> **CC already shipped:** `shared/constants-benchmarks.ts` (3 model profiles A/B/C), `shared/schema/config.ts` (`icpModelTier` column), migration, and the server gate in `server/routes/analyst-admin.ts`. When `icpModelTier` is null the server returns `400 { code: "ICP_MODEL_REQUIRED", models: { A: {...}, B: {...}, C: {...} } }`.
>
> **Replit owns:** the UI — model selection dialog, saving the choice, auto-refire, and the pre-selection badge state on the Funding tab.

## What to build (3 tasks)

---

### Task A — Handle `ICP_MODEL_REQUIRED` in `useAnalystRefresh.ts`

**File:** `client/src/components/analyst/useAnalystRefresh.ts`

In the `onError` handler (around line 202), after the `REQUIRED_FIELDS_MISSING` check, add a parallel check for `ICP_MODEL_REQUIRED`:

```typescript
if (body.code === "ICP_MODEL_REQUIRED" && body.models && onIcpModelRequired) {
  onIcpModelRequired(body.models);
  return;
}
```

Also add `onIcpModelRequired` to the hook's options interface:

```typescript
onIcpModelRequired?: (models: Record<string, {
  tier: string;
  label: string;
  tagline: string;
  propertyCount: { min: number; typical: number; max: number };
  targetRaiseUsd: { min: number; typical: number; max: number };
  runwayBufferMonths: number;
  sizingOvershootPct: number;
}>) => void;
```

---

### Task B — Build `<IcpModelDialog />` and wire it into the Funding tab

**New file:** `client/src/components/analyst/IcpModelDialog.tsx`

A dialog that receives `models` (the 3 profiles from the 400 response) and lets the user pick one. On pick:
1. Call `PATCH /api/global-assumptions` with `{ icpModelTier: "A" | "B" | "C" }` — use the existing `useUpdateAdminConfig()` mutation from `@/lib/api`.
2. On success, close dialog and automatically refire the AnalystButton (call `triggerRefresh()` from `useAnalystRefresh`).

**Design — 3 cards side by side (or stacked on mobile):**

Each card shows:
- Large letter (A / B / C) in a circle, amber accent
- Bold label: "Boutique" / "Growth" / "Platform"
- Tagline: "3–5 properties · Founder-led · Lean overhead" (etc.)
- 3 key numbers: typical raise size, runway buffer, properties managed
- A "Select" button; selected card gets a checkmark + primary border

**Voice (per `the-analyst-persona.md`):**
- Dialog headline: *"The Analyst needs to know your scale"*
- Body: *"To range your funding plan, pick the model that best fits your management company today. You can change this any time."*
- NOT: "Please select", "Required field", "Form validation"

**Wire it** into `CompanyAnalystOverlay.tsx` (the component that wraps the AnalystButton on the Funding tab). Add `onIcpModelRequired` to the `useAnalystRefresh` call there; when triggered, open the `<IcpModelDialog />`.

---

### Task C — Pre-selection state on the Funding tab Analyst badge

When `globalAssumptions.icpModelTier` is null, the Analyst badge / button on the Funding tab should show a **blue/muted state** (not the default amber "Ask the Analyst" state).

- Badge label: *"Select a model first"*
- Icon: a small building/office icon (Lucide `Building2`) or a question mark
- Tooltip: *"The Analyst needs to know your management company scale (A / B / C) before it can range your funding plan. Click to select."*
- Clicking it should open the `<IcpModelDialog />` directly (same dialog as Task B)

Read `globalAssumptions.icpModelTier` via `useGlobalAssumptions()` (already imported in the Company Assumptions page).

---

## Acceptance criteria

- [ ] Pressing the AnalystButton on Funding tab with no `icpModelTier` set opens the model selection dialog (not a generic error toast)
- [ ] User selects Model B → `icpModelTier: "B"` saved → Analyst reruns automatically → verdict appears
- [ ] Funding tab badge is visually distinct (blue/muted) when no model is selected
- [ ] After model selection, badge returns to normal amber state
- [ ] `vocabulary-compliance` test still passes (11/11)
- [ ] No new TypeScript errors

## API reference

```
// Save selected model (existing mutation, no new endpoint needed)
PATCH /api/global-assumptions
Body: { icpModelTier: "A" | "B" | "C" }

// The 400 response that triggers the dialog
{ code: "ICP_MODEL_REQUIRED", models: { A: {...}, B: {...}, C: {...} } }
// models shape matches IcpModelProfile from shared/constants-benchmarks.ts
```

## Do NOT touch

- `server/routes/analyst-admin.ts` — CC-owned, already done
- `shared/constants-benchmarks.ts` — CC-owned, already done
- `shared/schema/config.ts` — CC-owned, already done
- Any financial engine files
