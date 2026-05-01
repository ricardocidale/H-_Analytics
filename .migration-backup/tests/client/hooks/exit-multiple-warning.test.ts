/**
 * Tests for the post-save exit-revenue-multiple band warning helper used by
 * Company Assumptions. Locks the contract that warnings (not blocks) surface
 * on save when the user-entered multiple falls outside the admin-managed
 * vertical band — task #365.
 */
import { describe, it, expect } from "vitest";
import {
  computeExitMultipleWarning,
  type ExitMultipleBand,
} from "../../../client/src/hooks/exit-multiple-warning";

const BANDS: ExitMultipleBand[] = [
  {
    dimensionKey: "saas",
    label: "SaaS",
    valueLow: 5,
    valueMid: 8,
    valueHigh: 12,
  },
  {
    dimensionKey: "hospitality",
    label: "Hospitality",
    valueLow: 1,
    valueMid: 1.5,
    valueHigh: 2.5,
  },
];

describe("computeExitMultipleWarning", () => {
  it("returns null when the multiple is inside the band", () => {
    const w = computeExitMultipleWarning({
      industryVertical: "saas",
      exitRevenueMultiple: 8,
      bands: BANDS,
    });
    expect(w).toBeNull();
  });

  it("returns a warning when the multiple is above the band", () => {
    const w = computeExitMultipleWarning({
      industryVertical: "saas",
      exitRevenueMultiple: 20,
      bands: BANDS,
    });
    expect(w).not.toBeNull();
    expect(w!.fieldName).toBe("exitRevenueMultiple");
    expect(w!.fieldLabel).toContain("SaaS");
    expect(w!.currentValue).toBe(20);
    expect(w!.rangeLow).toBe(5);
    expect(w!.rangeHigh).toBe(12);
    expect(w!.display).toContain("5.0x");
    expect(w!.display).toContain("12.0x");
    expect(w!.display).toContain("mid 8.0x");
  });

  it("returns a warning when the multiple is below the band", () => {
    const w = computeExitMultipleWarning({
      industryVertical: "hospitality",
      exitRevenueMultiple: 0.5,
      bands: BANDS,
    });
    expect(w).not.toBeNull();
    expect(w!.currentValue).toBe(0.5);
    expect(w!.rangeLow).toBe(1);
    expect(w!.rangeHigh).toBe(2.5);
  });

  it("matches verticals case-insensitively and trims whitespace", () => {
    const w = computeExitMultipleWarning({
      industryVertical: "  SaaS ",
      exitRevenueMultiple: 99,
      bands: BANDS,
    });
    expect(w).not.toBeNull();
    expect(w!.fieldLabel).toContain("SaaS");
  });

  it("returns null when no vertical is selected", () => {
    expect(
      computeExitMultipleWarning({
        industryVertical: null,
        exitRevenueMultiple: 999,
        bands: BANDS,
      }),
    ).toBeNull();
    expect(
      computeExitMultipleWarning({
        industryVertical: "",
        exitRevenueMultiple: 999,
        bands: BANDS,
      }),
    ).toBeNull();
  });

  it("returns null when no multiple is entered", () => {
    expect(
      computeExitMultipleWarning({
        industryVertical: "saas",
        exitRevenueMultiple: null,
        bands: BANDS,
      }),
    ).toBeNull();
    expect(
      computeExitMultipleWarning({
        industryVertical: "saas",
        exitRevenueMultiple: undefined,
        bands: BANDS,
      }),
    ).toBeNull();
  });

  it("returns null when no band exists for the vertical", () => {
    const w = computeExitMultipleWarning({
      industryVertical: "unknown",
      exitRevenueMultiple: 999,
      bands: BANDS,
    });
    expect(w).toBeNull();
  });

  it("returns null when the band has incomplete bounds", () => {
    const w = computeExitMultipleWarning({
      industryVertical: "halfband",
      exitRevenueMultiple: 999,
      bands: [
        { dimensionKey: "halfband", label: "Half", valueLow: null, valueMid: 5, valueHigh: 10 },
      ],
    });
    expect(w).toBeNull();
  });

  it("respects an existing 'Keep my value' acknowledgment that still covers the value", () => {
    const w = computeExitMultipleWarning({
      industryVertical: "saas",
      exitRevenueMultiple: 20,
      bands: BANDS,
      ack: { rangeLowAtAck: 18, rangeHighAtAck: 22 },
    });
    expect(w).toBeNull();
  });

  it("re-flags when the value drifts outside the previously-acked window", () => {
    const w = computeExitMultipleWarning({
      industryVertical: "saas",
      exitRevenueMultiple: 30,
      bands: BANDS,
      ack: { rangeLowAtAck: 18, rangeHighAtAck: 22 },
    });
    expect(w).not.toBeNull();
    expect(w!.currentValue).toBe(30);
  });

  it("omits the midpoint hint when the band has no mid value", () => {
    const w = computeExitMultipleWarning({
      industryVertical: "nomid",
      exitRevenueMultiple: 50,
      bands: [
        { dimensionKey: "nomid", label: "No Mid", valueLow: 1, valueMid: null, valueHigh: 5 },
      ],
    });
    expect(w).not.toBeNull();
    expect(w!.display).not.toContain("mid");
  });

  it("treats the band boundary as inside (no warning)", () => {
    expect(
      computeExitMultipleWarning({
        industryVertical: "saas",
        exitRevenueMultiple: 5,
        bands: BANDS,
      }),
    ).toBeNull();
    expect(
      computeExitMultipleWarning({
        industryVertical: "saas",
        exitRevenueMultiple: 12,
        bands: BANDS,
      }),
    ).toBeNull();
  });
});
