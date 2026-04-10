import { describe, it, expect, beforeAll } from "vitest";
import { estimateSectionHeight, splitOversizedSections, groupSectionsIntoPages, HEADER_HEIGHT_PT, FOOTER_HEIGHT_PT, PAGE_PADDING_TOP, PAGE_PADDING_BOTTOM, SECTION_GAP } from "../../server/pdf/pagination";
import { PAGE_LANDSCAPE, PAGE_PORTRAIT } from "../../server/pdf/theme-mappers";
import { fmtCompact, monotoneCubicPath } from "../../server/pdf/chart-render";
import { DENSITY_PADDING } from "../../server/pdf/table-render";
import { DEFAULT_HINTS } from "../../server/pdf/design-pass";
import type { ReportSection } from "../../server/report/types";

const makeTableSection = (rowCount: number, title = "Test Table"): ReportSection => ({
  kind: "table",
  title,
  years: ["Year 1", "Year 2", "Year 3"],
  rows: Array.from({ length: rowCount }, (_, i) => ({
    category: `Row ${i + 1}`,
    type: i === 0 ? "header" as const : "data" as const,
    indent: i === 0 ? 0 : 1,
    values: [
      { text: "$100,000", raw: 100000, negative: false },
      { text: "$200,000", raw: 200000, negative: false },
      { text: "$300,000", raw: 300000, negative: false },
    ],
  })),
});

const makeKpiSection = (metricCount: number): ReportSection => ({
  kind: "kpi",
  title: "Key Metrics",
  metrics: Array.from({ length: metricCount }, (_, i) => ({
    label: `Metric ${i + 1}`,
    value: `$${(i + 1) * 10}K`,
  })),
});

const makeChartSection = (): ReportSection => ({
  kind: "chart",
  title: "Revenue Trend",
  years: ["Year 1", "Year 2", "Year 3"],
  series: [
    { label: "Revenue", values: [100000, 200000, 300000], color: "#0091AE" },
  ],
});

describe("PDF pagination constants", () => {
  it("page dimensions are stable", () => {
    expect(PAGE_LANDSCAPE[0]).toBeCloseTo(1152.00, 0);
    expect(PAGE_LANDSCAPE[1]).toBeCloseTo(647.93, 0);
    expect(PAGE_PORTRAIT[0]).toBeCloseTo(611.94, 0);
    expect(PAGE_PORTRAIT[1]).toBeCloseTo(791.87, 0);
  });

  it("pagination constants are stable", () => {
    expect(HEADER_HEIGHT_PT).toBe(50);
    expect(FOOTER_HEIGHT_PT).toBe(30);
    expect(PAGE_PADDING_TOP).toBe(10);
    expect(PAGE_PADDING_BOTTOM).toBe(30);
    expect(SECTION_GAP).toBe(16);
  });

  it("density padding values are stable", () => {
    expect(DENSITY_PADDING).toEqual({
      cramped: "3 6",
      comfortable: "6 10",
      spacious: "8 12",
    });
  });
});

describe("estimateSectionHeight — landscape vs portrait", () => {
  it("table height uses correct row height for comfortable density", () => {
    const section = makeTableSection(10);
    const landscapeH = estimateSectionHeight(section, true, DEFAULT_HINTS);
    const portraitH = estimateSectionHeight(section, false, DEFAULT_HINTS);
    expect(landscapeH).toBe(portraitH);
    expect(landscapeH).toBe(30 + 28 + 10 * 22);
  });

  it("table height scales with cramped density", () => {
    const section = makeTableSection(10);
    const crampedHints = { ...DEFAULT_HINTS, tableDensity: "cramped" as const };
    const h = estimateSectionHeight(section, true, crampedHints);
    expect(h).toBe(30 + 28 + 10 * 18);
  });

  it("table height scales with spacious density", () => {
    const section = makeTableSection(10);
    const spaciousHints = { ...DEFAULT_HINTS, tableDensity: "spacious" as const };
    const h = estimateSectionHeight(section, true, spaciousHints);
    expect(h).toBe(30 + 28 + 10 * 26);
  });

  it("kpi height depends on orientation (columns differ)", () => {
    const section = makeKpiSection(6);
    const landscapeH = estimateSectionHeight(section, true, DEFAULT_HINTS);
    const portraitH = estimateSectionHeight(section, false, DEFAULT_HINTS);
    expect(landscapeH).toBe(30 + 2 * 90);
    expect(portraitH).toBe(30 + 3 * 90);
  });

  it("chart height depends on orientation", () => {
    const section = makeChartSection();
    const landscapeH = estimateSectionHeight(section, true, DEFAULT_HINTS);
    const portraitH = estimateSectionHeight(section, false, DEFAULT_HINTS);
    expect(landscapeH).toBe(30 + 340);
    expect(portraitH).toBe(30 + 400);
  });
});

describe("splitOversizedSections — oversized table pagination", () => {
  it("does not split tables that fit on a page", () => {
    const section = makeTableSection(5);
    const result = splitOversizedSections([section], true, DEFAULT_HINTS);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Test Table");
  });

  it("splits an oversized table into chunks with cont'd suffix", () => {
    const section = makeTableSection(100);
    const result = splitOversizedSections([section], true, DEFAULT_HINTS);
    expect(result.length).toBeGreaterThan(1);
    expect(result[0].title).toBe("Test Table");
    expect(result[1].title).toBe("Test Table (cont'd)");
    const totalRows = result.reduce((sum, s) => {
      if (s.kind === "table") return sum + s.rows.length;
      return sum;
    }, 0);
    expect(totalRows).toBe(100);
  });

  it("splits differently for portrait vs landscape (different page heights)", () => {
    const section = makeTableSection(100);
    const landscapeResult = splitOversizedSections([section], true, DEFAULT_HINTS);
    const portraitResult = splitOversizedSections([section], false, DEFAULT_HINTS);
    expect(portraitResult.length).not.toBe(landscapeResult.length);
  });

  it("does not split non-table sections", () => {
    const kpi = makeKpiSection(20);
    const chart = makeChartSection();
    const result = splitOversizedSections([kpi, chart], true, DEFAULT_HINTS);
    expect(result).toHaveLength(2);
  });
});

describe("groupSectionsIntoPages — dense pagination", () => {
  it("groups small sections onto a single page", () => {
    const sections: ReportSection[] = [
      makeTableSection(3),
      makeTableSection(3),
    ];
    const pages = groupSectionsIntoPages(sections, true, DEFAULT_HINTS);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(2);
  });

  it("breaks into multiple pages when sections exceed usable height", () => {
    const sections: ReportSection[] = [
      makeTableSection(20),
      makeTableSection(20),
      makeTableSection(20),
    ];
    const pages = groupSectionsIntoPages(sections, true, DEFAULT_HINTS);
    expect(pages.length).toBeGreaterThan(1);
    const totalSections = pages.reduce((sum, p) => sum + p.length, 0);
    expect(totalSections).toBe(3);
  });

  it("handles empty sections array", () => {
    const pages = groupSectionsIntoPages([], true, DEFAULT_HINTS);
    expect(pages).toHaveLength(0);
  });

  it("landscape vs portrait produces different page groupings", () => {
    const sections: ReportSection[] = [
      makeTableSection(15),
      makeTableSection(15),
      makeKpiSection(4),
      makeChartSection(),
    ];
    const landscapePages = groupSectionsIntoPages(sections, true, DEFAULT_HINTS);
    const portraitPages = groupSectionsIntoPages(sections, false, DEFAULT_HINTS);
    expect(landscapePages.length).not.toBe(portraitPages.length);
  });
});

describe("chart utilities", () => {
  it("fmtCompact formats correctly", () => {
    expect(fmtCompact(0)).toBe("$0");
    expect(fmtCompact(500)).toBe("$500");
    expect(fmtCompact(1500)).toBe("$2K");
    expect(fmtCompact(1_500_000)).toBe("$1.5M");
    expect(fmtCompact(2_500_000_000)).toBe("$2.5B");
    expect(fmtCompact(-1_500_000)).toBe("-$1.5M");
  });

  it("monotoneCubicPath handles edge cases", () => {
    expect(monotoneCubicPath([])).toBe("");
    expect(monotoneCubicPath([{ x: 0, y: 0 }])).toBe("");
    expect(monotoneCubicPath([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBe("M0,0L10,10");
  });

  it("monotoneCubicPath produces a valid SVG path for 3+ points", () => {
    const pts = [{ x: 0, y: 100 }, { x: 50, y: 50 }, { x: 100, y: 80 }];
    const path = monotoneCubicPath(pts);
    expect(path).toMatch(/^M/);
    expect(path).toContain("C");
    expect(path).toContain("100.0");
  });
});

describe("renderPremiumPdf export integrity", () => {
  it("renderPremiumPdf is exported from render.tsx", async () => {
    const mod = await import("../../server/pdf/render");
    expect(typeof mod.renderPremiumPdf).toBe("function");
  });
});

const testTokens = {
  primary: "#112548",
  secondary: "#0091AE",
  accent: "#FDB817",
  foreground: "#1a1a1a",
  border: "#cccccc",
  muted: "#f5f5f5",
  surface: "#fafafa",
  background: "#ffffff",
  white: "#ffffff",
  negativeRed: "#dc2626",
  chart: ["#0091AE", "#FDB817", "#112548"],
  line: ["#cccccc"],
};

const testCover = {
  companyName: "Test Company",
  entityName: "Test Hotel",
  reportTitle: "Financial Report",
  date: "2026-01-01",
};

function makeTestTableRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    category: `Row ${i + 1}`,
    type: (i === 0 ? "header" : "data") as "header" | "data",
    indent: i === 0 ? 0 : 1,
    values: [
      { text: "$100,000", raw: 100000, negative: false },
      { text: "$200,000", raw: 200000, negative: false },
    ],
    rawValues: [100000, 200000],
    format: undefined,
  }));
}

describe("renderPremiumPdf — render-level structural snapshots", () => {
  let renderPremiumPdf: (input: unknown) => Promise<Buffer>;

  beforeAll(async () => {
    const mod = await import("../../server/pdf/render");
    renderPremiumPdf = mod.renderPremiumPdf;
  });

  it("renders dense + landscape and produces a valid PDF buffer", async () => {
    const report = {
      cover: testCover,
      tokens: testTokens,
      orientation: "landscape" as const,
      densePagination: true,
      sections: [
        { kind: "kpi" as const, title: "Key Metrics", metrics: [
          { label: "Revenue", value: "$1M", description: "Total" },
          { label: "NOI", value: "$400K", description: "Net" },
        ]},
        { kind: "table" as const, title: "Income Statement", years: ["Year 1", "Year 2"], rows: makeTestTableRows(5) },
      ],
    };
    const buffer = await renderPremiumPdf(report);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders dense + portrait and produces a valid PDF buffer", async () => {
    const report = {
      cover: testCover,
      tokens: testTokens,
      orientation: "portrait" as const,
      densePagination: true,
      sections: [
        { kind: "table" as const, title: "Cash Flow", years: ["Year 1", "Year 2"], rows: makeTestTableRows(8) },
      ],
    };
    const buffer = await renderPremiumPdf(report);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders non-dense + landscape and produces a valid PDF buffer", async () => {
    const report = {
      cover: testCover,
      tokens: testTokens,
      orientation: "landscape" as const,
      densePagination: false,
      sections: [
        { kind: "kpi" as const, title: "KPIs", metrics: [
          { label: "RevPAR", value: "$150", description: "" },
        ]},
        { kind: "table" as const, title: "Balance Sheet", years: ["Year 1"], rows: makeTestTableRows(3) },
        { kind: "chart" as const, title: "Revenue Trend", years: ["Year 1", "Year 2", "Year 3"], series: [
          { label: "Revenue", values: [100000, 200000, 300000], color: "#0091AE" },
        ]},
      ],
    };
    const buffer = await renderPremiumPdf(report);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders non-dense + portrait and produces a valid PDF buffer", async () => {
    const report = {
      cover: testCover,
      tokens: testTokens,
      orientation: "portrait" as const,
      densePagination: false,
      sections: [
        { kind: "table" as const, title: "Statement", years: ["Year 1", "Year 2"], rows: makeTestTableRows(4) },
      ],
    };
    const buffer = await renderPremiumPdf(report);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders empty sections (no data) and produces valid fallback PDF", async () => {
    const report = {
      cover: testCover,
      tokens: testTokens,
      orientation: "landscape" as const,
      densePagination: false,
      sections: [],
    };
    const buffer = await renderPremiumPdf(report);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("oversized table splits across pages in dense mode", async () => {
    const report = {
      cover: testCover,
      tokens: testTokens,
      orientation: "landscape" as const,
      densePagination: true,
      sections: [
        { kind: "table" as const, title: "Large Table", years: ["Y1", "Y2"], rows: makeTestTableRows(80) },
      ],
    };
    const buffer = await renderPremiumPdf(report);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(5000);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("dense landscape produces smaller PDF than non-dense for same content", { timeout: 15000 }, async () => {
    const sections = [
      { kind: "kpi" as const, title: "Metrics", metrics: [
        { label: "Revenue", value: "$1M", description: "" },
        { label: "NOI", value: "$400K", description: "" },
      ]},
      { kind: "table" as const, title: "Income", years: ["Y1", "Y2"], rows: makeTestTableRows(10) },
    ];

    const denseBuffer = await renderPremiumPdf({
      cover: testCover, tokens: testTokens, orientation: "landscape" as const,
      densePagination: true, sections,
    });
    const nonDenseBuffer = await renderPremiumPdf({
      cover: testCover, tokens: testTokens, orientation: "landscape" as const,
      densePagination: false, sections,
    });

    expect(denseBuffer.length).toBeLessThan(nonDenseBuffer.length);
  });
});
