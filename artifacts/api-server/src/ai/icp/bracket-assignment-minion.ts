/**
 * bracket-assignment-minion — Deterministic minion that reads a Management
 * Company's portfolio and global assumptions then emits a weighted ICP
 * bracket mix.
 *
 * Minion contract (CLAUDE.md §10):
 *   - No LLM calls, no judgment — fully deterministic given the same inputs.
 *   - Returns a BracketMixData with entries summing to exactly 1.0.
 *   - Every numeric weight is derived from portfolio signals, never hardcoded
 *     as an inline literal (per CLAUDE.md §1 no-magic-numbers).
 *
 * Algorithm (heuristic — all thresholds are named constants):
 *   1. Classify each property as HOTEL, STR, or MIXED based on:
 *        - `businessModel` / `hospitalityType` columns (when present)
 *        - `propertyType` text scan for "str", "vacation", "airbnb", "short"
 *        - Falls back to HOTEL for unclassified properties
 *   2. Within the HOTEL bucket, split BOUTIQUE_UPSCALE vs SOFT_BRAND based
 *      on quality tier (starRating / assetDefinition.level / propertyLabel).
 *   3. Within the MIXED bucket, map to AGRITOURISM_EXPERIENTIAL.
 *   4. Compute raw counts, normalise to weights summing to 1.0.
 *   5. If portfolio is empty, fall back to EMPTY_PORTFOLIO_DEFAULT_MIX.
 *
 * Evidence narrative is produced deterministically from the portfolio stats.
 */

import type { Property, GlobalAssumptions } from "@workspace/db";
import {
  BRACKET_ID_BOUTIQUE_UPSCALE_HOTEL,
  BRACKET_ID_SOFT_BRAND_BOUTIQUE,
  BRACKET_ID_PERFORMANCE_MANAGED_STR,
  BRACKET_ID_AGRITOURISM_EXPERIENTIAL,
  BRACKET_CATALOG,
  SERVICE_CONSUMPTION_HOTEL,
  SERVICE_CONSUMPTION_STR,
  SERVICE_CONSUMPTION_MIXED,
} from "./bracket-catalog";
import type { BracketEntry, BracketMixData } from "@workspace/db";

// ── Named thresholds (no inline numerics) ────────────────────────────────

/** Star rating at or above which a hotel is classified as upscale-boutique. */
const UPSCALE_STAR_RATING_MIN = 4;

/** Fraction of soft-brand hotels within the hotel bucket when quality tier is
 *  "average" or no signal is present (the rest go to boutique-upscale). */
const SOFT_BRAND_FRACTION_OF_HOTEL_BUCKET_DEFAULT = 0.3;

/** Fraction of soft-brand hotels when the asset definition level is "luxury". */
const SOFT_BRAND_FRACTION_OF_HOTEL_BUCKET_LUXURY = 0.15;

/** Fraction of soft-brand hotels when the asset definition level is "budget". */
const SOFT_BRAND_FRACTION_OF_HOTEL_BUCKET_BUDGET = 0.5;

/** Weight floor applied to any bracket that would otherwise reach zero. */
const MINIMUM_BRACKET_WEIGHT = 0.05;

/** Default mix when the portfolio is completely empty (weights must sum to 1). */
const EMPTY_PORTFOLIO_DEFAULT_MIX: readonly { id: string; weight: number }[] = [
  { id: BRACKET_ID_BOUTIQUE_UPSCALE_HOTEL, weight: 0.45 },
  { id: BRACKET_ID_SOFT_BRAND_BOUTIQUE, weight: 0.25 },
  { id: BRACKET_ID_PERFORMANCE_MANAGED_STR, weight: 0.2 },
  { id: BRACKET_ID_AGRITOURISM_EXPERIENTIAL, weight: 0.1 },
] as const;

// ── Property classification helpers ──────────────────────────────────────

type PropertyClass = "hotel" | "str" | "mixed";

function classifyProperty(p: Property): PropertyClass {
  const rec = p as unknown as Record<string, unknown>;

  const businessModel = String(rec.businessModel ?? rec.business_model ?? "").toLowerCase();
  const hospType = String(rec.hospitalityType ?? rec.hospitality_type ?? "").toLowerCase();
  const propType = String(rec.propertyType ?? rec.property_type ?? "").toLowerCase();
  const name = String(p.name ?? "").toLowerCase();

  const strKeywords = ["str", "vacation", "airbnb", "short-term", "short term", "vrbo", "cottage", "cabin rental"];
  const mixedKeywords = ["agritourism", "agri-tourism", "glamping", "farm", "ranch", "lodge", "experiential"];

  const isStr = strKeywords.some(
    (k) => businessModel.includes(k) || hospType.includes(k) || propType.includes(k) || name.includes(k)
  );
  if (isStr) return "str";

  const isMixed = mixedKeywords.some(
    (k) => businessModel.includes(k) || hospType.includes(k) || propType.includes(k) || name.includes(k)
  );
  if (isMixed) return "mixed";

  return "hotel";
}

function isUpscaleHotel(p: Property, gaLevel: string): boolean {
  const rec = p as unknown as Record<string, unknown>;
  const starRating = typeof rec.starRating === "number"
    ? rec.starRating
    : typeof rec.star_rating === "number"
    ? rec.star_rating
    : null;

  if (starRating !== null && starRating >= UPSCALE_STAR_RATING_MIN) return true;
  if (gaLevel === "luxury") return true;

  const qualityTier = String(rec.qualityTier ?? rec.quality_tier ?? "").toLowerCase();
  if (qualityTier === "luxury" || qualityTier === "upscale") return true;

  return false;
}

// ── Weight normalisation helpers ──────────────────────────────────────────

function normalise(rawCounts: Record<string, number>): Record<string, number> {
  const ids = Object.keys(rawCounts);
  const total = ids.reduce((s, id) => s + rawCounts[id], 0);
  if (total === 0) return rawCounts;

  // First pass: raw percentages
  const pct: Record<string, number> = {};
  for (const id of ids) {
    pct[id] = rawCounts[id] / total;
  }

  // Apply floor
  for (const id of ids) {
    if (pct[id] < MINIMUM_BRACKET_WEIGHT) pct[id] = MINIMUM_BRACKET_WEIGHT;
  }

  // Re-normalise after floor application
  const flooredTotal = ids.reduce((s, id) => s + pct[id], 0);
  for (const id of ids) {
    pct[id] = Math.round((pct[id] / flooredTotal) * 1000) / 1000;
  }

  // Fix floating-point drift on the first bracket
  const sum = ids.reduce((s, id) => s + pct[id], 0);
  const drift = Math.round((1 - sum) * 1000) / 1000;
  if (Math.abs(drift) > 0 && ids.length > 0) {
    pct[ids[0]] = Math.round((pct[ids[0]] + drift) * 1000) / 1000;
  }

  return pct;
}

// ── Main minion export ────────────────────────────────────────────────────

/**
 * Assign bracket weights deterministically from the portfolio.
 *
 * @param properties  All properties visible to the management company.
 * @param ga          The management company's global assumptions row.
 * @returns           A BracketMixData ready to persist.
 */
export function assignBrackets(
  properties: Property[],
  ga: GlobalAssumptions | undefined,
): BracketMixData {
  const gaLevel = (ga?.assetDefinition as unknown as Record<string, unknown> | null)?.level as string | undefined ?? "average";

  // ── Empty portfolio fallback ──────────────────────────────────────────
  if (properties.length === 0) {
    const entries: BracketEntry[] = EMPTY_PORTFOLIO_DEFAULT_MIX.map((d) => {
      const cat = BRACKET_CATALOG.find((b) => b.id === d.id)!;
      return {
        id: d.id,
        name: cat.name,
        archetypeLabel: cat.archetypeLabel,
        serviceConsumption: cat.serviceConsumption,
        weight: d.weight,
        rationale: "Default mix — no portfolio properties exist yet. Run Assign Brackets after adding properties for a portfolio-informed mix.",
      };
    });

    return {
      entries,
      assignedAt: new Date().toISOString(),
      evidence: "No portfolio properties found. Showing balanced starter mix — re-run after adding properties.",
    };
  }

  // ── Classify each property ────────────────────────────────────────────
  let hotelCount = 0;
  let strCount = 0;
  let mixedCount = 0;
  let upscaleCount = 0; // within hotel bucket

  for (const p of properties) {
    const cls = classifyProperty(p);
    if (cls === "hotel") {
      hotelCount++;
      if (isUpscaleHotel(p, gaLevel)) upscaleCount++;
    } else if (cls === "str") {
      strCount++;
    } else {
      mixedCount++;
    }
  }

  const totalCount = properties.length;

  // ── Split hotel bucket into boutique-upscale vs soft-brand ────────────
  const softBrandFraction =
    gaLevel === "luxury"
      ? SOFT_BRAND_FRACTION_OF_HOTEL_BUCKET_LUXURY
      : gaLevel === "budget"
      ? SOFT_BRAND_FRACTION_OF_HOTEL_BUCKET_BUDGET
      : SOFT_BRAND_FRACTION_OF_HOTEL_BUCKET_DEFAULT;

  const boutiqueUpscaleCount =
    hotelCount > 0
      ? upscaleCount || Math.ceil(hotelCount * (1 - softBrandFraction))
      : 0;

  const softBrandCount = Math.max(0, hotelCount - boutiqueUpscaleCount);

  // ── Build raw counts map ──────────────────────────────────────────────
  const rawCounts: Record<string, number> = {
    [BRACKET_ID_BOUTIQUE_UPSCALE_HOTEL]: boutiqueUpscaleCount,
    [BRACKET_ID_SOFT_BRAND_BOUTIQUE]: softBrandCount,
    [BRACKET_ID_PERFORMANCE_MANAGED_STR]: strCount,
    [BRACKET_ID_AGRITOURISM_EXPERIENTIAL]: mixedCount,
  };

  const weights = normalise(rawCounts);

  // ── Build evidence narrative ──────────────────────────────────────────
  const pctHotel = Math.round((hotelCount / totalCount) * 100);
  const pctStr = Math.round((strCount / totalCount) * 100);
  const pctMixed = Math.round((mixedCount / totalCount) * 100);

  const evidenceParts: string[] = [
    `Portfolio: ${totalCount} propert${totalCount === 1 ? "y" : "ies"} analysed.`,
  ];
  if (hotelCount > 0) evidenceParts.push(`${pctHotel}% classified as hotel (full-service): ${boutiqueUpscaleCount} boutique-upscale, ${softBrandCount} soft-brand.`);
  if (strCount > 0) evidenceParts.push(`${pctStr}% classified as STR (marketing/branding/performance-bonus fees only).`);
  if (mixedCount > 0) evidenceParts.push(`${pctMixed}% classified as agritourism/experiential (mixed service consumption).`);
  if (gaLevel === "luxury") evidenceParts.push(`Asset definition level: luxury — biased toward boutique-upscale bracket.`);
  if (gaLevel === "budget") evidenceParts.push(`Asset definition level: budget — higher soft-brand fraction applied.`);

  const evidence = evidenceParts.join(" ");

  // ── Build rationale per bracket ───────────────────────────────────────
  const rationaleMap: Record<string, string> = {
    [BRACKET_ID_BOUTIQUE_UPSCALE_HOTEL]:
      boutiqueUpscaleCount > 0
        ? `${boutiqueUpscaleCount} hotel${boutiqueUpscaleCount > 1 ? "s" : ""} in the portfolio meet upscale/luxury criteria.`
        : "Minimum floor weight applied — no clear upscale hotel properties detected.",
    [BRACKET_ID_SOFT_BRAND_BOUTIQUE]:
      softBrandCount > 0
        ? `${softBrandCount} hotel${softBrandCount > 1 ? "s" : ""} in the portfolio show soft-brand or mid-scale signals.`
        : "Minimum floor weight applied — small exposure to soft-brand distribution expected.",
    [BRACKET_ID_PERFORMANCE_MANAGED_STR]:
      strCount > 0
        ? `${strCount} STR-classified propert${strCount > 1 ? "ies" : "y"} detected (vacation rental, cabin, or short-stay keywords).`
        : "Minimum floor weight applied — no STR properties detected but small STR exposure is common.",
    [BRACKET_ID_AGRITOURISM_EXPERIENTIAL]:
      mixedCount > 0
        ? `${mixedCount} propert${mixedCount > 1 ? "ies" : "y"} with agritourism, glamping, lodge, or farm keywords.`
        : "Minimum floor weight applied — no experiential properties detected.",
  };

  // ── Build final entries ───────────────────────────────────────────────
  const entries: BracketEntry[] = BRACKET_CATALOG.map((cat) => ({
    id: cat.id,
    name: cat.name,
    archetypeLabel: cat.archetypeLabel,
    serviceConsumption: cat.serviceConsumption,
    weight: weights[cat.id] ?? MINIMUM_BRACKET_WEIGHT,
    rationale: rationaleMap[cat.id] ?? "",
  }));

  return {
    entries,
    assignedAt: new Date().toISOString(),
    evidence,
  };
}

// ── Service-consumption label helpers (used by route response) ────────────

export function serviceConsumptionLabel(type: string): string {
  if (type === SERVICE_CONSUMPTION_HOTEL) return "All service lines";
  if (type === SERVICE_CONSUMPTION_STR) return "Marketing, branding, performance-bonus only";
  if (type === SERVICE_CONSUMPTION_MIXED) return "Blended (hotel + STR)";
  return type;
}
