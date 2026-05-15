/**
 * bracket-catalog — Named constants for the ICP bracket catalog.
 *
 * The catalog defines 5 geography-tier ICP brackets characterised from real
 * hospitality market comps. All bracket identifiers, service-consumption
 * types, and catalog metadata live here as named constants so call-sites
 * never embed string literals directly (per CLAUDE.md §1 no-magic-numbers).
 *
 * Geography-tier design (Plan 2026-05-13-001 §U7):
 *   US markets:
 *     - US Tertiary Boutique Resort  — vacation/drive-to destinations
 *     - US Gateway Boutique          — primary gateway city markets
 *   LATAM markets:
 *     - LATAM Prime Urban Boutique   — major urban centres
 *     - LATAM Rural / Illiquid       — secondary / rural markets
 *     - LATAM Luxury STR Single-Key  — luxury short-term rental
 *
 * Service-consumption rules (baked into each bracket per R8/R9):
 *   - hotel: consumes ALL Management Company service lines
 *   - str:   consumes ONLY marketing, branding, and performance-bonus fees
 *   - mixed: blended consumption proportional to each sub-type's weight
 *
 * Match rules (which properties map to which bracket) are stored in the
 * icp_brackets table (match_countries, match_business_models, etc.) and
 * evaluated at runtime by the Davi minion (davi.ts). The catalog here
 * provides the code-side definitions for the assignment minion and API routes.
 */

// ── Service-consumption rule identifiers ──────────────────────────────────

export const SERVICE_CONSUMPTION_HOTEL = "hotel" as const;
export const SERVICE_CONSUMPTION_STR = "str" as const;
export const SERVICE_CONSUMPTION_MIXED = "mixed" as const;

export type ServiceConsumptionType =
  | typeof SERVICE_CONSUMPTION_HOTEL
  | typeof SERVICE_CONSUMPTION_STR
  | typeof SERVICE_CONSUMPTION_MIXED;

// ── Bracket identifiers ───────────────────────────────────────────────────

export const BRACKET_ID_US_TERTIARY_BOUTIQUE_RESORT = "us-tertiary-boutique-resort" as const;
export const BRACKET_ID_US_GATEWAY_BOUTIQUE = "us-gateway-boutique" as const;
export const BRACKET_ID_LATAM_PRIME_URBAN_BOUTIQUE = "latam-prime-urban-boutique" as const;
export const BRACKET_ID_LATAM_RURAL_ILLIQUID = "latam-rural-illiquid" as const;
export const BRACKET_ID_LATAM_LUXURY_STR_SINGLE_KEY = "latam-luxury-str-single-key" as const;

export type BracketId =
  | typeof BRACKET_ID_US_TERTIARY_BOUTIQUE_RESORT
  | typeof BRACKET_ID_US_GATEWAY_BOUTIQUE
  | typeof BRACKET_ID_LATAM_PRIME_URBAN_BOUTIQUE
  | typeof BRACKET_ID_LATAM_RURAL_ILLIQUID
  | typeof BRACKET_ID_LATAM_LUXURY_STR_SINGLE_KEY;

// ── Static catalog definition ─────────────────────────────────────────────

export interface CatalogBracket {
  id: BracketId;
  name: string;
  archetypeLabel: string;
  serviceConsumption: ServiceConsumptionType;
  description: string;
  /** Tailwind-compatible colour token pair used for card rendering. */
  colorToken: string;
}

export const BRACKET_CATALOG: readonly CatalogBracket[] = [
  {
    id: BRACKET_ID_US_TERTIARY_BOUTIQUE_RESORT,
    name: "US Tertiary Boutique Resort",
    archetypeLabel: "US tertiary boutique resort",
    serviceConsumption: SERVICE_CONSUMPTION_HOTEL,
    description:
      "Independently branded boutique hotels and resorts in US tertiary and drive-to vacation destinations (mountain, beach, lake, vineyard). Typically 20–80 rooms, $250–$600 ADR. Consumes all Management Company service lines.",
    colorToken: "chart-1",
  },
  {
    id: BRACKET_ID_US_GATEWAY_BOUTIQUE,
    name: "US Gateway Boutique",
    archetypeLabel: "US gateway city boutique hotel",
    serviceConsumption: SERVICE_CONSUMPTION_HOTEL,
    description:
      "Boutique hotels in US primary and secondary gateway city markets. Strong distribution, higher barriers to entry, compressed exit cap rates. Consumes all Management Company service lines.",
    colorToken: "chart-2",
  },
  {
    id: BRACKET_ID_LATAM_PRIME_URBAN_BOUTIQUE,
    name: "LATAM Prime Urban Boutique",
    archetypeLabel: "LATAM prime urban boutique hotel",
    serviceConsumption: SERVICE_CONSUMPTION_HOTEL,
    description:
      "Upscale boutique hotels in Latin America's prime urban markets (Medellín, Bogotá, Cartagena, Mexico City, Lima, Buenos Aires, Santiago). Higher USD-equivalent ADRs; strong positioning for institutional capital. Consumes all Management Company service lines.",
    colorToken: "chart-3",
  },
  {
    id: BRACKET_ID_LATAM_RURAL_ILLIQUID,
    name: "LATAM Rural / Illiquid",
    archetypeLabel: "LATAM rural or illiquid market property",
    serviceConsumption: SERVICE_CONSUMPTION_MIXED,
    description:
      "Hotels, lodges, and experiential properties in Latin America's secondary and rural markets. Longer hold periods, wider exit cap spreads, and blended hotel/STR service consumption typical of hacienda and eco-lodge formats.",
    colorToken: "primary",
  },
  {
    id: BRACKET_ID_LATAM_LUXURY_STR_SINGLE_KEY,
    name: "LATAM Luxury STR / Single-Key",
    archetypeLabel: "LATAM luxury short-term rental single-key",
    serviceConsumption: SERVICE_CONSUMPTION_STR,
    description:
      "Luxury and upscale short-term rental properties (villas, penthouses, curated vacation homes) in Latin America. Single-key or micro-portfolio format. Consumes only marketing, branding, and performance-bonus service lines.",
    colorToken: "chart-4",
  },
] as const;

export const CATALOG_BRACKET_COUNT = BRACKET_CATALOG.length;
