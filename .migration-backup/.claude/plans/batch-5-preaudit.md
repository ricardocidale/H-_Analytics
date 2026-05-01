# Batch 5 Pre-Audit — `|| 0` in Financial Audit / Verification Code

**Status:** Documentation only. No code edited by this commit.
**Purpose:** Classify each `|| 0` site in financial audit/verification/checker files before Batch 5 execution. Gives the reviewer a per-site hypothesis of "expected blast radius" so we can approve/veto individual sites rather than fix blind.

**Scope:** `|| 0` warnings in files flagged by Batch 5 in the cleanup plan:

| File | Site count |
|---|---:|
| `client/src/lib/audits/auditBalanceSheet.ts` | 20 |
| `client/src/lib/audits/gaapComplianceChecker.ts` | 16 |
| `client/src/lib/verification/known-value-runner.ts` | 13 |
| `client/src/lib/audits/auditCashFlow.ts` | 8 |
| `client/src/lib/audits/auditIncomeStatement.ts` | 6 |
| `server/calculation-checker/index.ts` | 4 |
| `client/src/lib/audits/crossCalculatorValidation.ts` | 4 |
| `client/src/lib/verification/test-cases.ts` | 4 |
| `client/src/lib/audits/formulaChecker.ts` | 3 |
| `client/src/lib/audits/auditDepreciation.ts` | 3 |
| `client/src/lib/runVerification.ts` | 2 |
| **Total** | **~83** |

Lint reports 79 flagged sites in these files (some `|| 0` occurrences are inside `.toFixed()` string templates which don't trigger the rule). We'll track to lint count, not grep count.

---

## The three disposition categories

### Category A — **Safe `?? 0` swap**

Upstream value is schema-nullable (`number | null | undefined`) and the fallback to 0 is semantically "no data → zero-valued." `??` is semantically identical to `||` in this case because zero itself isn't what we're guarding against — we're guarding against `null`/`undefined`.

**Examples:**
- `property.purchasePrice || 0` where `purchasePrice: number | null` in schema
- `property.buildingImprovements || 0`
- `property.operatingReserve || 0`
- `engineCalc.find(...)?.debtPayment || 0` where `.find` may return undefined

**Action:** Swap `||` → `??`. Zero risk. No behavior change.

### Category B — **Expose NaN via `?? 0`** (expected Batch-5 finding)

Upstream value is a typed `number` from the engine's `MonthlyFinancials` output. If the engine is working correctly, the value is always finite. If the engine has a latent bug producing NaN, `|| 0` silently substitutes 0 (bug hidden, audit still green); `?? 0` passes NaN through (`NaN + anything = NaN`, audit trips downstream comparison).

**This is the desired behavior per `.claude/rules/financial-safety.md`** — Silent NaN→0 coercion hides data corruption. The rule says to use `assertFinite(value, label)` which throws with context.

**Examples:**
- `m.cashFlow || 0`, `m.netIncome || 0`, `m.depreciationExpense || 0`
- `m.operatingCashFlow || 0`, `m.financingCashFlow || 0`
- `m.debtOutstanding || 0`, `m.principalPayment || 0`
- `m.propertyValue || 0`, `m.endingCash || 0`
- `m.anoi || 0`, `m.interestExpense || 0`, `m.incomeTax || 0`

**Action:** Two valid replacements:

1. **`?? 0`** — propagates NaN. If the engine produces NaN for a given month, the cumulative sum blows up, the audit's comparison fails, and we see the bug in `verify:summary`. Downside: message is cryptic (NaN appears somewhere in the audit output).

2. **`assertFinite(value, "m.cashFlow")`** — throws with field name and context at the moment NaN appears. Better diagnostic. More invasive edit (import + wrap). This is what the financial-safety rule prescribes.

**Expected failure mode:** if any engine path produces NaN (rare, but possible under edge cases like zero-revenue months, zero-LTV financing, pre-ops gaps), Batch 5 will surface this and the audit will fail `verify:summary`. **That's the point.** Fix the engine, re-run. Don't silence by reverting to `||`.

### Category C — **Dollar amounts accumulated via `+=`**

Similar to Category B but specifically in `+=` accumulation loops (`cumulativeNetIncome += m.netIncome || 0`). Here NaN is especially toxic because it poisons the running sum permanently.

**Examples:**
- `cumulativeDepreciation += (m.depreciationExpense || 0)`
- `cumulativeNetIncome += (m.netIncome || 0)`
- `cumulativeCashFlow += (m.cashFlow || 0)`

**Action:** Same as B, but `assertFinite` is strongly preferred here because a cryptic "cumulativeX is NaN at month 73" is hard to debug; `assertFinite(m.cashFlow, "cashFlow[m=73]")` points to the exact month.

---

## Per-file disposition

### `auditBalanceSheet.ts` — 20 sites

Category breakdown:
- **A (safe `?? 0`):** `property.purchasePrice`, `property.buildingImprovements`, `property.operatingReserve` — 3 sites
- **B (expose NaN):** `m.depreciationExpense`, `m.propertyValue`, `m.operatingCashFlow`, `m.financingCashFlow`, `m.cashFlow`, `m.netIncome`, `m.refinancingProceeds`, `m.debtOutstanding`, `m.principalPayment`, `m.endingCash` — 15 sites across balance-sheet reconciliation
- **C (accumulator):** `cumulativeDepreciation += m.depreciationExpense || 0`, `cumulativeNetIncome += m.netIncome || 0`, `cumulativeRefiEquityAdj += ...` — 2 sites

**Risk:** HIGH. This file is the A=L+E rule enforcer. If engine produces NaN anywhere balance-sheet-adjacent (refi, depreciation, cash), Batch 5 will surface it here first.

**Recommendation:** Use `assertFinite` on all Category B+C sites. Use `?? 0` on Category A only.

### `gaapComplianceChecker.ts` — 16 sites

All sites are monthly engine output fields (Category B): `depreciationExpense`, `incomeTax`, `operatingCashFlow`, `financingCashFlow`, `principalPayment`, `refinancingProceeds`. Many appear inside `.toFixed()` string template calls for human-readable error messages.

**Risk:** MEDIUM. File is run once per verification; NaN would appear in error-message strings as "NaN" which would be visible but non-fatal (`.toFixed()` on NaN returns `"NaN"`).

**Recommendation:** `assertFinite` at the top of each monthly-loop iteration (once) rather than per-access. Cleaner diff: `const { depreciationExpense, incomeTax, operatingCashFlow, ... } = assertAllFinite(m, ["depreciationExpense", ...])`. Or just `?? 0` consistently and let NaN bubble — this file's job is to detect bugs, so NaN propagation is aligned.

### `known-value-runner.ts` — 13 sites

Test-fixture code. `tc.property.roomCount || 0`, `tc.property.startAdr || 0`, etc. Properties in test cases have optional fields; the runner substitutes 0 for missing inputs to test edge cases.

**Risk:** LOW. These are test inputs, not engine outputs. Schema-nullable values.

**Recommendation:** All Category A. Safe `?? 0` swap.

### `auditCashFlow.ts` — 8 sites

All Category B: `m.cashFlow`, `m.netIncome`, `m.depreciationExpense`, `m.principalPayment`, `m.refinancingProceeds`, `m.debtPayment`, `m.interestExpense`.

**Recommendation:** `assertFinite` preferred (accumulator on line 30).

### `auditIncomeStatement.ts` — 6 sites

All Category B: `m.anoi`, `m.interestExpense`, `m.depreciationExpense`, `m.incomeTax`, `m.refinancingProceeds`.

**Recommendation:** `assertFinite` or `?? 0`. No accumulators.

### `calculation-checker/index.ts` — 4 sites

- `engineCalc.find((m) => m.debtPayment > 0)?.debtPayment || 0` — Category A (chained optional)
- `(engineCalc.find(...)?.interestExpense || 0) + (...principalPayment || 0)` — Category A mixed with B
- `engineCalc[engineCalc.length - 1]?.endingCash || 0` — Category A (array index may be undefined on empty projections)

**Recommendation:** `?? 0` all four. The outer `?.` already handles undefined; NaN here would indicate a separate bug that should propagate anyway.

### `crossCalculatorValidation.ts` — 4 sites

All Category B: `m.depreciationExpense`, `m.operatingCashFlow`, `m.financingCashFlow`.

**Recommendation:** `?? 0` consistent.

### `verification/test-cases.ts` — 4 sites

Test fixtures. `tc.property.purchasePrice`, `tc.property.buildingImprovements`.

**Recommendation:** Category A. `?? 0` safe.

### `formulaChecker.ts` — 3 sites

Category B: `m.depreciationExpense`, `m.incomeTax`, `m.refinancingProceeds`.

**Recommendation:** `?? 0`.

### `auditDepreciation.ts` — 3 sites

All `m.depreciationExpense || 0` for different checks. Category B.

**Recommendation:** `?? 0`.

### `runVerification.ts` — 2 sites

- `property.buildingImprovements || 0` — Category A
- `y.netIncome += (m.netIncome || 0)` — Category C (accumulator)

**Recommendation:** First `?? 0`, second `assertFinite`.

---

## Recommended execution strategy

### Option 1 — **Aggressive**: `assertFinite` everywhere Category B+C

Pro: Best diagnostics. Matches financial-safety rule intent.
Con: Largest diff. Imports needed everywhere. Harder to review in one commit.

### Option 2 — **Pragmatic**: `?? 0` for B+C, `assertFinite` for accumulators only

Pro: Smaller diff. NaN still propagates through audit, surfaces bugs. Accumulators (5 sites) get proper diagnostic.
Con: Audit error messages may contain "NaN" strings on bug exposure.

### Option 3 — **Conservative**: `?? 0` everywhere, no `assertFinite`

Pro: Mechanical. Smallest diff. Single-commit batch.
Con: Bug exposure is silent (NaN in an `.toFixed(0)` becomes "NaN" string in a message). But at least the `||` → `??` migration IS done, and we can layer `assertFinite` on top in a subsequent batch.

**My recommendation:** **Option 2.** Gives good diagnostic on accumulators (where NaN is most toxic) without bloating the diff. 5 sites get `assertFinite`; ~75 sites get mechanical `?? 0` swap.

Split Batch 5 into sub-batches 5a–5c for reviewable commits:
- **5a** — Category A sites (schema-nullable, test fixtures): 22 sites. Zero risk.
- **5b** — Category B sites in non-accumulator reads: ~56 sites. Should be green; if red, real engine bug caught.
- **5c** — Category C accumulators with `assertFinite`: 5 sites. Diagnostic upgrade.

Each sub-batch passes `verify:summary` independently or surfaces a bug that we fix before the next sub-batch.

---

## Open questions for reviewer

1. **Is Option 2 the right call, or do you want aggressive Option 1 / conservative Option 3?**
2. **If NaN IS caught in engine output during 5b, do we stop Batch 5 and fix the engine first, or proceed with `?? 0` and file the engine bug as a follow-up?** (My default: stop, fix, resume.)
3. **Should the audit files be migrated to import from a single `calc/shared/decimal-helpers.ts` re-export of `assertFinite` for consistency, or leave each file importing from its own path?** (My default: single import path.)

---

## Related

- `.claude/rules/financial-safety.md` — "No `safeNum`" rule this implements.
- `.claude/plans/lint-warning-cleanup.md` — parent plan. Batches 1–4, 7, 8 done (155/348). Batch 5 is the next risky one.
- `.claude/rules/balance-sheet-identity.md` — what `auditBalanceSheet.ts` enforces.
- `docs/architecture/SYSTEM-MODEL.md` §9 — ranked roadmap.
