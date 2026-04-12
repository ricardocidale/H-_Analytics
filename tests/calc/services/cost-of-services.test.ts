import { describe, it, expect } from "vitest";
import { computeCostOfServices } from "../../../calc/services/cost-of-services.js";
import { vendorCostFromFee } from "../../../calc/services/margin-calculator.js";
import type { ServiceTemplate } from "../../../calc/services/types.js";

const makeTemplate = (overrides: Partial<ServiceTemplate> & { name: string }): ServiceTemplate => ({
  id: 1,
  defaultRate: 0.02,
  serviceModel: "centralized",
  serviceMarkup: 0.20,
  isActive: true,
  sortOrder: 0,
  ...overrides,
});

const templates: ServiceTemplate[] = [
  makeTemplate({ id: 1, name: "Marketing & Brand", serviceModel: "centralized", serviceMarkup: 0.20, sortOrder: 1 }),
  makeTemplate({ id: 2, name: "Technology & Reservations", serviceModel: "centralized", serviceMarkup: 0.20, sortOrder: 2 }),
  makeTemplate({ id: 3, name: "General Management", serviceModel: "direct", serviceMarkup: 0.20, sortOrder: 3 }),
  makeTemplate({ id: 4, name: "Procurement", serviceModel: "centralized", serviceMarkup: 0.15, sortOrder: 4 }),
];

describe("Cost of Centralized Services Aggregator", () => {
  describe("basic aggregation", () => {
    const fees: Record<string, number> = {
      "Marketing & Brand": 10_000,
      "Technology & Reservations": 5_000,
      "General Management": 8_000,
      "Procurement": 3_000,
    };

    const result = computeCostOfServices(fees, templates);

    it("returns per-category breakdown", () => {
      expect(Object.keys(result.byCategory)).toHaveLength(4);
    });

    it("centralized: Marketing vendor cost = fee / 1.20", () => {
      const cat = result.byCategory["Marketing & Brand"];
      expect(cat.serviceModel).toBe("centralized");
      expect(cat.revenue).toBe(10_000);
      expect(cat.vendorCost).toBeCloseTo(vendorCostFromFee(10_000, 0.20), 2);
      expect(cat.grossProfit).toBeCloseTo(10_000 - cat.vendorCost, 2);
    });

    it("centralized: Procurement uses its own markup (15%)", () => {
      const cat = result.byCategory["Procurement"];
      expect(cat.markup).toBe(0.15);
      expect(cat.vendorCost).toBeCloseTo(vendorCostFromFee(3_000, 0.15), 2);
    });

    it("direct: General Management has zero vendor cost", () => {
      const cat = result.byCategory["General Management"];
      expect(cat.serviceModel).toBe("direct");
      expect(cat.vendorCost).toBe(0);
      expect(cat.grossProfit).toBe(8_000);
    });

    it("totalVendorCost sums only centralized categories", () => {
      const expectedVendor =
        vendorCostFromFee(10_000, 0.20) +
        vendorCostFromFee(5_000, 0.20) +
        vendorCostFromFee(3_000, 0.15);
      expect(result.totalVendorCost).toBeCloseTo(expectedVendor, 2);
    });

    it("totalGrossProfit = sum of all category gross profits", () => {
      const sum = Object.values(result.byCategory).reduce((a, c) => a + c.grossProfit, 0);
      expect(result.totalGrossProfit).toBeCloseTo(sum, 6);
    });

    it("centralizedRevenue + directRevenue = total fee revenue", () => {
      const totalFees = Object.values(fees).reduce((a, b) => a + b, 0);
      expect(result.centralizedRevenue + result.directRevenue).toBeCloseTo(totalFees, 6);
    });

    it("centralizedRevenue counts only centralized categories", () => {
      expect(result.centralizedRevenue).toBeCloseTo(10_000 + 5_000 + 3_000, 2);
    });

    it("directRevenue counts only direct categories", () => {
      expect(result.directRevenue).toBeCloseTo(8_000, 2);
    });
  });

  describe("zero-sum identity: revenue = vendorCost + grossProfit", () => {
    const fees: Record<string, number> = {
      "Marketing & Brand": 25_000,
      "Technology & Reservations": 12_000,
      "General Management": 15_000,
      "Procurement": 8_000,
    };

    const result = computeCostOfServices(fees, templates);

    it("totalVendorCost + totalGrossProfit = total fees", () => {
      const totalFees = Object.values(fees).reduce((a, b) => a + b, 0);
      expect(result.totalVendorCost + result.totalGrossProfit).toBeCloseTo(totalFees, 6);
    });

    it("per-category: revenue = vendorCost + grossProfit for each", () => {
      for (const cat of Object.values(result.byCategory)) {
        expect(cat.vendorCost + cat.grossProfit).toBeCloseTo(cat.revenue, 6);
      }
    });
  });

  describe("edge cases", () => {
    it("empty fees returns zero totals", () => {
      const result = computeCostOfServices({}, templates);
      expect(result.totalVendorCost).toBe(0);
      expect(result.totalGrossProfit).toBe(0);
      expect(result.centralizedRevenue).toBe(0);
      expect(result.directRevenue).toBe(0);
      expect(Object.keys(result.byCategory)).toHaveLength(0);
    });

    it("empty templates: all categories treated as direct", () => {
      const fees = { "Marketing & Brand": 10_000, "Unknown": 5_000 };
      const result = computeCostOfServices(fees, []);
      expect(result.totalVendorCost).toBe(0);
      expect(result.totalGrossProfit).toBeCloseTo(15_000, 2);
      expect(result.directRevenue).toBeCloseTo(15_000, 2);
    });

    it("fee category not in templates: treated as direct", () => {
      const fees = { "Marketing & Brand": 10_000, "Mystery Service": 7_000 };
      const result = computeCostOfServices(fees, templates);
      const mystery = result.byCategory["Mystery Service"];
      expect(mystery.serviceModel).toBe("direct");
      expect(mystery.vendorCost).toBe(0);
      expect(mystery.grossProfit).toBe(7_000);
    });

    it("inactive templates are ignored", () => {
      const inactiveTemplates = templates.map(t =>
        t.name === "Marketing & Brand" ? { ...t, isActive: false } : t
      );
      const fees = { "Marketing & Brand": 10_000 };
      const result = computeCostOfServices(fees, inactiveTemplates);
      // Marketing template is inactive, so treated as direct (no vendor cost)
      expect(result.byCategory["Marketing & Brand"].vendorCost).toBe(0);
      expect(result.byCategory["Marketing & Brand"].serviceModel).toBe("direct");
    });

    it("zero fee amounts produce zero costs", () => {
      const fees = { "Marketing & Brand": 0, "Technology & Reservations": 0 };
      const result = computeCostOfServices(fees, templates);
      expect(result.totalVendorCost).toBe(0);
      expect(result.totalGrossProfit).toBe(0);
    });

    it("all-direct templates produce zero vendor cost", () => {
      const directOnly = templates.map(t => ({ ...t, serviceModel: "direct" as const }));
      const fees = { "Marketing & Brand": 10_000, "Technology & Reservations": 5_000 };
      const result = computeCostOfServices(fees, directOnly);
      expect(result.totalVendorCost).toBe(0);
      expect(result.totalGrossProfit).toBeCloseTo(15_000, 2);
    });
  });
});
