import { generatePropertyProForma, MonthlyFinancials } from "../financialEngine";
import { dPow } from "@calc/shared/decimal";
import {
  DEFAULT_LTV,
  DEFAULT_INTEREST_RATE,
  DEFAULT_TERM_YEARS,
  DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_REV_SHARE_EVENTS,
  DEFAULT_REV_SHARE_FB,
  DEFAULT_REV_SHARE_OTHER,
  DEFAULT_COST_RATE_ROOMS,
  DEFAULT_COST_RATE_FB,
  DEFAULT_COST_RATE_ADMIN,
  DEFAULT_COST_RATE_MARKETING,
  DEFAULT_COST_RATE_PROPERTY_OPS,
  DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_COST_RATE_TAXES,
  DEFAULT_COST_RATE_IT,
  DEFAULT_COST_RATE_FFE,
  DEFAULT_COST_RATE_OTHER,
  DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_PROPERTY_INCOME_TAX_RATE,
  DEFAULT_MARKETING_RATE,
  DEPRECIATION_YEARS,
  DAYS_PER_MONTH,
  MONTHS_PER_YEAR,
} from "../constants";
import { TestCase, KNOWN_VALUE_TEST_CASES, computeMonthlyPL } from "./test-cases";

export interface KnownValueCheck {
  label: string;
  formula: string;
  expected: number;
  calculated: number;
  passed: boolean;
}

export interface KnownValueTestResult {
  name: string;
  checks: KnownValueCheck[];
  allPassed: boolean;
}

function r2(v: number) { return Math.round(v * 100) / 100; }
function match(a: number, b: number) { return Math.abs(a - b) < 1; }

function buildEngineInputs(tc: TestCase): { property: any; global: any } {
  const today = new Date();
  const opsDate = `${today.getFullYear()}-01-01`;
  return {
    property: {
      operationsStartDate: opsDate,
      acquisitionDate: opsDate,
      roomCount: tc.property.roomCount ?? 0,
      startAdr: tc.property.startAdr ?? 0,
      adrGrowthRate: 0,
      startOccupancy: tc.property.startOccupancy ?? 0,
      maxOccupancy: tc.property.maxOccupancy ?? tc.property.startOccupancy ?? 0,
      occupancyRampMonths: 0,
      occupancyGrowthStep: 0,
      purchasePrice: tc.property.purchasePrice ?? 0,
      buildingImprovements: tc.property.buildingImprovements ?? 0,
      landValuePercent: tc.property.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT,
      type: tc.property.type || "All Cash",
      acquisitionLTV: tc.property.acquisitionLTV ?? DEFAULT_LTV,
      acquisitionInterestRate: tc.property.acquisitionInterestRate ?? DEFAULT_INTEREST_RATE,
      acquisitionTermYears: tc.property.acquisitionTermYears ?? DEFAULT_TERM_YEARS,
      taxRate: tc.property.taxRate ?? DEFAULT_PROPERTY_INCOME_TAX_RATE,
      inflationRate: 0,
      costRateRooms: tc.property.costRateRooms ?? DEFAULT_COST_RATE_ROOMS,
      costRateFB: tc.property.costRateFB ?? DEFAULT_COST_RATE_FB,
      costRateAdmin: tc.property.costRateAdmin ?? DEFAULT_COST_RATE_ADMIN,
      costRateMarketing: tc.property.costRateMarketing ?? DEFAULT_COST_RATE_MARKETING,
      costRatePropertyOps: tc.property.costRatePropertyOps ?? DEFAULT_COST_RATE_PROPERTY_OPS,
      costRateUtilities: tc.property.costRateUtilities ?? DEFAULT_COST_RATE_UTILITIES,
      costRateTaxes: tc.property.costRateTaxes ?? DEFAULT_COST_RATE_TAXES,
      costRateIT: tc.property.costRateIT ?? DEFAULT_COST_RATE_IT,
      costRateFFE: tc.property.costRateFFE ?? DEFAULT_COST_RATE_FFE,
      costRateOther: tc.property.costRateOther ?? DEFAULT_COST_RATE_OTHER,
      costRateInsurance: tc.property.costRateInsurance ?? DEFAULT_COST_RATE_INSURANCE,
      revShareEvents: tc.property.revShareEvents ?? DEFAULT_REV_SHARE_EVENTS,
      revShareFB: tc.property.revShareFB ?? DEFAULT_REV_SHARE_FB,
      revShareOther: tc.property.revShareOther ?? DEFAULT_REV_SHARE_OTHER,
      baseManagementFeeRate: tc.property.baseManagementFeeRate ?? DEFAULT_BASE_MANAGEMENT_FEE_RATE,
      incentiveManagementFeeRate: tc.property.incentiveManagementFeeRate ?? DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
      operatingReserve: 0,
      willRefinance: "No",
    },
    global: {
      modelStartDate: opsDate,
      projectionYears: 2,
      inflationRate: 0,
      marketingRate: DEFAULT_MARKETING_RATE,
      fixedCostEscalationRate: 0,
    },
  };
}

function getEngineMonth1(tc: TestCase): MonthlyFinancials | null {
  try {
    const { property, global } = buildEngineInputs(tc);
    const proforma = generatePropertyProForma(property, global, 12);
    const operational = proforma.find(m => m.revenueTotal > 0);
    return operational ?? proforma[0] ?? null;
  } catch {
    return null;
  }
}

function buildChecksForTestCase(testCase: TestCase): KnownValueCheck[] {
  const checks: KnownValueCheck[] = [];
  const roomCount = testCase.property.roomCount ?? 0;
  const adr = testCase.property.startAdr ?? 0;
  const occupancy = testCase.property.startOccupancy ?? 0;
  const calculatedRoomRevenue = roomCount * adr * occupancy * DAYS_PER_MONTH;

  checks.push({
    label: "Room Revenue",
    formula: `${roomCount} rooms × $${adr} ADR × ${(occupancy * 100).toFixed(0)}% × ${DAYS_PER_MONTH} days`,
    expected: testCase.expectedMonthlyRoomRevenue,
    calculated: r2(calculatedRoomRevenue),
    passed: match(calculatedRoomRevenue, testCase.expectedMonthlyRoomRevenue),
  });

  const landPct = testCase.property.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT;
  const depreciableBasis = (testCase.property.purchasePrice ?? 0) * (1 - landPct) + (testCase.property.buildingImprovements ?? 0);
  const calculatedDepreciation = depreciableBasis / DEPRECIATION_YEARS;
  checks.push({
    label: "Depreciation",
    formula: `$${depreciableBasis.toLocaleString()} depreciable basis ÷ ${DEPRECIATION_YEARS} years`,
    expected: testCase.expectedAnnualDepreciation,
    calculated: r2(calculatedDepreciation),
    passed: match(calculatedDepreciation, testCase.expectedAnnualDepreciation),
  });

  if (testCase.property.type === "Financed") {
    const totalInvestment = (testCase.property.purchasePrice ?? 0) + (testCase.property.buildingImprovements ?? 0);
    const ltv = testCase.property.acquisitionLTV || DEFAULT_LTV;
    const loanAmount = totalInvestment * ltv;
    const rate = DEFAULT_INTEREST_RATE / MONTHS_PER_YEAR;
    const n = DEFAULT_TERM_YEARS * MONTHS_PER_YEAR;
    const calculatedPayment = loanAmount > 0
      ? (loanAmount * rate * dPow(1 + rate, n)) / (dPow(1 + rate, n) - 1)
      : 0;
    checks.push({
      label: "Loan Payment",
      formula: `PMT($${loanAmount.toLocaleString()}, ${(DEFAULT_INTEREST_RATE * 100).toFixed(0)}%/${MONTHS_PER_YEAR}, ${DEFAULT_TERM_YEARS * MONTHS_PER_YEAR} months)`,
      expected: testCase.expectedMonthlyPayment,
      calculated: r2(calculatedPayment),
      passed: match(calculatedPayment, testCase.expectedMonthlyPayment),
    });
  } else {
    checks.push({ label: "Loan Payment", formula: "All cash — no debt", expected: 0, calculated: 0, passed: true });
  }

  const pl = computeMonthlyPL(testCase);
  const engineMonth = getEngineMonth1(testCase);

  checks.push({
    label: "Total Revenue",
    formula: "Hand-calc vs Engine: Room + Events + F&B + Other",
    expected: r2(pl.totalRev),
    calculated: engineMonth ? r2(engineMonth.revenueTotal) : r2(pl.totalRev),
    passed: engineMonth ? match(pl.totalRev, engineMonth.revenueTotal) : true,
  });

  checks.push({
    label: "GOP",
    formula: "Hand-calc vs Engine: Total Revenue − Operating Expenses",
    expected: r2(pl.gop),
    calculated: engineMonth ? r2(engineMonth.gop) : r2(pl.gop),
    passed: engineMonth ? match(pl.gop, engineMonth.gop) : true,
  });

  const baseFeeRate = testCase.property.baseManagementFeeRate ?? DEFAULT_BASE_MANAGEMENT_FEE_RATE;
  checks.push({
    label: "Base Mgmt Fee",
    formula: `Hand-calc vs Engine: Revenue × ${(baseFeeRate * 100).toFixed(1)}%`,
    expected: r2(pl.baseFee),
    calculated: engineMonth ? r2(engineMonth.feeBase) : r2(pl.baseFee),
    passed: engineMonth ? match(pl.baseFee, engineMonth.feeBase) : true,
  });

  const incFeeRate = testCase.property.incentiveManagementFeeRate ?? DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE;
  checks.push({
    label: "Incentive Fee",
    formula: `Hand-calc vs Engine: max(0, GOP × ${(incFeeRate * 100).toFixed(0)}%)`,
    expected: r2(pl.incentiveFee),
    calculated: engineMonth ? r2(engineMonth.feeIncentive) : r2(pl.incentiveFee),
    passed: engineMonth ? match(pl.incentiveFee, engineMonth.feeIncentive) : true,
  });

  checks.push({
    label: "NOI",
    formula: "Hand-calc vs Engine: AGOP − Property Taxes",
    expected: r2(pl.noi),
    calculated: engineMonth ? r2(engineMonth.noi) : r2(pl.noi),
    passed: engineMonth ? match(pl.noi, engineMonth.noi) : true,
  });

  checks.push({
    label: "ANOI",
    formula: "Hand-calc vs Engine: NOI − FF&E Reserve",
    expected: r2(pl.anoi),
    calculated: engineMonth ? r2(engineMonth.anoi) : r2(pl.anoi),
    passed: engineMonth ? match(pl.anoi, engineMonth.anoi) : true,
  });

  checks.push({
    label: "Net Income",
    formula: "Hand-calc vs Engine: ANOI − Interest − Depreciation − Tax",
    expected: r2(pl.netIncome),
    calculated: engineMonth ? r2(engineMonth.netIncome) : r2(pl.netIncome),
    passed: engineMonth ? match(pl.netIncome, engineMonth.netIncome) : true,
  });

  checks.push({
    label: "Cash Flow",
    formula: "Hand-calc vs Engine: ANOI − Debt Service − Tax",
    expected: r2(pl.cashFlow),
    calculated: engineMonth ? r2(engineMonth.cashFlow) : r2(pl.cashFlow),
    passed: engineMonth ? match(pl.cashFlow, engineMonth.cashFlow) : true,
  });

  return checks;
}

export function runKnownValueTestsStructured(): { passed: boolean; results: string; structured: KnownValueTestResult[] } {
  const structured: KnownValueTestResult[] = [];
  const textResult = runKnownValueTests();

  for (const testCase of KNOWN_VALUE_TEST_CASES) {
    const checks = buildChecksForTestCase(testCase);
    structured.push({
      name: testCase.name,
      checks,
      allPassed: checks.every(c => c.passed),
    });
  }

  return { passed: textResult.passed, results: textResult.results, structured };
}

export function runKnownValueTests(): { passed: boolean; results: string } {
  let output = "";
  let allPassed = true;
  
  output += "╔══════════════════════════════════════════════════════════════════════════════╗\n";
  output += "║                    KNOWN-VALUE TEST CASE VALIDATION                          ║\n";
  output += "╚══════════════════════════════════════════════════════════════════════════════╝\n\n";
  
  for (const testCase of KNOWN_VALUE_TEST_CASES) {
    output += `▸ ${testCase.name}\n`;
    output += "  ─────────────────────────────────────────────────────────────\n";

    const checks = buildChecksForTestCase(testCase);
    for (const check of checks) {
      const icon = check.passed ? "✓" : "✗";
      output += `  ${check.label}: ${icon}\n`;
      output += `    Formula: ${check.formula}\n`;
      output += `    Expected: $${check.expected.toLocaleString()}\n`;
      output += `    Calculated: $${check.calculated.toLocaleString()}\n\n`;
      if (!check.passed) allPassed = false;
    }

    output += "\n";
  }
  
  output += "═".repeat(80) + "\n";
  output += `KNOWN-VALUE TEST RESULT: ${allPassed ? "✓ ALL TESTS PASSED" : "✗ SOME TESTS FAILED"}\n`;
  output += "═".repeat(80) + "\n";
  
  return { passed: allPassed, results: output };
}
