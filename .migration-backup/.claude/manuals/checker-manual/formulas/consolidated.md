# Consolidated Portfolio — Aggregation Formulas

> Pure formula reference for portfolio-level consolidation across all property SPVs.
> Consolidation follows **ASC 810** principles for entities under common control.

---

## Consolidation Method

| ID | Formula | Description |
|--------|---------|-------------|
| F-X-01 | `Consolidated Revenue = Σ(Property[i].Total Revenue) for all i` | Sum of gross revenue across all active properties for each period |
| F-X-02 | `Consolidated Expenses = Σ(Property[i].Total Expenses) for all i` | Sum of operating expenses across all active properties |
| F-X-03 | `Consolidated GOP = Σ(Property[i].GOP) for all i` | Aggregate gross operating profit |
| F-X-04 | `Consolidated NOI = Σ(Property[i].NOI) for all i` | Aggregate net operating income |
| F-X-05 | `Consolidated Net Income = Σ(Property[i].Net Income) for all i` | Aggregate bottom-line net income |
| F-X-06 | `Consolidated Cash = Σ(Property[i].Ending Cash) for all i` | Aggregate cash position across portfolio |

> **Note:** All property-level line items are summed across all active properties for each period. Properties that have not yet reached their operations start date contribute zero.

---

## Elimination Entries (Inter-Company)

| ID | Formula | Description |
|--------|---------|-------------|
| F-X-07 | `Management Fee Elimination: Property Expense ↔ Company Revenue` | Base and incentive management fees appear as expenses on each property P&L and as revenue on the management company P&L — these cancel in a true consolidated view per ASC 810 inter-company elimination requirements |

> **Checker Note:** When verifying consolidated statements, confirm that management fees net to zero. The sum of property-side fee expenses should equal the management company's total fee revenue.

---

## Balance Sheet Aggregation

| ID | Formula | Description |
|--------|---------|-------------|
| F-X-08 | `Total Portfolio Assets = Σ(Property[i].Total Assets)` | Sum of all property assets (land + net book value + cash) |
| F-X-09 | `Total Portfolio Liabilities = Σ(Property[i].Total Liabilities)` | Sum of all property debt obligations |
| F-X-10 | `Total Portfolio Equity = Σ(Property[i].Total Equity)` | Residual equity across portfolio; must equal F-X-08 − F-X-09 |
