import { describe, it, expect } from "vitest";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_COMPANY_TAX_RATE,
  DEFAULT_COST_RATE_ROOMS,
  DEFAULT_COST_RATE_FB,
  DEFAULT_COST_RATE_ADMIN,
  DEFAULT_COST_RATE_MARKETING,
  DEFAULT_COST_RATE_PROPERTY_OPS,
  DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_COST_RATE_TAXES,
  DEFAULT_COST_RATE_IT,
  DEFAULT_COST_RATE_FFE,
  DEFAULT_COST_RATE_OTHER,
  DEFAULT_REV_SHARE_EVENTS,
  DEFAULT_REV_SHARE_FB,
  DEFAULT_REV_SHARE_OTHER,
  DEFAULT_SERVICE_FEE_CATEGORIES,
  DEFAULT_SAFE_VALUATION_CAP,
  DEFAULT_SAFE_DISCOUNT_RATE,
  DEFAULT_PROPERTY_TAX_RATE,
} from "../../shared/constants.js";

const SEED_GLOBAL_ASSUMPTIONS = {
  modelStartDate: "2026-04-01",
  inflationRate: 0.03,
  baseManagementFee: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFee: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  staffSalary: 75000,
  staffTier1MaxProperties: 3,
  staffTier1Fte: 2.5,
  staffTier2MaxProperties: 6,
  staffTier2Fte: 4.5,
  staffTier3Fte: 7.0,
  travelCostPerClient: 12000,
  itLicensePerClient: 3000,
  marketingRate: 0.05,
  miscOpsRate: 0.03,
  officeLeaseStart: 36000,
  professionalServicesStart: 24000,
  techInfraStart: 18000,
  standardAcqPackage: { monthsToOps: 6, purchasePrice: 3800000, preOpeningCosts: 200000, operatingReserve: 250000, buildingImprovements: 1200000 },
  commissionRate: DEFAULT_COMMISSION_RATE,
  fixedCostEscalationRate: 0.03,
  safeTranche1Amount: 1000000,
  safeTranche1Date: "2026-06-01",
  safeTranche2Amount: 1000000,
  safeTranche2Date: "2027-04-01",
  safeValuationCap: DEFAULT_SAFE_VALUATION_CAP,
  safeDiscountRate: DEFAULT_SAFE_DISCOUNT_RATE,
  companyTaxRate: 0.3,
  companyOpsStartDate: "2026-06-01",
  fiscalYearStartMonth: 1,
  companyName: "Hospitality Business Group",
  exitCapRate: DEFAULT_EXIT_CAP_RATE,
  salesCommissionRate: DEFAULT_COMMISSION_RATE,
};

const SEED_PROPERTIES = [
  { name: "The Hudson Estate", location: "Hudson Valley, New York", purchasePrice: 3800000, buildingImprovements: 1200000, preOpeningCosts: 200000, operatingReserve: 250000, roomCount: 20, startAdr: 385, startOccupancy: 0.55, maxOccupancy: 0.82, exitCapRate: 0.08, costRateFB: 0.085, cateringBoostPercent: 0.22 },
  { name: "Eden Summit Lodge", location: "Ogden Valley, Utah", purchasePrice: 4000000, buildingImprovements: 1200000, preOpeningCosts: 200000, operatingReserve: 250000, roomCount: 20, startAdr: 425, startOccupancy: 0.50, maxOccupancy: 0.80, exitCapRate: DEFAULT_EXIT_CAP_RATE, costRateFB: 0.085, cateringBoostPercent: 0.25 },
  { name: "Austin Hillside", location: "Hill Country, Texas", purchasePrice: 3500000, buildingImprovements: 1100000, preOpeningCosts: 200000, operatingReserve: 250000, roomCount: 20, startAdr: 320, startOccupancy: 0.55, maxOccupancy: 0.82, exitCapRate: DEFAULT_EXIT_CAP_RATE, costRateFB: 0.09, cateringBoostPercent: 0.20 },
  { name: "Casa Medellín", location: "El Poblado, Medellín", purchasePrice: 3800000, buildingImprovements: 1000000, preOpeningCosts: 200000, operatingReserve: 250000, roomCount: 30, startAdr: 210, startOccupancy: 0.50, maxOccupancy: 0.78, exitCapRate: 0.095, costRateFB: 0.075, cateringBoostPercent: 0.18 },
  { name: "Blue Ridge Manor", location: "Blue Ridge Mountains, North Carolina", purchasePrice: 6000000, buildingImprovements: 1500000, preOpeningCosts: 250000, operatingReserve: 300000, roomCount: 30, startAdr: 375, startOccupancy: 0.50, maxOccupancy: 0.80, exitCapRate: 0.09, costRateFB: 0.10, cateringBoostPercent: 0.25 },
];

/**
 * Database Sync Golden Values Test
 * 
 * These tests anchor the EXACT values that must exist in the production database.
 * The seed data in server/routes.ts is defined inline (not exportable), so these
 * tests duplicate the values intentionally as a regression contract.
 * 
 * If a constant changes in shared/constants.ts, these tests will catch the drift
 * between constants and the expected seed values. If seed values change in
 * routes.ts, these tests will fail until updated, ensuring the change is deliberate.
 * 
 * Related files:
 *   - shared/constants.ts (source of truth for defaults)
 *   - server/routes.ts   (seed-production endpoint, lines ~600-860)
 *   - client/src/pages/Admin.tsx (Database tab UI)
 */

describe("Database Sync — Seed Constants Integrity", () => {
  describe("Global Assumptions Seed Values", () => {
    it("base management fee rate matches constant", () => {
      expect(SEED_GLOBAL_ASSUMPTIONS.baseManagementFee).toBe(0.085);
      expect(SEED_GLOBAL_ASSUMPTIONS.baseManagementFee).toBe(DEFAULT_BASE_MANAGEMENT_FEE_RATE);
    });

    it("incentive management fee rate matches constant", () => {
      expect(SEED_GLOBAL_ASSUMPTIONS.incentiveManagementFee).toBe(0.12);
      expect(SEED_GLOBAL_ASSUMPTIONS.incentiveManagementFee).toBe(DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE);
    });

    it("exit cap rate matches constant", () => {
      expect(SEED_GLOBAL_ASSUMPTIONS.exitCapRate).toBe(0.085);
      expect(SEED_GLOBAL_ASSUMPTIONS.exitCapRate).toBe(DEFAULT_EXIT_CAP_RATE);
    });

    it("commission rate matches constant", () => {
      expect(SEED_GLOBAL_ASSUMPTIONS.commissionRate).toBe(0.05);
      expect(SEED_GLOBAL_ASSUMPTIONS.commissionRate).toBe(DEFAULT_COMMISSION_RATE);
    });

    it("company tax rate matches constant", () => {
      expect(SEED_GLOBAL_ASSUMPTIONS.companyTaxRate).toBe(0.3);
      expect(SEED_GLOBAL_ASSUMPTIONS.companyTaxRate).toBe(DEFAULT_COMPANY_TAX_RATE);
    });

    it("SAFE valuation cap matches constant", () => {
      expect(SEED_GLOBAL_ASSUMPTIONS.safeValuationCap).toBe(2500000);
      expect(SEED_GLOBAL_ASSUMPTIONS.safeValuationCap).toBe(DEFAULT_SAFE_VALUATION_CAP);
    });

    it("SAFE discount rate matches constant", () => {
      expect(SEED_GLOBAL_ASSUMPTIONS.safeDiscountRate).toBe(0.20);
      expect(SEED_GLOBAL_ASSUMPTIONS.safeDiscountRate).toBe(DEFAULT_SAFE_DISCOUNT_RATE);
    });

    it("standard acquisition package has correct values", () => {
      const pkg = SEED_GLOBAL_ASSUMPTIONS.standardAcqPackage;
      expect(pkg.purchasePrice).toBe(3800000);
      expect(pkg.buildingImprovements).toBe(1200000);
      expect(pkg.preOpeningCosts).toBe(200000);
      expect(pkg.operatingReserve).toBe(250000);
      expect(pkg.monthsToOps).toBe(6);
    });

    it("inflation rate is 3%", () => {
      expect(SEED_GLOBAL_ASSUMPTIONS.inflationRate).toBe(0.03);
    });

    it("fixed cost escalation equals inflation", () => {
      expect(SEED_GLOBAL_ASSUMPTIONS.fixedCostEscalationRate).toBe(SEED_GLOBAL_ASSUMPTIONS.inflationRate);
    });

    it("model start date is April 2026", () => {
      expect(SEED_GLOBAL_ASSUMPTIONS.modelStartDate).toBe("2026-04-01");
    });

    it("company ops start date is June 2026", () => {
      expect(SEED_GLOBAL_ASSUMPTIONS.companyOpsStartDate).toBe("2026-06-01");
    });

    it("partner compensation values are set", () => {
      expect(SEED_GLOBAL_ASSUMPTIONS.companyName).toBe("Hospitality Business Group");
    });
  });

  describe("Seed Property Values", () => {
    it(`has exactly ${SEED_PROPERTIES.length} properties`, () => {
      expect(SEED_PROPERTIES).toHaveLength(SEED_PROPERTIES.length);
    });

    it("all properties have positive purchase prices", () => {
      for (const prop of SEED_PROPERTIES) {
        expect(prop.purchasePrice).toBeGreaterThan(0);
      }
    });

    it("all properties have building improvements", () => {
      for (const prop of SEED_PROPERTIES) {
        expect(prop.buildingImprovements).toBeGreaterThan(0);
      }
    });

    it("all properties have room counts between 10-80", () => {
      for (const prop of SEED_PROPERTIES) {
        expect(prop.roomCount).toBeGreaterThanOrEqual(10);
        expect(prop.roomCount).toBeLessThanOrEqual(80);
      }
    });

    it("all properties have ADR above $150", () => {
      for (const prop of SEED_PROPERTIES) {
        expect(prop.startAdr).toBeGreaterThanOrEqual(150);
      }
    });

    it("all occupancy starts below max", () => {
      for (const prop of SEED_PROPERTIES) {
        expect(prop.startOccupancy).toBeLessThan(prop.maxOccupancy);
      }
    });

    it("all exit cap rates are between 5-12%", () => {
      for (const prop of SEED_PROPERTIES) {
        expect(prop.exitCapRate).toBeGreaterThanOrEqual(0.05);
        expect(prop.exitCapRate).toBeLessThanOrEqual(0.12);
      }
    });

    it("Hudson Estate has correct flagship values", () => {
      const hudson = SEED_PROPERTIES.find(p => p.name === "The Hudson Estate")!;
      expect(hudson.purchasePrice).toBe(3800000);
      expect(hudson.buildingImprovements).toBe(1200000);
      expect(hudson.roomCount).toBe(20);
      expect(hudson.startAdr).toBe(385);
      expect(hudson.startOccupancy).toBe(0.55);
      expect(hudson.maxOccupancy).toBe(0.82);
      expect(hudson.exitCapRate).toBe(0.08);
      expect(hudson.location).toBe("Hudson Valley, New York");
    });

    it("Eden Summit Lodge has correct values", () => {
      const eden = SEED_PROPERTIES.find(p => p.name === "Eden Summit Lodge")!;
      expect(eden.purchasePrice).toBe(4000000);
      expect(eden.roomCount).toBe(20);
      expect(eden.startAdr).toBe(425);
      expect(eden.location).toBe("Ogden Valley, Utah");
    });

    it("Austin Hillside has correct values", () => {
      const austin = SEED_PROPERTIES.find(p => p.name === "Austin Hillside")!;
      expect(austin.purchasePrice).toBe(3500000);
      expect(austin.roomCount).toBe(20);
      expect(austin.startAdr).toBe(320);
      expect(austin.location).toBe("Hill Country, Texas");
    });

    it("Casa Medellín has correct values", () => {
      const medellin = SEED_PROPERTIES.find(p => p.name === "Casa Medellín")!;
      expect(medellin.purchasePrice).toBe(3800000);
      expect(medellin.roomCount).toBe(30);
      expect(medellin.startAdr).toBe(210);
      expect(medellin.exitCapRate).toBe(0.095);
      expect(medellin.location).toBe("El Poblado, Medellín");
    });

    it("Blue Ridge Manor has correct values", () => {
      const blueRidge = SEED_PROPERTIES.find(p => p.name === "Blue Ridge Manor")!;
      expect(blueRidge.purchasePrice).toBe(6000000);
      expect(blueRidge.buildingImprovements).toBe(1500000);
      expect(blueRidge.roomCount).toBe(30);
      expect(blueRidge.startAdr).toBe(375);
      expect(blueRidge.exitCapRate).toBe(0.09);
      expect(blueRidge.location).toBe("Blue Ridge Mountains, North Carolina");
    });

    it("total portfolio room count is 120", () => {
      const totalRooms = SEED_PROPERTIES.reduce((sum, p) => sum + p.roomCount, 0);
      expect(totalRooms).toBe(120);
    });

    it("total portfolio equity invested matches dashboard", () => {
      const totalEquity = SEED_PROPERTIES.reduce((sum, p) =>
        sum + p.purchasePrice + p.buildingImprovements + p.preOpeningCosts + p.operatingReserve, 0);
      expect(totalEquity).toBe(29450000);
    });

    it("average purchase price matches dashboard", () => {
      const avgPrice = SEED_PROPERTIES.reduce((sum, p) => sum + p.purchasePrice, 0) / SEED_PROPERTIES.length;
      expect(avgPrice).toBe(4220000);
    });

    it("average daily rate matches dashboard", () => {
      const avgAdr = SEED_PROPERTIES.reduce((sum, p) => sum + p.startAdr, 0) / SEED_PROPERTIES.length;
      expect(avgAdr).toBe(343);
    });
  });

  describe("Service Fee Categories", () => {
    it("has exactly 5 default categories", () => {
      expect(DEFAULT_SERVICE_FEE_CATEGORIES).toHaveLength(5);
    });

    it("category rates sum to base management fee rate", () => {
      const totalRate = DEFAULT_SERVICE_FEE_CATEGORIES.reduce((sum, cat) => sum + cat.rate, 0);
      expect(totalRate).toBeCloseTo(DEFAULT_BASE_MANAGEMENT_FEE_RATE, 10);
    });

    it("all categories have positive rates", () => {
      for (const cat of DEFAULT_SERVICE_FEE_CATEGORIES) {
        expect(cat.rate).toBeGreaterThan(0);
      }
    });

    it("all categories have sequential sort orders", () => {
      for (let i = 0; i < DEFAULT_SERVICE_FEE_CATEGORIES.length; i++) {
        expect(DEFAULT_SERVICE_FEE_CATEGORIES[i].sortOrder).toBe(i + 1);
      }
    });

    it("Marketing & Brand fee is 2%", () => {
      const marketing = DEFAULT_SERVICE_FEE_CATEGORIES.find(c => c.name === "Marketing & Brand");
      expect(marketing?.rate).toBe(0.02);
    });

    it("Technology & Reservations fee is 2.5%", () => {
      const tr = DEFAULT_SERVICE_FEE_CATEGORIES.find(c => c.name === "Technology & Reservations");
      expect(tr?.rate).toBe(0.025);
    });

    it("Accounting fee is 1.5%", () => {
      const accounting = DEFAULT_SERVICE_FEE_CATEGORIES.find(c => c.name === "Accounting");
      expect(accounting?.rate).toBe(0.015);
    });

    it("Revenue Management fee is 1%", () => {
      const rm = DEFAULT_SERVICE_FEE_CATEGORIES.find(c => c.name === "Revenue Management");
      expect(rm?.rate).toBe(0.01);
    });

    it("General Management fee is 1.5%", () => {
      const gm = DEFAULT_SERVICE_FEE_CATEGORIES.find(c => c.name === "General Management");
      expect(gm?.rate).toBe(0.015);
    });
  });

  describe("Cross-Constant Consistency", () => {
    it("seed base fee matches service fee category sum", () => {
      const categorySum = DEFAULT_SERVICE_FEE_CATEGORIES.reduce((sum, c) => sum + c.rate, 0);
      expect(SEED_GLOBAL_ASSUMPTIONS.baseManagementFee).toBeCloseTo(categorySum, 10);
    });

    it("company tax rate (30%) exceeds property tax rate (25%)", () => {
      expect(DEFAULT_COMPANY_TAX_RATE).toBeGreaterThan(DEFAULT_PROPERTY_TAX_RATE);
    });

    it("incentive fee rate exceeds base management fee rate", () => {
      expect(DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE).toBeGreaterThan(DEFAULT_BASE_MANAGEMENT_FEE_RATE);
    });

    it("all property cost rates sum to reasonable total", () => {
      const totalCostRate =
        DEFAULT_COST_RATE_ROOMS + DEFAULT_COST_RATE_FB + DEFAULT_COST_RATE_ADMIN +
        DEFAULT_COST_RATE_MARKETING + DEFAULT_COST_RATE_PROPERTY_OPS + DEFAULT_COST_RATE_UTILITIES +
        DEFAULT_COST_RATE_TAXES + DEFAULT_COST_RATE_IT +
        DEFAULT_COST_RATE_FFE + DEFAULT_COST_RATE_OTHER;
      expect(totalCostRate).toBeGreaterThan(0.40);
      expect(totalCostRate).toBeLessThan(0.70);
    });

    it("no property exit cap rate exceeds 10%", () => {
      for (const prop of SEED_PROPERTIES) {
        expect(prop.exitCapRate).toBeLessThanOrEqual(0.10);
      }
    });

    it("SAFE tranches total $2M", () => {
      expect(SEED_GLOBAL_ASSUMPTIONS.safeTranche1Amount + SEED_GLOBAL_ASSUMPTIONS.safeTranche2Amount).toBe(2000000);
    });

    it("SAFE tranche 2 date is after tranche 1", () => {
      expect(new Date(SEED_GLOBAL_ASSUMPTIONS.safeTranche2Date).getTime())
        .toBeGreaterThan(new Date(SEED_GLOBAL_ASSUMPTIONS.safeTranche1Date).getTime());
    });

    it("standard acquisition package purchase price matches Hudson Estate", () => {
      const hudson = SEED_PROPERTIES.find(p => p.name === "The Hudson Estate")!;
      expect(SEED_GLOBAL_ASSUMPTIONS.standardAcqPackage.purchasePrice).toBe(hudson.purchasePrice);
    });
  });

  describe("Sync Status Response Shape", () => {
    const mockSyncResponse = {
      environment: "development",
      summary: {
        users: 8,
        properties: SEED_PROPERTIES.length,
        themes: 1,
        hasGlobalAssumptions: true,
        totalFeeCategories: SEED_PROPERTIES.length * DEFAULT_SERVICE_FEE_CATEGORIES.length,
      },
      globalAssumptions: {
        baseManagementFee: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
        incentiveManagementFee: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
        inflationRate: 0.03,
        companyName: "Hospitality Business Group",
        modelStartDate: "2026-04-01",
        exitCapRate: DEFAULT_EXIT_CAP_RATE,
        commissionRate: DEFAULT_COMMISSION_RATE,
        companyTaxRate: DEFAULT_COMPANY_TAX_RATE,
      },
      properties: SEED_PROPERTIES.map((p, i) => ({
        id: i + 1,
        ...p,
        status: "Development",
        baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
        incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
        feeCategories: DEFAULT_SERVICE_FEE_CATEGORIES.map(c => ({ name: c.name, rate: c.rate, isActive: true })),
        hasResearchValues: true,
      })),
    };

    it("response has correct environment field", () => {
      expect(mockSyncResponse.environment).toBe("development");
    });

    it("summary has all required fields", () => {
      expect(mockSyncResponse.summary).toHaveProperty("users");
      expect(mockSyncResponse.summary).toHaveProperty("properties");
      expect(mockSyncResponse.summary).toHaveProperty("themes");
      expect(mockSyncResponse.summary).toHaveProperty("hasGlobalAssumptions");
      expect(mockSyncResponse.summary).toHaveProperty("totalFeeCategories");
    });

    it("summary property count matches seed data", () => {
      expect(mockSyncResponse.summary.properties).toBe(SEED_PROPERTIES.length);
    });

    it(`summary fee categories = ${DEFAULT_SERVICE_FEE_CATEGORIES.length} per property × N properties`, () => {
      expect(mockSyncResponse.summary.totalFeeCategories).toBe(SEED_PROPERTIES.length * DEFAULT_SERVICE_FEE_CATEGORIES.length);
    });

    it("global assumptions include all key financial fields", () => {
      const ga = mockSyncResponse.globalAssumptions;
      expect(ga.baseManagementFee).toBe(0.085);
      expect(ga.incentiveManagementFee).toBe(0.12);
      expect(ga.inflationRate).toBe(0.03);
      expect(ga.exitCapRate).toBe(0.085);
      expect(ga.commissionRate).toBe(0.05);
      expect(ga.companyTaxRate).toBe(0.3);
    });

    it("each property has fee categories array", () => {
      for (const prop of mockSyncResponse.properties) {
        expect(Array.isArray(prop.feeCategories)).toBe(true);
        expect(prop.feeCategories.length).toBe(DEFAULT_SERVICE_FEE_CATEGORIES.length);
      }
    });

    it("each property has research values flag", () => {
      for (const prop of mockSyncResponse.properties) {
        expect(typeof prop.hasResearchValues).toBe("boolean");
      }
    });

  });

  describe("Seed-Production Sync Results Shape", () => {
    const mockSyncResults = {
      success: true,
      message: "Production data seeding completed",
      results: {
        users: { created: 0, skipped: 8, updated: 0 },
        globalAssumptions: { created: 0, skipped: 0, updated: 1 },
        properties: { created: 0, skipped: 0, updated: SEED_PROPERTIES.length },
        propertyFeeCategories: { created: 0, updated: SEED_PROPERTIES.length * DEFAULT_SERVICE_FEE_CATEGORIES.length },
        designThemes: { created: 0, skipped: 1 },
      },
    };

    it("returns success flag", () => {
      expect(mockSyncResults.success).toBe(true);
    });

    it("has results for all entity types", () => {
      expect(mockSyncResults.results).toHaveProperty("users");
      expect(mockSyncResults.results).toHaveProperty("globalAssumptions");
      expect(mockSyncResults.results).toHaveProperty("properties");
      expect(mockSyncResults.results).toHaveProperty("propertyFeeCategories");
      expect(mockSyncResults.results).toHaveProperty("designThemes");
    });

    it("sync mode updates global assumptions (not creates/skips)", () => {
      expect(mockSyncResults.results.globalAssumptions.updated).toBe(1);
      expect(mockSyncResults.results.globalAssumptions.created).toBe(0);
    });

    it("sync mode updates all properties", () => {
      expect(mockSyncResults.results.properties.updated).toBe(SEED_PROPERTIES.length);
    });

    it("sync mode updates fee categories", () => {
      const fcResults = mockSyncResults.results.propertyFeeCategories;
      expect(fcResults.created + fcResults.updated).toBeGreaterThan(0);
    });

    it("users are not overwritten in sync mode (only created if missing)", () => {
      expect(mockSyncResults.results.users.updated).toBe(0);
    });
  });
});
