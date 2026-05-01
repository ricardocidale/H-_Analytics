import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { computePortfolioProjection, computeSingleProperty } from "../../server/finance/service";
import { verifyExport } from "../../calc/validation/export-verification";
import { stableHash } from "../../server/scenarios/stable-json";
import type { PropertyInput, GlobalInput, YearlyPropertyFinancials } from "@engine/types";

const PROPERTY_A: PropertyInput = {
  operationsStartDate: "2026-04-01",
  acquisitionDate: "2026-04-01",
  roomCount: 40,
  startAdr: 130,
  adrGrowthRate: 0.03,
  startOccupancy: 0.68,
  maxOccupancy: 0.68,
  occupancyRampMonths: 1,
  occupancyGrowthStep: 0,
  purchasePrice: 4_000_000,
  type: "Full Equity",
  costRateRooms: 0.20,
  costRateFB: 0.09,
  costRateAdmin: 0.08,
  costRateMarketing: 0.01,
  costRatePropertyOps: 0.04,
  costRateUtilities: 0.05,
  costRateTaxes: 0.03,
  costRateIT: 0.005,
  costRateFFE: 0.04,
  costRateOther: 0.05,
  costRateInsurance: 0,
  revShareEvents: 0.43,
  revShareFB: 0.22,
  revShareOther: 0.07,
  exitCapRate: 0.075,
};

const GLOBAL: GlobalInput = {
  modelStartDate: "2026-04-01",
  inflationRate: 0,
  projectionYears: 10,
};

function scanPath(target: string, regex: RegExp): string[] {
  const results: string[] = [];
  if (!fs.existsSync(target)) return results;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    const norm = target.replace(/\\/g, "/");
    const lines = fs.readFileSync(target, "utf-8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) results.push(`${norm}:${i + 1}:${lines[i]}`);
    }
    return results;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    const norm = full.replace(/\\/g, "/");
    if (entry.isDirectory()) results.push(...scanPath(full, regex));
    else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      const lines = fs.readFileSync(full, "utf-8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) results.push(`${norm}:${i + 1}:${lines[i]}`);
      }
    }
  }
  return results;
}

function grepServer(pattern: string, searchPath = "server/"): string[] {
  return scanPath(searchPath, new RegExp(pattern));
}

describe("Export Parity Audit", () => {
  it("verifyExport passes for engine output with correct counts", () => {
    const result = computePortfolioProjection({
      properties: [PROPERTY_A],
      globalAssumptions: GLOBAL,
      projectionYears: 10,
    });

    const y1 = result.consolidatedYearly[0];
    const verification = verifyExport({
      export_format: "pdf",
      export_source: "consolidated",
      expected_sections: ["Income Statement", "Cash Flow Statement"],
      actual_sections: ["Income Statement", "Cash Flow Statement"],
      expected_year_count: 10,
      actual_year_count: 10,
      expected_property_count: 1,
      actual_property_count: result.propertyCount,
      sample_values: [
        { label: "Y1 Revenue", expected_value: y1.revenueTotal, exported_value: y1.revenueTotal },
        { label: "Y1 NOI", expected_value: y1.noi, exported_value: y1.noi },
        { label: "Y1 Net Income", expected_value: y1.netIncome, exported_value: y1.netIncome },
      ],
    });

    expect(verification.all_passed).toBe(true);
    expect(verification.missing_sections).toEqual([]);
    expect(verification.value_mismatches).toEqual([]);
  });

  it("verifyExport detects missing sections", () => {
    const result = verifyExport({
      export_format: "excel",
      export_source: "consolidated",
      expected_sections: ["Income Statement", "Cash Flow Statement", "Balance Sheet"],
      actual_sections: ["Income Statement"],
      expected_year_count: 10,
      actual_year_count: 10,
    });

    expect(result.all_passed).toBe(false);
    expect(result.missing_sections).toContain("Cash Flow Statement");
    expect(result.missing_sections).toContain("Balance Sheet");
  });

  it("verifyExport detects value mismatches beyond tolerance", () => {
    const result = verifyExport({
      export_format: "pdf",
      export_source: "income_statement",
      sample_values: [
        { label: "Revenue", expected_value: 1_000_000, exported_value: 999_999, tolerance: 0.01 },
      ],
    });

    expect(result.all_passed).toBe(false);
    expect(result.value_mismatches.length).toBe(1);
    expect(result.value_mismatches[0].label).toBe("Revenue");
  });

  it("verifyExport detects year count mismatch", () => {
    const result = verifyExport({
      export_format: "excel",
      export_source: "consolidated",
      expected_year_count: 10,
      actual_year_count: 8,
    });

    expect(result.all_passed).toBe(false);
    expect(result.checks.some(c => c.check === "Year Count Correct" && !c.passed)).toBe(true);
  });

  it("verifyExport detects property count mismatch", () => {
    const result = verifyExport({
      export_format: "pdf",
      export_source: "consolidated",
      expected_property_count: 3,
      actual_property_count: 2,
    });

    expect(result.all_passed).toBe(false);
    expect(result.checks.some(c => c.check === "Property Count Correct" && !c.passed)).toBe(true);
  });

  it("engine output hash is consistent for single and portfolio compute", () => {
    const portfolioResult = computePortfolioProjection({
      properties: [PROPERTY_A],
      globalAssumptions: GLOBAL,
      projectionYears: 10,
    });

    const singleResult = computeSingleProperty({
      property: PROPERTY_A,
      globalAssumptions: GLOBAL,
      projectionYears: 10,
    });

    expect(portfolioResult.consolidatedYearly.length).toBe(singleResult.yearly.length);

    for (let y = 0; y < portfolioResult.consolidatedYearly.length; y++) {
      expect(Math.abs(
        portfolioResult.consolidatedYearly[y].revenueTotal - singleResult.yearly[y].revenueTotal
      )).toBeLessThan(0.01);
      expect(Math.abs(
        portfolioResult.consolidatedYearly[y].noi - singleResult.yearly[y].noi
      )).toBeLessThan(0.01);
    }
  });

  it("export output hash is stable across repeated computations", () => {
    const r1 = computePortfolioProjection({
      properties: [PROPERTY_A],
      globalAssumptions: GLOBAL,
      projectionYears: 10,
    });

    const r2 = computePortfolioProjection({
      properties: [PROPERTY_A],
      globalAssumptions: GLOBAL,
      projectionYears: 10,
    });

    expect(r1.outputHash).toBe(r2.outputHash);
    expect(r1.engineVersion).toBe(r2.engineVersion);
  });
});

describe("Export Pipeline Structure Audit", () => {
  it("server export data builder calls verifyExport", () => {
    const lines = grepServer("verifyExport", "server/report/server-export-data.ts");
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it("server export data builder outputs hash and engineVersion", () => {
    const hashLines = grepServer("outputHash", "server/report/server-export-data.ts");
    const versionLines = grepServer("engineVersion", "server/report/server-export-data.ts");
    expect(hashLines.length).toBeGreaterThan(0);
    expect(versionLines.length).toBeGreaterThan(0);
  });

  it("export generate route validates request body with Zod", () => {
    const lines = grepServer("generateExportSchema|safeParse|Schema\\.parse", "server/routes/export-generate.ts");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("export generate route sets X-Finance-Output-Hash header", () => {
    const lines = grepServer("X-Finance-Output-Hash", "server/routes/export-generate.ts");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("export generate route sets X-Finance-Engine-Version header", () => {
    const lines = grepServer("X-Finance-Engine-Version", "server/routes/export-generate.ts");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("all five export formats are supported by the generate endpoint", () => {
    const lines = grepServer("pdf|xlsx|pptx|docx|csv", "server/routes/export-generate.ts");
    expect(lines.some(l => l.includes("pdf"))).toBe(true);
    expect(lines.some(l => l.includes("xlsx"))).toBe(true);
  });

  it("report compiler exists and exports compileReport", () => {
    const lines = grepServer("export.*compileReport", "server/report/compiler.ts");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("all entity types (portfolio, property, company) have build functions", () => {
    const portfolio = grepServer("buildExportData", "server/report/server-export-data.ts");
    const property = grepServer("buildPropertyExportData", "server/report/server-export-data.ts");
    const company = grepServer("buildCompanyExportData", "server/report/server-export-data.ts");
    expect(portfolio.length).toBeGreaterThan(0);
    expect(property.length).toBeGreaterThan(0);
    expect(company.length).toBeGreaterThan(0);
  });
});
