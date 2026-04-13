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
  depreciationMethod: "straight_line";
  depreciationAuthority: string;
  capitalGainsRate: number;
  currency: string;
  currencySymbol: string;
}

export const COUNTRY_DEFAULTS: Record<string, CountryDefaults> = {
  "United States": {
    taxRate: 0.21,         // Federal only — state layer applied via US_STATE_DEFAULTS
    costRateTaxes: 0.012,
    countryRiskPremium: 0.0000,
    inflationRate: 0.03,
    depreciationYears: 39, // Nonresidential real property (hotels) — MACRS
    depreciationMethod: "straight_line",
    depreciationAuthority: "IRS Publication 946, IRC §168(e)(2)(A)",
    capitalGainsRate: 0.20,   // Federal long-term capital gains (top bracket)
    currency: "USD",
    currencySymbol: "$",
  },
  "Canada": {
    taxRate: 0.265,        // Federal 15% + avg provincial ~11.5%
    costRateTaxes: 0.015,
    countryRiskPremium: 0.0049,
    inflationRate: 0.03,
    depreciationYears: 25, // CCA Class 1 non-residential buildings (4% declining → ~25yr SL equivalent)
    depreciationMethod: "straight_line",
    depreciationAuthority: "CRA Income Tax Regulations, CCA Class 1",
    capitalGainsRate: 0.2667, // 50% inclusion rate × top marginal rate ~53.3%
    currency: "CAD",
    currencySymbol: "CA$",
  },
  "France": {
    taxRate: 0.25,
    costRateTaxes: 0.015,
    countryRiskPremium: 0.0070,
    inflationRate: 0.03,
    depreciationYears: 25, // Commercial buildings — Plan Comptable Général
    depreciationMethod: "straight_line",
    depreciationAuthority: "Code Général des Impôts, Art. 39-1-2°",
    capitalGainsRate: 0.25,   // Standard corporate rate applies to gains
    currency: "EUR",
    currencySymbol: "€",
  },
  "Spain": {
    taxRate: 0.25,
    costRateTaxes: 0.012,
    countryRiskPremium: 0.0110,
    inflationRate: 0.03,
    depreciationYears: 50, // Commercial buildings — max coeficiente 2%
    depreciationMethod: "straight_line",
    depreciationAuthority: "Ley del Impuesto sobre Sociedades, Art. 12.1, Tabla de Amortización",
    capitalGainsRate: 0.25,   // Included in corporate tax base
    currency: "EUR",
    currencySymbol: "€",
  },
  "Italy": {
    taxRate: 0.279,        // IRES 24% + IRAP 3.9%
    costRateTaxes: 0.012,
    countryRiskPremium: 0.0168,
    inflationRate: 0.03,
    depreciationYears: 33, // Hotel buildings — coefficiente 3%
    depreciationMethod: "straight_line",
    depreciationAuthority: "DM 31/12/1988, Gruppo XVII — Alberghi",
    capitalGainsRate: 0.24,   // IRES rate on corporate capital gains
    currency: "EUR",
    currencySymbol: "€",
  },
  "Portugal": {
    taxRate: 0.21,         // NHR regime benefits; standard 21%
    costRateTaxes: 0.008,
    countryRiskPremium: 0.0110,
    inflationRate: 0.03,
    depreciationYears: 50, // Commercial buildings — Decreto Regulamentar
    depreciationMethod: "straight_line",
    depreciationAuthority: "Decreto Regulamentar n.º 25/2009, Tabela II",
    capitalGainsRate: 0.21,   // Standard IRC rate on corporate gains
    currency: "EUR",
    currencySymbol: "€",
  },
  "Mexico": {
    taxRate: 0.30,
    costRateTaxes: 0.008,
    countryRiskPremium: 0.0246,
    inflationRate: 0.04,
    depreciationYears: 20, // Hotel buildings — 5% annual deduction
    depreciationMethod: "straight_line",
    depreciationAuthority: "Ley del ISR, Art. 34 Fracción I-c (inmuebles para hospedaje)",
    capitalGainsRate: 0.30,   // Gains taxed as ordinary corporate income
    currency: "MXN",
    currencySymbol: "MX$",
  },
  "Colombia": {
    taxRate: 0.35,
    costRateTaxes: 0.018,
    countryRiskPremium: 0.0285,
    inflationRate: 0.04,
    depreciationYears: 20, // Commercial buildings — vida útil fiscal
    depreciationMethod: "straight_line",
    depreciationAuthority: "Estatuto Tributario, Art. 137, Decreto 3019 de 1989",
    capitalGainsRate: 0.15,   // Ganancia ocasional rate (Art. 313 ET)
    currency: "COP",
    currencySymbol: "COL$",
  },
  "Brazil": {
    taxRate: 0.34,         // IRPJ 25% + CSLL 9%
    costRateTaxes: 0.018,
    countryRiskPremium: 0.0324,
    inflationRate: 0.05,
    depreciationYears: 25, // Commercial buildings — 4% annual rate
    depreciationMethod: "straight_line",
    depreciationAuthority: "RIR/2018, Art. 311 (Instrução Normativa SRF 162/1998)",
    capitalGainsRate: 0.34,   // Corporate gains taxed at combined IRPJ+CSLL rate
    currency: "BRL",
    currencySymbol: "R$",
  },
  "Argentina": {
    taxRate: 0.35,
    costRateTaxes: 0.015,
    countryRiskPremium: 0.0840,
    // USD inflation — luxury hospitality is dollar-priced; local peso inflation irrelevant
    inflationRate: 0.03,
    depreciationYears: 50, // Commercial buildings — 2% annual rate
    depreciationMethod: "straight_line",
    depreciationAuthority: "Ley de Impuesto a las Ganancias, Art. 84, Decreto 862/2019",
    capitalGainsRate: 0.15,   // Cedular tax on real property capital gains
    currency: "ARS",
    currencySymbol: "AR$",
  },
  "El Salvador": {
    taxRate: 0.30,
    costRateTaxes: 0.010,
    countryRiskPremium: 0.0456,
    // Officially dollarized — USD inflation applies
    inflationRate: 0.03,
    depreciationYears: 20, // Commercial buildings — 5% annual rate
    depreciationMethod: "straight_line",
    depreciationAuthority: "Ley del Impuesto sobre la Renta, Art. 30",
    capitalGainsRate: 0.10,   // 10% on capital gains (Art. 14 LISR)
    currency: "USD",
    currencySymbol: "$",
  },
  "Panama": {
    taxRate: 0.25,
    costRateTaxes: 0.010,
    countryRiskPremium: 0.0246,
    // Effectively dollarized (Balboa = USD) — USD inflation applies
    inflationRate: 0.03,
    depreciationYears: 30, // Commercial buildings — Código Fiscal
    depreciationMethod: "straight_line",
    depreciationAuthority: "Código Fiscal de Panamá, Art. 697, Decreto 170/1993",
    capitalGainsRate: 0.10,   // 10% on real property gains (Art. 701 CF)
    currency: "USD",
    currencySymbol: "$",
  },
  "United Kingdom": {
    taxRate: 0.25,         // Corporation Tax Act 2010, main rate (2024)
    costRateTaxes: 0.012,  // Council Tax / Business Rates (~1.2% of revenue equivalent)
    countryRiskPremium: 0.0000,
    inflationRate: 0.03,
    depreciationYears: 50, // HMRC Capital Allowances — structures & buildings (2% SL)
    depreciationMethod: "straight_line",
    depreciationAuthority: "HMRC Capital Allowances Act 2001, Structures and Buildings Allowance (SBA)",
    capitalGainsRate: 0.25,   // Corporation tax rate applies to corporate gains
    currency: "GBP",
    currencySymbol: "£",
  },
  "Greece": {
    taxRate: 0.22,
    costRateTaxes: 0.008,  // ENFIA (Unified Property Tax) ~0.8%
    countryRiskPremium: 0.0150,
    inflationRate: 0.03,
    depreciationYears: 40, // Commercial buildings — 2.5% SL rate
    depreciationMethod: "straight_line",
    depreciationAuthority: "Greek Income Tax Code (L.4172/2013), Art. 24",
    capitalGainsRate: 0.22,   // Corporate gains taxed at standard corporate rate
    currency: "EUR",
    currencySymbol: "€",
  },
  "Costa Rica": {
    taxRate: 0.30,
    costRateTaxes: 0.0025, // Municipal property tax (Impuesto de Bienes Inmuebles) ~0.25%
    countryRiskPremium: 0.0300,
    inflationRate: 0.04,
    depreciationYears: 50, // Commercial buildings — 2% SL rate
    depreciationMethod: "straight_line",
    depreciationAuthority: "Ley del Impuesto sobre la Renta (Ley 7092), Art. 8 inciso f",
    capitalGainsRate: 0.15,   // 15% on capital gains (Ley 9635, 2018 reform)
    currency: "CRC",
    currencySymbol: "₡",
  },
  "Dominican Republic": {
    taxRate: 0.27,
    costRateTaxes: 0.010,  // IPI (Impuesto al Patrimonio Inmobiliario) ~1.0%
    countryRiskPremium: 0.0350,
    inflationRate: 0.04,
    depreciationYears: 20, // Commercial buildings — 5% SL rate
    depreciationMethod: "straight_line",
    depreciationAuthority: "Código Tributario (Ley 11-92), Art. 287",
    capitalGainsRate: 0.27,   // Gains taxed as ordinary income at corporate rate
    currency: "DOP",
    currencySymbol: "RD$",
  },
  "Uruguay": {
    taxRate: 0.25,         // IRAE (Impuesto a la Renta de las Actividades Económicas)
    costRateTaxes: 0.015,  // Contribución Inmobiliaria ~1.5%
    countryRiskPremium: 0.0200,
    inflationRate: 0.04,
    depreciationYears: 50, // Commercial buildings — 2% SL rate
    depreciationMethod: "straight_line",
    depreciationAuthority: "Título 4, Texto Ordenado 1996 (IRAE), Art. 30",
    capitalGainsRate: 0.25,   // Corporate gains taxed at IRAE rate
    currency: "UYU",
    currencySymbol: "$U",
  },
  "Peru": {
    taxRate: 0.295,        // 29.5% corporate income tax rate
    costRateTaxes: 0.010,  // Impuesto Predial ~1.0%
    countryRiskPremium: 0.0250,
    inflationRate: 0.04,
    depreciationYears: 33, // Commercial buildings — 3% SL rate (Art. 39 LIR)
    depreciationMethod: "straight_line",
    depreciationAuthority: "Ley del Impuesto a la Renta, Art. 39 (Decreto Supremo 179-2004-EF)",
    capitalGainsRate: 0.295,  // Corporate gains taxed at standard rate
    currency: "PEN",
    currencySymbol: "S/",
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
