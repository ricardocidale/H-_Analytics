/**
 * cost-of-services.ts — Aggregate Cost of Centralized Services
 *
 * Takes the per-category fee breakdown (from ServiceFeeBreakdown on the company
 * pro forma) and the company service templates, then computes the vendor cost
 * and gross profit for each category.
 *
 * For "centralized" categories: vendorCost = fee / (1 + markup), grossProfit = fee - vendorCost
 * For "direct" categories: vendorCost = 0, grossProfit = fee (pure oversight margin)
 *
 * This is the core function called by generateCompanyProForma() each month.
 */

import { vendorCostFromFee } from "./margin-calculator.js";
import type { ServiceTemplate, ServiceCostResult, AggregatedServiceCosts } from "./types.js";

/**
 * Compute cost-of-services for one month given the fee breakdown and templates.
 *
 * @param feesByCategory - Map of category name → fee amount (from ServiceFeeBreakdown.byCategory)
 * @param templates - Active company service templates with serviceModel and serviceMarkup
 * @returns Aggregated costs with per-category breakdown and totals
 */
export function computeCostOfServices(
  feesByCategory: Record<string, number>,
  templates: ServiceTemplate[],
): AggregatedServiceCosts {
  const byCategory: Record<string, ServiceCostResult> = {};
  let centralizedRevenue = 0;
  let directRevenue = 0;
  let totalVendorCost = 0;
  let totalGrossProfit = 0;

  // Build a lookup from template name to template for O(1) access
  const templateByName = new Map<string, ServiceTemplate>();
  for (const t of templates) {
    if (t.isActive) {
      templateByName.set(t.name, t);
    }
  }

  for (const [categoryName, feeAmount] of Object.entries(feesByCategory)) {
    const template = templateByName.get(categoryName);

    if (!template) {
      // M15: Category in fee breakdown with no matching template defaults to direct model
      // (100% gross profit, zero vendor cost). This is intentional — unmatched categories
      // are treated as oversight/advisory fees with no third-party cost component.
      const result: ServiceCostResult = {
        name: categoryName,
        revenue: feeAmount,
        vendorCost: 0,
        grossProfit: feeAmount,
        serviceModel: 'direct',
        markup: 0,
      };
      byCategory[categoryName] = result;
      directRevenue += feeAmount;
      totalGrossProfit += feeAmount;
      continue;
    }

    if (template.serviceModel === 'centralized') {
      const cost = vendorCostFromFee(feeAmount, template.serviceMarkup);
      const profit = feeAmount - cost;
      const result: ServiceCostResult = {
        name: categoryName,
        revenue: feeAmount,
        vendorCost: cost,
        grossProfit: profit,
        serviceModel: 'centralized',
        markup: template.serviceMarkup,
      };
      byCategory[categoryName] = result;
      centralizedRevenue += feeAmount;
      totalVendorCost += cost;
      totalGrossProfit += profit;
    } else {
      // Direct: company earns the fee but incurs no vendor cost
      const result: ServiceCostResult = {
        name: categoryName,
        revenue: feeAmount,
        vendorCost: 0,
        grossProfit: feeAmount,
        serviceModel: 'direct',
        markup: template.serviceMarkup,
      };
      byCategory[categoryName] = result;
      directRevenue += feeAmount;
      totalGrossProfit += feeAmount;
    }
  }

  return {
    byCategory,
    centralizedRevenue,
    directRevenue,
    totalVendorCost,
    totalGrossProfit,
  };
}
