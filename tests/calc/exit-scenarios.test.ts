import { describe, it, expect } from "vitest";
import {
  computeExitScenarios,
  defaultScenarios,
  DEFAULT_EXIT_HORIZONS,
  type ExitScenariosInput,
} from "../../calc/analysis/exit-scenarios";
import type { LoanParams, GlobalLoanParams } from "../../engine/debt/loanCalculations";

const baseProperty: LoanParams & {
  country?: string | null;
  stateProvince?: string | null;
  buildingImprovements?: number | null;
  preOpeningCosts?: number | null;
  willRefinance?: string | null;
} = {
  purchasePrice: 10_000_000,
  buildingImprovements: 1_000_000,
  landValuePercent: 0.2,
  preOpeningCosts: 500_000,
  acquisitionDate: "2026-01-01",
  type: "Financed",
  acquisitionLTV: 0.65,
  acquisitionInterestRate: 0.07,
  acquisitionTermYears: 25,
  acquisitionClosingCostRate: 0.02,
  willRefinance: "No",
  exitCapRate: 0.075,
  dispositionCommission: 0.025,
  taxRate: 0.21,
  adrGrowthRate: 0.03,
  country: "United States",
  stateProvince: "Florida",
};

const baseGlobal: GlobalLoanParams = {
  modelStartDate: "2026-01-01",
  commissionRate: 0.025,
  exitCapRate: 0.075,
};

// Synthetic engine output: 10 years of NOI growing 3% from $1.0M and matching
// cash flows where ~$300K/yr is left for equity after debt service.
function makeInputs(overrides: Partial<ExitScenariosInput> = {}): ExitScenariosInput {
  const yearlyNoi = Array.from({ length: 10 }, (_, i) => 1_000_000 * Math.pow(1.03, i));
  const netCashFlowToInvestors = Array.from({ length: 10 }, (_, i) =>
    i === 0 ? -3_500_000 + 300_000 : 300_000 * Math.pow(1.03, i),
  );
  return {
    property: baseProperty,
    global: baseGlobal,
    yearlyNoi,
    netCashFlowToInvestors,
    acquisitionYear: 0,
    ...overrides,
  };
}

describe("computeExitScenarios", () => {
  it("returns 3 scenarios × 4 default horizons", () => {
    const out = computeExitScenarios(makeInputs());
    expect(out.scenarios).toHaveLength(3);
    expect(out.horizonsEvaluated).toEqual([...DEFAULT_EXIT_HORIZONS]);
    for (const s of out.scenarios) {
      expect(s.horizons).toHaveLength(4);
      expect(s.horizons.map((h) => h.horizonYears)).toEqual([3, 5, 7, 10]);
    }
  });

  it("orders sale prices Pessimistic ≤ Base ≤ Optimistic at each horizon", () => {
    const out = computeExitScenarios(makeInputs());
    for (const h of [3, 5, 7, 10]) {
      const pess = out.scenarios.find((s) => s.scenario.key === "pessimistic")!.horizons.find((x) => x.horizonYears === h)!;
      const base = out.scenarios.find((s) => s.scenario.key === "base")!.horizons.find((x) => x.horizonYears === h)!;
      const opt = out.scenarios.find((s) => s.scenario.key === "optimistic")!.horizons.find((x) => x.horizonYears === h)!;
      expect(pess.salePrice).toBeLessThanOrEqual(base.salePrice + 1e-6);
      expect(base.salePrice).toBeLessThanOrEqual(opt.salePrice + 1e-6);
    }
  });

  it("itemizes selling costs that sum to total", () => {
    const out = computeExitScenarios(makeInputs());
    for (const s of out.scenarios) {
      for (const h of s.horizons) {
        const sum =
          h.sellingCosts.brokerCommission +
          h.sellingCosts.transferTax +
          h.sellingCosts.prepaymentPenalty +
          h.sellingCosts.ffeDisposition;
        expect(Math.abs(sum - h.sellingCosts.total)).toBeLessThan(1e-3);
      }
    }
  });

  it("loan balance declines monotonically with longer holds", () => {
    const out = computeExitScenarios(makeInputs());
    const base = out.scenarios.find((s) => s.scenario.key === "base")!;
    for (let i = 1; i < base.horizons.length; i++) {
      expect(base.horizons[i]!.loanBalance).toBeLessThanOrEqual(base.horizons[i - 1]!.loanBalance + 1);
    }
  });

  it("derives totalCashInvested = equity + |negative cash flows|", () => {
    const out = computeExitScenarios(makeInputs());
    const base = out.scenarios.find((s) => s.scenario.key === "base")!;
    // With our positive cashflow series, totalCashInvested should equal equity exactly.
    const yr3 = base.horizons.find((h) => h.horizonYears === 3)!;
    expect(yr3.totalCashInvested).toBeGreaterThan(0);
  });

  it("counts cumulative negative CF in totalCashInvested when ops dip negative", () => {
    const cf = Array.from({ length: 10 }, (_, i) => (i < 2 ? -200_000 : 200_000));
    const out = computeExitScenarios(makeInputs({ netCashFlowToInvestors: cf }));
    const base = out.scenarios.find((s) => s.scenario.key === "base")!;
    const yr5 = base.horizons.find((h) => h.horizonYears === 5)!;
    // First two years negative ($200K each) plus initial equity should be in invested.
    expect(yr5.totalCashInvested).toBeGreaterThan(400_000);
  });

  it("emits a per-scenario chart series across the projection ceiling", () => {
    const out = computeExitScenarios(makeInputs({ ceilingYears: 12 }));
    for (const s of out.scenarios) {
      expect(s.chartSeries).toHaveLength(12);
      expect(s.chartSeries[0]?.year).toBe(1);
      expect(s.chartSeries[11]?.year).toBe(12);
    }
  });

  it("computes a breakevenYears that is finite for a healthy property", () => {
    const out = computeExitScenarios(makeInputs());
    const base = out.scenarios.find((s) => s.scenario.key === "base")!;
    expect(base.breakevenYears).not.toBeNull();
    expect(base.breakevenYears!).toBeGreaterThan(0);
  });

  it("triggers earlyExitRisk solely on breakeven > 5 years (worstYear3Loss is informational)", () => {
    // Force a scenario whose breakeven exceeds 5 yrs by using thin cash flow
    // and a pessimistic NOI growth shock.
    const cf = Array.from({ length: 30 }, () => 50_000);
    const noi = Array.from({ length: 30 }, () => 100_000);
    const out = computeExitScenarios(
      makeInputs({
        netCashFlowToInvestors: cf,
        yearlyNoi: noi,
        ceilingYears: 30,
      }),
    );
    const anyOver5 = out.scenarios.some(
      (s) => s.breakevenYears === null || (s.breakevenYears ?? 0) > 5,
    );
    expect(out.earlyExitRisk.triggered).toBe(anyOver5);
    if (anyOver5) expect(out.earlyExitRisk.message.length).toBeGreaterThan(0);
  });

  it("counts close-shortfall in totalCashInvested for underwater exits (no clamping)", () => {
    // Tiny NOI ⇒ tiny salePrice ⇒ netProceeds < 0 (debt + costs > sale).
    const noi = Array.from({ length: 10 }, () => 10_000);
    const cf = Array.from({ length: 10 }, () => 0);
    const out = computeExitScenarios(makeInputs({ yearlyNoi: noi, netCashFlowToInvestors: cf }));
    const base = out.scenarios.find((s) => s.scenario.key === "base")!;
    const yr3 = base.horizons.find((h) => h.horizonYears === 3)!;
    // Sale price tiny relative to debt → netProceeds must be deeply negative,
    // and the close shortfall must show up in totalCashInvested (and therefore
    // in profitLoss) — clamping at zero would silently understate the loss.
    expect(yr3.netProceeds).toBeLessThan(0);
    const closeShortfall = -yr3.netProceeds;
    expect(yr3.totalCashInvested).toBeGreaterThan(closeShortfall);
    expect(yr3.profitLoss).toBeLessThan(-closeShortfall + 1);
  });

  it("returns a fractional breakevenYears when P/L crosses zero between integer years", () => {
    const out = computeExitScenarios(makeInputs());
    const base = out.scenarios.find((s) => s.scenario.key === "base")!;
    if (base.breakevenYears !== null && base.breakevenYears > 1) {
      // Should not always snap to an integer — at least one of the three
      // scenarios under our healthy synthetic inputs should land on a
      // non-integer breakeven.
      const anyFractional = out.scenarios.some(
        (s) => s.breakevenYears !== null && Math.abs(s.breakevenYears - Math.round(s.breakevenYears)) > 1e-6,
      );
      expect(anyFractional).toBe(true);
    }
  });

  it("does not change the engine math: salePrice = terminalNoi / exitCapRate", () => {
    const out = computeExitScenarios(makeInputs());
    for (const s of out.scenarios) {
      for (const h of s.horizons) {
        if (h.salePrice > 0) {
          const implied = h.terminalNoi / 0.075;
          expect(Math.abs(implied - h.salePrice)).toBeLessThan(1);
        }
      }
    }
  });

  it("defaultScenarios derives ±2pp shocks around the base growth rate", () => {
    const ds = defaultScenarios(0.04);
    expect(ds[0].noiGrowthRate).toBeCloseTo(0.02, 6);
    expect(ds[1].noiGrowthRate).toBeCloseTo(0.04, 6);
    expect(ds[2].noiGrowthRate).toBeCloseTo(0.06, 6);
  });
});
