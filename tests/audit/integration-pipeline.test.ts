import { describe, it, expect, beforeAll } from "vitest";
import { computePortfolioProjection, computeSingleProperty } from "../../server/finance/service";
import { invalidateComputeCache, resetCacheStats } from "../../server/finance/cache";
import { verifyExport } from "../../calc/validation/export-verification";
import { stableHash, stableStringify } from "../../server/scenarios/stable-json";
import type { PropertyInput, GlobalInput } from "@engine/types";
import * as fs from "fs";
import * as path from "path";

const PROP_A: PropertyInput = {
  operationsStartDate: "2026-04-01",
  acquisitionDate: "2026-04-01",
  roomCount: 50,
  startAdr: 150,
  adrGrowthRate: 0.03,
  startOccupancy: 0.72,
  maxOccupancy: 0.72,
  occupancyRampMonths: 1,
  occupancyGrowthStep: 0,
  purchasePrice: 5_000_000,
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
  exitCapRate: 0.07,
};

const PROP_B: PropertyInput = {
  ...PROP_A,
  roomCount: 30,
  startAdr: 200,
  purchasePrice: 3_000_000,
};

const GLOBAL: GlobalInput = {
  modelStartDate: "2026-04-01",
  inflationRate: 0,
  projectionYears: 10,
};

describe("Engine → Service → Export Integration Pipeline", () => {
  let singleResult: ReturnType<typeof computeSingleProperty>;
  let portfolioResult: ReturnType<typeof computePortfolioProjection>;

  beforeAll(() => {
    invalidateComputeCache();
    resetCacheStats();
    singleResult = computeSingleProperty({
      property: PROP_A,
      globalAssumptions: GLOBAL,
      projectionYears: 10,
    });
    portfolioResult = computePortfolioProjection({
      properties: [PROP_A, PROP_B],
      globalAssumptions: GLOBAL,
      projectionYears: 10,
    });
  });

  it("engine output carries through service to export-compatible yearly arrays", () => {
    const yearly = singleResult.yearly;
    expect(yearly.length).toBe(10);

    for (const y of yearly) {
      expect(typeof y.revenueTotal).toBe("number");
      expect(typeof y.revenueRooms).toBe("number");
      expect(typeof y.revenueFB).toBe("number");
      expect(typeof y.revenueEvents).toBe("number");
      expect(typeof y.gop).toBe("number");
      expect(typeof y.agop).toBe("number");
      expect(typeof y.noi).toBe("number");
      expect(typeof y.netIncome).toBe("number");
      expect(typeof y.operatingCashFlow).toBe("number");
      expect(typeof y.endingCash).toBe("number");
      expect(typeof y.depreciationExpense).toBe("number");
    }
  });

  it("portfolio consolidated yearly matches sum of per-property yearly", () => {
    const consolidated = portfolioResult.consolidatedYearly;
    const perProp = portfolioResult.perPropertyYearly;
    const propKeys = Object.keys(perProp);
    expect(propKeys.length).toBe(2);

    for (let y = 0; y < 10; y++) {
      const sumRevenue = propKeys.reduce((sum, k) => sum + perProp[k][y].revenueTotal, 0);
      expect(Math.abs(consolidated[y].revenueTotal - sumRevenue)).toBeLessThan(0.01);

      const sumNoi = propKeys.reduce((sum, k) => sum + perProp[k][y].noi, 0);
      expect(Math.abs(consolidated[y].noi - sumNoi)).toBeLessThan(0.01);

      const sumNetIncome = propKeys.reduce((sum, k) => sum + perProp[k][y].netIncome, 0);
      expect(Math.abs(consolidated[y].netIncome - sumNetIncome)).toBeLessThan(0.01);
    }
  });

  it("verifyExport passes for engine-computed portfolio data", () => {
    const y1 = portfolioResult.consolidatedYearly[0];
    const result = verifyExport({
      export_format: "pdf",
      export_source: "consolidated",
      expected_sections: ["Income Statement", "Cash Flow Statement"],
      actual_sections: ["Income Statement", "Cash Flow Statement"],
      expected_year_count: 10,
      actual_year_count: 10,
      expected_property_count: 2,
      actual_property_count: portfolioResult.propertyCount,
      sample_values: [
        { label: "Y1 Revenue", expected_value: y1.revenueTotal, exported_value: y1.revenueTotal },
        { label: "Y1 NOI", expected_value: y1.noi, exported_value: y1.noi },
        { label: "Y1 Net Income", expected_value: y1.netIncome, exported_value: y1.netIncome },
      ],
    });
    expect(result.all_passed).toBe(true);
  });

  it("verifyExport detects mismatched year count", () => {
    const result = verifyExport({
      export_format: "xlsx",
      export_source: "consolidated",
      expected_sections: ["Income Statement"],
      actual_sections: ["Income Statement"],
      expected_year_count: 10,
      actual_year_count: 5,
      expected_property_count: 1,
      actual_property_count: 1,
      sample_values: [],
    });
    expect(result.all_passed).toBe(false);
  });

  it("verifyExport detects sample value drift", () => {
    const result = verifyExport({
      export_format: "csv",
      export_source: "consolidated",
      expected_sections: ["Income Statement"],
      actual_sections: ["Income Statement"],
      expected_year_count: 10,
      actual_year_count: 10,
      expected_property_count: 1,
      actual_property_count: 1,
      sample_values: [
        { label: "Y1 Revenue", expected_value: 100000, exported_value: 99000 },
      ],
    });
    expect(result.all_passed).toBe(false);
  });

  it("outputHash is deterministic and 64-char hex", () => {
    expect(singleResult.outputHash.length).toBe(64);
    expect(/^[a-f0-9]{64}$/.test(singleResult.outputHash)).toBe(true);

    const r2 = computeSingleProperty({
      property: PROP_A,
      globalAssumptions: GLOBAL,
      projectionYears: 10,
    });
    expect(r2.outputHash).toBe(singleResult.outputHash);
  });

  it("engineVersion is a non-empty string", () => {
    expect(typeof singleResult.engineVersion).toBe("string");
    expect(singleResult.engineVersion.length).toBeGreaterThan(0);
    expect(portfolioResult.engineVersion).toBe(singleResult.engineVersion);
  });

  it("validationSummary opinion is UNQUALIFIED for both single and portfolio", () => {
    expect(singleResult.validationSummary.opinion).toBe("UNQUALIFIED");
    expect(portfolioResult.validationSummary.opinion).toBe("UNQUALIFIED");
  });
});

describe("Scenario Persistence Roundtrip Simulation", () => {
  it("serialize → deserialize → recompute produces identical outputHash", () => {
    const result1 = computePortfolioProjection({
      properties: [PROP_A, PROP_B],
      globalAssumptions: GLOBAL,
      projectionYears: 10,
    });

    const snapshot = {
      properties: [PROP_A, PROP_B],
      globalAssumptions: GLOBAL,
      projectionYears: 10,
      outputHash: result1.outputHash,
    };
    const serialized = stableStringify(snapshot);
    const deserialized = JSON.parse(serialized);

    const result2 = computePortfolioProjection({
      properties: deserialized.properties,
      globalAssumptions: deserialized.globalAssumptions,
      projectionYears: deserialized.projectionYears,
    });

    expect(result2.outputHash).toBe(result1.outputHash);
    expect(result2.consolidatedYearly[0].revenueTotal).toBe(result1.consolidatedYearly[0].revenueTotal);
    expect(result2.consolidatedYearly[9].endingCash).toBe(result1.consolidatedYearly[9].endingCash);
  });

  it("stableHash of inputs is order-independent", () => {
    const h1 = stableHash({ properties: [PROP_A, PROP_B], global: GLOBAL });
    const h2 = stableHash({ global: GLOBAL, properties: [PROP_A, PROP_B] });
    expect(h1).toBe(h2);
  });

  it("changing a single property input changes the output hash", () => {
    const r1 = computePortfolioProjection({
      properties: [PROP_A],
      globalAssumptions: GLOBAL,
      projectionYears: 10,
    });

    const modifiedProp = { ...PROP_A, startAdr: 175 };
    const r2 = computePortfolioProjection({
      properties: [modifiedProp],
      globalAssumptions: GLOBAL,
      projectionYears: 10,
    });

    expect(r1.outputHash).not.toBe(r2.outputHash);
    expect(r2.consolidatedYearly[0].revenueTotal).not.toBe(r1.consolidatedYearly[0].revenueTotal);
  });
});

describe("Export Data Shape Contract Verification", () => {
  it("yearly data has all fields required by buildIncomeStatement", () => {
    const result = computeSingleProperty({
      property: PROP_A,
      globalAssumptions: GLOBAL,
      projectionYears: 10,
    });

    const requiredFields = [
      "revenueRooms", "revenueEvents", "revenueFB", "revenueOther", "revenueTotal",
      "expenseRooms", "expenseFB", "expenseEvents", "expenseOther",
      "expenseAdmin", "expenseMarketing", "expensePropertyOps",
      "expenseIT", "expenseInsurance", "expenseOtherCosts",
      "gop", "feeBase", "feeIncentive", "agop",
      "expenseTaxes", "noi", "expenseFFE", "anoi",
      "interestExpense", "depreciationExpense", "incomeTax", "netIncome",
    ];

    for (const year of result.yearly) {
      const record = year as unknown as Record<string, unknown>;
      for (const field of requiredFields) {
        expect(year).toHaveProperty(field);
        expect(typeof record[field]).toBe("number");
        expect(Number.isFinite(record[field] as number)).toBe(true);
      }
    }
  });

  it("yearly data has all fields required by buildCashFlowStatement", () => {
    const result = computeSingleProperty({
      property: PROP_A,
      globalAssumptions: GLOBAL,
      projectionYears: 10,
    });

    const requiredFields = [
      "netIncome", "depreciationExpense", "operatingCashFlow",
      "principalPayment", "refinancingProceeds", "financingCashFlow",
      "cashFlow", "endingCash",
    ];

    for (const year of result.yearly) {
      const record = year as unknown as Record<string, unknown>;
      for (const field of requiredFields) {
        expect(year).toHaveProperty(field);
        expect(typeof record[field]).toBe("number");
        expect(Number.isFinite(record[field] as number)).toBe(true);
      }
    }
  });

  it("export data values match engine computation exactly (no transformation drift)", () => {
    const result = computePortfolioProjection({
      properties: [PROP_A],
      globalAssumptions: GLOBAL,
      projectionYears: 10,
    });

    const propKey = Object.keys(result.perPropertyYearly)[0];
    const propYearly = result.perPropertyYearly[propKey];

    for (let y = 0; y < 10; y++) {
      expect(result.consolidatedYearly[y].revenueTotal).toBe(propYearly[y].revenueTotal);
      expect(result.consolidatedYearly[y].noi).toBe(propYearly[y].noi);
      expect(result.consolidatedYearly[y].netIncome).toBe(propYearly[y].netIncome);
      expect(result.consolidatedYearly[y].endingCash).toBe(propYearly[y].endingCash);
    }
  });
});

describe("Server Code Structure Verification (File-Based)", () => {
  function readFile(filePath: string): string {
    return fs.readFileSync(filePath, "utf-8");
  }

  function fileContains(filePath: string, pattern: RegExp): boolean {
    if (!fs.existsSync(filePath)) return false;
    return pattern.test(fs.readFileSync(filePath, "utf-8"));
  }

  it("finance route imports computePortfolioProjection from service", () => {
    expect(fileContains(
      "server/routes/finance.ts",
      /import\s+\{[^}]*computePortfolioProjection[^}]*\}\s+from/
    )).toBe(true);
  });

  it("finance route returns outputHash in response", () => {
    const content = readFile("server/routes/finance.ts");
    expect(content).toContain("outputHash");
  });

  it("finance route returns engineVersion in response", () => {
    const content = readFile("server/routes/finance.ts");
    expect(content).toContain("engineVersion");
  });

  it("export-generate route imports Zod validation schema", () => {
    expect(fileContains(
      "server/routes/export-generate.ts",
      /generateExportSchema|z\.object|safeParse/
    )).toBe(true);
  });

  it("export-generate route sets X-Finance-Output-Hash header", () => {
    const content = readFile("server/routes/export-generate.ts");
    expect(content).toContain("X-Finance-Output-Hash");
  });

  it("server-export-data calls computePortfolioProjection", () => {
    expect(fileContains(
      "server/report/server-export-data.ts",
      /computePortfolioProjection\(/
    )).toBe(true);
  });

  it("server-export-data calls verifyExport", () => {
    expect(fileContains(
      "server/report/server-export-data.ts",
      /verifyExport\(/
    )).toBe(true);
  });

  it("all mutation route files import invalidateComputeCache", () => {
    const routeFiles = ["properties.ts", "global-assumptions.ts", "scenarios.ts", "finance.ts"];
    for (const file of routeFiles) {
      expect(fileContains(
        `server/routes/${file}`,
        /invalidateComputeCache/
      )).toBe(true);
    }
  });

  it("auth middleware (requireAuth) is present in mutation route files", () => {
    const routeFiles = ["properties.ts", "global-assumptions.ts", "scenarios.ts", "finance.ts", "export-generate.ts"];
    for (const file of routeFiles) {
      const content = readFile(`server/routes/${file}`);
      expect(content).toMatch(/requireAuth|requireAdmin|requireManagement/);
    }
  });

  it("rate limiting is present in compute-heavy route files", () => {
    const rateLimitedFiles = ["finance.ts", "geospatial.ts"];
    for (const file of rateLimitedFiles) {
      const filePath = `server/routes/${file}`;
      if (fs.existsSync(filePath)) {
        expect(fileContains(filePath, /isApiRateLimited/)).toBe(true);
      }
    }
  });

  it("no hardcoded API keys or secrets in server source", () => {
    const secretPattern = /(sk-[a-zA-Z0-9]{10,}|api_key\s*=\s*["'][a-zA-Z0-9]+|secret_key\s*=\s*["'][a-zA-Z0-9]+)/;
    function scanDir(dir: string): string[] {
      const violations: string[] = [];
      if (!fs.existsSync(dir)) return violations;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          violations.push(...scanDir(full));
        } else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
          const content = fs.readFileSync(full, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const isFalsePositive = /["'./]risk-intelligence/.test(lines[i]) || /["']brand:/.test(lines[i]);
            if (secretPattern.test(lines[i]) && !lines[i].includes("example") && !lines[i].includes("placeholder") && !isFalsePositive) {
              violations.push(`${full}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        }
      }
      return violations;
    }
    const violations = scanDir("server");
    expect(violations).toEqual([]);
  });
});
