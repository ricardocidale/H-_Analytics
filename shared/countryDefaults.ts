/**
 * Country & US State financial defaults for new property creation.
 *
 * When a user creates a property and selects a country (and optionally a US state),
 * these values auto-fill the financial assumptions in the Add Property dialog.
 *
 * Fields covered:
 *   taxRate              — corporate/income tax rate (decimal). For US, federal (21%) + state combined.
 *   costRateTaxes        — property/real-estate taxes as % of revenue (USALI category).
 *   countryRiskPremium   — equity risk premium add-on. Source: Damodaran NYU Stern Jan 2026.
 *   inflationRate        — cost escalation rate per year (decimal).
 *   depreciationYears    — straight-line useful life for buildings (years). Set by local tax authority.
 *   depreciationAuthority — governing body/statute that mandates the depreciation period.
 *
 * NOT included here (research-engine-driven per property, not country defaults):
 *   exitCapRate, adrGrowthRate — these vary by property type, location, quality tier.
 *
 * Depreciation note:
 *   The calculation METHOD always follows US GAAP (ASC 360, straight-line). Only the
 *   useful life period varies by jurisdiction. Each country's tax authority determines
 *   the allowable recovery period for commercial real property (hotels).
 *
 * Inflation note:
 *   For dollar-indexed / dollarized economies (Argentina, El Salvador, Panama),
 *   inflationRate reflects USD cost escalation (~3%), NOT local currency inflation.
 *   Luxury hospitality in these markets is priced in USD, so local currency inflation
 *   is irrelevant to the model.
 *
 * CRP values aligned with countryRiskPremiums.ts (Damodaran, Jan 2026).
 */

export interface CountryDefaults {
  taxRate: number;
  costRateTaxes: number;
  countryRiskPremium: number;
  inflationRate: number;
  depreciationYears: number;
  depreciationAuthority: string;
}

export const COUNTRY_DEFAULTS: Record<string, CountryDefaults> = {
  "United States": {
    taxRate: 0.21,         // Federal only — state layer applied via US_STATE_DEFAULTS
    costRateTaxes: 0.012,
    countryRiskPremium: 0.0000,
    inflationRate: 0.03,
    depreciationYears: 39, // Nonresidential real property (hotels) — MACRS
    depreciationAuthority: "IRS Publication 946, IRC §168(e)(2)(A)",
  },
  "Canada": {
    taxRate: 0.265,        // Federal 15% + avg provincial ~11.5%
    costRateTaxes: 0.015,
    countryRiskPremium: 0.0049,
    inflationRate: 0.03,
    depreciationYears: 25, // CCA Class 1 non-residential buildings (4% declining → ~25yr SL equivalent)
    depreciationAuthority: "CRA Income Tax Regulations, CCA Class 1",
  },
  "France": {
    taxRate: 0.25,
    costRateTaxes: 0.015,
    countryRiskPremium: 0.0070,
    inflationRate: 0.03,
    depreciationYears: 25, // Commercial buildings — Plan Comptable Général
    depreciationAuthority: "Code Général des Impôts, Art. 39-1-2°",
  },
  "Spain": {
    taxRate: 0.25,
    costRateTaxes: 0.012,
    countryRiskPremium: 0.0110,
    inflationRate: 0.03,
    depreciationYears: 50, // Commercial buildings — max coeficiente 2%
    depreciationAuthority: "Ley del Impuesto sobre Sociedades, Art. 12.1, Tabla de Amortización",
  },
  "Italy": {
    taxRate: 0.279,        // IRES 24% + IRAP 3.9%
    costRateTaxes: 0.012,
    countryRiskPremium: 0.0168,
    inflationRate: 0.03,
    depreciationYears: 33, // Hotel buildings — coefficiente 3%
    depreciationAuthority: "DM 31/12/1988, Gruppo XVII — Alberghi",
  },
  "Portugal": {
    taxRate: 0.21,         // NHR regime benefits; standard 21%
    costRateTaxes: 0.008,
    countryRiskPremium: 0.0110,
    inflationRate: 0.03,
    depreciationYears: 50, // Commercial buildings — Decreto Regulamentar
    depreciationAuthority: "Decreto Regulamentar n.º 25/2009, Tabela II",
  },
  "Mexico": {
    taxRate: 0.30,
    costRateTaxes: 0.008,
    countryRiskPremium: 0.0246,
    inflationRate: 0.04,
    depreciationYears: 20, // Hotel buildings — 5% annual deduction
    depreciationAuthority: "Ley del ISR, Art. 34 Fracción I-c (inmuebles para hospedaje)",
  },
  "Colombia": {
    taxRate: 0.35,
    costRateTaxes: 0.018,
    countryRiskPremium: 0.0285,
    inflationRate: 0.04,
    depreciationYears: 20, // Commercial buildings — vida útil fiscal
    depreciationAuthority: "Estatuto Tributario, Art. 137, Decreto 3019 de 1989",
  },
  "Brazil": {
    taxRate: 0.34,         // IRPJ 25% + CSLL 9%
    costRateTaxes: 0.018,
    countryRiskPremium: 0.0324,
    inflationRate: 0.05,
    depreciationYears: 25, // Commercial buildings — 4% annual rate
    depreciationAuthority: "RIR/2018, Art. 311 (Instrução Normativa SRF 162/1998)",
  },
  "Argentina": {
    taxRate: 0.35,
    costRateTaxes: 0.015,
    countryRiskPremium: 0.0840,
    // USD inflation — luxury hospitality is dollar-priced; local peso inflation irrelevant
    inflationRate: 0.03,
    depreciationYears: 50, // Commercial buildings — 2% annual rate
    depreciationAuthority: "Ley de Impuesto a las Ganancias, Art. 84, Decreto 862/2019",
  },
  "El Salvador": {
    taxRate: 0.30,
    costRateTaxes: 0.010,
    countryRiskPremium: 0.0456,
    // Officially dollarized — USD inflation applies
    inflationRate: 0.03,
    depreciationYears: 20, // Commercial buildings — 5% annual rate
    depreciationAuthority: "Ley del Impuesto sobre la Renta, Art. 30",
  },
  "Panama": {
    taxRate: 0.25,
    costRateTaxes: 0.010,
    countryRiskPremium: 0.0246,
    // Effectively dollarized (Balboa = USD) — USD inflation applies
    inflationRate: 0.03,
    depreciationYears: 30, // Commercial buildings — Código Fiscal
    depreciationAuthority: "Código Fiscal de Panamá, Art. 697, Decreto 170/1993",
  },
};

export const SUPPORTED_COUNTRIES = Object.keys(COUNTRY_DEFAULTS);

export function getCountryDefaults(country: string): CountryDefaults | null {
  return COUNTRY_DEFAULTS[country] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// US STATE DEFAULTS
// When country = "United States", selecting a state refines:
//   taxRate      — Federal 21% + state corporate income tax
//   costRateTaxes — Property/real-estate tax as % of revenue
//
// exitCapRate and adrGrowthRate removed — research-engine-driven per property.
//
// Top 10 US hospitality markets by transaction volume and STR activity.
// ─────────────────────────────────────────────────────────────────────────────

export interface UsStateDefaults {
  taxRate: number;        // Federal 21% + state corporate income tax
  costRateTaxes: number;  // Property tax as % of revenue
  label: string;          // Display name
}

export const US_STATE_DEFAULTS: Record<string, UsStateDefaults> = {
  "Florida": {
    label: "Florida",
    taxRate: 0.265,        // 21% federal + 5.5% state corporate
    costRateTaxes: 0.010,
  },
  "California": {
    label: "California",
    taxRate: 0.299,        // 21% + 8.84% state (CA has high corp tax)
    costRateTaxes: 0.008,  // Prop 13 constrains assessed value growth
  },
  "New York": {
    label: "New York",
    taxRate: 0.275,        // 21% + 6.5% state
    costRateTaxes: 0.015,
  },
  "Texas": {
    label: "Texas",
    taxRate: 0.21,         // No state income tax
    costRateTaxes: 0.018,  // High property tax state
  },
  "Nevada": {
    label: "Nevada",
    taxRate: 0.21,         // No state income tax
    costRateTaxes: 0.006,
  },
  "Hawaii": {
    label: "Hawaii",
    taxRate: 0.254,        // 21% + 4.4% state
    costRateTaxes: 0.004,  // Very low property tax rate
  },
  "Colorado": {
    label: "Colorado",
    taxRate: 0.254,        // 21% + 4.4% state
    costRateTaxes: 0.006,
  },
  "Tennessee": {
    label: "Tennessee",
    taxRate: 0.275,        // 21% + 6.5% excise tax
    costRateTaxes: 0.007,
  },
  "Georgia": {
    label: "Georgia",
    taxRate: 0.268,        // 21% + 5.75%
    costRateTaxes: 0.009,
  },
  "Arizona": {
    label: "Arizona",
    taxRate: 0.259,        // 21% + 4.9%
    costRateTaxes: 0.006,
  },
};

export const SUPPORTED_US_STATES = Object.keys(US_STATE_DEFAULTS);

export function getUsStateDefaults(state: string): UsStateDefaults | null {
  return US_STATE_DEFAULTS[state] ?? null;
}
