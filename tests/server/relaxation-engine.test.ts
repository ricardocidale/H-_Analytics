import { describe, it, expect } from "vitest";
import { ComparableQueryBuilder, type RelaxLevel } from "../../server/ai/comparables/query-builder";
import type { PropertyContextPack } from "../../server/ai/context-pack/types";

function makePack(overrides: Partial<{
  starRating: number | null;
  hospitalityType: string;
  roomCount: number;
  startAdr: number;
  city: string | null;
  stateProvince: string | null;
  country: string | null;
  hasFB: boolean;
  hasEvents: boolean;
  hasWellness: boolean;
}> = {}): PropertyContextPack {
  const o = {
    starRating: 4,
    hospitalityType: "boutique_hotel",
    roomCount: 20,
    startAdr: 350,
    city: "Miami",
    stateProvince: "Florida",
    country: "US",
    hasFB: true,
    hasEvents: false,
    hasWellness: true,
    ...overrides,
  };
  return {
    identity: { id: 1, name: "Test Hotel", description: null, stableKey: "test-hotel" },
    location: {
      display: `${o.city}, ${o.stateProvince}`,
      streetAddress: null,
      city: o.city,
      stateProvince: o.stateProvince,
      zipPostalCode: null,
      country: o.country,
      market: null,
      latitude: null,
      longitude: null,
    },
    classification: {
      starRating: o.starRating,
      starRatingSource: "manual",
      starRatingSuggested: null,
      hospitalityType: o.hospitalityType,
      compositeLabel: "test",
    },
    physicalCharacter: { roomCount: o.roomCount, narrative: `${o.roomCount}-room property` },
    amenityProfile: { hasFB: o.hasFB, hasEvents: o.hasEvents, hasWellness: o.hasWellness, narrative: "test" },
    revenueProfile: {
      startAdr: o.startAdr,
      adrGrowthRate: 0.03,
      startOccupancy: 0.60,
      maxOccupancy: 0.85,
      occupancyRampMonths: 6,
      occupancyGrowthStep: 0.05,
      revShareEvents: o.hasEvents ? 0.1 : null,
      revShareFB: o.hasFB ? 0.3 : null,
      revShareOther: null,
      cateringBoostPercent: null,
      narrative: "test",
    },
    costProfile: {
      costRateRooms: 0.25, costRateFB: 0.35, costRateAdmin: 0.08,
      costRateMarketing: null, costRatePropertyOps: null, costRateUtilities: null,
      costRateTaxes: null, costRateIT: null, costRateFFE: null,
      costRateOther: null, costRateInsurance: null, narrative: "test",
    },
    capitalStructure: {
      purchasePrice: 5000000, buildingImprovements: null, landValuePercent: 0.20,
      type: null, acquisitionLTV: 0.65, acquisitionInterestRate: 0.055,
      acquisitionTermYears: 25, exitCapRate: 0.075, taxRate: 0.25,
      dispositionCommission: 0.02, costSegEnabled: null, depreciationYears: 27.5,
      narrative: "test",
    },
    icpAlignment: { matchScore: 0, matchDetails: [], narrative: "No ICP configured" },
    currentAssumptionsSummary: "test",
    fullNarrative: "Test hotel narrative",
  };
}

describe("ComparableQueryBuilder", () => {
  describe("star ±1 hard constraint", () => {
    it("L0 and L1 use star ±0 (exact match)", () => {
      const builder = new ComparableQueryBuilder(makePack({ starRating: 4 }));
      const l0 = builder.build(0);
      expect(l0.starMin).toBe(4);
      expect(l0.starMax).toBe(4);
      const l1 = builder.build(1);
      expect(l1.starMin).toBe(4);
      expect(l1.starMax).toBe(4);
    });

    it("L2-L5 use star ±1 (never ±2)", () => {
      const builder = new ComparableQueryBuilder(makePack({ starRating: 3 }));
      for (const level of [2, 3, 4, 5] as RelaxLevel[]) {
        const criteria = builder.build(level);
        expect(criteria.starMin).toBe(2);
        expect(criteria.starMax).toBe(4);
      }
    });

    it("5-star property never matches below 4-star", () => {
      const builder = new ComparableQueryBuilder(makePack({ starRating: 5 }));
      for (const level of [0, 1, 2, 3, 4, 5] as RelaxLevel[]) {
        const criteria = builder.build(level);
        expect(criteria.starMin).toBeGreaterThanOrEqual(4);
        expect(criteria.starMax).toBe(5);
      }
    });

    it("1-star property never matches above 2-star", () => {
      const builder = new ComparableQueryBuilder(makePack({ starRating: 1 }));
      for (const level of [0, 1, 2, 3, 4, 5] as RelaxLevel[]) {
        const criteria = builder.build(level);
        expect(criteria.starMin).toBe(1);
        expect(criteria.starMax).toBeLessThanOrEqual(2);
      }
    });

    it("null star rating produces null bounds at all levels", () => {
      const builder = new ComparableQueryBuilder(makePack({ starRating: null }));
      for (const level of [0, 1, 2, 3, 4, 5] as RelaxLevel[]) {
        const criteria = builder.build(level);
        expect(criteria.starMin).toBeNull();
        expect(criteria.starMax).toBeNull();
      }
    });
  });

  describe("relaxation progression", () => {
    it("L0 is most restrictive — exact type, city, all amenities", () => {
      const builder = new ComparableQueryBuilder(makePack());
      const l0 = builder.build(0);
      expect(l0.typeMode).toBe("exact");
      expect(l0.geoMode).toBe("city");
      expect(l0.amenityMode).toBe("must+major+nice");
      expect(l0.relaxed).toEqual([]);
    });

    it("L1 drops nice amenities only", () => {
      const builder = new ComparableQueryBuilder(makePack());
      const l1 = builder.build(1);
      expect(l1.typeMode).toBe("exact");
      expect(l1.geoMode).toBe("city");
      expect(l1.amenityMode).toBe("must+major");
      expect(l1.niceAmenities).toEqual([]);
      expect(l1.relaxed).toContain("niceAmenities");
    });

    it("L2 widens to type family, MSA, size±40%, ADR range", () => {
      const builder = new ComparableQueryBuilder(makePack());
      const l2 = builder.build(2);
      expect(l2.typeMode).toBe("family");
      expect(l2.geoMode).toBe("msa");
      expect(l2.sizeRange).not.toBeNull();
      expect(l2.adrRange).not.toBeNull();
    });

    it("L3 goes any type, MSA, must amenities only", () => {
      const builder = new ComparableQueryBuilder(makePack());
      const l3 = builder.build(3);
      expect(l3.typeMode).toBe("any");
      expect(l3.geoMode).toBe("msa");
      expect(l3.amenityMode).toBe("must");
      expect(l3.sizeRange).toBeNull();
      expect(l3.adrRange).toBeNull();
    });

    it("L4 expands to state-level geo", () => {
      const builder = new ComparableQueryBuilder(makePack());
      const l4 = builder.build(4);
      expect(l4.geoMode).toBe("state");
    });

    it("L5 expands to country with size bucket", () => {
      const builder = new ComparableQueryBuilder(makePack());
      const l5 = builder.build(5);
      expect(l5.geoMode).toBe("country");
      expect(l5.sizeRange).not.toBeNull();
    });

    it("buildAll returns criteria for all levels 0-5", () => {
      const builder = new ComparableQueryBuilder(makePack());
      const all = builder.buildAll();
      expect(all).toHaveLength(6);
      all.forEach((c, i) => expect(c.level).toBe(i));
    });
  });

  describe("type family grouping", () => {
    it("boutique_hotel is in hotel family", () => {
      const builder = new ComparableQueryBuilder(makePack({ hospitalityType: "boutique_hotel" }));
      const l2 = builder.build(2);
      expect(l2.allowedTypes).toContain("hotel");
      expect(l2.allowedTypes).toContain("boutique_hotel");
      expect(l2.allowedTypes).toContain("business_hotel");
    });

    it("wellness_resort is in resort family", () => {
      const builder = new ComparableQueryBuilder(makePack({ hospitalityType: "wellness_resort" }));
      const l2 = builder.build(2);
      expect(l2.allowedTypes).toContain("resort");
      expect(l2.allowedTypes).toContain("wellness_resort");
      expect(l2.allowedTypes).not.toContain("hotel");
    });

    it("L3+ allows all types", () => {
      const builder = new ComparableQueryBuilder(makePack());
      const l3 = builder.build(3);
      expect(l3.allowedTypes.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe("size and ADR ranges", () => {
    it("L0 size range is ±20% of room count", () => {
      const builder = new ComparableQueryBuilder(makePack({ roomCount: 100 }));
      const l0 = builder.build(0);
      expect(l0.sizeRange).toEqual([80, 120]);
    });

    it("L2 size range is ±40% of room count", () => {
      const builder = new ComparableQueryBuilder(makePack({ roomCount: 50 }));
      const l2 = builder.build(2);
      expect(l2.sizeRange).toEqual([30, 70]);
    });

    it("L2 ADR range is ±30%", () => {
      const builder = new ComparableQueryBuilder(makePack({ startAdr: 400 }));
      const l2 = builder.build(2);
      expect(l2.adrRange).toEqual([280, 520]);
    });

    it("L5 uses coarse size buckets", () => {
      const small = new ComparableQueryBuilder(makePack({ roomCount: 10 }));
      expect(small.build(5).sizeRange).toEqual([1, 25]);

      const mid = new ComparableQueryBuilder(makePack({ roomCount: 40 }));
      expect(mid.build(5).sizeRange).toEqual([10, 80]);

      const large = new ComparableQueryBuilder(makePack({ roomCount: 100 }));
      expect(large.build(5).sizeRange).toEqual([30, 200]);
    });
  });
});
