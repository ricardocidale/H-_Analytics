/**
 * Guards that currentFunding in analyzeFundingNeeds correctly sums all
 * three configured tranche slots (including the new slot 3 added in U2).
 */
import { describe, it, expect } from "vitest";
import { analyzeFundingNeeds } from "@engine/funding/funding-predictor";
import type { CompanyMonthlyFinancials, GlobalInput } from "@engine/types";

const BASE_GLOBAL: GlobalInput = {
  modelStartDate: "2026-01-01",
  inflationRate: 0.03,
  marketingRate: 0.02,
  miscOpsRate: 0.0,
  debtAssumptions: { interestRate: 0.065, amortizationYears: 25 },
  projectionYears: 5,
};

function stubFinancials(months = 24): CompanyMonthlyFinancials[] {
  return Array.from({ length: months }, (_, i) => ({
    date: new Date(2026, i, 1),
    monthIndex: i,
    totalRevenue: i >= 6 ? 50_000 : 0,
    totalExpenses: 30_000,
    netIncome: i >= 6 ? 20_000 : -30_000,
    grossProfit: 0,
    ebitda: 0,
    companyIncomeTax: 0,
    capitalRaiseFunding: 0,
    cashFlow: 0,
    endingCash: 0,
    serviceFees: 0,
    researchFees: 0,
    partnerCompensation: 0,
    staffCost: 0,
    fixedOverhead: 0,
    variableOverhead: 0,
    interestExpense: 0,
    serviceFeeBreakdown: null,
  } as unknown as CompanyMonthlyFinancials));
}

describe("analyzeFundingNeeds — currentFunding summation", () => {
  it("sums all three configured tranche amounts", () => {
    const global: GlobalInput = {
      ...BASE_GLOBAL,
      capitalRaise1Amount: 500_000,
      capitalRaise2Amount: 300_000,
      capitalRaise3Amount: 200_000,
    };
    const result = analyzeFundingNeeds(stubFinancials(), global);
    expect(result.currentFunding).toBe(1_000_000);
  });

  it("ignores slot 3 when capitalRaise3Amount is undefined (no regression for 2-tranche users)", () => {
    const global: GlobalInput = {
      ...BASE_GLOBAL,
      capitalRaise1Amount: 500_000,
      capitalRaise2Amount: 300_000,
      // capitalRaise3Amount: not set
    };
    const result = analyzeFundingNeeds(stubFinancials(), global);
    expect(result.currentFunding).toBe(800_000);
  });

  it("treats capitalRaise3Amount = 0 as zero, not omitted", () => {
    const global: GlobalInput = {
      ...BASE_GLOBAL,
      capitalRaise1Amount: 500_000,
      capitalRaise2Amount: 300_000,
      capitalRaise3Amount: 0,
    };
    const result = analyzeFundingNeeds(stubFinancials(), global);
    expect(result.currentFunding).toBe(800_000);
  });
});
