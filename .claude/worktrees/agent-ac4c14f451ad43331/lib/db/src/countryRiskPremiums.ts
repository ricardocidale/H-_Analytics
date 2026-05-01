/**
 * Country Risk Premium (CRP) lookup table.
 *
 * Source: Aswath Damodaran, NYU Stern — January 2026 update.
 * https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html
 *
 * CRP represents the additional equity return premium required for investing
 * in a given country vs. the United States (baseline = 0%).
 * Used in cost of equity calculation: Re = base Re + CRP
 *
 * Values are decimals (e.g. 0.0285 = 2.85%).
 */

export interface CountryRiskEntry {
  country: string;
  crp: number;
  rating: string;
  region: string;
}

export const COUNTRY_RISK_PREMIUMS: CountryRiskEntry[] = [
  { country: "United States", crp: 0.0000, rating: "Aa1", region: "North America" },
  { country: "Canada", crp: 0.0049, rating: "Aaa", region: "North America" },
  { country: "Mexico", crp: 0.0246, rating: "Baa2", region: "Latin America" },
  { country: "Colombia", crp: 0.0285, rating: "Baa2", region: "Latin America" },
  { country: "Brazil", crp: 0.0324, rating: "Ba1", region: "Latin America" },
  { country: "Argentina", crp: 0.0840, rating: "Ca", region: "Latin America" },
  { country: "Chile", crp: 0.0110, rating: "A1", region: "Latin America" },
  { country: "Peru", crp: 0.0207, rating: "Baa1", region: "Latin America" },
  { country: "Costa Rica", crp: 0.0324, rating: "Ba3", region: "Latin America" },
  { country: "Panama", crp: 0.0246, rating: "Baa2", region: "Latin America" },
  { country: "Uruguay", crp: 0.0207, rating: "Baa1", region: "Latin America" },
  { country: "Ecuador", crp: 0.0720, rating: "Caa3", region: "Latin America" },
  { country: "Dominican Republic", crp: 0.0324, rating: "Ba3", region: "Latin America" },
  { country: "United Kingdom", crp: 0.0049, rating: "Aa3", region: "Europe" },
  { country: "Germany", crp: 0.0000, rating: "Aaa", region: "Europe" },
  { country: "France", crp: 0.0070, rating: "Aa2", region: "Europe" },
  { country: "Spain", crp: 0.0110, rating: "A2", region: "Europe" },
  { country: "Italy", crp: 0.0168, rating: "Baa3", region: "Europe" },
  { country: "Portugal", crp: 0.0110, rating: "A3", region: "Europe" },
  { country: "Greece", crp: 0.0207, rating: "Ba1", region: "Europe" },
  { country: "Switzerland", crp: 0.0000, rating: "Aaa", region: "Europe" },
  { country: "Netherlands", crp: 0.0000, rating: "Aaa", region: "Europe" },
  { country: "Ireland", crp: 0.0049, rating: "A1", region: "Europe" },
  { country: "Austria", crp: 0.0049, rating: "Aa1", region: "Europe" },
  { country: "Sweden", crp: 0.0000, rating: "Aaa", region: "Europe" },
  { country: "Norway", crp: 0.0000, rating: "Aaa", region: "Europe" },
  { country: "Denmark", crp: 0.0000, rating: "Aaa", region: "Europe" },
  { country: "Finland", crp: 0.0049, rating: "Aa1", region: "Europe" },
  { country: "Belgium", crp: 0.0070, rating: "Aa3", region: "Europe" },
  { country: "Poland", crp: 0.0110, rating: "A2", region: "Europe" },
  { country: "Czech Republic", crp: 0.0070, rating: "Aa3", region: "Europe" },
  { country: "Turkey", crp: 0.0456, rating: "B3", region: "Europe" },
  { country: "Japan", crp: 0.0070, rating: "A1", region: "Asia Pacific" },
  { country: "China", crp: 0.0110, rating: "A1", region: "Asia Pacific" },
  { country: "South Korea", crp: 0.0070, rating: "Aa2", region: "Asia Pacific" },
  { country: "India", crp: 0.0207, rating: "Baa3", region: "Asia Pacific" },
  { country: "Australia", crp: 0.0000, rating: "Aaa", region: "Asia Pacific" },
  { country: "New Zealand", crp: 0.0049, rating: "Aaa", region: "Asia Pacific" },
  { country: "Singapore", crp: 0.0000, rating: "Aaa", region: "Asia Pacific" },
  { country: "Hong Kong", crp: 0.0070, rating: "Aa3", region: "Asia Pacific" },
  { country: "Taiwan", crp: 0.0070, rating: "Aa3", region: "Asia Pacific" },
  { country: "Thailand", crp: 0.0168, rating: "Baa1", region: "Asia Pacific" },
  { country: "Malaysia", crp: 0.0110, rating: "A3", region: "Asia Pacific" },
  { country: "Indonesia", crp: 0.0207, rating: "Baa2", region: "Asia Pacific" },
  { country: "Philippines", crp: 0.0207, rating: "Baa2", region: "Asia Pacific" },
  { country: "Vietnam", crp: 0.0324, rating: "Ba2", region: "Asia Pacific" },
  { country: "United Arab Emirates", crp: 0.0070, rating: "Aa2", region: "Middle East" },
  { country: "Saudi Arabia", crp: 0.0070, rating: "A1", region: "Middle East" },
  { country: "Israel", crp: 0.0110, rating: "A1", region: "Middle East" },
  { country: "Qatar", crp: 0.0070, rating: "Aa3", region: "Middle East" },
  { country: "South Africa", crp: 0.0456, rating: "Ba2", region: "Africa" },
  { country: "Nigeria", crp: 0.0720, rating: "Caa1", region: "Africa" },
  { country: "Kenya", crp: 0.0456, rating: "B3", region: "Africa" },
  { country: "Egypt", crp: 0.0720, rating: "Caa1", region: "Africa" },
  { country: "Morocco", crp: 0.0246, rating: "Ba1", region: "Africa" },
];

const normalizedMap = new Map<string, CountryRiskEntry>();
for (const entry of COUNTRY_RISK_PREMIUMS) {
  normalizedMap.set(entry.country.toLowerCase(), entry);
}

const LOCATION_COUNTRY_PATTERNS: [RegExp, string][] = [
  [/\bcolombia\b/i, "colombia"],
  [/\bmedell[ií]n\b/i, "colombia"],
  [/\bbogot[aá]\b/i, "colombia"],
  [/\bcali\b/i, "colombia"],
  [/\bcartagena\b/i, "colombia"],
  [/\bantioquia\b/i, "colombia"],
  [/\bnew york\b/i, "united states"],
  [/\butah\b/i, "united states"],
  [/\bcalifornia\b/i, "united states"],
  [/\btexas\b/i, "united states"],
  [/\bflorida\b/i, "united states"],
  [/\bcolorado\b/i, "united states"],
  [/\barizona\b/i, "united states"],
  [/\bnevada\b/i, "united states"],
  [/\bhawaii\b/i, "united states"],
  [/\bmontana\b/i, "united states"],
  [/\bwyoming\b/i, "united states"],
  [/\borgon\b/i, "united states"],
  [/\bwashington\b/i, "united states"],
  [/\bcatskills\b/i, "united states"],
  [/\bsullivan county\b/i, "united states"],
  [/\bogden valley\b/i, "united states"],
  [/\bsan diego\b/i, "united states"],
  [/\bmiami\b/i, "united states"],
  [/\blos angeles\b/i, "united states"],
  [/\bchicago\b/i, "united states"],
  [/\bmexico\b/i, "mexico"],
  [/\bcancun\b/i, "mexico"],
  [/\bbrazil\b/i, "brazil"],
  [/\bsão paulo\b/i, "brazil"],
  [/\brio de janeiro\b/i, "brazil"],
  [/\bcanada\b/i, "canada"],
  [/\btoronto\b/i, "canada"],
  [/\bvancouver\b/i, "canada"],
];

export function lookupCountryRiskPremium(countryOrLocation: string): CountryRiskEntry | null {
  if (!countryOrLocation) return null;

  const direct = normalizedMap.get(countryOrLocation.toLowerCase().trim());
  if (direct) return direct;

  for (const [pattern, country] of LOCATION_COUNTRY_PATTERNS) {
    if (pattern.test(countryOrLocation)) {
      return normalizedMap.get(country) ?? null;
    }
  }

  return null;
}

export function getAllCountryRiskPremiums(): CountryRiskEntry[] {
  return COUNTRY_RISK_PREMIUMS;
}
