import { MonthlyFinancials, formatMoney } from "@/lib/financialEngine";
import {
  LoanParams,
  GlobalLoanParams,
} from "@/lib/financial/loanCalculations";
import { OPERATING_RESERVE_BUFFER, RESERVE_ROUNDING_INCREMENT } from "@/lib/constants";

export interface CashPositionAnalysis {
  operatingReserve: number;
  minCashPosition: number;
  minCashMonth: number | null;
  shortfall: number;
  isAdequate: boolean;
  suggestedReserve: number;
}

export function analyzeMonthlyCashPosition(
  data: MonthlyFinancials[],
  operatingReserve: number
): CashPositionAnalysis {
  if (!data || data.length === 0) {
    return {
      operatingReserve,
      minCashPosition: operatingReserve,
      minCashMonth: null,
      shortfall: 0,
      isAdequate: true,
      suggestedReserve: operatingReserve
    };
  }

  let cashPosition = operatingReserve;
  let minCashPosition = operatingReserve;
  let minCashMonth: number | null = null;
  let hasActivity = false;

  for (let i = 0; i < data.length; i++) {
    const month = data[i];
    if (month.cashFlow === 0 && month.revenueTotal === 0 && month.debtPayment === 0) {
      continue;
    }
    hasActivity = true;
    cashPosition += month.cashFlow;

    if (cashPosition < minCashPosition) {
      minCashPosition = cashPosition;
      minCashMonth = i + 1;
    }
  }

  if (!hasActivity) {
    return {
      operatingReserve,
      minCashPosition: operatingReserve,
      minCashMonth: null,
      shortfall: 0,
      isAdequate: true,
      suggestedReserve: operatingReserve
    };
  }

  const shortfall = minCashPosition < 0 ? Math.abs(minCashPosition) : 0;
  const isAdequate = minCashPosition >= 0;
  const suggestedReserve = isAdequate ? operatingReserve : operatingReserve + shortfall + OPERATING_RESERVE_BUFFER;

  return {
    operatingReserve,
    minCashPosition,
    minCashMonth,
    shortfall,
    isAdequate,
    suggestedReserve: Math.ceil(suggestedReserve / RESERVE_ROUNDING_INCREMENT) * RESERVE_ROUNDING_INCREMENT
  };
}

export interface CashFlowStatementProps {
  data: MonthlyFinancials[];
  property: LoanParams & { startAdr?: number; adrGrowthRate?: number };
  global?: GlobalLoanParams;
  years?: number;
  startYear?: number;
  defaultLTV?: number;
}
