---
name: centralized-services
description: Centralized services model — cost-plus markup, vendor cost derivation, gross profit, service templates, and engine integration.
---

# Centralized Services Model

## Purpose
Documents the cost-plus markup model for centralized services (marketing, IT, etc.) that the management company provides to properties. The model computes vendor costs from existing fee revenue using a markup percentage, enabling gross profit analysis per service category.

## Business Model

Properties pay management fees for services. Some services are "centralized" (the company contracts a vendor and marks up), others are "direct" (company provides directly, no vendor cost).

```
Property pays fee → Management Company receives fee as revenue
  ├── Centralized: vendorCost = fee / (1 + markup), grossProfit = fee - vendorCost
  └── Direct: vendorCost = 0, grossProfit = fee (100% margin)
```

### Cost-Plus Markup Math
- `vendorCostFromFee(fee, markup)` = fee / (1 + markup)
- `grossProfitFromFee(fee, markup)` = fee - vendorCost = fee × markup / (1 + markup)
- `feeFromVendorCost(vendorCost, markup)` = vendorCost × (1 + markup)
- `effectiveMargin(markup)` = markup / (1 + markup)
- Identity: vendorCost + grossProfit = fee (always)

Example: 20% markup on $12,000 fee → $10,000 vendor cost, $2,000 gross profit (16.67% margin)

## Key Files

| File | Purpose |
|------|---------|
| `calc/services/margin-calculator.ts` | Pure math: vendorCostFromFee, grossProfitFromFee, feeFromVendorCost, effectiveMargin |
| `calc/services/cost-of-services.ts` | Aggregator: computeCostOfServices(fees, templates) → AggregatedServiceCosts |
| `calc/services/types.ts` | ServiceTemplate, ServiceCategoryBreakdown, AggregatedServiceCosts types |
| `shared/schema.ts` | `serviceTemplates` table (id, name, defaultRate, serviceModel, serviceMarkup, isActive, sortOrder) |
| `server/routes/admin/services.ts` | CRUD API routes for service templates |
| `server/storage.ts` | IStorage methods: getServiceTemplates, createServiceTemplate, updateServiceTemplate, deleteServiceTemplate |
| `client/src/lib/api/services.ts` | React Query hooks: useServiceTemplates, useCreate/Update/Delete/Sync |
| `client/src/components/admin/ServicesTab.tsx` | Admin UI for managing service templates |
| `client/src/components/company/CompanyIncomeTab.tsx` | Cost of Services display in Company P&L |
| `client/src/pages/Company.tsx` | Passes service templates to generateCompanyProForma |
| `.claude/tools/analysis/cost-of-services-aggregator.json` | Deterministic tool schema |

## Engine Integration

`generateCompanyProForma()` accepts an optional `serviceTemplates` parameter:

```typescript
generateCompanyProForma(properties, global, months, serviceTemplates?)
```

When templates are provided:
1. Engine computes fee revenue per category from property fee schedules
2. `computeCostOfServices(feesByCategory, templates)` derives vendor costs
3. `totalVendorCost` subtracted from revenue to get `grossProfit`
4. `netIncome = totalRevenue - totalVendorCost - totalExpenses`

When templates are NOT provided (backward compatible):
- `totalVendorCost = 0`
- `grossProfit = totalRevenue`
- `costOfCentralizedServices = null`

## CompanyMonthlyFinancials Fields

```typescript
totalRevenue: number;
costOfCentralizedServices: AggregatedServiceCosts | null;
totalVendorCost: number;
grossProfit: number;
```

## AggregatedServiceCosts Shape

```typescript
interface AggregatedServiceCosts {
  byCategory: Record<string, ServiceCategoryBreakdown>;
  totalVendorCost: number;
  totalGrossProfit: number;
  centralizedRevenue: number;
  directRevenue: number;
}

interface ServiceCategoryBreakdown {
  revenue: number;
  vendorCost: number;
  grossProfit: number;
  markup: number;
  serviceModel: 'centralized' | 'direct';
}
```

## Service Template Schema

```typescript
interface ServiceTemplate {
  id: number;
  name: string;
  defaultRate: number;       // Fee rate (e.g., 0.02 = 2%)
  serviceModel: 'centralized' | 'direct';
  serviceMarkup: number;     // Markup percentage (e.g., 0.20 = 20%)
  isActive: boolean;
  sortOrder: number;
}
```

## Edge Cases
- Empty templates array → same as no templates (totalVendorCost=0)
- Fee category not in templates → treated as direct (zero vendor cost)
- Inactive templates → ignored (fee treated as direct)
- Zero fee amount → zero vendor cost, zero gross profit
- Negative markup → throws error

## Tests (63 tests)

| File | Tests | Coverage |
|------|-------|----------|
| `tests/calc/services/margin-calculator.test.ts` | 31 | Pure math, algebraic identities, edge cases |
| `tests/calc/services/cost-of-services.test.ts` | 17 | Aggregation, zero-sum, edge cases |
| `tests/engine/centralized-services.test.ts` | 15 | Engine integration, backward compat, cash flow |

## Related Rules
- `rules/financial-engine.md` — Engine architecture
- `rules/recalculate-on-save.md` — Service template mutations must invalidate all financial queries
- `rules/no-hardcoded-values.md` — Service markup rates come from DB
