import { describe, it, expect } from "vitest";
import { stableHash, stableEquals } from "../../server/scenarios/stable-json";

describe("stableHash — determinism guarantees", () => {
  it("produces identical hashes for objects with different key insertion order", () => {
    const objA: Record<string, number[]> = {};
    objA["property_1"] = [100, 200, 300];
    objA["property_2"] = [400, 500, 600];
    objA["property_3"] = [700, 800, 900];

    const objB: Record<string, number[]> = {};
    objB["property_3"] = [700, 800, 900];
    objB["property_1"] = [100, 200, 300];
    objB["property_2"] = [400, 500, 600];

    expect(stableHash(objA)).toBe(stableHash(objB));
  });

  it("produces identical hashes for nested objects with shuffled keys", () => {
    const a = {
      perPropertyYearly: {
        "property_1": [{ revenueTotal: 100, noi: 50 }],
        "property_2": [{ revenueTotal: 200, noi: 80 }],
      },
      consolidatedYearly: [{ revenueTotal: 300, noi: 130 }],
    };

    const b = {
      consolidatedYearly: [{ revenueTotal: 300, noi: 130 }],
      perPropertyYearly: {
        "property_2": [{ noi: 80, revenueTotal: 200 }],
        "property_1": [{ noi: 50, revenueTotal: 100 }],
      },
    };

    expect(stableHash(a)).toBe(stableHash(b));
  });

  it("produces different hashes for different data", () => {
    const a = { revenue: 100 };
    const b = { revenue: 101 };
    expect(stableHash(a)).not.toBe(stableHash(b));
  });

  it("produces a 64-character hex string (SHA-256)", () => {
    const hash = stableHash({ test: true });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("stableEquals returns true for deep-equal objects", () => {
    const a = { arr: [1, 2, 3], nested: { x: 1 } };
    const b = { arr: [1, 2, 3], nested: { x: 1 } };
    expect(stableEquals(a, b)).toBe(true);
  });

  it("stableEquals returns false for non-equal objects", () => {
    const a = { arr: [1, 2, 3] };
    const b = { arr: [1, 2, 4] };
    expect(stableEquals(a, b)).toBe(false);
  });
});
