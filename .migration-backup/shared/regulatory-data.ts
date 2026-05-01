/**
 * Pre-collected regulatory data for hospitality property conversion.
 *
 * This module provides structured information about zoning, licensing,
 * building codes, foreign investment rules, and labor regulations for
 * each country the app supports. Investors need this context before
 * committing capital to a property in a specific jurisdiction.
 *
 * IMPORTANT: This is reference data, not legal advice. Values marked
 * "varies by jurisdiction" or "consult local counsel" indicate areas
 * where the answer depends on sub-national rules (state, province,
 * municipality). Always verify with qualified local professionals.
 *
 * Last comprehensive review: 2026-04-13
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RegulatoryProfile {
  country: string;
  countryCode: string;

  /** Hospitality licensing requirements */
  licensing: {
    nationalLicenseRequired: boolean;
    localPermitRequired: boolean;
    licenseType: string;
    typicalTimeline: string;
    renewalFrequency: string;
    estimatedCost: string;
    notes?: string;
  };

  /** Zoning & land use conversion rules */
  zoning: {
    residentialToCommercialAllowed: boolean;
    zoningChangeRequired: boolean;
    typicalZoningTimeline: string;
    environmentalReviewRequired: boolean;
    historicPreservation: boolean;
    notes?: string;
  };

  /** Building & safety code standards */
  buildingCodes: {
    fireCodeStandard: string;
    adaEquivalent: string;
    seismicRequirements: boolean;
    energyEfficiencyCode: string;
    maxOccupancyRegulation: string;
    notes?: string;
  };

  /** Foreign investment rules */
  foreignInvestment: {
    foreignOwnershipAllowed: boolean;
    ownershipRestrictions: string;
    repatriationRestrictions: boolean;
    treatyProtections: string;
    notes?: string;
  };

  /** Employment / labor regulations */
  labor: {
    minimumWage: string;
    mandatoryBenefits: string;
    terminationRules: string;
    unionPrevalence: string;
    notes?: string;
  };

  /** ISO date of last data update */
  lastUpdated: string;
  /** URLs or document names used as sources */
  sources: string[];

  /** US-only: state-level overrides for key markets */
  usStateOverrides?: Record<string, Partial<RegulatoryProfile>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Country profiles
// ─────────────────────────────────────────────────────────────────────────────


import { REGULATORY_PROFILES_NA } from "./regulatory/profiles-na";
import { REGULATORY_PROFILES_LATAM } from "./regulatory/profiles-latam";
import { REGULATORY_PROFILES_EUROPE } from "./regulatory/profiles-europe";

// ─────────────────────────────────────────────────────────────────────────────
// Country profiles (composed from per-region modules)
// ─────────────────────────────────────────────────────────────────────────────

const REGULATORY_PROFILES: Record<string, RegulatoryProfile> = {
  ...REGULATORY_PROFILES_NA,
  ...REGULATORY_PROFILES_LATAM,
  ...REGULATORY_PROFILES_EUROPE,
};


const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "United States": "US",
  "Colombia": "CO",
  "Mexico": "MX",
  "United Kingdom": "GB",
  "Costa Rica": "CR",
  "Canada": "CA",
  "France": "FR",
  "Spain": "ES",
  "Italy": "IT",
  "Brazil": "BR",
  "Dominican Republic": "DO",
  "Portugal": "PT",
  "Greece": "GR",
  "Argentina": "AR",
  "El Salvador": "SV",
  "Panama": "PA",
  "Uruguay": "UY",
  "Peru": "PE",
};

// ─────────────────────────────────────────────────────────────────────────────
// Lookup functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the regulatory profile for a country by ISO 2-letter code or country name.
 * Returns null if not found.
 */
export function getRegulatoryProfile(countryCodeOrName: string): RegulatoryProfile | null {
  // Try direct code lookup first
  if (REGULATORY_PROFILES[countryCodeOrName]) {
    return REGULATORY_PROFILES[countryCodeOrName];
  }
  // Try name → code mapping
  const code = COUNTRY_NAME_TO_CODE[countryCodeOrName];
  if (code && REGULATORY_PROFILES[code]) {
    return REGULATORY_PROFILES[code];
  }
  return null;
}

/**
 * Get all regulatory profiles as an array.
 */
export function getAllRegulatoryProfiles(): RegulatoryProfile[] {
  return Object.values(REGULATORY_PROFILES);
}

/**
 * Build a concise regulatory context block for inclusion in LLM research prompts.
 * Returns an empty string if no profile is found.
 */
export function buildRegulatoryContextBlock(countryCodeOrName: string): string {
  const profile = getRegulatoryProfile(countryCodeOrName);
  if (!profile) return "";

  const conversionStatus = profile.zoning.residentialToCommercialAllowed
    ? (profile.zoning.zoningChangeRequired ? "allowed with zoning change" : "allowed")
    : "restricted — consult local counsel";

  const foreignStatus = profile.foreignInvestment.foreignOwnershipAllowed
    ? (profile.foreignInvestment.ownershipRestrictions.length > 50
        ? "allowed with restrictions"
        : "allowed, no major restrictions")
    : "restricted";

  let block = `\nRegulatory Context (${profile.country}):`;
  block += `\n- Licensing: ${profile.licensing.licenseType}, timeline ${profile.licensing.typicalTimeline}`;
  block += `\n- Zoning: Residential-to-commercial conversion ${conversionStatus} (timeline: ${profile.zoning.typicalZoningTimeline})`;
  block += `\n- Building codes: Fire safety per ${profile.buildingCodes.fireCodeStandard.split(";")[0]}; seismic requirements: ${profile.buildingCodes.seismicRequirements ? "yes" : "no"}`;
  block += `\n- Foreign investment: ${foreignStatus}${profile.foreignInvestment.repatriationRestrictions ? " — repatriation restrictions apply" : ""}`;
  block += `\n- Labor: Minimum wage ${profile.labor.minimumWage.split("(")[0].trim()}; union prevalence: ${profile.labor.unionPrevalence.toLowerCase()}`;

  if (profile.foreignInvestment.treatyProtections) {
    block += `\n- Treaty protections: ${profile.foreignInvestment.treatyProtections}`;
  }
  if (profile.foreignInvestment.notes) {
    block += `\n- Investment note: ${profile.foreignInvestment.notes.slice(0, 200)}`;
  }

  return block;
}
