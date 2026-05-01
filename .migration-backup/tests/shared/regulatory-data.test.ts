/**
 * Tests for shared/regulatory-data.ts
 *
 * Pure functions — no mocking needed.
 */
import { describe, it, expect } from "vitest";

import {
  getRegulatoryProfile,
  getAllRegulatoryProfiles,
  buildRegulatoryContextBlock,
  type RegulatoryProfile,
} from "../../shared/regulatory-data";

describe("regulatory-data", () => {
  // ── 1. getRegulatoryProfile("US") ────────────────────────────────────
  describe("US profile", () => {
    it("returns a profile with populated licensing, zoning, and buildingCodes", () => {
      const profile = getRegulatoryProfile("US");
      expect(profile).not.toBeNull();
      expect(profile!.countryCode).toBe("US");
      expect(profile!.country).toBe("United States");

      // Licensing
      expect(profile!.licensing.licenseType).toBeTruthy();
      expect(profile!.licensing.typicalTimeline).toBeTruthy();

      // Zoning
      expect(profile!.zoning.residentialToCommercialAllowed).toBe(true);
      expect(profile!.zoning.zoningChangeRequired).toBe(true);

      // Building codes
      expect(profile!.buildingCodes.fireCodeStandard).toContain("NFPA");
      expect(profile!.buildingCodes.adaEquivalent).toContain("ADA");
    });
  });

  // ── 2. getRegulatoryProfile("CO") ────────────────────────────────────
  describe("Colombia profile", () => {
    it("returns a profile mentioning RNT and allowing foreign investment", () => {
      const profile = getRegulatoryProfile("CO");
      expect(profile).not.toBeNull();
      expect(profile!.countryCode).toBe("CO");

      // RNT mentioned
      expect(profile!.licensing.licenseType).toContain("RNT");
      expect(profile!.licensing.nationalLicenseRequired).toBe(true);

      // Foreign investment
      expect(profile!.foreignInvestment.foreignOwnershipAllowed).toBe(true);
      expect(profile!.foreignInvestment.repatriationRestrictions).toBe(false);
    });

    it("can be found by country name", () => {
      const profile = getRegulatoryProfile("Colombia");
      expect(profile).not.toBeNull();
      expect(profile!.countryCode).toBe("CO");
    });
  });

  // ── 3. getRegulatoryProfile("XX") — unknown country ──────────────────
  it("returns null for unknown country code", () => {
    expect(getRegulatoryProfile("XX")).toBeNull();
    expect(getRegulatoryProfile("Narnia")).toBeNull();
    expect(getRegulatoryProfile("")).toBeNull();
  });

  // ── 4. getAllRegulatoryProfiles returns 18 profiles ───────────────────
  it("returns 18 profiles for all supported countries", () => {
    const all = getAllRegulatoryProfiles();
    expect(all.length).toBe(18);

    const codes = all.map((p) => p.countryCode);
    expect(codes).toContain("US");
    expect(codes).toContain("CO");
    expect(codes).toContain("MX");
    expect(codes).toContain("GB");
    expect(codes).toContain("CR");
  });

  // ── 5. US state overrides exist ──────────────────────────────────────
  describe("US state overrides", () => {
    it("has New York and Utah overrides", () => {
      const profile = getRegulatoryProfile("US");
      expect(profile).not.toBeNull();
      expect(profile!.usStateOverrides).toBeDefined();
      expect(profile!.usStateOverrides!["New York"]).toBeDefined();
      expect(profile!.usStateOverrides!["Utah"]).toBeDefined();
    });

    it("New York override has stricter licensing timeline", () => {
      const ny = getRegulatoryProfile("US")!.usStateOverrides!["New York"];
      expect(ny.licensing).toBeDefined();
      expect(ny.licensing!.typicalTimeline).toContain("12");
    });

    it("Utah override mentions DABC liquor restrictions", () => {
      const ut = getRegulatoryProfile("US")!.usStateOverrides!["Utah"];
      expect(ut.licensing).toBeDefined();
      expect(ut.licensing!.notes).toContain("DABC");
    });
  });

  // ── 6. Every profile has lastUpdated ─────────────────────────────────
  it("every profile has a non-empty lastUpdated", () => {
    const all = getAllRegulatoryProfiles();
    for (const profile of all) {
      expect(profile.lastUpdated).toBeTruthy();
      expect(profile.lastUpdated.length).toBeGreaterThanOrEqual(10); // ISO date
    }
  });

  // ── 7. Every profile has sources array ───────────────────────────────
  it("every profile has a non-empty sources array", () => {
    const all = getAllRegulatoryProfiles();
    for (const profile of all) {
      expect(Array.isArray(profile.sources)).toBe(true);
      expect(profile.sources.length).toBeGreaterThan(0);
    }
  });

  // ── 8. Foreign investment restrictions ────────────────────────────────
  describe("foreign investment restrictions", () => {
    it("Mexico mentions fideicomiso for restricted zones", () => {
      const mx = getRegulatoryProfile("MX");
      expect(mx).not.toBeNull();
      expect(mx!.foreignInvestment.ownershipRestrictions).toContain("fideicomiso");
    });

    it("Argentina has capital controls / repatriation restrictions", () => {
      const ar = getRegulatoryProfile("AR");
      expect(ar).not.toBeNull();
      expect(ar!.foreignInvestment.repatriationRestrictions).toBe(true);
      // Notes should mention capital controls
      expect(ar!.foreignInvestment.notes).toMatch(/capital control|cepo/i);
    });
  });

  // ── 9. buildRegulatoryContextBlock ───────────────────────────────────
  describe("buildRegulatoryContextBlock", () => {
    it("returns non-empty string for known country", () => {
      const block = buildRegulatoryContextBlock("US");
      expect(block.length).toBeGreaterThan(0);
      expect(block).toContain("United States");
      expect(block).toContain("Licensing:");
      expect(block).toContain("Zoning:");
      expect(block).toContain("Building codes:");
      expect(block).toContain("Foreign investment:");
      expect(block).toContain("Labor:");
    });

    it("returns empty string for unknown country", () => {
      expect(buildRegulatoryContextBlock("XX")).toBe("");
      expect(buildRegulatoryContextBlock("Unknown")).toBe("");
    });

    it("works with country name as well as code", () => {
      const block = buildRegulatoryContextBlock("Colombia");
      expect(block.length).toBeGreaterThan(0);
      expect(block).toContain("Colombia");
    });
  });
});
