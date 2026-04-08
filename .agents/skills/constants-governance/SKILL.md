---
name: constants-governance
description: Constants governance for the hospitality financial model. Documents the shared/client barrel pattern, financial defaults in shared/constants.ts, the safeNum guard, and NaN bug prevention. Use when adding constants or modifying default values.
---

Constants governance for the hospitality financial model. Documents the shared/client barrel pattern, the rule that financial defaults live in `shared/constants.ts`, the `safeNum` guard pattern, and the NaN bug root cause. Use this skill when adding new constants, modifying default values, or working with the financial engine.

## Architecture: Two-File Barrel Pattern

### `shared/constants.ts` — Single Source of Truth

All financial default values live here. Both server and client import from this file.

**Two categories:**
| Category | Examples | Rule |
|----------|----------|------|
| **Immutable** (IRS/GAAP) | `DEPRECIATION_YEARS` (27.5), `DAYS_PER_MONTH` (30.5) | Never change |
| **Configurable** (`DEFAULT_*` prefix) | `DEFAULT_COST_RATE_ROOMS` (0.20), `DEFAULT_EXIT_CAP_RATE` (0.085) | User-overridable; these are fallbacks |

**How constants flow:**
1. Database schema (`shared/schema/`) references them as column defaults
2. Financial engine uses them as fallbacks when a property hasn't overridden a value
3. Verification checker compares calculated values against them to detect anomalies
4. Tests import them to derive expected values (never hardcode)

### `client/src/lib/constants.ts` — Client Barrel

Re-exports all shared constants plus defines client-only constants:

```typescript
// Re-export shared constants (single import path for client code)
export {
  DEFAULT_COST_RATE_ROOMS,
  DEFAULT_EXIT_CAP_RATE,
  DEPRECIATION_YEARS,
  DAYS_PER_MONTH,
  // ... 30+ shared constants
} from "@shared/constants";

// Client-only constants (server doesn't need these)
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
- Property creation defaults (`DEFAULT_ADR_GROWTH_RATE`, `DEFAULT_START_OCCUPANCY`)
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
| `shared/constants.ts` | Single source of truth for all financial defaults |
| `client/src/lib/constants.ts` | Client barrel (re-exports shared + UI-only constants) |
| `client/src/lib/financial/property-engine.ts` | `safeNum` definition and usage |
| `calc/shared/pmt.ts` | Zero-guard pattern in loan payment calculation |
| `tests/proof/hardcoded-detection.test.ts` | Magic number scanner |
| `tests/calc/validation/assumption-consistency.test.ts` | Assumption validation tests |
