# Fee Types & Waterfall Placement — Management Company ↔ Property Linkage

Every fee the Management Company charges to properties creates a mirror entry: an **expense** on the property's Income Statement and **revenue** on the Management Company's Income Statement. The same dollar amount must appear on both sides.

---

## Fee Types

### 1. Base Management Fee (Revenue-Linked)

**Formula:**
```
Base Fee = Total Property Revenue × property.baseManagementFeeRate
Default rate: 5% (DEFAULT_BASE_MANAGEMENT_FEE_RATE)
```

**Characteristics:**
- **Defined per property** — each property has its own `baseManagementFeeRate`
- Calculated on **Total Revenue** (rooms + F&B + events + other)
- NOT dependent on profitability — charged even if the property loses money
- Scales linearly with revenue: higher occupancy/ADR = higher fee
- Provides the Management Company with a stable, predictable revenue floor

**Engine fields:**
- Property: `feeBase` (MonthlyFinancials)
- Company: `baseFeeRevenue` (CompanyMonthlyFinancials)

**USALI classification:** Fixed charge, deducted after GOP

### 2. Incentive Management Fee (Performance-Linked)

**Formula:**
```
Incentive Fee = max(0, GOP × property.incentiveManagementFeeRate)
Default rate: 15% (DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE)
```

**Characteristics:**
- **Defined per property** — each property has its own `incentiveManagementFeeRate`
- Calculated on **Gross Operating Profit (GOP)**, not revenue
- Performance-dependent: only charged when GOP > 0
- Aligns Management Company incentives with property profitability
- If the property has negative GOP (operating at a loss), incentive fee = $0
- Rewards operational efficiency: reducing costs increases GOP and the fee

**Engine fields:**
- Property: `feeIncentive` (MonthlyFinancials)
- Company: `incentiveFeeRevenue` (CompanyMonthlyFinancials)

**USALI classification:** Fixed charge, deducted after GOP

### Why Two Separate Fee Lines Matter

The base fee and incentive fee behave differently under stress:

| Scenario | Base Fee Impact | Incentive Fee Impact |
|----------|----------------|---------------------|
| Revenue drops 20%, GOP stays positive | Drops 20% (proportional) | Drops more than 20% (GOP falls faster than revenue due to fixed costs) |
| Revenue drops 50%, GOP goes negative | Drops 50% | Goes to $0 (floor at zero) |
| Revenue increases 30% | Increases 30% | Increases more than 30% (operating leverage) |
| Costs increase, revenue flat | No change | Decreases (GOP shrinks) |

This asymmetry means the Management Company's revenue mix shifts toward base fees in downturns and toward incentive fees in strong markets. Tracking them as separate lines makes this visible in projections.

---

## Income Statement Placement (USALI Waterfall)

Fees sit between GOP and NOI — they are NOT operating expenses:

```
TOTAL REVENUE
− TOTAL OPERATING EXPENSES
─────────────────────────────
= GROSS OPERATING PROFIT (GOP)      ← Fees calculated from this line and above
─────────────────────────────
− Base Management Fee                ← % of Property Gross Revenue
− Incentive Management Fee           ← % of Property GOP (only if GOP > 0)
− FF&E Reserve                       ← % of Total Revenue
─────────────────────────────
= NET OPERATING INCOME (NOI)         ← After all fees and reserves
```

**Why fees are below GOP (USALI rule):**
- GOP measures operational performance independent of management structure
- Two identical hotels with different management contracts have the same GOP but different NOI
- Industry benchmarking (STR, HotStats) uses GOP for comparison
- Lenders evaluate operational performance at the GOP level

**Why fees are above NOI:**
- NOI must reflect all obligations before capital structure items (interest, depreciation)
- Management fees are a contractual obligation of the property
- NOI is used for property valuation (NOI ÷ Cap Rate) and must include fee deductions

---

## Mirror Entry: Property Expense ↔ Company Revenue

The same dollar flows through two separate entities:

```
┌─────────────────────────┐     ┌─────────────────────────┐
│     PROPERTY SPV        │     │  MANAGEMENT COMPANY     │
│                         │     │                         │
│ Income Statement:       │     │ Income Statement:       │
│   GOP: $500,000         │     │                         │
│   − Base Fee: −$80,000  │────▶│   Base Fee Rev: $80,000 │
│   − Incent Fee:−$50,000 │────▶│   Incent Fee Rev:$50,000│
│   − FF&E: −$40,000      │     │                         │
│   = NOI: $330,000       │     │   Total Rev: $130,000   │
│                         │     │   − Expenses: $90,000   │
│ Cash Flow:              │     │   = Net Income: $40,000 │
│   Fees reduce operating │     │                         │
│   cash (already in NOI) │     │ Cash Flow:              │
│                         │     │   Fees are operating    │
│                         │     │   cash inflow            │
└─────────────────────────┘     └─────────────────────────┘
```

### Timing Rule
- Fees are only charged when a property is **operational** (after `operationsStartDate`)
- Pre-operational properties generate zero revenue → zero base fee, zero GOP → zero incentive fee
- The Management Company receives no fee revenue from non-operational properties

### Per-Property Rate Configuration
- Each property stores its own `baseManagementFeeRate` and `incentiveManagementFeeRate`
- If not set on a property, the engine falls back to `DEFAULT_BASE_MANAGEMENT_FEE_RATE` (5%) and `DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE` (15%) from `shared/constants.ts`
- Global fee fields (`baseManagementFee`, `incentiveManagementFee`) on the GlobalAssumptions are **deprecated** — kept in DB schema for backward compatibility only
- CompanyAssumptions.tsx displays a read-only summary table of each property's fee rates (not editable)
- Fee rates are edited on each property's PropertyEdit page under the "Management Fees" section

### Multi-Property Aggregation
When the Management Company manages multiple properties:
```
Company Base Fee Revenue     = Σ (each property's feeBase)
Company Incentive Fee Revenue = Σ (each property's feeIncentive)
Company Total Revenue         = Company Base + Company Incentive
```

Each property's fee is calculated independently, then summed for the company.

---

## Cash Flow Treatment

| Item | Property Cash Flow | Company Cash Flow |
|------|-------------------|------------------|
| Base Fee | Already in NOI → Operating Activity (outflow) | Operating Activity (inflow) |
| Incentive Fee | Already in NOI → Operating Activity (outflow) | Operating Activity (inflow) |

Fees are cash items — they represent actual payments from property to management company. They are NOT non-cash like depreciation.

---

## Potential Extensions (Not Currently Implemented)

Common hospitality management agreement fees that could be added in future:

| Fee Type | Basis | Performance-Linked? |
|----------|-------|-------------------|
| Technology/IT Fee | Per room per month or % of revenue | No |
| Accounting Fee | Fixed monthly or % of revenue | No |
| Procurement Fee | % of purchasing volume | No |
| Asset Management Fee | % of gross asset value | No |
| Owner's Priority Return | Fixed return on equity before incentive | Yes (gates incentive fee) |
| Performance Termination | Threshold-based (e.g., fail DSCR test 2 years) | Yes |

These would follow the same pattern: expense on property, revenue on company, tracked as separate lines.

---

## Implementation Files

| Concept | File | Function/Field |
|---------|------|---------------|
| Property fee calculation | `client/src/lib/financial/property-engine.ts` | `feeBase`, `feeIncentive` in `generatePropertyProForma()` |
| Company fee revenue | `client/src/lib/financial/company-engine.ts` | `baseFeeRevenue`, `incentiveFeeRevenue` in `generateCompanyProForma()` |
| Fee rates (per property) | `shared/schema.ts` | `baseManagementFeeRate`, `incentiveManagementFeeRate` on each property |
| Default rates | `shared/constants.ts` | `DEFAULT_BASE_MANAGEMENT_FEE_RATE` (5%), `DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE` (15%) |
| Fee rate UI (edit) | `client/src/pages/PropertyEdit.tsx` | Management Fees section with sliders, tooltips, and research badges |
| Fee rate UI (summary) | `client/src/pages/CompanyAssumptions.tsx` | Read-only table showing each property's fee rates |
| Cross-entity validation | `.claude/skills/finance/validation-identities.md` | Validation identity and audit procedure |

---

## Related Skills

| Skill | Path |
|-------|------|
| Fee Reconciliation | `.claude/skills/finance/validation-identities.md` |
| Income Statement | `.claude/skills/finance/income-statement.md` |
| Management Company Statements | `.claude/skills/finance/management-company-statements.md` |
| Cash Line Architecture | `.claude/skills/finance/cash-line-architecture.md` |
| Validation Identities | `.claude/skills/finance/validation-identities.md` |
