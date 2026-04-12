import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine.js";
import {
  checkGAAPCompliance,
  checkCashFlowStatement,
  generateComplianceReport,
  type ComplianceReport,
  type ComplianceCheckResult,
} from "@/lib/audits/gaapComplianceChecker";
import { DEPRECIATION_YEARS, DAYS_PER_MONTH } from "@shared/constants";
import { baseProperty, makeProperty, makeGlobal } from "../fixtures";

/**
 * Comprehensive tests for the GAAP Compliance Checker module.
 *
 * Tests all three exported functions:
 *   - checkGAAPCompliance()
 *   - checkCashFlowStatement()
 *   - generateComplianceReport()
 *
 * Uses generatePropertyProForma() to produce realistic financial data
 * rather than hand-crafted mocks, ensuring integration-level correctness.
 *
 * Covers:
 *   - ASC 230 (Cash Flows): Operating CF, interest/principal classification
 *   - ASC 360 (PP&E): Depreciation calculation and timing
 *   - ASC 470 (Debt): Principal never in net income, interest/principal split
 *   - ASC 606 (Revenue): No revenue before operations start
 *   - Balance sheet equation: A = L + E
 *   - Full Equity and Financed property scenarios
 *   - Report generation structure and content
 */

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const fullEquityProperty = baseProperty;

const financedProperty = makeProperty({
  type: "Financed" as any,
  acquisitionLTV: 0.75,
  acquisitionInterestRate: 0.09,
  acquisitionTermYears: 25,
} as any);

const baseGlobal = makeGlobal({ projectionYears: 1 });

// ===========================================================================
// 1. checkGAAPCompliance — Full Equity property (no debt)
// ===========================================================================
describe("checkGAAPCompliance — Full Equity property", () => {
  const monthlyData = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
  const report = checkGAAPCompliance(monthlyData);

  it("returns a valid ComplianceReport structure", () => {
    expect(report).toHaveProperty("timestamp");
    expect(report.timestamp).toBeInstanceOf(Date);
    expect(report).toHaveProperty("totalChecks");
    expect(report).toHaveProperty("passed");
    expect(report).toHaveProperty("failed");
    expect(report).toHaveProperty("criticalIssues");
    expect(report).toHaveProperty("warnings");
    expect(report).toHaveProperty("results");
    expect(Array.isArray(report.results)).toBe(true);
  });

  it("totalChecks = passed + failed", () => {
    expect(report.totalChecks).toBe(report.passed + report.failed);
  });

  it("all checks pass for a healthy Full Equity property", () => {
    expect(report.failed).toBe(0);
    expect(report.criticalIssues).toBe(0);
    expect(report.warnings).toBe(0);
  });

  it("produces checks across all 7 categories", () => {
    const categories = new Set(report.results.map((r) => r.category));
    expect(categories.has("ASC 470 - Debt")).toBe(true);
    expect(categories.has("ASC 230 - Cash Flows")).toBe(true);
    expect(categories.has("ASC 360 - Property")).toBe(true);
    expect(categories.has("ASC 606 - Revenue")).toBe(true);
    expect(categories.has("Matching Principle")).toBe(true);
    expect(categories.has("ASC 606 - Fees")).toBe(true);
    expect(categories.has("USALI Standard")).toBe(true);
    expect(categories.has("Industry Practice")).toBe(true);
  });

  it("each result has the required fields", () => {
    for (const r of report.results) {
      expect(typeof r.passed).toBe("boolean");
      expect(typeof r.category).toBe("string");
      expect(typeof r.rule).toBe("string");
      expect(typeof r.description).toBe("string");
      expect(["critical", "warning", "info"]).toContain(r.severity);
    }
  });

  // ASC 470 — Net Income computed without principal for Full Equity
  it("ASC 470: Net Income = ANOI - Interest - Depreciation - Tax (every month)", () => {
    for (const m of monthlyData) {
      const expected = m.anoi - m.interestExpense - m.depreciationExpense - m.incomeTax;
      expect(m.netIncome).toBeCloseTo(expected, 2);
    }
    const asc470Checks = report.results.filter(
      (r) => r.category === "ASC 470 - Debt" && r.rule === "Interest/Principal Separation"
    );
    expect(asc470Checks.length).toBe(12);
    for (const c of asc470Checks) {
      expect(c.passed).toBe(true);
    }
  });

  // ASC 230 — Cash Flow = ANOI - Debt Service - Tax
  it("ASC 230: Cash Flow = ANOI - Debt Service - Tax (every month)", () => {
    for (const m of monthlyData) {
      const expected = m.anoi - m.debtPayment - m.incomeTax;
      expect(m.cashFlow).toBeCloseTo(expected, 2);
    }
    const asc230Checks = report.results.filter(
      (r) => r.category === "ASC 230 - Cash Flows" && r.rule === "Debt Service & Tax in Cash Flow"
    );
    expect(asc230Checks.length).toBe(12);
    for (const c of asc230Checks) {
      expect(c.passed).toBe(true);
    }
  });

  // ASC 606 — Revenue recognized at point of service
  it("ASC 606: Room revenue = ADR x soldRooms (every month)", () => {
    const revenueChecks = report.results.filter(
      (r) => r.category === "ASC 606 - Revenue" && r.rule === "Point-in-Time Recognition"
    );
    expect(revenueChecks.length).toBe(12);
    for (const c of revenueChecks) {
      expect(c.passed).toBe(true);
    }
  });

  it("ASC 606 Fees: Base management fee rate within industry norms", () => {
    const feeChecks = report.results.filter(
      (r) => r.category === "ASC 606 - Fees" && r.rule === "Management Fee Rate"
    );
    expect(feeChecks.length).toBeGreaterThan(0);
    for (const c of feeChecks) {
      expect(c.passed).toBe(true);
    }
  });

  it("ASC 606 Fees: Incentive fee rate within industry norms", () => {
    const incentiveChecks = report.results.filter(
      (r) => r.category === "ASC 606 - Fees" && (r.rule === "Incentive Fee Rate" || r.rule === "Incentive Fee on Negative GOP")
    );
    expect(incentiveChecks.length).toBeGreaterThan(0);
    for (const c of incentiveChecks) {
      expect(c.passed).toBe(true);
    }
  });

  // USALI — NOI before debt service
  it("USALI: NOI calculated before debt service", () => {
    const usaliChecks = report.results.filter(
      (r) => r.category === "USALI Standard" && r.rule === "NOI Definition"
    );
    expect(usaliChecks.length).toBe(12);
    for (const c of usaliChecks) {
      expect(c.passed).toBe(true);
    }
  });

  it("Industry Practice: FF&E Reserve rate within industry norms", () => {
    const ffeChecks = report.results.filter(
      (r) => r.category === "Industry Practice" && (r.rule === "FF&E Reserve Rate" || r.rule === "FF&E Reserve")
    );
    expect(ffeChecks.length).toBeGreaterThan(0);
    for (const c of ffeChecks) {
      expect(c.passed).toBe(true);
    }
  });

  it("Matching Principle: Expenses matched to revenue period", () => {
    const matchingChecks = report.results.filter(
      (r) => r.category === "Matching Principle" && r.rule === "Expense Recognition"
    );
    expect(matchingChecks.length).toBeGreaterThan(0);
    for (const c of matchingChecks) {
      expect(c.passed).toBe(true);
    }
  });

  it("ASC 360: Straight-line depreciation consistency verified", () => {
    const depChecks = report.results.filter(
      (r) => r.category === "ASC 360 - Property" && (r.rule === "Straight-Line Consistency" || r.rule === "Depreciation Present")
    );
    expect(depChecks.length).toBe(1);
    expect(depChecks[0].passed).toBe(true);
  });
});

// ===========================================================================
// 2. checkGAAPCompliance — Financed property (with debt)
// ===========================================================================
describe("checkGAAPCompliance — Financed property", () => {
  const monthlyData = generatePropertyProForma(financedProperty, baseGlobal, 12);
  const report = checkGAAPCompliance(monthlyData);

  it("all checks pass for a healthy Financed property", () => {
    expect(report.criticalIssues).toBe(0);
    expect(report.warnings).toBe(0);
    expect(report.failed).toBe(0);
  });

  it("ASC 470: Net Income excludes principal (includes interest only)", () => {
    for (const m of monthlyData) {
      // Net Income = ANOI - InterestExpense - Depreciation - Tax
      const expected = m.anoi - m.interestExpense - m.depreciationExpense - m.incomeTax;
      expect(m.netIncome).toBeCloseTo(expected, 2);
      // Principal is NOT subtracted from net income
      expect(m.principalPayment).toBeGreaterThan(0);
    }
    const asc470Checks = report.results.filter(
      (r) => r.category === "ASC 470 - Debt" && r.rule === "Interest/Principal Separation"
    );
    for (const c of asc470Checks) {
      expect(c.passed).toBe(true);
    }
  });

  it("ASC 230: Cash Flow correctly includes full debt service (interest + principal)", () => {
    for (const m of monthlyData) {
      const expected = m.anoi - m.debtPayment - m.incomeTax;
      expect(m.cashFlow).toBeCloseTo(expected, 2);
    }
    const cfChecks = report.results.filter(
      (r) => r.category === "ASC 230 - Cash Flows" && r.rule === "Debt Service & Tax in Cash Flow"
    );
    for (const c of cfChecks) {
      expect(c.passed).toBe(true);
    }
  });

  it("interest + principal = PMT every month", () => {
    for (const m of monthlyData) {
      expect(m.interestExpense + m.principalPayment).toBeCloseTo(m.debtPayment, 2);
    }
  });

  it("interest is classified as operating (reduces net income)", () => {
    for (const m of monthlyData) {
      expect(m.interestExpense).toBeGreaterThan(0);
      // interestExpense is subtracted in net income calculation
      expect(m.netIncome).toBeLessThan(m.anoi);
    }
  });

  it("principal is classified as financing (financingCashFlow = -principal)", () => {
    for (const m of monthlyData) {
      expect(m.financingCashFlow).toBeCloseTo(-m.principalPayment, 2);
    }
  });
});

// ===========================================================================
// 3. checkCashFlowStatement — Full Equity property
// ===========================================================================
describe("checkCashFlowStatement — Full Equity property", () => {
  const monthlyData = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
  const report = checkCashFlowStatement(monthlyData);

  it("returns a valid ComplianceReport structure", () => {
    expect(report).toHaveProperty("timestamp");
    expect(report.timestamp).toBeInstanceOf(Date);
    expect(report).toHaveProperty("totalChecks");
    expect(report).toHaveProperty("passed");
    expect(report).toHaveProperty("failed");
    expect(report).toHaveProperty("criticalIssues");
    expect(report).toHaveProperty("warnings");
    expect(report).toHaveProperty("results");
  });

  it("totalChecks = passed + failed", () => {
    expect(report.totalChecks).toBe(report.passed + report.failed);
  });

  it("all checks pass", () => {
    expect(report.failed).toBe(0);
    expect(report.criticalIssues).toBe(0);
    expect(report.warnings).toBe(0);
  });

  it("contains operating cash flow reconciliation checks (indirect method)", () => {
    const reconciliationChecks = report.results.filter(
      (r) => r.category === "ASC 230 - Operating" && r.rule === "Indirect Method Reconciliation"
    );
    expect(reconciliationChecks.length).toBe(12);
    for (const c of reconciliationChecks) {
      expect(c.passed).toBe(true);
    }
  });

  it("Full Equity produces no financing activity checks (no principal payments)", () => {
    const financingChecks = report.results.filter(
      (r) => r.category === "ASC 230 - Financing" && r.rule === "Principal Classification"
    );
    expect(financingChecks.length).toBe(0);
  });

  it("Full Equity produces no interest classification checks (no interest)", () => {
    const interestChecks = report.results.filter(
      (r) => r.category === "ASC 230 - Operating" && r.rule === "Interest Classification"
    );
    expect(interestChecks.length).toBe(0);
  });
});

// ===========================================================================
// 4. checkCashFlowStatement — Financed property
// ===========================================================================
describe("checkCashFlowStatement — Financed property", () => {
  const monthlyData = generatePropertyProForma(financedProperty, baseGlobal, 12);
  const report = checkCashFlowStatement(monthlyData);

  it("all checks pass", () => {
    expect(report.failed).toBe(0);
    expect(report.criticalIssues).toBe(0);
  });

  it("principal classified as financing activity (ASC 230)", () => {
    const financingChecks = report.results.filter(
      (r) => r.category === "ASC 230 - Financing" && r.rule === "Principal Classification"
    );
    // Financed property has principal > 0 every month
    expect(financingChecks.length).toBe(12);
    for (const c of financingChecks) {
      expect(c.passed).toBe(true);
      expect(c.severity).toBe("critical");
    }
  });

  it("interest classified as operating activity (ASC 230)", () => {
    const interestChecks = report.results.filter(
      (r) => r.category === "ASC 230 - Operating" && r.rule === "Interest Classification"
    );
    expect(interestChecks.length).toBe(12);
    for (const c of interestChecks) {
      expect(c.passed).toBe(true);
      expect(c.severity).toBe("critical");
    }
  });

  it("indirect method reconciliation checks present for every month", () => {
    const reconciliationChecks = report.results.filter(
      (r) => r.rule === "Indirect Method Reconciliation"
    );
    expect(reconciliationChecks.length).toBe(12);
    for (const c of reconciliationChecks) {
      expect(c.passed).toBe(true);
    }
  });
});

// ===========================================================================
// 5. ASC 230 — Operating CF = Net Income + Depreciation
// ===========================================================================
describe("ASC 230 — Operating Cash Flow indirect method", () => {
  it("Full Equity: operatingCashFlow = netIncome + depreciation every month", () => {
    const data = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
    for (const m of data) {
      expect(m.operatingCashFlow).toBeCloseTo(m.netIncome + m.depreciationExpense, 2);
    }
  });

  it("Financed: operatingCashFlow = netIncome + depreciation every month", () => {
    const data = generatePropertyProForma(financedProperty, baseGlobal, 12);
    for (const m of data) {
      expect(m.operatingCashFlow).toBeCloseTo(m.netIncome + m.depreciationExpense, 2);
    }
  });

  it("interest is included in operating section (deducted via net income)", () => {
    const data = generatePropertyProForma(financedProperty, baseGlobal, 12);
    for (const m of data) {
      // operatingCashFlow = netIncome + depreciation
      // netIncome = ANOI - interest - depreciation - tax
      // So operatingCashFlow = ANOI - interest - tax
      const expected = m.anoi - m.interestExpense - m.incomeTax;
      expect(m.operatingCashFlow).toBeCloseTo(expected, 2);
    }
  });

  it("principal payments are NOT in operating cash flow", () => {
    const data = generatePropertyProForma(financedProperty, baseGlobal, 12);
    for (const m of data) {
      // operatingCashFlow does not subtract principal
      // Verify: OCF + financingCF = cashFlow
      expect(m.operatingCashFlow + m.financingCashFlow).toBeCloseTo(m.cashFlow, 2);
    }
  });
});

// ===========================================================================
// 6. ASC 360 — Depreciation
// ===========================================================================
describe("ASC 360 — Depreciation (PP&E)", () => {
  it("monthly depreciation = buildingValue / DEPRECIATION_YEARS / 12", () => {
    const data = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
    const landPct = fullEquityProperty.landValuePercent;
    const buildingValue = fullEquityProperty.purchasePrice * (1 - landPct);
    const expectedMonthly = buildingValue / DEPRECIATION_YEARS / 12;
    for (const m of data) {
      expect(m.depreciationExpense).toBeCloseTo(expectedMonthly, 2);
    }
  });

  it("depreciation includes building improvements in basis", () => {
    const propWithImprovements = {
      ...fullEquityProperty,
      buildingImprovements: 200_000,
    };
    const data = generatePropertyProForma(propWithImprovements, baseGlobal, 12);
    const landPct = propWithImprovements.landValuePercent;
    const buildingValue =
      propWithImprovements.purchasePrice * (1 - landPct) + propWithImprovements.buildingImprovements;
    const expectedMonthly = buildingValue / DEPRECIATION_YEARS / 12;
    expect(data[0].depreciationExpense).toBeCloseTo(expectedMonthly, 2);
  });

  it("depreciation only after acquisition date", () => {
    const lateProp = {
      ...fullEquityProperty,
      acquisitionDate: "2026-07-01", // 3 months after model start
    };
    const data = generatePropertyProForma(lateProp, baseGlobal, 12);
    // Months 0-2 are before acquisition => no depreciation
    for (let i = 0; i < 3; i++) {
      expect(data[i].depreciationExpense).toBe(0);
    }
    // From month 3 onward => depreciation active
    for (let i = 3; i < 12; i++) {
      expect(data[i].depreciationExpense).toBeGreaterThan(0);
    }
  });

  it("depreciation is zero when purchase price is zero", () => {
    const zeroProp = { ...fullEquityProperty, purchasePrice: 0 };
    const data = generatePropertyProForma(zeroProp, baseGlobal, 12);
    for (const m of data) {
      expect(m.depreciationExpense).toBe(0);
    }
  });

  it("39 years is IRS-mandated for nonresidential real property (hotels)", () => {
    expect(DEPRECIATION_YEARS).toBe(39);
    // Verify the engine uses this value
    const data = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
    const basis = fullEquityProperty.purchasePrice * (1 - fullEquityProperty.landValuePercent);
    const annual = basis / DEPRECIATION_YEARS;
    const monthly = annual / 12;
    expect(data[0].depreciationExpense).toBeCloseTo(monthly, 2);
  });
});

// ===========================================================================
// 7. ASC 470 — Debt classification
// ===========================================================================
describe("ASC 470 — Debt classification", () => {
  it("principal never appears in net income for financed property", () => {
    const data = generatePropertyProForma(financedProperty, baseGlobal, 12);
    for (const m of data) {
      // Verify net income = ANOI - interest - depreciation - tax (no principal)
      const expected = m.anoi - m.interestExpense - m.depreciationExpense - m.incomeTax;
      expect(m.netIncome).toBeCloseTo(expected, 2);
      // Confirm principal > 0 so the test is meaningful
      expect(m.principalPayment).toBeGreaterThan(0);
    }
  });

  it("interest + principal = total debt payment (PMT)", () => {
    const data = generatePropertyProForma(financedProperty, baseGlobal, 12);
    for (const m of data) {
      expect(m.interestExpense + m.principalPayment).toBeCloseTo(m.debtPayment, 2);
    }
  });

  it("interest decreases and principal increases over time (amortization)", () => {
    const glob = { ...baseGlobal, projectionYears: 3 };
    const data = generatePropertyProForma(financedProperty, glob, 36);
    // Compare first and last month
    expect(data[35].interestExpense).toBeLessThan(data[0].interestExpense);
    expect(data[35].principalPayment).toBeGreaterThan(data[0].principalPayment);
  });

  it("Full Equity property has zero debt payment every month", () => {
    const data = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
    for (const m of data) {
      expect(m.debtPayment).toBe(0);
      expect(m.interestExpense).toBe(0);
      expect(m.principalPayment).toBe(0);
      expect(m.debtOutstanding).toBe(0);
    }
  });

  it("debt outstanding strictly decreases each month", () => {
    const data = generatePropertyProForma(financedProperty, baseGlobal, 12);
    for (let i = 1; i < 12; i++) {
      expect(data[i].debtOutstanding).toBeLessThan(data[i - 1].debtOutstanding);
    }
  });

  it("debt outstanding reduction is approximately equal to principal payment", () => {
    const data = generatePropertyProForma(financedProperty, baseGlobal, 12);
    for (let i = 1; i < 12; i++) {
      const balanceReduction = data[i - 1].debtOutstanding - data[i].debtOutstanding;
      // The engine replays the amortization schedule from scratch each month,
      // so principalPayment is computed from the current month's interest on the
      // ending balance. Allow a small tolerance for the floating-point replay.
      expect(balanceReduction).toBeGreaterThan(0);
      // Principal payment and balance reduction should be in the same ballpark
      expect(balanceReduction / data[i].principalPayment).toBeCloseTo(1.0, 1);
    }
  });
});

// ===========================================================================
// 8. ASC 606 — Revenue recognition
// ===========================================================================
describe("ASC 606 — Revenue recognition", () => {
  it("no revenue before operations start date", () => {
    const lateOpsProp = {
      ...fullEquityProperty,
      operationsStartDate: "2026-10-01", // 6 months after model start
    };
    const data = generatePropertyProForma(lateOpsProp, baseGlobal, 12);
    // Months 0-5 are before ops start
    for (let i = 0; i < 6; i++) {
      expect(data[i].revenueTotal).toBe(0);
      expect(data[i].revenueRooms).toBe(0);
      expect(data[i].revenueEvents).toBe(0);
      expect(data[i].revenueFB).toBe(0);
      expect(data[i].revenueOther).toBe(0);
    }
    // Months 6+ have revenue
    for (let i = 6; i < 12; i++) {
      expect(data[i].revenueTotal).toBeGreaterThan(0);
    }
  });

  it("room revenue = ADR x soldRooms every operational month", () => {
    const data = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
    for (const m of data) {
      expect(m.revenueRooms).toBeCloseTo(m.adr * m.soldRooms, 2);
    }
  });

  it("revenue streams computed correctly from total revenue (new model)", () => {
    const data = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
    for (const m of data) {
      // New model: ancillary revenues are % of total revenue, not room revenue
      // revenueTotal = revenueRooms / roomShareOfTotal
      const ancillaryShare = fullEquityProperty.revShareEvents + fullEquityProperty.revShareFB + fullEquityProperty.revShareOther;
      const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare);
      const expectedTotal = m.revenueRooms / roomShareOfTotal;
      expect(m.revenueEvents).toBeCloseTo(expectedTotal * fullEquityProperty.revShareEvents, 2);
      expect(m.revenueFB).toBeCloseTo(expectedTotal * fullEquityProperty.revShareFB, 2);
      expect(m.revenueOther).toBeCloseTo(expectedTotal * fullEquityProperty.revShareOther, 2);
    }
  });

  it("total revenue = sum of all four streams", () => {
    const data = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
    for (const m of data) {
      const sum = m.revenueRooms + m.revenueEvents + m.revenueFB + m.revenueOther;
      expect(m.revenueTotal).toBeCloseTo(sum, 2);
    }
  });

  it("compliance checker validates revenue recognition for pre-ops months", () => {
    const lateOpsProp = {
      ...fullEquityProperty,
      operationsStartDate: "2026-10-01",
    };
    const data = generatePropertyProForma(lateOpsProp, baseGlobal, 12);
    const report = checkGAAPCompliance(data);
    // All ASC 606 revenue checks should pass (including pre-ops months with zero revenue)
    const revenueChecks = report.results.filter(
      (r) => r.category === "ASC 606 - Revenue" && r.rule === "Point-in-Time Recognition"
    );
    for (const c of revenueChecks) {
      expect(c.passed).toBe(true);
    }
  });
});

// ===========================================================================
// 9. Balance sheet equation: A = L + E (independently derived equity)
// ===========================================================================
describe("Balance sheet equation — Assets = Liabilities + Equity", () => {
  it("Full Equity: A=L+E with independently derived equity (no debt)", () => {
    const data = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
    // Independently derive equity: initialEquity + cumulative net income
    const totalPropertyValue = fullEquityProperty.purchasePrice + (fullEquityProperty.buildingImprovements ?? 0);
    const operatingReserve = fullEquityProperty.operatingReserve ?? 0;
    // Full Equity => no loan
    const initialEquity = totalPropertyValue + operatingReserve;

    let cumulativeNetIncome = 0;
    for (const m of data) {
      cumulativeNetIncome += m.netIncome;
      const totalAssets = m.endingCash + m.propertyValue;
      const totalLiabilities = m.debtOutstanding;
      const derivedEquity = initialEquity + cumulativeNetIncome;

      expect(totalLiabilities).toBe(0);
      expect(totalAssets).toBeCloseTo(totalLiabilities + derivedEquity, 2);
    }
  });

  it("Financed: A=L+E with independently derived equity (with debt)", () => {
    const data = generatePropertyProForma(financedProperty, baseGlobal, 12);
    // Independently derive equity
    const purchasePrice = financedProperty.purchasePrice;
    const totalPropertyValue = purchasePrice + (financedProperty.buildingImprovements ?? 0);
    const ltv = financedProperty.acquisitionLTV ?? 0.75;
    const originalLoanAmount = totalPropertyValue * ltv;
    const operatingReserve = financedProperty.operatingReserve ?? 0;
    const initialEquity = totalPropertyValue - originalLoanAmount + operatingReserve;

    let cumulativeNetIncome = 0;
    for (const m of data) {
      expect(m.debtOutstanding).toBeGreaterThan(0);
      cumulativeNetIncome += m.netIncome;
      const totalAssets = m.endingCash + m.propertyValue;
      const totalLiabilities = m.debtOutstanding;
      const derivedEquity = initialEquity + cumulativeNetIncome;

      // This is the real A=L+E verification — not tautological
      expect(totalAssets).toBeCloseTo(totalLiabilities + derivedEquity, 2);
    }
  });
});

// ===========================================================================
// 10. generateComplianceReport — report structure
// ===========================================================================
describe("generateComplianceReport — text report generation", () => {
  const monthlyData = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
  const gaapReport = checkGAAPCompliance(monthlyData);
  const cfReport = checkCashFlowStatement(monthlyData);

  it("generates a non-empty string", () => {
    const text = generateComplianceReport([gaapReport, cfReport]);
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("includes the report header", () => {
    const text = generateComplianceReport([gaapReport, cfReport]);
    expect(text).toContain("GAAP COMPLIANCE VERIFICATION REPORT");
  });

  it("includes the compliance summary section", () => {
    const text = generateComplianceReport([gaapReport, cfReport]);
    expect(text).toContain("COMPLIANCE SUMMARY");
    expect(text).toContain("Total Checks:");
    expect(text).toContain("Passed:");
    expect(text).toContain("Failed:");
    expect(text).toContain("Critical Issues:");
    expect(text).toContain("Warnings:");
    expect(text).toContain("Compliance Rate:");
  });

  it("includes key GAAP standards verified section", () => {
    const text = generateComplianceReport([gaapReport, cfReport]);
    expect(text).toContain("KEY GAAP STANDARDS VERIFIED");
    expect(text).toContain("ASC 470 - Debt");
    expect(text).toContain("ASC 230 - Cash Flows");
    expect(text).toContain("ASC 606 - Revenue");
    expect(text).toContain("ASC 360 - Property");
    expect(text).toContain("USALI - Industry");
  });

  it("shows ALL GAAP COMPLIANCE CHECKS PASSED when no critical issues", () => {
    const text = generateComplianceReport([gaapReport, cfReport]);
    expect(text).toContain("ALL GAAP COMPLIANCE CHECKS PASSED");
  });

  it("shows compliance rate of 100% for clean data", () => {
    const text = generateComplianceReport([gaapReport, cfReport]);
    expect(text).toContain("100.0%");
  });

  it("correctly sums totals across multiple reports", () => {
    const text = generateComplianceReport([gaapReport, cfReport]);
    const totalChecks = gaapReport.totalChecks + cfReport.totalChecks;
    const totalPassed = gaapReport.passed + cfReport.passed;
    expect(text).toContain(`Total Checks:     ${totalChecks}`);
    expect(text).toContain(`Passed:           ${totalPassed}`);
  });
});

// ===========================================================================
// 11. generateComplianceReport — with critical issues
// ===========================================================================
describe("generateComplianceReport — handling critical/warning issues", () => {
  it("shows CRITICAL ISSUES section when report has critical failures", () => {
    const fakeReport: ComplianceReport = {
      timestamp: new Date(),
      totalChecks: 3,
      passed: 1,
      failed: 2,
      criticalIssues: 1,
      warnings: 1,
      results: [
        {
          passed: true,
          category: "ASC 360 - Property",
          rule: "Depreciation Period",
          description: "OK",
          severity: "info",
        },
        {
          passed: false,
          category: "ASC 470 - Debt",
          rule: "Interest/Principal Separation",
          description: "Month 1: Net Income miscalculated",
          details: "Expected $1000, got $900",
          severity: "critical",
        },
        {
          passed: false,
          category: "ASC 606 - Fees",
          rule: "Management Fee Recognition",
          description: "Month 1: Fee exceeds threshold",
          details: "Base fee unreasonable",
          severity: "warning",
        },
      ],
    };

    const text = generateComplianceReport([fakeReport]);
    expect(text).toContain("CRITICAL ISSUES");
    expect(text).toContain("Interest/Principal Separation");
    expect(text).toContain("WARNINGS");
    expect(text).toContain("Management Fee Recognition");
    expect(text).toContain("GAAP COMPLIANCE ISSUES DETECTED");
    expect(text).not.toContain("ALL GAAP COMPLIANCE CHECKS PASSED");
  });

  it("shows correct compliance rate with failures", () => {
    const fakeReport: ComplianceReport = {
      timestamp: new Date(),
      totalChecks: 4,
      passed: 3,
      failed: 1,
      criticalIssues: 1,
      warnings: 0,
      results: [
        {
          passed: false,
          category: "ASC 470 - Debt",
          rule: "Test",
          description: "Test failure",
          severity: "critical",
        },
        { passed: true, category: "Test", rule: "A", description: "OK", severity: "info" },
        { passed: true, category: "Test", rule: "B", description: "OK", severity: "info" },
        { passed: true, category: "Test", rule: "C", description: "OK", severity: "info" },
      ],
    };

    const text = generateComplianceReport([fakeReport]);
    expect(text).toContain("75.0%");
  });

  it("generates report for empty reports array", () => {
    const text = generateComplianceReport([]);
    expect(typeof text).toBe("string");
    expect(text).toContain("GAAP COMPLIANCE VERIFICATION REPORT");
    expect(text).toContain("Total Checks:     0");
  });
});

// ===========================================================================
// 12. checkGAAPCompliance — pre-operations period
// ===========================================================================
describe("checkGAAPCompliance — pre-operations period (late ops start)", () => {
  const lateOpsProp = {
    ...fullEquityProperty,
    operationsStartDate: "2026-10-01", // 6 months after model start
  };
  const monthlyData = generatePropertyProForma(lateOpsProp, baseGlobal, 12);
  const report = checkGAAPCompliance(monthlyData);

  it("all checks pass even with pre-ops months", () => {
    expect(report.criticalIssues).toBe(0);
    expect(report.failed).toBe(0);
  });

  it("matching principle is satisfied for pre-ops months (no revenue, no variable expenses)", () => {
    // Pre-ops months have $0 revenue and $0 variable expenses
    // This is allowed per the checker logic: (!hasRevenue && !hasExpenses) or (!hasRevenue && hasExpenses)
    const matchingChecks = report.results.filter(
      (r) => r.category === "Matching Principle"
    );
    for (const c of matchingChecks) {
      expect(c.passed).toBe(true);
    }
  });
});

// ===========================================================================
// 13. checkGAAPCompliance — check count depends on months
// ===========================================================================
describe("checkGAAPCompliance — check count proportional to months", () => {
  it("produces fewer checks for shorter data arrays", () => {
    const data6 = generatePropertyProForma(fullEquityProperty, baseGlobal, 6);
    const data12 = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
    const report6 = checkGAAPCompliance(data6);
    const report12 = checkGAAPCompliance(data12);
    // Both should check min(12, length) months = 6 and 12 respectively
    expect(report6.totalChecks).toBeLessThan(report12.totalChecks);
  });

  it("caps at 12 months even for longer data", () => {
    const data24 = generatePropertyProForma(fullEquityProperty, { ...baseGlobal, projectionYears: 2 }, 24);
    const data12 = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
    const report24 = checkGAAPCompliance(data24);
    const report12 = checkGAAPCompliance(data12);
    // Both check 12 months, so same count
    expect(report24.totalChecks).toBe(report12.totalChecks);
  });
});

// ===========================================================================
// 14. checkCashFlowStatement — check count depends on debt
// ===========================================================================
describe("checkCashFlowStatement — check count varies by debt presence", () => {
  it("Financed property produces more checks than Full Equity (financing + interest checks)", () => {
    const feData = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
    const finData = generatePropertyProForma(financedProperty, baseGlobal, 12);
    const feReport = checkCashFlowStatement(feData);
    const finReport = checkCashFlowStatement(finData);
    expect(finReport.totalChecks).toBeGreaterThan(feReport.totalChecks);
  });
});

// ===========================================================================
// 15. Ending cash reconciliation
// ===========================================================================
describe("Ending cash reconciliation", () => {
  it("Full Equity: endingCash = cumulative sum of cashFlow", () => {
    const data = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
    let cumCash = 0;
    for (const m of data) {
      cumCash += m.cashFlow;
      expect(m.endingCash).toBeCloseTo(cumCash, 2);
    }
  });

  it("Financed: endingCash = cumulative sum of cashFlow", () => {
    const data = generatePropertyProForma(financedProperty, baseGlobal, 12);
    let cumCash = 0;
    for (const m of data) {
      cumCash += m.cashFlow;
      expect(m.endingCash).toBeCloseTo(cumCash, 2);
    }
  });
});

// ===========================================================================
// 16. Combined reports — multi-property scenario
// ===========================================================================
describe("generateComplianceReport — multiple property reports combined", () => {
  it("correctly aggregates results from multiple properties", () => {
    const feData = generatePropertyProForma(fullEquityProperty, baseGlobal, 12);
    const finData = generatePropertyProForma(financedProperty, baseGlobal, 12);

    const feGaap = checkGAAPCompliance(feData);
    const finGaap = checkGAAPCompliance(finData);
    const feCf = checkCashFlowStatement(feData);
    const finCf = checkCashFlowStatement(finData);

    const text = generateComplianceReport([feGaap, finGaap, feCf, finCf]);
    const totalChecks = feGaap.totalChecks + finGaap.totalChecks + feCf.totalChecks + finCf.totalChecks;
    expect(text).toContain(`Total Checks:     ${totalChecks}`);
  });
});

// ===========================================================================
// 17. Income tax non-negativity in compliance context
// ===========================================================================
describe("Income tax non-negativity — compliance boundary", () => {
  it("income tax is never negative (tax floor at zero)", () => {
    // Zero-room property will have negative taxable income
    const zeroProp = { ...fullEquityProperty, roomCount: 0 };
    const data = generatePropertyProForma(zeroProp, baseGlobal, 12);
    for (const m of data) {
      expect(m.incomeTax).toBeGreaterThanOrEqual(0);
    }
    // Compliance checks should still pass
    const report = checkGAAPCompliance(data);
    expect(report.criticalIssues).toBe(0);
  });
});

// ===========================================================================
// 18. Full 10-year projection compliance
// ===========================================================================
describe("Full 10-year projection — GAAP compliance", () => {
  const glob10 = { ...baseGlobal, projectionYears: 10 };
  const data = generatePropertyProForma(financedProperty, glob10, 120);

  it("GAAP compliance passes for financed property over 120 months", () => {
    const report = checkGAAPCompliance(data);
    expect(report.criticalIssues).toBe(0);
    expect(report.failed).toBe(0);
  });

  it("cash flow statement compliance passes over 120 months", () => {
    const report = checkCashFlowStatement(data);
    expect(report.criticalIssues).toBe(0);
    expect(report.failed).toBe(0);
  });

  it("net income identity holds for all 120 months", () => {
    for (const m of data) {
      const expected = m.anoi - m.interestExpense - m.depreciationExpense - m.incomeTax;
      expect(m.netIncome).toBeCloseTo(expected, 2);
    }
  });

  it("cash flow identity holds for all 120 months", () => {
    for (const m of data) {
      const expected = m.anoi - m.debtPayment - m.incomeTax;
      expect(m.cashFlow).toBeCloseTo(expected, 2);
    }
  });

  it("operating + financing cash flow = total cash flow for all 120 months", () => {
    for (const m of data) {
      expect(m.operatingCashFlow + m.financingCashFlow).toBeCloseTo(m.cashFlow, 2);
    }
  });
});
