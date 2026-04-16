import { describe, it, expect } from "vitest";
import {
  formatMoney,
  formatPercent,
  isNegative,
  getFiscalYearLabel,
  getFiscalYearForModelYear,
} from "../../client/src/lib/financial/utils";
import {
  formatDateTime,
  formatDuration,
  formatMoneyInput,
  parseMoneyInput,
} from "../../client/src/lib/formatters";
import { parseLocalDate } from "../../shared/dates";
import { withinTolerance, formatVariance } from "../../client/src/lib/audits/helpers";
import { isFieldEmpty, fillMissingFields } from "../../server/syncHelpers";

// ---------------------------------------------------------------------------
// formatMoney — accounting-style USD formatting
// ---------------------------------------------------------------------------
describe("formatMoney", () => {
  it("formats positive whole amounts with commas", () => {
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(999)).toBe("$999");
    expect(formatMoney(1_234)).toBe("$1,234");
    expect(formatMoney(1_000_000)).toBe("$1,000,000");
  });

  it("wraps negatives in accounting-style parentheses", () => {
    expect(formatMoney(-1)).toBe("($1)");
    expect(formatMoney(-500)).toBe("($500)");
    expect(formatMoney(-1_234_567)).toBe("($1,234,567)");
  });

  it("rounds fractional dollars to nearest integer", () => {
    expect(formatMoney(1234.56)).toBe("$1,235");
    expect(formatMoney(1234.49)).toBe("$1,234");
    expect(formatMoney(-99.9)).toBe("($100)");
  });

  it("handles very large values without scientific notation", () => {
    expect(formatMoney(999_999_999)).toBe("$999,999,999");
  });
});

// ---------------------------------------------------------------------------
// formatPercent — decimal ratio to percentage string
// ---------------------------------------------------------------------------
describe("formatPercent", () => {
  it("converts decimal ratios to percentage with one decimal", () => {
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(0.05)).toBe("5.0%");
    expect(formatPercent(0.123)).toBe("12.3%");
    expect(formatPercent(1.0)).toBe("100.0%");
  });

  it("handles values above 100%", () => {
    expect(formatPercent(1.5)).toBe("150.0%");
  });

  it("handles negative percentages", () => {
    const result = formatPercent(-0.05);
    expect(result).toContain("5.0%");
    expect(result).toContain("-");
  });
});

// ---------------------------------------------------------------------------
// isNegative — CSS helper
// ---------------------------------------------------------------------------
describe("isNegative", () => {
  it("returns true for negative numbers", () => {
    expect(isNegative(-1)).toBe(true);
    expect(isNegative(-0.001)).toBe(true);
  });

  it("returns false for zero and positive", () => {
    expect(isNegative(0)).toBe(false);
    expect(isNegative(100)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatMoneyInput / parseMoneyInput — input field formatting roundtrip
// ---------------------------------------------------------------------------
describe("formatMoneyInput", () => {
  it("adds commas to large numbers", () => {
    expect(formatMoneyInput(1000)).toBe("1,000");
    expect(formatMoneyInput(1_234_567)).toBe("1,234,567");
  });

  it("handles zero and small numbers", () => {
    expect(formatMoneyInput(0)).toBe("0");
    expect(formatMoneyInput(42)).toBe("42");
  });
});

describe("parseMoneyInput", () => {
  it("parses comma-separated strings back to numbers", () => {
    expect(parseMoneyInput("1,000")).toBe(1000);
    expect(parseMoneyInput("1,234,567")).toBe(1234567);
  });

  it("returns 0 for empty or invalid input", () => {
    expect(parseMoneyInput("")).toBe(0);
    expect(parseMoneyInput("abc")).toBe(0);
  });

  it("roundtrips with formatMoneyInput", () => {
    for (const v of [0, 42, 2_500_000, 123_456_789]) {
      expect(parseMoneyInput(formatMoneyInput(v))).toBe(v);
    }
  });
});

// ---------------------------------------------------------------------------
// formatDuration — session duration display
// ---------------------------------------------------------------------------
describe("formatDuration", () => {
  it('returns "Active" when end time is null', () => {
    expect(formatDuration("2026-04-01T10:00:00Z", null)).toBe("Active");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration("2026-04-01T10:00:00Z", "2026-04-01T12:30:00Z")).toBe("2h 30m");
  });

  it("shows only minutes for sub-hour durations", () => {
    expect(formatDuration("2026-04-01T10:00:00Z", "2026-04-01T10:45:00Z")).toBe("45m");
  });

  it("handles zero-length duration", () => {
    expect(formatDuration("2026-04-01T10:00:00Z", "2026-04-01T10:00:00Z")).toBe("0m");
  });
});

// ---------------------------------------------------------------------------
// parseLocalDate — timezone-safe date parsing
// ---------------------------------------------------------------------------
describe("parseLocalDate", () => {
  it("treats YYYY-MM-DD as local midnight (not UTC)", () => {
    const d = parseLocalDate("2027-07-01");
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(6); // July = 6
  });

  it("passes through strings that already have a T separator", () => {
    const d = parseLocalDate("2026-04-01T14:30:00Z");
    expect(d.getFullYear()).toBe(2026);
  });
});

// ---------------------------------------------------------------------------
// withinTolerance — audit comparison helper
// ---------------------------------------------------------------------------
describe("withinTolerance", () => {
  it("returns true when both values are zero", () => {
    expect(withinTolerance(0, 0)).toBe(true);
  });

  it("returns true when values are within default 0.1% tolerance", () => {
    // Default AUDIT_VARIANCE_TOLERANCE is 0.001 (0.1%)
    expect(withinTolerance(1000, 1000.5)).toBe(true);
  });

  it("returns false when variance exceeds tolerance", () => {
    expect(withinTolerance(1000, 1005)).toBe(false);
  });

  it("handles expected=0 edge case", () => {
    expect(withinTolerance(0, 0.0005)).toBe(true);
    expect(withinTolerance(0, 0.005)).toBe(false);
  });

  it("accepts custom tolerance", () => {
    expect(withinTolerance(100, 110, 0.15)).toBe(true);
    expect(withinTolerance(100, 110, 0.05)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatVariance — audit variance display
// ---------------------------------------------------------------------------
describe("formatVariance", () => {
  it("shows positive diff with plus sign", () => {
    const result = formatVariance(1000, 1050);
    expect(result).toContain("+50.00");
    expect(result).toContain("5.00%");
  });

  it("shows negative diff", () => {
    const result = formatVariance(1000, 950);
    expect(result).toContain("-50.00");
  });

  it('shows N/A percentage when expected is zero', () => {
    const result = formatVariance(0, 100);
    expect(result).toContain("N/A");
  });
});

// ---------------------------------------------------------------------------
// isFieldEmpty / fillMissingFields — sync helpers (pure functions)
// ---------------------------------------------------------------------------
describe("isFieldEmpty", () => {
  it("treats null and undefined as empty", () => {
    expect(isFieldEmpty(null)).toBe(true);
    expect(isFieldEmpty(undefined)).toBe(true);
  });

  it("treats blank/whitespace-only strings as empty", () => {
    expect(isFieldEmpty("")).toBe(true);
    expect(isFieldEmpty("   ")).toBe(true);
  });

  it("treats zero and false as non-empty (valid user values)", () => {
    expect(isFieldEmpty(0)).toBe(false);
    expect(isFieldEmpty(false)).toBe(false);
  });

  it("treats non-empty strings as non-empty", () => {
    expect(isFieldEmpty("hello")).toBe(false);
  });
});

describe("fillMissingFields", () => {
  it("fills null/undefined fields from defaults", () => {
    const existing: Record<string, unknown> = { name: null, age: 25 };
    const defaults = { name: "Default", age: 30 };
    const result = fillMissingFields(existing, defaults, []);
    expect(result).toEqual({ name: "Default" });
  });

  it("does not overwrite existing non-empty values", () => {
    const existing: Record<string, unknown> = { name: "Alice", rate: 0.05 };
    const defaults = { name: "Default", rate: 0.10 };
    const result = fillMissingFields(existing, defaults, []);
    expect(result).toEqual({});
  });

  it("preserves zero as a valid user value (does not fill)", () => {
    const existing: Record<string, unknown> = { amount: 0 };
    const defaults = { amount: 1000 };
    const result = fillMissingFields(existing, defaults, []);
    expect(result).toEqual({});
  });

  it("excludes specified keys", () => {
    const existing: Record<string, unknown> = { id: null, name: null };
    const defaults = { id: 99, name: "Default" };
    const result = fillMissingFields(existing, defaults, ["id"]);
    expect(result).toEqual({ name: "Default" });
  });
});
