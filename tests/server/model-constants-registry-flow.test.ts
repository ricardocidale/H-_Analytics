/**
 * Audit #319 R4 — Constants registry migration regression test.
 *
 * Locks the invariants the R4 migration depends on:
 *   1. The four "safe" keys (depreciationYears, daysPerMonth, inflationRate,
 *      property inflation) return identical numeric values via
 *      `getFactoryNumber()` and via the legacy `shared/constants` exports.
 *      If anyone re-tunes one side without the other, this test fails and
 *      surfaces the drift before it reaches the engine.
 *   2. The two "unsafe" keys we deliberately did NOT migrate (companyTaxRate,
 *      costRateTaxes) still diverge — call sites read the legacy constant for
 *      a reason, and silently flipping them to the registry would re-baseline
 *      golden numbers and apply the wrong concept (federal-only vs blended;
 *      flat industry estimate vs locality-aware authority value). The test
 *      pins the divergence so the next audit pass can be a deliberate,
 *      tracked reconciliation rather than an accidental flip.
 *   3. `getFactoryNumber()` is locality-aware: passing a non-US country/state
 *      can yield a different value than the bare US baseline.
 *
 * This is a static contract test against the registry — no DB / network.
 */

import { describe, it, expect } from "vitest";
import {
  DEPRECIATION_YEARS,
  DAYS_PER_MONTH,
  DEFAULT_PROPERTY_INFLATION_RATE,
  DEFAULT_COMPANY_INFLATION_RATE,
  DEFAULT_COMPANY_TAX_RATE,
  DEFAULT_COST_RATE_TAXES,
} from "../../shared/constants";
import {
  getFactoryNumber,
  getFactoryValue,
  MODEL_CONSTANTS_REGISTRY,
} from "../../shared/model-constants-registry";

describe("Audit #319 R4 — constants registry migration invariants", () => {
  describe("safe-value parity (registry baseline === legacy export)", () => {
    it("depreciationYears: registry US baseline matches DEPRECIATION_YEARS", () => {
      expect(getFactoryNumber("depreciationYears")).toBe(DEPRECIATION_YEARS);
      expect(getFactoryNumber("depreciationYears", "United States")).toBe(
        DEPRECIATION_YEARS,
      );
    });

    it("daysPerMonth: registry universal value matches DAYS_PER_MONTH", () => {
      expect(getFactoryNumber("daysPerMonth")).toBe(DAYS_PER_MONTH);
    });

    it("inflationRate: registry US baseline matches DEFAULT_PROPERTY_INFLATION_RATE", () => {
      expect(getFactoryNumber("inflationRate")).toBe(
        DEFAULT_PROPERTY_INFLATION_RATE,
      );
      expect(getFactoryNumber("inflationRate", "United States")).toBe(
        DEFAULT_PROPERTY_INFLATION_RATE,
      );
    });

    it("inflationRate: registry US baseline also matches DEFAULT_COMPANY_INFLATION_RATE", () => {
      expect(getFactoryNumber("inflationRate")).toBe(
        DEFAULT_COMPANY_INFLATION_RATE,
      );
    });
  });

  describe("documented divergences (deliberate non-migration)", () => {
    it("taxRate registry US baseline ≠ DEFAULT_COMPANY_TAX_RATE (concept mismatch)", () => {
      // Registry `taxRate` = federal corporate (US = 0.21).
      // Legacy `DEFAULT_COMPANY_TAX_RATE` = blended company-level estimate (0.30).
      // These are different concepts; reconciliation requires a new
      // `companyTaxRate` registry key, tracked as audit follow-up.
      expect(getFactoryNumber("taxRate", "United States")).not.toBe(
        DEFAULT_COMPANY_TAX_RATE,
      );
    });

    it("costRateTaxes registry US baseline ≠ DEFAULT_COST_RATE_TAXES (locality vs flat estimate)", () => {
      // Registry value is locality-aware (US = 0.012, authority-sourced).
      // Legacy is the flat 3% industry estimate retained for admin/UI fallback.
      expect(getFactoryNumber("costRateTaxes", "United States")).not.toBe(
        DEFAULT_COST_RATE_TAXES,
      );
    });
  });

  describe("locality awareness", () => {
    it("country override changes registry output for inflationRate (US 0.03 ≠ MX 0.04)", () => {
      const us = getFactoryNumber("inflationRate", "United States");
      const mx = getFactoryNumber("inflationRate", "Mexico");
      expect(Number.isFinite(us)).toBe(true);
      expect(Number.isFinite(mx)).toBe(true);
      // Locks today's COUNTRY_DEFAULTS divergence so accidental table edits
      // surface here. If authority data is updated, retune both sides
      // intentionally.
      expect(us).not.toBe(mx);
    });

    it("getFactoryNumber throws if a key resolves to a non-number", () => {
      expect(() => getFactoryNumber("not-a-real-key" as never)).toThrow();
    });
  });

  describe("registry contract", () => {
    it("all 7 R4 migration keys are registered", () => {
      const expected = [
        "depreciationYears",
        "daysPerMonth",
        "taxRate",
        "costRateTaxes",
        "countryRiskPremium",
        "inflationRate",
        "capitalGainsRate",
      ];
      for (const k of expected) {
        expect(MODEL_CONSTANTS_REGISTRY[k]).toBeDefined();
        expect(typeof getFactoryValue(k, "United States")).toBe("number");
      }
    });
  });
});
