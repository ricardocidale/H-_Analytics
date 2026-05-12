/**
 * bracket-catalog — Named constants for the ICP bracket catalog.
 *
 * The catalog defines 3–5 reusable ICP brackets characterised from real
 * hospitality brand comps. All bracket identifiers, service-consumption
 * types, and catalog metadata live here as named constants so call-sites
 * never embed string literals directly (per CLAUDE.md §1 no-magic-numbers).
 *
 * Service-consumption rules (baked into each bracket per R8/R9):
 *   - HOTEL:  consumes ALL Management Company service lines
 *   - STR:    consumes ONLY marketing, branding, and performance-bonus fees
 *   - MIXED:  blended consumption proportional to each sub-type's weight
 *
 * Bracket catalog and national tables live in Admin (Knowledge & Resources).
 * This file provides the code-side definitions so the assignment minion and
 * API route always work from the same source of truth.
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

export const BRACKET_ID_BOUTIQUE_UPSCALE_HOTEL = "boutique-upscale-hotel" as const;
export const BRACKET_ID_SOFT_BRAND_BOUTIQUE = "soft-brand-boutique" as const;
export const BRACKET_ID_PERFORMANCE_MANAGED_STR = "performance-managed-str" as const;
export const BRACKET_ID_AGRITOURISM_EXPERIENTIAL = "agritourism-experiential" as const;

export type BracketId =
  | typeof BRACKET_ID_BOUTIQUE_UPSCALE_HOTEL
  | typeof BRACKET_ID_SOFT_BRAND_BOUTIQUE
  | typeof BRACKET_ID_PERFORMANCE_MANAGED_STR
  | typeof BRACKET_ID_AGRITOURISM_EXPERIENTIAL;

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
    id: BRACKET_ID_BOUTIQUE_UPSCALE_HOTEL,
    name: "Boutique Upscale Hotel",
    archetypeLabel: "boutique upscale hotel",
    serviceConsumption: SERVICE_CONSUMPTION_HOTEL,
    description:
      "Independently branded boutique hotels in the upscale tier. Typically 20–80 rooms, $200–$600 ADR, strong F&B and wellness programming. Consumes all Management Company service lines.",
    colorToken: "chart-1",
  },
  {
    id: BRACKET_ID_SOFT_BRAND_BOUTIQUE,
    name: "Soft-Brand Boutique",
    archetypeLabel: "soft-brand boutique hotel",
    serviceConsumption: SERVICE_CONSUMPTION_HOTEL,
    description:
      "Boutique hotels affiliated with a major brand's soft-brand collection (e.g., Tapestry, Curio). Slightly higher distribution leverage; otherwise similar service profile to independent boutiques.",
    colorToken: "chart-2",
  },
  {
    id: BRACKET_ID_PERFORMANCE_MANAGED_STR,
    name: "Performance-Managed STR Cluster",
    archetypeLabel: "performance-managed short-term rental cluster",
    serviceConsumption: SERVICE_CONSUMPTION_STR,
    description:
      "Clusters of short-term rental properties (vacation homes, cabins, condos) managed for performance optimisation. Consumes only marketing, branding, and performance-bonus service lines.",
    colorToken: "primary",
  },
  {
    id: BRACKET_ID_AGRITOURISM_EXPERIENTIAL,
    name: "Agritourism / Experiential Lodge",
    archetypeLabel: "agritourism or experiential lodge",
    serviceConsumption: SERVICE_CONSUMPTION_MIXED,
    description:
      "Working farms, ranch lodges, glamping, and experiential retreats. Blended service-consumption profile reflecting both hotel-style accommodation and STR-style short-stay units.",
    colorToken: "chart-3",
  },
] as const;

export const CATALOG_BRACKET_COUNT = BRACKET_CATALOG.length;
