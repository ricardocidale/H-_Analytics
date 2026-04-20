/**
 * Unit tests for the DB-backed defaults reader.
 *
 * The seeded rows (46 MC-level defaults, all universal scope) are expected
 * to exist — see `script/seed-model-defaults.ts`. These tests do not mutate
 * the table; they only read.
 */

import { describe, it, expect } from "vitest";
import { resolveDefault, resolveDefaultsByCard } from "../../server/defaults";

describe("resolveDefault", () => {
  it("returns the seeded value for a known key with no scope", async () => {
    const v = await resolveDefault<number>("mc.setup.projectionYears");
    expect(v).toBe(10);
  });

  it("returns undefined for an unknown key", async () => {
    const v = await resolveDefault("mc.nonexistent.key");
    expect(v).toBeUndefined();
  });

  it("returns the universal row when scope is provided but no scoped rows exist", async () => {
    // All 46 seeded rows are universal (all scope columns NULL), so any
    // scope passed in should still resolve to the universal value.
    const v = await resolveDefault<number>("mc.funding.ltv", {
      country: "United States",
      countrySubdivision: "Florida",
      businessType: "luxury",
    });
    expect(v).toBe(0.75);
  });

  it("decodes numeric, string, and object jsonb values correctly", async () => {
    const years = await resolveDefault<number>("mc.setup.projectionYears");
    const startDate = await resolveDefault<string>("mc.setup.modelStartDate");
    const services = await resolveDefault<unknown[]>("mc.revenue_model.serviceFeeCategories");

    expect(typeof years).toBe("number");
    expect(typeof startDate).toBe("string");
    expect(Array.isArray(services)).toBe(true);
    expect((services as unknown[]).length).toBeGreaterThan(0);
  });
});

describe("resolveDefaultsByCard", () => {
  it("returns every key in the funding card", async () => {
    const card = await resolveDefaultsByCard(
      "management_company",
      "management_company",
      "funding",
    );
    // Seed has 10 funding keys — check a few representative ones.
    expect(card.get("mc.funding.ltv")).toBe(0.75);
    expect(card.get("mc.funding.interestRate")).toBe(0.09);
    expect(card.get("mc.funding.termYears")).toBe(25);
    expect(card.size).toBeGreaterThanOrEqual(10);
  });

  it("returns an empty map for an unknown card", async () => {
    const card = await resolveDefaultsByCard(
      "management_company",
      "management_company",
      "nonexistent_card",
    );
    expect(card.size).toBe(0);
  });

  it("scopes correctly to category + subTab (doesn't bleed across categories)", async () => {
    // "setup" is a real cardKey under management_company. If we look under
    // the wrong category, we should get an empty map.
    const wrongCategory = await resolveDefaultsByCard(
      "property",
      "management_company",
      "setup",
    );
    expect(wrongCategory.size).toBe(0);

    const right = await resolveDefaultsByCard(
      "management_company",
      "management_company",
      "setup",
    );
    expect(right.get("mc.setup.projectionYears")).toBe(10);
  });
});
