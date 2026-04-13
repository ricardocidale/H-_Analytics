---
name: constants-governance
description: Constants governance covering the shared/client barrel pattern, the safeNum guard, the NaN bug root cause, fallback constant rules, and how constants relate to seed defaults and live assumptions.
---

Constants governance for the hospitality financial model. Documents the shared/client barrel pattern, how hardcoded constants serve as last-resort fallbacks behind database-driven seed defaults and live assumptions, the `safeNum` guard pattern, and the NaN bug root cause.

**Related skills:** `settings/` (seed defaults vs live assumptions vs config switches), `finance/` (engine consumption)

## Architecture: Two-File Barrel Pattern

### `shared/constants.ts` — Single Source of Truth

All financial fallback values live here. Both server and client import from this file.

**Two categories:**
| Category | Examples | Rule |
|----------|----------|------|
| **Governed** (IRS/GAAP/industry standard) | `DEPRECIATION_YEARS` (27.5), `DAYS_PER_MONTH` (30.5) | Admin can override in Model Defaults via GovernedFieldWrapper, but constant is the authoritative default |
| **Configurable** (`DEFAULT_*` prefix) | `DEFAULT_COST_RATE_ROOMS` (0.20), `DEFAULT_EXIT_CAP_RATE` (0.085) | Last-resort fallback when DB value is NULL |

**How constants fit in the resolution chain:**
```
property.costRateRooms          ← Per-property override (highest priority)
  ?? global.costRateRooms       ← Live assumption from globalAssumptions DB
    ?? DEFAULT_COST_RATE_ROOMS  ← Hardcoded constant (last resort)
```

Constants are the safety net, not the source of truth. The source of truth is the `globalAssumptions` database row (for live assumptions) or the property row (for per-property overrides). Constants only fire when the admin has never set a value.

### `client/src/lib/constants.ts` — Client Barrel

Re-exports all shared constants plus defines client-only constants:

```typescript
export {
  DEFAULT_COST_RATE_ROOMS,
  DEFAULT_EXIT_CAP_RATE,
  DEPRECIATION_YEARS,
  DAYS_PER_MONTH,
  // ... 30+ shared constants
} from "@shared/constants";

export const DEFAULT_REFI_LTV = 0.65;
export const STAFFING_TIERS = [
  { maxProperties: 3, fte: 2.5 },
  { maxProperties: 6, fte: 4.5 },
  { maxProperties: Infinity, fte: 7.0 },
];
export const AUDIT_VARIANCE_TOLERANCE = 0.001;
```

**Client-only constants include:**
- Refinance defaults (`DEFAULT_REFI_LTV`, `DEFAULT_REFI_CLOSING_COST_RATE`)
- Company cost defaults (`DEFAULT_STAFF_SALARY`, `DEFAULT_OFFICE_LEASE`, etc.)
- Presentation thresholds (`IRR_HIGHLIGHT_THRESHOLD`)
- Audit tolerances (`AUDIT_VARIANCE_TOLERANCE`, `AUDIT_DOLLAR_TOLERANCE`)
- Staffing model (`STAFFING_TIERS`)

## Rules

### 1. New Financial Constants Always Go in `shared/constants.ts`

Any constant that affects financial calculations, is used by the verification checker, or appears in test expected values **must** live in `shared/constants.ts`.

```typescript
// CORRECT — in shared/constants.ts
export const DEFAULT_VACANCY_RATE = 0.05;

// WRONG — in client/src/lib/constants.ts
export const DEFAULT_VACANCY_RATE = 0.05; // Server can't access this
```

### 2. Client-Only Constants Go in `client/src/lib/constants.ts`

UI presentation thresholds, staffing tiers, auditor tolerances, and other values the server never needs can live in the client barrel.

### 3. Never Inline Magic Numbers

The hardcoded detection test (`tests/proof/hardcoded-detection.test.ts`) scans finance source files and fails if it finds unexplained numeric literals. Only safe numbers are allowed: 0, 1, -1, 2, 12, 100.

```typescript
// WRONG — magic number in finance code
const insurance = purchasePrice * 0.015;

// CORRECT — named constant
import { DEFAULT_COST_RATE_INSURANCE } from "@shared/constants";
const insurance = purchasePrice * DEFAULT_COST_RATE_INSURANCE;
```

### 4. Tests Derive Expected Values from Constants

Golden tests never hardcode expected values. They compute expectations from the same constants the engine uses:

```typescript
// CORRECT
const H_REV_EVENTS = H_REV_ROOMS * DEFAULT_REV_SHARE_EVENTS;
expect(m0.revenueEvents).toBeCloseTo(H_REV_EVENTS, 2);

// WRONG
expect(m0.revenueEvents).toBeCloseTo(25620, 2);
```

### 5. Constants Are Fallbacks, Not Truth

When adding a new financial parameter:

1. Add the `DEFAULT_*` constant in `shared/constants.ts` (fallback)
2. Add a nullable column in `globalAssumptions` (seed default / live assumption)
3. Wire it through `buildPropertyDefaultsFromGlobal()` if it seeds new properties
4. Wire it through `resolve-assumptions.ts` if the engine reads it
5. The constant only fires when the DB column is NULL

```typescript
// In buildPropertyDefaultsFromGlobal():
newRate: ga?.defaultNewRate ?? DEFAULT_NEW_RATE,

// In resolve-assumptions.ts:
const newRate = property.newRate ?? global.newRate ?? DEFAULT_NEW_RATE;
```

### 6. Removing a Constant

Before removing a constant, verify:
- No imports remain (check with `grep`)
- No test files reference it
- The corresponding DB column exists and is properly seeded
- The `buildPropertyDefaultsFromGlobal()` function has been updated

## The `safeNum` Guard Pattern

The financial engine uses `safeNum` to prevent NaN/Infinity from propagating silently:

```typescript
function safeNum(n: number): number {
  return Number.isFinite(n) ? n : 0;
}
```

**Used at every division or exponentiation point in the engine:**
```typescript
let monthlyDepreciation = safeNum(buildingValue / DEPRECIATION_YEARS / 12);
monthlyPayment = safeNum(pmt(originalLoanAmount, monthlyRate, totalPayments));
adrFactors[y] = safeNum(Math.pow(1 + adrGrowthRate, y));
fixedEscFactors[y] = safeNum(Math.pow(1 + fixedEscalationRate, y));
```

**When to use `safeNum`:**
- After any division that could produce `Infinity` (divisor could be 0)
- After `Math.pow` that could produce `NaN` (negative base with fractional exponent)
- After `pmt()` calls (loan calculation with potentially bad inputs)
- After any expression where upstream `undefined`/`null` could coerce to `NaN`

## The NaN Bug: Root Cause and Lesson

### What Happened

An uninitialized assumption field was read from the database as `undefined`. When used in arithmetic (`undefined * 0.03`), it produced `NaN`. The `NaN` propagated through the entire financial model silently — every downstream calculation (revenue, expenses, NOI, cash flow, IRR) became `NaN`.

### Root Cause Chain

```
Database: assumption field = NULL (no default set)
  ↓
API: property.someRate = undefined (not coerced to default)
  ↓
Engine: revenue = rooms * adr * undefined → NaN
  ↓
NOI = NaN, IRR = NaN, everything = NaN
```

### The Fix: Defense in Depth

1. **`safeNum` guards** at every calculation point — NaN/Infinity → 0
2. **Named constants** with explicit defaults — no assumption is ever truly undefined
3. **Zero-guard in `pmt()`** — handles edge cases before they propagate:
   ```typescript
   if (principal === 0 || totalPayments === 0) return 0;
   if (monthlyRate === 0) return principal / totalPayments;
   ```
4. **Hardcoded detection tests** — prevent magic numbers from creeping back in
5. **Assumption consistency validation** — `checkAssumptionConsistency()` catches out-of-range and missing values before the engine runs

### Lesson

Never trust that an assumption value will be present. Every financial calculation must either:
- Import a named constant default from `shared/constants.ts`
- Use `safeNum()` to guard the result
- Validate inputs before calculation begins

## Key Files

| File | Purpose |
|------|---------|
| `shared/constants.ts` | Single source of truth for all financial fallback constants |
| `client/src/lib/constants.ts` | Client barrel (re-exports shared + UI-only constants) |
| `client/src/lib/financial/property-engine.ts` | `safeNum` definition and usage |
| `client/src/lib/financial/resolve-assumptions.ts` | Resolution chain: property → global → constant |
| `server/routes/properties.ts` | `buildPropertyDefaultsFromGlobal()` — seed defaults at creation |
| `calc/shared/pmt.ts` | Zero-guard pattern in loan payment calculation |
| `tests/proof/hardcoded-detection.test.ts` | Magic number scanner |
| `tests/calc/validation/assumption-consistency.test.ts` | Assumption validation tests |
