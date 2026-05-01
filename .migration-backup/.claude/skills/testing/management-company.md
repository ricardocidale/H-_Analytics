# Testing: Management Company (OpCo) Statements

## Scope
Tests for the management company pro forma — fee revenue linkage, staffing model, fixed costs, partner compensation, SAFE/funding instrument cash flows, and cash balance integrity.

## Entity Level
**Management Company** — tests operate on `generateCompanyProForma()` output with linked property data.

---

## Test Files

### Company Pro Forma Golden — `tests/engine/company-proforma.test.ts` (25 tests)
Tests `generateCompanyProForma()` from `client/src/lib/financial/company-engine.ts`.

### Per-Property Fees — `tests/engine/per-property-fees.test.ts` (32 tests)
Tests per-property management fee rates — default rates, custom overrides, fallback behavior, zero-rate scenarios, multi-property aggregation, and seed data integrity. Validates that each property independently calculates its own base and incentive management fees using `baseManagementFeeRate` and `incentiveManagementFeeRate`, with fallback to `DEFAULT_BASE_MANAGEMENT_FEE_RATE` (5%) and `DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE` (15%) from `shared/constants.ts`.

#### Revenue (Fee Linkage)
| Test | What It Proves |
|------|---------------|
| Base fee = property revenue × property.baseManagementFeeRate | Base management fee formula (per-property rate, default 5%) |
| Incentive fee = property GOP × property.incentiveManagementFeeRate | Incentive fee formula (per-property rate, default 15%) |
| Total revenue = base + incentive | Revenue aggregation |

**Identity**: `OpCo total revenue = Σ(property[i].totalRevenue × property[i].baseManagementFeeRate) + Σ(max(0, property[i].GOP × property[i].incentiveManagementFeeRate))`

#### Staffing Model (Tiered)
| Test | What It Proves |
|------|---------------|
| Staff compensation = FTE count × salary / 12 | Monthly staffing cost |
| Tier 1 (1 property) = 2.5 FTE | Correct tier assignment |

Tiers: 1 prop → 2.5 FTE, 2 props → 4.0 FTE, 3 props → 5.5 FTE, 4+ → 7.0 FTE

#### Partner Compensation
| Test | What It Proves |
|------|---------------|
| Monthly partner comp = Year 1 annual / 12 | Base calculation |
| Partner comp escalates annually | Growth rate applied |

#### Fixed Costs (Year 1, with escalation)
| Test | What It Proves |
|------|---------------|
| Office lease = $36K / 12 | Monthly allocation |
| Professional services = $24K / 12 | Monthly allocation |
| Tech infrastructure = $18K / 12 | Monthly allocation |
| Business insurance = $12K / 12 | Monthly allocation |
| Marketing = $6K / 12 | Monthly allocation |
| Travel = $15K / 12 | Monthly allocation |

All fixed costs escalate at `companyExpenseEscalation` rate per year.

#### Cash Balance
| Test | What It Proves |
|------|---------------|
| Month 0 cash = SAFE funding + net income | Initial cash position |
| Cash accumulates correctly month-over-month | Running balance |
| No negative cash with adequate SAFE funding | Viability check |

---

## Funding Instrument Tests — `tests/funding/` (25 tests)

### Funding Engine — `tests/funding/funding-engine.test.ts`
| Test | What It Proves |
|------|---------------|
| SAFE tranche 1 deploys on schedule | Timing correctness |
| SAFE tranche 2 deploys on schedule | Second tranche timing |
| Total funding = tranche 1 + tranche 2 | Sum identity |

### Gates — `tests/funding/gates.test.ts`
| Test | What It Proves |
|------|---------------|
| Minimum raise gate blocks if under threshold | Gate enforcement |
| Valuation cap gate applies correctly | Cap mechanics |

### Equity Rollforward — `tests/funding/equity-rollforward.test.ts` (6 tests)
| Test | What It Proves |
|------|---------------|
| Beginning equity + contributions - distributions = ending equity | Rollforward identity |
| Retained earnings flows through correctly | IS → equity linkage |

### Timeline — `tests/funding/timeline.test.ts`
| Test | What It Proves |
|------|---------------|
| On-acquisition trigger resolves date | Date linkage |
| Conditional trigger uses fallback date | Fallback logic |

### Golden — `tests/funding/golden.test.ts`
Full lifecycle test of funding instrument through deployment and returns.

---

## Management Company Balance Sheet Tests

The management company balance sheet is tested through:
1. **`engine/company-proforma`** — Cash balance integrity (cumulative NI + SAFE funding)
2. **`proof/scenarios` (Scenario 5)** — Consolidated BS includes OpCo, A = L + E holds
3. **`statements/balance-sheet`** — Deferred financing costs classification

### Key Balance Sheet Lines (OpCo)
```
ASSETS
  Cash & Cash Equivalents = SAFE Funding + Cumulative Net Income
  Total Assets = Cash

LIABILITIES
  SAFE Notes Payable = Total SAFE Funding (Tranche 1 + Tranche 2)
  Total Liabilities = SAFE Notes

EQUITY
  Retained Earnings = Cumulative (Revenue - Expenses)
  Total Equity = Retained Earnings
```

**Identity**: `Cash = SAFE Notes Payable + Retained Earnings`

---

## Run Commands
```bash
npx vitest run tests/engine/company-proforma.test.ts   # Company pro forma (25 tests)
npx vitest run tests/engine/per-property-fees.test.ts  # Per-property fee tests (32 tests)
npx vitest run tests/funding/                          # All funding tests (25 tests)
npx vitest run tests/proof/scenarios.test.ts           # Includes Scenario 5 (consolidated + OpCo)
```

## Related Skills
- `.claude/skills/finance/management-company-statements.md` — OpCo statement construction
- `.claude/skills/finance/fee-linkage.md` — Fee linkage identity
- `.claude/skills/finance/consolidation.md` — Consolidation with OpCo
