import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../server/finance/core/property-pipeline";
import { aggregatePropertyByYear } from "../../server/finance/core/yearly-aggregator";
import { computePortfolioProjection, computeSingleProperty } from "../../server/finance/service";
import { stableHash } from "../../server/scenarios/stable-json";
import type { PropertyInput, GlobalInput } from "@engine/types";
import Decimal from "decimal.js";

const SAMPLE_PROPERTY: PropertyInput = {
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

const SAMPLE_GLOBAL: GlobalInput = {
  modelStartDate: "2026-04-01",
  inflationRate: 0,
  projectionYears: 10,
};

describe("Data Flow Integrity Trace", () => {
  it("traces revenue from engine through service with no precision loss", () => {
    const months = 10 * 12;
    const rawMonthly = generatePropertyProForma(SAMPLE_PROPERTY, SAMPLE_GLOBAL, months);
    const rawYearly = aggregatePropertyByYear(rawMonthly, 10);

    const singleResult = computeSingleProperty({
      property: SAMPLE_PROPERTY,
      globalAssumptions: SAMPLE_GLOBAL,
      projectionYears: 10,
    });

    expect(singleResult.yearly.length).toBe(rawYearly.length);
    for (let y = 0; y < rawYearly.length; y++) {
      expect(singleResult.yearly[y].revenueTotal).toBe(rawYearly[y].revenueTotal);
      expect(singleResult.yearly[y].noi).toBe(rawYearly[y].noi);
      expect(singleResult.yearly[y].netIncome).toBe(rawYearly[y].netIncome);
      expect(singleResult.yearly[y].endingCash).toBe(rawYearly[y].endingCash);
    }

    expect(singleResult.monthly.length).toBe(rawMonthly.length);
    for (let m = 0; m < rawMonthly.length; m++) {
      expect(singleResult.monthly[m].revenueTotal).toBe(rawMonthly[m].revenueTotal);
      expect(singleResult.monthly[m].noi).toBe(rawMonthly[m].noi);
    }
  });

  it("portfolio projection matches single-property for single-property input", () => {
    const portfolioResult = computePortfolioProjection({
      properties: [SAMPLE_PROPERTY],
      globalAssumptions: SAMPLE_GLOBAL,
      projectionYears: 10,
    });

    const singleResult = computeSingleProperty({
      property: SAMPLE_PROPERTY,
      globalAssumptions: SAMPLE_GLOBAL,
      projectionYears: 10,
    });

    const key = Object.keys(portfolioResult.perPropertyYearly)[0];
    const portfolioYearly = portfolioResult.perPropertyYearly[key];

    for (let y = 0; y < portfolioYearly.length; y++) {
      expect(portfolioYearly[y].revenueTotal).toBe(singleResult.yearly[y].revenueTotal);
      expect(portfolioYearly[y].noi).toBe(singleResult.yearly[y].noi);
      expect(portfolioYearly[y].netIncome).toBe(singleResult.yearly[y].netIncome);
    }
  });

  it("output hash is deterministic for identical inputs", () => {
    const r1 = computeSingleProperty({
      property: SAMPLE_PROPERTY,
      globalAssumptions: SAMPLE_GLOBAL,
      projectionYears: 10,
    });

    const r2 = computeSingleProperty({
      property: SAMPLE_PROPERTY,
      globalAssumptions: SAMPLE_GLOBAL,
      projectionYears: 10,
    });

    expect(r1.outputHash).toBe(r2.outputHash);
    expect(r1.outputHash.length).toBe(64);
  });

  it("validation summary is UNQUALIFIED for valid input", () => {
    const result = computeSingleProperty({
      property: SAMPLE_PROPERTY,
      globalAssumptions: SAMPLE_GLOBAL,
      projectionYears: 10,
    });

    expect(result.validationSummary.opinion).toBe("UNQUALIFIED");
    expect(result.validationSummary.failed).toBe(0);
    expect(result.validationSummary.passed).toBeGreaterThan(0);
  });

  it("revenue accumulation has no floating-point drift over 120 months", () => {
    const months = 120;
    const monthly = generatePropertyProForma(SAMPLE_PROPERTY, SAMPLE_GLOBAL, months);

    const revenueSum = monthly.reduce((acc, m) => acc + m.revenueTotal, 0);
    const decimalSum = monthly.reduce(
      (acc, m) => acc.plus(new Decimal(m.revenueTotal)),
      new Decimal(0)
    );

    const drift = Math.abs(revenueSum - decimalSum.toNumber());
    expect(drift).toBeLessThan(0.01);
  });

  it("cache returns identical results on repeated call", () => {
    const input = {
      property: { ...SAMPLE_PROPERTY, name: "Cache Test Hotel" },
      globalAssumptions: SAMPLE_GLOBAL,
      projectionYears: 10,
    };

    const r1 = computeSingleProperty(input);
    const r2 = computeSingleProperty(input);

    expect(r2.cached).toBe(true);
    expect(r2.outputHash).toBe(r1.outputHash);
    expect(r2.yearly.length).toBe(r1.yearly.length);
    for (let y = 0; y < r1.yearly.length; y++) {
      expect(r2.yearly[y].revenueTotal).toBe(r1.yearly[y].revenueTotal);
      expect(r2.yearly[y].noi).toBe(r1.yearly[y].noi);
    }
  });

  it("stable hash produces consistent 64-char SHA-256", () => {
    const data = { a: 1, b: [2, 3], c: { d: "test" } };
    const h1 = stableHash(data);
    const h2 = stableHash({ c: { d: "test" }, a: 1, b: [2, 3] });
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64);
    expect(/^[a-f0-9]{64}$/.test(h1)).toBe(true);
  });
});

describe("Engine Chain Identity Verification", () => {
  it("agop = gop − feeBase − feeIncentive at monthly level", () => {
    const months = 120;
    const monthly = generatePropertyProForma(SAMPLE_PROPERTY, SAMPLE_GLOBAL, months);

    for (let m = 0; m < months; m++) {
      if (monthly[m].revenueTotal === 0) continue;
      const expected = monthly[m].gop - monthly[m].feeBase - monthly[m].feeIncentive;
      expect(Math.abs(monthly[m].agop - expected)).toBeLessThan(0.01);
    }
  });

  it("noi = agop − expenseTaxes at yearly level", () => {
    const result = computeSingleProperty({
      property: SAMPLE_PROPERTY,
      globalAssumptions: SAMPLE_GLOBAL,
      projectionYears: 10,
    });

    for (const year of result.yearly) {
      if (year.revenueTotal === 0) continue;
      const expected = year.agop - year.expenseTaxes;
      expect(Math.abs(year.noi - expected)).toBeLessThan(0.01);
    }
  });

  it("service result includes all required output fields", () => {
    const result = computeSingleProperty({
      property: SAMPLE_PROPERTY,
      globalAssumptions: SAMPLE_GLOBAL,
      projectionYears: 10,
    });

    expect(result).toHaveProperty("yearly");
    expect(result).toHaveProperty("monthly");
    expect(result).toHaveProperty("outputHash");
    expect(result).toHaveProperty("engineVersion");
    expect(result).toHaveProperty("validationSummary");
    expect(result.yearly.length).toBe(10);
    expect(result.monthly.length).toBe(120);
    expect(typeof result.outputHash).toBe("string");
    expect(typeof result.engineVersion).toBe("string");
  });

  it("portfolio result includes all required output fields", () => {
    const result = computePortfolioProjection({
      properties: [SAMPLE_PROPERTY],
      globalAssumptions: SAMPLE_GLOBAL,
      projectionYears: 10,
    });

    expect(result).toHaveProperty("consolidatedYearly");
    expect(result).toHaveProperty("perPropertyYearly");
    expect(result).toHaveProperty("outputHash");
    expect(result).toHaveProperty("engineVersion");
    expect(result).toHaveProperty("validationSummary");
    expect(result).toHaveProperty("propertyCount");
    expect(result.propertyCount).toBe(1);
    expect(result.consolidatedYearly.length).toBe(10);
  });

  it("monthly revenue values are non-negative for operational months", () => {
    const months = 120;
    const monthly = generatePropertyProForma(SAMPLE_PROPERTY, SAMPLE_GLOBAL, months);
    for (let m = 0; m < months; m++) {
      expect(monthly[m].revenueTotal).toBeGreaterThanOrEqual(0);
    }
  });

  it("yearly values are sums of monthly values (revenue)", () => {
    const months = 120;
    const monthly = generatePropertyProForma(SAMPLE_PROPERTY, SAMPLE_GLOBAL, months);
    const yearly = aggregatePropertyByYear(monthly, 10);

    for (let y = 0; y < 10; y++) {
      const monthlySlice = monthly.slice(y * 12, (y + 1) * 12);
      const monthlySum = monthlySlice.reduce((acc, m) => acc + m.revenueTotal, 0);
      expect(Math.abs(yearly[y].revenueTotal - monthlySum)).toBeLessThan(0.01);
    }
  });
});

describe("Data Flow Pipeline Structure Audit", () => {
  function scanPath(target: string, regex: RegExp): string[] {
    const results: string[] = [];
    const fsLib = require("fs");
    const pathLib = require("path");
    if (!fsLib.existsSync(target)) return results;
    const stat = fsLib.statSync(target);
    if (stat.isFile()) {
      const norm = target.replace(/\\/g, "/");
      const lines = fsLib.readFileSync(target, "utf-8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) results.push(`${norm}:${i + 1}:${lines[i]}`);
      }
      return results;
    }
    for (const entry of fsLib.readdirSync(target, { withFileTypes: true })) {
      const full = pathLib.join(target, entry.name);
      const norm = full.replace(/\\/g, "/");
      if (entry.isDirectory()) results.push(...scanPath(full, regex));
      else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
        const lines = fsLib.readFileSync(full, "utf-8").split("\n");
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

  it("finance compute endpoint imports computePortfolioProjection", () => {
    const lines = grepServer("computePortfolioProjection", "server/routes/finance.ts");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("finance compute endpoint returns outputHash and engineVersion", () => {
    const hash = grepServer("outputHash", "server/routes/finance.ts");
    const version = grepServer("engineVersion", "server/routes/finance.ts");
    expect(hash.length).toBeGreaterThan(0);
    expect(version.length).toBeGreaterThan(0);
  });

  it("service.ts imports from @engine/ (single source of truth)", () => {
    const lines = grepServer("from.*@engine", "server/finance/service.ts");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("client useServerFinancials hook exists for fetching server results", () => {
    const lines = grepServer("useServerFinancials|usePortfolioFinancials", "client/src/hooks/");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("export pipeline uses computePortfolioProjection for server-authoritative data", () => {
    const lines = grepServer("computePortfolioProjection", "server/report/server-export-data.ts");
    expect(lines.length).toBeGreaterThan(0);
  });
});
