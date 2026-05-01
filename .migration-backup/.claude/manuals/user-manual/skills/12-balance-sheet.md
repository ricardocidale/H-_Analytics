# Chapter 12: Balance Sheet

The balance sheet provides a snapshot of each entity's financial position at a point in time — what it owns, what it owes, and what belongs to the investors. The platform generates GAAP-compliant balance sheets that are validated every period to ensure they remain in balance.

## Assets

The asset side of the balance sheet comprises three categories:

**Cash** reflects the cumulative effect of operating cash flows, capital contributions, debt proceeds, refinancing events, and distributions. It is the running total of all cash inflows and outflows since the entity's inception.

**Property Value** equals the original purchase price plus any building improvements, minus accumulated depreciation. This net book value decreases over time as depreciation accumulates, even though the property's market value may be increasing.

**Land** is the non-depreciable portion of the purchase price. Under accounting standards, land does not wear out and therefore is never depreciated. It remains on the balance sheet at its original cost throughout the projection period.

## Liabilities

**Debt Outstanding** represents the remaining loan balance after accounting for all principal payments made to date. For properties that have been refinanced, this reflects the balance of the new loan.

**Accrued Expenses** capture current-period obligations that have been recognized but not yet paid.

## Equity

**Invested Capital** is the original equity contribution made by investors at acquisition, representing their ownership stake in the property.

**Retained Earnings** equals the cumulative net income earned since inception, minus any distributions that have been made to investors. This account grows as the property generates profits and shrinks when cash is distributed.

## The Fundamental Equation

In every period, for every entity, the balance sheet must satisfy the fundamental accounting equation:

**Assets = Liabilities + Equity**

The platform validates this equation continuously. Any variance greater than one dollar triggers a visible warning, as it would indicate a calculation error. This requirement follows the FASB Conceptual Framework and ensures the integrity of the entire financial model.

## Depreciation

Depreciation is calculated using the straight-line method over a 27.5-year useful life, as mandated by the IRS (Publication 946) and codified in ASC 360:

**Monthly Depreciation = Depreciable Basis ÷ 27.5 ÷ 12**

The depreciable basis equals the purchase price multiplied by the building percentage (one minus the land percentage), plus any building improvements. Land is excluded because it is not a depreciable asset.

The model assumes no salvage value — the building is depreciated to zero over its useful life. Depreciation begins in the first full month after acquisition and continues at a constant rate throughout the projection period.
