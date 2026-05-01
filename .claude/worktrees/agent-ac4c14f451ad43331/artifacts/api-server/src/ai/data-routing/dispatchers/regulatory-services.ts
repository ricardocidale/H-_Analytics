/**
 * Regulatory dispatchers — country defaults and regulatory profiles.
 * Both are in-memory lookups; always available, no network calls.
 */
import { getCountryDefaults } from "@shared/countryDefaults";
import { getRegulatoryProfile } from "@shared/regulatory-data";
import type { DispatchHandler } from "./_shared";

const countryDefaults: DispatchHandler = async (_serviceKey, field, rCtx, ctx) => {
  const country = rCtx.country || ctx.country;
  if (!country) return null;
  const defaults = getCountryDefaults(country);
  if (!defaults) return null;

  if (field === "taxRate" && defaults.taxRate != null) {
    return {
      value: defaults.taxRate,
      provenance: `H+ country defaults, ${country}, corporate tax rate ${(defaults.taxRate * 100).toFixed(1)}%, L${rCtx.level}`,
    };
  }
  if (field === "depreciationYears" && defaults.depreciationYears != null) {
    return {
      value: defaults.depreciationYears,
      provenance: `H+ country defaults, ${country}, ${defaults.depreciationAuthority}, L${rCtx.level}`,
    };
  }
  if (field === "propertyTaxRate" && defaults.costRateTaxes != null) {
    return {
      value: defaults.costRateTaxes,
      provenance: `H+ country defaults, ${country}, property tax rate, L${rCtx.level}`,
    };
  }
  return null;
};

const regulatoryData: DispatchHandler = async (_serviceKey, field, rCtx, ctx) => {
  const country = rCtx.country || ctx.country;
  if (!country) return null;
  const profile = getRegulatoryProfile(country);
  if (!profile) return null;

  // Regulatory profiles provide licensing, zoning, and legal context but not
  // direct numeric tax/depreciation values (those come from country-defaults).
  // Return null for numeric fields; the profile enriches prompt context elsewhere.
  if (field === "depreciationYears" || field === "hotelTaxRate") {
    return {
      value: null,
      provenance: `Regulatory profile for ${country} available (licensing: ${profile.licensing.licenseType}), L${rCtx.level}`,
    };
  }
  return null;
};

export const handlers: Record<string, DispatchHandler> = {
  "country-defaults": countryDefaults,
  "regulatory-data": regulatoryData,
};
