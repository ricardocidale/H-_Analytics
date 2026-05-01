/**
 * calc/validation/funding-gates.ts — Funding feasibility gate checks.
 *
 * PURPOSE:
 * Enforces business rules that ensure a property or management company has
 * adequate funding before and during operations. These are "gate" checks —
 * binary pass/fail rules that, if violated, indicate the financial model
 * contains an impossible scenario (e.g., spending money before receiving it).
 *
 * GATES CHECKED:
 *
 * 1. FUNDING TIMING GATE:
 *    For properties: Acquisition/funding must occur before operations start.
 *    For management company: Capital raise funding must arrive before company operations begin.
 *    Why: You can't operate a hotel you haven't bought, and you can't pay employees
 *    from an unfunded management company.
 *
 * 2. NO NEGATIVE CASH:
 *    Monthly ending cash balances must never go below zero.
 *    Why: Negative cash means the entity has spent more than it has. In reality,
 *    this would require an unmodeled cash infusion (equity call, line of credit).
 *    A negative cash month indicates the model is missing a funding source.
 *
 * 3. DEBT-FREE AT EXIT:
 *    Outstanding debt must be zero by the end of the projection period.
 *    Why: The exit valuation assumes the property is sold free and clear (or
 *    debt is repaid from sale proceeds). Remaining debt means the equity
 *    proceeds calculation is wrong.
 *
 * 4. NO OVER-DISTRIBUTION:
 *    Distributions to equity holders cannot occur in months where cash is negative.
 *    Why: Distributing cash that doesn't exist is a solvency violation.
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "funding_gates" skill. The financial auditor
 * runs these gates for every entity (each property + management company + portfolio).
 * Failed gates produce "critical" or "material" severity flags in the audit report.
 */
import { roundCents, CENTS_TOLERANCE } from "../shared/utils.js";

export interface FundingGateInput {
  entity_type: "property" | "management_company" | "portfolio";
  entity_name: string;
  operations_start_date?: string;
  funding_date?: string;
  monthly_ending_cash: number[];
  final_debt_outstanding?: number;
  monthly_distributions?: number[];
}

export interface GateResult {
  rule: string;
  description: string;
  passed: boolean;
  details: string;
  severity: "critical" | "material" | "info";
  first_violation_month: number;
}

export interface FundingGateOutput {
  all_gates_passed: boolean;
  gates: GateResult[];
  negative_cash_months: number[];
  minimum_cash_balance: number;
}

export function checkFundingGates(input: FundingGateInput): FundingGateOutput {
  const gates: GateResult[] = [];

  if (input.operations_start_date && input.funding_date) {
    const opsDate = new Date(input.operations_start_date);
    const fundDate = new Date(input.funding_date);
    const passed = fundDate <= opsDate;
    const label = input.entity_type === "management_company"
      ? "Management Company Funding Gate"
      : "Property Activation Gate";
    gates.push({
      rule: label,
      description: input.entity_type === "management_company"
        ? "Operations cannot start before capital raise funding is received"
        : "Property cannot operate before acquisition/funding",
      passed,
      details: passed
        ? `Funded on ${input.funding_date}, operations start ${input.operations_start_date}`
        : `Operations start ${input.operations_start_date} but funding not received until ${input.funding_date}`,
      severity: passed ? "info" : "critical",
      first_violation_month: -1,
    });
  }

  const negative_cash_months: number[] = [];
  let minimum_cash_balance = Infinity;
  for (let i = 0; i < input.monthly_ending_cash.length; i++) {
    const cash = input.monthly_ending_cash[i];
    if (cash < minimum_cash_balance) minimum_cash_balance = cash;
    if (cash < 0) negative_cash_months.push(i);
  }
  if (minimum_cash_balance === Infinity) minimum_cash_balance = 0;

  gates.push({
    rule: "No Negative Cash",
    description: "Cash balances must never go below zero in any month",
    passed: negative_cash_months.length === 0,
    details: negative_cash_months.length === 0
      ? `All ${input.monthly_ending_cash.length} months have non-negative cash (min: $${minimum_cash_balance.toLocaleString()})`
      : `${negative_cash_months.length} months have negative cash. First violation: month ${negative_cash_months[0]}. Min balance: $${minimum_cash_balance.toLocaleString()}`,
    severity: negative_cash_months.length === 0 ? "info" : "material",
    first_violation_month: negative_cash_months.length > 0 ? negative_cash_months[0] : -1,
  });

  if (input.final_debt_outstanding !== undefined) {
    const debtFree = input.final_debt_outstanding <= CENTS_TOLERANCE;
    gates.push({
      rule: "Debt-Free at Exit",
      description: "All debt must be repaid by end of projection period",
      passed: debtFree,
      details: debtFree
        ? "No outstanding debt at exit"
        : `Outstanding debt at exit: $${input.final_debt_outstanding.toLocaleString()}`,
      severity: debtFree ? "info" : "critical",
      first_violation_month: -1,
    });
  }

  if (input.monthly_distributions && input.monthly_distributions.length > 0) {
    let overDistMonth = -1;
    for (let i = 0; i < input.monthly_distributions.length; i++) {
      const dist = input.monthly_distributions[i];
      const cash = i < input.monthly_ending_cash.length ? input.monthly_ending_cash[i] : 0;
      if (dist > 0 && cash < 0) {
        overDistMonth = i;
        break;
      }
    }
    gates.push({
      rule: "No Over-Distribution",
      description: "Distributions cannot exceed available cash",
      passed: overDistMonth === -1,
      details: overDistMonth === -1
        ? "No over-distributions detected"
        : `Over-distribution detected in month ${overDistMonth}: distribution made when cash is negative`,
      severity: overDistMonth === -1 ? "info" : "material",
      first_violation_month: overDistMonth,
    });
  }

  return {
    all_gates_passed: gates.every(g => g.passed),
    gates,
    negative_cash_months,
    minimum_cash_balance: roundCents(minimum_cash_balance),
  };
}
