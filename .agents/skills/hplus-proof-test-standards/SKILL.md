# H+ Proof-Test Standards

Use this skill whenever writing, reviewing, or auditing proof tests for the H+ Analytics financial engine (`lib/engine`, `artifacts/api-server/src/tests/proof/`).

## What are proof tests?

Proof tests are the highest-trust test tier in this codebase. They assert exact financial identities and pinned numeric values derived analytically from first principles. They are not "does it run without error" tests — they prove that specific known-correct values come out of the engine.

The proof test directory is `artifacts/api-server/src/tests/proof/`.

---

## Engine computation rules (source of truth)

### Revenue

- **per_room** (hotel/lodge): `soldRooms = availableRooms × seasonalOccupancy`
  - `availableRooms = roomCount × daysPerMonth` (per month)
  - `seasonalOccupancy = min(1.0, baseOccupancy × seasonFactor)`
  - `revenueRooms = soldRooms × seasonalAdr`
  - `seasonalAdr = currentAdr × seasonFactor` — seasonality multiplies **both ADR and occupancy**

- **per_property** (vrbo): `soldRooms = daysPerMonth × seasonalOccupancy`
  - **`roomCount` is irrelevant for revenue.** The whole property is one bookable unit.
  - `revenueRooms = soldRooms × nightlyPropertyRate × adrFactor × seasonFactor`

### `cleanAdr` — PICK_LAST, NOT weighted average

`cleanAdr` in the yearly aggregator (`yearlyAggregator.ts`) is computed by scanning the 12 monthly `adr` fields **backward** and returning the **last non-zero value**. It is explicitly **not** `revenueRooms / soldRooms`.

```
for (let mi = yearEnd - 1; mi >= yearStart; mi--) {
  if (data[mi].adr > 0) { cleanAdr = data[mi].adr; break; }
}
```

Consequences:
- With flat ADR and no seasonality: PICK_LAST = weighted average (coincidence, not design).
- With seasonality: December ADR = `startAdr × seasonFactor[11]`; PICK_LAST = December's ADR — NOT the weighted average across the year.
- With `startAdr = 0`: all months have `adr = 0`, PICK_LAST fallback returns 0.
- The monthly `adr` field is set **unconditionally** (not gated on `isOperational`), so pre-ops months still carry the scheduled ADR. PICK_LAST therefore returns the scheduled end-of-year ADR even for partial operating years.

**Reference test:** `engine-edge-cases.test.ts > cleanAdr PICK_LAST ≠ weighted average when seasonality varies ADR within the year`

### ADR growth — annual steps, not monthly interpolation

`adrFactors` are per-year: `(1 + adrGrowthRate)^yearIndex`. Within a given calendar year all months share the same ADR factor. ADR only changes at year boundaries, not month-by-month.

### Seasonality — applies to BOTH ADR and occupancy

`seasonalAdr = currentAdr × seasonFactor` (engine line ~98)
`seasonalOccupancy = min(1, occupancy × seasonFactor)` (engine line ~97)

Both occupancy AND revenue per night are scaled by the seasonal factor. A factor of 2.0 in December doubles ADR and (up to the 1.0 cap) doubles occupancy.

### Pre-operations gating

Revenue and sold rooms are gated on `i >= ctx.opsStartIdx`:

```
const isOperational = i >= ctx.opsStartIdx;
soldRooms = isOperational ? availableRooms × seasonalOccupancy : 0;
```

`opsStartIdx` is derived from `operationsStartDate` vs `modelStartDate`. Months before the operational start produce `soldRooms = 0` and `revenueRooms = 0`. Fixed costs (taxes, insurance) may still accrue from `acquisitionDate` onward.

### Debt / isFinanced gating

```
const isFinanced = property.type === "Financed";
const originalLoanAmount = isFinanced ? totalPropertyValue × acquisitionLTV : 0;
```

**Only `type: 'Financed'` activates the debt path.** `hotel`, `lodge`, and `vrbo` types are always unlevered, regardless of `acquisitionLTV` in the input. Setting `acquisitionLTV: 0.7` on a `type: 'hotel'` property has no effect.

When `isFinanced = true`:
- `debtPayment = monthlyPayment` (standard amortisation PMT)
- `interestExpense = prevDebtOutstanding × monthlyRate`
- `principalPayment = debtPayment - interestExpense`
- Identity: `interestExpense + principalPayment = debtPayment` (exact)

When `isFinanced = false` (hotel/lodge/vrbo):
- `debtPayment = 0`, `interestExpense = 0`, `principalPayment = 0`

**Reference test:** `engine-edge-cases.test.ts > type="Financed" activates debt service; hotel/lodge/vrbo are always unlevered`

### Financial waterfall (GOP → NOI → ANOI)

```
totalOperatingExpenses = expenseRooms + expenseFB + expenseEvents + expenseOther
  + expenseOtherCosts + expenseInsurance + expenseMarketing + expensePropertyOps
  + expenseUtilitiesVar + expenseUtilitiesFixed + expenseAdmin + expenseIT
  + expensePlatformFees + expensePreOpening   ← DO NOT OMIT expensePreOpening

GOP   = revenueTotal - totalOperatingExpenses
AGOP  = GOP  - feeBase - feeIncentive
NOI   = AGOP - expenseTaxes
ANOI  = NOI  - expenseFFE
totalExpenses = totalOperatingExpenses + feeBase + feeIncentive + expenseTaxes + expenseFFE
```

`expenseTaxes` scales off **`totalPropertyValue` (≈ purchasePrice)**, not revenue.
`expenseFFE` scales off **`revenueTotal`**.

---

## Pin provenance — analytical vs snapshot

Every pinned numeric value in the proof suite must be clearly labelled as one of two kinds:

### Analytical proof pin

Derived entirely from raw inputs using pencil-and-paper arithmetic. The comment next to the assertion shows the full derivation. The reader can verify the number without running the engine.

```ts
// soldRooms: 8 rooms × 0.60 occ × 366 days (engine uses 30.5 d/month fixed) = 1,756.8
expect(yearly[0].soldRooms).toBeCloseTo(1_756.8, 1);
```

Use analytical pins for all year-1 values in per-scenario tests (golden-values, regression-snapshots).

### Regression snapshot pin

Captured from a known-good engine run and documented with a note saying so. Valid for drift detection (any future change triggers a deliberate failure), but NOT a proof that the value is correct from first principles.

```ts
// Snapshot from engine run 2024-06-01 (PR #87, zero-inflation, 5-year baseline).
// If this changes, verify the delta before updating.
expect(yearly[0].gop).toBeCloseTo(214_320.50, 2);
```

Use snapshot pins only when the formula is too complex to re-derive analytically (e.g., multi-year inflation-compounded series). Document the capture date and PR.

### Mixed pattern (recommended for T012)

Pair an analytical pin on a simple metric (soldRooms, revenueRooms, expenseTaxes) with a relational identity check. The analytical pin anchors the scenario; the relational check verifies the waterfall is intact.

```ts
expect(yearly[0].soldRooms).toBeCloseTo(1_756.8, 1);     // analytical
expect(yearly[0].revenueRooms).toBe(527_040);              // analytical
expect(yearly[y].noi).toBeCloseTo(yearly[y].agop - yearly[y].expenseTaxes, 2); // relational
```

### What you must NOT do

- Copy a value from engine console output and paste it as an assertion with a comment like "year 1 soldRooms > 0" — this is neither a proof pin nor a snapshot; it is noise.
- Label a snapshot pin as "independently derived" if you read the value from engine output first.

---

## Proof-test quality rules

### 1. Pinned values must be independently derived

Every `expect(yr.foo).toBeCloseTo(X, N)` must have a comment showing the arithmetic from raw inputs. The reader must be able to verify the number on a calculator without running the engine.

**Good:**
```ts
// soldRooms: 20 rooms × 0.7 occ × 366 days (2024 leap year) = 5,124 (exact integer)
expect(yr.soldRooms).toBe(5124);
```

**Bad:**
```ts
// soldRooms is positive
expect(yr.soldRooms).toBeGreaterThan(0);
```

### 2. Identity checks must be paired with at least one independent pin

Consistency assertions (`noi ≈ agop - expenseTaxes`) are valuable but not sufficient alone — if both sides drift together the test still passes. Always pair them with at least one independently derived absolute value.

**Good:**
```ts
expect(yr.expenseTaxes).toBeCloseTo(60_000, 0); // 1,200,000 × 0.05 (independent pin)
expect(yr.noi).toBeCloseTo(yr.agop - yr.expenseTaxes, 2); // identity check
```

### 3. Never wrap `assertAllFinite`/`assertMonthlyAllFinite` in `expect().not.toThrow()`

These helpers call vitest's `expect()` internally. Wrapping them in `.not.toThrow()` catches vitest assertion errors and reports them as "didn't throw" — silently masking failures.

**Bad:**
```ts
expect(() => assertMonthlyAllFinite(monthly, 'label')).not.toThrow();
```

**Good:**
```ts
assertMonthlyAllFinite(monthly, 'label');
```

### 4. Remove redundant finiteness checks

`assertYearlyAllFinite` checks every numeric field. A subsequent `expect(Number.isFinite(yr.noi)).toBe(true)` is dead code. Remove it.

### 5. Test titles must be precise

- State the scenario and the expected outcome, not just the topic.
- Bad: `"zero purchase price"`
- Good: `"zero purchase price → expenseTaxes=0, depreciationExpense=0, all values finite"`

### 6. Do not copy values from engine output to pin them

Run the engine, read the output, then verify the output is correct by re-deriving it analytically. If you cannot re-derive it, the test is not a proof — it is a snapshot.

Exception: values that depend on compound formulae (e.g., PMT amortisation) may be pinned after manual verification and clearly documented as such.

### 7. Test both branches of boolean gates

When a flag like `isFinanced` gates behaviour:
- One test must prove the flag-on path produces expected non-zero values.
- Another test must prove the flag-off path produces exactly zero.

### 8. cleanAdr assertions must document PICK_LAST

Always explain in comments that `cleanAdr` is PICK_LAST, not weighted average, and why the values coincide (or diverge) in this specific scenario.

---

## Common mistakes / failure modes to catch in review

| Mistake | Symptom |
|---|---|
| `cleanAdr` comment says "weighted average" | Wrong — it's PICK_LAST |
| Test sets `acquisitionLTV` on `type:'hotel'` and expects debt service | LTV is ignored for non-Financed types |
| GOP identity omits `expensePreOpening` | Passes with 0 pre-op expense; fails when ramp > 0 |
| `expect(() => assertHelper(...)).not.toThrow()` | Silently masks assertion failures |
| Relation-only assertions (`noi ≈ agop - taxes`) with no independent pin | Coupled regressions pass undetected |
| `soldRooms > 0` instead of pinned value for VRBO | Doesn't prove per_property formula |
| Seasonality assumed to affect occupancy only | It multiplies ADR too — `seasonalAdr = currentAdr × factor` |

---

## Reference test locations

| Behaviour | Canonical test |
|---|---|
| `cleanAdr` PICK_LAST | `engine-edge-cases.test.ts > cleanAdr PICK_LAST ≠ weighted average...` |
| `cleanAdr` when `startAdr=0` | `engine-edge-cases.test.ts > startAdr=0 → PICK_LAST cleanAdr=0` |
| `isFinanced` branch gating | `engine-edge-cases.test.ts > type="Financed" activates debt service...` |
| per_property soldRooms formula | `engine-edge-cases.test.ts > VRBO per_property → soldRooms=daysInYear×occ` |
| Pre-ops gating | `engine-edge-cases.test.ts > operationsStartDate in the future...` |
| GOP identity (incl. preOpening) | `golden-values.test.ts > All models: GOP, NOI, and totalExpenses identities` |
| 100% occupancy ceiling | `engine-edge-cases.test.ts > 100% occupancy → soldRooms equals availableRooms` |
