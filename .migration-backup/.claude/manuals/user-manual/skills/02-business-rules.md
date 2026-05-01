# Chapter 2: Business Rules and Constraints

The financial model enforces seven mandatory rules that cannot be overridden. These rules reflect fundamental accounting principles and prudent financial management practices. Every projection the platform generates adheres to these constraints, and any scenario that would violate them is flagged immediately.

## Rule 1: Interest Only on the Income Statement, Never Principal

The income statement reflects only the interest portion of debt service. Net Income is calculated as NOI minus interest expense, minus depreciation, minus income tax. Loan principal repayment is classified as a financing activity in accordance with ASC 470, and it never appears as an operating expense. This distinction is critical for accurately measuring operating profitability.

## Rule 2: Debt-Free at Exit

When a property is sold at the end of the projection period, all outstanding debt must be repaid from the gross sale proceeds before any distributions to investors. No property exits the model with remaining loan balances.

## Rule 3: No Negative Cash

Cash balances must remain at or above zero at all times — for each individual property, for the management company, and for the portfolio as a whole. The model will not permit a scenario in which any entity runs out of cash.

## Rule 4: No Over-Distribution

Free cash flow distributions and refinancing proceeds may not be distributed to the point where any entity's cash balance goes negative. Distributions are constrained by available cash, ensuring that no entity is left underfunded.

## Rule 5: Capital Sources on Separate Lines

Equity contributions, loan proceeds, and refinancing proceeds must always appear as separate, clearly identified line items in all financial reports. Capital sources are never commingled or netted against one another, maintaining full transparency for investors and auditors.

## Rule 6: Funding Gates

The management company cannot begin operations until SAFE funding has been received. Similarly, individual properties cannot begin operations until their acquisition has been funded — whether through equity, debt, or a combination of both. These gates ensure that no entity generates revenue or incurs operating expenses before its capital is in place.

## Rule 7: Balance Sheet Must Balance

The fundamental accounting equation — Assets equals Liabilities plus Equity — must hold true in every period for every entity. This is validated continuously, and any variance is flagged as an error. This requirement follows the FASB Conceptual Framework and the standards set forth in ASC 230 (cash flows), ASC 470 (debt), and ASC 360 (property, plant, and equipment).
