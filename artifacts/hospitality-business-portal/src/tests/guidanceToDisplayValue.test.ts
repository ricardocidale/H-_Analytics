/**
 * Task #1297 — Unit tests for guidanceToDisplayValue (useCompanyAnalyst.tsx)
 *
 * Covers:
 *   - Normal range  (valueLow < valueHigh)         → "X%–Y%" or "$XK–$YK"
 *   - Point value   (valueLow === valueHigh)        → single value, no dash
 *   - valueMid null                                 → null return
 *   - Dollar fields (isDollar = true)               → "$" prefix, K-suffix
 *   - Percent fields (isDollar = false, default)    → "%" suffix
 *
 * The degenerate valueLow === valueHigh case is the regression target: before
 * task #1291 the display would render "12.5%–12.5%" — an identical pair that
 * RangeIndicator's parseRange then fed as low===high to getRangeStatus, causing
 * a misleading "Outside suggested range" badge.
 */
import { describe, it, expect } from "vitest";
import { guidanceToDisplayValue, type GuidanceRecord } from "@/hooks/useCompanyAnalyst";

function makeRec(overrides: Partial<GuidanceRecord> = {}): GuidanceRecord {
  return {
    assumptionKey: "baseManagementFee",
    valueLow: null,
    valueMid: null,
    valueHigh: null,
    confidence: null,
    sourceName: null,
    sourceDate: null,
    reasoning: null,
    ...overrides,
  };
}

describe("guidanceToDisplayValue()", () => {
  // ── null guard ─────────────────────────────────────────────────────────────
  describe("null guard", () => {
    it("returns null when valueMid is null", () => {
      expect(guidanceToDisplayValue(makeRec({ valueMid: null }))).toBeNull();
    });
  });

  // ── percent fields (default) ───────────────────────────────────────────────
  describe("percent fields — normal range", () => {
    it("formats 'X%–Y%' for a normal percent range", () => {
      const result = guidanceToDisplayValue(
        makeRec({ assumptionKey: "baseManagementFee", valueLow: 3, valueMid: 4, valueHigh: 5 }),
      );
      expect(result).not.toBeNull();
      expect(result!.display).toBe("3%–5%");
      expect(result!.mid).toBe(4);
    });

    it("formats decimal bounds correctly (toFixed(1))", () => {
      const result = guidanceToDisplayValue(
        makeRec({ assumptionKey: "baseManagementFee", valueLow: 3.5, valueMid: 4, valueHigh: 4.5 }),
      );
      expect(result!.display).toBe("3.5%–4.5%");
    });

    it("formats integer bounds without decimals", () => {
      const result = guidanceToDisplayValue(
        makeRec({ assumptionKey: "companyTaxRate", valueLow: 25, valueMid: 30, valueHigh: 35 }),
      );
      expect(result!.display).toBe("25%–35%");
    });
  });

  // ── percent fields — point value (low === high) ────────────────────────────
  describe("percent fields — point value (regression for task #1291)", () => {
    it("renders single '12.5%' not '12.5%–12.5%' when low === high", () => {
      const result = guidanceToDisplayValue(
        makeRec({ assumptionKey: "baseManagementFee", valueLow: 12.5, valueMid: 12.5, valueHigh: 12.5 }),
      );
      expect(result).not.toBeNull();
      expect(result!.display).toBe("12.5%");
      expect(result!.display).not.toContain("–");
    });

    it("renders single '4%' when Analyst provides an integer point value", () => {
      const result = guidanceToDisplayValue(
        makeRec({ assumptionKey: "baseManagementFee", valueLow: 4, valueMid: 4, valueHigh: 4 }),
      );
      expect(result!.display).toBe("4%");
      expect(result!.display).not.toContain("–");
    });

    it("still renders the correct mid when low === high", () => {
      const result = guidanceToDisplayValue(
        makeRec({ assumptionKey: "baseManagementFee", valueLow: 7, valueMid: 7, valueHigh: 7 }),
      );
      expect(result!.mid).toBe(7);
    });
  });

  // ── dollar fields ──────────────────────────────────────────────────────────
  describe("dollar fields — normal range", () => {
    it("formats '$XK–$YK' for a staffSalary range in thousands", () => {
      const result = guidanceToDisplayValue(
        makeRec({ assumptionKey: "staffSalary", valueLow: 65000, valueMid: 75000, valueHigh: 90000 }),
      );
      expect(result!.display).toBe("$65K–$90K");
      expect(result!.mid).toBe(75000);
    });

    it("formats sub-1K dollar values without K suffix", () => {
      const result = guidanceToDisplayValue(
        makeRec({ assumptionKey: "staffSalary", valueLow: 500, valueMid: 750, valueHigh: 900 }),
      );
      expect(result!.display).toBe("$500–$900");
    });

    it("formats officeLease range correctly", () => {
      const result = guidanceToDisplayValue(
        makeRec({ assumptionKey: "officeLease", valueLow: 24000, valueMid: 36000, valueHigh: 48000 }),
      );
      expect(result!.display).toBe("$24K–$48K");
    });
  });

  // ── dollar fields — point value ────────────────────────────────────────────
  describe("dollar fields — point value (low === high)", () => {
    it("renders '$75K' not '$75K–$75K' when low === high for a dollar field", () => {
      const result = guidanceToDisplayValue(
        makeRec({ assumptionKey: "staffSalary", valueLow: 75000, valueMid: 75000, valueHigh: 75000 }),
      );
      expect(result!.display).toBe("$75K");
      expect(result!.display).not.toContain("–");
    });
  });

  // ── metadata passthrough ───────────────────────────────────────────────────
  describe("metadata passthrough", () => {
    it("passes sourceName through when present", () => {
      const result = guidanceToDisplayValue(
        makeRec({ valueLow: 3, valueMid: 4, valueHigh: 5, sourceName: "CBRE 2024" }),
      );
      expect(result!.sourceName).toBe("CBRE 2024");
    });

    it("passes sourceDate through when present", () => {
      const result = guidanceToDisplayValue(
        makeRec({ valueLow: 3, valueMid: 4, valueHigh: 5, sourceDate: "2024-01" }),
      );
      expect(result!.sourceDate).toBe("2024-01");
    });

    it("passes confidence through when present", () => {
      const result = guidanceToDisplayValue(
        makeRec({ valueLow: 3, valueMid: 4, valueHigh: 5, confidence: "high" }),
      );
      expect(result!.confidence).toBe("high");
    });

    it("leaves sourceName undefined when null in record", () => {
      const result = guidanceToDisplayValue(
        makeRec({ valueLow: 3, valueMid: 4, valueHigh: 5, sourceName: null }),
      );
      expect(result!.sourceName).toBeUndefined();
    });
  });

  // ── valueLow/High null — falls back to point display ──────────────────────
  describe("null valueLow or valueHigh — falls back to mid-only display", () => {
    it("renders single percent value when valueLow is null", () => {
      const result = guidanceToDisplayValue(
        makeRec({ assumptionKey: "baseManagementFee", valueLow: null, valueMid: 4, valueHigh: null }),
      );
      expect(result!.display).toBe("4%");
    });

    it("renders single dollar value when valueLow is null for a dollar field", () => {
      const result = guidanceToDisplayValue(
        makeRec({ assumptionKey: "staffSalary", valueLow: null, valueMid: 75000, valueHigh: null }),
      );
      expect(result!.display).toBe("$75K");
    });
  });
});
