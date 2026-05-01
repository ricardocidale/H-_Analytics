import { describe, it, expect } from "vitest";
import { checkPropertyFormulas, checkMetricFormulas } from "../../client/src/lib/audits/formulaChecker";
import { crossValidateFinancingCalculators } from "../../client/src/lib/audits/crossCalculatorValidation";
import { runVerificationWithEngine } from "../../server/calculationChecker";
import { generatePropertyProForma } from "../../client/src/lib/financial/property-engine";
import { DEFAULT_PROPERTY_INFLATION_RATE } from "../../shared/constants";

const GLOBAL = {
  modelStartDate: "2026-01-01",
  projectionYears: 3,
  inflationRate: DEFAULT_PROPERTY_INFLATION_RATE,
  fixedCostEscalationRate: DEFAULT_PROPERTY_INFLATION_RATE,
};

const CASH_PROPERTY = {
  name: "Golden Test Hotel",
  type: "AllCash" as const,
  purchasePrice: 2_000_000,
  buildingImprovements: 500_000,
  landValuePercent: 0.2,
  operatingReserve: 100_000,
  acquisitionDate: "2026-01-01",
  operationsStartDate: "2026-01-01",
  roomCount: 15,
  startAdr: 250,
  startOccupancy: 0.6,
  maxOccupancy: 0.85,
  occupancyGrowthStep: 0.05,
  occupancyRampMonths: 6,
  adrGrowthRate: 0.03,
  taxRate: 0.25,
  costRateRooms: 0.2,
  costRateFB: 0.085,
  costRateAdmin: 0.08,
  costRateMarketing: 0.01,
  costRatePropertyOps: 0.04,
  costRateUtilities: 0.05,
  costRateTaxes: 0.03,
  costRateIT: 0.005,
  costRateFFE: 0.04,
  costRateOther: 0.05,
  revShareEvents: 0.3,
  revShareFB: 0.18,
  revShareOther: 0.05,
  baseManagementFeeRate: 0.08,
  incentiveManagementFeeRate: 0.1,
};

const FINANCED_PROPERTY = {
  ...CASH_PROPERTY,
  name: "Golden Financed Hotel",
  type: "Financed" as const,
  acquisitionLTV: 0.65,
  acquisitionInterestRate: 0.08,
  acquisitionTermYears: 25,
};

function generateMonthly(property: typeof CASH_PROPERTY | typeof FINANCED_PROPERTY) {
  return generatePropertyProForma(property, GLOBAL);
}

function aggregateYearly(monthlyData: ReturnType<typeof generatePropertyProForma>) {
  const years: Array<{
    year: number;
    revenueRooms: number;
    soldRooms: number;
    availableRooms: number;
    adr: number;
    occupancy: number;
    revpar: number;
    revenueTotal: number;
    expenseOperating: number;
    gop: number;
    feeBase: number;
    feeIncentive: number;
    agop: number;
    expenseTaxes: number;
    noi: number;
    expenseFFE: number;
    anoi: number;
    netIncome: number;
  }> = [];

  const projectionYears = Math.ceil(monthlyData.length / 12);
  for (let y = 0; y < projectionYears; y++) {
    const slice = monthlyData.slice(y * 12, (y + 1) * 12);
    const revenueRooms = slice.reduce((s, m) => s + m.revenueRooms, 0);
    const soldRooms = slice.reduce((s, m) => s + m.soldRooms, 0);
    const availableRooms = slice.reduce((s, m) => s + m.availableRooms, 0);
    const revenueTotal = slice.reduce((s, m) => s + m.revenueTotal, 0);
    const gop = slice.reduce((s, m) => s + m.gop, 0);
    const feeBase = slice.reduce((s, m) => s + m.feeBase, 0);
    const feeIncentive = slice.reduce((s, m) => s + m.feeIncentive, 0);
    const agop = slice.reduce((s, m) => s + m.agop, 0);
    const expenseTaxes = slice.reduce((s, m) => s + m.expenseTaxes, 0);
    const noi = slice.reduce((s, m) => s + m.noi, 0);
    const expenseFFE = slice.reduce((s, m) => s + m.expenseFFE, 0);
    const anoi = slice.reduce((s, m) => s + m.anoi, 0);
    const netIncome = slice.reduce((s, m) => s + m.netIncome, 0);

    const totalOpEx = slice.reduce((s, m) =>
      s + m.expenseRooms + m.expenseFB + m.expenseEvents + m.expenseOther +
      m.expenseMarketing + m.expensePropertyOps + m.expenseUtilitiesVar +
      m.expenseAdmin + m.expenseIT + m.expenseUtilitiesFixed + m.expenseInsurance + m.expenseOtherCosts, 0);

    years.push({
      year: y + 1,
      revenueRooms,
      soldRooms,
      availableRooms,
      adr: soldRooms > 0 ? revenueRooms / soldRooms : 0,
      occupancy: availableRooms > 0 ? (soldRooms / availableRooms) * 100 : 0,
      revpar: availableRooms > 0 ? revenueRooms / availableRooms : 0,
      revenueTotal,
      expenseOperating: totalOpEx,
      gop,
      feeBase,
      feeIncentive,
      agop,
      expenseTaxes,
      noi,
      expenseFFE,
      anoi,
      netIncome,
    });
  }

  return years;
}

describe("Auditor Double-Down: formulaChecker — yearly waterfall", () => {
  const monthly = generateMonthly(CASH_PROPERTY);
  const yearly = aggregateYearly(monthly);

  it("monthly formula checker passes all checks", () => {
    const report = checkPropertyFormulas(monthly);
    expect(report.failed).toBe(0);
    expect(report.totalChecks).toBeGreaterThan(0);
  });

  it("yearly metric formulas pass with real engine output", () => {
    const report = checkMetricFormulas(yearly);
    expect(report.failed).toBe(0);
    expect(report.totalChecks).toBeGreaterThan(0);
  });

  it("yearly waterfall checks fire for every year (7+ checks per year)", () => {
    const report = checkMetricFormulas(yearly);
    expect(report.totalChecks).toBeGreaterThanOrEqual(yearly.length * 7);
  });

  it("all yearly ADR/Occupancy/RevPAR formulas verified against raw inputs", () => {
    const report = checkMetricFormulas(yearly);
    const adrChecks = report.results.filter(r => r.name.includes("ADR Formula"));
    const occChecks = report.results.filter(r => r.name.includes("Occupancy Formula"));
    const revparChecks = report.results.filter(r => r.name.includes("RevPAR Formula"));
    expect(adrChecks.length).toBe(yearly.length);
    expect(occChecks.length).toBe(yearly.length);
    expect(revparChecks.length).toBe(yearly.length);
    for (const c of [...adrChecks, ...occChecks, ...revparChecks]) {
      expect(c.passed).toBe(true);
    }
  });

  it("all yearly USALI waterfall identities pass for every year", () => {
    const report = checkMetricFormulas(yearly);
    const waterfallNames = ["GOP Formula", "AGOP Formula", "NOI Formula", "ANOI Formula"];
    for (const name of waterfallNames) {
      const checks = report.results.filter(r => r.name.includes(name));
      expect(checks.length).toBeGreaterThanOrEqual(3);
      for (const c of checks) {
        expect(c.passed).toBe(true);
      }
    }
  });
});

describe("Auditor Double-Down: crossCalculatorValidation — management fees + FF&E + total expenses", () => {
  const monthly = generateMonthly(FINANCED_PROPERTY);

  it("base management fee check passes", () => {
    const report = crossValidateFinancingCalculators(FINANCED_PROPERTY, {}, monthly);
    const baseFeeCheck = report.results.find(r => r.name === "USALI: Base Management Fee");
    expect(baseFeeCheck).toBeDefined();
    expect(baseFeeCheck!.passed).toBe(true);
  });

  it("incentive management fee check passes", () => {
    const report = crossValidateFinancingCalculators(FINANCED_PROPERTY, {}, monthly);
    const incentiveCheck = report.results.find(r => r.name === "USALI: Incentive Management Fee");
    expect(incentiveCheck).toBeDefined();
    expect(incentiveCheck!.passed).toBe(true);
  });

  it("FF&E reserve accumulation check passes", () => {
    const report = crossValidateFinancingCalculators(FINANCED_PROPERTY, {}, monthly);
    const ffeCheck = report.results.find(r => r.name === "USALI: FF&E Reserve");
    expect(ffeCheck).toBeDefined();
    expect(ffeCheck!.passed).toBe(true);
  });

  it("total expenses identity check passes", () => {
    const report = crossValidateFinancingCalculators(FINANCED_PROPERTY, {}, monthly);
    const totalExpCheck = report.results.find(r => r.name === "USALI: Total Expenses Identity");
    expect(totalExpCheck).toBeDefined();
    expect(totalExpCheck!.passed).toBe(true);
  });

  it("cash-on-cash return is reported for projection years", () => {
    const report = crossValidateFinancingCalculators(FINANCED_PROPERTY, {}, monthly);
    const cocChecks = report.results.filter(r => r.name.includes("Cash-on-Cash Return"));
    expect(cocChecks.length).toBeGreaterThanOrEqual(1);
    for (const c of cocChecks) {
      expect(c.passed).toBe(true);
    }
  });

  it("all cross-validation checks pass — zero failures", () => {
    const report = crossValidateFinancingCalculators(FINANCED_PROPERTY, {}, monthly);
    expect(report.failed).toBe(0);
    expect(report.criticalIssues).toBe(0);
    expect(report.totalChecks).toBeGreaterThan(14);
  });
});

describe("Auditor Double-Down: crossValidation — cash property (no debt)", () => {
  const monthly = generateMonthly(CASH_PROPERTY);

  it("skips debt checks for cash property", () => {
    const report = crossValidateFinancingCalculators(CASH_PROPERTY, {}, monthly);
    const skipCheck = report.results.find(r => r.name === "Skip: Cash Purchase");
    expect(skipCheck).toBeDefined();
    expect(report.failed).toBe(0);
  });
});

describe("Auditor Double-Down: server checker — UNQUALIFIED opinion", () => {
  it("UNQUALIFIED for well-formed AllCash property (no client data)", () => {
    const report = runVerificationWithEngine(
      [CASH_PROPERTY],
      GLOBAL,
    );
    expect(report.summary.auditOpinion).toBe("UNQUALIFIED");
    expect(report.summary.criticalIssues).toBe(0);
    expect(report.summary.totalFailed).toBe(0);
  });

  it("UNQUALIFIED for well-formed Financed property (no client data)", () => {
    const report = runVerificationWithEngine(
      [FINANCED_PROPERTY],
      GLOBAL,
    );
    expect(report.summary.auditOpinion).toBe("UNQUALIFIED");
    expect(report.summary.criticalIssues).toBe(0);
  });

  it("total server checks exceed 15 for single property", () => {
    const report = runVerificationWithEngine(
      [CASH_PROPERTY],
      GLOBAL,
    );
    expect(report.summary.totalChecks).toBeGreaterThan(15);
  });

  it("server checker runs without clientResults parameter (consolidated Phase 6)", () => {
    const projYears = 6;
    const report = runVerificationWithEngine(
      [CASH_PROPERTY],
      { ...GLOBAL, projectionYears: projYears },
    );
    expect(report.summary.auditOpinion).toBe("UNQUALIFIED");
    expect(report.summary.totalChecks).toBeGreaterThan(10);
  });
});

describe("Auditor Double-Down: server checker — no cross-validation after Phase 6", () => {
  it("checker produces no Cross-Validation category checks (removed in Phase 6)", () => {
    const report = runVerificationWithEngine(
      [CASH_PROPERTY],
      GLOBAL,
    );

    const allChecks = [
      ...report.propertyResults.flatMap(p => p.checks),
      ...report.companyChecks,
      ...report.consolidatedChecks,
    ];
    const crossChecks = allChecks.filter(c => c.category === "Cross-Validation");
    expect(crossChecks).toHaveLength(0);
    expect(report.summary.auditOpinion).toBe("UNQUALIFIED");
  });
});

describe("Auditor Double-Down: formula checker — monthly identity pinning", () => {
  const monthly = generateMonthly(CASH_PROPERTY);

  it("all monthly formulas pass for 36 months", () => {
    const report = checkPropertyFormulas(monthly);
    expect(report.totalChecks).toBeGreaterThanOrEqual(monthly.length * 9);
    expect(report.failed).toBe(0);
  });

  it("USALI waterfall is verified at monthly granularity", () => {
    const report = checkPropertyFormulas(monthly);
    const waterfallChecks = report.results.filter(r =>
      r.name.includes("GOP Formula") ||
      r.name.includes("AGOP Formula") ||
      r.name.includes("NOI Formula") ||
      r.name.includes("ANOI Formula"),
    );
    expect(waterfallChecks.length).toBe(monthly.length * 4);
    for (const c of waterfallChecks) {
      expect(c.passed).toBe(true);
    }
  });
});

describe("Auditor Double-Down: negative test — auditor detects intentional errors", () => {
  it("cross-validator detects revenue identity violation", () => {
    const monthly = generateMonthly(FINANCED_PROPERTY);
    const corrupted = monthly.map((m, i) => {
      if (i === 5) return { ...m, revenueTotal: m.revenueTotal + 99999 };
      return m;
    });
    const report = crossValidateFinancingCalculators(FINANCED_PROPERTY, {}, corrupted);
    const revCheck = report.results.find(r => r.name === "USALI: Revenue Identity");
    expect(revCheck).toBeDefined();
    expect(revCheck!.passed).toBe(false);
  });

  it("cross-validator detects GOP identity violation", () => {
    const monthly = generateMonthly(FINANCED_PROPERTY);
    const corrupted = monthly.map((m, i) => {
      if (i === 3) return { ...m, gop: m.gop + 50000 };
      return m;
    });
    const report = crossValidateFinancingCalculators(FINANCED_PROPERTY, {}, corrupted);
    const gopCheck = report.results.find(r => r.name === "USALI: GOP Identity");
    expect(gopCheck).toBeDefined();
    expect(gopCheck!.passed).toBe(false);
  });

  it("formula checker detects net income violation", () => {
    const monthly = generateMonthly(CASH_PROPERTY);
    const corrupted = monthly.map((m, i) => {
      if (i === 10) return { ...m, netIncome: m.netIncome + 25000 };
      return m;
    });
    const report = checkPropertyFormulas(corrupted);
    expect(report.failed).toBeGreaterThan(0);
    const niCheck = report.results.find(r => !r.passed && r.name.includes("Net Income"));
    expect(niCheck).toBeDefined();
  });
});
