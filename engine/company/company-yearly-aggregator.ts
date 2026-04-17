import type { CompanyMonthlyFinancials, CompanyYearlyFinancials } from '../types';
import { MONTHS_PER_YEAR } from '@shared/constants';

export function aggregateCompanyByYear(
  monthly: CompanyMonthlyFinancials[],
  projectionYears: number,
): CompanyYearlyFinancials[] {
  const yearly: CompanyYearlyFinancials[] = [];

  for (let y = 0; y < projectionYears; y++) {
    const startIdx = y * MONTHS_PER_YEAR;
    const endIdx = Math.min(startIdx + MONTHS_PER_YEAR, monthly.length);
    const slice = monthly.slice(startIdx, endIdx);

    if (slice.length === 0) break;

    const lastMonth = slice[slice.length - 1];

    yearly.push({
      year: y,
      baseFeeRevenue: sum(slice, m => m.baseFeeRevenue),
      incentiveFeeRevenue: sum(slice, m => m.incentiveFeeRevenue),
      totalRevenue: sum(slice, m => m.totalRevenue),
      totalVendorCost: sum(slice, m => m.totalVendorCost),
      grossProfit: sum(slice, m => m.grossProfit),
      partnerCompensation: sum(slice, m => m.partnerCompensation),
      staffCompensation: sum(slice, m => m.staffCompensation),
      officeLease: sum(slice, m => m.officeLease),
      professionalServices: sum(slice, m => m.professionalServices),
      techInfrastructure: sum(slice, m => m.techInfrastructure),
      businessInsurance: sum(slice, m => m.businessInsurance),
      travelCosts: sum(slice, m => m.travelCosts),
      itLicensing: sum(slice, m => m.itLicensing),
      marketing: sum(slice, m => m.marketing),
      miscOps: sum(slice, m => m.miscOps),
      totalExpenses: sum(slice, m => m.totalExpenses),
      fundingInterestExpense: sum(slice, m => m.fundingInterestExpense),
      preTaxIncome: sum(slice, m => m.preTaxIncome),
      companyIncomeTax: sum(slice, m => m.companyIncomeTax),
      netIncome: sum(slice, m => m.netIncome),
      capitalRaiseFunding: sum(slice, m => m.capitalRaiseFunding),
      cashFlow: sum(slice, m => m.cashFlow),
      endingCash: lastMonth.endingCash,
    });
  }

  return yearly;
}

function sum(
  arr: CompanyMonthlyFinancials[],
  fn: (m: CompanyMonthlyFinancials) => number,
): number {
  let total = 0;
  for (const m of arr) total += fn(m);
  return total;
}
