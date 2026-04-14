import {
  DEFAULT_PROJECTION_YEARS,
  DEFAULT_LTV,
  CHECKER_REVENUE_GROWTH_VARIANCE,
  CHECKER_NOI_MARGIN_MIN_PCT,
  CHECKER_NOI_MARGIN_MAX_PCT,
  CHECKER_BALANCE_SHEET_TOLERANCE,
  CHECKER_MIN_DSCR,
  MONTHS_PER_YEAR,
  DEFAULT_OCCUPANCY_RAMP_MONTHS,
} from "@shared/constants";
import type {
  VerificationReport,
  PropertyCheckResults,
  CheckResult,
  CheckerProperty,
  CheckerGlobalAssumptions,
  EngineMonthlyResult,
} from "./types";
import { check } from "./gaap-checks";
import {
  runCompanyChecks,
  runConsolidatedChecks,
} from "./portfolio-checks";
import {
  aggregateYearMetrics,
} from "./helpers";
import { runFinancialIdentityChecks, runFundingGateChecks, runScheduleReconcileChecks } from "./adapters";
import { sweepNaN, checkDebtRollForward } from "../../calc/validation/data-integrity";

const PROJECTION_YEARS = DEFAULT_PROJECTION_YEARS;

export function runIndependentVerification(
  properties: CheckerProperty[],
  globalAssumptions: CheckerGlobalAssumptions,
  engineResults: EngineMonthlyResult[][]
): VerificationReport {
  if (!engineResults || engineResults.length === 0) {
    throw new Error(
      "runIndependentVerification requires pre-computed engineResults. " +
      "Use runVerificationWithEngine() from server/calculationChecker.ts " +
      "to compute engine results automatically."
    );
  }

  const propertyResults: PropertyCheckResults[] = [];
  let totalChecks = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let criticalIssues = 0;
  let materialIssues = 0;

  const projectionYears = globalAssumptions.projectionYears ?? PROJECTION_YEARS;
  const projectionMonths = projectionYears * MONTHS_PER_YEAR;

  const allEngineCalcs: EngineMonthlyResult[][] = engineResults;

  for (let pi = 0; pi < properties.length; pi++) {
    const property = properties[pi];
    const checks: CheckResult[] = [];
    const engineCalc = allEngineCalcs[pi];

    if (!engineCalc || engineCalc.length === 0) {
      propertyResults.push({
        propertyName: property.name || "Unnamed Property",
        propertyType: property.type || "Full Equity",
        checks: [],
        passed: 0,
        failed: 0,
        criticalIssues: 0,
      });
      continue;
    }

    const checkPropertyValue = property.purchasePrice + (property.buildingImprovements ?? 0);
    const ltv = property.acquisitionLTV ?? DEFAULT_LTV;
    const loanAmount = property.type === "Financed" ? checkPropertyValue * ltv : 0;

    const firstOperationalMonth = engineCalc.findIndex((m) => m.revenueRooms > 0);

    if (firstOperationalMonth >= 0) {
      const m = engineCalc[firstOperationalMonth];

      checks.push(check(
        "Total Revenue (Month 1)",
        "Revenue",
        "ASC 606",
        "Rooms + Events + F&B + Other",
        m.revenueRooms + m.revenueEvents + m.revenueFB + m.revenueOther,
        m.revenueTotal,
        "critical"
      ));

      const totalOperatingExpenses =
        m.expenseRooms + m.expenseFB + m.expenseEvents + m.expenseOther +
        m.expenseMarketing + m.expensePropertyOps + m.expenseUtilitiesVar +
        m.expenseAdmin + m.expenseIT + m.expenseUtilitiesFixed + m.expenseInsurance + m.expenseOtherCosts;

      checks.push(check(
        "GOP = Revenue - OpEx",
        "P&L",
        "USALI",
        "Total Revenue - Total Operating Expenses",
        m.revenueTotal - totalOperatingExpenses,
        m.gop,
        "critical"
      ));

      checks.push(check(
        "AGOP = GOP - Management Fees",
        "P&L",
        "USALI",
        "GOP - Base Fee - Incentive Fee",
        m.gop - m.feeBase - m.feeIncentive,
        m.agop,
        "critical"
      ));

      checks.push(check(
        "NOI = AGOP - Taxes",
        "P&L",
        "USALI",
        "AGOP - Property Taxes",
        m.agop - m.expenseTaxes,
        m.noi,
        "critical"
      ));

      checks.push(check(
        "ANOI = NOI - FF&E Reserve",
        "P&L",
        "USALI",
        "NOI - FF&E Reserve",
        m.noi - m.expenseFFE,
        m.anoi,
        "critical"
      ));

      checks.push(check(
        "Cash Flow = ANOI - Debt Service - Tax",
        "Cash Flow",
        "ASC 230",
        "ANOI - Total Debt Payment (interest + principal) - Income Tax",
        m.anoi - m.debtPayment - m.incomeTax,
        m.cashFlow,
        "critical"
      ));

      const initialEquity = checkPropertyValue - loanAmount + (property.operatingReserve ?? 0);
      let cumulativeNI = 0;
      for (let ci = 0; ci <= firstOperationalMonth; ci++) {
        cumulativeNI += engineCalc[ci].netIncome;
      }
      const identityChecks = runFinancialIdentityChecks(
        m, m.propertyValue, m.debtOutstanding, initialEquity, cumulativeNI,
      );
      checks.push(...identityChecks);
    }

    if (property.type === "Financed" && loanAmount > 0) {
      checks.push(check(
        "Interest + Principal = Debt Payment",
        "Debt",
        "ASC 470",
        "Interest Expense + Principal Payment = Total Debt Service",
        engineCalc.find((m) => m.debtPayment > 0)?.debtPayment || 0,
        (engineCalc.find((m) => m.debtPayment > 0)?.interestExpense || 0) +
        (engineCalc.find((m) => m.debtPayment > 0)?.principalPayment || 0),
        "critical"
      ));
    }

    const midYear = Math.floor(projectionYears / 2);
    const serverYear1    = aggregateYearMetrics(engineCalc.slice(0, MONTHS_PER_YEAR));
    const _serverMidYear  = aggregateYearMetrics(engineCalc.slice(midYear * MONTHS_PER_YEAR, (midYear + 1) * MONTHS_PER_YEAR));
    const serverLastYear = aggregateYearMetrics(engineCalc.slice((projectionYears - 1) * MONTHS_PER_YEAR, projectionMonths));

    if (serverYear1.revenue > 0 && serverLastYear.revenue > 0) {
      const annualGrowthRate = Math.pow(serverLastYear.revenue / serverYear1.revenue, 1 / (projectionYears - 1)) - 1;
      const expectedGrowthRate = property.adrGrowthRate;

      const hasOccupancyRamp = (property.startOccupancy ?? 0) < (property.maxOccupancy ?? 1);
      if (projectionYears > 1) {
        if (hasOccupancyRamp) {
          checks.push(check(
            "Revenue Growth Rate Consistency",
            "Reasonableness",
            "Industry",
            `Revenue CAGR ${(annualGrowthRate * 100).toFixed(1)}% includes occupancy ramp (start ${((property.startOccupancy ?? 0) * 100).toFixed(0)}% → max ${((property.maxOccupancy ?? 1) * 100).toFixed(0)}%) — not directly comparable to ADR growth ${(expectedGrowthRate * 100).toFixed(1)}%`,
            expectedGrowthRate,
            annualGrowthRate,
            "info"
          ));
        } else {
          checks.push(check(
            "Revenue Growth Rate Consistency",
            "Reasonableness",
            "Industry",
            `Expected ADR growth ${(expectedGrowthRate * 100).toFixed(1)}% vs Actual Revenue CAGR ${(annualGrowthRate * 100).toFixed(1)}%`,
            expectedGrowthRate,
            annualGrowthRate,
            Math.abs(annualGrowthRate - expectedGrowthRate) > CHECKER_REVENUE_GROWTH_VARIANCE ? "material" : "info"
          ));
        }
      }

      checks.push(check(
        "Revenue Growth Direction",
        "Reasonableness",
        "Industry",
        `Year 1 $${Math.round(serverYear1.revenue).toLocaleString()} → Year ${projectionYears} $${Math.round(serverLastYear.revenue).toLocaleString()} (expect growth)`,
        1,
        serverLastYear.revenue > serverYear1.revenue ? 1 : 0,
        serverLastYear.revenue <= serverYear1.revenue ? "material" : "info"
      ));
    }

    if (property.type === "Financed" && loanAmount > 0) {
      const rampMonths = property.occupancyRampMonths ?? DEFAULT_OCCUPANCY_RAMP_MONTHS;
      const startOcc = property.startOccupancy ?? 0;
      const maxOcc = property.maxOccupancy ?? 1;
      const growthStep = property.occupancyGrowthStep ?? 0;
      const stepsToStabilize = growthStep > 0 ? Math.ceil((maxOcc - startOcc) / growthStep) : 0;
      const rampUpMonthsTotal = stepsToStabilize * rampMonths;

      const firstOpIdx = engineCalc.findIndex(m => m.revenueRooms > 0);
      const stabilizedMonthIdx = firstOpIdx >= 0 ? firstOpIdx + rampUpMonthsTotal : -1;
      const stabilizedYearIdx = stabilizedMonthIdx >= 0 ? Math.floor(stabilizedMonthIdx / MONTHS_PER_YEAR) : -1;

      let dscrYearLabel: string;
      let dscrNoi: number;
      let dscrDebtService: number;
      let isStabilized = false;

      if (stabilizedYearIdx >= 0 && stabilizedYearIdx < projectionYears) {
        const start = stabilizedYearIdx * MONTHS_PER_YEAR;
        const end = Math.min(start + MONTHS_PER_YEAR, engineCalc.length);
        const yrMetrics = aggregateYearMetrics(engineCalc.slice(start, end));
        const yrDebt = engineCalc.slice(start, end).reduce((s, m) => s + m.debtPayment, 0);
        dscrYearLabel = `Year ${stabilizedYearIdx + 1}`;
        dscrNoi = yrMetrics.noi;
        dscrDebtService = yrDebt;
        isStabilized = true;
      } else {
        const lastStart = (projectionYears - 1) * MONTHS_PER_YEAR;
        const lastEnd = Math.min(lastStart + MONTHS_PER_YEAR, engineCalc.length);
        const lastMetrics = aggregateYearMetrics(engineCalc.slice(lastStart, lastEnd));
        const lastDebt = engineCalc.slice(lastStart, lastEnd).reduce((s, m) => s + m.debtPayment, 0);
        dscrYearLabel = `Year ${projectionYears}`;
        dscrNoi = lastMetrics.noi;
        dscrDebtService = lastDebt;
        isStabilized = false;
      }

      const dscr = dscrDebtService > 0 ? dscrNoi / dscrDebtService : 0;

      let severity: "critical" | "material" | "info";
      if (!isStabilized) {
        severity = "info";
      } else {
        severity = dscr < CHECKER_MIN_DSCR ? "critical" : "info";
      }

      checks.push(check(
        `DSCR Reasonableness (${dscrYearLabel}${!isStabilized ? " — still ramping" : " — stabilized"})`,
        "Debt",
        "ASC 470 / Banking",
        `${dscrYearLabel} NOI $${Math.round(dscrNoi).toLocaleString()} / Debt Service $${Math.round(dscrDebtService).toLocaleString()} (expect > 1.0x)`,
        CHECKER_MIN_DSCR,
        dscr,
        severity
      ));
    }

    if (serverLastYear.revenue > 0) {
      const noiMarginYear1 = serverYear1.revenue > 0 ? (serverYear1.noi / serverYear1.revenue * 100) : 0;
      const noiMarginLastYear = (serverLastYear.noi / serverLastYear.revenue * 100);

      checks.push(check(
        "NOI Margin Reasonableness",
        "Reasonableness",
        "Industry Benchmark",
        `Year 1: ${noiMarginYear1.toFixed(1)}% → Year ${projectionYears}: ${noiMarginLastYear.toFixed(1)}% (expect 5-60%)`,
        1,
        (noiMarginLastYear >= CHECKER_NOI_MARGIN_MIN_PCT && noiMarginLastYear <= CHECKER_NOI_MARGIN_MAX_PCT) ? 1 : 0,
        (noiMarginLastYear < CHECKER_NOI_MARGIN_MIN_PCT || noiMarginLastYear > CHECKER_NOI_MARGIN_MAX_PCT) ? "material" : "info"
      ));
    }

    const initialEquity = checkPropertyValue - loanAmount + (property.operatingReserve ?? 0);
    let cumulativeNetIncome = 0;
    let aleFailedMonths = 0;
    const acquisitionIndex = engineCalc.findIndex((m) => m.propertyValue > 0);

    for (let mi = 0; mi < engineCalc.length; mi++) {
      const m = engineCalc[mi];
      if (mi < acquisitionIndex) continue;
      cumulativeNetIncome += m.netIncome;
      const totalAssets = m.endingCash + m.propertyValue;
      const totalLiabilities = m.debtOutstanding;
      const derivedEquity = initialEquity + cumulativeNetIncome;
      const gap = Math.abs(totalAssets - totalLiabilities - derivedEquity);
      if (gap > CHECKER_BALANCE_SHEET_TOLERANCE) aleFailedMonths++;
    }

    checks.push(check(
      "Balance Sheet Identity A=L+E",
      "Balance Sheet",
      "ASC 210",
      `Assets = Liabilities + Equity for all ${engineCalc.length - Math.max(acquisitionIndex, 0)} post-acquisition months; failed = ${aleFailedMonths}`,
      0,
      aleFailedMonths,
      "critical"
    ));

    const endingCash = engineCalc[engineCalc.length - 1]?.endingCash || 0;
    const cumulativeCashFlow = engineCalc.reduce((sum, m) => sum + m.cashFlow, 0);
    const reserveSeed = property.operatingReserve ?? 0;
    checks.push(check(
      "Cumulative Cash Flow = Ending Cash",
      "Cash Flow",
      "ASC 230",
      "Ending cash balance equals sum of all monthly cash flows + operating reserve seed",
      cumulativeCashFlow + reserveSeed,
      endingCash,
      "critical"
    ));

    const fundingGateChecks = runFundingGateChecks(property, engineCalc);
    checks.push(...fundingGateChecks);

    const scheduleReconcileChecks = runScheduleReconcileChecks(property, engineCalc);
    checks.push(...scheduleReconcileChecks);

    const preOpMonths = engineCalc.filter((m) => m.monthIndex < firstOperationalMonth);
    if (preOpMonths.length > 0) {
      const preOpRevenue = preOpMonths.reduce((sum, m) => sum + m.revenueTotal, 0);
      checks.push(check(
        "Pre-Operations Revenue = $0",
        "Timing",
        "ASC 606",
        "No revenue before operations start date",
        0,
        preOpRevenue,
        "critical"
      ));
    }

    if (property.costSegEnabled) {
      const costSegDepMonth1 = engineCalc.find(m => m.depreciationExpense > 0);
      const depBasis = property.purchasePrice * (1 - (property.landValuePercent ?? 0.25)) + (property.buildingImprovements ?? 0);
      const effectiveDepYears = property.depreciationYears ?? globalAssumptions.depreciationYears ?? 39;
      const standardMonthlyDep = depBasis / effectiveDepYears / MONTHS_PER_YEAR;
      if (costSegDepMonth1) {
        checks.push(check(
          "Cost Segregation Depreciation > Standard SL",
          "Tax",
          "IRS Pub 946 / Cost Seg Study",
          `Cost seg depreciation $${Math.round(costSegDepMonth1.depreciationExpense).toLocaleString()}/mo vs standard SL $${Math.round(standardMonthlyDep).toLocaleString()}/mo`,
          1,
          costSegDepMonth1.depreciationExpense > standardMonthlyDep ? 1 : 0,
          "info"
        ));
      }
    }

    let cashTieOutErrors = 0;
    for (let mi = 1; mi < engineCalc.length; mi++) {
      const em = engineCalc[mi];
      const prevCash = engineCalc[mi - 1].endingCash;
      const deltaCash = em.endingCash - prevCash;
      const gap = Math.abs(deltaCash - em.cashFlow);
      if (gap > CHECKER_BALANCE_SHEET_TOLERANCE) cashTieOutErrors++;
    }
    checks.push(check(
      "Cash Tie-Out: ΔEndingCash = Cash Flow",
      "Cash Flow",
      "ASC 230",
      `EndingCash[n] - EndingCash[n-1] = CashFlow[n] for all months (n>0); errors = ${cashTieOutErrors}`,
      0,
      cashTieOutErrors,
      "critical"
    ));

    const nanFields = [
      "revenueTotal", "revenueRooms", "gop", "agop", "noi", "anoi",
      "netIncome", "cashFlow", "operatingCashFlow", "financingCashFlow",
      "endingCash", "debtOutstanding", "propertyValue", "depreciationExpense",
      "interestExpense", "principalPayment", "debtPayment", "incomeTax",
      "feeBase", "feeIncentive", "expenseTaxes", "expenseFFE",
    ];
    const nanResult = sweepNaN({
      label: property.name || "Unnamed Property",
      values: engineCalc,
      fields: nanFields,
      rounding_policy: { precision: 2, bankers_rounding: false },
    });
    checks.push(check(
      "No NaN in Financial Fields",
      "Data Integrity",
      "Business Rule",
      `All numeric financial fields must be valid numbers; NaN count = ${nanResult.nanCount}`,
      0,
      nanResult.nanCount,
      "critical"
    ));

    if (property.type === "Financed" && loanAmount > 0) {
      const rollForward = checkDebtRollForward({
        balances: engineCalc.map(m => m.debtOutstanding),
        principalPayments: engineCalc.map(m => m.principalPayment),
        tolerance: CHECKER_BALANCE_SHEET_TOLERANCE,
        rounding_policy: { precision: 2, bankers_rounding: false },
      });
      checks.push(check(
        "Debt Roll-Forward Consistency",
        "Debt",
        "ASC 470",
        `Balance[n] = Balance[n-1] - Principal[n] for all months; errors = ${rollForward.errorCount}`,
        0,
        rollForward.errorCount,
        "critical"
      ));
    }

    const propResult: PropertyCheckResults = {
      propertyName: property.name || "Unnamed Property",
      propertyType: property.type || "Full Equity",
      checks,
      passed: checks.filter(c => c.passed).length,
      failed: checks.filter(c => !c.passed).length,
      criticalIssues: checks.filter(c => !c.passed && c.severity === "critical").length,
    };

    propertyResults.push(propResult);
    totalChecks += checks.length;
    totalPassed += propResult.passed;
    totalFailed += propResult.failed;
    criticalIssues += propResult.criticalIssues;
    materialIssues += checks.filter(c => !c.passed && c.severity === "material").length;
  }

  const companyChecks = runCompanyChecks(
    properties,
    allEngineCalcs,
    projectionMonths,
  );
  
  for (const c of companyChecks) {
    totalChecks++;
    if (c.passed) totalPassed++;
    else {
      totalFailed++;
      if (c.severity === "critical") criticalIssues++;
      else if (c.severity === "material") materialIssues++;
    }
  }

  const consolidatedChecks = runConsolidatedChecks(
    properties,
    allEngineCalcs,
  );

  for (const c of consolidatedChecks) {
    totalChecks++;
    if (c.passed) totalPassed++;
    else {
      totalFailed++;
      if (c.severity === "critical") criticalIssues++;
      else if (c.severity === "material") materialIssues++;
    }
  }

  let auditOpinion: "UNQUALIFIED" | "QUALIFIED" | "ADVERSE" = "UNQUALIFIED";
  if (criticalIssues > 0) auditOpinion = "ADVERSE";
  else if (materialIssues > 0) auditOpinion = "QUALIFIED";

  return {
    timestamp: new Date().toISOString(),
    propertiesChecked: properties.length,
    propertyResults,
    companyChecks,
    consolidatedChecks,
    summary: {
      totalChecks,
      totalPassed,
      totalFailed,
      criticalIssues,
      materialIssues,
      auditOpinion,
      overallStatus: criticalIssues > 0 ? "FAIL" : (materialIssues > 0 ? "WARNING" : "PASS"),
    },
  };
}

export * from "./types";
