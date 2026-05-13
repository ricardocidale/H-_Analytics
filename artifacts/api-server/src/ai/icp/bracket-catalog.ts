/**
 * bracket-catalog — Named constants for the ICP bracket catalog.
 *
 * The catalog defines 3–5 reusable ICP brackets characterised from real
 * hospitality brand comps. All bracket identifiers, service-consumption
 * types, and catalog metadata live here as named constants so call-sites
 * never embed string literals directly (per CLAUDE.md §1 no-magic-numbers).
 *
 * **Plan 2026-05-13-001 U7 rewrite (2026-05-13):** the previous catalog of
 * 4 *service-profile* brackets (`boutique-upscale-hotel`, `soft-brand-
 * boutique`, `performance-managed-str`, `agritourism-experiential`) is
 * retired in favour of 5 *geography-tier* brackets keyed to plan §U7. Each
 * new bracket still carries a `serviceConsumption` flag so the existing
 * mix-mechanism math in `lib/engine/src/company/company-engine.ts` keeps
 * working without modification — only the bracket identities change. The
 * five new brackets also carry per-bracket Layer-2 default templates for
 * `exit_cap_rate` and `refi_max_ltv_to_original`, the substrate for the
 * per-property best-fit resolver introduced in plan U6.
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

// ── Bracket identifiers (geography-tier, plan U7 2026-05-13) ──────────────

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

// ── Country group constants (used by BEST_FIT_RULES below) ────────────────
//
// Named const arrays so the best-fit resolver can run substring-style matches
// without literal country strings scattered across the catalog. The lists
// stay small intentionally — the canonical demo portfolio touches the US plus
// a handful of Latin American countries. Extend cautiously; large country
// lists usually mean the bracket dimension is wrong.

export const COUNTRY_GROUP_US = ["United States"] as const;
export const COUNTRY_GROUP_LATAM = [
  "Colombia",
  "Mexico",
  "Brazil",
  "Argentina",
  "Peru",
  "Chile",
  "Costa Rica",
  "Panama",
  "Ecuador",
  "Uruguay",
] as const;

// ── Best-fit rule priorities (Davi ordering, U7 seed) ─────────────────────

/** Most-specific rule: LatAm + STR luxury single-key. Demo anchor: Medellín Duplex. */
const PRIORITY_LATAM_LUXURY_STR_SINGLE_KEY = 100;
/** LatAm + rural / illiquid market keywords. Demo anchor: Jano Grande Ranch. */
const PRIORITY_LATAM_RURAL_ILLIQUID = 90;
/** US + tertiary / mountain / northeast keywords. Demo anchor: Belleayre etc. */
const PRIORITY_US_TERTIARY_BOUTIQUE_RESORT = 70;
/** LatAm catch-all. Demo anchor: "San Diego" Cartagena. */
const PRIORITY_LATAM_PRIME_URBAN_BOUTIQUE = 60;
/** US catch-all. Last rule in priority order. */
const PRIORITY_US_GATEWAY_BOUTIQUE = 40;

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
    archetypeLabel: "US tertiary-market boutique resort",
    serviceConsumption: SERVICE_CONSUMPTION_HOTEL,
    description:
      "Independent boutique resorts in US tertiary or mountain/northeast leisure markets (Hudson Valley, Catskills, Asheville, Blue Ridge). 10–60 keys, F&B and wellness programming, event-driven revenue. Consumes the full Management Company service-line stack. Going-in caps trade tight to market; a 10-year hold premium pushes effective exit caps toward the high single digits.",
    colorToken: "chart-1",
  },
  {
    id: BRACKET_ID_US_GATEWAY_BOUTIQUE,
    name: "US Gateway Boutique",
    archetypeLabel: "US gateway-market urban boutique hotel",
    serviceConsumption: SERVICE_CONSUMPTION_HOTEL,
    description:
      "Urban boutique hotels in US gateway markets (NYC, Boston, Miami, SF, LA). Independent or soft-brand affiliated; benefits from primary-market distribution leverage and tighter cap-rate trading. Consumes the full Management Company service-line stack.",
    colorToken: "chart-2",
  },
  {
    id: BRACKET_ID_LATAM_PRIME_URBAN_BOUTIQUE,
    name: "Latin America Prime Urban Boutique",
    archetypeLabel: "Latin America prime-urban boutique hotel",
    serviceConsumption: SERVICE_CONSUMPTION_HOTEL,
    description:
      "Urban boutique hotels in prime Latin American gateway markets (Cartagena, Bogotá, Mexico City, São Paulo). 20–80 keys, brand-equity-driven, strong F&B. Consumes the full Management Company service-line stack. Country-risk premium plus thinner trade comps push exit caps above US gateway levels.",
    colorToken: "chart-3",
  },
  {
    id: BRACKET_ID_LATAM_RURAL_ILLIQUID,
    name: "Latin America Rural / Illiquid",
    archetypeLabel: "Latin America rural or illiquid-market lodge",
    serviceConsumption: SERVICE_CONSUMPTION_MIXED,
    description:
      "Working farms, ranches, jungle lodges, and experiential retreats in rural or illiquid Latin American markets. Blended hotel + STR service consumption (F&B with curated short-stay units). Exit caps reflect thin buyer pool and high country/illiquidity premium.",
    colorToken: "chart-4",
  },
  {
    id: BRACKET_ID_LATAM_LUXURY_STR_SINGLE_KEY,
    name: "Latin America Luxury STR (Single-Key)",
    archetypeLabel: "Latin America luxury single-key short-term rental",
    serviceConsumption: SERVICE_CONSUMPTION_STR,
    description:
      "Single-key luxury short-term rentals in Latin American markets — penthouses, villas, signature single-unit properties charging $1,000+ ADR. Consumes only marketing, branding, and performance-bonus service lines (no Mgmt Co F&B, ops, or staffing). Strategic per-entity exit overrides (e.g. package-sale exits to existing guest networks) may push individual property exit caps below this bracket-template default.",
    colorToken: "chart-5",
  },
] as const;

export const CATALOG_BRACKET_COUNT = BRACKET_CATALOG.length;

// ── Best-fit selection rules (SEED ONLY — Plan 2026-05-13-001 U7) ─────────
//
// `BEST_FIT_RULES_SEED` is the in-code source of truth ONLY for the runtime
// guard `icp-brackets-004.ts`, which UPSERTs these rows into the
// `icp_brackets` table (columns `match_countries`, `match_business_models`,
// `match_quality_tiers`, `match_keywords`, `match_priority`,
// `match_rationale`). After seeding, the rule set lives in the DB so the
// catalog can evolve without a code deploy (admin edits the columns via the
// K&R Tables surface).
//
// At runtime, Davi (per-property best-fit classifier minion) reads the rule
// set from `icp_brackets` rows — NOT from this const. Do not import
// `BEST_FIT_RULES_SEED` from any runtime classifier; it is intentionally
// seed-only.

export interface BestFitRuleSeed {
  bracketId: BracketId;
  /** Higher fires first. Ties broken by id. */
  priority: number;
  /** Optional per-dimension predicates; missing = wildcard. */
  countries?: readonly string[];
  businessModels?: readonly string[];
  qualityTiers?: readonly string[];
  marketKeywords?: readonly string[];
  rationale: string;
}

export const BEST_FIT_RULES_SEED: readonly BestFitRuleSeed[] = [
  {
    // Most specific: LatAm + vrbo/vrbo_owner_managed + luxury → single-key STR.
    // Demo portfolio anchor: Medellín Duplex (Colombia, vrbo_owner_managed,
    // $1,500 ADR luxury positioning).
    bracketId: BRACKET_ID_LATAM_LUXURY_STR_SINGLE_KEY,
    priority: PRIORITY_LATAM_LUXURY_STR_SINGLE_KEY,
    countries: COUNTRY_GROUP_LATAM,
    businessModels: ["vrbo", "vrbo_owner_managed"],
    qualityTiers: ["luxury"],
    rationale:
      "Latin American single-key STR with luxury positioning — the Medellín Duplex archetype.",
  },
  {
    // LatAm + rural market keywords → rural/illiquid lodge.
    // Demo portfolio anchor: Jano Grande Ranch (Colombia, rural).
    bracketId: BRACKET_ID_LATAM_RURAL_ILLIQUID,
    priority: PRIORITY_LATAM_RURAL_ILLIQUID,
    countries: COUNTRY_GROUP_LATAM,
    marketKeywords: ["rural", "ranch", "lodge", "campo", "hacienda", "finca"],
    rationale:
      "Latin American rural / illiquid market — ranch lodges, haciendas, jungle/experiential retreats.",
  },
  {
    // LatAm catch-all → prime urban boutique.
    // Demo portfolio anchor: \"San Diego\" Cartagena (Colombia, urban boutique).
    bracketId: BRACKET_ID_LATAM_PRIME_URBAN_BOUTIQUE,
    priority: PRIORITY_LATAM_PRIME_URBAN_BOUTIQUE,
    countries: COUNTRY_GROUP_LATAM,
    rationale:
      "Latin American gateway market with no rural / luxury-STR overlay — falls into prime urban boutique.",
  },
  {
    // US + tertiary/mountain/northeast keywords → tertiary boutique resort.
    // Demo portfolio anchor: Belleayre Mountain, Loch Sheldrake, Lakeview
    // Haven Lodge, Scott's House (all US tertiary leisure markets).
    bracketId: BRACKET_ID_US_TERTIARY_BOUTIQUE_RESORT,
    priority: PRIORITY_US_TERTIARY_BOUTIQUE_RESORT,
    countries: COUNTRY_GROUP_US,
    marketKeywords: [
      "tertiary",
      "mountain",
      "catskills",
      "hudson",
      "lake",
      "ranch",
      "resort",
      "blue ridge",
      "northeast",
      "vermont",
      "asheville",
      "adirondack",
    ],
    rationale:
      "US tertiary-market boutique resort — Hudson Valley / Catskills / Mountain South.",
  },
  {
    // US catch-all → gateway boutique. Last rule in priority order; any US
    // property not flagged tertiary lands here.
    bracketId: BRACKET_ID_US_GATEWAY_BOUTIQUE,
    priority: PRIORITY_US_GATEWAY_BOUTIQUE,
    countries: COUNTRY_GROUP_US,
    rationale:
      "US gateway market with no tertiary-resort keyword overlay — primary urban boutique.",
  },
] as const;
