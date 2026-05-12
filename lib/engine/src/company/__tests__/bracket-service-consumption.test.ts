import { describe, it, expect } from "vitest";
import { ICP_STR_ELIGIBLE_SERVICE_CATEGORIES } from "@norfolk/shared/constants";
import {
  computeServiceConsumptionScalars,
  bracketMixHasStrComponent,
} from "../bracket-service-consumption";
import type { IcpBracketProfile, BracketMixEntry } from "../icp-bracket-types";

const STR_CATEGORY = ICP_STR_ELIGIBLE_SERVICE_CATEGORIES[0];
const NON_STR_CATEGORY = "Technology & Reservations";
const ANOTHER_NON_STR_CATEGORY = "Accounting";

const HOTEL_BRACKET: IcpBracketProfile = {
  slug: "hotel-luxury",
  name: "Luxury Hotel",
  customerType: "hotel",
  serviceConsumptionProfile: "full",
};

const STR_BRACKET: IcpBracketProfile = {
  slug: "str-urban",
  name: "Urban STR",
  customerType: "str",
  serviceConsumptionProfile: "str_only",
};

const ALL_BRACKETS = [HOTEL_BRACKET, STR_BRACKET];
const ALL_CATEGORIES = [STR_CATEGORY, NON_STR_CATEGORY, ANOTHER_NON_STR_CATEGORY];

describe("computeServiceConsumptionScalars()", () => {
  describe("'full' profile (hotel brackets)", () => {
    it("returns 1.0 for every category when mix is 100% hotel", () => {
      const mix: BracketMixEntry[] = [{ bracketSlug: "hotel-luxury", weight: 1.0 }];
      const scalars = computeServiceConsumptionScalars(mix, ALL_BRACKETS, ALL_CATEGORIES);

      expect(scalars[STR_CATEGORY]).toBe(1.0);
      expect(scalars[NON_STR_CATEGORY]).toBe(1.0);
      expect(scalars[ANOTHER_NON_STR_CATEGORY]).toBe(1.0);
    });
  });

  describe("'str_only' profile (STR brackets)", () => {
    it("returns 1.0 only for STR-eligible categories, 0.0 otherwise", () => {
      const mix: BracketMixEntry[] = [{ bracketSlug: "str-urban", weight: 1.0 }];
      const scalars = computeServiceConsumptionScalars(mix, ALL_BRACKETS, ALL_CATEGORIES);

      expect(scalars[STR_CATEGORY]).toBe(1.0);
      expect(scalars[NON_STR_CATEGORY]).toBe(0.0);
      expect(scalars[ANOTHER_NON_STR_CATEGORY]).toBe(0.0);
    });
  });

  describe("mixed weights (hotel + STR)", () => {
    it("computes per-category weighted scalar correctly", () => {
      const mix: BracketMixEntry[] = [
        { bracketSlug: "hotel-luxury", weight: 0.7 },
        { bracketSlug: "str-urban", weight: 0.3 },
      ];
      const scalars = computeServiceConsumptionScalars(mix, ALL_BRACKETS, ALL_CATEGORIES);

      // STR-eligible category: both bracket types consume it → 0.7 + 0.3 = 1.0
      expect(scalars[STR_CATEGORY]).toBeCloseTo(1.0, 10);
      // Non-STR category: only hotel consumes it → 0.7
      expect(scalars[NON_STR_CATEGORY]).toBeCloseTo(0.7, 10);
      expect(scalars[ANOTHER_NON_STR_CATEGORY]).toBeCloseTo(0.7, 10);
    });

    it("handles 50/50 split with non-STR scaled to 0.5", () => {
      const mix: BracketMixEntry[] = [
        { bracketSlug: "hotel-luxury", weight: 0.5 },
        { bracketSlug: "str-urban", weight: 0.5 },
      ];
      const scalars = computeServiceConsumptionScalars(mix, ALL_BRACKETS, ALL_CATEGORIES);

      expect(scalars[STR_CATEGORY]).toBeCloseTo(1.0, 10);
      expect(scalars[NON_STR_CATEGORY]).toBeCloseTo(0.5, 10);
    });
  });

  describe("empty mix", () => {
    it("returns zero for every category", () => {
      const scalars = computeServiceConsumptionScalars([], ALL_BRACKETS, ALL_CATEGORIES);
      expect(scalars[STR_CATEGORY]).toBe(0);
      expect(scalars[NON_STR_CATEGORY]).toBe(0);
      expect(scalars[ANOTHER_NON_STR_CATEGORY]).toBe(0);
    });

    it("returns the requested categories even when no brackets supplied", () => {
      const mix: BracketMixEntry[] = [{ bracketSlug: "hotel-luxury", weight: 1.0 }];
      const scalars = computeServiceConsumptionScalars(mix, [], ALL_CATEGORIES);
      expect(Object.keys(scalars).sort()).toEqual([...ALL_CATEGORIES].sort());
      for (const c of ALL_CATEGORIES) expect(scalars[c]).toBe(0);
    });
  });

  describe("unknown bracket slug", () => {
    it("skips entries whose slug is not in the catalog", () => {
      const mix: BracketMixEntry[] = [
        { bracketSlug: "hotel-luxury", weight: 0.6 },
        { bracketSlug: "does-not-exist", weight: 0.4 },
      ];
      const scalars = computeServiceConsumptionScalars(mix, ALL_BRACKETS, ALL_CATEGORIES);

      // Only the hotel entry contributes; unknown slug is silently skipped.
      expect(scalars[STR_CATEGORY]).toBeCloseTo(0.6, 10);
      expect(scalars[NON_STR_CATEGORY]).toBeCloseTo(0.6, 10);
    });

    it("returns all-zero scalars when every slug is unknown", () => {
      const mix: BracketMixEntry[] = [{ bracketSlug: "ghost", weight: 1.0 }];
      const scalars = computeServiceConsumptionScalars(mix, ALL_BRACKETS, ALL_CATEGORIES);
      expect(scalars[STR_CATEGORY]).toBe(0);
      expect(scalars[NON_STR_CATEGORY]).toBe(0);
    });
  });

  describe("weight <= 0 entries", () => {
    it("skips zero-weight entries", () => {
      const mix: BracketMixEntry[] = [
        { bracketSlug: "hotel-luxury", weight: 1.0 },
        { bracketSlug: "str-urban", weight: 0 },
      ];
      const scalars = computeServiceConsumptionScalars(mix, ALL_BRACKETS, ALL_CATEGORIES);
      expect(scalars[NON_STR_CATEGORY]).toBe(1.0);
    });
  });

  describe("category filter", () => {
    it("only returns the requested categories (no extras)", () => {
      const mix: BracketMixEntry[] = [{ bracketSlug: "hotel-luxury", weight: 1.0 }];
      const scalars = computeServiceConsumptionScalars(mix, ALL_BRACKETS, [NON_STR_CATEGORY]);
      expect(Object.keys(scalars)).toEqual([NON_STR_CATEGORY]);
      expect(scalars[NON_STR_CATEGORY]).toBe(1.0);
    });
  });
});

describe("bracketMixHasStrComponent()", () => {
  it("returns true when any STR bracket has positive weight", () => {
    const mix: BracketMixEntry[] = [
      { bracketSlug: "hotel-luxury", weight: 0.9 },
      { bracketSlug: "str-urban", weight: 0.1 },
    ];
    expect(bracketMixHasStrComponent(mix, ALL_BRACKETS)).toBe(true);
  });

  it("returns false for a pure-hotel mix", () => {
    const mix: BracketMixEntry[] = [{ bracketSlug: "hotel-luxury", weight: 1.0 }];
    expect(bracketMixHasStrComponent(mix, ALL_BRACKETS)).toBe(false);
  });

  it("returns false when STR bracket has zero weight", () => {
    const mix: BracketMixEntry[] = [
      { bracketSlug: "hotel-luxury", weight: 1.0 },
      { bracketSlug: "str-urban", weight: 0 },
    ];
    expect(bracketMixHasStrComponent(mix, ALL_BRACKETS)).toBe(false);
  });

  it("returns false for an empty mix", () => {
    expect(bracketMixHasStrComponent([], ALL_BRACKETS)).toBe(false);
  });

  it("returns false when bracket slug is not in catalog", () => {
    const mix: BracketMixEntry[] = [{ bracketSlug: "ghost", weight: 1.0 }];
    expect(bracketMixHasStrComponent(mix, ALL_BRACKETS)).toBe(false);
  });
});
