# Chapter 13: Investment Returns

The ultimate measure of any investment is the return it delivers. This chapter explains how the platform calculates exit value and the three key return metrics that investors use to evaluate performance.

## Exit Valuation

At the end of the projection period, each property's exit value is determined using the income capitalization approach — the standard valuation method for commercial real estate:

**Exit Value = Final Year NOI ÷ Exit Cap Rate**

Using the default exit cap rate of 8.5%, a property generating $850,000 in final-year NOI would be valued at $10,000,000.

From this gross exit value, two deductions are made before calculating net proceeds to investors:

**Net Proceeds = Exit Value − Sales Commission − Outstanding Debt**

The sales commission defaults to 5% of the gross sale price, covering broker fees and transaction costs. All outstanding debt is repaid in full at exit, consistent with the model's debt-free-at-exit rule.

## Internal Rate of Return (IRR)

The IRR is the discount rate that makes the net present value of all cash flows equal to zero. It is the single most widely used metric for evaluating real estate investment performance because it accounts for both the magnitude and the timing of cash flows.

The model constructs the full cash flow timeline for each investment: a negative cash flow at the beginning (equity invested), positive cash flows during operations (free cash flow distributions), and a large positive cash flow at exit (net sale proceeds plus any final distributions). The IRR is then solved using the Newton-Raphson iterative method.

Returns above 15% are highlighted in the platform's reports, reflecting the threshold at which most investors consider a boutique hotel investment to be performing well.

## Equity Multiple (MOIC)

The equity multiple — also known as the Multiple on Invested Capital — provides a straightforward measure of total return:

**Equity Multiple = Total Distributions ÷ Total Equity Invested**

An equity multiple of 2.0× means the investor received back twice what they put in. Unlike IRR, the equity multiple does not account for the time value of money, but it offers an intuitive sense of the investment's absolute return.

## Cash-on-Cash Return

The cash-on-cash return measures annual cash yield relative to the original equity investment:

**Cash-on-Cash Return = Annual Free Cash Flow ÷ Total Equity Invested**

This metric is particularly useful for evaluating a property's ability to generate current income during the hold period, independent of any appreciation or exit proceeds. It answers the question: "What annual cash return am I earning on the money I put in?"
