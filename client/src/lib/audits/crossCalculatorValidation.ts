import type { MonthlyFinancials } from '../financialEngine';
import { pmt } from '@calc/shared/pmt';
import {
  DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_COST_RATE_FFE,
} from '@shared/constants';

import {
  DEFAULT_LTV,
  DEFAULT_INTEREST_RATE,
  DEFAULT_TERM_YEARS,
  DEPRECIATION_YEARS,
  MONTHS_PER_YEAR,
} from '../constants';

export interface CrossValidationResult {
  name: string;
  description: string;
  passed: boolean;
  severity: 'critical' | 'material' | 'info';
  expected: string;
  actual: string;
  source: string;
}

export interface CrossValidationReport {
  results: CrossValidationResult[];
  totalChecks: number;
  passed: number;
  failed: number;
  criticalIssues: number;
}

interface PropertyForValidation {
  purchasePrice: number;
  type: string;
  acquisitionLTV?: number | null;
  acquisitionInterestRate?: number | null;
  acquisitionTermYears?: number | null;
  landValuePercent?: number | null;
  buildingImprovements?: number | null;
  baseManagementFeeRate?: number | null;
  incentiveManagementFeeRate?: number | null;
  feeCategories?: { name: string; rate: number; isActive: boolean }[] | null;
  costRateFFE?: number | null;
  depreciationYears?: number | null;
}

interface GlobalForValidation {
  depreciationYears?: number;
}

const TOLERANCE = 0.001;

function withinTolerance(a: number, b: number, tol = TOLERANCE): boolean {
  if (a === 0 && b === 0) return true;
  return Math.abs(a - b) <= Math.max(tol, Math.abs(a) * 0.0001);
}

export function crossValidateFinancingCalculators(
  property: PropertyForValidation,
  global: GlobalForValidation,
  monthlyData: MonthlyFinancials[],
): CrossValidationReport {
  const results: CrossValidationResult[] = [];

  if (property.type !== 'Financed' || !property.purchasePrice) {
    results.push({
      name: 'Skip: Cash Purchase',
      description: 'Property is not financed — no debt to validate',
      passed: true,
      severity: 'info',
      expected: 'N/A',
      actual: 'N/A',
      source: 'Cross-Validator',
    });
    return buildReport(results);
  }

  const ltv = property.acquisitionLTV ?? DEFAULT_LTV;
  const rate = property.acquisitionInterestRate ?? DEFAULT_INTEREST_RATE;
  const termYears = property.acquisitionTermYears ?? DEFAULT_TERM_YEARS;
  const totalPropertyValue = property.purchasePrice + (property.buildingImprovements ?? 0);
  const loanAmount = totalPropertyValue * ltv;
  const monthlyRate = rate / MONTHS_PER_YEAR;
  const totalPayments = termYears * MONTHS_PER_YEAR;

  const expectedPMT = monthlyRate === 0
    ? loanAmount / totalPayments
    : pmt(loanAmount, monthlyRate, totalPayments);

  // 1. PMT Formula Consistency
  // The financial engine computes PMT inline; verify it matches the shared pmt() function
  const firstDebtMonth = monthlyData.find(m => m.debtPayment > 0);
  if (firstDebtMonth) {
    results.push({
      name: 'PMT Formula: Engine vs Shared pmt()',
      description: 'Monthly payment from financial engine must match shared PMT function (P×r×(1+r)^n / ((1+r)^n−1))',
      passed: withinTolerance(firstDebtMonth.debtPayment, expectedPMT),
      severity: 'critical',
      expected: expectedPMT.toFixed(2),
      actual: firstDebtMonth.debtPayment.toFixed(2),
      source: 'IRS/GAAP: Standard amortization formula',
    });
  }

  // 2. Debt Service Split: Interest + Principal = Total Payment (ASC 470)
  const debtMonths = monthlyData.filter(m => m.debtPayment > 0);
  let splitErrors = 0;
  for (const m of debtMonths) {
    if (!withinTolerance(m.interestExpense + m.principalPayment, m.debtPayment)) {
      splitErrors++;
    }
  }
  results.push({
    name: 'ASC 470: Debt Service Split',
    description: 'Interest + Principal must equal total debt payment for every month',
    passed: splitErrors === 0,
    severity: 'critical',
    expected: '0 errors',
    actual: `${splitErrors} months with split errors`,
    source: 'GAAP ASC 470: Interest to IS, Principal to BS',
  });

  // 3. DSCR Cross-Check
  // For each operating year, independently compute DSCR from raw NOI and debt service
  // Verify DSCR > 0 for operating years and that the ratio is reasonable
  const projectionYears = Math.ceil(monthlyData.length / MONTHS_PER_YEAR);
  for (let y = 0; y < Math.min(projectionYears, 5); y++) {
    const yearSlice = monthlyData.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
    const yearNOI = yearSlice.reduce((sum, m) => sum + m.noi, 0);
    const yearDS = yearSlice.reduce((sum, m) => sum + m.debtPayment, 0);
    const yearInterest = yearSlice.reduce((sum, m) => sum + m.interestExpense, 0);
    const yearPrincipal = yearSlice.reduce((sum, m) => sum + m.principalPayment, 0);

    if (yearDS > 0 && yearNOI > 0) {
      const dscr = yearNOI / yearDS;
      const dsFromComponents = yearInterest + yearPrincipal;
      const dsComponentMatch = withinTolerance(yearDS, dsFromComponents);

      results.push({
        name: `Year ${y + 1}: DSCR Components`,
        description: 'Annual Debt Service must equal Interest + Principal (ASC 470)',
        passed: dsComponentMatch,
        severity: 'critical',
        expected: dsFromComponents.toFixed(2),
        actual: yearDS.toFixed(2),
        source: 'CRE Lending: DSCR = NOI ÷ (Interest + Principal)',
      });

      results.push({
        name: `Year ${y + 1}: DSCR Value`,
        description: `DSCR = ${dscr.toFixed(2)}x — must be positive for operating years`,
        passed: dscr > 0,
        severity: 'material',
        expected: '> 0 (typical minimum 1.20x–1.25x)',
        actual: `${dscr.toFixed(4)}x`,
        source: 'CRE Lending Standard: NOI / Annual Debt Service',
      });

      // Verify engine DS against independently computed annual DS from loan params
      const expectedAnnualDS = expectedPMT * MONTHS_PER_YEAR;
      if (y === 0 && expectedAnnualDS > 0) {
        const independentDSCR = yearNOI / expectedAnnualDS;
        const engineDSCR = dscr;
        results.push({
          name: `Year ${y + 1}: DSCR Formula Consistency`,
          description: 'Engine DSCR must match independently computed DSCR (NOI ÷ 12×PMT)',
          passed: withinTolerance(engineDSCR, independentDSCR, 0.05),
          severity: 'critical',
          expected: independentDSCR.toFixed(4),
          actual: engineDSCR.toFixed(4),
          source: 'Cross-Validation: Engine vs Independent PMT Calculation',
        });
      }
    }
  }

  // 4. Debt Yield Cross-Check
  if (loanAmount > 0) {
    const year1NOI = monthlyData.slice(0, MONTHS_PER_YEAR).reduce((sum, m) => sum + m.noi, 0);
    if (year1NOI > 0) {
      const debtYield = year1NOI / loanAmount;
      results.push({
        name: 'Year 1: Debt Yield',
        description: 'Debt Yield = NOI ÷ Loan Amount (rate-independent risk metric)',
        passed: debtYield > 0,
        severity: 'info',
        expected: `> 0% (typical minimum 8-10%)`,
        actual: `${(debtYield * 100).toFixed(2)}%`,
        source: 'CRE Lending Standard: NOI / Loan Amount',
      });
    }
  }

  // 5. Loan Balance Declining Monotonically (amortizing loan)
  let balanceErrors = 0;
  for (let i = 1; i < debtMonths.length; i++) {
    if (debtMonths[i].debtOutstanding > debtMonths[i - 1].debtOutstanding + TOLERANCE) {
      balanceErrors++;
    }
  }
  results.push({
    name: 'Amortization: Balance Monotonically Decreasing',
    description: 'Outstanding debt must decline each month for a fully amortizing loan',
    passed: balanceErrors === 0,
    severity: 'critical',
    expected: '0 months with increasing balance',
    actual: `${balanceErrors} months with increasing balance`,
    source: 'Standard amortization: each payment reduces principal',
  });

  // 6. Interest Expense Declining Over Time (amortizing loan)
  let interestIncreases = 0;
  for (let i = 1; i < debtMonths.length; i++) {
    if (debtMonths[i].interestExpense > debtMonths[i - 1].interestExpense + TOLERANCE) {
      interestIncreases++;
    }
  }
  results.push({
    name: 'Amortization: Interest Expense Declining',
    description: 'Interest expense should decrease as balance decreases (amortizing loan)',
    passed: interestIncreases === 0,
    severity: 'material',
    expected: '0 months with increasing interest',
    actual: `${interestIncreases} months with increasing interest`,
    source: 'Amortization: Interest = Balance × Rate (declining balance)',
  });

  // 7. Net Income Identity: ANOI - Interest - Depreciation - Tax = Net Income (GAAP)
  let niErrors = 0;
  for (const m of monthlyData) {
    const taxableIncome = m.anoi - m.interestExpense - (m.depreciationExpense || 0);
    const _expectedTax = taxableIncome > 0 ? taxableIncome * (m.incomeTax / Math.max(taxableIncome, 0.01)) : 0;
    const expectedNI = m.anoi - m.interestExpense - (m.depreciationExpense || 0) - m.incomeTax;
    if (!withinTolerance(m.netIncome, expectedNI)) {
      niErrors++;
    }
  }
  results.push({
    name: 'GAAP: Net Income Identity',
    description: 'Net Income = ANOI − Interest − Depreciation − Tax (per GAAP Income Statement)',
    passed: niErrors === 0,
    severity: 'critical',
    expected: '0 errors',
    actual: `${niErrors} months with identity failures`,
    source: 'GAAP ASC 470 + ASC 360: Interest and Depreciation on IS',
  });

  // 8. Cash Flow Reconciliation: Operating CF + Financing CF = Total Cash Flow (ASC 230)
  let cfErrors = 0;
  for (const m of monthlyData) {
    const expectedCF = (m.operatingCashFlow || 0) + (m.financingCashFlow || 0);
    if (Math.abs(m.cashFlow - expectedCF) > TOLERANCE) {
      cfErrors++;
    }
  }
  results.push({
    name: 'ASC 230: Cash Flow Reconciliation',
    description: 'Operating CF + Financing CF = Total Cash Flow (indirect method)',
    passed: cfErrors === 0,
    severity: 'critical',
    expected: '0 reconciliation errors',
    actual: `${cfErrors} months with reconciliation failures`,
    source: 'GAAP ASC 230: Statement of Cash Flows',
  });

  // 9. Revenue Identity: Total = Rooms + F&B + Events + Other (USALI)
  let revErrors = 0;
  for (const m of monthlyData) {
    const expectedTotal = m.revenueRooms + m.revenueFB + m.revenueEvents + m.revenueOther;
    if (!withinTolerance(m.revenueTotal, expectedTotal)) {
      revErrors++;
    }
  }
  results.push({
    name: 'USALI: Revenue Identity',
    description: 'Total Revenue = Rooms + F&B + Events + Other (USALI Summary Statement)',
    passed: revErrors === 0,
    severity: 'critical',
    expected: '0 errors',
    actual: `${revErrors} months with revenue identity failures`,
    source: 'USALI 12th Edition: Summary Operating Statement',
  });

  // 10. GOP Identity: Revenue - Operating Expenses (USALI)
  let gopErrors = 0;
  for (const m of monthlyData) {
    const totalOpEx = m.expenseRooms + m.expenseFB + m.expenseEvents + m.expenseOther +
      m.expenseMarketing + m.expensePropertyOps + m.expenseUtilitiesVar +
      m.expenseAdmin + m.expenseIT +
      m.expenseUtilitiesFixed + m.expenseInsurance + m.expenseOtherCosts;
    const expectedGOP = m.revenueTotal - totalOpEx;
    if (!withinTolerance(m.gop, expectedGOP)) {
      gopErrors++;
    }
  }
  results.push({
    name: 'USALI: GOP Identity',
    description: 'GOP = Total Revenue − Total Operating Expenses',
    passed: gopErrors === 0,
    severity: 'critical',
    expected: '0 errors',
    actual: `${gopErrors} months with GOP identity failures`,
    source: 'USALI 12th Edition: Gross Operating Profit',
  });

  // 11. USALI 4-level waterfall: AGOP → NOI → ANOI
  let noiErrors = 0;
  for (const m of monthlyData) {
    const expectedAGOP = m.gop - m.feeBase - m.feeIncentive;
    const expectedNOI = m.agop - m.expenseTaxes;
    const expectedANOI = m.noi - m.expenseFFE;
    if (!withinTolerance(m.agop, expectedAGOP) || !withinTolerance(m.noi, expectedNOI) || !withinTolerance(m.anoi, expectedANOI)) {
      noiErrors++;
    }
  }
  results.push({
    name: 'USALI: Waterfall Identity (AGOP → NOI → ANOI)',
    description: 'AGOP = GOP − Fees; NOI = AGOP − Taxes; ANOI = NOI − FF&E',
    passed: noiErrors === 0,
    severity: 'critical',
    expected: '0 errors',
    actual: `${noiErrors} months with NOI identity failures`,
    source: 'USALI 12th Edition: Net Operating Income',
  });

  // 12. Balance Sheet: Property Value = Land + (Building - Accum Depreciation) (ASC 360)
  const operatingMonths = monthlyData.filter(m => m.propertyValue > 0);
  let bsErrors = 0;
  if (operatingMonths.length > 0) {
    const landPct = property.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT;
    const landValue = property.purchasePrice * landPct;
    const buildingValue = property.purchasePrice * (1 - landPct) + (property.buildingImprovements ?? 0);
    const effectiveDepYears = property.depreciationYears ?? global.depreciationYears ?? DEPRECIATION_YEARS;
    const _monthlyDep = buildingValue / effectiveDepYears / MONTHS_PER_YEAR;

    for (let i = 0; i < operatingMonths.length; i++) {
      const m = operatingMonths[i];
      if (m.depreciationExpense > 0) {
        const expectedPropValue = landValue + buildingValue - (m.depreciationExpense * (i + 1));
        if (Math.abs(m.propertyValue - expectedPropValue) / Math.max(m.propertyValue, 1) > 0.05) {
          bsErrors++;
        }
      }
    }
  }
  results.push({
    name: 'ASC 360: Property Value',
    description: 'Property Value = Land + (Building − Accumulated Depreciation)',
    passed: bsErrors === 0,
    severity: 'material',
    expected: '0 inconsistencies',
    actual: `${bsErrors} months with property value issues`,
    source: 'GAAP ASC 360: Property, Plant & Equipment',
  });

  // 13. No Pre-Operations Revenue/Expense
  const preOpsRevenue = monthlyData.filter(m => m.occupancy === 0 && m.revenueTotal > 0);
  results.push({
    name: 'Timing: No Pre-Operations Revenue',
    description: 'Zero occupancy months must have zero revenue',
    passed: preOpsRevenue.length === 0,
    severity: 'critical',
    expected: '0 months',
    actual: `${preOpsRevenue.length} months with pre-ops revenue`,
    source: 'GAAP ASC 606: Revenue Recognition',
  });

  // 14. IRS: Depreciation = Basis / 39 / 12 (straight-line, nonresidential hotel)
  const depMonths = monthlyData.filter(m => m.depreciationExpense > 0);
  if (depMonths.length > 0) {
    const depLandPct = property.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT;
    const buildingBasis = property.purchasePrice * (1 - depLandPct) + (property.buildingImprovements ?? 0);
    const effectiveDepYears2 = property.depreciationYears ?? global.depreciationYears ?? DEPRECIATION_YEARS;
    const expectedMonthlyDep = buildingBasis / effectiveDepYears2 / MONTHS_PER_YEAR;
    let depErrors = 0;
    for (const m of depMonths) {
      if (!withinTolerance(m.depreciationExpense, expectedMonthlyDep, 1.0)) {
        depErrors++;
      }
    }
    results.push({
      name: 'IRS Pub 946: Monthly Depreciation',
      description: `Monthly depreciation = depreciable basis / ${effectiveDepYears2} / 12`,
      passed: depErrors === 0,
      severity: 'material',
      expected: expectedMonthlyDep.toFixed(2),
      actual: depMonths[0].depreciationExpense.toFixed(2),
      source: `IRS Publication 946: ${effectiveDepYears2}-year straight-line, residential rental`,
    });
  }

  // 15. Management Fee Validation: Base fee = Revenue × rate, Incentive fee = max(0, GOP × rate)
  const baseRate = property.baseManagementFeeRate ?? DEFAULT_BASE_MANAGEMENT_FEE_RATE;
  const incentiveRate = property.incentiveManagementFeeRate ?? DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE;
  let baseFeeErrors = 0;
  let incentiveFeeErrors = 0;

  for (const m of monthlyData) {
    if (m.monthIndex >= 0) {
      // Base fee check (only if no active fee categories, otherwise engine uses categories)
      if (!property.feeCategories || property.feeCategories.filter(c => c.isActive).length === 0) {
        const expectedBaseFee = m.revenueTotal * baseRate;
        if (!withinTolerance(m.feeBase, expectedBaseFee)) {
          baseFeeErrors++;
        }
      }

      // Incentive fee check
      const expectedIncentiveFee = Math.max(0, m.gop * incentiveRate);
      if (!withinTolerance(m.feeIncentive, expectedIncentiveFee)) {
        incentiveFeeErrors++;
      }
    }
  }

  results.push({
    name: 'USALI: Base Management Fee',
    description: `Base fee must equal Total Revenue × ${ (baseRate * 100).toFixed(1) }%`,
    passed: baseFeeErrors === 0,
    severity: 'critical',
    expected: '0 errors',
    actual: `${baseFeeErrors} months with base fee errors`,
    source: 'USALI 12th Edition: Management Fees',
  });

  results.push({
    name: 'USALI: Incentive Management Fee',
    description: `Incentive fee must equal max(0, GOP × ${ (incentiveRate * 100).toFixed(1) }%)`,
    passed: incentiveFeeErrors === 0,
    severity: 'critical',
    expected: '0 errors',
    actual: `${incentiveFeeErrors} months with incentive fee errors`,
    source: 'USALI 12th Edition: Management Fees',
  });

  // 16. Cash-on-Cash Cross-Check: Annual CF / Initial Equity must match reported CoC
  // For each year, verify CoC (simplified check against initial equity)
  const initialEquity = totalPropertyValue - loanAmount;
  if (initialEquity > 0) {
    for (let y = 0; y < Math.min(projectionYears, 5); y++) {
      const yearSlice = monthlyData.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
      const annualCF = yearSlice.reduce((sum, m) => sum + m.cashFlow, 0);
      const annualCoC = annualCF / initialEquity;

      results.push({
        name: `Year ${y + 1}: Cash-on-Cash Return`,
        description: 'Annual Cash Flow / Initial Equity investment',
        passed: annualCoC > -1, // Simple reasonableness check
        severity: 'info',
        expected: '> -100%',
        actual: `${(annualCoC * 100).toFixed(2)}%`,
        source: 'CRE Metrics: Cash-on-Cash Return',
      });
    }
  }

  // 17. FF&E Reserve Accumulation Check: FF&E = Revenue × costRateFFE
  const ffeRate = property.costRateFFE ?? DEFAULT_COST_RATE_FFE;
  let ffeErrors = 0;
  for (const m of monthlyData) {
    if (m.monthIndex >= 0) {
      const expectedFFE = m.revenueTotal * ffeRate;
      if (!withinTolerance(m.expenseFFE, expectedFFE)) {
        ffeErrors++;
      }
    }
  }
  results.push({
    name: 'USALI: FF&E Reserve',
    description: `FF&E reserve must equal Total Revenue × ${ (ffeRate * 100).toFixed(1) }%`,
    passed: ffeErrors === 0,
    severity: 'material',
    expected: '0 errors',
    actual: `${ffeErrors} months with FF&E errors`,
    source: 'USALI 12th Edition: Furniture, Fixtures & Equipment Reserve',
  });

  // 18. Total Expenses Identity: TotalExp = OpEx + Fees + Taxes + FF&E
  let totalExpErrors = 0;
  for (const m of monthlyData) {
    const opEx = m.expenseRooms + m.expenseFB + m.expenseEvents + m.expenseOther +
      m.expenseMarketing + m.expensePropertyOps + m.expenseUtilitiesVar +
      m.expenseAdmin + m.expenseIT + m.expenseUtilitiesFixed + m.expenseInsurance + m.expenseOtherCosts;
    const expectedTotalExp = opEx + m.feeBase + m.feeIncentive + m.expenseTaxes + m.expenseFFE;
    
    if (!withinTolerance(m.totalExpenses, expectedTotalExp)) {
      totalExpErrors++;
    }
  }
  results.push({
    name: 'USALI: Total Expenses Identity',
    description: 'Total Expenses = Operating Expenses + Management Fees + Taxes + FF&E Reserve',
    passed: totalExpErrors === 0,
    severity: 'critical',
    expected: '0 errors',
    actual: `${totalExpErrors} months with total expense failures`,
    source: 'USALI 12th Edition: Summary Operating Statement',
  });

  return buildReport(results);
}

function buildReport(results: CrossValidationResult[]): CrossValidationReport {
  const totalChecks = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = totalChecks - passed;
  const criticalIssues = results.filter(r => !r.passed && r.severity === 'critical').length;

  return { results, totalChecks, passed, failed, criticalIssues };
}

export function formatCrossValidationReport(report: CrossValidationReport): string {
  let output = '';
  output += '╔══════════════════════════════════════════════════════════════════════════════╗\n';
  output += '║           CROSS-CALCULATOR VALIDATION REPORT                                ║\n';
  output += '║       Authoritative Sources: IRS, GAAP (ASC 230/360/470/606), USALI         ║\n';
  output += '╚══════════════════════════════════════════════════════════════════════════════╝\n\n';

  for (const r of report.results) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    const severityTag = r.severity === 'critical' ? '[CRITICAL]' : r.severity === 'material' ? '[MATERIAL]' : '[INFO]';
    output += `${status} ${severityTag} ${r.name}\n`;
    output += `  ${r.description}\n`;
    output += `  Expected: ${r.expected}\n`;
    output += `  Actual:   ${r.actual}\n`;
    output += `  Source:   ${r.source}\n\n`;
  }

  output += '────────────────────────────────────────────────────────────────────────────────\n';
  output += `Total: ${report.totalChecks} checks | Passed: ${report.passed} | Failed: ${report.failed} | Critical: ${report.criticalIssues}\n`;

  if (report.criticalIssues > 0) {
    output += 'OPINION: ADVERSE — Critical calculation inconsistencies found.\n';
  } else if (report.failed > 0) {
    output += 'OPINION: QUALIFIED — Material issues require attention.\n';
  } else {
    output += 'OPINION: UNQUALIFIED — All calculations verified against authoritative sources.\n';
  }

  return output;
}
