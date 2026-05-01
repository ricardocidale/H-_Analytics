import { describe, it, expect } from "vitest";
import {
  BRAND,
  normalizeCaps,
  classifyRow,
  formatShort,
  formatFull,
  formatPct,
  indentLabel,
  pptxFontSize,
  pptxColumnWidths,
  type ExportRowMeta,
} from "../../client/src/lib/exports/exportStyles";

describe("normalizeCaps", () => {
  it("converts ALL-CAPS to Title Case", () => {
    expect(normalizeCaps("OPERATING EXPENSES")).toBe("Operating Expenses");
  });

  it("preserves known abbreviations", () => {
    expect(normalizeCaps("GROSS OPERATING PROFIT GOP")).toContain("GOP");
    expect(normalizeCaps("NET OPERATING INCOME NOI")).toContain("NOI");
    expect(normalizeCaps("GAAP NET INCOME")).toContain("GAAP");
  });

  it("returns non-uppercase text unchanged", () => {
    expect(normalizeCaps("Room Revenue")).toBe("Room Revenue");
    expect(normalizeCaps("  Room Revenue")).toBe("  Room Revenue");
  });

  it("returns short strings unchanged", () => {
    expect(normalizeCaps("AB")).toBe("AB");
    expect(normalizeCaps("")).toBe("");
  });

  it("handles FF&E abbreviation", () => {
    const result = normalizeCaps("FF&E RESERVE");
    expect(result).toContain("FF&E");
  });
});

describe("classifyRow", () => {
  it("identifies section headers (ALL-CAPS labels)", () => {
    const row: ExportRowMeta = { category: "REVENUE", values: [0] };
    const { isSectionHeader } = classifyRow(row);
    expect(isSectionHeader).toBe(true);
  });

  it("does not classify short ALL-CAPS as section header", () => {
    const row: ExportRowMeta = { category: "FB", values: [0] };
    const { isSectionHeader } = classifyRow(row);
    expect(isSectionHeader).toBe(false);
  });

  it("identifies subtotal rows by keyword", () => {
    const totalRow: ExportRowMeta = { category: "Total Revenue", values: [100] };
    expect(classifyRow(totalRow).isSubtotal).toBe(true);

    const noiRow: ExportRowMeta = { category: "Net Operating Income", values: [100] };
    expect(classifyRow(noiRow).isSubtotal).toBe(true);

    const gopRow: ExportRowMeta = { category: "Gross Operating Profit", values: [100] };
    expect(classifyRow(gopRow).isSubtotal).toBe(true);
  });

  it("identifies subtotal rows by isBold flag", () => {
    const row: ExportRowMeta = { category: "Custom Total", values: [100], isBold: true };
    expect(classifyRow(row).isSubtotal).toBe(true);
  });

  it("identifies formula rows", () => {
    const row: ExportRowMeta = { category: "Formula: NOI / Cap Rate", values: [100] };
    expect(classifyRow(row).isFormula).toBe(true);
  });

  it("identifies italic rows as formula", () => {
    const row: ExportRowMeta = { category: "explanation", values: [0], isItalic: true };
    expect(classifyRow(row).isFormula).toBe(true);
  });

  it("regular data row is none of the special types", () => {
    const row: ExportRowMeta = { category: "  Room Revenue", values: [500000] };
    const result = classifyRow(row);
    expect(result.isSectionHeader).toBe(false);
    expect(result.isSubtotal).toBe(false);
    expect(result.isFormula).toBe(false);
  });
});

describe("formatShort", () => {
  it("formats millions", () => {
    expect(formatShort(1200000)).toBe("$1.2M");
    expect(formatShort(5500000)).toBe("$5.5M");
  });

  it("formats thousands", () => {
    expect(formatShort(450000)).toBe("$450K");
    expect(formatShort(1000)).toBe("$1K");
  });

  it("formats small values", () => {
    expect(formatShort(800)).toBe("$800");
    expect(formatShort(1)).toBe("$1");
  });

  it("returns em-dash for zero", () => {
    expect(formatShort(0)).toBe("\u2014");
  });

  it("wraps negative in parentheses", () => {
    expect(formatShort(-1200000)).toBe("($1.2M)");
    expect(formatShort(-450000)).toBe("($450K)");
  });

  it("returns strings unchanged", () => {
    expect(formatShort("N/A")).toBe("N/A");
    expect(formatShort("—")).toBe("—");
  });
});

describe("formatFull", () => {
  it("formats with commas", () => {
    expect(formatFull(1234567)).toBe("$1,234,567");
  });

  it("returns em-dash for zero", () => {
    expect(formatFull(0)).toBe("\u2014");
  });

  it("wraps negative in parentheses with dollar sign", () => {
    expect(formatFull(-50000)).toBe("($50,000)");
  });

  it("returns strings unchanged", () => {
    expect(formatFull("test")).toBe("test");
  });
});

describe("formatPct", () => {
  it("formats with default 1 decimal", () => {
    expect(formatPct(12.5)).toBe("12.5%");
  });

  it("formats with custom decimals", () => {
    expect(formatPct(85.123, 2)).toBe("85.12%");
  });
});

describe("indentLabel", () => {
  it("adds spaces for indent level", () => {
    expect(indentLabel("Revenue", 1)).toBe("  Revenue");
    expect(indentLabel("Revenue", 2)).toBe("    Revenue");
  });

  it("returns original for no indent", () => {
    expect(indentLabel("Revenue")).toBe("Revenue");
    expect(indentLabel("Revenue", 0)).toBe("Revenue");
  });
});

describe("pptxFontSize", () => {
  it("returns 10 for small year count", () => {
    expect(pptxFontSize(3)).toBe(10);
    expect(pptxFontSize(5)).toBe(10);
  });

  it("returns smaller for more years", () => {
    expect(pptxFontSize(7)).toBe(9);
    expect(pptxFontSize(10)).toBe(8);
    expect(pptxFontSize(15)).toBe(7);
  });
});

describe("pptxColumnWidths", () => {
  it("returns valid widths", () => {
    const result = pptxColumnWidths(5);
    expect(result.labelW).toBeGreaterThan(0);
    expect(result.dataW).toBeGreaterThan(0);
    expect(result.tableW).toBeGreaterThan(0);
  });

  it("label + data columns sum to table width", () => {
    const yearCount = 5;
    const result = pptxColumnWidths(yearCount);
    const total = result.labelW + result.dataW * yearCount;
    expect(total).toBeCloseTo(result.tableW, 5);
  });
});

describe("BRAND constants", () => {
  it("has all required hex colors", () => {
    expect(BRAND.SECONDARY_HEX).toBe("3F3F46");
    expect(BRAND.PRIMARY_HEX).toBe("18181B");
    expect(BRAND.ACCENT_HEX).toBe("10B981");
    expect(BRAND.WHITE_HEX).toBe("FFFFFF");
  });

  it("has matching RGB tuples", () => {
    expect(BRAND.SECONDARY_RGB).toEqual([63, 63, 70]);
    expect(BRAND.PRIMARY_RGB).toEqual([24, 24, 27]);
  });

  it("has chart and line hex arrays", () => {
    expect(BRAND.CHART_HEX).toHaveLength(5);
    expect(BRAND.LINE_HEX).toHaveLength(5);
    expect(BRAND.NEGATIVE_HEX).toBe("F43F5E");
  });
});

describe("dead exports removed", () => {
  it("does not export footerText", async () => {
    const mod = await import("../../client/src/lib/exports/exportStyles");
    expect("footerText" in mod).toBe(false);
  });

});
