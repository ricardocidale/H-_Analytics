import { describe, it, expect } from "vitest";
import { extractResearchValues } from "../../server/ai/research-value-extractor";
import { validateResearchValues } from "../../calc/research/validate-research";
import { buildPropertyContextPack } from "../../server/ai/context-pack/property-pack";
import { assembleResearchPrompt } from "../../server/ai/prompt/assemble-research-prompt";

const baseProperty = {
  id: 1,
  userId: 1,
  name: "Test Property",
  stableKey: "test-property",
  location: "Miami, Florida, US",
  streetAddress: null,
  city: "Miami",
  stateProvince: "Florida",
  zipPostalCode: null,
  country: "US",
  market: "South Florida",
  latitude: null,
  longitude: null,
  roomCount: 20,
  startAdr: 350,
  adrGrowthRate: 0.03,
  startOccupancy: 0.60,
  maxOccupancy: 0.85,
  occupancyRampMonths: 6,
  occupancyGrowthStep: 0.05,
  costRateRooms: 0.25,
  costRateFB: 0.35,
  costRateAdmin: 0.08,
  costRateMarketing: 0.04,
  costRatePropertyOps: 0.05,
  costRateUtilities: 0.03,
  costRateTaxes: 0.02,
  costRateIT: 0.01,
  costRateFFE: 0.04,
  costRateOther: 0.02,
  costRateInsurance: 0.015,
  purchasePrice: 5000000,
  buildingImprovements: null,
  landValuePercent: 0.20,
  type: "acquisition",
  acquisitionLTV: 0.65,
  acquisitionInterestRate: 0.055,
  acquisitionTermYears: 25,
  acquisitionClosingCostRate: null,
  exitCapRate: 0.075,
  taxRate: 0.25,
  dispositionCommission: 0.02,
  costSegEnabled: false,
  depreciationYears: 27.5,
  willRefinance: "no",
  refinanceLTV: null,
  refinanceInterestRate: null,
  refinanceTermYears: null,
  refinanceClosingCostRate: null,
  refinanceYearsAfterAcquisition: null,
  starRating: 4,
  starRatingSource: "manual",
  starRatingSuggested: null,
  hospitalityType: "boutique_hotel",
  businessModel: "hotel",
  description: "A luxury boutique hotel with spa and fine dining",
  revShareFB: 0.30,
  revShareEvents: 0.10,
  revShareOther: 0.05,
  cateringBoostPercent: 0,
  imageUrl: "",
  status: "active",
  acquisitionDate: "2025-01-01",
  operationsStartDate: "2025-03-01",
  preOpeningCosts: 50000,
  operatingReserve: 100000,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  baseManagementFeeRate: 0.03,
  incentiveManagementFeeRate: 0.10,
  arDays: 30,
  apDays: 45,
  reinvestmentRate: 0.08,
  dayCountConvention: "30/360",
  escalationMethod: "annual",
  costSeg5yrPct: 0.15,
  costSeg7yrPct: 0.10,
  costSeg15yrPct: 0.20,
  inflationRate: null,
  countryRiskPremium: null,
  refinanceDate: null,
  researchValues: null,
  sourceUrls: null,
  lastAssumptionChangeAt: null,
  stabilizationMonths: 6,
} as any;

describe("Research Calibration", () => {
  describe("T001: Business-model-aware prompts", () => {
    it("hotel prompt includes USALI context", () => {
      const pack = buildPropertyContextPack(
        { ...baseProperty, businessModel: "hotel" },
        null,
        null,
      );
      const prompt = assembleResearchPrompt(pack, { tier: 1, entityType: "property" });
      expect(prompt).toContain("USALI");
      expect(prompt).toContain("Hotel (Traditional)");
      expect(prompt).toContain("Revenue Departments");
    });

    it("VRBO prompt includes platform fee and STR context", () => {
      const pack = buildPropertyContextPack(
        { ...baseProperty, businessModel: "vrbo" },
        null,
        null,
      );
      const prompt = assembleResearchPrompt(pack, { tier: 1, entityType: "property" });
      expect(prompt).toContain("VRBO / Short-Term Rental");
      expect(prompt).toContain("Platform Economics");
      expect(prompt).toContain("Cleaning Turnover");
      expect(prompt).toContain("AirDNA");
    });

    it("lodge prompt includes whole-property rental context", () => {
      const pack = buildPropertyContextPack(
        { ...baseProperty, businessModel: "lodge" },
        null,
        null,
      );
      const prompt = assembleResearchPrompt(pack, { tier: 1, entityType: "property" });
      expect(prompt).toContain("Lodge / Whole-Property Rental");
      expect(prompt).toContain("Guest Meals");
      expect(prompt).toContain("Extreme seasonality");
    });

    it("context pack classification includes businessModel", () => {
      const packHotel = buildPropertyContextPack(
        { ...baseProperty, businessModel: "hotel" },
        null,
        null,
      );
      expect(packHotel.classification.businessModel).toBe("hotel");

      const packVrbo = buildPropertyContextPack(
        { ...baseProperty, businessModel: "vrbo" },
        null,
        null,
      );
      expect(packVrbo.classification.businessModel).toBe("vrbo");
    });

    it("prompt includes Business Model line in classification", () => {
      const pack = buildPropertyContextPack(
        { ...baseProperty, businessModel: "vrbo" },
        null,
        null,
      );
      const prompt = assembleResearchPrompt(pack, { tier: 1, entityType: "property" });
      expect(prompt).toContain("Business Model: vrbo");
    });
  });

  describe("T002: Expanded value extraction", () => {
    it("extracts cost segregation percentages", () => {
      const content = {
        adrAnalysis: { recommendedRange: "$300-$400" },
        costSegregationAnalysis: {
          fiveYearPercent: "15%",
          sevenYearPercent: "10%",
          fifteenYearPercent: "20%",
        },
      };
      const result = extractResearchValues(content);
      expect(result).not.toBeNull();
      expect(result!.costSeg5yrPct).toEqual({ display: "15%", mid: 15, source: "ai" });
      expect(result!.costSeg7yrPct).toEqual({ display: "10%", mid: 10, source: "ai" });
      expect(result!.costSeg15yrPct).toEqual({ display: "20%", mid: 20, source: "ai" });
    });

    it("extracts working capital AR/AP days", () => {
      const content = {
        adrAnalysis: { recommendedRange: "$300-$400" },
        workingCapitalAnalysis: {
          arDays: 30,
          apDays: 45,
        },
      };
      const result = extractResearchValues(content);
      expect(result).not.toBeNull();
      expect(result!.arDays).toEqual({ display: "30 days", mid: 30, source: "ai" });
      expect(result!.apDays).toEqual({ display: "45 days", mid: 45, source: "ai" });
    });

    it("extracts working capital from string values", () => {
      const content = {
        adrAnalysis: { recommendedRange: "$300-$400" },
        workingCapitalAnalysis: {
          accountsReceivableDays: "25",
          accountsPayableDays: "40",
        },
      };
      const result = extractResearchValues(content);
      expect(result).not.toBeNull();
      expect(result!.arDays!.mid).toBe(25);
      expect(result!.apDays!.mid).toBe(40);
    });

    it("extracts LTV recommendation", () => {
      const content = {
        adrAnalysis: { recommendedRange: "$300-$400" },
        capitalStructureAnalysis: {
          recommendedLTV: "65%",
        },
      };
      const result = extractResearchValues(content);
      expect(result).not.toBeNull();
      expect(result!.ltv).toEqual({ display: "65%", mid: 65, source: "ai" });
    });

    it("extracts pre-opening cost estimate", () => {
      const content = {
        adrAnalysis: { recommendedRange: "$300-$400" },
        preOpeningAnalysis: {
          estimatedCost: "$50,000-$150,000",
        },
      };
      const result = extractResearchValues(content);
      expect(result).not.toBeNull();
      expect(result!.preOpeningCosts!.mid).toBe(100000);
    });

    it("extracts platform fee for VRBO", () => {
      const content = {
        adrAnalysis: { recommendedRange: "$200-$300" },
        platformFeeAnalysis: {
          recommendedRate: "14%",
        },
      };
      const result = extractResearchValues(content);
      expect(result).not.toBeNull();
      expect(result!.platformFee).toEqual({ display: "14%", mid: 14, source: "ai" });
    });

    it("extracts cost seg from capitalStructureAnalysis fallback", () => {
      const content = {
        adrAnalysis: { recommendedRange: "$300-$400" },
        capitalStructureAnalysis: {
          costSeg5yrPct: "12%",
          costSeg7yrPct: "8%",
          costSeg15yrPct: "18%",
        },
      };
      const result = extractResearchValues(content);
      expect(result).not.toBeNull();
      expect(result!.costSeg5yrPct!.mid).toBe(12);
      expect(result!.costSeg7yrPct!.mid).toBe(8);
      expect(result!.costSeg15yrPct!.mid).toBe(18);
    });

    it("existing extraction fields still work", () => {
      const content = {
        adrAnalysis: { recommendedRange: "$400-$600", recommendedGrowthRate: "3%" },
        occupancyAnalysis: { rampUpTimeline: "initial occupancy around 55-60%, reaching stabilized occupancy of 80-85% over 12-18 months" },
        capRateAnalysis: { recommendedRange: "6-8%" },
        operatingCostAnalysis: {
          roomRevenueBased: { housekeeping: { recommendedRate: "25%" } },
          totalRevenueBased: { adminGeneral: { recommendedRate: "8%" } },
        },
      };
      const result = extractResearchValues(content);
      expect(result).not.toBeNull();
      expect(result!.adr!.mid).toBe(500);
      expect(result!.occupancy!.mid).toBe(83);
      expect(result!.capRate).toBeDefined();
      expect(result!.costHousekeeping!.mid).toBe(25);
      expect(result!.costAdmin!.mid).toBe(8);
    });
  });

  describe("T005: Business-model validation context", () => {
    it("VRBO validation uses VRBO bounds for ADR", () => {
      const vrboValues = { adr: { display: "$1400", mid: 1400, source: "ai" as const } };
      const hotelResult = validateResearchValues(vrboValues, {
        roomCount: 5,
        startAdr: 250,
        maxOccupancy: 0.75,
        businessModel: "hotel",
      });
      expect(hotelResult.values.adr?.validation?.status).toBe("pass");

      const vrboResult = validateResearchValues(vrboValues, {
        roomCount: 5,
        startAdr: 250,
        maxOccupancy: 0.75,
        businessModel: "vrbo",
      });
      expect(vrboResult.values.adr?.validation?.status).toBe("pass");
    });

    it("VRBO ADR beyond $1500 triggers warning", () => {
      const values = { adr: { display: "$1600", mid: 1600, source: "ai" as const } };
      const result = validateResearchValues(values, {
        roomCount: 5,
        startAdr: 250,
        maxOccupancy: 0.75,
        businessModel: "vrbo",
      });
      expect(result.values.adr?.validation?.status).toBe("warn");
    });

    it("lodge validation uses lodge ADR bounds", () => {
      const values = { adr: { display: "$2500", mid: 2500, source: "ai" as const } };
      const result = validateResearchValues(values, {
        roomCount: 10,
        startAdr: 500,
        maxOccupancy: 0.70,
        businessModel: "lodge",
      });
      expect(result.values.adr?.validation?.status).toBe("pass");
    });

    it("hotel validation uses hotel bounds", () => {
      const values = { adr: { display: "$1800", mid: 1800, source: "ai" as const } };
      const result = validateResearchValues(values, {
        roomCount: 50,
        startAdr: 400,
        maxOccupancy: 0.80,
        businessModel: "hotel",
      });
      expect(result.values.adr?.validation?.status).toBe("pass");
    });

    it("platform fee bounds differ by model", () => {
      const values = { platformFee: { display: "20%", mid: 20, source: "ai" as const } };

      const vrboResult = validateResearchValues(values, {
        roomCount: 5,
        startAdr: 250,
        maxOccupancy: 0.75,
        businessModel: "vrbo",
      });
      expect(vrboResult.values.platformFee?.validation?.status).toBe("pass");

      const hotelResult = validateResearchValues(values, {
        roomCount: 50,
        startAdr: 300,
        maxOccupancy: 0.80,
        businessModel: "hotel",
      });
      expect(hotelResult.values.platformFee?.validation?.status).toBe("warn");
    });

    it("ramp months bounds differ by model", () => {
      const values = { rampMonths: { display: "2 months", mid: 2, source: "ai" as const } };

      const vrboResult = validateResearchValues(values, {
        roomCount: 5,
        startAdr: 250,
        maxOccupancy: 0.75,
        businessModel: "vrbo",
      });
      expect(vrboResult.values.rampMonths?.validation?.status).toBe("pass");

      const hotelResult = validateResearchValues(values, {
        roomCount: 50,
        startAdr: 300,
        maxOccupancy: 0.80,
        businessModel: "hotel",
      });
      expect(hotelResult.values.rampMonths?.validation?.status).toBe("warn");
    });
  });

  describe("T004: Relaxation engine model awareness", () => {
    it("context pack has businessModel in classification", () => {
      const pack = buildPropertyContextPack(
        { ...baseProperty, businessModel: "vrbo" },
        null,
        null,
      );
      expect(pack.classification.businessModel).toBe("vrbo");
    });

    it("defaults businessModel to hotel when not set", () => {
      const propWithoutModel = { ...baseProperty };
      delete propWithoutModel.businessModel;
      const pack = buildPropertyContextPack(propWithoutModel, null, null);
      expect(pack.classification.businessModel).toBe("hotel");
    });
  });
});
