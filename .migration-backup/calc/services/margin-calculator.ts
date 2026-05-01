/**
 * margin-calculator.ts — Cost-Plus Markup Calculations
 *
 * Pure functions for centralized services cost-plus math.
 * Given a fee (what the property pays) and a markup percentage,
 * derives the vendor cost and gross profit.
 *
 * Markup definition: if the company buys a service for $1.00 and
 * the markup is 20%, it charges the property $1.00 × 1.20 = $1.20.
 *
 * Reverse derivation (Approach A): we know the fee the property pays
 * (revenue × categoryRate) and derive the vendor cost:
 *   vendorCost = fee / (1 + markup)
 *   grossProfit = fee - vendorCost
 */

/**
 * Derive the vendor cost from the fee the property pays.
 * vendorCost = fee / (1 + markup)
 *
 * @param fee - What the property pays (company's revenue for this service)
 * @param markup - Cost-plus markup as decimal (0.20 = 20%)
 * @returns The vendor cost (what the company pays the external provider)
 */
export function vendorCostFromFee(fee: number, markup: number): number {
  if (markup < 0) throw new Error("Markup cannot be negative");
  return fee / (1 + markup);
}

/**
 * Calculate the gross profit from a service fee with markup.
 * grossProfit = fee - vendorCost = fee - fee/(1+markup) = fee × markup/(1+markup)
 *
 * @param fee - What the property pays
 * @param markup - Cost-plus markup as decimal (0.20 = 20%)
 * @returns The gross profit (company's margin on this service)
 */
export function grossProfitFromFee(fee: number, markup: number): number {
  return fee - vendorCostFromFee(fee, markup);
}

/**
 * Forward calculation: given a vendor cost and markup, compute the fee to charge.
 * fee = vendorCost × (1 + markup)
 *
 * @param vendorCost - What the company pays the external provider
 * @param markup - Cost-plus markup as decimal (0.20 = 20%)
 * @returns The fee to charge the property
 */
export function feeFromVendorCost(vendorCost: number, markup: number): number {
  if (markup < 0) throw new Error("Markup cannot be negative");
  return vendorCost * (1 + markup);
}

/**
 * Compute the effective margin (profit as a percentage of revenue/fee).
 * With a 20% markup, the effective margin is 20/120 = 16.67%.
 *
 * @param markup - Cost-plus markup as decimal (0.20 = 20%)
 * @returns The effective margin as decimal
 */
export function effectiveMargin(markup: number): number {
  if (markup < 0) throw new Error("Markup cannot be negative");
  return markup / (1 + markup);
}
