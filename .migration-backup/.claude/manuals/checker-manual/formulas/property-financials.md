# Property SPV — Financial Statement Formulas

> Pure formula reference for property-level financial projections.
> All formulas operate on a **monthly** basis unless noted otherwise.

---

## Revenue Formulas

| ID | Formula | Description |
|--------|---------|-------------|
| F-P-01 | `Available Rooms = Room Count × 30.5` | Available room-nights per month (industry standard days/month) |
| F-P-02 | `Sold Rooms = Available Rooms × Occupancy Rate` | Occupied room-nights for the period |
| F-P-03 | `Room Revenue = Sold Rooms × ADR` | Core rooms department revenue |
| F-P-04 | `Event Revenue = Room Revenue × Revenue Share Events` | Ancillary event/venue revenue as ratio of room revenue |
| F-P-05 | `F&B Revenue = Room Revenue × Revenue Share F&B × (1 + Catering Boost %)` | Food & beverage with catering uplift factor |
| F-P-06 | `Other Revenue = Room Revenue × Revenue Share Other` | Spa, parking, retail, and miscellaneous revenue |
| F-P-07 | `Total Revenue = Room Revenue + Event Revenue + F&B Revenue + Other Revenue` | Gross operating revenue (all departments) |

---

## ADR Growth

| ID | Formula | Description |
|--------|---------|-------------|
| F-P-08 | `ADR(month) = Start ADR × (1 + ADR Growth Rate)^year` | Compounding annual ADR escalation applied to each month within the year |

---

## Occupancy Ramp

| ID | Formula | Description |
|--------|---------|-------------|
| F-P-09 | `Occupancy(month) = Start Occupancy + (month ÷ Ramp Months) × (Max Occupancy − Start Occupancy)` | Linear interpolation during ramp-up period |
| F-P-10 | `Occupancy = Max Occupancy` | Stabilized occupancy after ramp period ends |

---

## Operating Expenses (USALI Departmental)

### Variable Expenses (Revenue-Linked)

| ID | Formula | Description |
|--------|---------|-------------|
| F-P-11 | `Expense_Rooms = Revenue_Rooms × Cost Rate Rooms` | Rooms department variable cost |
| F-P-12 | `Expense_FB = Revenue_FB × Cost Rate F&B` | F&B department variable cost |
| F-P-13 | `Expense_Events = Revenue_Events × Event Expense Rate` | Event department variable cost (global rate) |
| F-P-14 | `Expense_Other = Revenue_Other × Other Expense Rate` | Other department variable cost (global rate) |

### Fixed Expenses (Escalating)

| ID | Formula | Description |
|--------|---------|-------------|
| F-P-15 | `Expense_Admin = Base Monthly Total Rev × Cost Rate Admin × Fixed Cost Factor` | Administrative & general |
| F-P-16 | `Expense_Marketing = Base Monthly Total Rev × Cost Rate Marketing × Fixed Cost Factor` | Sales & marketing |
| F-P-17 | `Expense_Maintenance = Base Monthly Total Rev × Cost Rate Maintenance × Fixed Cost Factor` | Property operations & maintenance |
| F-P-18 | `Expense_Insurance = (Purchase Price + Building Improvements) ÷ 12 × Cost Rate Insurance × Fixed Cost Factor` | Property insurance (based on property value) |
| F-P-18b | `Expense_Taxes = (Purchase Price + Building Improvements) ÷ 12 × Cost Rate Taxes × Fixed Cost Factor` | Property taxes (based on property value) |
| F-P-19 | `Expense_Technology = Base Monthly Total Rev × Cost Rate Technology × Fixed Cost Factor` | IT systems & technology |

### Utilities (Blended Split)

| ID | Formula | Description |
|--------|---------|-------------|
| F-P-20 | `Expense_Utilities = (Variable Split × Revenue Factor) + (Fixed Split × Escalation Factor)` | Utilities split between variable (revenue-driven) and fixed (escalating) portions |

### Fixed Cost Escalation

| ID | Formula | Description |
|--------|---------|-------------|
| F-P-21 | `Fixed Cost Factor = (1 + Fixed Cost Escalation Rate)^year` | Annual compounding escalator for all fixed operating costs |

### Total

| ID | Formula | Description |
|--------|---------|-------------|
| F-P-22 | `Total Operating Expenses = Σ(all departmental expenses)` | Sum of F-P-11 through F-P-20 |

---

## Profitability

| ID | Formula | Description |
|--------|---------|-------------|
| F-P-23 | `GOP = Total Revenue − Total Operating Expenses` | Gross Operating Profit |
| F-P-24 | `Base Management Fee = Total Revenue × Base Fee Rate` | Operator base fee (% of revenue) |
| F-P-25 | `Incentive Management Fee = max(0, GOP × Incentive Fee Rate)` | Performance-based incentive fee; base may be GOP or NOI per `incentiveFeeBase` setting |
| F-P-26 | `FF&E Reserve = Total Revenue × FF&E Rate` | Furniture, fixtures & equipment reserve (typically 4%) |
| F-P-27 | `NOI = GOP − Base Management Fee − Incentive Management Fee − FF&E Reserve` | Net Operating Income |

---

## Depreciation (ASC 360 / IRS Pub 946)

| ID | Formula | Description |
|--------|---------|-------------|
| F-P-28 | `Land Value = Purchase Price × Land Value Percent` | Non-depreciable land component |
| F-P-29 | `Depreciable Basis = Purchase Price × (1 − Land Value %) + Building Improvements` | Total depreciable real property basis |
| F-P-30 | `Monthly Depreciation = Depreciable Basis ÷ 27.5 years ÷ 12 months` | Straight-line depreciation per IRS residential rental property schedule |

---

## Income Statement

| ID | Formula | Description |
|--------|---------|-------------|
| F-P-31 | `Taxable Income = NOI − Interest Expense − Depreciation Expense` | Pre-tax income after financing and non-cash charges |
| F-P-32 | `Income Tax = max(0, Taxable Income × Tax Rate)` | Federal/state income tax (no negative tax; losses carry forward implicitly) |
| F-P-33 | `GAAP Net Income = NOI − Interest Expense − Depreciation Expense − Income Tax` | Bottom-line net income per GAAP |

---

## Balance Sheet

| ID | Formula | Description |
|--------|---------|-------------|
| F-P-34 | `Total Assets = Land Value + (Depreciable Basis − Accumulated Depreciation) + Cash` | Property assets at net book value plus liquid assets |
| F-P-35 | `Total Liabilities = Outstanding Debt` | Mortgage and/or refinanced loan balance |
| F-P-36 | `Total Equity = Total Assets − Total Liabilities` | Residual ownership interest (must balance) |

---

## Cash Flow Statement (ASC 230 Indirect Method)

| ID | Formula | Description |
|--------|---------|-------------|
| F-P-37 | `CFO = Net Income + Depreciation` | Cash from Operations — add back non-cash depreciation charge |
| F-P-38 | `CFI = −Total Property Cost` | Cash from Investing — acquisition year only; includes purchase price, improvements, pre-opening, reserve, closing costs |
| F-P-39 | `CFF = Loan Proceeds − Principal Payments + Equity Invested + Refi Proceeds` | Cash from Financing — equity contribution and loan proceeds in acquisition year; refi proceeds in refinance year |
| F-P-40 | `Net Change in Cash = CFO + CFI + CFF` | Period change in cash position |
| F-P-41 | `Ending Cash = Opening Cash + Net Change in Cash` | Cumulative cash balance carried forward |
