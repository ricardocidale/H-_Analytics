# Server-Side Financial Engine Migration — Plan & Execute

You are working on a hospitality financial analytics platform (H+ Analytics / HBG). An independent audit has been completed. This document contains the full findings, the current architecture, and a 13-phase plan. **Read this entire document before writing any code. Plan first.**

---

## PART 1: WHAT THIS APP DOES

This is a real estate private equity simulation platform for boutique hotel portfolios. It models:

- **Property SPVs** (individual hotels): monthly pro-forma projections — revenue, expenses, GOP, NOI, ANOI, debt service, depreciation, income tax, net income, cash flow, balance sheet
- **Management Company** (OpCo): fee revenue from all properties, staffing tiers, partner compensation, G&A, funding/SAFE tranches
- **Consolidated Portfolio**: intercompany elimination, weighted metrics, portfolio IRR/equity multiple
- **Scenarios**: save/load/compare full financial snapshots with diff-based overrides
- **Research**: AI-generated market assumptions validated by deterministic calc tools
- **Exports**: PDF, Excel, CSV, PPTX, PNG, DOCX for every financial statement

The financial engines are **pure TypeScript** with zero browser dependencies. They currently live in `client/src/lib/financial/` but are imported by the server via `server/finance/service.ts`. The goal is to make the **server the single authoritative source** for all financial computations.

---

## PART 2: CURRENT ARCHITECTURE

### Where Calculations Run Today

| Layer | Location | Lines | What It Does |
|-------|----------|-------|-------------|
| Property engine | `client/src/lib/financial/property-engine.ts` | 295 | Monthly pro-forma for one hotel. Entry: `generatePropertyProForma(property, global, months)` → `MonthlyFinancials[]` |
| Company engine | `client/src/lib/financial/company-engine.ts` | 366 | Management company pro-forma. Entry: `generateCompanyProForma(properties, global, months)` → `CompanyMonthlyFinancials[]` |
| Assumption resolver | `client/src/lib/financial/resolve-assumptions.ts` | 347 | Resolves raw DB fields into engine-ready context (escalation, ramp, rates) |
| Yearly aggregator | `client/src/lib/financial/yearlyAggregator.ts` | 461 | Rolls monthly data into yearly summaries. Entry: `aggregatePropertyByYear(monthly, years)` |
| Consolidation | `client/src/lib/financial/consolidation.ts` | 154 | Combines all property yearly arrays into portfolio totals |
| Cash flow | `client/src/lib/financial/cashFlowAggregator.ts` | 130 | Yearly CFO/CFI/CFF aggregation |
| Refinance | `client/src/lib/financial/refinance-pass.ts` | 169 | Post-processing pass that rebuilds months after refinancing event |
| Loan math | `client/src/lib/financial/loanCalculations.ts` | 440 | PMT, amortization, refinance sizing, exit value, yearly debt service |
| Amortization | `client/src/lib/financial/amortization.ts` | 76 | Outstanding balance and period debt service helpers |
| Equity calcs | `client/src/lib/financial/equityCalculations.ts` | 74 | Total property cost, acquisition loan amount, equity invested |
| Funding predictor | `client/src/lib/financial/funding-predictor.ts` | 380 | SAFE funding runway analysis |
| Types | `client/src/lib/financial/types.ts` | 327 | All interfaces: `PropertyInput`, `GlobalInput`, `MonthlyFinancials`, etc. |

**Total: ~3,500 lines of pure TypeScript with zero React/DOM/browser dependencies.**

These engines import from:
- `calc/shared/decimal.ts` — `assertFinite`, `dPow`, `dDiv`, `dSum` (decimal-safe math)
- `calc/shared/pmt.ts` — loan payment formula
- `calc/refinance/` — refinance calculator
- `calc/services/` — cost-of-services aggregation
- `shared/constants.ts` — named constants and defaults
- `date-fns` — date parsing

### What Already Runs Server-Side

**`server/finance/service.ts` (120 lines)** — Already exists and works. It:
1. Imports `generatePropertyProForma` from the client engine (via `server/finance/core/property-pipeline.ts` re-export)
2. Imports `aggregatePropertyByYear` and `consolidateYearlyFinancials`
3. Runs `validateFinancialIdentities` from `calc/validation/` on each year
4. Returns `PortfolioComputeResult` with `outputHash` via `stableHash()`
5. Exposed at `POST /api/finance/compute`

**`calc/` directory (8,691 lines, 38 tools)** — Deterministic calculation tools:
- 6 returns tools (DCF, IRR, equity multiple, exit valuation, WACC, MIRR)
- 5 validation tools (financial identities, funding gates, schedules, assumptions, exports)
- 8 analysis tools (consolidation, scenario compare, break-even, waterfall, hold-vs-sell, stress test, capex reserve, RevPAR index)
- 5 financing tools (DSCR, debt yield, prepayment, sensitivity, loan comparison)
- 10 research tools (property metrics, depreciation basis, debt capacity, occupancy ramp, ADR projection, cap rate, cost benchmarks, service fee, markup waterfall, make-vs-buy)
- 2 services tools (centralized service margin, cost-of-services aggregator)

All registered in `calc/dispatch.ts` with `withRounding()` wrapper.

**`server/calculation-checker/` (~2,000 lines)** — Independent verification that re-implements ~40% of engine logic. Intentionally does NOT import from the client engine (independence rule).

### How the Client Currently Uses Engines

The React dashboard calls engines directly in `client/src/components/dashboard/usePortfolioFinancials.ts`:
```
React Query fetches raw data (properties, globalAssumptions) from /api/
  → usePortfolioFinancials hook calls generatePropertyProForma() in-browser
  → Aggregates, consolidates, memoizes in useRef
  → Renders charts, tables, KPIs
```

Every browser tab independently computes all financials. There is no cached server result.

### Scenario System

Scenarios are saved as full JSONB snapshots in the `scenarios` table:
- `globalAssumptions` (JSONB) — full copy of all assumptions
- `properties` (JSONB) — full copy of all properties
- `feeCategories` (JSONB) — per-property fee categories
- `propertyPhotos` (JSONB) — photo metadata

Diff engine in `server/scenarios/diff-engine.ts` computes deltas using `stableHash()` for deterministic comparison. Properties are matched by `name` field (not ID).

**Critical bug (C1 — unfixed):** `server/storage/financial.ts:244,252` — `loadScenario()` inserts restored properties with `userId` set to the logged-in user's ID instead of `null`. This makes restored properties invisible to all other users. The `portfolio-dynamics.md` rule requires `userId: null` for all shared data.

---

## PART 3: AUDIT FINDINGS (REMAINING)

Two complete audits have been performed. After Replit's fix pass, these findings remain:

### CRITICAL (1)

| # | File:Line | Issue |
|---|-----------|-------|
| C1 | `server/storage/financial.ts:244,247,252` | `loadScenario()` inserts properties and globalAssumptions with `userId` (logged-in user) instead of `null`. Line 244: `{ ...gaData, userId }`. Line 247: `delete ... where(eq(properties.userId, userId))` deletes only user-owned rows. Line 252: `{ ...propData, userId }`. Must use `null` for shared data per portfolio-dynamics rule. |

### HIGH (1)

| # | File:Line | Issue |
|---|-----------|-------|
| H1 | `calc/returns/mirr.ts:51` | `mirr: Number.isFinite(mirr) ? mirr : 0` silently coerces non-finite MIRR to 0. Violates financial-safety rule #3. Should return `NaN` or throw via `assertFinite()`. Downstream consumers may read `.mirr` without checking `.is_valid`. |

### MEDIUM (12)

| # | File:Line | Issue |
|---|-----------|-------|
| M1 | `server/routes/calculations.ts:55,100` | `report as any`, `latestRun.results as any` — verification results cast to `any` |
| M2 | `server/routes/scenarios.ts:76-79,132-135` | Scenario save/load casts all data to `any` (8 casts) |
| M3 | `server/storage/financial.ts:257,276` | `const feeCategoryValues: any[] = []`, `const photoValues: any[] = []` |
| M4 | `server/routes/uploads.ts:101` | `POST /api/uploads/process-image` has no rate limiting (sibling endpoint does) |
| M5 | `server/routes/scenarios.ts:117-143` | Scenario load doesn't validate property access in snapshot |
| M6 | `shared/schema/config.ts:192,195` | `icpConfig` and `exportConfig` JSONB typed as `Record<string, any>` |
| M7 | `shared/schema/intelligence.ts:14-15` | `content` and `promptConditions` JSONB typed as `Record<string, any>` |
| M8 | `shared/schema/audit.ts:35,65` | `activityLogs.metadata` and `verificationRuns.results` untyped JSONB |
| M9 | `shared/schema/scenarios.ts:13-17` | 5 JSONB snapshot fields lack `.$type<>()` annotations |
| M10 | `shared/schema/properties.ts:154-172` | Fields `arDays`, `apDays`, `reinvestmentRate`, `dayCountConvention`, `escalationMethod`, cost seg fields have `.default()` but no `.notNull()` — nullable despite having defaults |
| M11 | `calc/shared/utils.ts:54` | `pctChange(0, x)` returns 0 on zero baseline (undefined math) |
| M12 | `calc/shared/decimal.ts:19` | `dDiv(a, 0)` returns 0 silently (documented as safe-zero, callers pre-guard) |

### LOW (4)

| # | File:Line | Issue |
|---|-----------|-------|
| L1 | `server/routes/financing.ts:100` | Bare `catch {}` with no logging in DSCR outer handler |
| L2 | `shared/constants.ts:148,244,254` | Deprecated aliases `DEFAULT_TAX_RATE`, `DEFAULT_INFLATION_RATE` still exist; line 254 chains deprecated alias in new code |
| L3 | `shared/schema/config.ts:198-213` | `assetDefinition` default is 13-field hardcoded inline object |
| L4 | `client/src/lib/financial/company-engine.ts:199,212` | Fee accumulation uses `|| 0` instead of `?? 0` |

### Type Safety Summary (from deep scan)

- **83** `as any` casts in `server/` (highest: `syncHelpers.ts` 11, `admin/marcela.ts` 11, `scenarios.ts` 8)
- **53** `as any` in `client/src/lib/exports/` (XLSX/PPTX library limitations)
- **~100** non-null assertions `req.user!` in `server/routes/` (safe behind `requireAuth` but TypeScript can't infer)
- **0** `as any` in `calc/` — clean
- **0** `as any` in `shared/` — clean
- **3** `@ts-ignore`/`@ts-expect-error` in client (all justified — external lib limitations)

### Observability Summary

- **Logging**: 50% structured (`[LEVEL] [domain]` via `server/logger.ts`), 50% raw `console.error`
- **Sentry**: Fully integrated server-side (`server/sentry.ts`). No client-side React error boundary.
- **Health endpoints**: Only `GET /api/finance/health` (minimal, hardcoded response)
- **Pre-commit hooks**: None. No Husky, no lint-staged, no ESLint/Biome config.
- **Rate limiting**: Three tiers exist (login/API/middleware). 9+ endpoints protected. Gaps: `process-image`, `finance/compute`, `geocode`.
- **Activity logging**: Admin operations only. Financial mutations (property update, assumption save) not logged.
- **CI/CD**: 22 npm scripts, 10 Replit workflows. No GitHub Actions.

### Data Validation Summary

- **11 POST/PUT/PATCH handlers** skip Zod validation (research routes, geocode, market-rates, Google Drive, Twilio)
- **Research fallback path** (`server/routes/research.ts:234`) stores unvalidated AI output when property lookup fails
- **Financial field definitions** scattered across 6+ files with no central registry. Adding one field requires edits in: schema, constants, `buildPropertyDefaultsFromGlobal()`, Zod schema, engine, UI, tests (5-7 files).

---

## PART 4: THE 13-PHASE PLAN

### Phase 0: Critical Bug Fixes

Fix the remaining audit findings that are preconditions for migration work. Do these first.

**C1 — Scenario load userId bug:**
File: `server/storage/financial.ts`

Current (BROKEN):
```typescript
// Line 236: queries by userId
.where(eq(globalAssumptions.userId, userId))

// Line 244: inserts with userId
await tx.insert(globalAssumptions).values({ ...gaData, userId } as typeof globalAssumptions.$inferInsert);

// Line 247: deletes only user-owned properties
await tx.delete(properties).where(eq(properties.userId, userId));

// Line 252: inserts with userId
const [inserted] = await tx.insert(properties).values({ ...propData, userId } as typeof properties.$inferInsert).returning();
```

Fix:
```typescript
// Line 236: query shared row
.where(isNull(globalAssumptions.userId))

// Line 244: insert/update shared row
await tx.insert(globalAssumptions).values({ ...gaData, userId: null } as typeof globalAssumptions.$inferInsert);

// Line 247: delete shared properties
await tx.delete(properties).where(isNull(properties.userId));

// Line 252: insert as shared
const [inserted] = await tx.insert(properties).values({ ...propData, userId: null } as typeof properties.$inferInsert).returning();
```

Also update the method signature on line 231: the `userId` parameter is still needed for authorization checks but must NOT be used in insert/delete operations. Use it only for the scenario ownership check in the calling route (`server/routes/scenarios.ts`), not in the storage method.

**H1 — MIRR silent coercion:**
File: `calc/returns/mirr.ts`

Current (line 51):
```typescript
mirr: Number.isFinite(mirr) ? mirr : 0,
```

Fix — return NaN when computation fails, keep `is_valid` flag:
```typescript
mirr: Number.isFinite(mirr) ? mirr : NaN,
```

**L1 — Empty catch in financing:**
File: `server/routes/financing.ts`

Current (line 100):
```typescript
} catch {
  res.status(500).json({ error: "DSCR calculation failed" });
}
```

Fix:
```typescript
} catch (err) {
  logger.error(`DSCR calculation failed: ${err instanceof Error ? err.message : err}`, "financing");
  res.status(500).json({ error: "DSCR calculation failed" });
}
```

**Validation after Phase 0:**
```bash
npm run test:summary        # all tests pass
npm run verify:summary      # must show UNQUALIFIED
```

---

### Phase 1: Extract Shared Engine Package

**Goal**: Move the financial engines out of `client/` into a top-level `engine/` directory. Zero logic changes — pure file moves and import rewrites.

**Why**: The engines are pure TypeScript with no browser dependencies. They belong in a shared location that both client and server import from, not nested inside `client/src/lib/`.

Create this structure:
```
engine/
├── property/
│   ├── property-engine.ts        ← move from client/src/lib/financial/
│   ├── resolve-assumptions.ts
│   ├── refinance-pass.ts
│   └── types.ts
├── company/
│   └── company-engine.ts
├── aggregation/
│   ├── yearlyAggregator.ts
│   ├── consolidation.ts
│   ├── cashFlowAggregator.ts
│   ├── cashFlowSections.ts
│   └── analyzeCompanyCashPosition.ts
├── debt/
│   ├── loanCalculations.ts
│   ├── amortization.ts
│   └── equityCalculations.ts
├── funding/
│   └── funding-predictor.ts
├── helpers/
│   ├── portfolio-helpers.ts
│   └── utils.ts
└── index.ts                       ← barrel re-export of all public APIs
```

Update `tsconfig.json` path aliases:
```json
{ "paths": { "@engine/*": ["./engine/*"] } }
```

Leave backward-compat shims in `client/src/lib/financial/` that re-export from `@engine/`:
```typescript
// client/src/lib/financial/index.ts
export { generatePropertyProForma } from "@engine/property/property-engine";
export { generateCompanyProForma } from "@engine/company/company-engine";
// ... all public exports
```

Update `server/finance/core/property-pipeline.ts` and other re-export wrappers to import from `@engine/`.

**Validation**: Zero logic changes. All tests must pass unchanged. Run `npm run test:summary && npm run verify:summary`.

---

### Phase 2: Server-Authoritative Computation Service

**Goal**: Expand `server/finance/service.ts` to be the single authoritative computation endpoint. Add caching with `stableHash()`.

**Step 2.1**: Expand the `ComputeResult` to include everything dashboards need:

```typescript
export interface ComputeResult {
  hash: string;                                    // deterministic hash of inputs
  computedAt: string;                              // ISO timestamp
  engineVersion: string;
  perPropertyMonthly: Record<string, MonthlyFinancials[]>;   // NEW: monthly data
  perPropertyYearly: Record<string, YearlyPropertyFinancials[]>;
  companyMonthly: CompanyMonthlyFinancials[];       // NEW: management company
  companyYearly: any[];                             // NEW: company yearly
  consolidatedYearly: ConsolidatedYearlyFinancials[];
  validation: ValidationSummary;
  propertyCount: number;
  projectionYears: number;
}
```

The existing `computePortfolioProjection()` in `server/finance/service.ts:27-119` already runs property engines, aggregates yearly, consolidates, and validates. Expand it to also:
1. Store monthly data per property (currently discarded after aggregation)
2. Run `generateCompanyProForma()` for the management company
3. Run cash flow aggregation

**Step 2.2**: Add LRU cache.

Install `lru-cache`:
```bash
npm install lru-cache
```

```typescript
// server/finance/cache.ts
import { LRUCache } from "lru-cache";
import { stableHash } from "../scenarios/stable-json";

const cache = new LRUCache<string, ComputeResult>({ max: 200, ttl: 60_000 });

export function getCachedOrCompute(input: ComputePortfolioInput): ComputeResult {
  const key = stableHash({ properties: input.properties, global: input.globalAssumptions });
  const cached = cache.get(key);
  if (cached) return cached;
  const result = computeFullPortfolio(input);
  cache.set(key, result);
  return result;
}

export function invalidateComputeCache(): void {
  cache.clear();
}
```

**Step 2.3**: Wire cache invalidation into existing mutation flow.

The codebase already has `invalidateAllFinancialQueries(queryClient)` in `client/src/lib/api.ts` for client-side React Query invalidation. Add server-side cache invalidation to every financial mutation route:

In `server/routes/global-assumptions.ts`, `server/routes/properties.ts`, `server/routes/scenarios.ts` — after every successful mutation:
```typescript
import { invalidateComputeCache } from "../finance/cache";
// ... in onSuccess of mutation handler:
invalidateComputeCache();
```

**Step 2.4**: Expand API endpoints:

```
POST /api/finance/compute           — full portfolio (expand existing)
POST /api/finance/property/:id      — single property pro-forma
POST /api/finance/company           — management company pro-forma
GET  /api/finance/cache-status      — { size, hitRate, maxSize }
POST /api/finance/invalidate        — force cache bust (admin only)
```

**Recommended additional library** — `superjson` for lossless JSON transport:
```bash
npm install superjson
```

Financial results contain edge cases (`NaN` from invalid MIRR, `Date` objects, large precision numbers). Standard `JSON.stringify` loses these. Use `superjson.serialize()` on the server and `superjson.deserialize()` on the client to preserve full fidelity.

**Validation**: Existing tests must still pass. Write new test:
```typescript
// tests/server/finance-service.test.ts
it("returns identical results for identical inputs (cache hit)", () => { ... });
it("invalidates cache on assumption change", () => { ... });
it("stableHash is deterministic regardless of key order", () => { ... });
```

---

### Phase 3: Migrate Client to Server-Computed Results

**Goal**: Replace in-browser engine calls with React Query hooks that fetch from `/api/finance/compute`.

**Step 3.1**: Create new hook:
```typescript
// client/src/hooks/useServerFinancials.ts
import { useQuery, keepPreviousData } from "@tanstack/react-query";

export function useServerFinancials(properties: Property[], global: GlobalAssumptions) {
  return useQuery({
    queryKey: ["finance", "portfolio", properties.length, global.id],
    queryFn: () => fetch("/api/finance/compute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ properties, globalAssumptions: global }),
    }).then(r => r.json()),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
```

**Step 3.2**: Migrate `usePortfolioFinancials` in `client/src/components/dashboard/usePortfolioFinancials.ts`.

This hook currently:
1. Receives raw properties + globalAssumptions from React Query
2. Calls `generatePropertyProForma()` for each property in-browser
3. Aggregates, consolidates, caches in useRef

Replace step 2-3 with a single `useServerFinancials()` call. The return shape must match what the dashboard components expect — map the server `ComputeResult` to the existing `DashboardFinancials` interface.

**Step 3.3**: Use a feature flag during migration:
```typescript
// shared/constants.ts
export const USE_SERVER_COMPUTE = true;
```

Migrate one page at a time:
1. Dashboard KPIs and charts
2. Property detail statements (IS, CF, BS)
3. Company detail page
4. Consolidated statements
5. Investment analysis

**Step 3.4**: Keep the client engine available for offline/fallback, but stop calling it from production paths.

**Validation**: Visual regression — open every financial page and verify numbers match. Run `npm run verify:summary`.

---

### Phase 4: Server-Side Export Generation

**Goal**: Move PDF/Excel/PPTX/CSV generation to server workers. Client requests export, server streams file.

Currently all exports in `client/src/lib/exports/` re-run the entire financial engine client-side before rendering. With server-computed results cached, exports should read from cache.

**Step 4.1**: Create export endpoint:
```
POST /api/exports/generate
  body: { entityType: "property"|"company"|"portfolio", entityId?: number, format: "pdf"|"xlsx"|"csv"|"pptx"|"docx"|"png", scope: "short"|"extended" }
  response: file stream with Content-Disposition header
```

**Step 4.2**: The export generators (`xlsx`, `pptxgenjs`, `jsPDF`) all work in Node.js. Move them to:
```
server/exports/
├── worker.ts              — orchestrates export jobs
├── pdf-generator.ts       — @react-pdf/renderer (works in Node)
├── excel-generator.ts     — xlsx
├── pptx-generator.ts      — pptxgenjs
└── chart-renderer.ts      — puppeteer-core for chart screenshots
```

**Step 4.3**: For chart screenshots in exports, use `puppeteer-core`:
```bash
npm install puppeteer-core
```

**Validation**: Generate exports from both old (client) and new (server) paths, compare output.

---

### Phase 5: Scenario System Hardening

**Goal**: Fix scenario data integrity and add computed result snapshots.

**Step 5.1**: The C1 fix in Phase 0 addresses the `userId` bug. Additionally:

Add a database migration to store computed results with scenarios:
```sql
ALTER TABLE scenarios ADD COLUMN computed_results JSONB;
ALTER TABLE scenarios ADD COLUMN compute_hash TEXT;
```

When saving a scenario, also snapshot the computed result:
```typescript
const computed = computePortfolioProjection({ properties, globalAssumptions });
await storage.createScenario({
  ...data,
  computedResults: computed,
  computeHash: computed.outputHash,
});
```

**Step 5.2**: Scenario comparison should use stored results instead of re-running engines:
```typescript
// Instead of: run engines on scenario A, run engines on scenario B, compare
// Do: load scenarioA.computedResults, load scenarioB.computedResults, compare
```

**Step 5.3**: Type the scenario JSONB fields (fixes M9):
```typescript
// shared/schema/scenarios.ts
globalAssumptions: jsonb("global_assumptions").notNull().$type<GlobalAssumptions>(),
properties: jsonb("properties").notNull().$type<Property[]>(),
```

**Validation**: Save scenario, load scenario, verify computed results match live computation.

---

### Phase 6: Consolidate Calculation Checker

**Goal**: The calculation checker in `server/calculation-checker/` re-implements ~40% of engine logic independently (~2,000 lines). After the engine moves server-side, the checker should validate *invariants on results* instead of re-implementing formulas.

**Current duplication**: Occupancy ramp, ADR escalation, room revenue, departmental expenses, management fees, PMT, depreciation, yearly aggregation, consolidation — all re-implemented in `property-checks.ts` and `portfolio-checks.ts`.

**New approach**: The checker validates relationships, not formulas:
- Balance sheet identity: `A = L + E` (within $1)
- Cash flow tie-out: `CFO + CFI + CFF = net cash change`
- Fee zero-sum: `sum(property fee expenses) = company fee revenue`
- Debt roll-forward: `opening balance - principal = closing balance`
- No negative cash
- No NaN in any output field

The existing `calc/validation/` tools (`validate_financial_identities`, `funding_gate_checks`, `schedule_reconcile`) already do most of this. Expand them and retire the duplicated logic.

**Validation**: Run `npm run verify:summary` — must still produce UNQUALIFIED.

---

### Phase 7: Deep Re-Audit (Post-Migration)

After Phases 0-6, run a comprehensive verification:

1. **Data flow integrity**: Trace numbers from DB → engine → API → client → export. Verify no precision loss.
2. **Cache correctness**: Verify invalidation fires on every mutation. Load test with concurrent users.
3. **Scenario consistency**: Save → load → verify computed results match.
4. **Export accuracy**: Compare server-generated exports to legacy client-generated exports.
5. **Security**: All new endpoints have `requireAuth`, rate limiting, Zod validation.
6. **Remaining findings**: Verify all C/H/M findings from Part 3 are resolved.

---

### Phase 8: Type Safety Remediation

**Goal**: Eliminate the 234 type safety violations. The server compute layer is unreliable if data flowing through it is `any`-typed.

**Step 8.1 — JSONB schema types** (fixes M6, M7, M8, M9):

Define explicit interfaces for every `Record<string, any>` JSONB field:

```typescript
// shared/schema/types/jsonb-shapes.ts
export interface IcpConfig {
  minRooms?: number;
  maxRooms?: number;
  regions?: string[];
  // ... all fields
}

export interface ExportConfig {
  pdfIncludeCharts?: boolean;
  excelIncludeFormulas?: boolean;
  // ... all fields
}

export interface MarketResearchContent {
  adrs?: { display: string; mid: number; source: string }[];
  occupancies?: { display: string; mid: number; source: string }[];
  // ... all fields
}

export interface ActivityLogMetadata {
  changedFields?: string[];
  previousValues?: Record<string, unknown>;
  // ... all fields
}
```

Then update each schema field:
```typescript
icpConfig: jsonb("icp_config").$type<IcpConfig>(),
exportConfig: jsonb("export_config").$type<ExportConfig>(),
```

**Step 8.2 — Scenario pipeline** (fixes M2, M3):

Replace `as any` in `server/routes/scenarios.ts` and `server/storage/financial.ts` with typed interfaces:
```typescript
// Instead of: scenario.globalAssumptions as any
// Do: scenarioGlobalAssumptionsSchema.parse(scenario.globalAssumptions)
```

**Step 8.3 — Safe `req.user` pattern** (~100 non-null assertions):

Create a typed middleware helper:
```typescript
// server/auth.ts
export function getAuthUser(req: Request): User {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  return req.user;
}

// Usage in routes:
const user = getAuthUser(req); // no ! needed, TypeScript narrows the type
```

**Step 8.4 — Schema field constraints** (fixes M10):

Add `.notNull()` to property fields that have `.default()` but are nullable:
```typescript
arDays: integer("ar_days").notNull().default(DEFAULT_AR_DAYS),
apDays: integer("ap_days").notNull().default(DEFAULT_AP_DAYS),
reinvestmentRate: real("reinvestment_rate").notNull().default(DEFAULT_REINVESTMENT_RATE),
dayCountConvention: text("day_count_convention").notNull().default('30/360'),
escalationMethod: text("escalation_method").notNull().default('annual'),
```

This requires a database migration to set existing NULL values to defaults.

**Validation**: `npm run check` (tsc --noEmit) should show zero new errors. `npm run test:summary` must pass.

---

### Phase 9: Financial Field Registry

**Goal**: Create a single source of truth for all financial fields. Currently scattered across 6+ files.

**The problem**: Adding one new assumption requires edits in:
1. `shared/schema/properties.ts` — Drizzle table definition
2. `shared/constants.ts` — `DEFAULT_*` constant
3. `server/routes/properties.ts:55-99` — `buildPropertyDefaultsFromGlobal()` mapping (currently 40+ hand-coded field mappings)
4. Zod validation schema (auto-derived but may need manual override)
5. Engine code (`property-engine.ts` or `company-engine.ts`)
6. UI components (PropertyEdit page)
7. Tests

Miss one and the field is silently ignored.

**Solution**: Create `shared/field-registry.ts`:

```typescript
export interface FieldDefinition {
  label: string;
  type: "currency" | "percentage" | "integer" | "decimal" | "text" | "boolean" | "date";
  scope: "property" | "global" | "both";
  default: number | string | boolean;
  globalOverrideField?: string;     // field name in globalAssumptions that overrides this
  validation?: { min?: number; max?: number };
  affectsEngine: boolean;
  category: "revenue" | "expenses" | "financing" | "investment" | "tax" | "operations";
}

export const FIELD_REGISTRY: Record<string, FieldDefinition> = {
  startAdr: {
    label: "Starting ADR",
    type: "currency",
    scope: "both",
    default: DEFAULT_START_ADR,
    globalOverrideField: "defaultStartAdr",
    validation: { min: 0, max: 10_000 },
    affectsEngine: true,
    category: "revenue",
  },
  // ... every financial field
};
```

Then derive `buildPropertyDefaultsFromGlobal()` from the registry:
```typescript
export function buildPropertyDefaultsFromGlobal(ga?: GlobalAssumptions): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [field, def] of Object.entries(FIELD_REGISTRY)) {
    if (def.scope === "property" || def.scope === "both") {
      defaults[field] = (def.globalOverrideField && ga?.[def.globalOverrideField]) ?? def.default;
    }
  }
  return defaults;
}
```

Add a proof test:
```typescript
// tests/proof/field-registry.test.ts
it("every registry field exists in properties schema", () => { ... });
it("every globalOverrideField exists in globalAssumptions schema", () => { ... });
it("buildPropertyDefaultsFromGlobal covers all registry fields", () => { ... });
```

**Validation**: `npm run test:summary && npm run verify:summary`.

---

### Phase 10: Observability & Error Handling

**Goal**: Standardize logging, add client error boundary, expand health checks, extend activity logging.

**Step 10.1 — Standardize logging**: Convert all 52 unstructured `console.error/warn/log` calls in `server/` to use the existing `logger` module (`server/logger.ts`). The module exists and works — it's just not used everywhere.

**Step 10.2 — Client error boundary**: Install `@sentry/react` and wrap the app root:
```bash
npm install @sentry/react
```

Create `client/src/components/ErrorBoundary.tsx` using `Sentry.ErrorBoundary` with a styled fallback card (per design-standards rule — never show raw errors).

**Step 10.3 — Health endpoints**:
```
GET /api/health/live     — 200 if process running (for container liveness probes)
GET /api/health/ready    — 200 only if DB connected + migrations applied
GET /api/health/deep     — DB pool stats, compute cache hit rate, external service status
```

**Step 10.4 — Extend activity logging** to financial mutations:

Add `logActivity()` calls to:
- `updateProperty` with financial field changes → `logActivity(req, "update", "property", id, name, { changedFields })`
- `upsertGlobalAssumptions` → `logActivity(req, "update", "global-assumptions", null, null, { changedFields })`
- Research values applied → `logActivity(req, "apply-research", "property", id, name, { fieldCount })`
- Export generated → `logActivity(req, "export", entityType, entityId, format)`

**Validation**: Grep for remaining unstructured `console.error` in `server/` — should be zero.

---

### Phase 11: Input Validation & Security Hardening

**Goal**: Add Zod validation to the 11 unvalidated handlers. Add rate limiting to unprotected endpoints.

**Step 11.1 — Add Zod schemas**:

| Route | File | Schema to add |
|-------|------|--------------|
| `POST /api/research-questions` | `research.ts:321` | `z.object({ question: z.string().min(1).max(2000) })` |
| `PATCH /api/research-questions/:id` | `research.ts:330` | Same |
| `POST /api/research/icp/generate` | `icp-research.ts:267` | `z.object({ promptBuilder: z.object({...}).optional(), propertyId: z.number().optional() })` |
| `POST /api/geocode` | `geospatial.ts:15` | `z.object({ address: z.string().min(1).max(500) })` |
| `PATCH /api/market-rates/:key` | `market-rates.ts:66` | `z.object({ value: z.number(), manualNote: z.string().max(500).optional() })` |
| `POST /api/market-intelligence/gather` | `market-rates.ts:147` | `z.object({ location: z.string().max(200).optional() })` |
| `POST /api/drive/folders` | `google-drive.ts:125` | `z.object({ name: z.string().min(1).max(255) })` |

**Step 11.2 — Fix research fallback** (`server/routes/research.ts:234`):

The fallback path stores unvalidated AI output. Fix: skip storage if validation didn't run.

**Step 11.3 — Add rate limiting**:

| Endpoint | Limit |
|----------|-------|
| `POST /api/uploads/process-image` | `isApiRateLimited(userId, "process-image", 5)` |
| `POST /api/finance/compute` | `isApiRateLimited(userId, "finance-compute", 10)` |
| `POST /api/geocode` | `isApiRateLimited(userId, "geocode", 20)` |

**Validation**: `npm run test:summary`.

---

### Phase 12: CI Enforcement & Pre-Commit Hooks

**Goal**: Prevent rule-violating code from being committed. Currently the financial safety rules (`no Math.pow`, `no safeNum`, etc.) are only enforced manually via `npm run audit:quick`.

**Step 12.1 — Install Husky + lint-staged**:
```bash
npm install -D husky lint-staged
npx husky init
```

In `package.json`:
```json
{
  "lint-staged": {
    "calc/**/*.ts": ["npx tsx script/audit-deep.ts"],
    "engine/**/*.ts": ["npx tsx script/audit-deep.ts"],
    "server/**/*.ts": ["npx tsc --noEmit"]
  }
}
```

**Step 12.2 — Add `--staged` mode to `script/audit-deep.ts`** so it only scans staged files (fast enough for pre-commit).

**Step 12.3 — Add lightweight ESLint** for financial code only:
```bash
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

Custom `no-restricted-syntax` rules:
- Ban `Math.pow` in `calc/` and `engine/` → "Use dPow()"
- Ban `as any` in `calc/` → "Use proper types"
- Ban `|| 0` in `calc/` and `engine/` → "Use ?? or assertFinite()"

Scope to `calc/` and `engine/` only — don't apply globally.

**Step 12.4 — GitHub Actions** (if repo is on GitHub):
```yaml
name: Verify
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run check
      - run: npm run audit:quick
      - run: npm run test:summary
      - run: npm run verify:summary
```

**Validation**: Attempt a commit with `Math.pow` in `calc/` — hook should block it.

---

## PART 5: DEPENDENCY GRAPH & EXECUTION ORDER

```
Phase 0  ──→  Phase 1  ──→  Phase 2  ──→  Phase 3  ──→  Phase 4
(bugs)        (extract)     (server       (client        (server
                             compute)      migration)     exports)
                               │
                               ├──→  Phase 5 (scenarios)
                               │
                               └──→  Phase 6 (checker consolidation)
                                              │
                                              └──→  Phase 7 (deep re-audit)

Phase 8   (type safety)      ← can start in parallel with Phases 1-6
Phase 9   (field registry)   ← can start in parallel with Phases 1-6
Phase 10  (observability)    ← can start immediately
Phase 11  (input validation) ← can start immediately
Phase 12  (CI hooks)         ← after Phase 8 (needs lint targets)

Phase 7   (final gate)       ← after ALL other phases complete
```

**Phases 8-12 are independent** of the engine migration and can run in parallel.

---

## PART 6: NEW DEPENDENCIES TO INSTALL

| Package | Purpose | Phase |
|---------|---------|-------|
| `lru-cache` | Bounded server computation cache (replaces raw Map) | 2 |
| `superjson` | Lossless JSON serialization (preserves Date, NaN, Infinity) | 2 |
| `@sentry/react` | Client-side error boundary + React integration | 10 |
| `puppeteer-core` | Server-side chart rendering for exports | 4 |
| `husky` | Git pre-commit hooks | 12 |
| `lint-staged` | Run checks on staged files only | 12 |
| `eslint` + `@typescript-eslint/*` | Financial code lint rules | 12 |

Optional (evaluate during implementation):
| `decimal.js-light` | Lighter decimal math (12KB vs 43KB, same API) | 2 |
| `piscina` | Worker thread pool for parallel property computation | 2 |
| `zod-to-json-schema` | Auto-generate JSON schemas for calc/ tools from Zod | 9 |

---

## PART 7: SUCCESS CRITERIA

1. **Zero client-side engine calls** in production (all via `/api/finance/compute`)
2. **< 200ms** server compute time for 10-property portfolio (cached: < 5ms)
3. **Byte-identical** financial outputs between old client path and new server path
4. **Single source of truth** — one engine, one result, consumed everywhere
5. **Verification opinion remains UNQUALIFIED** after every phase
6. **All audit findings resolved** (C1, H1, M1-M12, L1-L4)
7. **Zero `as any`** in `calc/` and `engine/` directories
8. **100% Zod validation** on all POST/PUT/PATCH handlers
9. **Pre-commit hooks** block financial safety violations
10. **Activity logging** covers all financial mutations

---

## PART 8: RULES YOU MUST FOLLOW

These are non-negotiable constraints from `.claude/rules/`:

1. **Balance sheet must balance**: `Total Assets = Total Liabilities + Total Equity` within $1. Use `m.anoi` for cash, never `m.noi`.
2. **No hardcoded values**: All financial values from DB with `DEFAULT_*` constant fallbacks. Only exceptions: `DEPRECIATION_YEARS` (39) and `DAYS_PER_MONTH` (30.5).
3. **No `Math.pow`** in financial code — use `dPow()`. No `safeNum` — use `assertFinite()`. No `|| 0` on computed financial values.
4. **Income statement shows interest only, never principal** (ASC 470).
5. **Independent verification must never import from the engine** — checker validates results, not reimplements formulas.
6. **All properties created with `userId: null`** — shared ownership.
7. **`invalidateAllFinancialQueries(queryClient)`** must be called in every financial mutation's `onSuccess`.
8. **Run `npm run verify:summary`** after any financial code change — must show UNQUALIFIED.
9. **Run `npm run test:summary`** — all tests must pass.
10. **No files outside `.claude/` contain architectural decisions** — `.claude/` is the source of truth.

---

## INSTRUCTIONS FOR REPLIT AGENT

1. **Read this entire document first.** Do not start coding until you understand the full plan.
2. **Plan Phase 0 first** — it's 4 surgical fixes with exact file:line references above.
3. **After each phase**, run `npm run test:summary && npm run verify:summary`. Do not proceed to the next phase if tests fail.
4. **Phases 0-6 are sequential** (each depends on the previous). Phases 8-12 can be interleaved.
5. **When in doubt**, check `.claude/rules/` — there are 20+ rule files covering every aspect of the codebase.
6. **Do not change the calculation checker's independence** — it must never import from `@engine/`. Phase 6 restructures what it validates, not where it imports from.
7. **Use feature flags** during Phase 3 migration so you can roll back per-page.
8. **Commit after each phase** with a clear message describing what changed.
