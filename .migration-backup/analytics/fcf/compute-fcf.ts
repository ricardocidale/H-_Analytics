import type { PostedEntry } from "../../domain/ledger/types.js";
import { getAccount } from "../../domain/ledger/accounts.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";
import type {
  PeriodIncomeStatement,
  PeriodCashFlow,
} from "../../statements/types.js";
import type { FCFEntry, FCFInput, FCFOutput, FCFTimeline } from "./types.js";

export function extractWorkingCapitalChanges(
  monthlyData: ReadonlyArray<{ period?: string; workingCapitalChange: number }>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const m of monthlyData) {
    if (m.period) {
      result[m.period] = (result[m.period] ?? 0) + m.workingCapitalChange;
    }
  }
  return result;
}

const TOLERANCE = 0.01;

/** Non-cash expense accounts that get added back to derive FCF. */
const NON_CASH_ACCOUNTS = new Set([
  "DEPRECIATION_EXPENSE",
  "PREPAYMENT_PENALTY_EXPENSE",
]);

/** Debt accounts — credits = new borrowing, debits = repayment. */
const DEBT_ACCOUNTS = new Set([
  "DEBT_ACQUISITION",
  "DEBT_NEW",
  "DEBT_OLD",
]);

/** Equity accounts — excluded from net borrowing calculation. */
const EQUITY_ACCOUNTS = new Set([
  "EQUITY_CONTRIBUTED",
  "RETAINED_EARNINGS",
]);

/**
 * Compute FCFF and FCFE from posted entries and statement data.
 *
 * FCFF = Net Income + Non-Cash Charges + Interest Expense - CapEx - ΔWC
 * FCFE = FCFF - Interest Expense + Net Borrowing
 *      = Net Income + Non-Cash Charges - CapEx - ΔWC + Net Borrowing
 *
 * ΔWC = working_capital_changes[period] (positive = cash consumed by growing receivables)
 */
export function computeFCF(
  input: FCFInput,
  rounding: RoundingPolicy,
): FCFOutput {
  const r = (v: number) => roundTo(v, rounding);
  const { income_statements, cash_flows, posted_entries } = input;

  // Get all periods
  const periods = income_statements.map((is) => is.period).sort();

  // Build per-period entries
  const entries: FCFEntry[] = [];

  for (const period of periods) {
    const is = income_statements.find((i) => i.period === period);
    const cf = cash_flows.find((c) => c.period === period);

    const periodEntries = posted_entries.filter((e) => e.period === period);

    // Net income from IS
    const net_income = r(is?.net_income ?? 0);

    // Non-cash addbacks: depreciation and other non-cash items
    let depreciation = 0;
    let other_non_cash = 0;
    for (const entry of periodEntries) {
      if (entry.account === "DEPRECIATION_EXPENSE") {
        depreciation += entry.debit - entry.credit;
      } else if (
        NON_CASH_ACCOUNTS.has(entry.account) &&
        entry.account !== "DEPRECIATION_EXPENSE"
      ) {
        other_non_cash += entry.debit - entry.credit;
      }
    }
    depreciation = r(depreciation);
    other_non_cash = r(other_non_cash);

    // Interest expense (from IS accounts)
    let interest_expense = 0;
    for (const entry of periodEntries) {
      if (entry.account === "INTEREST_EXPENSE") {
        interest_expense += entry.debit - entry.credit;
      }
    }
    interest_expense = r(interest_expense);

    // CapEx: investing outflows (PROPERTY debits in INVESTING bucket)
    let capex = 0;
    for (const entry of periodEntries) {
      if (entry.cash_flow_bucket === "INVESTING" && entry.account !== "CASH") {
        const acctDef = getAccount(entry.account);
        if (acctDef?.classification === "BS_ASSET") {
          capex += entry.debit - entry.credit;
        }
      }
    }
    capex = r(capex);

    const working_capital_change = input.working_capital_changes?.[period] ?? 0;

    // FCFF = NI + Depreciation + Other Non-Cash + Interest - CapEx - ΔWC
    // working_capital_change > 0 means cash consumed (AR grew), reduces FCF
    const fcff = r(
      net_income +
        depreciation +
        other_non_cash +
        interest_expense -
        capex -
        working_capital_change,
    );

    // Net borrowing: new debt issued - principal paid - old debt retired
    let net_borrowing = 0;
    for (const entry of periodEntries) {
      if (DEBT_ACCOUNTS.has(entry.account)) {
        // For CREDIT-normal debt accounts:
        // credit = new borrowing (positive), debit = repayment (negative)
        net_borrowing += entry.credit - entry.debit;
      }
    }
    net_borrowing = r(net_borrowing);

    // FCFE = FCFF - Interest + Net Borrowing
    const fcfe = r(fcff - interest_expense + net_borrowing);

    entries.push({
      period,
      entity_id: "consolidated",
      net_income,
      depreciation,
      other_non_cash,
      working_capital_change,
      capex,
      fcff,
      interest_expense,
      net_borrowing,
      fcfe,
    });
  }

  const consolidated: FCFTimeline = {
    entity_id: "consolidated",
    entries,
    total_fcff: r(entries.reduce((sum, e) => sum + e.fcff, 0)),
    total_fcfe: r(entries.reduce((sum, e) => sum + e.fcfe, 0)),
  };

  // Reconciliation: FCFE should equal net cash change for each period
  // FCFE = cash from operations + cash from investing + debt portion of financing
  //      ≈ total net cash change - equity financing
  let periodsChecked = 0;
  let allTied = true;
  for (const entry of entries) {
    const cf = cash_flows.find((c) => c.period === entry.period);
    if (cf) {
      periodsChecked++;
      // FCFE should ≈ net cash change minus equity contributions
      // Since equity contributions are financing, and FCFE excludes them:
      // FCFE = Operating + Investing + (Financing - Equity)
      // For simplicity, we check FCFE ≈ Operating + Investing + Net Borrowing cash impact
      // The actual cash delta is cf.net_cash_change
      // Equity CF portion = cf.financing - net_borrowing_cash_impact
      const equityFinancing = r(cf.financing - entry.net_borrowing);
      const expectedFCFE = r(cf.net_cash_change - equityFinancing);
      if (Math.abs(entry.fcfe - expectedFCFE) >= TOLERANCE) {
        allTied = false;
      }
    }
  }

  return {
    timelines: [consolidated],
    consolidated,
    reconciliation: {
      fcfe_ties_to_cf: allTied,
      periods_checked: periodsChecked,
    },
  };
}
