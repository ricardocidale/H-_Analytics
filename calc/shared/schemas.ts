/**
 * calc/shared/schemas.ts — Zod validation schemas for the calculation engine's API layer.
 *
 * PURPOSE:
 * Every calculation skill exposed through `calc/dispatch.ts` accepts a JSON payload
 * from the client (or server). Before the payload reaches any financial function,
 * it is validated against the matching Zod schema defined here. This ensures that
 * impossible or nonsensical inputs (negative room counts, missing cash-flow arrays,
 * cap rates above 100%, etc.) are rejected with clear error messages rather than
 * producing silently wrong financial projections.
 *
 * HOW IT FITS THE SYSTEM:
 * ┌──────────┐     ┌────────────┐     ┌────────────────┐     ┌──────────────────┐
 * │  Client  │ ──► │ dispatch() │ ──► │ schemas.ts     │ ──► │ calc function    │
 * │ request  │     │ (router)   │     │ (Zod validate) │     │ (pure math)      │
 * └──────────┘     └────────────┘     └────────────────┘     └──────────────────┘
 *
 * Each schema mirrors the TypeScript interface of its corresponding calculation
 * function (e.g., `dcfSchema` validates `DCFInput`, `breakEvenSchema` validates
 * `BreakEvenInput`). The schemas live in `shared/` because they are used by both
 * the dispatch layer and the server-side calculation checker.
 *
 * KEY FINANCIAL TERMS VALIDATED HERE:
 * - discount_rate / exit_cap_rate: Capitalization rates used to convert income
 *   streams into present values. Must be positive (dividing by zero = crash).
 * - NOI (Net Operating Income): Revenue minus operating expenses, before debt
 *   service. Core input for DCF, break-even, DSCR, and exit valuation.
 * - DSCR (Debt Service Coverage Ratio): NOI / Annual Debt Service. Lenders
 *   typically require ≥ 1.25×.
 * - LTV (Loan-to-Value): Loan amount / Property value. Capped at a maximum
 *   (e.g., 0.75 = 75%) to limit lender risk.
 * - FF&E Reserve Rate: Percentage of revenue set aside for furniture, fixtures,
 *   and equipment replacement. Industry standard is 3–5%.
 * - ADR (Average Daily Rate): Mean room rate charged per occupied room per night.
 * - SAFE (Simple Agreement for Future Equity): Early-stage funding instrument
 *   used by the management company before hotel operations begin.
 * - IRR (Internal Rate of Return): The discount rate that makes NPV = 0.
 *   Requires at least one negative (investment) and one positive (return) cash flow.
 * - Equity Multiple: Total distributions / Total equity invested. A 2.0× multiple
 *   means the investor doubled their money.
 *
 * IMPORTANT: These schemas strip `rounding_policy` because the dispatch layer
 * injects it separately from the global configuration. The calculation functions
 * receive the full typed input after merge.
 */
import { z } from "zod";

export const dcfSchema = z.object({
  cash_flows: z.array(z.number()).min(1),
  discount_rate: z.number().positive(),
  periods_per_year: z.number().int().positive().optional(),
  irr_cross_check: z.number().optional(),
  tolerance: z.number().positive().optional(),
});

export const irrVectorSchema = z.object({
  equity_invested: z.number().positive(),
  acquisition_year: z.number().int().min(0),
  yearly_fcfe: z.array(z.number()),
  refinancing_proceeds: z.array(z.number()).optional(),
  exit_proceeds: z.number().optional(),
  projection_years: z.number().int().positive(),
  include_exit: z.boolean().optional(),
});

export const equityMultipleSchema = z.object({
  cash_flows: z.array(z.number()).min(1),
  label: z.string().optional(),
});

export const exitValuationSchema = z.object({
  stabilized_noi: z.number().positive(),
  exit_cap_rate: z.number().positive(),
  commission_rate: z.number().min(0).max(0.10).optional(),
  outstanding_debt: z.number().min(0).optional(),
  other_closing_costs: z.number().min(0).optional(),
  room_count: z.number().int().positive().optional(),
  property_name: z.string().optional(),
});

export const financialIdentitiesSchema = z.object({
  period_label: z.string().optional(),
  balance_sheet: z.object({
    total_assets: z.number(),
    total_liabilities: z.number(),
    total_equity: z.number(),
  }),
  income_statement: z.object({
    revenue: z.number().optional(),
    total_expenses: z.number().optional(),
    gop: z.number().optional(),
    agop: z.number().optional(),
    noi: z.number(),
    anoi: z.number().optional(),
    interest_expense: z.number(),
    depreciation: z.number(),
    income_tax: z.number(),
    net_income: z.number(),
  }),
  cash_flow_statement: z.object({
    operating_cash_flow: z.number(),
    financing_cash_flow: z.number(),
    net_cash_change: z.number().optional(),
    beginning_cash: z.number().optional(),
    ending_cash: z.number(),
    principal_payment: z.number().optional(),
    refinancing_proceeds: z.number().optional(),
  }),
  tolerance: z.number().positive().optional(),
});

export const fundingGatesSchema = z.object({
  entity_type: z.enum(["property", "management_company", "portfolio"]),
  entity_name: z.string(),
  operations_start_date: z.string().optional(),
  funding_date: z.string().optional(),
  monthly_ending_cash: z.array(z.number()),
  final_debt_outstanding: z.number().optional(),
  monthly_distributions: z.array(z.number()).optional(),
});

export const scheduleReconcileSchema = z.object({
  property_name: z.string().optional(),
  schedule: z.array(z.object({
    month: z.number().int(),
    expected_interest: z.number(),
    expected_principal: z.number(),
    expected_payment: z.number().optional(),
    expected_ending_balance: z.number(),
  })),
  engine_outputs: z.array(z.object({
    month: z.number().int(),
    actual_interest: z.number(),
    actual_principal: z.number(),
    actual_payment: z.number().optional(),
    actual_ending_balance: z.number(),
  })),
  tolerance: z.number().positive().optional(),
});

export const assumptionConsistencySchema = z.object({
  global_assumptions: z.object({
    model_start_date: z.string(),
    projection_years: z.number().int().positive().optional(),
    company_ops_start_date: z.string().optional(),
    inflation_rate: z.number().optional(),
    fixed_cost_escalation_rate: z.number().optional(),
    base_management_fee: z.number().optional(),
    incentive_management_fee: z.number().optional(),
    capital_raise_1_date: z.string().optional(),
    capital_raise_1_amount: z.number().optional(),
    capital_raise_2_date: z.string().optional(),
    capital_raise_2_amount: z.number().optional(),
    exit_cap_rate: z.number().optional(),
    debt_assumptions: z.object({
      interest_rate: z.number().optional(),
      amortization_years: z.number().int().optional(),
      acq_ltv: z.number().optional(),
      refi_ltv: z.number().optional(),
    }).optional(),
  }),
  properties: z.array(z.object({
    name: z.string(),
    operations_start_date: z.string(),
    acquisition_date: z.string().optional(),
    purchase_price: z.number(),
    room_count: z.number().int().optional(),
    start_adr: z.number().optional(),
    start_occupancy: z.number().optional(),
    max_occupancy: z.number().optional(),
    type: z.string().optional(),
    will_refinance: z.string().optional(),
    refinance_date: z.string().optional(),
    exit_cap_rate: z.number().optional(),
    land_value_percent: z.number().optional(),
  })).optional(),
});

export const exportVerificationSchema = z.object({
  export_format: z.enum(["excel", "pdf", "pptx", "csv", "png_chart", "png_table"]),
  export_source: z.enum(["income_statement", "cash_flow", "balance_sheet", "investment_analysis", "dashboard", "company_financials", "consolidated"]),
  expected_sections: z.array(z.string()).optional(),
  sample_values: z.array(z.object({
    label: z.string(),
    expected_value: z.number(),
    exported_value: z.number(),
    tolerance: z.number().optional(),
  })).optional(),
  expected_year_count: z.number().int().optional(),
  expected_property_count: z.number().int().optional(),
  actual_sections: z.array(z.string()).optional(),
  actual_year_count: z.number().int().optional(),
  actual_property_count: z.number().int().optional(),
});

const scenarioMetricsSchema = z.object({
  total_revenue: z.array(z.number()).optional(),
  gop: z.array(z.number()).optional(),
  agop: z.array(z.number()).optional(),
  noi: z.array(z.number()),
  anoi: z.array(z.number()).optional(),
  net_income: z.array(z.number()).optional(),
  ending_cash: z.array(z.number()).optional(),
  irr: z.number(),
  equity_multiple: z.number().optional(),
  average_dscr: z.number().optional(),
  exit_value: z.number().optional(),
});

export { scenarioMetricsSchema };

export const consolidationSchema = z.object({
  consolidation_type: z.enum(["properties_only", "full_entity"]),
  period: z.string().optional(),
  property_statements: z.array(z.object({
    name: z.string(),
    revenue: z.number(),
    operating_expenses: z.number().optional(),
    gop: z.number().optional(),
    agop: z.number().optional(),
    noi: z.number(),
    anoi: z.number().optional(),
    management_fees: z.number().optional(),
    ffe_reserve: z.number().optional(),
    interest_expense: z.number().optional(),
    depreciation: z.number().optional(),
    income_tax: z.number().optional(),
    net_income: z.number(),
    operating_cash_flow: z.number().optional(),
    financing_cash_flow: z.number().optional(),
    ending_cash: z.number().optional(),
    total_assets: z.number().optional(),
    total_liabilities: z.number().optional(),
    total_equity: z.number().optional(),
  })),
  management_company: z.object({
    fee_revenue: z.number(),
    operating_expenses: z.number().optional(),
    net_income: z.number().optional(),
    capital_raise_funding: z.number().optional(),
    ending_cash: z.number().optional(),
    total_assets: z.number().optional(),
    total_liabilities: z.number().optional(),
    total_equity: z.number().optional(),
  }).optional(),
});

export const scenarioCompareSchema = z.object({
  baseline_label: z.string(),
  alternative_label: z.string(),
  assumption_changes: z.array(z.object({
    field: z.string(),
    baseline_value: z.string(),
    alternative_value: z.string(),
  })).optional(),
  baseline_metrics: scenarioMetricsSchema,
  alternative_metrics: scenarioMetricsSchema,
});

export const breakEvenSchema = z.object({
  property_name: z.string().optional(),
  room_count: z.number().int().positive(),
  adr: z.number().positive(),
  days_per_month: z.number().positive().optional(),
  variable_cost_rate: z.number().min(0).max(1),
  fixed_costs_monthly: z.number().min(0),
  management_fee_rate: z.number().min(0).max(0.20).optional(),
  ffe_reserve_rate: z.number().min(0).max(0.15).optional(),
  monthly_debt_service: z.number().min(0).optional(),
  monthly_income_tax_estimate: z.number().min(0).optional(),
  ancillary_revenue_pct: z.number().min(0).optional(),
});

const waterfallTierSchema = z.object({
  label: z.string(),
  hurdle_irr: z.number().min(0),
  lp_split: z.number().min(0).max(1),
  gp_split: z.number().min(0).max(1),
});

export const waterfallSchema = z.object({
  total_equity_invested: z.number().positive(),
  lp_equity: z.number().min(0),
  gp_equity: z.number().min(0),
  distributable_cash_flows: z.array(z.number()).min(1),
  preferred_return: z.number().min(0),
  tiers: z.array(waterfallTierSchema).min(1),
  catch_up_rate: z.number().min(0).max(1).optional(),
  catch_up_to_gp_pct: z.number().min(0).max(1).optional(),
});

export const holdVsSellSchema = z.object({
  property_name: z.string().optional(),
  current_noi: z.number(),
  noi_growth_rate: z.number(),
  current_market_value: z.number().positive(),
  exit_cap_rate: z.number().positive(),
  future_exit_cap_rate: z.number().positive().optional(),
  remaining_hold_years: z.number().int().positive(),
  discount_rate: z.number().positive(),
  outstanding_debt: z.number().min(0).optional(),
  commission_rate: z.number().min(0).max(0.10).optional(),
  annual_capex: z.number().min(0).optional(),
  annual_debt_service: z.number().min(0).optional(),
  original_cost_basis: z.number().min(0).optional(),
  capital_gains_rate: z.number().min(0).max(1).optional(),
  depreciation_recapture_rate: z.number().min(0).max(1).optional(),
  accumulated_depreciation: z.number().min(0).optional(),
});

const stressScenarioSchema = z.object({
  label: z.string(),
  adr_shock_pct: z.number(),
  occupancy_shock_pct: z.number(),
  expense_shock_pct: z.number().optional(),
  cap_rate_shock_bps: z.number().optional(),
  revenue_shock_pct: z.number().optional(),
});

export const stressTestSchema = z.object({
  property_name: z.string().optional(),
  base_adr: z.number().positive(),
  base_occupancy: z.number().min(0).max(1),
  base_noi: z.number(),
  room_count: z.number().int().positive(),
  annual_revenue: z.number(),
  annual_debt_service: z.number().min(0).optional(),
  exit_cap_rate: z.number().positive(),
  hold_period_years: z.number().int().positive(),
  scenarios: z.array(stressScenarioSchema).min(1),
});

const capexCategorySchema = z.object({
  label: z.string(),
  useful_life_years: z.number().positive(),
  replacement_cost: z.number().min(0),
  age_years: z.number().min(0).optional(),
});

export const capexReserveSchema = z.object({
  property_name: z.string().optional(),
  room_count: z.number().int().positive(),
  annual_revenue: z.number(),
  ffe_reserve_rate: z.number().min(0).max(0.15).optional(),
  initial_reserve_balance: z.number().min(0).optional(),
  hold_period_years: z.number().int().positive(),
  revenue_growth_rate: z.number().optional(),
  capex_categories: z.array(capexCategorySchema).optional(),
  inflation_rate: z.number().optional(),
});

export const revparIndexSchema = z.object({
  property_name: z.string().optional(),
  room_count: z.number().int().positive(),
  adr: z.number().positive(),
  occupancy: z.number().min(0).max(1),
  market_adr: z.number().positive(),
  market_occupancy: z.number().min(0).max(1),
  comp_set_adr: z.number().positive().optional(),
  comp_set_occupancy: z.number().min(0).max(1).optional(),
});

export const debtYieldSchema = z.object({
  noi_annual: z.number(),
  loan_amount: z.number().positive().optional(),
  min_debt_yield: z.number().positive().optional(),
  purchase_price: z.number().positive().optional(),
  ltv_max: z.number().min(0).max(1).optional(),
});

export const dscrSchema = z.object({
  noi_annual: z.number(),
  interest_rate_annual: z.number().min(0),
  term_months: z.number().int().positive(),
  amortization_months: z.number().int().positive(),
  io_months: z.number().int().min(0).optional(),
  min_dscr: z.number().positive(),
  purchase_price: z.number().positive().optional(),
  ltv_max: z.number().min(0).max(1).optional(),
});

export const prepaymentSchema = z.object({
  outstanding_balance: z.number().positive().optional(),
  schedule: z.array(z.object({
    month: z.number().int().min(0),
    beginning_balance: z.number(),
    interest: z.number(),
    principal: z.number(),
    payment: z.number(),
    ending_balance: z.number(),
  })).optional(),
  prepayment_month: z.number().int().min(0).optional(),
  loan_rate_annual: z.number().min(0),
  term_months: z.number().int().positive(),
  prepayment_type: z.enum(["yield_maintenance", "step_down", "defeasance"]),
  treasury_rate_annual: z.number().min(0).optional(),
  step_down_schedule: z.array(z.number()).optional(),
  defeasance_fee_pct: z.number().min(0).optional(),
});

export const sensitivitySchema = z.object({
  noi_annual: z.number(),
  loan_amount: z.number().positive(),
  interest_rate_annual: z.number().min(0),
  amortization_months: z.number().int().positive(),
  term_months: z.number().int().positive(),
  io_months: z.number().int().min(0).optional(),
  rate_shocks_bps: z.array(z.number()),
  noi_shocks_pct: z.array(z.number()),
  min_dscr: z.number().positive().optional(),
});

const financingInputSchema = z.object({
  purchase_date: z.string(),
  purchase_price: z.number().positive(),
  loan_type: z.enum(["amortizing", "IO_then_amortizing"]),
  interest_rate_annual: z.number().min(0),
  term_months: z.number().int().positive(),
  amortization_months: z.number().int().positive(),
  ltv_max: z.number().min(0).max(1).optional(),
  loan_amount_override: z.number().positive().optional(),
  closing_cost_pct: z.number().min(0),
  fixed_fees: z.number().min(0).optional(),
  upfront_reserves: z.number().min(0).optional(),
  accounting_policy_ref: z.object({
    loan_origination_cost_treatment: z.string(),
    closing_cost_treatment: z.string(),
  }),
});

const loanScenarioSchema = z.object({
  label: z.string(),
  input: financingInputSchema,
  noi_annual: z.number().optional(),
});

export const compareLoanSchema = z.object({
  scenarios: z.array(loanScenarioSchema).min(2),
});

export const interestRateSwapSchema = z.object({
  notional_amount: z.number().positive(),
  fixed_rate: z.number().min(0),
  floating_rate_current: z.number().min(0),
  floating_rate_spread: z.number(),
  swap_term_years: z.number().int().positive(),
  payment_frequency: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(12)]),
  rate_scenarios: z.array(z.number()).optional(),
  noi_annual: z.number().optional(),
});

export const centralizedServiceMarginSchema = z.object({
  serviceRevenue: z.number(),
  markup: z.number().min(0),
});

export const costOfServicesSchema = z.object({
  feesByCategory: z.record(z.string(), z.number()),
  templates: z.array(z.object({
    name: z.string(),
    serviceModel: z.enum(["centralized", "direct"]),
    serviceMarkup: z.number().min(0),
    isActive: z.boolean(),
  })),
});

export const propertyMetricsSchema = z.object({
  room_count: z.number().int().positive(),
  adr: z.number().min(0),
  occupancy: z.number().min(0).max(1),
  cost_rate_rooms: z.number().min(0).optional(),
  cost_rate_fb: z.number().min(0).optional(),
  cost_rate_admin: z.number().min(0).optional(),
  cost_rate_marketing: z.number().min(0).optional(),
  cost_rate_property_ops: z.number().min(0).optional(),
  cost_rate_utilities: z.number().min(0).optional(),
  cost_rate_ffe: z.number().min(0).optional(),
  cost_rate_other: z.number().min(0).optional(),
  rev_share_events: z.number().min(0).optional(),
  rev_share_fb: z.number().min(0).optional(),
  rev_share_other: z.number().min(0).optional(),
  catering_boost_pct: z.number().min(0).optional(),
  base_management_fee_rate: z.number().min(0).optional(),
  incentive_management_fee_rate: z.number().min(0).optional(),
  days_per_month: z.number().positive().optional(),
});

export const depreciationBasisSchema = z.object({
  purchase_price: z.number().positive(),
  land_value_pct: z.number().min(0).max(1),
  building_improvements: z.number().min(0).optional(),
  depreciation_years: z.number().int().positive().optional(),
});

export const debtCapacitySchema = z.object({
  annual_noi: z.number(),
  dscr_target: z.number().positive(),
  interest_rate: z.number().min(0),
  term_years: z.number().int().positive(),
  property_value: z.number().positive().optional(),
});

export const occupancyRampSchema = z.object({
  start_occupancy: z.number().min(0).max(1),
  max_occupancy: z.number().min(0).max(1),
  ramp_months: z.number().int().positive(),
  growth_step: z.number().min(0),
  stabilization_months: z.number().int().min(0),
  adr: z.number().min(0).optional(),
  room_count: z.number().int().positive().optional(),
  days_per_month: z.number().positive().optional(),
});

export const adrProjectionSchema = z.object({
  start_adr: z.number().min(0),
  growth_rate: z.number(),
  inflation_rate: z.number().optional(),
  projection_years: z.number().int().positive(),
  occupancy: z.number().min(0).max(1).optional(),
  room_count: z.number().int().positive().optional(),
  days_per_month: z.number().positive().optional(),
});

export const capRateValuationSchema = z.object({
  annual_noi: z.number(),
  cap_rate: z.number().positive(),
  purchase_price: z.number().positive().optional(),
  sensitivity_steps: z.number().int().positive().optional(),
});

export const costBenchmarksSchema = z.object({
  annual_room_revenue: z.number(),
  annual_total_revenue: z.number(),
  purchase_price: z.number().positive().optional(),
  cost_rate_rooms: z.number().min(0).optional(),
  cost_rate_fb: z.number().min(0).optional(),
  cost_rate_admin: z.number().min(0).optional(),
  cost_rate_marketing: z.number().min(0).optional(),
  cost_rate_property_ops: z.number().min(0).optional(),
  cost_rate_utilities: z.number().min(0).optional(),
  cost_rate_taxes: z.number().min(0).optional(),
  cost_rate_insurance: z.number().min(0).optional(),
  cost_rate_it: z.number().min(0).optional(),
  cost_rate_ffe: z.number().min(0).optional(),
  cost_rate_other: z.number().min(0).optional(),
});

export const serviceFeeSchema = z.object({
  propertyRevenue: z.number(),
  serviceType: z.string(),
});

export const markupWaterfallSchema = z.object({
  vendorCost: z.number().min(0),
  markupPct: z.number().min(0),
  serviceType: z.string().optional(),
});

export const makeVsBuySchema = z.object({
  serviceName: z.string(),
  inHouseLabor: z.number().min(0),
  benefitsRate: z.number().min(0),
  trainingAnnual: z.number().min(0),
  suppliesAnnual: z.number().min(0),
  allocatedOverhead: z.number().min(0),
  vendorContractPrice: z.number().min(0),
  internalOversightHours: z.number().min(0),
  managerHourlyRate: z.number().min(0),
  unitCount: z.number().int().min(0),
  projection_years: z.number().int().positive().optional(),
  discount_rate: z.number().min(0).optional(),
  cost_escalation_rate: z.number().optional(),
});

export const waccSchema = z.object({
  equity: z.number().min(0),
  debt: z.number().min(0),
  cost_of_equity: z.number().min(0),
  cost_of_debt: z.number().min(0),
  tax_rate: z.number().min(0).max(1),
});

const portfolioPropertyWACCSchema = z.object({
  name: z.string(),
  equity: z.number().min(0),
  debt: z.number().min(0),
  cost_of_equity: z.number().min(0),
  cost_of_debt: z.number().min(0),
});

export const portfolioWaccSchema = z.object({
  properties: z.array(portfolioPropertyWACCSchema).min(1),
  tax_rate: z.number().min(0).max(1),
});

export const mirrSchema = z.object({
  cash_flow_vector: z.array(z.number()).min(2),
  finance_rate: z.number().min(0),
  reinvestment_rate: z.number().min(0),
});
