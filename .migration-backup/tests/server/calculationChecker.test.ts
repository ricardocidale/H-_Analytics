import { describe, it, expect } from "vitest";
import { DEPRECIATION_YEARS } from "../../shared/constants.js";
import { runVerificationWithEngine } from "../../server/calculationChecker.js";
import type { VerificationReport } from "../../server/calculationChecker.js";

function makeGlobal(overrides: Record<string, any> = {}) {
  return {
    modelStartDate: "2026-01-01",
    projectionYears: 2,
    inflationRate: 0.02,
    fixedCostEscalationRate: 0.02,
    ...overrides,
  };
}

function makeProperty(overrides: Record<string, any> = {}) {
  return {
    name: "Test Hotel",
    type: "AllCash",
    purchasePrice: 1_000_000,
    buildingImprovements: 0,
    roomCount: 10,
    startAdr: 200,
    startOccupancy: 0.50,
    maxOccupancy: 0.70,
    occupancyGrowthStep: 0.05,
    occupancyRampMonths: 12,
    adrGrowthRate: 0.02,
    operationsStartDate: "2026-01-01",
    acquisitionDate: "2026-01-01",
    operatingReserve: 0,
    taxRate: 0.25,
    ...overrides,
  };
}

describe("calculationChecker — Full Equity property", () => {
  it("produces UNQUALIFIED opinion with zero failures for a well-formed AllCash property", () => {
    const report = runVerificationWithEngine(
      [makeProperty()],
      makeGlobal(),
    );

    expect(report.summary.auditOpinion).toBe("UNQUALIFIED");
    expect(report.summary.overallStatus).toBe("PASS");
    expect(report.summary.totalFailed).toBe(0);
    expect(report.summary.criticalIssues).toBe(0);
    expect(report.summary.materialIssues).toBe(0);
    expect(report.summary.totalChecks).toBeGreaterThan(0);
    expect(report.propertiesChecked).toBe(1);
    expect(report.propertyResults).toHaveLength(1);
    expect(report.propertyResults[0].propertyName).toBe("Test Hotel");
  });

  it("verifies GOP and NOI identity checks pass", () => {
    const report = runVerificationWithEngine(
      [makeProperty()],
      makeGlobal(),
    );
    const checks = report.propertyResults[0].checks;

    const gopCheck = checks.find(c => c.metric === "GOP = Revenue - OpEx");
    expect(gopCheck).toBeDefined();
    expect(gopCheck!.passed).toBe(true);

    const agopCheck = checks.find(c => c.metric === "AGOP = GOP - Management Fees");
    expect(agopCheck).toBeDefined();
    expect(agopCheck!.passed).toBe(true);

    const noiCheck = checks.find(c => c.metric === "NOI = AGOP - Taxes");
    expect(noiCheck).toBeDefined();
    expect(noiCheck!.passed).toBe(true);

    const anoiCheck = checks.find(c => c.metric === "ANOI = NOI - FF&E Reserve");
    expect(anoiCheck).toBeDefined();
    expect(anoiCheck!.passed).toBe(true);
  });

  it("verifies Cumulative Cash Flow = Ending Cash", () => {
    const report = runVerificationWithEngine(
      [makeProperty()],
      makeGlobal(),
    );
    const cashCheck = report.propertyResults[0].checks.find(
      c => c.metric === "Cumulative Cash Flow = Ending Cash",
    );
    expect(cashCheck).toBeDefined();
    expect(cashCheck!.passed).toBe(true);
  });

  it("has no debt-related checks for AllCash property", () => {
    const report = runVerificationWithEngine(
      [makeProperty()],
      makeGlobal(),
    );
    const debtChecks = report.propertyResults[0].checks.filter(
      c => c.category === "Debt",
    );
    expect(debtChecks).toHaveLength(0);
  });
});

describe("calculationChecker — Financed property", () => {
  const financedProp = makeProperty({
    type: "Financed",
    acquisitionLTV: 0.75,
    acquisitionInterestRate: 0.09,
    acquisitionTermYears: 25,
  });

  it("produces UNQUALIFIED opinion for a well-formed Financed property", () => {
    const report = runVerificationWithEngine(
      [financedProp],
      makeGlobal(),
    );

    expect(report.summary.auditOpinion).toBe("UNQUALIFIED");
    expect(report.summary.overallStatus).toBe("PASS");
    expect(report.summary.totalFailed).toBe(0);
  });

  it("includes debt-related checks", () => {
    const report = runVerificationWithEngine(
      [financedProp],
      makeGlobal(),
    );
    const debtChecks = report.propertyResults[0].checks.filter(
      c => c.category === "Debt",
    );
    expect(debtChecks.length).toBeGreaterThanOrEqual(2);

    const splitCheck = debtChecks.find(c => c.metric === "Interest + Principal = Debt Payment");
    expect(splitCheck).toBeDefined();
    expect(splitCheck!.passed).toBe(true);

    const rollForwardCheck = debtChecks.find(c => c.metric === "Debt Roll-Forward Consistency");
    expect(rollForwardCheck).toBeDefined();
    expect(rollForwardCheck!.passed).toBe(true);
  });

  it("DSCR check is present for financed property", () => {
    const report = runVerificationWithEngine(
      [financedProp],
      makeGlobal(),
    );
    const dscrCheck = report.propertyResults[0].checks.find(
      c => c.metric.includes("DSCR Reasonableness"),
    );
    expect(dscrCheck).toBeDefined();
  });
});

describe("calculationChecker — audit opinion logic", () => {
  it("returns UNQUALIFIED when no clientResults cross-validation is needed", () => {
    const prop = makeProperty();
    const global = makeGlobal();
    const report = runVerificationWithEngine([prop], global);

    expect(report.summary.auditOpinion).toBe("UNQUALIFIED");
    expect(report.summary.overallStatus).toBe("PASS");
  });

  it("returns QUALIFIED when only material issues exist", () => {
    const prop = makeProperty({
      adrGrowthRate: 0,
      occupancyGrowthStep: 0,
      maxOccupancy: 0.50,
    });
    const global = makeGlobal({ projectionYears: 2 });

    const report = runVerificationWithEngine([prop], global);
    const materialChecks = report.propertyResults[0].checks.filter(
      c => !c.passed && c.severity === "material",
    );

    if (materialChecks.length > 0 && report.summary.criticalIssues === 0) {
      expect(report.summary.auditOpinion).toBe("QUALIFIED");
      expect(report.summary.overallStatus).toBe("WARNING");
    }
  });
});

describe("calculationChecker — pre-operations gating", () => {
  it("reports zero revenue before operations start date", () => {
    const prop = makeProperty({
      operationsStartDate: "2026-07-01",
    });
    const global = makeGlobal({ projectionYears: 1 });

    const report = runVerificationWithEngine([prop], global);
    const preOpCheck = report.propertyResults[0].checks.find(
      c => c.metric === "Pre-Operations Revenue = $0",
    );
    expect(preOpCheck).toBeDefined();
    expect(preOpCheck!.passed).toBe(true);
    expect(preOpCheck!.actual).toBe(0);
  });
});

describe("calculationChecker — multi-property consolidated", () => {
  it("runs consolidated checks for 2+ properties", () => {
    const prop1 = makeProperty({ name: "Hotel A" });
    const prop2 = makeProperty({ name: "Hotel B", purchasePrice: 2_000_000, roomCount: 20 });
    const global = makeGlobal();

    const report = runVerificationWithEngine([prop1, prop2], global);
    expect(report.propertiesChecked).toBe(2);
    expect(report.consolidatedChecks.length).toBeGreaterThan(0);

    const aggregationCheck = report.consolidatedChecks.find(
      c => c.metric === "Portfolio Room Revenue Aggregation",
    );
    expect(aggregationCheck).toBeDefined();
    expect(aggregationCheck!.passed).toBe(true);
  });
});

describe("calculationChecker — company checks", () => {
  it("verifies fee zero-sum check passes", () => {
    const report = runVerificationWithEngine(
      [makeProperty()],
      makeGlobal(),
    );
    const feeZeroSum = report.companyChecks.find(
      c => c.metric === "Fee Zero-Sum (Intercompany Elimination)",
    );
    expect(feeZeroSum).toBeDefined();
    expect(feeZeroSum!.passed).toBe(true);
  });
});

describe("calculationChecker — new invariant checks", () => {
  it("no-NaN sweep passes for well-formed property", () => {
    const report = runVerificationWithEngine(
      [makeProperty()],
      makeGlobal(),
    );
    const nanCheck = report.propertyResults[0].checks.find(
      c => c.metric === "No NaN in Financial Fields",
    );
    expect(nanCheck).toBeDefined();
    expect(nanCheck!.passed).toBe(true);
  });

  it("debt roll-forward passes for financed property", () => {
    const financedProp = makeProperty({
      type: "Financed",
      acquisitionLTV: 0.65,
      acquisitionInterestRate: 0.08,
      acquisitionTermYears: 25,
    });
    const report = runVerificationWithEngine(
      [financedProp],
      makeGlobal(),
    );
    const rollForward = report.propertyResults[0].checks.find(
      c => c.metric === "Debt Roll-Forward Consistency",
    );
    expect(rollForward).toBeDefined();
    expect(rollForward!.passed).toBe(true);
  });
});

describe("calculationChecker — calc/validation adapter integration", () => {
  it("financial identity checks run via calc/validation/financial-identities adapter", () => {
    const report = runVerificationWithEngine(
      [makeProperty()],
      makeGlobal(),
    );
    const allChecks = report.propertyResults[0].checks;
    const identityChecks = allChecks.filter(c => c.category === "Financial Identity");
    expect(identityChecks.length).toBeGreaterThanOrEqual(2);
    for (const ic of identityChecks) {
      expect(ic.passed).toBe(true);
    }
  });

  it("funding gate checks run via calc/validation/funding-gates adapter", () => {
    const report = runVerificationWithEngine(
      [makeProperty()],
      makeGlobal(),
    );
    const allChecks = report.propertyResults[0].checks;
    const gateChecks = allChecks.filter(c => c.category === "Funding Gate");
    expect(gateChecks.length).toBeGreaterThanOrEqual(1);
    for (const gc of gateChecks) {
      expect(gc.passed).toBe(true);
    }
  });

  it("financed property includes debt-free-at-exit gate", () => {
    const financedProp = makeProperty({
      type: "Financed",
      acquisitionLTV: 0.65,
      acquisitionInterestRate: 0.08,
      acquisitionTermYears: 25,
    });
    const report = runVerificationWithEngine(
      [financedProp],
      makeGlobal(),
    );
    const allChecks = report.propertyResults[0].checks;
    const debtFreeGate = allChecks.find(
      c => c.category === "Funding Gate" && c.metric === "Debt-Free at Exit"
    );
    expect(debtFreeGate).toBeDefined();
  });
});

describe("calculationChecker — removed duplicated checks", () => {
  it("does NOT contain duplicated formula-recomputation checks", () => {
    const report = runVerificationWithEngine(
      [makeProperty()],
      makeGlobal(),
    );
    const allChecks = [
      ...report.propertyResults.flatMap(p => p.checks),
      ...report.companyChecks,
      ...report.consolidatedChecks,
    ];

    const removedMetrics = [
      "Room Revenue (First Operational Month)",
      "Annual Depreciation (Land Excluded)",
      "Base Fee Applied at Stated Rate",
      "Incentive Fee Applied at Stated Rate",
      "Working Capital AR (First Operational Month)",
      "Working Capital AP (First Operational Month)",
      "NOL Carryforward Balance (End of Projection)",
    ];
    for (const metric of removedMetrics) {
      expect(allChecks.find(c => c.metric === metric)).toBeUndefined();
    }
  });

  it("does NOT contain cross-validation checks", () => {
    const report = runVerificationWithEngine(
      [makeProperty()],
      makeGlobal(),
    );
    const allChecks = [
      ...report.propertyResults.flatMap(p => p.checks),
      ...report.companyChecks,
      ...report.consolidatedChecks,
    ];

    const crossValChecks = allChecks.filter(c =>
      c.metric.includes("Server vs Client Engine") || c.category === "Cross-Validation"
    );
    expect(crossValChecks).toHaveLength(0);
  });
});

describe("calculationChecker — schedule reconcile adapter", () => {
  it("financed property includes schedule reconciliation check", () => {
    const financedProp = makeProperty({
      type: "Financed",
      acquisitionLTV: 0.65,
      acquisitionInterestRate: 0.065,
      acquisitionTermYears: 25,
    });
    const report = runVerificationWithEngine(
      [financedProp],
      makeGlobal(),
    );
    const allChecks = report.propertyResults[0].checks;
    const scheduleCheck = allChecks.find(
      c => c.category === "Debt" && c.metric === "Amortization Schedule Reconciliation"
    );
    expect(scheduleCheck).toBeDefined();
  });

  it("all-cash property does NOT include schedule reconciliation", () => {
    const cashProp = makeProperty({ type: "Cash" });
    const report = runVerificationWithEngine(
      [cashProp],
      makeGlobal(),
    );
    const allChecks = report.propertyResults[0].checks;
    const scheduleCheck = allChecks.find(
      c => c.category === "Debt" && c.metric === "Amortization Schedule Reconciliation"
    );
    expect(scheduleCheck).toBeUndefined();
  });
});

describe("calculationChecker — boundary enforcement", () => {
  it("checker modules do NOT import from @engine/ or client engine", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const checkerDir = path.resolve("server/calculation-checker");

    function readAllTsFiles(dir: string): string[] {
      const contents: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          contents.push(...readAllTsFiles(fullPath));
        } else if (entry.name.endsWith(".ts")) {
          contents.push(fs.readFileSync(fullPath, "utf-8"));
        }
      }
      return contents;
    }

    const allFiles = readAllTsFiles(checkerDir);
    for (const content of allFiles) {
      expect(content).not.toMatch(/@engine\//);
      expect(content).not.toMatch(/from ["'].*client.*engine/);
      expect(content).not.toMatch(/from ["'].*property-engine/);
    }
  });
});
