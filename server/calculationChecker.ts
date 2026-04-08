import {
  generatePropertyProForma,
  type PropertyInput,
  type GlobalInput,
} from "./finance/core/property-pipeline";
import { MONTHS_PER_YEAR } from "@shared/constants";
import { runIndependentVerification } from "./calculation-checker";
import type {
  VerificationReport,
  EngineMonthlyResult,
  CheckerProperty,
  CheckerGlobalAssumptions,
} from "./calculation-checker";

export type { VerificationReport, EngineMonthlyResult };
export { runIndependentVerification };

type PipelineMonth = ReturnType<typeof generatePropertyProForma>[number];

function mapEngineMonthly(m: PipelineMonth): EngineMonthlyResult {
  return {
    monthIndex: m.monthIndex,
    occupancy: m.occupancy,
    adr: m.adr,
    availableRooms: m.availableRooms,
    soldRooms: m.soldRooms,
    revenueRooms: m.revenueRooms,
    revenueEvents: m.revenueEvents,
    revenueFB: m.revenueFB,
    revenueOther: m.revenueOther,
    revenueTotal: m.revenueTotal,
    expenseRooms: m.expenseRooms,
    expenseFB: m.expenseFB,
    expenseEvents: m.expenseEvents,
    expenseOther: m.expenseOther,
    expenseMarketing: m.expenseMarketing,
    expensePropertyOps: m.expensePropertyOps,
    expenseUtilitiesVar: m.expenseUtilitiesVar,
    expenseAdmin: m.expenseAdmin,
    expenseIT: m.expenseIT,
    expenseUtilitiesFixed: m.expenseUtilitiesFixed,
    expenseInsurance: m.expenseInsurance,
    expenseOtherCosts: m.expenseOtherCosts,
    expensePlatformFees: m.expensePlatformFees,
    expensePreOpening: m.expensePreOpening,
    totalExpenses: m.totalExpenses,
    gop: m.gop,
    agop: m.agop,
    feeBase: m.feeBase,
    feeIncentive: m.feeIncentive,
    expenseTaxes: m.expenseTaxes,
    expenseFFE: m.expenseFFE,
    noi: m.noi,
    anoi: m.anoi,
    interestExpense: m.interestExpense,
    principalPayment: m.principalPayment,
    debtPayment: m.debtPayment,
    netIncome: m.netIncome,
    incomeTax: m.incomeTax,
    cashFlow: m.cashFlow,
    depreciationExpense: m.depreciationExpense,
    propertyValue: m.propertyValue,
    debtOutstanding: m.debtOutstanding,
    operatingCashFlow: m.operatingCashFlow,
    financingCashFlow: m.financingCashFlow,
    endingCash: m.endingCash,
    cashShortfall: m.cashShortfall,
    accountsReceivable: m.accountsReceivable,
    accountsPayable: m.accountsPayable,
    workingCapitalChange: m.workingCapitalChange,
    nolBalance: m.nolBalance,
  };
}

export function computeEngineResultsForChecker(
  properties: CheckerProperty[],
  globalAssumptions: CheckerGlobalAssumptions,
): EngineMonthlyResult[][] {
  const projectionYears = globalAssumptions.projectionYears ?? 10;
  const months = projectionYears * MONTHS_PER_YEAR;

  return properties.map((property) => {
    const engineMonthly = generatePropertyProForma(
      property as PropertyInput,
      globalAssumptions as GlobalInput,
      months,
    );
    return engineMonthly.map(mapEngineMonthly);
  });
}

export function runVerificationWithEngine(
  properties: CheckerProperty[],
  globalAssumptions: CheckerGlobalAssumptions,
): VerificationReport {
  const engineResults = computeEngineResultsForChecker(properties, globalAssumptions);
  return runIndependentVerification(properties, globalAssumptions, engineResults);
}
