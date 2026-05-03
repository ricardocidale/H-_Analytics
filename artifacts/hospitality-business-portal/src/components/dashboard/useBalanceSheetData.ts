import { useMemo } from "react";
import { Property } from "@shared/schema";
import { MonthlyFinancials } from "@/lib/financialEngine";
import { propertyEquityInvested, acquisitionYearIndex } from "@/lib/financial/equityCalculations";
import { MONTHS_PER_YEAR } from "@/lib/constants";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { GlobalResponse } from "@/lib/api";

export interface YearlyPerPropertyBS {
  cash: number;
  ppe: number;
  accDep: number;
  deferredFinancing: number;
  totalAssets: number;
  debtOutstanding: number;
  equityInvested: number;
  retainedEarnings: number;
}

export interface BalanceSheetYearlyData {
  consolidatedCash: number[];
  consolidatedPPE: number[];
  consolidatedAccDep: number[];
  consolidatedDeferredFC: number[];
  consolidatedTotalAssets: number[];
  consolidatedDebt: number[];
  consolidatedEquity: number[];
  consolidatedRetained: number[];
  consolidatedTotalLiabilities: number[];
  consolidatedTotalEquity: number[];
  consolidatedTotalLE: number[];
  perPropertyByYear: Map<number, YearlyPerPropertyBS>[];
}

export function useBalanceSheetData(
  allPropertyFinancials: { property: Property; financials: MonthlyFinancials[] }[],
  projectionYears: number,
  modelStartDate: string,
): BalanceSheetYearlyData {
  return useMemo(() => {
    const consolidatedCash: number[] = [];
    const consolidatedPPE: number[] = [];
    const consolidatedAccDep: number[] = [];
    const consolidatedDeferredFC: number[] = [];
    const consolidatedTotalAssets: number[] = [];
    const consolidatedDebt: number[] = [];
    const consolidatedEquity: number[] = [];
    const consolidatedRetained: number[] = [];
    const consolidatedTotalLiabilities: number[] = [];
    const consolidatedTotalEquity: number[] = [];
    const consolidatedTotalLE: number[] = [];
    const perPropertyByYear: Map<number, YearlyPerPropertyBS>[] = [];

    for (let y = 0; y < projectionYears; y++) {
      let totalCash = 0;
      let totalPPE = 0;
      let totalAccDep = 0;
      let totalDeferredFC = 0;
      let totalDebt = 0;
      let totalEquityInvested = 0;
      let totalRetained = 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      let totalPreOpening = 0;

      const perPropThisYear: Map<number, YearlyPerPropertyBS> = new Map();

      allPropertyFinancials.forEach(({ property: prop, financials: proForma }, propIdx) => {
        const acqYear = acquisitionYearIndex(prop.acquisitionDate, prop.operationsStartDate, modelStartDate);
        if (y < acqYear) return;

        const monthsToInclude = (y + 1) * MONTHS_PER_YEAR;
        const relevantMonths = proForma.slice(0, monthsToInclude);

        const propValue = prop.purchasePrice + prop.buildingImprovements;
        const accDep = relevantMonths.reduce((sum, m) => sum + m.depreciationExpense, 0);
        const operatingReserve = prop.operatingReserve ?? 0;
        const preOpening = prop.preOpeningCosts ?? 0;
        const equityInvested = propertyEquityInvested(prop);

        const lastMonthIdx = monthsToInclude - 1;
        const debtOutstanding = lastMonthIdx >= 0 && lastMonthIdx < proForma.length
          ? proForma[lastMonthIdx].debtOutstanding
          : 0;

        let cumulativeInterest = 0;
        let cumulativePrincipal = 0;
        let refiProceeds = 0;
        let deferredFC = 0;

        for (let m = 0; m < relevantMonths.length; m++) {
          cumulativeInterest += relevantMonths[m].interestExpense;
          cumulativePrincipal += relevantMonths[m].principalPayment;
          refiProceeds += relevantMonths[m].refinancingProceeds;

          if (relevantMonths[m].refinancingProceeds > 0) {
            const debtBefore = m > 0 ? relevantMonths[m - 1].debtOutstanding : 0;
            const debtAfter = relevantMonths[m].debtOutstanding;
            const principalInRefiMonth = relevantMonths[m].principalPayment;
            const newLoanAmount = debtAfter + principalInRefiMonth;
            const refiClosingCosts = newLoanAmount - debtBefore - relevantMonths[m].refinancingProceeds;
            if (refiClosingCosts > 0) deferredFC += refiClosingCosts;
          }
        }

        const netIncome = relevantMonths.reduce((sum, m) => sum + m.netIncome, 0);
        const cumulativeANOI = relevantMonths.reduce((sum, m) => sum + m.anoi, 0);
        const incomeTax = relevantMonths.reduce((sum, m) => sum + m.incomeTax, 0);
        const debtService = cumulativeInterest + cumulativePrincipal;
        const operatingCF = cumulativeANOI - debtService - incomeTax;
        const cash = operatingReserve + operatingCF + refiProceeds;
        const netFixed = propValue - accDep;
        const propTotalAssets = netFixed + cash + deferredFC;
        const retained = netIncome - preOpening;

        totalCash += cash;
        totalPPE += propValue;
        totalAccDep += accDep;
        totalDeferredFC += deferredFC;
        totalDebt += debtOutstanding;
        totalEquityInvested += equityInvested;
        totalRetained += retained;
        totalPreOpening += preOpening;

        perPropThisYear.set(propIdx, {
          cash,
          ppe: propValue,
          accDep,
          deferredFinancing: deferredFC,
          totalAssets: propTotalAssets,
          debtOutstanding,
          equityInvested,
          retainedEarnings: retained,
        });
      });

      const netFixed = totalPPE - totalAccDep;
      const totalAssets = netFixed + totalCash + totalDeferredFC;
      const totalLiabilities = totalDebt;
      const totalEq = totalEquityInvested + totalRetained;
      const totalLE = totalLiabilities + totalEq;

      consolidatedCash.push(totalCash);
      consolidatedPPE.push(totalPPE);
      consolidatedAccDep.push(totalAccDep);
      consolidatedDeferredFC.push(totalDeferredFC);
      consolidatedTotalAssets.push(totalAssets);
      consolidatedDebt.push(totalDebt);
      consolidatedEquity.push(totalEquityInvested);
      consolidatedRetained.push(totalRetained);
      consolidatedTotalLiabilities.push(totalLiabilities);
      consolidatedTotalEquity.push(totalEq);
      consolidatedTotalLE.push(totalLE);
      perPropertyByYear.push(perPropThisYear);
    }

    return {
      consolidatedCash,
      consolidatedPPE,
      consolidatedAccDep,
      consolidatedDeferredFC,
      consolidatedTotalAssets,
      consolidatedDebt,
      consolidatedEquity,
      consolidatedRetained,
      consolidatedTotalLiabilities,
      consolidatedTotalEquity,
      consolidatedTotalLE,
      perPropertyByYear,
    };
  }, [allPropertyFinancials, projectionYears, modelStartDate]);
}
