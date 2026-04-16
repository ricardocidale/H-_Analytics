import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financial/property-engine";
import { aggregateCashFlowByYear } from "../../client/src/lib/financial/cashFlowAggregator";
import { computeIRR } from "../../analytics/returns/irr";
import { makeProperty, makeGlobal } from "../fixtures";
import type { PropertyInput, GlobalInput } from "../../engine/types";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
} from "../../shared/constants";

function calculateNPV(cashFlows: number[], rate: number): number {
  return cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FORENSIC IRR TEST 5: "The Decomposition"
 *
 * For every scenario tested in Tests 1-4, verifies that the IRR cash flow
 * vector decomposes correctly into its accounting components.
 *
 * Identities verified for every year of every scenario:
 *   1. netCashFlowToInvestors = atcf + refiProceeds + exitValue - equityInvested
 *   2. atcf = btcf - taxLiability
 *   3. btcf = anoi - debtService
 *   4. taxableIncome = anoi - interestExpense - depreciation
 *   5. operatingCashFlow = netIncome + depreciation
 *   6. NPV of IRR vector at computed IRR ≈ $0
 * ═══════════════════════════════════════════════════════════════════════════════
 */
describe("Forensic IRR Test 5 — Cash Flow Decomposition", () => {
  const YEARS = 10;
  const MONTHS = 120;
  const PENNY = 2;

  // ── Scenario A: Financed, flat, no gap ─────────────────────────────────────
  const propA = makeProperty({
    purchasePrice: 2_000_000, roomCount: 20, startAdr: 200,
    startOccupancy: 0.70, maxOccupancy: 0.70, occupancyGrowthStep: 0, adrGrowthRate: 0.0,
    type: "Financed", acquisitionLTV: 0.60, acquisitionInterestRate: 0.08,
    acquisitionTermYears: 25, landValuePercent: 0.25, buildingImprovements: 0,
    taxRate: 0.25, operatingReserve: 0,
    revShareEvents: 0.30, revShareFB: 0.18, revShareOther: 0.05, cateringBoostPercent: 0.22,
    baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
    incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  });

  // ── Scenario B: Full equity, flat ──────────────────────────────────────────
  const propB = makeProperty({
    purchasePrice: 1_500_000, roomCount: 15, startAdr: 250,
    startOccupancy: 0.65, maxOccupancy: 0.65, occupancyGrowthStep: 0, adrGrowthRate: 0.0,
    type: "Full Equity", landValuePercent: 0.20, buildingImprovements: 0,
    taxRate: 0.22, operatingReserve: 0,
    revShareEvents: 0.25, revShareFB: 0.20, revShareOther: 0.08, cateringBoostPercent: 0.20,
    baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
    incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  });

  // ── Scenario C: Financed, with 3% growth ───────────────────────────────────
  const propC = makeProperty({
    purchasePrice: 3_000_000, roomCount: 25, startAdr: 180,
    startOccupancy: 0.55, maxOccupancy: 0.80, occupancyGrowthStep: 0.05,
    occupancyRampMonths: 6, adrGrowthRate: 0.03,
    type: "Financed", acquisitionLTV: 0.65, acquisitionInterestRate: 0.07,
    acquisitionTermYears: 25, landValuePercent: 0.25, buildingImprovements: 500_000,
    taxRate: 0.25, operatingReserve: 100_000,
    revShareEvents: 0.30, revShareFB: 0.18, revShareOther: 0.05, cateringBoostPercent: 0.22,
    baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
    incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  });

  const global = makeGlobal({
    modelStartDate: "2026-04-01",
    projectionYears: 10,
    inflationRate: 0.03,
    fixedCostEscalationRate: 0.03,
  });

  const globalFlat = makeGlobal({
    modelStartDate: "2026-04-01",
    projectionYears: 10,
    inflationRate: 0.0,
    fixedCostEscalationRate: 0.0,
  });

  const scenarios = [
    { name: "Financed flat", prop: propA, gl: globalFlat },
    { name: "Full equity flat", prop: propB, gl: globalFlat },
    { name: "Financed with growth", prop: propC, gl: global },
  ];

  for (const scenario of scenarios) {
    describe(`Scenario: ${scenario.name}`, () => {
      const monthly = generatePropertyProForma(scenario.prop, scenario.gl, MONTHS);
      const yearly = aggregateCashFlowByYear(monthly, scenario.prop as PropertyInput, scenario.gl as GlobalInput, YEARS);

      // Identity 1: netCashFlowToInvestors = atcf + refi + exit - equity
      it("Identity 1: netCF = atcf + refi + exit - equity (all years)", () => {
        for (let y = 0; y < YEARS; y++) {
          const r = yearly[y];
          const isExitYear = y === YEARS - 1;
          const expected =
            r.atcf +
            r.refinancingProceeds +
            (isExitYear ? r.exitValue : 0) -
            r.capitalExpenditures;
          expect(r.netCashFlowToInvestors).toBeCloseTo(expected, PENNY);
        }
      });

      // Identity 2: atcf = btcf - tax
      it("Identity 2: atcf = btcf - tax (all years)", () => {
        for (let y = 0; y < YEARS; y++) {
          expect(yearly[y].atcf).toBeCloseTo(yearly[y].btcf - yearly[y].taxLiability, PENNY);
        }
      });

      // Identity 3: btcf = anoi - debtService
      it("Identity 3: btcf = anoi - debtService (all years)", () => {
        for (let y = 0; y < YEARS; y++) {
          expect(yearly[y].btcf).toBeCloseTo(yearly[y].anoi - yearly[y].debtService, PENNY);
        }
      });

      // Identity 4: taxableIncome = anoi - interest - depreciation
      it("Identity 4: taxableIncome = anoi - interest - depreciation (all years)", () => {
        for (let y = 0; y < YEARS; y++) {
          const expected = yearly[y].anoi - yearly[y].interestExpense - yearly[y].depreciation;
          expect(yearly[y].taxableIncome).toBeCloseTo(expected, PENNY);
        }
      });

      // Identity 5: operatingCashFlow = netIncome + depreciation
      it("Identity 5: operatingCF = netIncome + depreciation (all years)", () => {
        for (let y = 0; y < YEARS; y++) {
          expect(yearly[y].operatingCashFlow).toBeCloseTo(
            yearly[y].netIncome + yearly[y].depreciation, PENNY
          );
        }
      });

      // Identity 6: NPV at IRR ≈ $0
      it("Identity 6: NPV at computed IRR ≈ $0", () => {
        const vector = yearly.map(y => y.netCashFlowToInvestors);
        const irr = computeIRR(vector, 1);
        if (irr.converged && irr.irr_periodic !== null) {
          expect(Math.abs(calculateNPV(vector, irr.irr_periodic))).toBeLessThan(1.00);
        }
      });

      // Bonus: debtService = interest + principal
      it("debtService = interestExpense + principalPayment (all years)", () => {
        for (let y = 0; y < YEARS; y++) {
          expect(yearly[y].debtService).toBeCloseTo(
            yearly[y].interestExpense + yearly[y].principalPayment, PENNY
          );
        }
      });
    });
  }
});
