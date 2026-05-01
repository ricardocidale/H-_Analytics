import { describe, it, expect } from "vitest";
import { compileReport } from "../../server/report/compiler";
import { premiumExportSchema } from "../../server/routes/premium-exports";

describe("export seam contract — compileReport", () => {
  const minimalInput = {
    format: "pdf" as const,
    entityName: "Test Hotel",
    companyName: "Test Company",
    years: ["Year 1", "Year 2"],
    rows: [
      { category: "Total Revenue", values: [100000, 200000], isBold: true },
      { category: "Rooms Revenue", values: [80000, 160000], indent: 1 },
    ],
    statements: [
      {
        title: "Income Statement",
        years: ["Year 1", "Year 2"],
        rows: [
          { category: "Total Revenue", values: [100000, 200000], isBold: true },
          { category: "NOI", values: [40000, 80000], isBold: true },
        ],
        includeTable: true,
        includeChart: true,
      },
    ],
    metrics: [
      { label: "Total Revenue Y1", value: "$100,000" },
      { label: "NOI Y1", value: "$40,000" },
    ],
  };

  it("produces a ReportDefinition with required fields", () => {
    const report = compileReport(minimalInput);
    expect(report).toHaveProperty("sections");
    expect(report).toHaveProperty("tokens");
    expect(report).toHaveProperty("cover");
    expect(report).toHaveProperty("orientation");
    expect(Array.isArray(report.sections)).toBe(true);
  });

  it("populates cover metadata from entityName and companyName", () => {
    const report = compileReport(minimalInput);
    expect(report.cover.companyName).toBe("Test Company");
    expect(report.cover.entityName).toBe("Test Hotel");
    expect(report.cover.date).toBeTruthy();
  });

  it("includes table sections from statement rows", () => {
    const report = compileReport(minimalInput);
    const tableSections = report.sections.filter((s: any) => s.kind === "table");
    expect(tableSections.length).toBeGreaterThanOrEqual(1);
  });

  it("splits investment statements into sub-tables", () => {
    const investmentInput = {
      ...minimalInput,
      statements: [
        {
          title: "Investment Analysis",
          years: ["Year 1", "Year 2"],
          rows: [
            { category: "Free Cash Flow to Investors", values: [0, 0], isHeader: true },
            { category: "Net Cash Flow", values: [50000, 80000], indent: 1 },
            { category: "Per-Property Returns", values: [0, 0], isHeader: true },
            { category: "Property IRR", values: [0.12, 0.15], indent: 1 },
          ],
          includeTable: true,
        },
      ],
    };
    const report = compileReport(investmentInput);
    const tableSections = report.sections.filter((s: any) => s.kind === "table");
    expect(tableSections.length).toBeGreaterThanOrEqual(2);
  });

  it("respects landscape orientation by default", () => {
    const report = compileReport(minimalInput);
    expect(report.orientation).toBe("landscape");
  });

  it("respects portrait orientation when specified", () => {
    const report = compileReport({ ...minimalInput, orientation: "portrait" });
    expect(report.orientation).toBe("portrait");
  });

  it("handles empty statements array gracefully", () => {
    const input = { ...minimalInput, statements: [] };
    const report = compileReport(input);
    expect(report).toHaveProperty("sections");
    expect(Array.isArray(report.sections)).toBe(true);
  });

  it("handles missing optional fields gracefully", () => {
    const input = {
      format: "xlsx" as const,
      entityName: "Bare Minimum",
    };
    const report = compileReport(input);
    expect(report).toHaveProperty("sections");
    expect(report.cover.entityName).toBe("Bare Minimum");
  });

  it("section titles carry through from statement input", () => {
    const report = compileReport(minimalInput);
    const titles = report.sections
      .filter((s: any) => s.kind === "table")
      .map((s: any) => s.title);
    expect(titles).toContain("Income Statement");
  });
});

describe("export seam contract — premiumExportSchema Zod validation", () => {
  const validBase = {
    format: "pdf",
    entityName: "Test Hotel",
  };

  it("accepts all four supported formats", () => {
    for (const format of ["xlsx", "pptx", "pdf", "docx"]) {
      const result = premiumExportSchema.safeParse({ ...validBase, format });
      expect(result.success, `format "${format}" should be accepted`).toBe(true);
    }
  });

  it("rejects unsupported format", () => {
    const result = premiumExportSchema.safeParse({ ...validBase, format: "csv" });
    expect(result.success).toBe(false);
  });

  it("rejects missing entityName", () => {
    const result = premiumExportSchema.safeParse({ format: "pdf" });
    expect(result.success).toBe(false);
  });

  it("defaults orientation to landscape", () => {
    const result = premiumExportSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orientation).toBe("landscape");
    }
  });

  it("defaults version to short", () => {
    const result = premiumExportSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe("short");
    }
  });

  it("accepts valid computeRef with propertyIds and projectionYears", () => {
    const result = premiumExportSchema.safeParse({
      ...validBase,
      computeRef: { propertyIds: [1, 2, 3], projectionYears: 10 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects computeRef with non-positive propertyIds", () => {
    const result = premiumExportSchema.safeParse({
      ...validBase,
      computeRef: { propertyIds: [0, -1] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects computeRef with projectionYears > 30", () => {
    const result = premiumExportSchema.safeParse({
      ...validBase,
      computeRef: { projectionYears: 31 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid statements array", () => {
    const result = premiumExportSchema.safeParse({
      ...validBase,
      statements: [{
        title: "Income Statement",
        years: ["Year 1"],
        rows: [{ category: "Revenue", values: [100] }],
      }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects rows with invalid format enum", () => {
    const result = premiumExportSchema.safeParse({
      ...validBase,
      rows: [{ category: "Revenue", values: [100], format: "invalid" }],
    });
    expect(result.success).toBe(false);
  });
});
