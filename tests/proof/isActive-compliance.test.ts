/**
 * isActive Compliance — Proof Test
 *
 * Ensures that every code path calling the financial engines
 * (generatePropertyProForma, generateCompanyProForma, computePortfolioProjection,
 * computeCompanyProjection) either filters out inactive properties or receives
 * pre-filtered data. Also verifies server-side defense-in-depth filters exist.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.resolve(ROOT, relPath), "utf-8");
}

describe("isActive Compliance", () => {
  describe("client-side compute paths filter inactive properties", () => {
    it("Company.tsx filters before generateCompanyProForma call", () => {
      const content = readFile("client/src/pages/Company.tsx");
      const lines = content.split("\n");
      // Find the clientFinancials useMemo block that calls generateCompanyProForma
      const blockStart = lines.findIndex(l => l.includes("clientFinancials") && l.includes("useMemo"));
      const blockEnd = lines.findIndex((l, i) => i > blockStart && l.includes("generateCompanyProForma") && !l.includes("import"));
      const block = lines.slice(blockStart, blockEnd + 1).join("\n");
      expect(block).toMatch(/isActive\s*!==\s*false/);
    });

    it("Company.tsx filters before generatePropertyProForma", () => {
      const content = readFile("client/src/pages/Company.tsx");
      const lines = content.split("\n");
      // Find the clientPropertyFinancials block — it should filter
      const blockStart = lines.findIndex(l => l.includes("clientPropertyFinancials"));
      const blockEnd = lines.findIndex((l, i) => i > blockStart && l.includes("generatePropertyProForma"));
      const block = lines.slice(blockStart, blockEnd + 1).join("\n");
      expect(block).toMatch(/isActive\s*!==\s*false/);
    });

    it("FundingPredictor.tsx filters before generateCompanyProForma call", () => {
      const content = readFile("client/src/pages/FundingPredictor.tsx");
      const lines = content.split("\n");
      // Find the useMemo block that calls generateCompanyProForma
      const blockStart = lines.findIndex(l => l.includes("clientFinancials") || l.includes("useMemo"));
      const blockEnd = lines.findIndex((l, i) => i > blockStart && l.includes("generateCompanyProForma") && !l.includes("import"));
      const block = lines.slice(blockStart, blockEnd + 1).join("\n");
      expect(block).toMatch(/isActive\s*!==\s*false/);
    });

    it("Dashboard.tsx filters active properties", () => {
      const content = readFile("client/src/pages/Dashboard.tsx");
      expect(content).toMatch(/isActive\s*!==\s*false/);
    });

    it("usePortfolioFinancials filters active properties", () => {
      const content = readFile("client/src/components/dashboard/usePortfolioFinancials.ts");
      expect(content).toMatch(/isActive\s*!==\s*false/);
    });

    it("useServerFinancials filters before server calls", () => {
      const content = readFile("client/src/hooks/useServerFinancials.ts");
      const matches = content.match(/isActive\s*!==\s*false/g);
      // Should filter in both portfolio and company compute paths
      expect(matches?.length).toBeGreaterThanOrEqual(2);
    });

    it("SensitivityAnalysis.tsx filters active properties", () => {
      const content = readFile("client/src/pages/SensitivityAnalysis.tsx");
      expect(content).toMatch(/isActive\s*!==\s*false/);
    });

    it("overviewExportData.ts filters active properties", () => {
      const content = readFile("client/src/components/dashboard/overviewExportData.ts");
      expect(content).toMatch(/isActive\s*!==\s*false/);
    });

    it("MapView.tsx filters active properties", () => {
      const content = readFile("client/src/pages/MapView.tsx");
      expect(content).toMatch(/isActive\s*!==\s*false/);
    });
  });

  describe("server-side defense-in-depth filters", () => {
    it("finance compute route filters inactive properties", () => {
      const content = readFile("server/routes/finance.ts");
      // The /api/finance/compute route should have a defensive filter
      const computeRouteIdx = content.indexOf("api/finance/compute");
      const companyRouteIdx = content.indexOf("api/finance/company");
      const routeBlock = content.slice(computeRouteIdx, companyRouteIdx);
      expect(routeBlock).toMatch(/isActive\s*!==\s*false/);
    });

    it("finance company route filters inactive properties", () => {
      const content = readFile("server/routes/finance.ts");
      const companyRouteIdx = content.indexOf("api/finance/company");
      const routeBlock = content.slice(companyRouteIdx);
      expect(routeBlock).toMatch(/isActive\s*!==\s*false/);
    });

    it("verification checker filters inactive properties", () => {
      const content = readFile("server/routes/calculations.ts");
      expect(content).toMatch(/isActive\s*!==\s*false/);
    });

    it("notification engine skips inactive properties", () => {
      const content = readFile("server/notifications/engine.ts");
      expect(content).toMatch(/isActive\s*===\s*false/);
    });
  });

  describe("scenario save/load preserves isActive", () => {
    it("ScenarioPropertySnapshot type includes isActive", () => {
      const content = readFile("shared/schema/types/jsonb-shapes.ts");
      expect(content).toMatch(/isActive\??\s*:\s*boolean/);
    });

    it("scenario load restores isActive with fallback", () => {
      const content = readFile("server/storage/financial.ts");
      // Should restore isActive with a ?? true fallback
      expect(content).toMatch(/isActive.*\?\?\s*true/);
    });
  });
});
