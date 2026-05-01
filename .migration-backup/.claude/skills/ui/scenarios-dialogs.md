---
name: Scenarios Dialog Components
description: Extracted modal dialog components for the Scenarios page — Save, Edit, Compare
---

# Scenarios Dialog Components

## Purpose
Documents the extracted dialog components under `client/src/components/scenarios/`. The `Scenarios` page (~350 lines) owns all React Query hooks, state, and handlers; these components are pure JSX with props.

## File Map

| File | Exports | Purpose |
|------|---------|---------|
| `types.ts` | `ScenarioCompareResult` | Shared interface for the compare API response |
| `SaveScenarioDialog.tsx` | `SaveScenarioDialog` | "Save As" modal — name + description inputs |
| `EditScenarioDialog.tsx` | `EditScenarioDialog` | Edit scenario name/description modal |
| `CompareResultDialog.tsx` | `CompareResultDialog` | Side-by-side scenario diff display; contains `formatDiffValue` helper |
| `index.ts` | barrel | Re-exports all 3 + `ScenarioCompareResult` type |

## Import Pattern

```ts
import {
  SaveScenarioDialog,
  EditScenarioDialog,
  CompareResultDialog,
  type ScenarioCompareResult,
} from "@/components/scenarios";
```

## Props Reference

### SaveScenarioDialog
```ts
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (name: string) => void;
  description: string;
  onDescriptionChange: (desc: string) => void;
  onSave: () => void;
  isPending: boolean;
}
```

### EditScenarioDialog
```ts
interface Props {
  scenario: { id: number; name: string; description: string } | null;
  onNameChange: (name: string) => void;
  onDescriptionChange: (desc: string) => void;
  onClose: () => void;
  onSave: () => void;
  isPending: boolean;
}
// open is derived from scenario !== null
```

### CompareResultDialog
```ts
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: ScenarioCompareResult | null;
}
// result is null while loading — dialog shows skeleton
```

### ScenarioCompareResult
```ts
interface ScenarioCompareResult {
  scenario1: { id: number; name: string };
  scenario2: { id: number; name: string };
  assumptionDiffs: Array<{ field: string; scenario1: unknown; scenario2: unknown }>;
  propertyDiffs: Array<{
    name: string;
    status: "added" | "removed" | "changed";
    changes?: Array<{ field: string; scenario1: unknown; scenario2: unknown }>;
  }>;
}
```

## Architecture Notes
- **State stays in `Scenarios.tsx`** — React Query hooks (`useCreateScenario`, `useUpdateScenario`, `useCompareScenarios`), all handlers, and dialog open/close state all live in the page. Dialogs are stateless JSX.
- **`formatDiffValue`** is co-located in `CompareResultDialog.tsx` — it's only used there, not a shared utility.
- **`editingScenario`** acts as both open flag and data carrier for `EditScenarioDialog` — `scenario !== null` means open.

## Related Files
- `client/src/pages/Scenarios.tsx` — ~350-line shell with all hooks and state
- `server/routes/scenarios.ts` — compare endpoint: `GET /api/scenarios/:id1/compare/:id2`
