/**
 * portfolio-capital-raise — LP equity analysis for a multi-property portfolio
 *
 * Computes per-property equity deployment, ramp overlap windows, blended DSCR,
 * and an advisory IRR estimate for a portfolio capital raise.
 *
 * Known limitations (hardcoded flags):
 *   - rampCarryUnderstated: true — MAJOR-5 (pre-ops carry) is unresolved; carry
 *     costs during construction/renovation gap are understated until engine fix.
 *   - refinanceProceeds are excluded — MAJOR-2 (refinance engine bug) is unresolved.
 *   - impliedIrr is an advisory floor estimate only (arithmetic mean annual return,
 *     not a discounted IRR); treat as directional, not investment-grade.
 */

import { propertyEquityInvested, acquisitionLoanAmount, acqMonthsFromModelStart } from '../debt/equityCalculations';
import { DEFAULT_LTV } from '@shared/constants';
import type {
  PropertyInput,
  GlobalInput,
  MonthlyFinancials,
  PortfolioCapitalRaiseAnalysis,
  PortfolioPropertyEquitySummary,
  PortfolioRampOverlap,
} from '../types';

const FIRST_CLOSE_MIN_PCT = 0.30;

export function analyzePortfolioCapitalRaise(
  properties: PropertyInput[],
  proFormas: Record<number, MonthlyFinancials[]>,
  global: GlobalInput,
): PortfolioCapitalRaiseAnalysis {
  if (properties.length === 0) {
    return {
      perPropertyEquity: [],
      totalEquityRequired: 0,
      firstCloseMinimum: 0,
      rampOverlapWindows: [],
      portfolioDscrBlended: null,
      impliedIrr: null,
      rampCarryUnderstated: true,
    };
  }

  // Per-property equity summary and DSCR estimation
  const perPropertyEquity: PortfolioPropertyEquitySummary[] = properties.map((prop, idx) => {
    const equityRequired = propertyEquityInvested(prop);
    const deploymentMonth = acqMonthsFromModelStart(
      prop.acquisitionDate,
      prop.operationsStartDate,
      global.modelStartDate,
    );

    // Use the same LTV as the equity helper so ltv and equityRequired stay consistent
    const ltv = prop.type === 'Financed' ? (prop.acquisitionLTV ?? DEFAULT_LTV) : 0;

    // Estimate DSCR at stabilization using pro-forma NOI at the stabilization month
    const proForma = proFormas[idx] ?? [];
    const stabilizationMonth = deploymentMonth + (prop.occupancyRampMonths ?? 12);
    const stabilizedMonthlyNoi = proForma[stabilizationMonth]?.noi ?? null;

    // Loan amount from the shared helper; annualize NOI for DSCR
    const loanAmount = acquisitionLoanAmount(prop);
    const interestRate = prop.acquisitionInterestRate ?? global.debtAssumptions.interestRate;
    const amortYears = prop.acquisitionTermYears ?? global.debtAssumptions.amortizationYears;
    const monthlyDebtService = loanAmount > 0 && amortYears > 0
      ? computeMonthlyDebtService(loanAmount, interestRate, amortYears)
      : 0;
    const annualDebtService = monthlyDebtService * 12;

    // DSCR is null for all-cash properties (no debt service) or when NOI is unavailable
    const estimatedDscr = stabilizedMonthlyNoi !== null && annualDebtService > 0
      ? (stabilizedMonthlyNoi * 12) / annualDebtService
      : null;

    return {
      propertyIndex: idx,
      equityRequired,
      deploymentMonth,
      ltv,
      estimatedDscr,
    };
  });

  const totalEquityRequired = perPropertyEquity.reduce((sum, p) => sum + p.equityRequired, 0);
  // First close must cover at least the first property's equity, or 30% of total — whichever is larger
  const firstPropertyEquity = perPropertyEquity[0]?.equityRequired ?? 0;
  const firstCloseMinimum = Math.max(firstPropertyEquity, totalEquityRequired * FIRST_CLOSE_MIN_PCT);

  // Identify months where 2+ properties are simultaneously in their occupancy ramp
  const rampOverlapWindows = computeRampOverlapWindows(properties, perPropertyEquity);

  // Blended DSCR: simple average across properties that have valid DSCR values
  const dscrValues = perPropertyEquity
    .map(p => p.estimatedDscr)
    .filter((d): d is number => d !== null);
  const portfolioDscrBlended = dscrValues.length > 0
    ? dscrValues.reduce((sum, d) => sum + d, 0) / dscrValues.length
    : null;

  // Advisory IRR floor estimate (excludes refi proceeds per MAJOR-2 constraint)
  const impliedIrr = computeImpliedIrr(properties, proFormas, global, totalEquityRequired);

  return {
    perPropertyEquity,
    totalEquityRequired,
    firstCloseMinimum,
    rampOverlapWindows,
    portfolioDscrBlended,
    impliedIrr,
    rampCarryUnderstated: true, // MAJOR-5: pre-ops carry is understated until engine fix
  };
}

function computeMonthlyDebtService(loanAmount: number, annualRate: number, amortYears: number): number {
  if (annualRate === 0) return loanAmount / (amortYears * 12);
  const r = annualRate / 12;
  const n = amortYears * 12;
  return loanAmount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function computeRampOverlapWindows(
  properties: PropertyInput[],
  equitySummaries: PortfolioPropertyEquitySummary[],
): PortfolioRampOverlap[] {
  if (properties.length < 2) return [];

  // Build a month-by-month count of properties currently in their occupancy ramp
  const maxMonth = Math.max(
    ...equitySummaries.map(p => p.deploymentMonth + (properties[p.propertyIndex]?.occupancyRampMonths ?? 12)),
  );
  const concurrentByMonth = new Array<number>(maxMonth + 1).fill(0);

  for (let i = 0; i < properties.length; i++) {
    const summary = equitySummaries[i];
    const rampMonths = properties[i]?.occupancyRampMonths ?? 12;
    for (let m = summary.deploymentMonth; m < summary.deploymentMonth + rampMonths; m++) {
      if (m < concurrentByMonth.length) concurrentByMonth[m]++;
    }
  }

  // Collect contiguous windows where 2+ properties are ramping simultaneously
  const windows: PortfolioRampOverlap[] = [];
  let inWindow = false;
  let windowStart = 0;
  let windowMax = 0;

  for (let m = 0; m < concurrentByMonth.length; m++) {
    const count = concurrentByMonth[m];
    if (count >= 2 && !inWindow) {
      inWindow = true;
      windowStart = m;
      windowMax = count;
    } else if (count >= 2 && inWindow) {
      windowMax = Math.max(windowMax, count);
    } else if (count < 2 && inWindow) {
      windows.push({ startMonth: windowStart, endMonth: m - 1, concurrentCount: windowMax });
      inWindow = false;
      windowMax = 0;
    }
  }
  if (inWindow) {
    windows.push({ startMonth: windowStart, endMonth: concurrentByMonth.length - 1, concurrentCount: windowMax });
  }

  return windows;
}

/**
 * Advisory IRR floor estimate.
 *
 * Uses an arithmetic mean annual return approximation:
 *   impliedIrr ≈ ((totalNOI × projYears + terminalValue) / equity - 1) / projYears
 *
 * This is NOT a discounted IRR and does NOT account for the timing of cash flows,
 * reinvestment assumptions, or refinance proceeds (excluded per MAJOR-2).
 * Use as a directional indicator only.
 */
function computeImpliedIrr(
  properties: PropertyInput[],
  proFormas: Record<number, MonthlyFinancials[]>,
  global: GlobalInput,
  totalEquity: number,
): number | null {
  const exitCapRate = global.exitCapRate;
  if (!exitCapRate || exitCapRate <= 0 || totalEquity <= 0) return null;

  const projYears = global.projectionYears ?? 10;
  let totalAnnualNoi = 0;
  let propertiesWithNoi = 0;

  for (let i = 0; i < properties.length; i++) {
    const proForma = proFormas[i] ?? [];
    // Approximate stabilized NOI using Year 2 (occupancyRampMonths × 2 offset)
    const stabilizationMonth = (properties[i]?.occupancyRampMonths ?? 12) * 2;
    const monthlyNoi = proForma[stabilizationMonth]?.noi ?? null;
    if (monthlyNoi !== null && monthlyNoi > 0) {
      totalAnnualNoi += monthlyNoi * 12;
      propertiesWithNoi++;
    }
  }

  if (propertiesWithNoi === 0 || totalAnnualNoi <= 0) return null;

  const terminalValue = totalAnnualNoi / exitCapRate;
  // Arithmetic mean annual return: total undiscounted return divided by hold period
  const totalUndiscountedReturn = totalAnnualNoi * projYears + terminalValue;
  const impliedIrr = (totalUndiscountedReturn / totalEquity - 1) / projYears;

  return Number.isFinite(impliedIrr) && impliedIrr > 0 ? impliedIrr : null;
}
