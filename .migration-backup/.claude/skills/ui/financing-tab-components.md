---
name: Financing Tab Components
description: Sub-components for the FinancingAnalysis page — 4 tab panels and shared input helpers
---

# Financing Tab Components

## Purpose
Documents the extracted tab components under `client/src/components/financing/`. The `FinancingAnalysis` page shell (~90 lines) imports these and renders them conditionally based on `activeTab` state.

## File Map

| File | Exports | Purpose |
|------|---------|---------|
| `InputField.tsx` | `InputField`, `formatPct`, `formatRatio` | Labeled numeric input with suffix/prefix; formatters for display |
| `DSCRTab.tsx` | `DSCRTab` | Debt Service Coverage Ratio sizing calculator; fetches `/api/financing/dscr` |
| `DebtYieldTab.tsx` | `DebtYieldTab` | Debt yield analysis; fetches `/api/financing/debt-yield` |
| `StressTestTab.tsx` | `StressTestTab` | Financing stress test with 7×7 DSCR matrix; fetches `/api/financing/sensitivity` |
| `PrepaymentTab.tsx` | `PrepaymentTab` | Prepayment penalty calculator; fetches `/api/financing/prepayment` |
| `index.ts` | barrel | Re-exports all 5 |

> **Note:** The inner function was named `SensitivityTab` in the original page but renamed to `StressTestTab` here to avoid collision with the `SensitivityAnalysis` page.

## Import Pattern

```ts
import { DSCRTab, DebtYieldTab, StressTestTab, PrepaymentTab } from "@/components/financing";
import { InputField, formatPct, formatRatio } from "@/components/financing";
```

## Page Shell Pattern (`FinancingAnalysis.tsx`)

```tsx
const TABS = ["dscr", "debt-yield", "sensitivity", "prepayment"] as const;

{activeTab === "dscr" && <DSCRTab />}
{activeTab === "debt-yield" && <DebtYieldTab />}
{activeTab === "sensitivity" && <StressTestTab />}
{activeTab === "prepayment" && <PrepaymentTab />}
```

## InputField Props

```ts
interface InputFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  type?: "number";
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  prefix?: string;
  helpText?: string;
  "data-testid"?: string;
}
```

## Each Tab Is Self-Contained
- Owns its own local state (inputs, results, loading)
- Fetches its own API endpoint
- No props required — all data comes from internal fetch on user interaction
- Uses `InputField` for all numeric inputs

## Related Files
- `client/src/pages/FinancingAnalysis.tsx` — 90-line shell (state, tab nav, conditional render)
- `server/routes/financing.ts` — API endpoints for all 4 tabs
