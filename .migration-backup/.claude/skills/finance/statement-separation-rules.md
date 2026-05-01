# Statement Separation Rules — What Goes Where

This skill defines exactly which financial items appear on which statements. Use this as the definitive quick-reference when building, modifying, or auditing any financial statement component.

---

## The Golden Rule

Every financial transaction affects at least two of the three core statements. The separate cash lines in the engine (see `cash-line-architecture.md`) ensure each item lands in the right place.

---

## Item-by-Statement Matrix

| Item | Income Statement | Cash Flow Statement | Balance Sheet |
|------|-----------------|-------------------|---------------|
| **Room Revenue** | Revenue (above GOP) | Embedded in Net Income (Operating) | Increases Cash (Asset) |
| **F&B / Events / Other Revenue** | Revenue (above GOP) | Embedded in Net Income (Operating) | Increases Cash (Asset) |
| **Operating Expenses** | Expense (above GOP) | Embedded in Net Income (Operating) | Decreases Cash (Asset) |
| **Management Fees** | Deduction (GOP to NOI) | Embedded in Net Income (Operating) | Decreases Cash (Asset) |
| **FF&E Reserve** | Deduction (GOP to NOI) | Investing Activity (CapEx) | Restricted Cash (Asset) |
| **Interest Expense** | Expense (below NOI) | Operating Activity (ASC 230.27) | Via Retained Earnings |
| **Principal Payment** | **NEVER** | Financing Activity (outflow) | Reduces Debt (Liability) |
| **Depreciation** | Expense (below NOI, non-cash) | Added back in Operating (non-cash) | Reduces Net Property (Asset) |
| **Income Tax** | Expense (below depreciation) | Embedded in Net Income (Operating) | Via Retained Earnings |
| **Loan Proceeds** | **NEVER** | Financing Activity (inflow) | Increases Debt + Cash |
| **Refinance Proceeds** | **NEVER** | Financing Activity (inflow) | Changes Debt structure |
| **Property Purchase** | **NEVER** | Investing Activity (outflow) | Creates Asset |
| **Equity Investment** | **NEVER** | Financing Activity (inflow) | Increases Equity + Cash |
| **SAFE Funding** | **NEVER** | Financing Activity (inflow) | Increases Equity + Cash |
| **Sale Proceeds** | **NEVER** | Investing Activity (inflow) | Removes Asset, generates Cash |

---

## Three Things That Are NOT Expenses

These are the most common errors in hotel pro formas. The engine's separate cash lines prevent all three:

### 1. Principal Payments (ASC 470)
- **What it is:** Repayment of borrowed capital
- **Why not an expense:** You're returning money you borrowed, not paying for something consumed
- **Where it goes:** Cash Flow (Financing) + Balance Sheet (reduces Liability)
- **Engine field:** `principalPayment` — separate from `interestExpense`

### 2. Loan/Refinance Proceeds
- **What it is:** Cash received from borrowing
- **Why not revenue:** Creates an obligation to repay — it's a liability, not income
- **Where it goes:** Cash Flow (Financing) + Balance Sheet (increases Liability + Cash)
- **Engine field:** `refinancingProceeds` — separate from operating revenue

### 3. Property Purchase
- **What it is:** Acquisition of a long-term asset
- **Why not an expense:** Creates value on the Balance Sheet (the asset exists for 27.5+ years)
- **Where it goes:** Cash Flow (Investing) + Balance Sheet (creates Asset)
- **Engine field:** Handled at acquisition via `propertyValue` and `debtOutstanding`

---

## Two Things That Are NOT Cash

### 1. Depreciation (ASC 360)
- Records the "using up" of building value over 27.5 years
- Reduces Net Income but no cash leaves the business
- Must be added back on the Cash Flow Statement
- **Engine field:** `depreciationExpense` — tracked independently

### 2. Accrued Revenue (ASC 606)
- Revenue recognized when guest stays, not when payment received
- For stabilized hotels, the difference is minimal (pro forma assumes zero A/R change)
- **Engine field:** Revenue is recorded as earned, working capital change assumed zero

---

## Cross-Entity Rules

### Management Fee Linkage
The same fee amount appears on two entities' statements:

| Entity | Statement | Treatment |
|--------|-----------|----------|
| **Property SPV** | Income Statement | Expense (deducted between GOP and NOI) |
| **Management Company** | Income Statement | Revenue |

**Validation:** `Σ(Property Fee Expenses) = Management Company Fee Revenue` must hold exactly.

### SAFE Funding (Management Company Only)
- **NOT revenue** — it's equity capital from investors
- Appears: Cash Flow (Financing) + Balance Sheet (Equity)
- Never appears on Income Statement

---

## Related Skills

| Skill | Path |
|-------|------|
| Cash Line Architecture | `.claude/skills/finance/cash-line-architecture.md` |
| Income Statement | `.claude/skills/finance/income-statement.md` |
| Cash Flow Statement | `.claude/skills/finance/cash-flow-statement.md` |
| Balance Sheet | `.claude/skills/finance/balance-sheet.md` |
| Validation Identities | `.claude/skills/finance/validation-identities.md` |
| Cross-Statement Reference | `.claude/skills/finance/cross-statement-reference.md` |
