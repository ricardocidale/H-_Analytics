/**
 * Task #1297 — Unit tests for getRangeStatus (RangeIndicator.tsx)
 *
 * Covers the four return values:
 *   "within"  — value falls inside [low, high]
 *   "near"    — value is within 20% of the span beyond each boundary
 *   "outside" — value is more than 20% of the span beyond a boundary
 *   "unknown" — low === high (point guidance, no meaningful range to compare)
 *
 * The degenerate low === high case is the regression target: without the
 * early-return guard a zero-span would set margin=0, causing every value
 * except the exact point to be flagged "outside" — a misleading warning.
 */
import { describe, it, expect } from "vitest";
import { getRangeStatus } from "@/components/research/RangeIndicator";

describe("getRangeStatus()", () => {
  // ── within ────────────────────────────────────────────────────────────────
  describe("within", () => {
    it("returns 'within' when value equals low bound", () => {
      expect(getRangeStatus(10, 10, 20)).toBe("within");
    });

    it("returns 'within' when value equals high bound", () => {
      expect(getRangeStatus(20, 10, 20)).toBe("within");
    });

    it("returns 'within' when value is strictly inside the range", () => {
      expect(getRangeStatus(15, 10, 20)).toBe("within");
    });

    it("returns 'within' for a percent-scale range (e.g. 3%–5%)", () => {
      expect(getRangeStatus(4, 3, 5)).toBe("within");
    });
  });

  // ── near ──────────────────────────────────────────────────────────────────
  describe("near", () => {
    // span = 10, margin = 2 → near window is [8, 22]
    it("returns 'near' when value is just below low (within 20% margin)", () => {
      expect(getRangeStatus(9, 10, 20)).toBe("near");
    });

    it("returns 'near' when value is just above high (within 20% margin)", () => {
      expect(getRangeStatus(21, 10, 20)).toBe("near");
    });

    it("returns 'near' at the exact lower near boundary (low - 20% span)", () => {
      // span=10, margin=2 → lower near boundary = 10-2 = 8
      expect(getRangeStatus(8, 10, 20)).toBe("near");
    });

    it("returns 'near' at the exact upper near boundary (high + 20% span)", () => {
      // span=10, margin=2 → upper near boundary = 20+2 = 22
      expect(getRangeStatus(22, 10, 20)).toBe("near");
    });
  });

  // ── outside ───────────────────────────────────────────────────────────────
  describe("outside", () => {
    it("returns 'outside' when value is far below low", () => {
      // span=10, margin=2 → outside starts below 8
      expect(getRangeStatus(5, 10, 20)).toBe("outside");
    });

    it("returns 'outside' when value is far above high", () => {
      expect(getRangeStatus(30, 10, 20)).toBe("outside");
    });

    it("returns 'outside' for a negative value vs a positive range", () => {
      expect(getRangeStatus(-5, 10, 20)).toBe("outside");
    });
  });

  // ── unknown (degenerate low === high) ─────────────────────────────────────
  describe("unknown — degenerate low === high (regression for task #1291)", () => {
    it("returns 'unknown' when low and high are equal (point guidance)", () => {
      expect(getRangeStatus(12.5, 12.5, 12.5)).toBe("unknown");
    });

    it("returns 'unknown' even when value matches the point exactly", () => {
      expect(getRangeStatus(5, 5, 5)).toBe("unknown");
    });

    it("returns 'unknown' even when value differs from the point", () => {
      // Before the fix this would evaluate: span=0, margin=0, value outside [5,5]
      // with zero margin → incorrectly flagged as 'outside'.
      expect(getRangeStatus(10, 5, 5)).toBe("unknown");
    });

    it("returns 'unknown' for a zero-valued point (low=0, high=0)", () => {
      expect(getRangeStatus(0, 0, 0)).toBe("unknown");
      expect(getRangeStatus(1, 0, 0)).toBe("unknown");
    });

    it("returns 'unknown' for a percent-scale point value", () => {
      // Analyst returned valueLow=4, valueHigh=4 (no real range)
      expect(getRangeStatus(4, 4, 4)).toBe("unknown");
    });
  });
});
