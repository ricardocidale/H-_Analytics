import { describe, it, expect } from "vitest";
import { computeIRR } from "../../analytics/returns/irr.js";
import { computeReturnMetrics } from "../../analytics/returns/metrics.js";
import { computeFCF } from "../../analytics/fcf/compute-fcf.js";
import { applyEvents } from "../../statements/event-applier.js";
import type { StatementEvent } from "../../domain/ledger/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

function npv(cashFlows: number[], rate: number): number {
  let result = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    result += cashFlows[t] / Math.pow(1 + rate, t);
  }
  return result;
}

describe("Refinancing cash flow vector — proceeds in correct period", () => {
  it("cash-out refi adds positive cash in refi year only", () => {
    const equity = 500_000;
    const refiYear = 3;
    const refiProceeds = 200_000;
    const years = 10;

    const flows = new Array(years + 1).fill(0);
    flows[0] = -equity;
    for (let y = 1; y <= years; y++) flows[y] = 40_000;
    flows[refiYear] += refiProceeds;
    flows[years] += 600_000;

    const result = computeIRR(flows);
    expect(result.converged).toBe(true);

    const nv = npv(flows, result.irr_periodic!);
    expect(Math.abs(nv)).toBeLessThan(0.01);

    expect(flows[refiYear]).toBe(40_000 + refiProceeds);
    expect(flows[refiYear - 1]).toBe(40_000);
    expect(flows[refiYear + 1]).toBe(40_000);
  });

  it("refi improves IRR vs no-refi scenario", () => {
    const equity = 500_000;
    const years = 10;

    const noRefi = new Array(years + 1).fill(0);
    noRefi[0] = -equity;
    for (let y = 1; y <= years; y++) noRefi[y] = 40_000;
    noRefi[years] += 600_000;

    const withRefi = [...noRefi];
    withRefi[3] += 150_000;

    const irrNoRefi = computeIRR(noRefi);
    const irrWithRefi = computeIRR(withRefi);

    expect(irrNoRefi.converged && irrWithRefi.converged).toBe(true);
    expect(irrWithRefi.irr_periodic!).toBeGreaterThan(irrNoRefi.irr_periodic!);
  });

  it("refi improves MOIC", () => {
    const noRefi = [-500_000, 40_000, 45_000, 50_000, 55_000, 600_000];
    const withRefi = [-500_000, 40_000, 45_000, 50_000 + 100_000, 55_000, 600_000];

    const metricsNoRefi = computeReturnMetrics(noRefi, 1, rounding);
    const metricsWithRefi = computeReturnMetrics(withRefi, 1, rounding);

    expect(metricsWithRefi.moic).toBeGreaterThan(metricsNoRefi.moic);
  });

  it("refinancing through event pipeline preserves ASC 230", () => {
    const events: StatementEvent[] = [
      {
        event_id: "fund_1",
        event_type: "FUNDING",
        date: "2026-06-01",
        entity_id: "opco",
        journal_deltas: [
          { account: "CASH", debit: 600_000, credit: 0, classification: "BS_ASSET", cash_flow_bucket: "FINANCING", memo: "Equity" },
          { account: "EQUITY_CONTRIBUTED", debit: 0, credit: 600_000, classification: "BS_EQUITY", cash_flow_bucket: "FINANCING", memo: "Equity" },
        ],
      },
      {
        event_id: "refi_1",
        event_type: "REFINANCE",
        date: "2029-06-01",
        entity_id: "prop_a",
        journal_deltas: [
          { account: "DEBT_NEW", debit: 0, credit: 1_500_000, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING", memo: "New loan" },
          { account: "DEBT_ACQUISITION", debit: 850_000, credit: 0, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING", memo: "Pay off old" },
          { account: "CASH", debit: 650_000, credit: 0, classification: "BS_ASSET", cash_flow_bucket: "FINANCING", memo: "Cash-out proceeds" },
        ],
      },
    ];

    const result = applyEvents(events, rounding);
    expect(result.flags.has_posting_errors).toBe(false);

    for (const cf of result.cash_flows) {
      const sum = cf.operating + cf.investing + cf.financing;
      expect(sum).toBeCloseTo(cf.net_cash_change, 2);
    }

    for (const bs of result.balance_sheets) {
      expect(bs.balanced).toBe(true);
    }
  });
});

describe("Exit proceeds — terminal value in final year", () => {
  it("exit proceeds dominate IRR for typical hotel investment", () => {
    const withExit = [-1_000_000, 50_000, 55_000, 60_000, 65_000, 70_000, 75_000, 80_000, 85_000, 90_000, 95_000 + 1_500_000];
    const withoutExit = [-1_000_000, 50_000, 55_000, 60_000, 65_000, 70_000, 75_000, 80_000, 85_000, 90_000, 95_000];

    const irrWithExit = computeIRR(withExit);
    const irrWithoutExit = computeIRR(withoutExit);

    expect(irrWithExit.converged).toBe(true);

    if (irrWithoutExit.converged) {
      expect(irrWithExit.irr_periodic!).toBeGreaterThan(irrWithoutExit.irr_periodic!);
    }
  });

  it("exit value = stabilized NOI / cap rate, correctly applied", () => {
    const stabilizedNOI = 250_000;
    const exitCapRate = 0.07;
    const exitValue = stabilizedNOI / exitCapRate;
    const sellingCosts = exitValue * 0.02;
    const outstandingDebt = 600_000;
    const netExitProceeds = exitValue - sellingCosts - outstandingDebt;

    expect(exitValue).toBeCloseTo(3_571_429, 0);
    expect(netExitProceeds).toBeGreaterThan(0);

    const flows = [-1_000_000, 60_000, 65_000, 70_000, 75_000, 80_000, 85_000, 90_000, 95_000, 100_000, 105_000 + netExitProceeds];
    const result = computeIRR(flows);
    expect(result.converged).toBe(true);

    const nv = npv(flows, result.irr_periodic!);
    expect(Math.abs(nv)).toBeLessThan(1.0);
  });

  it("higher exit cap rate reduces IRR", () => {
    const noi = 200_000;
    const debt = 500_000;

    const exitLowCap = noi / 0.06 - debt;
    const exitHighCap = noi / 0.09 - debt;

    const flowsLowCap = [-800_000, 50_000, 55_000, 60_000, 65_000, 70_000 + exitLowCap];
    const flowsHighCap = [-800_000, 50_000, 55_000, 60_000, 65_000, 70_000 + exitHighCap];

    const irrLow = computeIRR(flowsLowCap);
    const irrHigh = computeIRR(flowsHighCap);

    expect(irrLow.converged && irrHigh.converged).toBe(true);
    expect(irrLow.irr_periodic!).toBeGreaterThan(irrHigh.irr_periodic!);
  });

  it("exit event through pipeline produces correct FCFE", () => {
    const events: StatementEvent[] = [
      {
        event_id: "acq_1",
        event_type: "ACQUISITION",
        date: "2026-01-01",
        entity_id: "prop_a",
        journal_deltas: [
          { account: "PROPERTY", debit: 2_000_000, credit: 0, classification: "BS_ASSET", cash_flow_bucket: "INVESTING", memo: "Property" },
          { account: "DEBT_ACQUISITION", debit: 0, credit: 1_400_000, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING", memo: "Loan" },
          { account: "EQUITY_CONTRIBUTED", debit: 0, credit: 600_000, classification: "BS_EQUITY", cash_flow_bucket: "FINANCING", memo: "Equity" },
        ],
      },
      {
        event_id: "exit_1",
        event_type: "EXIT",
        date: "2036-01-01",
        entity_id: "prop_a",
        journal_deltas: [
          { account: "CASH", debit: 3_000_000, credit: 0, classification: "BS_ASSET", cash_flow_bucket: "INVESTING", memo: "Sale proceeds" },
          { account: "PROPERTY", debit: 0, credit: 2_000_000, classification: "BS_ASSET", cash_flow_bucket: "INVESTING", memo: "Dispose asset" },
          { account: "DEBT_ACQUISITION", debit: 1_000_000, credit: 0, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING", memo: "Repay debt" },
          { account: "CASH", debit: 0, credit: 1_000_000, classification: "BS_ASSET", cash_flow_bucket: "FINANCING", memo: "Debt repayment" },
          { account: "EQUITY_CONTRIBUTED", debit: 0, credit: 1_000_000, classification: "BS_EQUITY", cash_flow_bucket: "FINANCING", memo: "Gain on sale" },
        ],
      },
    ];

    const result = applyEvents(events, rounding);
    expect(result.flags.has_posting_errors).toBe(false);

    const fcfResult = computeFCF(
      { income_statements: result.income_statements, cash_flows: result.cash_flows, posted_entries: result.posted_entries },
      rounding,
    );

    const exitEntry = fcfResult.consolidated.entries.find(e => e.period === "2036-01");
    expect(exitEntry).toBeDefined();
    expect(exitEntry!.capex).toBeLessThan(0);
  });
});
