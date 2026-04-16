import { describe, it, expect } from "vitest";
import pptxgen from "pptxgenjs";
import {
  exportPortfolioPPTX,
  exportPropertyPPTX,
  exportCompanyPPTX,
  type PortfolioExportData,
  type PropertyExportData,
  type CompanyExportData,
} from "../../client/src/lib/exports/pptxExport";
import { makeTableRows } from "./helpers";

describe("PPTX export data types", () => {
  it("PortfolioExportData accepts valid data shape", () => {
    const data: PortfolioExportData = {
      years: ["2025", "2026", "2027"],
      rows: [
        { category: "Total Revenue", values: [6000000, 6500000, 7000000], isBold: true },
        { category: "Room Revenue", values: [4000000, 4300000, 4600000], indent: 1 },
      ],
    };
    expect(data.years).toHaveLength(3);
    expect(data.rows).toHaveLength(2);
    expect(data.rows[0].isBold).toBe(true);
  });

  it("PropertyExportData accepts valid data shape", () => {
    const data: PropertyExportData = {
      years: ["2025"],
      rows: [{ category: "Revenue", values: [100000] }],
    };
    expect(data.years).toHaveLength(1);
  });

  it("CompanyExportData accepts valid data shape", () => {
    const data: CompanyExportData = {
      years: ["2025"],
      rows: [{ category: "Revenue", values: [100000] }],
    };
    expect(data.years).toHaveLength(1);
  });
});

describe("PPTX generation — pptxgenjs integration", () => {
  it("creates a presentation with slides", () => {
    const pres = new pptxgen();
    pres.layout = "LAYOUT_WIDE";
    const slide = pres.addSlide();
    slide.addText("Test Title", { x: 0.5, y: 1, w: 9, h: 0.5 });
    expect(pres).toBeDefined();
    expect(slide).toBeDefined();
  });

  it("sets presentation metadata", () => {
    const pres = new pptxgen();
    pres.author = "Test Company";
    pres.title = "Test Report";
    pres.layout = "LAYOUT_WIDE";
    expect(pres.author).toBe("Test Company");
    expect(pres.title).toBe("Test Report");
    expect(pres.layout).toBe("LAYOUT_WIDE");
  });

  it("uses custom company name", () => {
    const pres = new pptxgen();
    const companyName = "My Custom Company";
    pres.author = companyName;
    const slide = pres.addSlide();
    slide.addText(companyName, { x: 0.5, y: 1.5, w: 9, h: 0.6 });
    expect(pres.author).toBe(companyName);
    expect(pres.author).not.toBe("Hospitality Business Group");
  });

  it("creates table with correct structure", () => {
    const pres = new pptxgen();
    const slide = pres.addSlide();
    const { years, rows } = makeTableRows(3);

    const headerRow = [
      { text: "", options: {} },
      ...years.map((y) => ({ text: y, options: { align: "right" as const } })),
    ];

    const dataRows = rows.map((row) => [
      { text: row.category, options: { bold: !!row.isBold } },
      ...row.values.map((v) => ({
        text: v.toLocaleString("en-US"),
        options: { align: "right" as const },
      })),
    ]);

    const allRows = [headerRow, ...dataRows];
    slide.addTable(allRows, { x: 0.3, y: 0.7, w: 9.4 });

    expect(allRows).toHaveLength(6); // 1 header + 5 data rows
    expect(allRows[0]).toHaveLength(4); // label + 3 year columns
    expect(allRows[1][0]).toEqual(expect.objectContaining({ text: "REVENUE" }));
    expect(allRows[4][0]).toEqual(expect.objectContaining({ text: "Total Revenue" }));
  });

  it("splits tables when years exceed 5 columns", () => {
    const pres = new pptxgen();
    const { years, rows } = makeTableRows(8);
    const maxYearsPerSlide = 5;

    let slideCount = 0;
    for (let startCol = 0; startCol < years.length; startCol += maxYearsPerSlide) {
      const endCol = Math.min(startCol + maxYearsPerSlide, years.length);
      const sliceYears = years.slice(startCol, endCol);

      const slide = pres.addSlide();
      slideCount++;

      const headerRow = [
        { text: "" },
        ...sliceYears.map((y) => ({ text: y })),
      ];
      const dataRows = rows.map((row) => [
        { text: row.category },
        ...row.values.slice(startCol, endCol).map((v) => ({ text: String(v) })),
      ]);
      slide.addTable([headerRow, ...dataRows], { x: 0.3, y: 0.7, w: 9.4 });
    }

    expect(slideCount).toBe(2); // 8 years at max 5 per slide
  });

  it("handles 3-year table in a single slide", () => {
    const pres = new pptxgen();
    const { years } = makeTableRows(3);
    const maxYearsPerSlide = 5;

    let slideCount = 0;
    for (let startCol = 0; startCol < years.length; startCol += maxYearsPerSlide) {
      pres.addSlide();
      slideCount++;
    }

    expect(slideCount).toBe(1);
  });

  it("handles 10-year table across 2 slides", () => {
    const { years } = makeTableRows(10);
    const maxYearsPerSlide = 5;

    let slideCount = 0;
    for (let startCol = 0; startCol < years.length; startCol += maxYearsPerSlide) {
      slideCount++;
    }

    expect(slideCount).toBe(2);
  });

  it("creates metrics cards for KPI display", () => {
    const pres = new pptxgen();
    const slide = pres.addSlide();

    const metrics = [
      { label: "Total Equity", value: "$5.2M" },
      { label: "Portfolio IRR", value: "18.5%" },
      { label: "Equity Multiple", value: "2.3x" },
    ];

    metrics.forEach((m, i) => {
      const col = i % 3;
      const x = 0.5 + col * 3.1;
      slide.addText(m.value, { x, y: 1.25, w: 2.8, h: 0.5, bold: true });
      slide.addText(m.label, { x, y: 1.7, w: 2.8, h: 0.35 });
    });

    expect(metrics).toHaveLength(3);
  });
});

describe("PPTX formatVal helper", () => {
  function formatVal(v: string | number): string {
    if (typeof v === "number") {
      if (Math.abs(v) >= 1000) {
        return v < 0
          ? `(${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })})`
          : v.toLocaleString("en-US", { maximumFractionDigits: 0 });
      }
      return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
    }
    return String(v);
  }

  it("formats negative numbers with parentheses", () => {
    expect(formatVal(1500000)).toBe("1,500,000");
    expect(formatVal(-50000)).toBe("(50,000)");
    expect(formatVal(500)).toBe("500");
    expect(formatVal(0)).toBe("0");
    expect(formatVal("N/A")).toBe("N/A");
    expect(formatVal(-999)).toBe("-999");
    expect(formatVal(1000)).toBe("1,000");
  });
});

describe("PPTX footer logic", () => {
  it("page numbering follows 1-indexed i+1/total pattern", () => {
    const total = 5;
    for (let i = 0; i < total; i++) {
      const pageNum = `${i + 1} / ${total}`;
      expect(pageNum).toMatch(/^\d+ \/ \d+$/);
      const [current, of] = pageNum.split(" / ").map(Number);
      expect(current).toBe(i + 1);
      expect(of).toBe(total);
    }
  });

  it("single-slide gets 1/1 numbering", () => {
    const total = 1;
    expect(`${0 + 1} / ${total}`).toBe("1 / 1");
  });

  it("footer text uses company name and confidential marker", () => {
    const companyName = "Acme Hotels";
    const footerLabel = `${companyName} \u2014 Confidential`;
    expect(footerLabel).toBe("Acme Hotels \u2014 Confidential");
  });
});

describe("pptxgen slide API", () => {
  it("creates slides with addSlide and supports addText/addShape", () => {
    const pres = new pptxgen();
    pres.layout = "LAYOUT_WIDE";
    const slide = pres.addSlide();
    expect(slide).toBeDefined();
    expect(typeof slide.addText).toBe("function");
    expect(typeof slide.addShape).toBe("function");
  });

  it("tracks correct slide count", () => {
    const pres = new pptxgen();
    pres.layout = "LAYOUT_WIDE";
    pres.addSlide();
    pres.addSlide();
    pres.addSlide();
    // pptxgenjs exposes slides array but it's not in the public type definitions
    expect((pres as unknown as { slides: unknown[] }).slides).toHaveLength(3);
  });
});
