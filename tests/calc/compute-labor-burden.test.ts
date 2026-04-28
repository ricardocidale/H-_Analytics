import { describe, it, expect } from "vitest";
import { computeLaborBurden } from "../../calc/analysis/compute-labor-burden.js";
import type { LaborBurdenInput } from "../../calc/analysis/compute-labor-burden.js";

const rounding = { precision: 2, bankers_rounding: false };

// Golden values — hand-calculated:
// US select-service housekeeper: $35,000 base × 1 FTE
//   benefits:     35,000 × 0.22 = 7,700.00
//   payroll tax:  35,000 × 0.0765 = 2,677.50
//   total:        35,000 + 7,700 + 2,677.50 = 45,377.50
//   effective burden rate: 0.22 + 0.0765 = 0.2965
const US_GOLDEN = {
  base: 35_000,
  benefits: 7_700,
  payroll_tax: 2_677.5,
  total: 45_377.5,
  burden_rate: 0.2965,
};

// Spain (ES) hotel manager: €40,000 base × 1 FTE
//   benefits:     40,000 × 0.22 = 8,800.00
//   payroll tax:  40,000 × 0.255 = 10,200.00
//   total:        40,000 + 8,800 + 10,200 = 59,000.00
//   effective burden rate: 0.22 + 0.255 = 0.475
const ES_GOLDEN = {
  base: 40_000,
  benefits: 8_800,
  payroll_tax: 10_200,
  total: 59_000,
  burden_rate: 0.475,
};

function makeInput(overrides: Partial<LaborBurdenInput> = {}): LaborBurdenInput {
  return {
    base_wage_per_fte: 35_000,
    fte_count: 1,
    benefits_load_rate: 0.22,
    employer_payroll_tax_rate: 0.0765,
    rounding_policy: rounding,
    ...overrides,
  };
}

describe("computeLaborBurden", () => {
  describe("US single FTE golden scenario", () => {
    it("total_base_wages equals base_wage_per_fte × fte_count", () => {
      const result = computeLaborBurden(makeInput());
      expect(result.total_base_wages).toBe(US_GOLDEN.base);
    });

    it("total_benefits_cost equals base × benefits_load_rate", () => {
      const result = computeLaborBurden(makeInput());
      expect(result.total_benefits_cost).toBe(US_GOLDEN.benefits);
    });

    it("total_payroll_tax_cost equals base × employer_payroll_tax_rate", () => {
      const result = computeLaborBurden(makeInput());
      expect(result.total_payroll_tax_cost).toBeCloseTo(US_GOLDEN.payroll_tax, 1);
    });

    it("total_burdened_cost equals base + benefits + taxes (additive closure)", () => {
      const result = computeLaborBurden(makeInput());
      expect(result.total_burdened_cost).toBeCloseTo(US_GOLDEN.total, 1);
      // Verify the additive identity directly
      expect(result.total_burdened_cost).toBeCloseTo(
        result.total_base_wages + result.total_benefits_cost + result.total_payroll_tax_cost,
        1
      );
    });

    it("burdened_cost_per_fte equals total_burdened_cost when fte_count = 1", () => {
      const result = computeLaborBurden(makeInput());
      expect(result.burdened_cost_per_fte).toBeCloseTo(result.total_burdened_cost, 1);
    });

    it("effective_burden_rate equals benefits_load_rate + employer_payroll_tax_rate", () => {
      const result = computeLaborBurden(makeInput());
      expect(result.effective_burden_rate).toBeCloseTo(US_GOLDEN.burden_rate, 4);
    });
  });

  describe("Spain (ES) high-payroll-tax scenario", () => {
    it("handles 25.5% employer social security (ES) correctly", () => {
      const result = computeLaborBurden(makeInput({
        base_wage_per_fte: 40_000,
        employer_payroll_tax_rate: 0.255,
      }));
      expect(result.total_payroll_tax_cost).toBeCloseTo(ES_GOLDEN.payroll_tax, 1);
      expect(result.total_burdened_cost).toBeCloseTo(ES_GOLDEN.total, 1);
      expect(result.effective_burden_rate).toBeCloseTo(ES_GOLDEN.burden_rate, 4);
    });
  });

  describe("multi-FTE scaling", () => {
    it("scales linearly with FTE count", () => {
      const single = computeLaborBurden(makeInput({ fte_count: 1 }));
      const triple = computeLaborBurden(makeInput({ fte_count: 3 }));

      expect(triple.total_base_wages).toBeCloseTo(single.total_base_wages * 3, 1);
      expect(triple.total_burdened_cost).toBeCloseTo(single.total_burdened_cost * 3, 1);
    });

    it("burdened_cost_per_fte is stable regardless of FTE count", () => {
      const one = computeLaborBurden(makeInput({ fte_count: 1 }));
      const ten = computeLaborBurden(makeInput({ fte_count: 10 }));

      expect(ten.burdened_cost_per_fte).toBeCloseTo(one.burdened_cost_per_fte, 1);
    });
  });

  describe("periods_per_year breakdown", () => {
    it("per_period.burdened_cost equals total / 12 when periods_per_year = 12", () => {
      const result = computeLaborBurden(makeInput({ periods_per_year: 12 }));
      expect(result.per_period.burdened_cost).toBeCloseTo(result.total_burdened_cost / 12, 1);
    });

    it("per_period costs equal annual when periods_per_year is 1 (default)", () => {
      const result = computeLaborBurden(makeInput());
      expect(result.per_period.burdened_cost).toBeCloseTo(result.total_burdened_cost, 1);
      expect(result.per_period.base_wages).toBeCloseTo(result.total_base_wages, 1);
    });
  });

  describe("zero-benefits edge case", () => {
    it("zero benefits load leaves only payroll tax as burden", () => {
      const result = computeLaborBurden(makeInput({ benefits_load_rate: 0 }));
      expect(result.total_benefits_cost).toBe(0);
      expect(result.effective_burden_rate).toBeCloseTo(0.0765, 4);
      expect(result.total_burdened_cost).toBeCloseTo(result.total_base_wages + result.total_payroll_tax_cost, 1);
    });
  });

  describe("fractional FTE", () => {
    it("handles 0.5 FTE (part-time employee)", () => {
      const full = computeLaborBurden(makeInput({ fte_count: 1 }));
      const half = computeLaborBurden(makeInput({ fte_count: 0.5 }));
      expect(half.total_burdened_cost).toBeCloseTo(full.total_burdened_cost * 0.5, 1);
    });
  });
});
