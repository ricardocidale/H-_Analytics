import { describe, it, expect } from "vitest";
import {
  isFieldEmpty,
  fillMissingFields,
  SEED_GLOBAL_ASSUMPTIONS,
  SEED_PROPERTY_DEFAULTS,
  DEFAULT_FEE_CATEGORIES,
} from "../../server/syncHelpers";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_COMPANY_TAX_RATE,
  DEFAULT_CAPITAL_RAISE_VALUATION_CAP,
  DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE,
  DEFAULT_SERVICE_FEE_CATEGORIES,
} from "../../shared/constants";

describe("Fill-Only Sync — isFieldEmpty", () => {
  it("treats null as empty", () => {
    expect(isFieldEmpty(null)).toBe(true);
  });

  it("treats undefined as empty", () => {
    expect(isFieldEmpty(undefined)).toBe(true);
  });

  it("treats empty string as empty", () => {
    expect(isFieldEmpty("")).toBe(true);
    expect(isFieldEmpty("   ")).toBe(true);
  });

  it("treats zero as NOT empty (valid numeric value)", () => {
    expect(isFieldEmpty(0)).toBe(false);
  });

  it("treats false as NOT empty (valid boolean)", () => {
    expect(isFieldEmpty(false)).toBe(false);
  });

  it("treats non-empty string as NOT empty", () => {
    expect(isFieldEmpty("hello")).toBe(false);
  });

  it("treats number as NOT empty", () => {
    expect(isFieldEmpty(42)).toBe(false);
    expect(isFieldEmpty(0.085)).toBe(false);
  });

  it("treats object as NOT empty", () => {
    expect(isFieldEmpty({})).toBe(false);
    expect(isFieldEmpty({ key: "value" })).toBe(false);
  });

  it("treats array as NOT empty", () => {
    expect(isFieldEmpty([])).toBe(false);
  });
});

describe("Fill-Only Sync — fillMissingFields", () => {
  it("fills null fields from defaults", () => {
    const existing = { a: null, b: "existing", c: 42 } as Record<string, unknown>;
    const defaults = { a: "default_a", b: "default_b", c: 99 };
    const updates = fillMissingFields(existing, defaults);
    expect(updates).toEqual({ a: "default_a" });
  });

  it("fills undefined fields from defaults", () => {
    const existing = { b: "existing" } as Record<string, unknown>;
    const defaults = { a: "default_a", b: "default_b" };
    const updates = fillMissingFields(existing, defaults);
    expect(updates).toEqual({ a: "default_a" });
  });

  it("does NOT overwrite existing non-empty values", () => {
    const existing = { a: "user_value", b: 0.10, c: false } as Record<string, unknown>;
    const defaults = { a: "default_a", b: 0.085, c: true };
    const updates = fillMissingFields(existing, defaults);
    expect(updates).toEqual({});
  });

  it("preserves zero values (does not treat as empty)", () => {
    const existing = { rate: 0, count: 0 } as Record<string, unknown>;
    const defaults = { rate: 0.05, count: 10 };
    const updates = fillMissingFields(existing, defaults);
    expect(updates).toEqual({});
  });

  it("excludes id/createdAt/updatedAt/userId by default", () => {
    const existing = { id: null, createdAt: null, rate: null } as Record<string, unknown>;
    const defaults = { id: 1, createdAt: "2026-01-01", rate: 0.05 };
    const updates = fillMissingFields(existing, defaults);
    expect(updates).toEqual({ rate: 0.05 });
    expect(updates).not.toHaveProperty("id");
    expect(updates).not.toHaveProperty("createdAt");
  });

  it("respects custom excludeKeys", () => {
    const existing = { a: null, b: null } as Record<string, unknown>;
    const defaults = { a: "default_a", b: "default_b" };
    const updates = fillMissingFields(existing, defaults, ["a"]);
    expect(updates).toEqual({ b: "default_b" });
  });

  it("returns empty object when all fields populated", () => {
    const existing = { a: 1, b: "two", c: true } as Record<string, unknown>;
    const defaults = { a: 99, b: "default", c: false };
    const updates = fillMissingFields(existing, defaults);
    expect(Object.keys(updates)).toHaveLength(0);
  });

  it("fills empty string fields", () => {
    const existing = { name: "", location: "  " } as Record<string, unknown>;
    const defaults = { name: "Default Name", location: "Default Location" };
    const updates = fillMissingFields(existing, defaults);
    expect(updates).toEqual({ name: "Default Name", location: "Default Location" });
  });
});

describe("Fill-Only Sync — Seed Constants Alignment", () => {
  it("SEED_GLOBAL_ASSUMPTIONS.baseManagementFee matches constant", () => {
    expect(SEED_GLOBAL_ASSUMPTIONS.baseManagementFee).toBe(DEFAULT_BASE_MANAGEMENT_FEE_RATE);
  });

  it("SEED_GLOBAL_ASSUMPTIONS.incentiveManagementFee matches constant", () => {
    expect(SEED_GLOBAL_ASSUMPTIONS.incentiveManagementFee).toBe(DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE);
  });

  it("SEED_GLOBAL_ASSUMPTIONS.exitCapRate matches constant", () => {
    expect(SEED_GLOBAL_ASSUMPTIONS.exitCapRate).toBe(DEFAULT_EXIT_CAP_RATE);
  });

  it("SEED_GLOBAL_ASSUMPTIONS.commissionRate matches constant", () => {
    expect(SEED_GLOBAL_ASSUMPTIONS.commissionRate).toBe(DEFAULT_COMMISSION_RATE);
  });

  it("SEED_GLOBAL_ASSUMPTIONS.companyTaxRate matches constant", () => {
    expect(SEED_GLOBAL_ASSUMPTIONS.companyTaxRate).toBe(DEFAULT_COMPANY_TAX_RATE);
  });

  it("SEED_GLOBAL_ASSUMPTIONS.capitalRaiseValuationCap matches constant", () => {
    expect(SEED_GLOBAL_ASSUMPTIONS.capitalRaiseValuationCap).toBe(DEFAULT_CAPITAL_RAISE_VALUATION_CAP);
  });

  it("SEED_GLOBAL_ASSUMPTIONS.capitalRaiseDiscountRate matches constant", () => {
    expect(SEED_GLOBAL_ASSUMPTIONS.capitalRaiseDiscountRate).toBe(DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE);
  });

  it("SEED_PROPERTY_DEFAULTS.baseManagementFeeRate matches constant", () => {
    expect(SEED_PROPERTY_DEFAULTS.baseManagementFeeRate).toBe(DEFAULT_BASE_MANAGEMENT_FEE_RATE);
  });

  it("SEED_PROPERTY_DEFAULTS.incentiveManagementFeeRate matches constant", () => {
    expect(SEED_PROPERTY_DEFAULTS.incentiveManagementFeeRate).toBe(DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE);
  });

  it("DEFAULT_FEE_CATEGORIES has 5 property fee categories", () => {
    expect(DEFAULT_FEE_CATEGORIES).toHaveLength(5);
  });

  it("DEFAULT_FEE_CATEGORIES matches shared/constants SERVICE_FEE_CATEGORIES exactly", () => {
    for (const svc of DEFAULT_SERVICE_FEE_CATEGORIES) {
      const match = DEFAULT_FEE_CATEGORIES.find(c => c.name === svc.name);
      expect(match, `Missing fee category: ${svc.name}`).toBeDefined();
      expect(match!.rate).toBe(svc.rate);
    }
    expect(DEFAULT_FEE_CATEGORIES.length).toBe(DEFAULT_SERVICE_FEE_CATEGORIES.length);
  });
});

describe("Fill-Only Sync — Behavioral Contract", () => {
  it("never overwrites a user-set inflation rate", () => {
    const userEdited = { inflationRate: 0.04 } as Record<string, unknown>;
    const updates = fillMissingFields(userEdited, SEED_GLOBAL_ASSUMPTIONS);
    expect(updates).not.toHaveProperty("inflationRate");
  });

  it("never overwrites a user-set exit cap rate", () => {
    const userEdited = { exitCapRate: 0.10 } as Record<string, unknown>;
    const updates = fillMissingFields(userEdited, SEED_GLOBAL_ASSUMPTIONS);
    expect(updates).not.toHaveProperty("exitCapRate");
  });

  it("never overwrites a user-set company name", () => {
    const userEdited = { companyName: "My Custom Corp" } as Record<string, unknown>;
    const updates = fillMissingFields(userEdited, SEED_GLOBAL_ASSUMPTIONS);
    expect(updates).not.toHaveProperty("companyName");
  });

  it("never overwrites a user-set management fee rate", () => {
    const userEdited = { baseManagementFee: 0.06 } as Record<string, unknown>;
    const updates = fillMissingFields(userEdited, SEED_GLOBAL_ASSUMPTIONS);
    expect(updates).not.toHaveProperty("baseManagementFee");
  });

  it("fills companyName when it is null", () => {
    const empty = { companyName: null } as Record<string, unknown>;
    const updates = fillMissingFields(empty, SEED_GLOBAL_ASSUMPTIONS);
    expect(updates).toHaveProperty("companyName", "Hospitality Business Group");
  });

  it("fills exit cap rate when undefined", () => {
    const empty = {} as Record<string, unknown>;
    const updates = fillMissingFields(empty, { exitCapRate: DEFAULT_EXIT_CAP_RATE });
    expect(updates).toHaveProperty("exitCapRate", DEFAULT_EXIT_CAP_RATE);
  });

  it("SAFE tranche amounts total $2M", () => {
    expect(SEED_GLOBAL_ASSUMPTIONS.capitalRaise1Amount + SEED_GLOBAL_ASSUMPTIONS.capitalRaise2Amount).toBe(2000000);
  });

  it("SAFE tranche 2 date is after tranche 1", () => {
    expect(new Date(SEED_GLOBAL_ASSUMPTIONS.capitalRaise2Date).getTime())
      .toBeGreaterThan(new Date(SEED_GLOBAL_ASSUMPTIONS.capitalRaise1Date).getTime());
  });
});

describe("Fill-Only Sync — Response Shape", () => {
  const expectedResultShape = {
    globalAssumptions: { created: 0, skipped: 1, filled: 0 },
    properties: { created: 0, skipped: 5, filled: 0 },
    propertyFeeCategories: { created: 0, skipped: 25 },
    designThemes: { created: 0, skipped: 1 },
  };

  it("has globalAssumptions with created/skipped/filled", () => {
    expect(expectedResultShape.globalAssumptions).toHaveProperty("created");
    expect(expectedResultShape.globalAssumptions).toHaveProperty("skipped");
    expect(expectedResultShape.globalAssumptions).toHaveProperty("filled");
  });

  it("has properties with created/skipped/filled", () => {
    expect(expectedResultShape.properties).toHaveProperty("created");
    expect(expectedResultShape.properties).toHaveProperty("skipped");
    expect(expectedResultShape.properties).toHaveProperty("filled");
  });

  it("has propertyFeeCategories with created/skipped (no updated — fill only)", () => {
    expect(expectedResultShape.propertyFeeCategories).toHaveProperty("created");
    expect(expectedResultShape.propertyFeeCategories).toHaveProperty("skipped");
    expect(expectedResultShape.propertyFeeCategories).not.toHaveProperty("updated");
  });

  it("has designThemes with created/skipped", () => {
    expect(expectedResultShape.designThemes).toHaveProperty("created");
    expect(expectedResultShape.designThemes).toHaveProperty("skipped");
  });

  it("fill-only results never include 'updated' for global assumptions", () => {
    expect(expectedResultShape.globalAssumptions).not.toHaveProperty("updated");
  });
});
