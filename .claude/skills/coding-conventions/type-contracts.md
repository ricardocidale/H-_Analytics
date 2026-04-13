---
name: type-contracts
description: Four-layer type pipeline (Schema → API → Financial Engine → UI) covering JSONB flattening, naming conventions, and the top-down field flow rule.
---

Type contract pipeline for the hospitality financial model. Maps the four-layer type hierarchy from database schema through API, financial engine, and UI components. Covers JSONB flattening, naming conventions, and the rule that new fields flow top-down. Use this skill when adding new data fields, modifying engine types, or tracing data flow.

## Four-Layer Type Pipeline

```
Schema (shared/schema.ts)
  ↓ Drizzle ORM types, JSONB columns
API (client/src/lib/api/types.ts)
  ↓ Flattened JSONB, Response suffix
Financial Engine (client/src/lib/financial/types.ts)
  ↓ Input suffix, engine-specific fields
UI (client/src/components/property-detail/types.ts)
  ↓ YearlyDetail aggregation, component props
```

### Layer 1: Schema (`shared/schema.ts`)

Drizzle ORM table definitions. Source of truth for database structure.

- Types generated via `typeof table.$inferSelect` (select) and `createInsertSchema` (insert)
- JSONB columns store nested objects as single database fields
- Examples: `debtAssumptions`, `assetDefinition`, `standardAcqPackage`, `icpConfig`

```typescript
export const globalAssumptions = pgTable("global_assumptions", {
  id: serial("id").primaryKey(),
  debtAssumptions: jsonb("debt_assumptions").$type<DebtAssumptions>(),
  assetDefinition: jsonb("asset_definition").$type<AssetDefinition>(),
  // ...
});

export type GlobalAssumptions = typeof globalAssumptions.$inferSelect;
export const insertGlobalAssumptionsSchema = createInsertSchema(globalAssumptions).omit({ id: true });
export type InsertGlobalAssumptions = z.infer<typeof insertGlobalAssumptionsSchema>;
```

**Rules:**
- Every model has three exports: the table, the select type, and the insert schema/type
- Insert schemas use `.omit()` to exclude auto-generated fields (id, createdAt, etc.)
- JSONB columns use `.$type<T>()` for TypeScript type safety

### Layer 2: API (`client/src/lib/api/types.ts`)

Response types for API endpoints. **JSONB fields are flattened** into top-level properties.

```typescript
// Schema has: debtAssumptions: jsonb
// API flattens to:
export interface GlobalResponse {
  id: number;
  // Flattened from debtAssumptions JSONB:
  debtAssumptions: {
    acqLTV: number;
    refiLTV: number;
    interestRate: number;
    amortizationYears: number;
    acqClosingCostRate: number;
    refiClosingCostRate: number;
  };
  // Flattened from assetDefinition JSONB:
  assetDefinition: {
    minRooms: number;
    maxRooms: number;
    hasFB: boolean;
    // ...
  };
  // Direct scalar fields remain the same:
  projectionYears: number;
  inflationRate: number;
  // ...
}
```

**Naming convention:** Types at this layer use the `Response` suffix:
- `PropertyResponse` — property data returned from API
- `GlobalResponse` — global assumptions from API
- `ScenarioResponse` — scenario snapshot from API
- `FeeCategoryResponse` — fee category from API
- `MarketResearchResponse` — research data from API

### Layer 3: Financial Engine (`client/src/lib/financial/types.ts`)

Engine input/output interfaces. These are the contracts between API data and calculation logic.

**Input types use the `Input` suffix:**
- `PropertyInput` — per-property assumptions consumed by `generatePropertyProForma()`
- `GlobalInput` — model-wide assumptions consumed by both engines

```typescript
export interface PropertyInput {
  operationsStartDate: string;
  roomCount: number;
  startAdr: number;
  costRateRooms: number;
  // Optional fields use ? — engine applies fallback constants
  acquisitionLTV?: number | null;
  acquisitionInterestRate?: number | null;
  // Fee categories override flat rate when present
  feeCategories?: { name: string; rate: number; isActive: boolean }[];
}
```

**Output types describe engine results:**
- `MonthlyFinancials` — one month of property engine output (revenue, expenses, NOI, debt, cash flow)
- Company engine outputs follow the same monthly structure

**Nullability rules:**
- Required fields: no `?` or `| null`
- Optional fields: `?` or `| null` — engine uses fallback constants from `shared/constants.ts`
- Never pass `0` to mean "use default" — use `undefined`

### Layer 4: UI (`client/src/components/property-detail/types.ts`)

Component prop interfaces and aggregated display types.

**`YearlyDetail`** — yearly aggregation of monthly engine output for table/chart display:
```typescript
export interface YearlyDetail {
  revenueTotal: number;
  revenueRooms: number;
  // ... all income statement lines
  gop: number;
  noi: number;
  cashFlow: number;
}
```

**Component prop interfaces:**
- `IncomeStatementTabProps` — income data + chart data + global assumptions
- `CashFlowTabProps` — cash flow data + loan parameters
- `PropertyHeaderProps` — property identity + photo upload callback
- `PPECostBasisScheduleProps` — depreciation schedule inputs

## JSONB Flattening at the API Layer

The server's route handlers flatten JSONB columns before sending to the client:

```
Database (JSONB column)          →  API Response (flat properties)
────────────────────────────────    ──────────────────────────────
debt_assumptions: {                debtAssumptions: {
  acq_ltv: 0.75,                    acqLTV: 0.75,
  interest_rate: 0.09              interestRate: 0.09
}                                  }
```

The API layer preserves the nested structure of JSONB but converts snake_case to camelCase. Complex nested objects (debtAssumptions, assetDefinition, standardAcqPackage) remain nested in the response.

## Adding a New Field (Top-Down Flow)

When adding a new data field, always flow top-down through the pipeline:

1. **Schema** (`shared/schema.ts`): Add the column to the Drizzle table definition
2. **API** (`client/src/lib/api/types.ts`): Add to the appropriate `Response` type
3. **Engine** (`client/src/lib/financial/types.ts`): Add to `PropertyInput` or `GlobalInput` if the engine needs it
4. **UI** (`client/src/components/property-detail/types.ts`): Add to `YearlyDetail` or component props if displayed

**Example: Adding a new cost rate**
```
shared/schema.ts:     costRateParking column in properties table
api/types.ts:         costRateParking in PropertyResponse
financial/types.ts:   costRateParking in PropertyInput
property-detail/:     parkingExpense in YearlyDetail
```

## Rules

- New fields always flow top-down: Schema → API → Engine → UI
- Never add a field to a downstream layer without the upstream layer having it
- `Response` suffix for API types, `Input` suffix for engine input types
- JSONB columns use `.$type<T>()` in the schema for type safety
- Insert schemas always `.omit()` auto-generated fields
- Optional engine inputs use `?` or `| null` — the engine applies constants as fallbacks
- The schema in `shared/schema.ts` is the single source of truth for data shape

## Key Files

| File | Purpose |
|------|---------|
| `shared/schema.ts` | Drizzle ORM schema — Layer 1 |
| `client/src/lib/api/types.ts` | API response types — Layer 2 |
| `client/src/lib/financial/types.ts` | Engine input/output types — Layer 3 |
| `client/src/components/property-detail/types.ts` | UI aggregation types — Layer 4 |
