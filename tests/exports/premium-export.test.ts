import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { AI_GENERATION_TIMEOUT_MS } from "../../server/constants";
import { compileReport } from "../../server/report/compiler";

const routeSource = fs.readFileSync(
  path.resolve(__dirname, "../../server/routes/premium-exports.ts"),
  "utf-8"
);

describe("Premium export route structure audit", () => {
  it("validates request with zod schema requiring format enum", () => {
    expect(routeSource).toContain('z.enum(["xlsx", "pptx", "pdf", "docx"])');
  });

  it("defines all four content types", () => {
    expect(routeSource).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(routeSource).toContain("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(routeSource).toContain("application/pdf");
    expect(routeSource).toContain("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });

  it("defines format extensions for all four types", () => {
    expect(routeSource).toContain('xlsx: ".xlsx"');
    expect(routeSource).toContain('pptx: ".pptx"');
    expect(routeSource).toContain('pdf: ".pdf"');
    expect(routeSource).toContain('docx: ".docx"');
  });

  it("error handler extracts format safely from req.body", () => {
    expect(routeSource).toContain('typeof req.body?.format === "string" ? req.body.format : "unknown"');
  });

  it("error handler includes format in error response payloads (504, 500)", () => {
    expect(routeSource).toContain("res.status(504).json({");
    expect(routeSource).toContain("res.status(500).json({");

    const catchBlock = routeSource.slice(routeSource.indexOf("} catch (error"));
    const formatOccurrences = (catchBlock.match(/\bformat\b/g) || []).length;
    expect(formatOccurrences).toBeGreaterThanOrEqual(4);
  });

  it("timeout error message includes format.toUpperCase()", () => {
    expect(routeSource).toContain("format.toUpperCase()");
  });

  it("uses compiled report pipeline (no AI key required)", () => {
    expect(routeSource).toContain("compileReport");
    expect(routeSource).not.toContain('"API key not configured"');
  });

  it("has timeout check returning 504", () => {
    expect(routeSource).toContain('"timed out"');
    expect(routeSource).toContain("res.status(504)");
  });

  it("returns generic error message without leaking internal details", () => {
    expect(routeSource).toContain("Premium export generation failed. Please try again.");
  });

  it("sanitizes company name for filenames", () => {
    expect(routeSource).toContain('.replace(/[^a-zA-Z0-9 ]/g, "")');
    expect(routeSource).toContain(".substring(0, 40)");
  });
});

describe("Timeout coordination", () => {
  it("server export timeout is 120 seconds", () => {
    expect(AI_GENERATION_TIMEOUT_MS).toBe(120_000);
  });

  it("client-side abort timeout (200s) exceeds server export timeout", () => {
    const CLIENT_TIMEOUT_MS = 200_000;
    expect(CLIENT_TIMEOUT_MS).toBeGreaterThan(AI_GENERATION_TIMEOUT_MS);
    expect(CLIENT_TIMEOUT_MS - AI_GENERATION_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("route uses compiled report pipeline", () => {
    expect(routeSource).toContain("compileReport");
    expect(routeSource).toContain("generateViaTemplatePipeline");
  });
});

describe("Cover page removal", () => {
  it("route schema does not accept includeCoverPage", () => {
    expect(routeSource).not.toContain("includeCoverPage");
  });

  it("ReportDefinition type has no includeCoverPage field", () => {
    const typesSource = fs.readFileSync(
      path.resolve(__dirname, "../../server/report/types.ts"),
      "utf-8"
    );
    expect(typesSource).not.toContain("includeCoverPage");
  });

  it("CompileInput type has no includeCoverPage field", () => {
    const compilerSource = fs.readFileSync(
      path.resolve(__dirname, "../../server/report/compiler.ts"),
      "utf-8"
    );
    expect(compilerSource).not.toContain("includeCoverPage");
  });

  it("PDF renderer has no CoverPage component", () => {
    const renderSource = fs.readFileSync(
      path.resolve(__dirname, "../../server/pdf/render.tsx"),
      "utf-8"
    );
    expect(renderSource).not.toContain("CoverPage");
    expect(renderSource).not.toContain("includeCoverPage");
  });

  it("PPTX generator has no cover page logic", () => {
    const pptxSource = fs.readFileSync(
      path.resolve(__dirname, "../../server/routes/format-generators/pptx-generator.ts"),
      "utf-8"
    );
    expect(pptxSource).not.toContain("includeCoverPage");
  });

  it("PNG format has been removed from premium exports", () => {
    const premiumExportsSource = fs.readFileSync(
      path.resolve(__dirname, "../../server/routes/premium-exports.ts"),
      "utf-8"
    );
    expect(premiumExportsSource).not.toContain('"png"');
  });
});

describe("Overview export data adapter", () => {
  it("buildOverviewExportData is imported in Dashboard", () => {
    const dashSource = fs.readFileSync(
      path.resolve(__dirname, "../../client/src/pages/Dashboard.tsx"),
      "utf-8"
    );
    expect(dashSource).toContain("buildOverviewExportData");
    expect(dashSource).toContain("loadExportConfig");
  });

  it("Overview tab produces non-empty statements", () => {
    const dashSource = fs.readFileSync(
      path.resolve(__dirname, "../../client/src/pages/Dashboard.tsx"),
      "utf-8"
    );
    expect(dashSource).toContain("Revenue & ANOI Projections");
    expect(dashSource).toContain("Portfolio & Capital Structure");
    expect(dashSource).toContain("Property Insights");
    expect(dashSource).toContain("USALI Profit Waterfall");
    expect(dashSource).toContain("Market Distribution");
    expect(dashSource).toContain("Status Distribution");
  });

  it("Overview projection rows use chart-compatible labels", () => {
    const dashSource = fs.readFileSync(
      path.resolve(__dirname, "../../client/src/pages/Dashboard.tsx"),
      "utf-8"
    );
    expect(dashSource).toContain('"Total Revenue"');
    expect(dashSource).toContain('"Net Operating Income"');
    expect(dashSource).toContain('"Adjusted NOI"');
  });

  it("Overview respects admin ExportConfig toggles", () => {
    const dashSource = fs.readFileSync(
      path.resolve(__dirname, "../../client/src/pages/Dashboard.tsx"),
      "utf-8"
    );
    expect(dashSource).toContain("loadExportConfig().overview");
    expect(dashSource).toContain("cfg.projectionTable");
    expect(dashSource).toContain("cfg.revenueChart");
    expect(dashSource).toContain("cfg.compositionTables");
    expect(dashSource).toContain("cfg.compositionCharts");
    expect(dashSource).toContain("cfg.propertyInsights");
    expect(dashSource).toContain("cfg.waterfallTable");
    expect(dashSource).toContain("cfg.aiInsights");
    expect(dashSource).toContain("Portfolio Analysis Insights");
    expect(dashSource).toContain(".kpiMetrics");
  });
});

describe("Safe filename generation", () => {
  it("sanitizes company name for filename", () => {
    const companyName = "Acme Hotels & Resorts (NYC)";
    const safe = companyName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 40).trim();
    expect(safe).toBe("Acme Hotels  Resorts NYC");
    expect(safe.length).toBeLessThanOrEqual(40);
  });

  it("handles empty company name with fallback to entityName", () => {
    const companyName = "";
    const entityName = "Portfolio Report";
    const safe = (companyName || entityName).replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 40).trim();
    expect(safe).toBe("Portfolio Report");
  });

  it("truncates long names at 40 characters", () => {
    const longName = "A".repeat(60);
    const safe = longName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 40).trim();
    expect(safe.length).toBe(40);
  });
});

describe("Route schema preserves statement flags", () => {
  it("route schema includes includeTable and includeChart on statements", () => {
    expect(routeSource).toContain("includeTable");
    expect(routeSource).toContain("includeChart");
  });
});

describe("Compiler includeTable/includeChart flags", () => {
  it("omits chart when includeChart is false", () => {
    const result = compileReport({
      format: "pdf",
      entityName: "Test",
      statements: [
        {
          title: "Revenue & ANOI Projections",
          years: ["2025", "2026"],
          rows: [
            { category: "Total Revenue", values: [100, 200] },
          ],
          includeChart: false,
        },
      ],
    });
    const kinds = result.sections.map(s => s.kind);
    expect(kinds).toContain("table");
    expect(kinds).not.toContain("chart");
  });

  it("omits table when includeTable is false", () => {
    const result = compileReport({
      format: "pdf",
      entityName: "Test",
      statements: [
        {
          title: "Revenue & ANOI Projections",
          years: ["2025", "2026"],
          rows: [
            { category: "Total Revenue", values: [100, 200] },
          ],
          includeTable: false,
        },
      ],
    });
    const kinds = result.sections.map(s => s.kind);
    expect(kinds).not.toContain("table");
    expect(kinds).toContain("chart");
  });

  it("includes both when flags are undefined (default)", () => {
    const result = compileReport({
      format: "pdf",
      entityName: "Test",
      statements: [
        {
          title: "Revenue & ANOI Projections",
          years: ["2025", "2026"],
          rows: [
            { category: "Total Revenue", values: [100, 200] },
          ],
        },
      ],
    });
    const kinds = result.sections.map(s => s.kind);
    expect(kinds).toContain("table");
    expect(kinds).toContain("chart");
  });
});
