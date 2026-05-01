# Chapter 16: Cross-Verification and Audit Trail

Financial models are only as trustworthy as their accuracy. The platform addresses this challenge through an independent, two-layer verification system that checks every calculation against the same inputs using a completely separate implementation. This chapter explains how verification works and what the results mean.

## Two-Layer Verification

The verification system operates at two independent layers, each serving as a check on the other:

**The first layer** runs within your browser and performs three types of analysis: a formula checker that validates individual calculations, a GAAP compliance checker that ensures accounting standards are followed, and a financial auditor that evaluates the reasonableness of results.

**The second layer** runs on the server using an entirely independent calculation engine. This engine was built separately from the primary financial model and does not share any calculation code with it. By recalculating every number from scratch using only the raw assumptions, the server-side checker provides an objective second opinion on every figure in the model.

When both layers agree, you can have high confidence that the numbers are correct. When they disagree, the discrepancy is flagged for review.

## Audit Opinions

The verification system issues formal audit opinions modeled on the standards used by professional auditing firms:

| Opinion | Meaning |
|---------|---------|
| **Unqualified** | Clean opinion — all calculations have been independently verified and no discrepancies were found |
| **Qualified** | Minor discrepancies were identified, typically due to rounding differences or edge-case timing issues |
| **Adverse** | Significant errors were found that require attention before the projections should be relied upon |

## What Gets Checked

The verification system examines calculations across the full spectrum of the financial model, organized by the applicable accounting standard:

- **Revenue calculations** are verified against ASC 606 (Revenue from Contracts with Customers)
- **Depreciation** is checked against ASC 360 (Property, Plant, and Equipment) and IRS Publication 946
- **Loan mathematics** — including amortization schedules, interest calculations, and refinancing — are verified against ASC 470 (Debt)
- **Balance sheet integrity** is validated against the FASB Conceptual Framework, confirming that assets equal liabilities plus equity in every period
- **Cash flow classification** is checked against ASC 230 (Statement of Cash Flows), ensuring that operating, investing, and financing activities are properly categorized
- **Reasonableness checks** verify that key metrics like NOI margin fall within expected ranges (15% to 45% for stabilized hotels)

## Activity Logging

All user actions and verification results are logged with timestamps and user attribution, creating a complete audit trail. This logging ensures that any changes to assumptions can be traced back to who made them and when, and that verification results are preserved for future reference.
