import { describe, it, expect } from "vitest";
import { formatMoney, formatPercent, isNegative, getFiscalYearLabel, getFiscalYearForModelYear } from "../../client/src/lib/financialEngine.js";
import { formatDateTime, formatDuration, formatMoneyInput, parseMoneyInput } from "../../client/src/lib/formatters.js";

describe("formatMoney", () => {
  it("formats positive amounts", () => {
    expect(formatMoney(1234)).toBe("$1,234");
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(1_000_000)).toBe("$1,000,000");
  });

  it("wraps negative amounts in parentheses", () => {
    expect(formatMoney(-500)).toBe("($500)");
    expect(formatMoney(-1_234_567)).toBe("($1,234,567)");
  });

  it("rounds to whole dollars", () => {
    expect(formatMoney(1234.56)).toBe("$1,235");
    expect(formatMoney(1234.49)).toBe("$1,234");
  });
});

describe("formatPercent", () => {
  it("formats decimals as percentages", () => {
    expect(formatPercent(0.05)).toBe("5.0%");
    expect(formatPercent(0.123)).toBe("12.3%");
    expect(formatPercent(1.0)).toBe("100.0%");
  });

  it("formats zero", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });
});

describe("isNegative", () => {
  it("returns true for negative numbers", () => {
    expect(isNegative(-1)).toBe(true);
    expect(isNegative(-0.001)).toBe(true);
  });

  it("returns false for zero and positive", () => {
    expect(isNegative(0)).toBe(false);
    expect(isNegative(1)).toBe(false);
  });
});

describe("formatMoneyInput", () => {
  it("adds commas to large numbers", () => {
    expect(formatMoneyInput(1000)).toBe("1,000");
    expect(formatMoneyInput(1234567)).toBe("1,234,567");
  });

  it("handles zero", () => {
    expect(formatMoneyInput(0)).toBe("0");
  });
});

describe("parseMoneyInput", () => {
  it("parses comma-separated numbers", () => {
    expect(parseMoneyInput("1,000")).toBe(1000);
    expect(parseMoneyInput("1,234,567")).toBe(1234567);
  });

  it("returns 0 for empty/invalid input", () => {
    expect(parseMoneyInput("")).toBe(0);
    expect(parseMoneyInput("abc")).toBe(0);
  });

  it("roundtrips with formatMoneyInput", () => {
    const original = 2_500_000;
    expect(parseMoneyInput(formatMoneyInput(original))).toBe(original);
  });
});

describe("formatDateTime", () => {
  it("formats ISO date strings", () => {
    const result = formatDateTime("2026-04-15T14:30:00Z");
    // Should contain month, day, year, and time
    expect(result).toContain("2026");
    expect(result).toContain("15");
  });
});

describe("formatDuration", () => {
  it("returns Active for null end time", () => {
    expect(formatDuration("2026-04-01T10:00:00Z", null)).toBe("Active");
  });

  it("calculates hours and minutes", () => {
    const start = "2026-04-01T10:00:00Z";
    const end = "2026-04-01T12:30:00Z";
    expect(formatDuration(start, end)).toBe("2h 30m");
  });

  it("shows only minutes for sub-hour durations", () => {
    const start = "2026-04-01T10:00:00Z";
    const end = "2026-04-01T10:45:00Z";
    expect(formatDuration(start, end)).toBe("45m");
  });
});

describe("getFiscalYearLabel", () => {
  it("returns calendar year for January fiscal year start", () => {
    // Model starts Apr 2026, fiscal year starts Jan
    // Month 0 = Apr 2026 → fiscal year 2026
    expect(getFiscalYearLabel("2026-04-01", 1, 0)).toBe(2026);
    // Month 9 = Jan 2027 → fiscal year 2027
    expect(getFiscalYearLabel("2026-04-01", 1, 9)).toBe(2027);
  });

  it("handles non-January fiscal year start", () => {
    // Model starts Apr 2026, fiscal year starts Apr (month 4)
    // Month 0 = Apr 2026 → fiscal year 2026 (starts in Apr 2026)
    expect(getFiscalYearLabel("2026-04-01", 4, 0)).toBe(2026);
    // Month 12 = Apr 2027 → fiscal year 2027 (starts in Apr 2027)
    expect(getFiscalYearLabel("2026-04-01", 4, 12)).toBe(2027);
  });
});

describe("getFiscalYearForModelYear", () => {
  it("returns correct fiscal year for model year index", () => {
    // Model year 0, model starts Apr 2026, fiscal year starts Jan
    expect(getFiscalYearForModelYear("2026-04-01", 1, 0)).toBe(2026);
    // Model year 1 → first month is index 12 → Apr 2027
    expect(getFiscalYearForModelYear("2026-04-01", 1, 1)).toBe(2027);
  });
});
