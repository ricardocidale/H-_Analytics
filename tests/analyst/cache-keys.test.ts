/**
 * Tests for engine/analyst/cognitive/cache-keys.ts — ADR-004 Phase 5A
 * pure-code verification.
 */
import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  computeCacheKey,
  computeInputContextHash,
  type VerdictCacheKey,
  type PropertyCacheInputs,
} from "../../engine/analyst/cognitive/cache-keys";

const BASE_KEY: VerdictCacheKey = {
  scenarioId: null,
  entityType: "property",
  entityId: 42,
  fieldGroup: ["adr", "occupancy"],
  personaHash: "persona-test",
  inputContextHash: "inputs-test",
  engineVersion: "v2",
};

describe("cache-keys — canonicalJson", () => {
  it("produces stable output regardless of key order", () => {
    const a = { b: 2, a: 1, c: { y: 2, x: 1 } };
    const b = { c: { x: 1, y: 2 }, a: 1, b: 2 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("preserves array order (caller sorts if needed)", () => {
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it("drops undefined fields so unset ≡ absent", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(
      canonicalJson({ a: 1 })
    );
  });

  it("keeps null as a value (not dropped)", () => {
    expect(canonicalJson({ a: 1, b: null })).not.toBe(
      canonicalJson({ a: 1 })
    );
  });

  it("serializes Date values via toJSON (not as empty object)", () => {
    // Regression guard — prior bug: sortKeys recursed into Date as regular
    // object, producing `{"at":{}}` and collapsing all dates to one hash.
    const a = canonicalJson({ at: new Date("2026-01-01T00:00:00Z") });
    const b = canonicalJson({ at: new Date("2027-06-15T12:00:00Z") });
    expect(a).not.toBe(b);
    expect(a).toContain("2026-01-01");
    expect(b).toContain("2027-06-15");
  });

  it("uses toJSON when available on custom objects", () => {
    const a = { payload: { toJSON: () => "custom-repr-A" } };
    const b = { payload: { toJSON: () => "custom-repr-B" } };
    expect(canonicalJson(a)).not.toBe(canonicalJson(b));
  });
});

describe("cache-keys — computeCacheKey", () => {
  it("produces a deterministic hex SHA-256", () => {
    const h1 = computeCacheKey(BASE_KEY);
    const h2 = computeCacheKey(BASE_KEY);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is insensitive to fieldGroup order", () => {
    const reordered = { ...BASE_KEY, fieldGroup: ["occupancy", "adr"] as const };
    expect(computeCacheKey(BASE_KEY)).toBe(
      computeCacheKey(reordered as VerdictCacheKey)
    );
  });

  it("deduplicates fieldGroup entries", () => {
    const dup = { ...BASE_KEY, fieldGroup: ["adr", "occupancy", "adr"] as const };
    expect(computeCacheKey(BASE_KEY)).toBe(
      computeCacheKey(dup as VerdictCacheKey)
    );
  });

  it("changes when entityId changes", () => {
    const other = { ...BASE_KEY, entityId: 43 };
    expect(computeCacheKey(BASE_KEY)).not.toBe(computeCacheKey(other));
  });

  it("changes when scenarioId changes (null → number)", () => {
    const other = { ...BASE_KEY, scenarioId: 5 };
    expect(computeCacheKey(BASE_KEY)).not.toBe(computeCacheKey(other));
  });

  it("changes when engineVersion changes", () => {
    const other = { ...BASE_KEY, engineVersion: "v3" };
    expect(computeCacheKey(BASE_KEY)).not.toBe(computeCacheKey(other));
  });

  it("changes when personaHash changes", () => {
    const other = { ...BASE_KEY, personaHash: "different-persona" };
    expect(computeCacheKey(BASE_KEY)).not.toBe(computeCacheKey(other));
  });

  it("changes when inputContextHash changes", () => {
    const other = { ...BASE_KEY, inputContextHash: "different-inputs" };
    expect(computeCacheKey(BASE_KEY)).not.toBe(computeCacheKey(other));
  });
});

describe("cache-keys — computeInputContextHash (v0 full-dependency)", () => {
  const inputs: PropertyCacheInputs = {
    type: "luxury-boutique",
    businessModel: "hotel",
    location: "Aspen, CO",
    roomCount: 42,
    purchasePrice: 10_000_000,
    acquisitionLTV: 0.65,
    inflationRate: 0.025,
  };

  it("is deterministic across calls", () => {
    const h1 = computeInputContextHash("property", inputs, ["adr"]);
    const h2 = computeInputContextHash("property", inputs, ["adr"]);
    expect(h1).toBe(h2);
  });

  it("is insensitive to fieldGroup order at v0 (all-inputs fallback)", () => {
    const h1 = computeInputContextHash("property", inputs, ["adr", "occupancy"]);
    const h2 = computeInputContextHash("property", inputs, ["occupancy", "adr"]);
    expect(h1).toBe(h2);
  });

  it("changes when an input value changes", () => {
    const h1 = computeInputContextHash("property", inputs, ["adr"]);
    const h2 = computeInputContextHash(
      "property",
      { ...inputs, roomCount: 43 },
      ["adr"]
    );
    expect(h1).not.toBe(h2);
  });

  it("is stable when an unrelated undefined input is added/removed", () => {
    const h1 = computeInputContextHash("property", inputs, ["adr"]);
    const h2 = computeInputContextHash(
      "property",
      { ...inputs, market: undefined },
      ["adr"]
    );
    expect(h1).toBe(h2);
  });

  it("differs between property and company context", () => {
    const pHash = computeInputContextHash("property", inputs, ["adr"]);
    const cHash = computeInputContextHash(
      "company",
      { propertyType: "hotel", numProperties: 5 },
      ["adr"]
    );
    expect(pHash).not.toBe(cHash);
  });
});

describe("cache-keys — completeness guards", () => {
  // These guards catch the silent-drop bug pattern: if someone adds a field
  // to PropertyCacheInputs or CompanyCacheInputs but forgets to list it in
  // FULL_PROPERTY_INPUTS / FULL_COMPANY_INPUTS, the new field is silently
  // excluded from the hash — stale caches served despite input changes.
  //
  // Type-level enforcement would be ideal but requires TS ≥5 satisfies +
  // key-of acrobatics. Until then, the pattern-level check below asserts
  // that every sample of a fully-populated input set changes hash when any
  // individual key changes.

  it("every property input in the type changes the hash when flipped", () => {
    const propertyCacheInputKeys = [
      "type",
      "businessModel",
      "location",
      "market",
      "country",
      "stateProvince",
      "marketTier",
      "propertyType",
      "qualityTier",
      "serviceLevel",
      "roomCount",
      "maxGuests",
      "hasFB",
      "hasEvents",
      "purchasePrice",
      "buildingImprovements",
      "acquisitionLTV",
      "operatingReserve",
      "inflationRate",
      "taxRate",
    ] as const satisfies readonly (keyof PropertyCacheInputs)[];

    const base: PropertyCacheInputs = {
      type: "luxury-boutique",
      businessModel: "hotel",
      location: "Aspen, CO",
      market: "Rocky Mountain",
      country: "US",
      stateProvince: "CO",
      marketTier: "primary",
      propertyType: "luxury-boutique",
      qualityTier: "luxury",
      serviceLevel: "full-service",
      roomCount: 42,
      maxGuests: 2,
      hasFB: true,
      hasEvents: true,
      purchasePrice: 10_000_000,
      buildingImprovements: 2_000_000,
      acquisitionLTV: 0.65,
      operatingReserve: 500_000,
      inflationRate: 0.025,
      taxRate: 0.21,
    };

    const baseHash = computeInputContextHash("property", base, ["adr"]);

    for (const key of propertyCacheInputKeys) {
      const mutated = { ...base, [key]: typeof base[key] === "number" ? -1 : "MUTATED" };
      const mutHash = computeInputContextHash("property", mutated, ["adr"]);
      expect(
        mutHash,
        `Flipping property input "${key}" did not change the hash — it is likely missing from FULL_PROPERTY_INPUTS in cache-keys.ts.`
      ).not.toBe(baseHash);
    }
  });
});

describe("cache-keys — integration: full VerdictCacheKey computed from parts", () => {
  it("flipping any input flips the final cache key via inputContextHash", () => {
    const inputs: PropertyCacheInputs = {
      roomCount: 42,
      location: "Aspen, CO",
      purchasePrice: 10_000_000,
    };
    const mkKey = (i: PropertyCacheInputs): VerdictCacheKey => ({
      scenarioId: null,
      entityType: "property",
      entityId: 42,
      fieldGroup: ["adr", "occupancy"],
      personaHash: "persona-test",
      inputContextHash: computeInputContextHash("property", i, [
        "adr",
        "occupancy",
      ]),
      engineVersion: "v2",
    });

    const keyA = computeCacheKey(mkKey(inputs));
    const keyB = computeCacheKey(mkKey({ ...inputs, roomCount: 43 }));
    expect(keyA).not.toBe(keyB);
  });
});
