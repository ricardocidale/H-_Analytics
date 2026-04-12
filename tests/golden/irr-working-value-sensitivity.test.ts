/**
 * Golden Scenario: IRR Sensitivity to Individual Working Values
 *
 * Tests a 20-room financed hotel with flat growth across 10 years, sweeping
 * one working value at a time to verify that IRR responds monotonically and
 * matches pinned golden values.
 *
 * BASE SCENARIO:
 *   20 rooms | $200 ADR | 70% steady-state occupancy | $2M purchase
 *   Financed 60% LTV @ 8% / 25yr | 0% growth | 10-year projection
 *   25% land | 25% tax rate | 8.5% exit cap | 5% commission
 *
 * SENSITIVITY SWEEPS (one variable at a time):
 *   1. Tax Rate:       9%, 22%, 25%, 35%
 *   2. Exit Cap Rate:  8%, 8.5%, 9%, 10%
 *   3. Interest Rate:  7%, 8%, 9%, 9.5%
 *   4. LTV:            60%, 65%, 75%
 */
import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financial/property-engine";
import { aggregateCashFlowByYear } from "../../client/src/lib/financial/cashFlowAggregator";
import { computeIRR } from "../../analytics/returns/irr";

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

function makeScenarioProperty(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    name: "IRR Sensitivity Lodge",
    type: "Financed",
    purchasePrice: 2_000_000,
    buildingImprovements: 0,
    preOpeningCosts: 0,
    roomCount: 20,
    startAdr: 200,
    startOccupancy: 0.70,
    maxOccupancy: 0.70,
    occupancyGrowthStep: 0,
    occupancyRampMonths: 6,
    adrGrowthRate: 0,
    inflationRate: 0,
    operationsStartDate: "2026-04-01",
    acquisitionDate: "2026-04-01",
    operatingReserve: 0,
    taxRate: 0.25,
    acquisitionLTV: 0.60,
    acquisitionInterestRate: 0.08,
    acquisitionTermYears: 25,
    exitCapRate: 0.085,
    dispositionCommission: 0.05,
    willRefinance: "No",
    landValuePercent: 0.25,
    ...overrides,
  } as any;
}

const GLOBAL = {
  modelStartDate: "2026-04-01",
  projectionYears: 10,
  inflationRate: 0,
  fixedCostEscalationRate: 0,
  companyInflationRate: 0,
  companyTaxRate: 0.30,
  companyOpsStartDate: "2026-04-01",
  safeTranche1Date: "2026-04-01",
  safeTranche1Amount: 800_000,
  safeTranche2Date: null,
  safeTranche2Amount: 0,
} as any;

const MONTHS = 120;
const YEARS = 10;

// ═══════════════════════════════════════════════════════════════════════════════
// IRR COMPUTATION HELPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run the full engine + aggregator pipeline and return the levered IRR
 * from the yearly net-cash-flow-to-investors vector.
 */
function computeScenarioIRR(overrides: Record<string, any> = {}): {
  irr: number;
  converged: boolean;
  flows: number[];
} {
  const prop = makeScenarioProperty(overrides);
  const monthly = generatePropertyProForma(prop, GLOBAL, MONTHS);
  const yearlyCF = aggregateCashFlowByYear(
    monthly,
    { ...prop, preOpeningCosts: 0 } as any,
    GLOBAL as any,
    YEARS,
  );

  const flows: number[] = [];
  for (let y = 0; y < YEARS; y++) {
    flows.push(yearlyCF[y].netCashFlowToInvestors);
  }

  const result = computeIRR(flows, 1);
  return {
    irr: result.irr_periodic ?? NaN,
    converged: result.converged,
    flows,
  };
}

/**
 * NPV helper for cross-checking IRR results.
 */
function calculateNPV(cashFlows: number[], rate: number): number {
  return cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOLDEN IRR VALUES (computed from engine, pinned as reference)
// ═══════════════════════════════════════════════════════════════════════════════

const GOLDEN = {
  base: 0.8554,

  taxRate: {
    0.09: 1.1800,
    0.22: 0.9061,
    0.25: 0.8554,
    0.35: 0.7126,
  } as Record<number, number>,

  exitCapRate: {
    0.08: 0.8583,
    0.085: 0.8554,
    0.09: 0.8527,
    0.10: 0.8481,
  } as Record<number, number>,

  interestRate: {
    0.07: 0.8790,
    0.08: 0.8554,
    0.09: 0.8315,
    0.095: 0.8196,
  } as Record<number, number>,

  ltv: {
    0.60: 0.8554,
    0.65: 1.0351,
    0.75: 2.0615,
  } as Record<number, number>,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("IRR Working Value Sensitivity — Golden Tests", () => {

  // ─── Base scenario ──────────────────────────────────────────────────────────
  describe("Base scenario", () => {
    const base = computeScenarioIRR();

    it("IRR converges", () => {
      expect(base.converged).toBe(true);
    });

    it("IRR matches golden value", () => {
      expect(base.irr).toBeCloseTo(GOLDEN.base, 4);
    });

    it("NPV at IRR is approximately zero", () => {
      const npv = calculateNPV(base.flows, base.irr);
      expect(Math.abs(npv)).toBeLessThan(1.0);
    });

    it("IRR is in realistic leveraged hotel range", () => {
      expect(base.irr).toBeGreaterThan(0.05);
      expect(base.irr).toBeLessThan(2.50);
    });
  });

  // ─── 1. Tax Rate Sensitivity ───────────────────────────────────────────────
  describe("Tax Rate Sensitivity", () => {
    const taxRates = [0.09, 0.22, 0.25, 0.35];
    const results = taxRates.map((rate) => ({
      rate,
      ...computeScenarioIRR({ taxRate: rate }),
    }));

    it("all scenarios converge", () => {
      for (const r of results) {
        expect(r.converged).toBe(true);
      }
    });

    it("taxRate=0.09 IRR matches golden value", () => {
      expect(results[0].irr).toBeCloseTo(GOLDEN.taxRate[0.09], 4);
    });

    it("taxRate=0.22 IRR matches golden value", () => {
      expect(results[1].irr).toBeCloseTo(GOLDEN.taxRate[0.22], 4);
    });

    it("taxRate=0.25 IRR matches golden value", () => {
      expect(results[2].irr).toBeCloseTo(GOLDEN.taxRate[0.25], 4);
    });

    it("taxRate=0.35 IRR matches golden value", () => {
      expect(results[3].irr).toBeCloseTo(GOLDEN.taxRate[0.35], 4);
    });

    it("IRR decreases monotonically as tax rate increases", () => {
      for (let i = 1; i < results.length; i++) {
        expect(results[i].irr).toBeLessThan(results[i - 1].irr);
      }
    });

    it("NPV at each computed IRR is approximately zero", () => {
      for (const r of results) {
        const npv = calculateNPV(r.flows, r.irr);
        expect(Math.abs(npv)).toBeLessThan(1.0);
      }
    });
  });

  // ─── 2. Exit Cap Rate Sensitivity ──────────────────────────────────────────
  describe("Exit Cap Rate Sensitivity", () => {
    const capRates = [0.08, 0.085, 0.09, 0.10];
    const results = capRates.map((rate) => ({
      rate,
      ...computeScenarioIRR({ exitCapRate: rate }),
    }));

    it("all scenarios converge", () => {
      for (const r of results) {
        expect(r.converged).toBe(true);
      }
    });

    it("exitCapRate=0.08 IRR matches golden value", () => {
      expect(results[0].irr).toBeCloseTo(GOLDEN.exitCapRate[0.08], 4);
    });

    it("exitCapRate=0.085 IRR matches golden value", () => {
      expect(results[1].irr).toBeCloseTo(GOLDEN.exitCapRate[0.085], 4);
    });

    it("exitCapRate=0.09 IRR matches golden value", () => {
      expect(results[2].irr).toBeCloseTo(GOLDEN.exitCapRate[0.09], 4);
    });

    it("exitCapRate=0.10 IRR matches golden value", () => {
      expect(results[3].irr).toBeCloseTo(GOLDEN.exitCapRate[0.10], 4);
    });

    it("IRR decreases monotonically as exit cap rate increases", () => {
      for (let i = 1; i < results.length; i++) {
        expect(results[i].irr).toBeLessThan(results[i - 1].irr);
      }
    });

    it("NPV at each computed IRR is approximately zero", () => {
      for (const r of results) {
        const npv = calculateNPV(r.flows, r.irr);
        expect(Math.abs(npv)).toBeLessThan(1.0);
      }
    });
  });

  // ─── 3. Interest Rate Sensitivity ──────────────────────────────────────────
  describe("Interest Rate Sensitivity", () => {
    const interestRates = [0.07, 0.08, 0.09, 0.095];
    const results = interestRates.map((rate) => ({
      rate,
      ...computeScenarioIRR({ acquisitionInterestRate: rate }),
    }));

    it("all scenarios converge", () => {
      for (const r of results) {
        expect(r.converged).toBe(true);
      }
    });

    it("interestRate=0.07 IRR matches golden value", () => {
      expect(results[0].irr).toBeCloseTo(GOLDEN.interestRate[0.07], 4);
    });

    it("interestRate=0.08 IRR matches golden value", () => {
      expect(results[1].irr).toBeCloseTo(GOLDEN.interestRate[0.08], 4);
    });

    it("interestRate=0.09 IRR matches golden value", () => {
      expect(results[2].irr).toBeCloseTo(GOLDEN.interestRate[0.09], 4);
    });

    it("interestRate=0.095 IRR matches golden value", () => {
      expect(results[3].irr).toBeCloseTo(GOLDEN.interestRate[0.095], 4);
    });

    it("IRR decreases monotonically as interest rate increases", () => {
      for (let i = 1; i < results.length; i++) {
        expect(results[i].irr).toBeLessThan(results[i - 1].irr);
      }
    });

    it("NPV at each computed IRR is approximately zero", () => {
      for (const r of results) {
        const npv = calculateNPV(r.flows, r.irr);
        expect(Math.abs(npv)).toBeLessThan(1.0);
      }
    });
  });

  // ─── 4. LTV Sensitivity ───────────────────────────────────────────────────
  describe("LTV Sensitivity", () => {
    const ltvValues = [0.60, 0.65, 0.75];
    const results = ltvValues.map((ltv) => ({
      ltv,
      ...computeScenarioIRR({ acquisitionLTV: ltv }),
    }));

    it("all scenarios converge", () => {
      for (const r of results) {
        expect(r.converged).toBe(true);
      }
    });

    it("LTV=0.60 IRR matches golden value", () => {
      expect(results[0].irr).toBeCloseTo(GOLDEN.ltv[0.60], 4);
    });

    it("LTV=0.65 IRR matches golden value", () => {
      expect(results[1].irr).toBeCloseTo(GOLDEN.ltv[0.65], 4);
    });

    it("LTV=0.75 IRR matches golden value", () => {
      expect(results[2].irr).toBeCloseTo(GOLDEN.ltv[0.75], 4);
    });

    it("IRR increases monotonically as LTV increases (leverage effect)", () => {
      for (let i = 1; i < results.length; i++) {
        expect(results[i].irr).toBeGreaterThan(results[i - 1].irr);
      }
    });

    it("NPV at each computed IRR is approximately zero", () => {
      for (const r of results) {
        const npv = calculateNPV(r.flows, r.irr);
        expect(Math.abs(npv)).toBeLessThan(1.0);
      }
    });

    it("higher LTV means less equity invested (Year 0 outflow smaller in magnitude)", () => {
      // Year 0 flow = -equity = -(purchasePrice * (1 - LTV))
      // Higher LTV → smaller equity → smaller absolute Year 0 outflow
      for (let i = 1; i < results.length; i++) {
        // flows[0] is negative (equity outflow); more negative = more equity
        expect(Math.abs(results[i].flows[0])).toBeLessThan(
          Math.abs(results[i - 1].flows[0]),
        );
      }
    });
  });
});
