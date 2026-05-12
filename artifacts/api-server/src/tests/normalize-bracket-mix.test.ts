/**
 * Direct unit tests for `normalizePersistedBracketMix`.
 *
 * Task #1428 follow-up — code review asked for explicit coverage of the
 * normalizer at the persisted-shape boundary.
 *
 * Task #1486 — Both writers now emit BracketMixData. The old flat-array
 * (catalog-API) branch has been removed from the normalizer. Tests updated
 * accordingly: only the canonical BracketMixData shape is accepted.
 *
 * The engine-side test in
 * `lib/engine/src/company/__tests__/company-engine.bracket-mix.test.ts`
 * covers downstream behavior; these tests pin the contract here.
 */

import { describe, it, expect } from "vitest";

import { normalizePersistedBracketMix } from "../finance/normalize-bracket-mix";

const HOTEL_WEIGHT = 0.6;
const STR_WEIGHT = 0.4;
const MIXED_WEIGHT = 1;
const HALF = 0.5;

describe("normalizePersistedBracketMix", () => {
  describe("invalid / empty inputs", () => {
    it("returns null for null", () => {
      expect(normalizePersistedBracketMix(null)).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(normalizePersistedBracketMix(undefined)).toBeNull();
    });

    it("returns null for an empty object", () => {
      expect(normalizePersistedBracketMix({})).toBeNull();
    });
  });

    it("returns null for an object without an `entries` array", () => {
      expect(normalizePersistedBracketMix({ foo: "bar" })).toBeNull();
    });

    it("returns null for an object with empty `entries`", () => {
      expect(normalizePersistedBracketMix({ entries: [] })).toBeNull();
    });

    it("returns null for the old flat-array shape (no longer written)", () => {
      // Flat arrays were the old catalog-API format. After icp-brackets-002
      // migration they no longer appear in production, and the normalizer
      // only handles BracketMixData now.
      expect(
        normalizePersistedBracketMix([
          { bracketSlug: "boutique-luxury", weight: HOTEL_WEIGHT },
        ]),
      ).toBeNull();
    });

    it("returns null for the old flat-array shape if it contains malformed entries", () => {
      // Flat arrays were the old catalog-API format. 
      expect(
        normalizePersistedBracketMix([
          { bracketSlug: 123, weight: HOTEL_WEIGHT },
        ]),
      ).toBeNull();
    });
  });

  describe("canonical BracketMixData shape", () => {
    it("passes a hotel entry through and synthesizes a `full` profile", () => {
      const result = normalizePersistedBracketMix({
        entries: [
          {
            id: "hotel-bracket-1",
            name: "Luxury Boutique",
            serviceConsumption: "hotel",
            weight: HOTEL_WEIGHT,
          },
        ],
      });

      expect(result?.bracketMix).toEqual([
        { bracketSlug: "hotel-bracket-1", weight: HOTEL_WEIGHT },
      ]);
      expect(result?.brackets).toEqual([
        {
          slug: "hotel-bracket-1",
          name: "Luxury Boutique",
          customerType: "hotel",
          serviceConsumptionProfile: "full",
        },
      ]);
    });

    it("synthesizes a `str_only` profile for an STR entry", () => {
      const result = normalizePersistedBracketMix({
        entries: [
          {
            id: "str-bracket-1",
            name: "STR Portfolio",
            serviceConsumption: "str",
            weight: STR_WEIGHT,
          },
        ],
      });

      expect(result?.bracketMix).toEqual([
        { bracketSlug: "str-bracket-1", weight: STR_WEIGHT },
      ]);
      expect(result?.brackets).toEqual([
        {
          slug: "str-bracket-1",
          name: "STR Portfolio",
          customerType: "str",
          serviceConsumptionProfile: "str_only",
        },
      ]);
    });

    it("splits a `mixed` entry 50/50 across synthetic full + str_only profiles", () => {
      const result = normalizePersistedBracketMix({
        entries: [
          {
            id: "mixed-bracket-1",
            name: "Mixed Use",
            serviceConsumption: "mixed",
            weight: MIXED_WEIGHT,
          },
        ],
      });

      expect(result?.bracketMix).toEqual([
        {
          bracketSlug: "mixed-bracket-1__mixed-hotel",
          weight: MIXED_WEIGHT * HALF,
        },
        {
          bracketSlug: "mixed-bracket-1__mixed-str",
          weight: MIXED_WEIGHT * HALF,
        },
      ]);
      expect(result?.brackets).toEqual([
        {
          slug: "mixed-bracket-1__mixed-hotel",
          name: "Mixed Use",
          customerType: "hotel",
          serviceConsumptionProfile: "full",
        },
        {
          slug: "mixed-bracket-1__mixed-str",
          name: "Mixed Use",
          customerType: "str",
          serviceConsumptionProfile: "str_only",
        },
      ]);
    });

    it("always returns a populated `brackets` array (never null)", () => {
      const result = normalizePersistedBracketMix({
        entries: [
          { id: "hotel-bracket-1", serviceConsumption: "hotel", weight: HOTEL_WEIGHT },
          { id: "str-bracket-1", serviceConsumption: "str", weight: STR_WEIGHT },
        ],
      });

      expect(result).not.toBeNull();
      expect(Array.isArray(result?.brackets)).toBe(true);
      expect((result?.brackets ?? []).length).toBeGreaterThan(0);
    });

    it("ignores optional fields (assignedAt, evidence) and works correctly", () => {
      const result = normalizePersistedBracketMix({
        entries: [
          { id: "hotel-bracket-1", serviceConsumption: "hotel", weight: 1 },
        ],
        assignedAt: "2024-01-01T00:00:00.000Z",
        evidence: "Portfolio analysed.",
      });

      expect(result).not.toBeNull();
      expect(result?.bracketMix).toEqual([
        { bracketSlug: "hotel-bracket-1", weight: 1 },
      ]);
    });

    it("falls back to entry id as name when name is absent", () => {
      const result = normalizePersistedBracketMix({
        entries: [
          {
            id: "anon-1",
            serviceConsumption: "hotel",
            weight: HOTEL_WEIGHT,
          },
        ],
      });

      expect(result?.brackets?.[0]?.name).toBe("anon-1");
    });

    it("skips entries with non-positive or non-finite weights", () => {
      const result = normalizePersistedBracketMix({
        entries: [
          { id: "keep", serviceConsumption: "hotel", weight: HOTEL_WEIGHT },
          { id: "zero", serviceConsumption: "hotel", weight: 0 },
          { id: "neg", serviceConsumption: "str", weight: -1 },
          { id: "nan", serviceConsumption: "hotel", weight: Number.NaN },
        ],
      });

      expect(result?.bracketMix).toEqual([
        { bracketSlug: "keep", weight: HOTEL_WEIGHT },
      ]);
      expect(result?.brackets?.map((b) => b.slug)).toEqual(["keep"]);
    });

    it("returns null when every entry is filtered out", () => {
      const result = normalizePersistedBracketMix({
        entries: [
          { id: "zero", serviceConsumption: "hotel", weight: 0 },
        ],
      });

      expect(result).toBeNull();
    });

    it("rejects an entries object containing malformed entries", () => {
      const result = normalizePersistedBracketMix({
        entries: [
          { id: "ok", serviceConsumption: "hotel", weight: HOTEL_WEIGHT },
          { id: "bad", serviceConsumption: "unknown", weight: 1 },
        ],
      });

      expect(result).toBeNull();
    });
  });
});
