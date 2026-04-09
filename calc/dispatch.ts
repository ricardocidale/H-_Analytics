/**
 * dispatch.ts — Computation Tool Router
 *
 * This file provides a clean dispatch mechanism for executing financial computation
 * tools by name. It maps tool names (strings) to their handler functions, making it
 * easy to invoke any calculation module from a single entry point.
 *
 * The dispatched tools fall into four categories:
 *
 *   Returns Calculations:
 *     - calculate_dcf_npv: Discounted Cash Flow / Net Present Value
 *     - build_irr_cashflow_vector: Internal Rate of Return cash flow construction
 *     - compute_equity_multiple: Total return as a multiple of invested equity
 *     - exit_valuation: Property sale value using cap rate method
 *     - compute_wacc: Weighted Average Cost of Capital (single property)
 *     - compute_portfolio_wacc: Capital-weighted WACC across portfolio
 *     - compute_mirr: Modified Internal Rate of Return
 *
 *   Validation Checks:
 *     - validate_financial_identities: Verify math relationships (Revenue = ADR × Rooms, etc.)
 *     - funding_gate_checks: Ensure funding prerequisites are met before spend
 *     - schedule_reconcile: Verify loan schedule balances tie out
 *     - assumption_consistency_check: Flag conflicting or unreasonable inputs
 *     - export_verification: Ensure exported data matches internal calculations
 *
 *   Analysis Tools:
 *     - consolidate_statements: Combine multiple properties into portfolio view (ASC 810)
 *     - scenario_compare: Side-by-side comparison of different assumption sets
 *     - break_even_analysis: Find occupancy/ADR needed to cover costs
 *     - compute_waterfall: LP/GP equity waterfall with preferred return and promote tiers
 *     - hold_vs_sell: NPV comparison of hold vs. sell decision
 *     - stress_test: Portfolio-level adverse scenario impact analysis
 *     - capex_reserve: FF&E reserve adequacy projection
 *     - revpar_index: STR-style competitive positioning indices (MPI/ARI/RGI)
 *
 *   Financing Tools:
 *     - calculate_debt_yield: Debt yield ratio and max loan reverse-solve
 *     - calculate_dscr: DSCR-based loan sizing
 *     - calculate_prepayment: Prepayment penalty (yield maintenance/step-down/defeasance)
 *     - calculate_sensitivity: DSCR sensitivity matrix (rate × NOI)
 *     - compare_loans: Side-by-side loan scenario comparison
 *
 * The withRounding wrapper ensures all monetary calculations use consistent 2-decimal
 * rounding (no banker's rounding) unless the tool handles rounding itself.
 *
 * Usage: executeComputationTool("calculate_dcf_npv", { cashFlows, discountRate, ... })
 * Returns: JSON string of the result, or null if the tool name is not recognized.
 */
import { DEFAULT_ROUNDING } from "./shared/utils.js";
import {
  dcfSchema, irrVectorSchema, equityMultipleSchema, exitValuationSchema,
  financialIdentitiesSchema, fundingGatesSchema, scheduleReconcileSchema,
  assumptionConsistencySchema, exportVerificationSchema, consolidationSchema,
  scenarioCompareSchema, breakEvenSchema,
  waterfallSchema, holdVsSellSchema, stressTestSchema, capexReserveSchema,
  revparIndexSchema, debtYieldSchema, dscrSchema, prepaymentSchema,
  sensitivitySchema, compareLoanSchema, interestRateSwapSchema,
  centralizedServiceMarginSchema, costOfServicesSchema, propertyMetricsSchema,
  depreciationBasisSchema, debtCapacitySchema, occupancyRampSchema,
  adrProjectionSchema, capRateValuationSchema, costBenchmarksSchema,
  serviceFeeSchema, markupWaterfallSchema, makeVsBuySchema,
  waccSchema, portfolioWaccSchema, mirrSchema,
} from "./shared/schemas.js";
import type { ZodSchema } from "zod";
import { computeDCF } from "./returns/dcf-npv.js";
import { buildIRRVector } from "./returns/irr-vector.js";
import { computeEquityMultiple } from "./returns/equity-multiple.js";
import { computeExitValuation } from "./returns/exit-valuation.js";
import { validateFinancialIdentities } from "./validation/financial-identities.js";
import { checkFundingGates } from "./validation/funding-gates.js";
import { reconcileSchedule } from "./validation/schedule-reconcile.js";
import { checkAssumptionConsistency } from "./validation/assumption-consistency.js";
import { verifyExport } from "./validation/export-verification.js";
import { consolidateStatements } from "./analysis/consolidation.js";
import { compareScenarios } from "./analysis/scenario-compare.js";
import { computeBreakEven } from "./analysis/break-even.js";
import { computeWaterfall } from "./analysis/waterfall.js";
import { computeHoldVsSell } from "./analysis/hold-vs-sell.js";
import { computeStressTest } from "./analysis/stress-test.js";
import { computeCapexReserve } from "./analysis/capex-reserve.js";
import { computeRevPARIndex } from "./analysis/revpar-index.js";
import { computeDebtYield } from "./financing/debt-yield.js";
import { computeDSCR } from "./financing/dscr-calculator.js";
import { computePrepayment } from "./financing/prepayment.js";
import { computeSensitivity } from "./financing/sensitivity.js";
import { compareLoanScenarios } from "./financing/loan-comparison.js";
import { computeInterestRateSwap } from "./financing/interest-rate-swap.js";
import { computeCentralizedServiceMargin } from "./services/dispatch-handler.js";
import { computeCostOfServices } from "./services/cost-of-services.js";
import { computePropertyMetrics } from "./research/property-metrics.js";
import { computeDepreciationBasis } from "./research/depreciation-basis.js";
import { computeDebtCapacity } from "./research/debt-capacity.js";
import { computeOccupancyRamp } from "./research/occupancy-ramp.js";
import { computeADRProjection } from "./research/adr-projection.js";
import { computeCapRateValuation } from "./research/cap-rate-valuation.js";
import { computeCostBenchmarks } from "./research/cost-benchmarks.js";
import { computeServiceFee } from "./research/service-fee.js";
import { computeMarkupWaterfall } from "./research/markup-waterfall.js";
import { computeMakeVsBuy } from "./research/make-vs-buy.js";
import { computeWACC, computePortfolioWACC } from "./returns/wacc.js";
import { computeMIRR } from "./returns/mirr.js";

type ToolInput = Record<string, unknown>;
type ToolFn = (input: never) => unknown;
type ToolHandler = (input: ToolInput) => unknown;

const withRounding = (fn: ToolFn): ToolHandler =>
  (input) => fn({ ...input, rounding_policy: DEFAULT_ROUNDING } as never);

const wrap = (fn: ToolFn): ToolHandler => (input) => fn(input as never);

const TOOL_SCHEMAS: Record<string, ZodSchema> = {
  calculate_dcf_npv: dcfSchema,
  build_irr_cashflow_vector: irrVectorSchema,
  compute_equity_multiple: equityMultipleSchema,
  exit_valuation: exitValuationSchema,
  validate_financial_identities: financialIdentitiesSchema,
  funding_gate_checks: fundingGatesSchema,
  schedule_reconcile: scheduleReconcileSchema,
  assumption_consistency_check: assumptionConsistencySchema,
  export_verification: exportVerificationSchema,
  consolidate_statements: consolidationSchema,
  scenario_compare: scenarioCompareSchema,
  break_even_analysis: breakEvenSchema,
  compute_waterfall: waterfallSchema,
  hold_vs_sell: holdVsSellSchema,
  stress_test: stressTestSchema,
  capex_reserve: capexReserveSchema,
  revpar_index: revparIndexSchema,
  calculate_debt_yield: debtYieldSchema,
  calculate_dscr: dscrSchema,
  calculate_prepayment: prepaymentSchema,
  calculate_sensitivity: sensitivitySchema,
  compare_loans: compareLoanSchema,
  interest_rate_swap: interestRateSwapSchema,
  centralized_service_margin: centralizedServiceMarginSchema,
  cost_of_services_aggregator: costOfServicesSchema,
  compute_property_metrics: propertyMetricsSchema,
  compute_depreciation_basis: depreciationBasisSchema,
  compute_debt_capacity: debtCapacitySchema,
  compute_occupancy_ramp: occupancyRampSchema,
  compute_adr_projection: adrProjectionSchema,
  compute_cap_rate_valuation: capRateValuationSchema,
  compute_cost_benchmarks: costBenchmarksSchema,
  compute_service_fee: serviceFeeSchema,
  compute_markup_waterfall: markupWaterfallSchema,
  compute_make_vs_buy: makeVsBuySchema,
  compute_wacc: waccSchema,
  compute_portfolio_wacc: portfolioWaccSchema,
  compute_mirr: mirrSchema,
};

const TOOL_DISPATCH: Record<string, ToolHandler> = {
  calculate_dcf_npv: withRounding(computeDCF),
  build_irr_cashflow_vector: wrap(buildIRRVector),
  compute_equity_multiple: withRounding(computeEquityMultiple),
  exit_valuation: withRounding(computeExitValuation),
  validate_financial_identities: withRounding(validateFinancialIdentities),
  funding_gate_checks: wrap(checkFundingGates),
  schedule_reconcile: wrap(reconcileSchedule),
  assumption_consistency_check: wrap(checkAssumptionConsistency),
  export_verification: wrap(verifyExport),
  consolidate_statements: withRounding(consolidateStatements),
  scenario_compare: wrap(compareScenarios),
  break_even_analysis: wrap(computeBreakEven),
  compute_waterfall: withRounding(computeWaterfall),
  hold_vs_sell: withRounding(computeHoldVsSell),
  stress_test: withRounding(computeStressTest),
  capex_reserve: withRounding(computeCapexReserve),
  revpar_index: withRounding(computeRevPARIndex),
  calculate_debt_yield: withRounding(computeDebtYield),
  calculate_dscr: withRounding(computeDSCR),
  calculate_prepayment: withRounding(computePrepayment),
  calculate_sensitivity: withRounding(computeSensitivity),
  compare_loans: (input) => compareLoanScenarios((input as ToolInput).scenarios as never ?? []),
  interest_rate_swap: withRounding(computeInterestRateSwap as ToolFn),
  centralized_service_margin: withRounding(computeCentralizedServiceMargin),
  cost_of_services_aggregator: (input) => computeCostOfServices(
    (input as ToolInput).feesByCategory as Record<string, number>,
    (input as ToolInput).templates as never,
  ),
  compute_property_metrics: wrap(computePropertyMetrics as ToolFn),
  compute_depreciation_basis: wrap(computeDepreciationBasis as ToolFn),
  compute_debt_capacity: wrap(computeDebtCapacity as ToolFn),
  compute_occupancy_ramp: wrap(computeOccupancyRamp as ToolFn),
  compute_adr_projection: wrap(computeADRProjection as ToolFn),
  compute_cap_rate_valuation: withRounding(computeCapRateValuation as ToolFn),
  compute_cost_benchmarks: withRounding(computeCostBenchmarks as ToolFn),
  compute_service_fee: wrap(computeServiceFee as ToolFn),
  compute_markup_waterfall: wrap(computeMarkupWaterfall as ToolFn),
  compute_make_vs_buy: withRounding(computeMakeVsBuy as ToolFn),
  compute_wacc: withRounding(computeWACC as ToolFn),
  compute_portfolio_wacc: withRounding(computePortfolioWACC as ToolFn),
  compute_mirr: withRounding(computeMIRR as ToolFn),
};

/**
 * Execute a computation tool by name. Returns a JSON string of the result,
 * or null if the tool name doesn't match any registered handler.
 * Errors during execution are caught and returned as JSON error objects
 * rather than thrown, so callers always get a parseable response.
 */
export function executeComputationTool(name: string, input: Record<string, unknown>): string | null {
  const handler = TOOL_DISPATCH[name];
  if (!handler) return null;
  try {
    const schema = TOOL_SCHEMAS[name];
    if (schema) {
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        return JSON.stringify({ error: `Validation failed: ${parsed.error.issues.map(i => i.message).join("; ")}` });
      }
    }
    return JSON.stringify(handler(input));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Computation failed: ${msg}` });
  }
}

export function isComputationTool(name: string): boolean {
  return name in TOOL_DISPATCH;
}
