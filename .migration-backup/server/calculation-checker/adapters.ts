import type { CheckResult, CheckerProperty, EngineMonthlyResult } from "./types";
import { check } from "./gaap-checks";
import { validateFinancialIdentities } from "../../calc/validation/financial-identities";
import { checkFundingGates } from "../../calc/validation/funding-gates";
import { reconcileSchedule, type ScheduleEntry, type EngineEntry } from "../../calc/validation/schedule-reconcile";
import { pmt } from "../../calc/shared/pmt";
import { MONTHS_PER_YEAR } from "@shared/constants";

const ROUNDING_POLICY = { precision: 2, bankers_rounding: false } as const;

export function runFinancialIdentityChecks(m: EngineMonthlyResult, propertyValue: number, debtOutstanding: number, initialEquity: number, cumulativeNetIncome: number): CheckResult[] {
  const result = validateFinancialIdentities({
    balance_sheet: {
      total_assets: m.endingCash + propertyValue,
      total_liabilities: debtOutstanding,
      total_equity: initialEquity + cumulativeNetIncome,
    },
    income_statement: {
      noi: m.noi,
      anoi: m.anoi,
      interest_expense: m.interestExpense,
      depreciation: m.depreciationExpense,
      income_tax: m.incomeTax,
      net_income: m.netIncome,
    },
    cash_flow_statement: {
      operating_cash_flow: m.operatingCashFlow,
      financing_cash_flow: m.financingCashFlow,
      ending_cash: m.endingCash,
      principal_payment: m.principalPayment,
    },
    rounding_policy: ROUNDING_POLICY,
  });

  return result.checks.map(c => check(
    c.identity,
    "Financial Identity",
    c.gaap_reference,
    c.formula,
    c.expected,
    c.actual,
    c.severity === "minor" ? "info" : c.severity,
  ));
}

export function runFundingGateChecks(
  property: CheckerProperty,
  engineCalc: EngineMonthlyResult[],
): CheckResult[] {
  const isFinanced = property.type === "Financed";
  const loanTermMonths = (property.acquisitionTermYears ?? 0) * 12;
  const projectionMonths = engineCalc.length;
  const projectionShorterThanLoan = isFinanced && loanTermMonths > projectionMonths;

  const result = checkFundingGates({
    entity_type: "property",
    entity_name: property.name || "Unnamed Property",
    operations_start_date: property.operationsStartDate as string | undefined,
    funding_date: property.acquisitionDate as string | undefined,
    monthly_ending_cash: engineCalc.map(m => m.endingCash),
    final_debt_outstanding: engineCalc.length > 0
      ? engineCalc[engineCalc.length - 1].debtOutstanding
      : undefined,
  });

  return result.gates.map(g => {
    let severity = g.severity;
    if (g.rule === "Debt-Free at Exit" && !g.passed && projectionShorterThanLoan) {
      severity = "info";
    }
    return check(
      g.rule,
      "Funding Gate",
      "Business Rule",
      g.description,
      g.passed ? 1 : 1,
      g.passed ? 1 : 0,
      severity === "info" ? "info" : severity,
    );
  });
}

export function runScheduleReconcileChecks(
  property: CheckerProperty,
  engineCalc: EngineMonthlyResult[],
): CheckResult[] {
  if (property.type !== "Financed") return [];

  const purchasePrice = property.purchasePrice + (property.buildingImprovements ?? 0);
  const ltv = property.acquisitionLTV ?? 0;
  const loanAmount = purchasePrice * ltv;
  const annualRate = property.acquisitionInterestRate ?? 0;
  const termYears = property.acquisitionTermYears ?? 0;

  if (loanAmount <= 0 || annualRate <= 0 || termYears <= 0) return [];

  const monthlyRate = annualRate / MONTHS_PER_YEAR;
  const totalPayments = termYears * MONTHS_PER_YEAR;
  const monthlyPayment = pmt(loanAmount, monthlyRate, totalPayments);

  const schedule: ScheduleEntry[] = [];
  let balance = loanAmount;
  const firstDebtMonth = engineCalc.findIndex(m => m.debtPayment > 0);
  if (firstDebtMonth < 0) return [];

  const monthsWithDebt = engineCalc.length - firstDebtMonth;
  for (let i = 0; i < monthsWithDebt; i++) {
    const interest = balance * monthlyRate;
    const principal = monthlyPayment - interest;
    balance = Math.max(0, balance - principal);
    schedule.push({
      month: firstDebtMonth + i,
      expected_interest: interest,
      expected_principal: principal,
      expected_payment: monthlyPayment,
      expected_ending_balance: balance,
    });
  }

  const engineEntries: EngineEntry[] = engineCalc
    .filter(m => m.debtPayment > 0)
    .map(m => ({
      month: m.monthIndex,
      actual_interest: m.interestExpense,
      actual_principal: m.principalPayment,
      actual_payment: m.debtPayment,
      actual_ending_balance: m.debtOutstanding,
    }));

  if (engineEntries.length === 0) return [];

  const result = reconcileSchedule({
    property_name: property.name || "Unnamed Property",
    schedule,
    engine_outputs: engineEntries,
  });

  const checks: CheckResult[] = [];

  checks.push(check(
    "Amortization Schedule Reconciliation",
    "Debt",
    "ASC 470",
    `Independent amortization schedule vs engine: ${result.total_months_checked} months checked, ${result.months_with_variances} with variances, max balance drift $${result.max_balance_drift.toFixed(2)}`,
    0,
    result.months_with_variances,
    result.all_reconciled ? "info" : "material"
  ));

  if (result.cumulative_interest_variance !== 0) {
    checks.push(check(
      "Cumulative Interest Variance",
      "Debt",
      "ASC 470",
      `Cumulative interest difference between independent schedule and engine = $${result.cumulative_interest_variance.toFixed(2)}`,
      0,
      Math.abs(result.cumulative_interest_variance),
      Math.abs(result.cumulative_interest_variance) > 1 ? "material" : "info"
    ));
  }

  return checks;
}
