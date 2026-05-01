import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";
import { MONTHS_PER_YEAR } from "../../shared/constants.js";
import { computeFinancing } from "./financing-calculator.js";
import type { FinancingInput, FinancingOutput } from "./types.js";

export interface LoanScenario {
  /** Human-readable label for this scenario */
  label: string;
  /** Full financing input */
  input: FinancingInput;
  /** Optional annual NOI for DSCR/debt yield computation */
  noi_annual?: number;
}

export interface LoanScenarioResult {
  label: string;
  loan_amount: number;
  loan_to_value: number | null;
  equity_required: number;
  closing_costs_total: number;
  /** Monthly payment during IO period (null if no IO) */
  monthly_payment_io: number | null;
  /** Monthly payment during amortizing period */
  monthly_payment_amortizing: number;
  /** Annual debt service during IO period (null if no IO) */
  annual_ds_io: number | null;
  /** Annual debt service during amortizing period (peak DS) */
  annual_ds_amortizing: number;
  total_interest_paid: number;
  total_principal_paid: number;
  total_payments: number;
  /** Whether loan has IO period */
  has_io_period: boolean;
  /** Months of IO */
  io_months: number;
  /** DSCR based on amortizing DS (worst-case) */
  dscr_amortizing: number | null;
  /** DSCR based on IO DS */
  dscr_io: number | null;
  /** Debt yield if NOI provided */
  debt_yield: number | null;
  /** Balloon payment at maturity (0 if fully amortized) */
  balloon_at_maturity: number;
  /** Full financing output for detailed drill-down */
  financing_output: FinancingOutput;
}

export interface LoanComparisonDelta {
  field: string;
  values: { label: string; value: number | string | null }[];
  /** The scenario label that wins on this metric */
  favors: string;
}

export interface LoanComparisonOutput {
  scenarios: LoanScenarioResult[];
  /** Key metrics compared side-by-side */
  comparison_deltas: LoanComparisonDelta[];
  /** Which scenario requires least equity */
  lowest_equity_label: string;
  /** Which scenario has lowest total interest */
  lowest_interest_label: string;
  /** Which scenario has lowest amortizing payment */
  lowest_amort_payment_label: string;
  /** Which scenario has best amortizing DSCR (if NOI provided) */
  best_dscr_label: string | null;
}

/**
 * Compare multiple financing structures side-by-side.
 *
 * Runs each scenario through the full financing calculator and
 * produces normalized comparison metrics. Reports both IO and
 * amortizing payments separately for accurate comparison.
 */
export function compareLoanScenarios(scenarios: LoanScenario[]): LoanComparisonOutput {
  if (scenarios.length < 2) {
    throw new Error("Loan comparison requires at least 2 scenarios");
  }

  const results: LoanScenarioResult[] = scenarios.map(scenario => {
    const output = computeFinancing(scenario.input);
    const schedule = output.debt_service_schedule;
    const rounding = scenario.input.rounding_policy;
    const r = (v: number) => roundTo(v, rounding);
    const pctRound = (v: number) => roundTo(v, { precision: 4, bankers_rounding: false });

    const totalInterest = r(schedule.reduce((sum, e) => sum + e.interest, 0));
    const totalPrincipal = r(schedule.reduce((sum, e) => sum + e.principal, 0));
    const totalPayments = r(schedule.reduce((sum, e) => sum + e.payment, 0));

    const lastEntry = schedule[schedule.length - 1];
    const isBalloon = scenario.input.amortization_months > scenario.input.term_months;
    const balloon = isBalloon && lastEntry ? lastEntry.beginning_balance : 0;

    const ioEntries = schedule.filter(e => e.is_io);
    const amortEntries = schedule.filter(e => !e.is_io);
    const ioMonths = ioEntries.length;

    const monthlyIO = ioMonths > 0 ? ioEntries[0].payment : null;
    const monthlyAmort = amortEntries.length > 0 ? amortEntries[0].payment : (monthlyIO ?? 0);

    const annualIO = monthlyIO !== null ? r(monthlyIO * MONTHS_PER_YEAR) : null;
    const annualAmort = r(monthlyAmort * MONTHS_PER_YEAR);

    const dscrAmort = scenario.noi_annual && annualAmort > 0
      ? pctRound(scenario.noi_annual / annualAmort)
      : null;

    const dscrIO = scenario.noi_annual && annualIO !== null && annualIO > 0
      ? pctRound(scenario.noi_annual / annualIO)
      : null;

    const debtYield = scenario.noi_annual && output.loan_amount_gross > 0
      ? roundTo(scenario.noi_annual / output.loan_amount_gross, { precision: 6, bankers_rounding: false })
      : null;

    const ltv = scenario.input.purchase_price > 0
      ? pctRound(output.loan_amount_gross / scenario.input.purchase_price)
      : null;

    return {
      label: scenario.label,
      loan_amount: output.loan_amount_gross,
      loan_to_value: ltv,
      equity_required: output.equity_required,
      closing_costs_total: output.closing_costs.total,
      monthly_payment_io: monthlyIO,
      monthly_payment_amortizing: monthlyAmort,
      annual_ds_io: annualIO,
      annual_ds_amortizing: annualAmort,
      total_interest_paid: totalInterest,
      total_principal_paid: totalPrincipal,
      total_payments: totalPayments,
      has_io_period: ioMonths > 0,
      io_months: ioMonths,
      dscr_amortizing: dscrAmort,
      dscr_io: dscrIO,
      debt_yield: debtYield,
      balloon_at_maturity: balloon,
      financing_output: output,
    };
  });

  const lowestEquity = results.reduce((min, s) => s.equity_required < min.equity_required ? s : min);
  const lowestInterest = results.reduce((min, s) => s.total_interest_paid < min.total_interest_paid ? s : min);
  const lowestAmortPayment = results.reduce((min, s) =>
    s.monthly_payment_amortizing < min.monthly_payment_amortizing ? s : min);

  const dscrResults = results.filter(s => s.dscr_amortizing !== null);
  const bestDSCR = dscrResults.length > 0
    ? dscrResults.reduce((best, s) => (s.dscr_amortizing ?? 0) > (best.dscr_amortizing ?? 0) ? s : best)
    : null;

  const comparisonDeltas: LoanComparisonDelta[] = [
    {
      field: "Loan Amount",
      values: results.map(s => ({ label: s.label, value: s.loan_amount })),
      favors: lowestEquity.label,
    },
    {
      field: "Equity Required",
      values: results.map(s => ({ label: s.label, value: s.equity_required })),
      favors: lowestEquity.label,
    },
    {
      field: "Monthly Payment (Amortizing)",
      values: results.map(s => ({ label: s.label, value: s.monthly_payment_amortizing })),
      favors: lowestAmortPayment.label,
    },
    {
      field: "Monthly Payment (IO)",
      values: results.map(s => ({ label: s.label, value: s.monthly_payment_io })),
      favors: results
        .filter(s => s.monthly_payment_io !== null)
        .reduce((min, s) => (s.monthly_payment_io ?? Infinity) < (min.monthly_payment_io ?? Infinity) ? s : min, results[0])
        ?.label ?? "",
    },
    {
      field: "Total Interest Paid",
      values: results.map(s => ({ label: s.label, value: s.total_interest_paid })),
      favors: lowestInterest.label,
    },
    {
      field: "Total Payments",
      values: results.map(s => ({ label: s.label, value: s.total_payments })),
      favors: lowestInterest.label,
    },
    {
      field: "Balloon at Maturity",
      values: results.map(s => ({ label: s.label, value: s.balloon_at_maturity })),
      favors: results.reduce((min, s) => s.balloon_at_maturity < min.balloon_at_maturity ? s : min).label,
    },
  ];

  if (dscrResults.length > 0) {
    comparisonDeltas.push({
      field: "DSCR (Amortizing)",
      values: results.map(s => ({ label: s.label, value: s.dscr_amortizing })),
      favors: bestDSCR?.label ?? "",
    });
    comparisonDeltas.push({
      field: "DSCR (IO)",
      values: results.map(s => ({ label: s.label, value: s.dscr_io })),
      favors: results
        .filter(s => s.dscr_io !== null)
        .reduce((best, s) => (s.dscr_io ?? 0) > (best.dscr_io ?? 0) ? s : best, results[0])
        ?.label ?? "",
    });
    comparisonDeltas.push({
      field: "Debt Yield",
      values: results.map(s => ({ label: s.label, value: s.debt_yield })),
      favors: results
        .filter(s => s.debt_yield !== null)
        .reduce((best, s) => (s.debt_yield ?? 0) > (best.debt_yield ?? 0) ? s : best, results[0])
        .label,
    });
  }

  return {
    scenarios: results,
    comparison_deltas: comparisonDeltas,
    lowest_equity_label: lowestEquity.label,
    lowest_interest_label: lowestInterest.label,
    lowest_amort_payment_label: lowestAmortPayment.label,
    best_dscr_label: bestDSCR?.label ?? null,
  };
}
