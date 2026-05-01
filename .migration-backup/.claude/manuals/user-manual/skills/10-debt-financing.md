# Chapter 10: Debt and Financing

For properties acquired with leverage, the debt structure plays a significant role in shaping investor returns. This chapter explains how acquisition loans are sized, how monthly payments are calculated, and how refinancing works.

## Acquisition Loan Terms

When a property is financed, the acquisition loan is structured with the following default terms:

| Parameter | Default Value |
|-----------|--------------|
| Loan-to-Value (LTV) | 75% |
| Interest Rate | 9% |
| Amortization Period | 25 years |
| Closing Costs | 2% of purchase price |

The loan amount equals 75% of the purchase price, with the remaining 25% funded by equity. Closing costs of 2% are added to the total acquisition cost and are borne by the equity investors.

## Monthly Payment Calculation

The model uses the standard fixed-payment amortization formula to calculate monthly debt service:

**PMT = P × r × (1 + r)^n ÷ ((1 + r)^n − 1)**

Where P is the loan principal, r is the monthly interest rate (annual rate divided by 12), and n is the total number of monthly payments (term in years multiplied by 12).

This formula produces a level monthly payment that remains constant throughout the life of the loan, though the split between interest and principal changes over time.

## Interest Versus Principal

Each monthly payment contains two components, and understanding the distinction between them is essential for accurate financial reporting:

**Interest** equals the outstanding loan balance multiplied by the monthly interest rate. Interest is an operating expense that appears on the income statement. Over time, as the loan balance decreases, the interest portion of each payment shrinks.

**Principal** equals the total monthly payment minus the interest portion. Principal repayment reduces the loan balance but is classified as a financing activity under ASC 470 — it is never recorded as an expense on the income statement. Over time, the principal portion of each payment grows.

This standard amortization pattern means that early payments are predominantly interest, while later payments are predominantly principal.

## Refinancing

At a configurable point during the hold period (by default, three years after operations begin), the property may be refinanced. The refinancing replaces the original loan with a new loan sized at 65% of the property's appraised value, with closing costs of 3%.

The original loan is paid off in full from the new loan proceeds. If the new loan exceeds the payoff amount plus closing costs, the excess cash is returned to investors. This mechanism is a powerful tool for equity recovery — it allows investors to pull capital out of a performing property without triggering a taxable sale event.
