# Portfolio Dynamics & Data Integrity

## Rule

The financial engine must handle any number of properties (0, 1, 5, 20+) without hardcoded limits. Every property must be visible to every authenticated user. Management fee revenue flowing to the hospitality company must exactly equal the sum of fee expenses paid by each property (zero-sum intercompany). All portfolio-wide data must be stored as **shared rows** (`userId = NULL`). Violations make data invisible to other users.

## Data Integrity Invariants

**1. Global Assumptions** — Exactly one row with `userId IS NULL`. Always query with `ORDER BY id DESC` to guarantee newest row.

**2. Properties** — All properties must have `userId = NULL`. Query uses `WHERE userId = :uid OR userId IS NULL` — non-null userId makes the property invisible to everyone else.

```typescript
// CORRECT — ORDER BY DESC on shared singleton
const [shared] = await db.select().from(globalAssumptions)
  .where(isNull(globalAssumptions.userId))
  .orderBy(desc(globalAssumptions.id)).limit(1);

// CORRECT — shared property
await storage.createProperty({ ...data, userId: null });
// WRONG — owned property (invisible to others)
await storage.createProperty({ ...data, userId: req.user.id });
```

### When Adding New Shared Singleton Tables

1. Add `ORDER BY id DESC` to all read queries
2. Add uniqueness check in `tests/proof/data-integrity.test.ts`
3. Add migration guard in `server/migrations/` to clean duplicates

Failures produce an **ADVERSE** verification opinion.

## Property Count — Never Hardcode

The number of properties in the portfolio is always derived dynamically from the database result set. No code path may assume a fixed property count.

```typescript
// CORRECT — dynamic count from the array
const propertyCount = properties.length;
const staffFTE = propertyCount <= tier1Max ? tier1Fte
  : propertyCount <= tier2Max ? tier2Fte : tier3Fte;

// WRONG — hardcoded property count
const propertyCount = 5;
```

**Staffing tiers** use configurable thresholds from `global_assumptions` (`staffTier1MaxProperties`, `staffTier2MaxProperties`), not hardcoded values. The engine computes `activePropertyCount` dynamically each month by counting properties with revenue > 0.

**Seed scripts** may create a fixed number of initial properties, but log messages and tests must reference the actual array length, not a literal.

## Scenario Privacy — Two-Layer Model

**Layer 1 — Scenario records are user-private.**
The `scenarios` table rows belong to the user who created them (`userId = creating user's id`). A user sees only their own scenarios in the Scenarios list. Other users cannot browse or load another user's scenario unless it has been explicitly shared with them (via in-app share or email).

**Layer 2 — The active workspace is shared.**
The currently loaded portfolio — properties and global assumptions — is a shared workspace (`userId = NULL`). All authenticated users see the same active state. Loading any scenario replaces this shared workspace for everyone.

This means: loading a scenario is a consequential, global action. The UI must warn the user before loading.

## Scenario Load — Must Restore as Shared

When loading a saved scenario, the `loadScenario()` method must:
1. Update the **shared** `global_assumptions` row (userId=NULL), not create a user-specific one
2. Delete all shared properties, then re-insert scenario properties with `userId: null`
3. Never set `userId` to the logged-in user's ID on restored properties

**Root cause (Feb 2025):** `loadScenario()` inserted restored properties with the logged-in user's `userId`, making them invisible to all other users.

## Management Fee Zero-Sum

Each property pays management fees (base + incentive) as an expense. The management company receives those same amounts as revenue. In consolidation, these intercompany fees must eliminate to zero.

```
Property SPV:     feeBase + feeIncentive = management fee expense (reduces NOI)
Management Co:    baseFeeRevenue + incentiveFeeRevenue = sum of all property fees
Consolidated:     intercompany fees eliminate to $0
```

## Portfolio Aggregation

When computing portfolio-level metrics (Dashboard):
- **Revenue**: Sum of all property revenues
- **NOI**: Sum of all property NOIs
- **IRR**: Computed from consolidated cash flows (not averaged)
- **Weighted ADR/Occupancy/RevPAR**: Weighted by available room nights, not simple average
- **Equity Multiple**: Based on total equity invested across all properties

Adding a property increases portfolio revenue and count. Removing a property decreases them. Zero properties must not crash — show empty states.

## Verification

These invariants are enforced by:
- `tests/proof/portfolio-dynamics.test.ts` — proof test in the verification pipeline
- `tests/proof/data-integrity.test.ts` — shared ownership checks
- `tests/engine/per-property-fees.test.ts` — fee zero-sum checks
- `tests/engine/company-proforma.test.ts` — staffing tier scaling

## Checklist

- [ ] Does the engine derive property count from the array, never a literal?
- [ ] Are all new properties created with `userId: null`?
- [ ] Does scenario load restore properties as shared (userId=NULL)?
- [ ] Do management fees eliminate to zero in consolidation?
- [ ] Does the dashboard handle 0 properties without crashing?
- [ ] Are staffing tier thresholds from global assumptions, not hardcoded?
- [ ] Do shared singleton queries use `ORDER BY id DESC`?
