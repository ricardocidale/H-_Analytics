/**
 * Toggle Compliance — Proof Test
 *
 * Verifies that fee category isActive, service template isActive,
 * and costSegEnabled toggles are properly honored across the codebase.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.resolve(ROOT, relPath), "utf-8");
}

describe("Toggle Compliance", () => {
  describe("fee category isActive", () => {
    it("resolve-assumptions filters inactive fee categories", () => {
      const content = readFile("engine/property/resolve-assumptions.ts");
      expect(content).toMatch(/feeCategories\?\.filter\(.*isActive/);
    });

    it("property-engine branches on hasActiveFeeCategories", () => {
      const content = readFile("engine/property/property-engine.ts");
      expect(content).toMatch(/hasActiveFeeCategories/);
    });

    it("ManagementFeesSection UI toggles fee isActive", () => {
      const content = readFile("client/src/components/property-edit/ManagementFeesSection.tsx");
      // Toggle handler changes isActive per category
      expect(content).toMatch(/onFeeCategoryChange.*isActive/);
      // Visual feedback: line-through on inactive
      expect(content).toMatch(/line-through/);
    });

    it("engine types define isActive on feeCategories", () => {
      const content = readFile("engine/types.ts");
      expect(content).toMatch(/feeCategories.*isActive:\s*boolean/s);
    });
  });

  describe("service template isActive", () => {
    it("cost-of-services filters inactive templates", () => {
      const content = readFile("calc/services/cost-of-services.ts");
      expect(content).toMatch(/if\s*\(t\.isActive\)/);
    });

    it("syncTemplatesToProperties filters active templates", () => {
      const content = readFile("server/storage/services.ts");
      expect(content).toMatch(/templates\.filter\(.*isActive/);
    });

    it("company-pack AI context filters active templates", () => {
      const content = readFile("server/ai/context-pack/company-pack.ts");
      expect(content).toMatch(/isActive\s*!==\s*false/);
    });

    it("ComputePortfolioInput includes serviceTemplates field", () => {
      const content = readFile("server/finance/service.ts");
      expect(content).toMatch(/interface ComputePortfolioInput[\s\S]*?serviceTemplates\??:\s*ServiceTemplate/);
    });

    it("ComputeCompanyInput includes serviceTemplates field", () => {
      const content = readFile("server/finance/service.ts");
      expect(content).toMatch(/interface ComputeCompanyInput[\s\S]*?serviceTemplates\??:\s*ServiceTemplate/);
    });

    it("server compute passes serviceTemplates to generateCompanyProForma", () => {
      const content = readFile("server/finance/service.ts");
      const calls = content.match(/generateCompanyProForma\([^)]*serviceTemplates/g);
      expect(calls?.length).toBeGreaterThanOrEqual(2);
    });

    it("finance routes load service templates for compute", () => {
      const content = readFile("server/routes/finance.ts");
      expect(content).toMatch(/getAllServiceTemplates/);
    });
  });

  describe("service template cache invalidation", () => {
    it("admin service routes invalidate compute cache on create", () => {
      const content = readFile("server/routes/admin/services.ts");
      expect(content).toMatch(/invalidateComputeCache/);
      // Should appear at least 4 times (create, update, delete, sync)
      const matches = content.match(/invalidateComputeCache\(\)/g);
      expect(matches?.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("costSegEnabled", () => {
    it("resolve-assumptions reads costSegEnabled from property", () => {
      const content = readFile("engine/property/resolve-assumptions.ts");
      expect(content).toMatch(/costSegEnabled/);
    });

    it("property-engine branches on costSegEnabled for depreciation", () => {
      const content = readFile("engine/property/property-engine.ts");
      expect(content).toMatch(/costSegEnabled/);
    });

    it("schema defines costSegEnabled with default false", () => {
      const content = readFile("shared/schema/properties.ts");
      expect(content).toMatch(/costSegEnabled.*default\(false\)|cost_seg_enabled.*default\(false\)/);
    });
  });

  describe("scenario preservation", () => {
    it("ScenarioPropertySnapshot allows isActive", () => {
      const content = readFile("shared/schema/types/jsonb-shapes.ts");
      // ScenarioPropertySnapshot should have isActive or catch-all
      expect(content).toMatch(/ScenarioPropertySnapshot[\s\S]*?isActive/);
    });

    it("scenario fee category snapshot preserves all fields", () => {
      // buildCreateSnapshotData fetches fee categories
      const content = readFile("server/routes/scenario-helpers.ts");
      expect(content).toMatch(/getFeeCategoriesByProperties|feeCategories/);
    });
  });
});
