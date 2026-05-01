import { describe, it, expect } from "vitest";
import {
  isFieldEmpty,
  fillMissingFields,
  SEED_GLOBAL_ASSUMPTIONS,
  SEED_PROPERTY_DEFAULTS,
} from "../../server/syncHelpers";

describe("isFieldEmpty", () => {
  it("returns true for null", () => {
    expect(isFieldEmpty(null)).toBe(true);
  });

  it("returns true for undefined", () => {
    expect(isFieldEmpty(undefined)).toBe(true);
  });

  it("returns true for empty string", () => {
    expect(isFieldEmpty("")).toBe(true);
  });

  it("returns true for whitespace-only string", () => {
    expect(isFieldEmpty("   ")).toBe(true);
  });

  it("returns false for 0 (zero is a valid value)", () => {
    expect(isFieldEmpty(0)).toBe(false);
  });

  it("returns false for false (false is a valid value)", () => {
    expect(isFieldEmpty(false)).toBe(false);
  });

  it("returns false for non-empty string", () => {
    expect(isFieldEmpty("hello")).toBe(false);
  });

  it("returns false for positive number", () => {
    expect(isFieldEmpty(42)).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(isFieldEmpty([])).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isFieldEmpty({})).toBe(false);
  });
});

describe("fillMissingFields", () => {
  it("fills null fields with defaults", () => {
    const existing: Record<string, unknown> = { a: null, b: "keep" };
    const defaults = { a: 42, b: "default" };
    const result = fillMissingFields(existing, defaults);
    expect(result).toEqual({ a: 42 });
  });

  it("fills undefined fields with defaults", () => {
    const existing: Record<string, unknown> = { b: "keep" };
    const defaults = { a: 42, b: "default" };
    const result = fillMissingFields(existing, defaults);
    expect(result).toEqual({ a: 42 });
  });

  it("never overwrites 0", () => {
    const existing: Record<string, unknown> = { rate: 0 };
    const defaults = { rate: 0.05 };
    const result = fillMissingFields(existing, defaults);
    expect(result).toEqual({});
  });

  it("never overwrites false", () => {
    const existing: Record<string, unknown> = { enabled: false };
    const defaults = { enabled: true };
    const result = fillMissingFields(existing, defaults);
    expect(result).toEqual({});
  });

  it("never overwrites non-empty strings", () => {
    const existing: Record<string, unknown> = { name: "Custom" };
    const defaults = { name: "Default" };
    const result = fillMissingFields(existing, defaults);
    expect(result).toEqual({});
  });

  it("fills empty strings with defaults", () => {
    const existing: Record<string, unknown> = { name: "" };
    const defaults = { name: "Default" };
    const result = fillMissingFields(existing, defaults);
    expect(result).toEqual({ name: "Default" });
  });

  it("excludes id, createdAt, updatedAt, userId by default", () => {
    const existing: Record<string, unknown> = { id: null, createdAt: null, name: null };
    const defaults = { id: 1, createdAt: "2026-01-01", name: "Test" };
    const result = fillMissingFields(existing, defaults);
    expect(result).toEqual({ name: "Test" });
  });

  it("respects custom excludeKeys", () => {
    const existing: Record<string, unknown> = { a: null, b: null };
    const defaults = { a: 1, b: 2 };
    const result = fillMissingFields(existing, defaults, ["a"]);
    expect(result).toEqual({ b: 2 });
  });
});

describe("Seed constants shape", () => {
  it("SEED_GLOBAL_ASSUMPTIONS has required fields", () => {
    expect(SEED_GLOBAL_ASSUMPTIONS.modelStartDate).toBe("2026-04-01");
    expect(SEED_GLOBAL_ASSUMPTIONS.inflationRate).toBe(0.03);
    expect(SEED_GLOBAL_ASSUMPTIONS.companyOpsStartDate).toBe("2026-06-01");
    expect(typeof SEED_GLOBAL_ASSUMPTIONS.capitalRaise1Amount).toBe("number");
    expect(typeof SEED_GLOBAL_ASSUMPTIONS.exitCapRate).toBe("number");
  });

  it("SEED_PROPERTY_DEFAULTS has all cost rates", () => {
    const rates = [
      "costRateRooms", "costRateFB", "costRateAdmin", "costRateMarketing",
      "costRatePropertyOps", "costRateUtilities",
      "costRateTaxes", "costRateIT", "costRateFFE", "costRateOther",
    ];
    const defaults = SEED_PROPERTY_DEFAULTS as Record<string, unknown>;
    for (const rate of rates) {
      expect(typeof defaults[rate]).toBe("number");
      expect(defaults[rate] as number).toBeGreaterThan(0);
      expect(defaults[rate] as number).toBeLessThan(1);
    }
  });

  it("SEED_PROPERTY_DEFAULTS has revenue shares", () => {
    expect(SEED_PROPERTY_DEFAULTS.revShareEvents).toBeGreaterThan(0);
    expect(SEED_PROPERTY_DEFAULTS.revShareFB).toBeGreaterThan(0);
    expect(SEED_PROPERTY_DEFAULTS.revShareOther).toBeGreaterThan(0);
  });

  it("SEED_PROPERTY_DEFAULTS has management fee rates", () => {
    expect(typeof SEED_PROPERTY_DEFAULTS.baseManagementFeeRate).toBe("number");
    expect(typeof SEED_PROPERTY_DEFAULTS.incentiveManagementFeeRate).toBe("number");
  });
});
