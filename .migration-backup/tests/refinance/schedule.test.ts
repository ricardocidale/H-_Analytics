import { describe, it, expect } from "vitest";
import { buildSchedule } from "../../calc/refinance/schedule.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

describe("buildSchedule — fully amortizing", () => {
  const terms = {
    rate_annual: 0.07,
    term_months: 300,
    amortization_months: 300,
    io_months: 0,
  };

  it("produces correct number of entries", () => {
    const schedule = buildSchedule(1_300_000, terms, rounding);
    expect(schedule).toHaveLength(300);
  });

  it("first month has correct beginning balance", () => {
    const schedule = buildSchedule(1_300_000, terms, rounding);
    expect(schedule[0].beginning_balance).toBe(1_300_000);
    expect(schedule[0].is_io).toBe(false);
  });

  it("first month interest matches balance * monthly rate", () => {
    const schedule = buildSchedule(1_300_000, terms, rounding);
    const expectedInterest = Math.round(1_300_000 * (0.07 / 12) * 100) / 100;
    expect(schedule[0].interest).toBeCloseTo(expectedInterest, 2);
  });

  it("final month ending balance is zero", () => {
    const schedule = buildSchedule(1_300_000, terms, rounding);
    expect(schedule[299].ending_balance).toBe(0);
  });

  it("no entry is marked IO", () => {
    const schedule = buildSchedule(1_300_000, terms, rounding);
    expect(schedule.every((e) => !e.is_io)).toBe(true);
  });
});

describe("buildSchedule — IO then amortizing", () => {
  const terms = {
    rate_annual: 0.07,
    term_months: 300,
    amortization_months: 300,
    io_months: 24,
  };

  it("IO period has zero principal", () => {
    const schedule = buildSchedule(1_000_000, terms, rounding);
    for (let m = 0; m < 24; m++) {
      expect(schedule[m].principal).toBe(0);
      expect(schedule[m].is_io).toBe(true);
    }
  });

  it("balance unchanged during IO period", () => {
    const schedule = buildSchedule(1_000_000, terms, rounding);
    for (let m = 0; m < 24; m++) {
      expect(schedule[m].beginning_balance).toBe(1_000_000);
      expect(schedule[m].ending_balance).toBe(1_000_000);
    }
  });

  it("IO payment is interest only", () => {
    const schedule = buildSchedule(1_000_000, terms, rounding);
    const expectedIO = Math.round(1_000_000 * (0.07 / 12) * 100) / 100;
    expect(schedule[0].payment).toBeCloseTo(expectedIO, 2);
    expect(schedule[0].interest).toBeCloseTo(expectedIO, 2);
  });

  it("first amortizing month is correctly flagged", () => {
    const schedule = buildSchedule(1_000_000, terms, rounding);
    expect(schedule[23].is_io).toBe(true);
    expect(schedule[24].is_io).toBe(false);
    expect(schedule[24].principal).toBeGreaterThan(0);
  });

  it("final month ending balance is zero", () => {
    const schedule = buildSchedule(1_000_000, terms, rounding);
    expect(schedule[299].ending_balance).toBe(0);
  });
});

describe("buildSchedule — roll-forward reconciliation", () => {
  const terms = {
    rate_annual: 0.07,
    term_months: 120,
    amortization_months: 120,
    io_months: 0,
  };

  it("ending balance ties to next month beginning balance", () => {
    const schedule = buildSchedule(500_000, terms, rounding);
    for (let m = 0; m < schedule.length - 1; m++) {
      expect(schedule[m].ending_balance).toBe(schedule[m + 1].beginning_balance);
    }
  });

  it("beginning - principal = ending for every month", () => {
    const schedule = buildSchedule(500_000, terms, rounding);
    for (const entry of schedule) {
      expect(entry.ending_balance).toBeCloseTo(
        entry.beginning_balance - entry.principal,
        2,
      );
    }
  });

  it("payment = interest + principal for every month", () => {
    const schedule = buildSchedule(500_000, terms, rounding);
    for (const entry of schedule) {
      expect(entry.payment).toBeCloseTo(entry.interest + entry.principal, 2);
    }
  });

  it("total principal equals loan amount", () => {
    const schedule = buildSchedule(500_000, terms, rounding);
    const totalPrincipal = schedule.reduce((sum, e) => sum + e.principal, 0);
    expect(totalPrincipal).toBeCloseTo(500_000, 0);
  });
});

describe("buildSchedule — zero interest", () => {
  it("straight-line principal repayment", () => {
    const terms = {
      rate_annual: 0,
      term_months: 120,
      amortization_months: 120,
      io_months: 0,
    };
    const schedule = buildSchedule(120_000, terms, rounding);
    for (const entry of schedule) {
      expect(entry.interest).toBe(0);
      expect(entry.principal).toBeCloseTo(1_000, 2);
    }
    expect(schedule[119].ending_balance).toBe(0);
  });
});

describe("buildSchedule — balloon payment", () => {
  it("balloon at maturity when amort > remaining term", () => {
    const terms = {
      rate_annual: 0.07,
      term_months: 60,
      amortization_months: 300,
      io_months: 0,
    };
    const schedule = buildSchedule(1_000_000, terms, rounding);
    expect(schedule).toHaveLength(60);
    // Final month should have a large principal (balloon)
    expect(schedule[59].principal).toBeGreaterThan(800_000);
    expect(schedule[59].ending_balance).toBe(0);
  });
});
