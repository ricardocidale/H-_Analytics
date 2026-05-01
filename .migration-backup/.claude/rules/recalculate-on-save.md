# Recalculate on Save

Every financial mutation's `onSuccess` MUST call `invalidateAllFinancialQueries(queryClient)` from `@/lib/api`. Never hand-pick individual query keys.

```typescript
// CORRECT
import { invalidateAllFinancialQueries } from "@/lib/api";
onSuccess: () => { invalidateAllFinancialQueries(queryClient); }

// WRONG — misses properties, scenarios, research...
onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["globalAssumptions"] }); }
```

## What Triggers Recalculation

Any mutation touching: global assumptions, property assumptions, fee categories, property create/delete, funding, partner comp, staffing, overhead, tax/exit/commission rates, scenario save/load/delete.

## Exempt Mutations (no recalculation needed)

Design themes, logos, asset descriptions, profile updates, session management, property finder favorites, admin research config (`useSaveResearchConfig` — affects prompt behavior only, not financial calculations).

## Enforcement

`tests/proof/recalculation-enforcement.test.ts` — static analysis verifying every financial mutation calls the helper. Failures produce ADVERSE verification opinion.

When adding new financial queries: nest under an existing key prefix in `ALL_FINANCIAL_QUERY_KEYS` (in `api.ts`), or add a new base key to that array.
