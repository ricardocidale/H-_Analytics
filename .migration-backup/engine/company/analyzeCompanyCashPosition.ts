import type { CompanyMonthlyFinancials } from "../types";
import { OPERATING_RESERVE_BUFFER, COMPANY_FUNDING_BUFFER } from "@/lib/constants";

export interface CompanyCashAnalysis {
  totalFunding: number;
  minCashPosition: number;
  minCashMonth: number | null;
  shortfall: number;
  isAdequate: boolean;
  suggestedAdditionalFunding: number;
}

export function analyzeCompanyCashPosition(financials: CompanyMonthlyFinancials[]): CompanyCashAnalysis {
  if (!financials || financials.length === 0) {
    return {
      totalFunding: 0,
      minCashPosition: 0,
      minCashMonth: null,
      shortfall: 0,
      isAdequate: true,
      suggestedAdditionalFunding: 0
    };
  }

  let cashPosition = 0;
  let minCashPosition = 0;
  let minCashMonth: number | null = null;
  let totalSafe = 0;
  let hasActivity = false;

  for (let i = 0; i < financials.length; i++) {
    const month = financials[i];
    totalSafe += month.capitalRaiseFunding;
    
    if (month.netIncome !== 0 || month.capitalRaiseFunding !== 0 || month.totalExpenses !== 0) {
      hasActivity = true;
    }
    
    cashPosition += month.netIncome + month.capitalRaiseFunding;
    
    if (cashPosition < minCashPosition) {
      minCashPosition = cashPosition;
      minCashMonth = i + 1;
    }
  }

  if (!hasActivity) {
    return {
      totalFunding: 0,
      minCashPosition: 0,
      minCashMonth: null,
      shortfall: 0,
      isAdequate: true,
      suggestedAdditionalFunding: 0
    };
  }

  const shortfall = minCashPosition < 0 ? Math.abs(minCashPosition) : 0;
  const isAdequate = minCashPosition >= 0;
  const suggestedAdditionalFunding = isAdequate ? 0 : Math.ceil(shortfall / OPERATING_RESERVE_BUFFER) * OPERATING_RESERVE_BUFFER + COMPANY_FUNDING_BUFFER;

  return {
    totalFunding: totalSafe,
    minCashPosition,
    minCashMonth,
    shortfall,
    isAdequate,
    suggestedAdditionalFunding
  };
}
