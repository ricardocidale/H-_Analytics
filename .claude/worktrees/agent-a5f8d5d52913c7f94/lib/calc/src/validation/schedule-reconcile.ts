/**
 * calc/validation/schedule-reconcile.ts — Debt schedule reconciliation checker.
 *
 * PURPOSE:
 * Cross-checks the amortization schedule produced by the financing/refinance
 * calculators against the actual values used by the financial engine. This catches
 * integration bugs where the engine might drift from the authoritative schedule
 * due to rounding differences, off-by-one month errors, or stale cached values.
 *
 * RECONCILIATION APPROACH:
 * For each month present in both the "expected" schedule (from the financing
 * calculator) and the "actual" engine outputs:
 *   - Compare interest amounts (tolerance: $0.01 default via CENTS_TOLERANCE)
 *   - Compare principal amounts
 *   - Compare total payment (if provided)
 *   - Compare ending loan balance
 *
 * If any field deviates beyond tolerance, a variance record is created.
 *
 * KEY OUTPUTS:
 *   - max_balance_drift: The largest absolute difference in ending balance across
 *     all months. Even tiny monthly rounding differences can compound over a
 *     10-year schedule, causing material balance drift. This metric flags that risk.
 *   - cumulative_interest_variance: Sum of (expected − actual) interest over all
 *     months. A non-zero value means total interest expense on the income statement
 *     doesn't match the schedule — an audit red flag.
 *
 * WHY THIS MATTERS:
 * The amortization schedule is the source of truth for debt service. If the engine
 * uses different values, the cash flow statement, balance sheet (loan liability),
 * and DSCR calculations will all be wrong. This reconciliation ensures the engine
 * and the schedule are in lockstep.
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "schedule_reconcile" skill. The financial
 * auditor runs this for every property with a loan. The `all_reconciled` flag must
 * be true for the audit to pass.
 */
import { roundCents, CENTS_TOLERANCE } from "../shared/utils.js";

export interface ScheduleEntry {
  month: number;
  expected_interest: number;
  expected_principal: number;
  expected_payment?: number;
  expected_ending_balance: number;
}

export interface EngineEntry {
  month: number;
  actual_interest: number;
  actual_principal: number;
  actual_payment?: number;
  actual_ending_balance: number;
}

export interface ScheduleVariance {
  month: number;
  field: "interest" | "principal" | "payment" | "ending_balance";
  expected: number;
  actual: number;
  variance: number;
}

export interface ScheduleReconcileInput {
  property_name?: string;
  schedule: ScheduleEntry[];
  engine_outputs: EngineEntry[];
  tolerance?: number;
}

export interface ScheduleReconcileOutput {
  all_reconciled: boolean;
  total_months_checked: number;
  months_with_variances: number;
  variances: ScheduleVariance[];
  max_balance_drift: number;
  cumulative_interest_variance: number;
}

function pushIfExceedsTol(
  variances: ScheduleVariance[], monthsWithVar: Set<number>,
  month: number, field: ScheduleVariance["field"],
  expected: number, actual: number, tol: number,
): number {
  const v = Math.abs(expected - actual);
  if (v > tol) {
    monthsWithVar.add(month);
    variances.push({ month, field, expected, actual, variance: roundCents(v) });
  }
  return v;
}

export function reconcileSchedule(input: ScheduleReconcileInput): ScheduleReconcileOutput {
  const tol = input.tolerance ?? CENTS_TOLERANCE;
  const variances: ScheduleVariance[] = [];
  let maxBalanceDrift = 0;
  let cumulativeInterestVar = 0;
  const monthsWithVar = new Set<number>();

  const engineMap = new Map<number, EngineEntry>();
  for (const e of input.engine_outputs) {
    engineMap.set(e.month, e);
  }

  let totalChecked = 0;
  let missingInEngine = 0;

  for (const sched of input.schedule) {
    const eng = engineMap.get(sched.month);
    if (!eng) {
      missingInEngine++;
      monthsWithVar.add(sched.month);
      variances.push({ month: sched.month, field: "ending_balance", expected: sched.expected_ending_balance, actual: 0, variance: sched.expected_ending_balance });
      continue;
    }
    totalChecked++;

    cumulativeInterestVar += sched.expected_interest - eng.actual_interest;
    pushIfExceedsTol(variances, monthsWithVar, sched.month, "interest", sched.expected_interest, eng.actual_interest, tol);
    pushIfExceedsTol(variances, monthsWithVar, sched.month, "principal", sched.expected_principal, eng.actual_principal, tol);

    if (sched.expected_payment !== undefined && eng.actual_payment !== undefined) {
      pushIfExceedsTol(variances, monthsWithVar, sched.month, "payment", sched.expected_payment, eng.actual_payment, tol);
    }

    const balVar = Math.abs(sched.expected_ending_balance - eng.actual_ending_balance);
    if (balVar > maxBalanceDrift) maxBalanceDrift = balVar;
    pushIfExceedsTol(variances, monthsWithVar, sched.month, "ending_balance", sched.expected_ending_balance, eng.actual_ending_balance, tol);
  }

  const extraInEngine = input.engine_outputs.length - totalChecked;
  if (extraInEngine > 0) {
    for (const eng of input.engine_outputs) {
      if (!input.schedule.some(s => s.month === eng.month)) {
        monthsWithVar.add(eng.month);
        variances.push({ month: eng.month, field: "ending_balance", expected: 0, actual: eng.actual_ending_balance, variance: eng.actual_ending_balance });
      }
    }
  }

  return {
    all_reconciled: variances.length === 0 && missingInEngine === 0 && extraInEngine <= 0,
    total_months_checked: totalChecked,
    months_with_variances: monthsWithVar.size,
    variances,
    max_balance_drift: roundCents(maxBalanceDrift),
    cumulative_interest_variance: roundCents(cumulativeInterestVar),
  };
}
