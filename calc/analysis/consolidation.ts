/**
 * calc/analysis/consolidation.ts — Multi-property financial statement consolidation.
 *
 * PURPOSE:
 * Combines the financial statements of multiple hotel properties (and optionally
 * the management company) into a single consolidated view. This is essential for
 * portfolio-level reporting and investor presentations.
 *
 * CONSOLIDATION MODES:
 *   - "properties_only": Sums up all property-level statements. Used when viewing
 *     the portfolio's operating performance without management company overhead.
 *   - "full_entity": Includes the management company's financials AND eliminates
 *     intercompany transactions (management fees). This produces a true consolidated
 *     view as if the entire enterprise were a single entity.
 *
 * INTERCOMPANY ELIMINATIONS:
 * When properties pay management fees to the management company, those fees are:
 *   - An EXPENSE on the property's income statement
 *   - REVENUE on the management company's income statement
 * In consolidation, these cancel out (they're internal transfers, not real economic
 * activity). The module eliminates the lesser of (total fees paid, fee revenue received)
 * and checks that they match within tolerance. A mismatch indicates a model bug.
 *
 * GAAP REFERENCE (ASC 810 — Consolidation):
 * Under GAAP, intercompany transactions must be eliminated in consolidation to
 * prevent double-counting. The `fee_linkage_balanced` flag confirms this elimination
 * is complete.
 *
 * BALANCE SHEET CHECK:
 * After consolidation, the module verifies that Total Assets = Total Liabilities +
 * Total Equity (the fundamental accounting equation). If this fails, the `balance_sheet_balanced`
 * flag is false, indicating an error in the underlying property or company statements.
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "consolidation" skill. The financial engine
 * runs this for each projection year to produce the consolidated dashboard view.
 */
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { rounder, sumField, withinTolerance, variance, DEFAULT_TOLERANCE } from "../shared/utils.js";

export interface PropertyStatement {
  name: string;
  revenue: number;
  operating_expenses?: number;
  gop?: number;
  agop?: number;
  noi: number;
  anoi?: number;
  management_fees?: number;
  ffe_reserve?: number;
  interest_expense?: number;
  depreciation?: number;
  income_tax?: number;
  net_income: number;
  operating_cash_flow?: number;
  financing_cash_flow?: number;
  ending_cash?: number;
  total_assets?: number;
  total_liabilities?: number;
  total_equity?: number;
}

export interface ManagementCompanyStatement {
  fee_revenue: number;
  operating_expenses?: number;
  net_income?: number;
  capital_raise_funding?: number;
  ending_cash?: number;
  total_assets?: number;
  total_liabilities?: number;
  total_equity?: number;
}

export interface ConsolidationInput {
  consolidation_type: "properties_only" | "full_entity";
  period?: string;
  property_statements: PropertyStatement[];
  management_company?: ManagementCompanyStatement;
  rounding_policy: RoundingPolicy;
}

export interface ConsolidationOutput {
  consolidated_revenue: number;
  consolidated_expenses: number;
  consolidated_gop: number;
  consolidated_agop: number;
  consolidated_noi: number;
  consolidated_anoi: number;
  consolidated_net_income: number;
  intercompany_eliminations: {
    management_fees_eliminated: number;
    fee_linkage_balanced: boolean;
    variance: number;
  };
  consolidated_assets: number;
  consolidated_liabilities: number;
  consolidated_equity: number;
  balance_sheet_balanced: boolean;
  property_count: number;
}

export function consolidateStatements(input: ConsolidationInput): ConsolidationOutput {
  const r = rounder(input.rounding_policy);
  const props = input.property_statements;

  const propRevenue = r(sumField(props, p => p.revenue));
  const propExpenses = r(sumField(props, p => p.operating_expenses ?? 0));
  const propGOP = r(sumField(props, p => p.gop ?? 0));
  const propAGOP = r(sumField(props, p => p.agop ?? 0));
  const propNOI = r(sumField(props, p => p.noi));
  const propANOI = r(sumField(props, p => p.anoi ?? 0));
  const propNetIncome = r(sumField(props, p => p.net_income));
  const propAssets = r(sumField(props, p => p.total_assets ?? 0));
  const propLiabilities = r(sumField(props, p => p.total_liabilities ?? 0));
  const propEquity = r(sumField(props, p => p.total_equity ?? 0));
  const totalMgmtFeesPaid = r(sumField(props, p => p.management_fees ?? 0));

  let consolidated_revenue = propRevenue;
  let consolidated_expenses = propExpenses;
  let consolidated_gop = propGOP;
  let consolidated_agop = propAGOP;
  let consolidated_noi = propNOI;
  let consolidated_anoi = propANOI;
  let consolidated_net_income = propNetIncome;
  let consolidated_assets = propAssets;
  let consolidated_liabilities = propLiabilities;
  let consolidated_equity = propEquity;

  let feeEliminated = 0;
  let feeLinkageBalanced = true;
  let feeVariance = 0;

  if (input.consolidation_type === "full_entity" && input.management_company) {
    const mc = input.management_company;
    consolidated_revenue = r(consolidated_revenue + mc.fee_revenue);
    consolidated_expenses = r(consolidated_expenses + (mc.operating_expenses ?? 0));
    consolidated_net_income = r(consolidated_net_income + (mc.net_income ?? 0));
    consolidated_assets = r(consolidated_assets + (mc.total_assets ?? 0));
    consolidated_liabilities = r(consolidated_liabilities + (mc.total_liabilities ?? 0));
    consolidated_equity = r(consolidated_equity + (mc.total_equity ?? 0));

    feeEliminated = r(Math.min(totalMgmtFeesPaid, mc.fee_revenue));
    feeVariance = r(variance(totalMgmtFeesPaid, mc.fee_revenue));
    feeLinkageBalanced = withinTolerance(totalMgmtFeesPaid, mc.fee_revenue, DEFAULT_TOLERANCE);

    consolidated_revenue = r(consolidated_revenue - feeEliminated);
    consolidated_expenses = r(consolidated_expenses - feeEliminated);

    const mcOpex = mc.operating_expenses ?? 0;
    consolidated_gop = r(consolidated_gop + mc.fee_revenue - mcOpex - feeEliminated);
    consolidated_agop = r(consolidated_agop + mc.fee_revenue - mcOpex - feeEliminated);
    consolidated_noi = r(consolidated_noi + mc.fee_revenue - mcOpex - feeEliminated);
    consolidated_anoi = r(consolidated_anoi + mc.fee_revenue - mcOpex - feeEliminated);
  }

  const bsBalanced = withinTolerance(consolidated_assets, consolidated_liabilities + consolidated_equity, DEFAULT_TOLERANCE);

  return {
    consolidated_revenue, consolidated_expenses, consolidated_gop, consolidated_agop, consolidated_noi, consolidated_anoi, consolidated_net_income,
    intercompany_eliminations: { management_fees_eliminated: feeEliminated, fee_linkage_balanced: feeLinkageBalanced, variance: feeVariance },
    consolidated_assets, consolidated_liabilities, consolidated_equity,
    balance_sheet_balanced: bsBalanced,
    property_count: props.length,
  };
}
