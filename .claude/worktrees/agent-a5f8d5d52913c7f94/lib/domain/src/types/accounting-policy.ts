import type { RoundingPolicy } from "./rounding.js";

export interface AccountingPolicy {
  accounting_basis: "GAAP_ACCRUAL";
  cash_flow_classification: {
    interest_paid: "OPERATING" | "FINANCING";
    interest_received: "OPERATING" | "INVESTING";
    distributions: "FINANCING";
    debt_issuance_costs: "FINANCING";
  };
  depreciation_method: "STRAIGHT_LINE";
  amortization_method: "STRAIGHT_LINE" | "EIR";
  rounding_policy: RoundingPolicy;
}

export const DEFAULT_ACCOUNTING_POLICY: AccountingPolicy = {
  accounting_basis: "GAAP_ACCRUAL",
  cash_flow_classification: {
    interest_paid: "OPERATING",
    interest_received: "OPERATING",
    distributions: "FINANCING",
    debt_issuance_costs: "FINANCING",
  },
  depreciation_method: "STRAIGHT_LINE",
  amortization_method: "STRAIGHT_LINE",
  rounding_policy: { precision: 2, bankers_rounding: false },
};
