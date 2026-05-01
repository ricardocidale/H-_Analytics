import { describe, it, expect } from "vitest";
import { applyEvents } from "../../statements/event-applier.js";
import type { StatementEvent } from "../../domain/ledger/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

describe("ASC 230 cash flow identity — Operating + Investing + Financing = Net Change", () => {
  it("holds for equity funding event", () => {
    const events: StatementEvent[] = [{
      event_id: "fund_1",
      event_type: "FUNDING",
      date: "2026-06-01",
      entity_id: "opco",
      journal_deltas: [
        { account: "CASH", debit: 500_000, credit: 0, classification: "BS_ASSET", cash_flow_bucket: "FINANCING", memo: "Equity" },
        { account: "EQUITY_CONTRIBUTED", debit: 0, credit: 500_000, classification: "BS_EQUITY", cash_flow_bucket: "FINANCING", memo: "Equity" },
      ],
    }];

    const result = applyEvents(events, rounding);
    expect(result.flags.has_posting_errors).toBe(false);

    for (const cf of result.cash_flows) {
      const sum = cf.operating + cf.investing + cf.financing;
      expect(sum).toBeCloseTo(cf.net_cash_change, 2);
    }
  });

  it("holds for acquisition with debt financing", () => {
    const events: StatementEvent[] = [{
      event_id: "acq_1",
      event_type: "ACQUISITION",
      date: "2026-07-01",
      entity_id: "prop_a",
      journal_deltas: [
        { account: "PROPERTY", debit: 2_000_000, credit: 0, classification: "BS_ASSET", cash_flow_bucket: "INVESTING", memo: "Property" },
        { account: "DEBT_ACQUISITION", debit: 0, credit: 1_400_000, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING", memo: "Loan" },
        { account: "EQUITY_CONTRIBUTED", debit: 0, credit: 600_000, classification: "BS_EQUITY", cash_flow_bucket: "FINANCING", memo: "Equity" },
      ],
    }];

    const result = applyEvents(events, rounding);
    for (const cf of result.cash_flows) {
      const sum = cf.operating + cf.investing + cf.financing;
      expect(sum).toBeCloseTo(cf.net_cash_change, 2);
    }
  });

  it("holds for debt service (interest + principal)", () => {
    const events: StatementEvent[] = [{
      event_id: "ds_1",
      event_type: "DEBT_SERVICE",
      date: "2026-08-01",
      entity_id: "prop_a",
      journal_deltas: [
        { account: "INTEREST_EXPENSE", debit: 9_333, credit: 0, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING", memo: "Interest" },
        { account: "CASH", debit: 0, credit: 9_333, classification: "BS_ASSET", cash_flow_bucket: "OPERATING", memo: "Interest payment" },
        { account: "DEBT_ACQUISITION", debit: 3_167, credit: 0, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING", memo: "Principal" },
        { account: "CASH", debit: 0, credit: 3_167, classification: "BS_ASSET", cash_flow_bucket: "FINANCING", memo: "Principal payment" },
      ],
    }];

    const result = applyEvents(events, rounding);
    for (const cf of result.cash_flows) {
      const sum = cf.operating + cf.investing + cf.financing;
      expect(sum).toBeCloseTo(cf.net_cash_change, 2);
    }
  });

  it("holds for mixed multi-period scenario (funding + acquisition + debt service)", () => {
    const events: StatementEvent[] = [
      {
        event_id: "fund_1",
        event_type: "FUNDING",
        date: "2026-06-01",
        entity_id: "opco",
        journal_deltas: [
          { account: "CASH", debit: 1_000_000, credit: 0, classification: "BS_ASSET", cash_flow_bucket: "FINANCING", memo: "Funding" },
          { account: "EQUITY_CONTRIBUTED", debit: 0, credit: 1_000_000, classification: "BS_EQUITY", cash_flow_bucket: "FINANCING", memo: "Equity" },
        ],
      },
      {
        event_id: "acq_1",
        event_type: "ACQUISITION",
        date: "2026-07-01",
        entity_id: "prop_a",
        journal_deltas: [
          { account: "PROPERTY", debit: 1_500_000, credit: 0, classification: "BS_ASSET", cash_flow_bucket: "INVESTING", memo: "Property" },
          { account: "DEBT_ACQUISITION", debit: 0, credit: 1_000_000, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING", memo: "Loan" },
          { account: "EQUITY_CONTRIBUTED", debit: 0, credit: 500_000, classification: "BS_EQUITY", cash_flow_bucket: "FINANCING", memo: "Equity" },
        ],
      },
      {
        event_id: "ds_1",
        event_type: "DEBT_SERVICE",
        date: "2026-08-01",
        entity_id: "prop_a",
        journal_deltas: [
          { account: "INTEREST_EXPENSE", debit: 7_500, credit: 0, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING", memo: "Interest" },
          { account: "CASH", debit: 0, credit: 7_500, classification: "BS_ASSET", cash_flow_bucket: "OPERATING", memo: "Interest" },
          { account: "DEBT_ACQUISITION", debit: 2_500, credit: 0, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING", memo: "Principal" },
          { account: "CASH", debit: 0, credit: 2_500, classification: "BS_ASSET", cash_flow_bucket: "FINANCING", memo: "Principal" },
        ],
      },
      {
        event_id: "ds_2",
        event_type: "DEBT_SERVICE",
        date: "2026-09-01",
        entity_id: "prop_a",
        journal_deltas: [
          { account: "INTEREST_EXPENSE", debit: 7_480, credit: 0, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING", memo: "Interest" },
          { account: "CASH", debit: 0, credit: 7_480, classification: "BS_ASSET", cash_flow_bucket: "OPERATING", memo: "Interest" },
          { account: "DEBT_ACQUISITION", debit: 2_520, credit: 0, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING", memo: "Principal" },
          { account: "CASH", debit: 0, credit: 2_520, classification: "BS_ASSET", cash_flow_bucket: "FINANCING", memo: "Principal" },
        ],
      },
    ];

    const result = applyEvents(events, rounding);
    expect(result.flags.has_posting_errors).toBe(false);
    expect(result.periods).toHaveLength(4);

    for (const cf of result.cash_flows) {
      const sum = cf.operating + cf.investing + cf.financing;
      expect(sum).toBeCloseTo(cf.net_cash_change, 2);
    }
  });

  it("holds for refinancing event", () => {
    const events: StatementEvent[] = [{
      event_id: "refi_1",
      event_type: "REFINANCE",
      date: "2029-06-01",
      entity_id: "prop_a",
      journal_deltas: [
        { account: "DEBT_NEW", debit: 0, credit: 1_800_000, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING", memo: "New loan" },
        { account: "DEBT_ACQUISITION", debit: 900_000, credit: 0, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING", memo: "Payoff old" },
        { account: "CASH", debit: 900_000, credit: 0, classification: "BS_ASSET", cash_flow_bucket: "FINANCING", memo: "Cash-out" },
      ],
    }];

    const result = applyEvents(events, rounding);
    for (const cf of result.cash_flows) {
      const sum = cf.operating + cf.investing + cf.financing;
      expect(sum).toBeCloseTo(cf.net_cash_change, 2);
    }
  });
});

describe("ASC 230 — balance sheet must balance every period", () => {
  it("A = L + E through multi-period lifecycle", () => {
    const events: StatementEvent[] = [
      {
        event_id: "fund_1",
        event_type: "FUNDING",
        date: "2026-06-01",
        entity_id: "opco",
        journal_deltas: [
          { account: "CASH", debit: 750_000, credit: 0, classification: "BS_ASSET", cash_flow_bucket: "FINANCING", memo: "Equity" },
          { account: "EQUITY_CONTRIBUTED", debit: 0, credit: 750_000, classification: "BS_EQUITY", cash_flow_bucket: "FINANCING", memo: "Equity" },
        ],
      },
      {
        event_id: "acq_1",
        event_type: "ACQUISITION",
        date: "2026-07-01",
        entity_id: "prop_a",
        journal_deltas: [
          { account: "PROPERTY", debit: 2_000_000, credit: 0, classification: "BS_ASSET", cash_flow_bucket: "INVESTING", memo: "Property" },
          { account: "DEBT_ACQUISITION", debit: 0, credit: 1_400_000, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING", memo: "Loan" },
          { account: "EQUITY_CONTRIBUTED", debit: 0, credit: 600_000, classification: "BS_EQUITY", cash_flow_bucket: "FINANCING", memo: "Equity" },
        ],
      },
      {
        event_id: "dep_1",
        event_type: "DEPRECIATION",
        date: "2026-08-01",
        entity_id: "prop_a",
        journal_deltas: [
          { account: "DEPRECIATION_EXPENSE", debit: 5_000, credit: 0, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING", memo: "Depreciation" },
          { account: "PROPERTY", debit: 0, credit: 5_000, classification: "BS_ASSET", cash_flow_bucket: "OPERATING", memo: "Accumulated depreciation" },
        ],
      },
    ];

    const result = applyEvents(events, rounding);
    expect(result.flags.has_posting_errors).toBe(false);

    for (const bs of result.balance_sheets) {
      expect(bs.balanced).toBe(true);
      const diff = Math.abs(bs.total_assets - (bs.total_liabilities + bs.total_equity));
      expect(diff).toBeLessThan(0.01);
    }
  });
});

describe("ASC 230 — cumulative cash change equals ending cash", () => {
  it("running total of net cash changes matches final cash position", () => {
    const events: StatementEvent[] = [
      {
        event_id: "fund_1",
        event_type: "FUNDING",
        date: "2026-06-01",
        entity_id: "opco",
        journal_deltas: [
          { account: "CASH", debit: 500_000, credit: 0, classification: "BS_ASSET", cash_flow_bucket: "FINANCING", memo: "Funding" },
          { account: "EQUITY_CONTRIBUTED", debit: 0, credit: 500_000, classification: "BS_EQUITY", cash_flow_bucket: "FINANCING", memo: "Equity" },
        ],
      },
      {
        event_id: "ds_1",
        event_type: "DEBT_SERVICE",
        date: "2026-07-01",
        entity_id: "prop_a",
        journal_deltas: [
          { account: "INTEREST_EXPENSE", debit: 5_000, credit: 0, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING", memo: "Interest" },
          { account: "CASH", debit: 0, credit: 5_000, classification: "BS_ASSET", cash_flow_bucket: "OPERATING", memo: "Interest" },
        ],
      },
      {
        event_id: "ds_2",
        event_type: "DEBT_SERVICE",
        date: "2026-08-01",
        entity_id: "prop_a",
        journal_deltas: [
          { account: "INTEREST_EXPENSE", debit: 5_000, credit: 0, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING", memo: "Interest" },
          { account: "CASH", debit: 0, credit: 5_000, classification: "BS_ASSET", cash_flow_bucket: "OPERATING", memo: "Interest" },
        ],
      },
    ];

    const result = applyEvents(events, rounding);
    const totalNetChange = result.cash_flows.reduce((sum, cf) => sum + cf.net_cash_change, 0);
    expect(totalNetChange).toBeCloseTo(490_000, 2);
  });
});
