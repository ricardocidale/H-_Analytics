/**
 * property-engine — Single-property monthly pro-forma generator
 *
 * Generates a complete MonthlyFinancials[] array for one hotel property over
 * the projection horizon. The 8-step pipeline per month:
 *   1. Temporal gates  — is this month pre-acquisition / pre-operations?
 *   2. Occupancy ramp  — step-function ramp from startOccupancy → maxOccupancy
 *   3. Revenue         — rooms, events, F&B (catering boost), other
 *   4. Dept expenses   — variable costs keyed to each revenue stream
 *   5. Undistributed   — fixed/variable overhead, management fees, FF&E
 *   6. Debt service    — PMT amortization (acquisitionInterestRate / Term)
 *   7. Income stmt     — NOI - interest - depreciation - tax = net income
 *   8. Cash & BS       — GAAP indirect OCF, financing CF, ending cash, balance sheet
 *
 * Operating reserve is seeded into cumulativeCash at the acquisition month
 * (acqMonthIdx) so it counts as available cash from day one.
 *
 * Refinancing is applied in Pass 2 via applyRefinancePostProcessing() from
 * refinance-pass.ts. Pass 2 rebuilds the debt schedule from the refi month
 * onward and re-seeds the operating reserve at acqMonthIdx so the reserve
 * is never lost.
 *
 * Key constants (DB-backed with fallbacks): DEPRECIATION_YEARS=39 (IRS Pub 946, nonresidential hotel),
 * DAYS_PER_MONTH=30.5 (industry standard 365/12).
 */
import {
  PROJECTION_MONTHS,
} from '@/lib/constants';
import {
  WORKING_CAPITAL_DAYS_PER_MONTH,
  COST_SEG_5YR_LIFE_MONTHS,
  COST_SEG_7YR_LIFE_MONTHS,
  COST_SEG_15YR_LIFE_MONTHS,
  NOL_UTILIZATION_CAP,
  MONTHS_PER_YEAR,
} from '@shared/constants';
import { PropertyInput, GlobalInput, MonthlyFinancials } from '../types';
import { resolvePropertyAssumptions } from './resolve-assumptions';
import { applyRefinancePostProcessing } from './refinance-pass';

import { assertFinite, dPow } from '@calc/shared/decimal.js';

/**
 * Generate a complete month-by-month financial projection for a single property.
 *
 * @param property  Per-property assumptions (rooms, ADR, cost rates, financing, dates).
 *                  acquisitionDate defaults to operationsStartDate when omitted.
 * @param global    Model-wide assumptions (inflation, management fees, SAFE dates).
 * @param months    Projection horizon in months (default: PROJECTION_MONTHS = 120).
 * @returns         Array of MonthlyFinancials, one entry per month from model start.
 *
 * Operating reserve: seeded into cumulativeCash at the month index where
 * acquisitionDate falls (acqMonthIdx). This ensures the reserve covers pre-ops
 * debt service and never appears as a cash inflow in later months.
 */
export function generatePropertyProForma(
  property: PropertyInput, 
  global: GlobalInput, 
  months: number = PROJECTION_MONTHS
): MonthlyFinancials[] {
  const ctx = resolvePropertyAssumptions(property, global, months);
  const financials: MonthlyFinancials[] = [];

  for (let i = 0; i < months; i++) {
    const isOperational = i >= ctx.opsStartIdx;
    const monthsSinceOps = isOperational ? i - ctx.opsStartIdx : 0;

    const opsYear = Math.floor(monthsSinceOps / MONTHS_PER_YEAR);
    const currentAdr = assertFinite(ctx.baseAdr * ctx.adrFactors[opsYear], `ADR[year=${opsYear}]`);
    let fixedCostFactor: number;
    if (ctx.escalationMethod === 'monthly') {
      fixedCostFactor = assertFinite(dPow(1 + ctx.monthlyEscRate, monthsSinceOps), `fixedCostFactor[month=${monthsSinceOps}]`);
    } else {
      fixedCostFactor = ctx.fixedEscFactors[opsYear];
    }

    let occupancy = 0;
    if (isOperational) {
      const rampSteps = Math.floor(monthsSinceOps / ctx.rampMonths);
      occupancy = Math.min(
        property.maxOccupancy,
        property.startOccupancy + (rampSteps * property.occupancyGrowthStep)
      );
    }

    const soldRooms = isOperational ? ctx.availableRooms * occupancy : 0;
    const revenueRooms = soldRooms * currentAdr;

    const revenueEvents = revenueRooms * ctx.revShareEvents;
    const baseFB = revenueRooms * ctx.revShareFB;
    const revenueFB = baseFB * ctx.cateringBoostMultiplier;
    const revenueOther = revenueRooms * ctx.revShareOther;
    const revenueTotal = revenueRooms + revenueEvents + revenueFB + revenueOther;

    const expenseRooms = revenueRooms * ctx.costRateRooms;
    const expenseFB = revenueFB * ctx.costRateFB;
    const expenseEvents = revenueEvents * ctx.eventExpenseRate;
    const expenseOther = revenueOther * ctx.otherExpenseRate;
    const expenseMarketing = revenueTotal * ctx.costRateMarketing;
    const expenseUtilitiesVar = revenueTotal * (ctx.costRateUtilities * ctx.utilitiesVariableSplit);
    const expenseFFE = revenueTotal * ctx.costRateFFE;

    const expensePlatformFees = ctx.platformFeeRate > 0 ? revenueRooms * ctx.platformFeeRate : 0;

    const isRampingUp = isOperational && monthsSinceOps < ctx.rampMonths;
    const expensePreOpening = isRampingUp && ctx.preOpeningMonthlyBurn > 0 ? ctx.preOpeningMonthlyBurn : 0;

    const fixedGate = isOperational ? 1 : 0;
    const fixedCostFactorGated = fixedCostFactor * fixedGate;
    const expenseAdmin = ctx.baseMonthlyTotalRev * ctx.costRateAdmin * fixedCostFactorGated;
    const expensePropertyOps = ctx.baseMonthlyTotalRev * ctx.costRatePropertyOps * fixedCostFactorGated;
    const expenseIT = ctx.baseMonthlyTotalRev * ctx.costRateIT * fixedCostFactorGated;
    const expenseTaxes = ctx.totalPropertyValueDiv12 * ctx.costRateTaxes * fixedCostFactorGated;
    const expenseUtilitiesFixed = ctx.baseMonthlyTotalRev * (ctx.costRateUtilities * ctx.utilitiesFixedSplit) * fixedCostFactorGated;
    const expenseOtherCosts = ctx.baseMonthlyTotalRev * ctx.costRateOther * fixedCostFactorGated;
    const expenseInsurance = ctx.totalPropertyValueDiv12 * ctx.costRateInsurance * fixedCostFactorGated;
    
    const serviceFeesByCategory: Record<string, number> = {};
    let feeBase: number;
    if (ctx.hasActiveFeeCategories) {
      feeBase = 0;
      for (const cat of ctx.activeFeeCategories!) {
        const catFee = revenueTotal * cat.rate;
        serviceFeesByCategory[cat.name] = catFee;
        feeBase += catFee;
      }
    } else {
      feeBase = revenueTotal * ctx.baseMgmtFeeRate;
    }
    
    const totalOperatingExpenses = 
      expenseRooms + expenseFB + expenseEvents + expenseOther + 
      expenseMarketing + expensePropertyOps + expenseUtilitiesVar + 
      expenseAdmin + expenseIT + expenseUtilitiesFixed + expenseInsurance + expenseOtherCosts +
      expensePlatformFees + expensePreOpening;
      
    const gop = revenueTotal - totalOperatingExpenses;
    const feeIncentive = Math.max(0, gop * ctx.incentiveFeeRate);
    const agop = gop - feeBase - feeIncentive;
    const noi = agop - expenseTaxes;
    const anoi = noi - expenseFFE;
    
    let debtPayment = 0;
    let interestExpense = 0;
    let principalPayment = 0;
    let debtOutstanding = 0;

    const isAcquired = i >= ctx.acqMonthIdx;
    const monthsSinceAcquisition = isAcquired ? i - ctx.acqMonthIdx : 0;
    
    if (isAcquired && ctx.isFinanced) {
      if (ctx.originalLoanAmount > 0 && ctx.acqDebtMonthCount < ctx.loanN) {
        debtPayment = ctx.monthlyPayment;
        
        if (ctx.loanRate === 0) {
          const straightLinePrincipal = ctx.originalLoanAmount / ctx.loanN;
          principalPayment = straightLinePrincipal;
          interestExpense = 0;
          debtOutstanding = Math.max(0, ctx.prevDebtOutstanding - straightLinePrincipal);
        } else {
          let effectiveMonthlyRate: number;
          if (ctx.dayCountConvention === 'ACT/360') {
            effectiveMonthlyRate = ctx.loanRate * ctx.daysInMonthLookup[i] / 360;
          } else if (ctx.dayCountConvention === 'ACT/365') {
            effectiveMonthlyRate = ctx.loanRate * ctx.daysInMonthLookup[i] / 365;
          } else {
            effectiveMonthlyRate = ctx.monthlyRate;
          }
          interestExpense = ctx.prevDebtOutstanding * effectiveMonthlyRate;
          principalPayment = ctx.monthlyPayment - interestExpense;
          debtOutstanding = Math.max(0, ctx.prevDebtOutstanding - principalPayment);
        }
        ctx.acqDebtMonthCount++;
      } else if (ctx.originalLoanAmount > 0) {
        debtOutstanding = 0;
      }
      ctx.prevDebtOutstanding = debtOutstanding;
    }

    const currentDate = new Date(ctx.startYear, ctx.startMonth + i, 1);

    const landValue = property.purchasePrice * ctx.landPct;
    let depreciationExpense: number;
    let accumulatedDepreciation: number;
    if (!isAcquired) {
      depreciationExpense = 0;
      accumulatedDepreciation = 0;
    } else if (ctx.costSegEnabled) {
      const dep5 = monthsSinceAcquisition < COST_SEG_5YR_LIFE_MONTHS ? ctx.costSeg5yrMonthly : 0;
      const dep7 = monthsSinceAcquisition < COST_SEG_7YR_LIFE_MONTHS ? ctx.costSeg7yrMonthly : 0;
      const dep15 = monthsSinceAcquisition < COST_SEG_15YR_LIFE_MONTHS ? ctx.costSeg15yrMonthly : 0;
      const depRest = monthsSinceAcquisition < ctx.depreciationYears * 12 ? ctx.costSegRestMonthly : 0;
      depreciationExpense = dep5 + dep7 + dep15 + depRest;
      const accDep5 = Math.min(ctx.costSeg5yrMonthly * (monthsSinceAcquisition + 1), ctx.costSeg5yrBasis);
      const accDep7 = Math.min(ctx.costSeg7yrMonthly * (monthsSinceAcquisition + 1), ctx.costSeg7yrBasis);
      const accDep15 = Math.min(ctx.costSeg15yrMonthly * (monthsSinceAcquisition + 1), ctx.costSeg15yrBasis);
      const accDepRest = Math.min(ctx.costSegRestMonthly * (monthsSinceAcquisition + 1), ctx.costSegRestBasis);
      accumulatedDepreciation = accDep5 + accDep7 + accDep15 + accDepRest;
    } else {
      depreciationExpense = ctx.monthlyDepreciation;
      accumulatedDepreciation = Math.min(ctx.monthlyDepreciation * (monthsSinceAcquisition + 1), ctx.buildingValue);
    }
    const propertyValue = isAcquired ? landValue + ctx.buildingValue - accumulatedDepreciation : 0;

    const preTaxIncome = anoi - interestExpense - depreciationExpense;
    let incomeTax: number;
    if (preTaxIncome < 0) {
      ctx.nolBalance += Math.abs(preTaxIncome);
      incomeTax = 0;
    } else if (ctx.nolBalance > 0) {
      const maxUtilization = preTaxIncome * NOL_UTILIZATION_CAP;
      const nolUsed = Math.min(ctx.nolBalance, maxUtilization);
      const adjustedIncome = preTaxIncome - nolUsed;
      ctx.nolBalance -= nolUsed;
      incomeTax = adjustedIncome > 0 ? adjustedIncome * ctx.taxRate : 0;
    } else {
      incomeTax = preTaxIncome > 0 ? preTaxIncome * ctx.taxRate : 0;
    }
    const netIncome = anoi - interestExpense - depreciationExpense - incomeTax;

    const currentAR = isOperational ? (revenueTotal / WORKING_CAPITAL_DAYS_PER_MONTH) * ctx.arDays : 0;
    const totalOpCosts = totalOperatingExpenses + feeBase + feeIncentive + expenseTaxes;
    const currentAP = isOperational ? (totalOpCosts / WORKING_CAPITAL_DAYS_PER_MONTH) * ctx.apDays : 0;
    const workingCapitalChange = (currentAR - ctx.prevAR) - (currentAP - ctx.prevAP);
    ctx.prevAR = currentAR;
    ctx.prevAP = currentAP;
    
    const cashFlow = anoi - debtPayment - incomeTax;

    const operatingCashFlow = netIncome + depreciationExpense;
    const financingCashFlow = -principalPayment;
    if (isAcquired && monthsSinceAcquisition === 0) {
      ctx.cumulativeCash += (property.operatingReserve ?? 0);
    }
    ctx.cumulativeCash += cashFlow;
    const endingCash = ctx.cumulativeCash;

    financials.push({
      date: currentDate,
      monthIndex: i,
      occupancy,
      adr: currentAdr,
      availableRooms: ctx.availableRooms,
      soldRooms,
      revenueRooms,
      revenueEvents,
      revenueFB,
      revenueOther,
      revenueTotal,
      expenseRooms,
      expenseFB,
      expenseEvents,
      expenseOther,
      expenseMarketing,
      expensePropertyOps,
      expenseUtilitiesVar,
      expenseFFE,
      feeBase,
      feeIncentive,
      serviceFeesByCategory,
      expenseAdmin,
      expenseIT,
      expenseTaxes,
      expenseUtilitiesFixed,
      expenseInsurance,
      expenseOtherCosts,
      expensePlatformFees,
      expensePreOpening,
      totalExpenses: totalOperatingExpenses + feeBase + feeIncentive + expenseTaxes + expenseFFE,
      gop,
      agop,
      noi,
      anoi,
      interestExpense,
      principalPayment,
      debtPayment,
      netIncome,
      incomeTax,
      cashFlow,
      depreciationExpense,
      propertyValue,
      debtOutstanding,
      refinancingProceeds: 0,
      operatingCashFlow,
      financingCashFlow,
      endingCash,
      accountsReceivable: currentAR,
      accountsPayable: currentAP,
      workingCapitalChange,
      nolBalance: ctx.nolBalance,
      cashShortfall: endingCash < 0,
    });
  }

  applyRefinancePostProcessing(financials, property, global, {
    modelStart: ctx.modelStart,
    acquisitionDate: ctx.acquisitionDate,
    originalLoanAmount: ctx.originalLoanAmount,
    taxRate: ctx.taxRate,
  }, months);

  return financials;
}
