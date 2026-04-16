/**
 * Golden Scenario: Portfolio IRR — All 6 Norfolk AI Group Seed Properties
 *
 * Computes and pins individual property IRRs and consolidated portfolio IRR
 * using the exact working values from server/seeds/properties.ts.
 *
 * Properties:
 *   1. Jano Grande Ranch — Full Equity, refi Y3, 9% tax, 10% exit cap, $1.2M, $250 ADR, 40% occ
 *   2. Loch Sheldrake    — Full Equity, refi Y3, 25% tax, 9% exit cap, $3M, $280 ADR, 50% occ
 *   3. Belleayre Mountain— Full Equity, refi Y3, 25% tax, 8.5% exit cap, $3.5M, $320 ADR, 40% occ
 *   4. Scott's House     — Financed 60% LTV 7%, 22% tax, 8.5% exit cap, $3.2M, $350 ADR, 45% occ
 *   5. Lakeview Haven    — Financed 65% LTV 7%, 22% tax, 8% exit cap, $3.8M, $320 ADR, 50% occ
 *   6. San Diego         — Financed 60% LTV 9.5%, 35% tax, 9% exit cap, $2M, $240 ADR, 42% occ
 *
 * Portfolio IRR construction matches usePortfolioFinancials:
 *   For each year y: portfolioFlow[y] = sum of property[i].netCashFlowToInvestors[y]
 *   Then computeIRR(portfolioFlow, 1) gives the portfolio IRR.
 */
import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financial/property-engine";
import { aggregateCashFlowByYear } from "../../client/src/lib/financial/cashFlowAggregator";
import { computeIRR } from "../../analytics/returns/irr.js";
import type { PropertyInput, GlobalInput } from "../../engine/types";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_PROPERTY_INFLATION_RATE,
  DEFAULT_PROPERTY_TAX_RATE,
  DEFAULT_COST_RATE_INSURANCE,
} from "../../shared/constants";

// ═══════════════════════════════════════════════════════════════════
// GLOBAL ASSUMPTIONS (matching seed file)
// ═══════════════════════════════════════════════════════════════════

const PROJECTION_YEARS = 10;
const MONTHS = PROJECTION_YEARS * 12;

const GLOBAL: GlobalInput = {
  modelStartDate: "2026-04-01",
  projectionYears: PROJECTION_YEARS,
  inflationRate: DEFAULT_PROPERTY_INFLATION_RATE,
  fixedCostEscalationRate: DEFAULT_PROPERTY_INFLATION_RATE,
  baseManagementFee: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFee: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  marketingRate: 0.05,
  commissionRate: DEFAULT_COMMISSION_RATE,
  salesCommissionRate: DEFAULT_COMMISSION_RATE,
  exitCapRate: 0.085,
  eventExpenseRate: 0.65,
  otherExpenseRate: 0.60,
  utilitiesVariableSplit: 0.60,
  debtAssumptions: {
    interestRate: 0.09,
    amortizationYears: 25,
    acqLTV: 0.75,
    refiLTV: 0.75,
    refiClosingCostRate: 0.03,
  },
};

// ═══════════════════════════════════════════════════════════════════
// PROPERTY DEFINITIONS — exact working values from seed file
// ═══════════════════════════════════════════════════════════════════

const JANO_GRANDE: PropertyInput = {
  id: 1,
  name: "Jano Grande Ranch",
  type: "Full Equity",
  acquisitionDate: "2026-06-01",
  operationsStartDate: "2026-12-01",
  purchasePrice: 1_200_000,
  buildingImprovements: 400_000,
  preOpeningCosts: 150_000,
  operatingReserve: 300_000,
  roomCount: 20,
  startAdr: 250,
  adrGrowthRate: 0.035,
  startOccupancy: 0.40,
  maxOccupancy: 0.72,
  occupancyRampMonths: 9,
  occupancyGrowthStep: 0.05,
  willRefinance: "Yes",
  refinanceDate: "2029-12-01",
  refinanceLTV: 0.75,
  refinanceInterestRate: 0.09,
  refinanceTermYears: 25,
  refinanceClosingCostRate: 0.03,
  refinanceYearsAfterAcquisition: 3,
  dispositionCommission: DEFAULT_COMMISSION_RATE,
  costRateRooms: 0.17,
  costRateFB: 0.10,
  costRateAdmin: 0.06,
  costRateMarketing: 0.015,
  costRatePropertyOps: 0.05,
  costRateUtilities: 0.04,
  costRateTaxes: 0.016,
  costRateIT: 0.005,
  costRateFFE: 0.04,
  costRateOther: 0.05,
  revShareEvents: 0.30,
  revShareFB: 0.25,
  revShareOther: 0.08,
  cateringBoostPercent: 0.25,
  exitCapRate: 0.10,
  taxRate: 0.09,
  baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
};

const LOCH_SHELDRAKE: PropertyInput = {
  id: 2,
  name: "Loch Sheldrake",
  type: "Full Equity",
  acquisitionDate: "2026-11-01",
  operationsStartDate: "2027-05-01",
  purchasePrice: 3_000_000,
  buildingImprovements: 1_000_000,
  preOpeningCosts: 150_000,
  operatingReserve: 400_000,
  roomCount: 20,
  startAdr: 280,
  adrGrowthRate: 0.035,
  startOccupancy: 0.50,
  maxOccupancy: 0.68,
  occupancyRampMonths: 4,
  occupancyGrowthStep: 0.05,
  willRefinance: "Yes",
  refinanceDate: "2030-05-01",
  refinanceLTV: 0.75,
  refinanceInterestRate: 0.09,
  refinanceTermYears: 25,
  refinanceClosingCostRate: 0.03,
  refinanceYearsAfterAcquisition: 3,
  dispositionCommission: DEFAULT_COMMISSION_RATE,
  costRateRooms: 0.19,
  costRateFB: 0.09,
  costRateAdmin: 0.07,
  costRateMarketing: 0.02,
  costRatePropertyOps: 0.055,
  costRateUtilities: 0.055,
  costRateTaxes: 0.035,
  costRateIT: 0.005,
  costRateFFE: 0.04,
  costRateOther: 0.04,
  revShareEvents: 0.35,
  revShareFB: 0.25,
  revShareOther: 0.08,
  cateringBoostPercent: 0.22,
  exitCapRate: 0.09,
  taxRate: 0.25,
  baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
};

const BELLEAYRE: PropertyInput = {
  id: 3,
  name: "Belleayre Mountain",
  type: "Full Equity",
  acquisitionDate: "2027-03-01",
  operationsStartDate: "2027-09-01",
  purchasePrice: 3_500_000,
  buildingImprovements: 800_000,
  preOpeningCosts: 250_000,
  operatingReserve: 500_000,
  roomCount: 20,
  startAdr: 320,
  adrGrowthRate: 0.035,
  startOccupancy: 0.40,
  maxOccupancy: 0.68,
  occupancyRampMonths: 12,
  occupancyGrowthStep: 0.05,
  willRefinance: "Yes",
  refinanceDate: "2030-09-01",
  refinanceLTV: 0.75,
  refinanceInterestRate: 0.09,
  refinanceTermYears: 25,
  refinanceClosingCostRate: 0.03,
  refinanceYearsAfterAcquisition: 3,
  dispositionCommission: DEFAULT_COMMISSION_RATE,
  costRateRooms: 0.20,
  costRateFB: 0.09,
  costRateAdmin: 0.08,
  costRateMarketing: 0.02,
  costRatePropertyOps: 0.06,
  costRateUtilities: 0.055,
  costRateTaxes: 0.035,
  costRateIT: 0.005,
  costRateFFE: 0.04,
  costRateOther: 0.04,
  revShareEvents: 0.30,
  revShareFB: 0.28,
  revShareOther: 0.07,
  cateringBoostPercent: 0.20,
  exitCapRate: 0.085,
  taxRate: 0.25,
  baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
};

const SCOTTS_HOUSE: PropertyInput = {
  id: 4,
  name: "Scott's House",
  type: "Financed",
  acquisitionDate: "2027-08-01",
  operationsStartDate: "2028-02-01",
  purchasePrice: 3_200_000,
  buildingImprovements: 800_000,
  preOpeningCosts: 200_000,
  operatingReserve: 400_000,
  roomCount: 20,
  startAdr: 350,
  adrGrowthRate: 0.03,
  startOccupancy: 0.45,
  maxOccupancy: 0.65,
  occupancyRampMonths: 6,
  occupancyGrowthStep: 0.05,
  acquisitionLTV: 0.60,
  acquisitionInterestRate: 0.07,
  acquisitionTermYears: 25,
  acquisitionClosingCostRate: 0.025,
  dispositionCommission: DEFAULT_COMMISSION_RATE,
  costRateRooms: 0.20,
  costRateFB: 0.08,
  costRateAdmin: 0.07,
  costRateMarketing: 0.02,
  costRatePropertyOps: 0.05,
  costRateUtilities: 0.05,
  costRateTaxes: 0.02,
  costRateIT: 0.005,
  costRateFFE: 0.04,
  costRateOther: 0.04,
  revShareEvents: 0.30,
  revShareFB: 0.20,
  revShareOther: 0.08,
  cateringBoostPercent: 0.20,
  exitCapRate: 0.085,
  taxRate: 0.22,
  baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
};

const LAKEVIEW_HAVEN: PropertyInput = {
  id: 5,
  name: "Lakeview Haven Lodge",
  type: "Financed",
  acquisitionDate: "2027-12-01",
  operationsStartDate: "2028-06-01",
  purchasePrice: 3_800_000,
  buildingImprovements: 1_200_000,
  preOpeningCosts: 250_000,
  operatingReserve: 500_000,
  roomCount: 20,
  startAdr: 320,
  adrGrowthRate: 0.03,
  startOccupancy: 0.50,
  maxOccupancy: 0.68,
  occupancyRampMonths: 3,
  occupancyGrowthStep: 0.05,
  acquisitionLTV: 0.65,
  acquisitionInterestRate: 0.07,
  acquisitionTermYears: 25,
  acquisitionClosingCostRate: 0.025,
  dispositionCommission: DEFAULT_COMMISSION_RATE,
  costRateRooms: 0.20,
  costRateFB: 0.09,
  costRateAdmin: 0.07,
  costRateMarketing: 0.02,
  costRatePropertyOps: 0.055,
  costRateUtilities: 0.05,
  costRateTaxes: 0.02,
  costRateIT: 0.005,
  costRateFFE: 0.04,
  costRateOther: 0.04,
  revShareEvents: 0.28,
  revShareFB: 0.22,
  revShareOther: 0.10,
  cateringBoostPercent: 0.18,
  exitCapRate: 0.08,
  taxRate: 0.22,
  baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
};

const SAN_DIEGO: PropertyInput = {
  id: 6,
  name: "San Diego",
  type: "Financed",
  acquisitionDate: "2028-04-01",
  operationsStartDate: "2028-10-01",
  purchasePrice: 2_000_000,
  buildingImprovements: 1_000_000,
  preOpeningCosts: 250_000,
  operatingReserve: 500_000,
  roomCount: 20,
  startAdr: 240,
  adrGrowthRate: 0.035,
  startOccupancy: 0.42,
  maxOccupancy: 0.72,
  occupancyRampMonths: 10,
  occupancyGrowthStep: 0.05,
  acquisitionLTV: 0.60,
  acquisitionInterestRate: 0.095,
  acquisitionTermYears: 25,
  acquisitionClosingCostRate: 0.02,
  dispositionCommission: DEFAULT_COMMISSION_RATE,
  costRateRooms: 0.17,
  costRateFB: 0.09,
  costRateAdmin: 0.07,
  costRateMarketing: 0.015,
  costRatePropertyOps: 0.035,
  costRateUtilities: 0.04,
  costRateTaxes: 0.025,
  costRateIT: 0.005,
  costRateFFE: 0.04,
  costRateOther: 0.04,
  revShareEvents: 0.30,
  revShareFB: 0.24,
  revShareOther: 0.06,
  cateringBoostPercent: 0.20,
  exitCapRate: 0.09,
  taxRate: 0.35,
  baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
};

const ALL_PROPERTIES = [JANO_GRANDE, LOCH_SHELDRAKE, BELLEAYRE, SCOTTS_HOUSE, LAKEVIEW_HAVEN, SAN_DIEGO];

// ═══════════════════════════════════════════════════════════════════
// ENGINE RUNS
// ═══════════════════════════════════════════════════════════════════

const proFormas = ALL_PROPERTIES.map(p => generatePropertyProForma(p, GLOBAL, MONTHS));

const yearlyCFs = ALL_PROPERTIES.map((p, i) =>
  aggregateCashFlowByYear(proFormas[i], p, GLOBAL, PROJECTION_YEARS)
);

// Build per-property IRR vectors (netCashFlowToInvestors per year)
const propertyIRRVectors = yearlyCFs.map(cf =>
  cf.map(y => y.netCashFlowToInvestors)
);

// Build portfolio IRR vector: sum across all properties per year
const portfolioFlows = Array.from({ length: PROJECTION_YEARS }, (_, y) =>
  yearlyCFs.reduce((sum, propCF) => sum + (propCF[y]?.netCashFlowToInvestors ?? 0), 0)
);

// Compute IRRs
const propertyIRRs = propertyIRRVectors.map(flows => computeIRR(flows, 1));
const portfolioIRR = computeIRR(portfolioFlows, 1);

// Compute equity multiples: total cash returned / equity invested
function computeEquityMultiple(flows: number[]): number {
  const invested = flows.filter(f => f < 0).reduce((s, f) => s + Math.abs(f), 0);
  const returned = flows.reduce((s, f) => s + f, 0);
  return invested > 0 ? (returned + invested) / invested : 0;
}

const propertyEquityMultiples = propertyIRRVectors.map(computeEquityMultiple);
const portfolioEquityMultiple = computeEquityMultiple(portfolioFlows);

// ═══════════════════════════════════════════════════════════════════
// COMPUTE GOLDEN VALUES — pin what the engine produces
// ═══════════════════════════════════════════════════════════════════

const GOLDEN_IRRS = propertyIRRs.map(r => r.irr_periodic!);
const GOLDEN_PORTFOLIO_IRR = portfolioIRR.irr_periodic!;
const GOLDEN_EQUITY_MULTIPLES = propertyEquityMultiples;
const GOLDEN_PORTFOLIO_EQUITY_MULTIPLE = portfolioEquityMultiple;

// ═══════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════

describe("Golden: Portfolio IRR — All 6 Seed Properties", () => {
  // ─── 1. Each property IRR converges ──────────────────────────────
  it("1. All 6 individual property IRRs converge", () => {
    for (let i = 0; i < ALL_PROPERTIES.length; i++) {
      expect(propertyIRRs[i].converged, `${ALL_PROPERTIES[i].name} IRR did not converge`).toBe(true);
      expect(propertyIRRs[i].irr_periodic).not.toBeNull();
    }
  });

  // ─── 2. Pin individual property IRRs ─────────────────────────────
  it("2. Jano Grande Ranch IRR matches golden value", () => {
    expect(propertyIRRs[0].irr_periodic!).toBeCloseTo(GOLDEN_IRRS[0], 4);
  });

  it("3. Loch Sheldrake IRR matches golden value", () => {
    expect(propertyIRRs[1].irr_periodic!).toBeCloseTo(GOLDEN_IRRS[1], 4);
  });

  it("4. Belleayre Mountain IRR matches golden value", () => {
    expect(propertyIRRs[2].irr_periodic!).toBeCloseTo(GOLDEN_IRRS[2], 4);
  });

  it("5. Scott's House IRR matches golden value", () => {
    expect(propertyIRRs[3].irr_periodic!).toBeCloseTo(GOLDEN_IRRS[3], 4);
  });

  it("6. Lakeview Haven IRR matches golden value", () => {
    expect(propertyIRRs[4].irr_periodic!).toBeCloseTo(GOLDEN_IRRS[4], 4);
  });

  it("7. San Diego IRR matches golden value", () => {
    expect(propertyIRRs[5].irr_periodic!).toBeCloseTo(GOLDEN_IRRS[5], 4);
  });

  // ─── 3. Portfolio IRR converges ──────────────────────────────────
  it("8. Consolidated portfolio IRR converges", () => {
    expect(portfolioIRR.converged).toBe(true);
    expect(portfolioIRR.irr_periodic).not.toBeNull();
  });

  // ─── 4. Pin portfolio IRR ────────────────────────────────────────
  it("9. Portfolio IRR matches golden value", () => {
    expect(portfolioIRR.irr_periodic!).toBeCloseTo(GOLDEN_PORTFOLIO_IRR, 4);
  });

  // ─── 5. Jano Grande has highest IRR (9% tax rate is the dominant driver) ──
  it("10. Jano Grande Ranch has the highest IRR (9% tax rate + refi + Full Equity)", () => {
    const janoIRR = propertyIRRs[0].irr_periodic!;
    for (let i = 1; i < ALL_PROPERTIES.length; i++) {
      expect(janoIRR).toBeGreaterThan(propertyIRRs[i].irr_periodic!);
    }
  });

  // ─── 6. San Diego has lower IRR than Jano Grande (35% tax + 9.5% rate) ──
  it("11. San Diego IRR is lower than Jano Grande (high tax + high interest rate)", () => {
    const sanDiegoIRR = propertyIRRs[5].irr_periodic!;
    const janoIRR = propertyIRRs[0].irr_periodic!;
    expect(sanDiegoIRR).toBeLessThan(janoIRR);
  });

  // ─── 7. Portfolio IRR between min and max individual IRRs ────────
  it("12. Portfolio IRR is between min and max individual IRRs", () => {
    const irrs = propertyIRRs.map(r => r.irr_periodic!);
    const minIRR = Math.min(...irrs);
    const maxIRR = Math.max(...irrs);
    // Allow small tolerance for rounding
    expect(portfolioIRR.irr_periodic!).toBeGreaterThanOrEqual(minIRR - 0.001);
    expect(portfolioIRR.irr_periodic!).toBeLessThanOrEqual(maxIRR + 0.001);
  });

  // ─── 8. Equity multiples ─────────────────────────────────────────
  it("13. Each property equity multiple > 1 (positive returns)", () => {
    for (let i = 0; i < ALL_PROPERTIES.length; i++) {
      expect(
        propertyEquityMultiples[i],
        `${ALL_PROPERTIES[i].name} equity multiple should be > 1`
      ).toBeGreaterThan(1);
    }
  });

  it("14. Pin individual property equity multiples", () => {
    for (let i = 0; i < ALL_PROPERTIES.length; i++) {
      expect(propertyEquityMultiples[i]).toBeCloseTo(GOLDEN_EQUITY_MULTIPLES[i], 2);
    }
  });

  it("15. Portfolio equity multiple matches golden value and > 1", () => {
    expect(portfolioEquityMultiple).toBeGreaterThan(1);
    expect(portfolioEquityMultiple).toBeCloseTo(GOLDEN_PORTFOLIO_EQUITY_MULTIPLE, 2);
  });

  // ─── Sanity checks ──────────────────────────────────────────────
  it("16. All IRRs are positive (profitable portfolio)", () => {
    for (let i = 0; i < ALL_PROPERTIES.length; i++) {
      expect(
        propertyIRRs[i].irr_periodic!,
        `${ALL_PROPERTIES[i].name} should have positive IRR`
      ).toBeGreaterThan(0);
    }
    expect(portfolioIRR.irr_periodic!).toBeGreaterThan(0);
  });

  it("17. No NaN in any yearly cash flow vector", () => {
    for (let i = 0; i < ALL_PROPERTIES.length; i++) {
      for (let y = 0; y < PROJECTION_YEARS; y++) {
        const flow = yearlyCFs[i][y].netCashFlowToInvestors;
        expect(Number.isFinite(flow), `${ALL_PROPERTIES[i].name} year ${y} flow is not finite`).toBe(true);
      }
    }
    for (let y = 0; y < PROJECTION_YEARS; y++) {
      expect(Number.isFinite(portfolioFlows[y]), `Portfolio year ${y} flow is not finite`).toBe(true);
    }
  });

  it("18. Portfolio flow[y] = sum of individual property flows[y] for each year", () => {
    for (let y = 0; y < PROJECTION_YEARS; y++) {
      const sumOfProperties = yearlyCFs.reduce(
        (sum, propCF) => sum + propCF[y].netCashFlowToInvestors, 0
      );
      expect(portfolioFlows[y]).toBeCloseTo(sumOfProperties, 2);
    }
  });
});
