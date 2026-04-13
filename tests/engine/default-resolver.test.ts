import { describe, it, expect } from "vitest";
import { computePropertyDefaults, PropertyDefaults } from "../../engine/helpers/default-resolver.js";
import { BUSINESS_MODEL_DEFAULTS } from "../../shared/constants-business-models.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All six quality tiers in descending ADR order. */
const ALL_TIERS = [
  "Luxury",
  "Upper Upscale",
  "Upscale",
  "Upper Midscale",
  "Midscale",
  "Economy",
] as const;

/** All business models. */
const ALL_MODELS = ["hotel", "lodge", "vrbo"] as const;

// ---------------------------------------------------------------------------
// 1. Luxury hotel, US, 10 rooms
// ---------------------------------------------------------------------------
describe("computePropertyDefaults", () => {
  describe("Luxury hotel, US, 10 rooms", () => {
    const d = computePropertyDefaults("Luxury", "hotel", "United States", 10);

    it("ADR should be $400", () => {
      expect(d.startAdr).toBe(400);
    });

    it("occupancy should be 70%", () => {
      expect(d.startOccupancy).toBe(0.70);
    });

    it("depreciation should be 39 years (US IRS)", () => {
      expect(d.depreciationYears).toBe(39);
    });

    it("income tax rate should be 21% (federal only)", () => {
      expect(d.incomeTaxRate).toBe(0.21);
    });

    it("revenue shares match hotel model defaults", () => {
      expect(d.revShareFB).toBe(BUSINESS_MODEL_DEFAULTS.hotel.revShareFB);
      expect(d.revShareEvents).toBe(BUSINESS_MODEL_DEFAULTS.hotel.revShareEvents);
      expect(d.revShareOther).toBe(BUSINESS_MODEL_DEFAULTS.hotel.revShareOther);
    });

    it("cost rates include +2% scale adjustment for 10-19 rooms", () => {
      expect(d.costRateRooms).toBeCloseTo(
        BUSINESS_MODEL_DEFAULTS.hotel.costRateRooms + 0.02,
        6,
      );
      expect(d.costRateAdmin).toBeCloseTo(
        BUSINESS_MODEL_DEFAULTS.hotel.costRateAdmin + 0.02,
        6,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Economy hotel, US, 5 rooms
  // ---------------------------------------------------------------------------
  describe("Economy hotel, US, 5 rooms", () => {
    const d = computePropertyDefaults("Economy", "hotel", "United States", 5);

    it("ADR should be $80", () => {
      expect(d.startAdr).toBe(80);
    });

    it("occupancy should be 65%", () => {
      expect(d.startOccupancy).toBe(0.65);
    });

    it("cost rates include +5% small property penalty (<10 rooms)", () => {
      expect(d.costRateRooms).toBeCloseTo(
        BUSINESS_MODEL_DEFAULTS.hotel.costRateRooms + 0.05,
        6,
      );
      expect(d.costRateFB).toBeCloseTo(
        BUSINESS_MODEL_DEFAULTS.hotel.costRateFB + 0.05,
        6,
      );
      expect(d.costRateFFE).toBeCloseTo(
        BUSINESS_MODEL_DEFAULTS.hotel.costRateFFE + 0.05,
        6,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Luxury VRBO, Colombia
  // ---------------------------------------------------------------------------
  describe("Luxury VRBO, Colombia", () => {
    const d = computePropertyDefaults("Luxury", "vrbo", "Colombia", 1);

    it("revenue shares match VRBO model", () => {
      expect(d.revShareFB).toBe(BUSINESS_MODEL_DEFAULTS.vrbo.revShareFB);
      expect(d.revShareEvents).toBe(BUSINESS_MODEL_DEFAULTS.vrbo.revShareEvents);
      expect(d.revShareOther).toBe(BUSINESS_MODEL_DEFAULTS.vrbo.revShareOther);
    });

    it("income tax rate should be 35% (Colombia)", () => {
      expect(d.incomeTaxRate).toBe(0.35);
    });

    it("depreciation should be 20 years (Colombia)", () => {
      expect(d.depreciationYears).toBe(20);
    });

    it("country risk premium is reflected in source", () => {
      expect(d.sources.incomeTaxRate).toContain("Colombia");
      expect(d.sources.depreciationYears).toContain("Colombia");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Upscale hotel, UK, 15 rooms
  // ---------------------------------------------------------------------------
  describe("Upscale hotel, UK, 15 rooms", () => {
    const d = computePropertyDefaults("Upscale", "hotel", "United Kingdom", 15);

    it("income tax rate should be 25% (UK)", () => {
      expect(d.incomeTaxRate).toBe(0.25);
    });

    it("depreciation should be 50 years (UK SBA)", () => {
      expect(d.depreciationYears).toBe(50);
    });

    it("cost rates include +2% adjustment for 10-19 rooms", () => {
      expect(d.costRateRooms).toBeCloseTo(
        BUSINESS_MODEL_DEFAULTS.hotel.costRateRooms + 0.02,
        6,
      );
    });

    it("ADR is Upscale default ($220)", () => {
      expect(d.startAdr).toBe(220);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Midscale hotel, Mexico
  // ---------------------------------------------------------------------------
  describe("Midscale hotel, Mexico", () => {
    const d = computePropertyDefaults("Midscale", "hotel", "Mexico", 20);

    it("income tax rate should be 30% (Mexico)", () => {
      expect(d.incomeTaxRate).toBe(0.30);
    });

    it("depreciation should be 20 years (Mexico)", () => {
      expect(d.depreciationYears).toBe(20);
    });

    it("no scale adjustment for 20+ rooms", () => {
      expect(d.costRateRooms).toBe(BUSINESS_MODEL_DEFAULTS.hotel.costRateRooms);
    });

    it("ADR is Midscale default ($120)", () => {
      expect(d.startAdr).toBe(120);
    });

    it("occupancy is Midscale default (65%)", () => {
      expect(d.startOccupancy).toBe(0.65);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. All quality tiers produce different ADR (decreasing Luxury -> Economy)
  // ---------------------------------------------------------------------------
  describe("All quality tiers produce decreasing ADR from Luxury to Economy", () => {
    const adrs = ALL_TIERS.map((tier) =>
      computePropertyDefaults(tier, "hotel", "United States", 20).startAdr,
    );

    it("should produce 6 distinct ADR values", () => {
      const unique = new Set(adrs);
      expect(unique.size).toBe(6);
    });

    it("each tier ADR is strictly greater than the next", () => {
      for (let i = 0; i < adrs.length - 1; i++) {
        expect(adrs[i]).toBeGreaterThan(adrs[i + 1]);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Sources map is populated for every returned field
  // ---------------------------------------------------------------------------
  describe("Sources map is populated", () => {
    const d = computePropertyDefaults("Luxury", "hotel", "United States", 10);

    it("every non-source field has a corresponding source entry", () => {
      const fieldKeys = Object.keys(d).filter((k) => k !== "sources");
      for (const key of fieldKeys) {
        expect(d.sources).toHaveProperty(key);
        expect(d.sources[key]).toBeTruthy();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Revenue shares sum < 1 for all business models
  // ---------------------------------------------------------------------------
  describe("Revenue shares sum < 1 (room share must be positive)", () => {
    for (const model of ALL_MODELS) {
      it(`${model}: revShareFB + revShareEvents + revShareOther < 1`, () => {
        const d = computePropertyDefaults("Upscale", model, "United States", 20);
        const ancillarySum = d.revShareFB + d.revShareEvents + d.revShareOther;
        expect(ancillarySum).toBeLessThan(1);
        // Room share must be at least 5%
        expect(1 - ancillarySum).toBeGreaterThanOrEqual(0.05);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 9. Unknown country falls back gracefully
  // ---------------------------------------------------------------------------
  describe("Unknown country falls back", () => {
    const d = computePropertyDefaults("Upscale", "hotel", "XX", 20);

    it("uses fallback income tax rate (0.25)", () => {
      expect(d.incomeTaxRate).toBe(0.25);
    });

    it("uses fallback depreciation years (39 from constants)", () => {
      expect(d.depreciationYears).toBe(39);
    });

    it("sources indicate fallback", () => {
      expect(d.sources.incomeTaxRate).toContain("fallback");
      expect(d.sources.depreciationYears).toContain("fallback");
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Room count scale adjustments
  // ---------------------------------------------------------------------------
  describe("Room count scale adjustments", () => {
    const small = computePropertyDefaults("Upscale", "hotel", "United States", 5);
    const large = computePropertyDefaults("Upscale", "hotel", "United States", 25);

    it("5 rooms has higher cost rates than 25 rooms", () => {
      expect(small.costRateRooms).toBeGreaterThan(large.costRateRooms);
      expect(small.costRateFB).toBeGreaterThan(large.costRateFB);
      expect(small.costRateAdmin).toBeGreaterThan(large.costRateAdmin);
      expect(small.costRateMarketing).toBeGreaterThan(large.costRateMarketing);
      expect(small.costRatePropertyOps).toBeGreaterThan(large.costRatePropertyOps);
      expect(small.costRateUtilities).toBeGreaterThan(large.costRateUtilities);
      expect(small.costRateIT).toBeGreaterThan(large.costRateIT);
      expect(small.costRateFFE).toBeGreaterThan(large.costRateFFE);
    });

    it("5 rooms penalty is +5% above base", () => {
      expect(small.costRateRooms - large.costRateRooms).toBeCloseTo(0.05, 6);
    });

    it("sources reflect scale adjustment for small property", () => {
      expect(small.sources.costRateRooms).toContain("scale");
      expect(small.sources.costRateRooms).toContain("+5pct");
    });

    it("large property has no scale adjustment in sources", () => {
      expect(large.sources.costRateRooms).not.toContain("scale:");
    });
  });
});
