import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { rounder, RATIO_ROUNDING } from "../shared/utils.js";
import { roundTo } from "../../domain/types/rounding.js";

export interface LaborBurdenInput {
  /** Base annual wage per FTE in local currency */
  base_wage_per_fte: number;
  /** Number of full-time equivalent employees */
  fte_count: number;
  /** Benefits load as decimal (health + retirement + PTO + workers' comp; e.g. 0.22 = 22%) */
  benefits_load_rate: number;
  /** Employer-side statutory payroll tax rate as decimal (FICA/FUTA/state UI + equivalents; e.g. 0.0765 = 7.65%) */
  employer_payroll_tax_rate: number;
  /** Optional: periods per year for annualization (default 1 = annual) */
  periods_per_year?: number;
  rounding_policy: RoundingPolicy;
}

export interface LaborBurdenOutput {
  /** Total base wages for all FTEs */
  total_base_wages: number;
  /** Employer benefits cost (base × benefits_load_rate) */
  total_benefits_cost: number;
  /** Employer payroll tax cost (base × employer_payroll_tax_rate) */
  total_payroll_tax_cost: number;
  /** Fully burdened labor cost = base + benefits + taxes */
  total_burdened_cost: number;
  /** Burdened cost per FTE per period */
  burdened_cost_per_fte: number;
  /** Effective burden rate above base wages (benefits + taxes combined) */
  effective_burden_rate: number;
  /** Per-period costs (annualized / periods_per_year) */
  per_period: {
    base_wages: number;
    benefits_cost: number;
    payroll_tax_cost: number;
    burdened_cost: number;
  };
}

export function computeLaborBurden(input: LaborBurdenInput): LaborBurdenOutput {
  const r = rounder(input.rounding_policy);
  const ratio = (v: number) => roundTo(v, RATIO_ROUNDING);

  const periods = input.periods_per_year ?? 1;

  const totalBase = r(input.base_wage_per_fte * input.fte_count);
  const totalBenefits = r(totalBase * input.benefits_load_rate);
  const totalPayrollTax = r(totalBase * input.employer_payroll_tax_rate);
  const totalBurdened = r(totalBase + totalBenefits + totalPayrollTax);

  const burdenedPerFte = input.fte_count > 0 ? r(totalBurdened / input.fte_count) : 0;
  const effectiveBurdenRate = ratio(input.benefits_load_rate + input.employer_payroll_tax_rate);

  return {
    total_base_wages: totalBase,
    total_benefits_cost: totalBenefits,
    total_payroll_tax_cost: totalPayrollTax,
    total_burdened_cost: totalBurdened,
    burdened_cost_per_fte: burdenedPerFte,
    effective_burden_rate: effectiveBurdenRate,
    per_period: {
      base_wages: periods > 1 ? r(totalBase / periods) : totalBase,
      benefits_cost: periods > 1 ? r(totalBenefits / periods) : totalBenefits,
      payroll_tax_cost: periods > 1 ? r(totalPayrollTax / periods) : totalPayrollTax,
      burdened_cost: periods > 1 ? r(totalBurdened / periods) : totalBurdened,
    },
  };
}
