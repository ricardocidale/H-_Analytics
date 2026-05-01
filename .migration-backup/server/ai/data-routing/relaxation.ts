/**
 * Progressive-relaxation helpers — build a sequence of `RelaxedContext`
 * snapshots from a `RoutingContext`, each loosening one more criterion until
 * country-level fallback is reached.
 */
import type { RelaxationLevel, RelaxedContext, RoutingContext, ConfidenceLevel } from "./types";

export function buildRelaxedContexts(
  ctx: RoutingContext,
  maxLevel: RelaxationLevel = 5,
): RelaxedContext[] {
  const contexts: RelaxedContext[] = [];

  // Level 0: Exact match — all criteria
  contexts.push({
    level: 0,
    location: ctx.location,
    city: ctx.city,
    state: ctx.state,
    country: ctx.country,
    qualityTier: ctx.qualityTier,
    propertyType: ctx.propertyType,
    retained: ["city", "qualityTier", "propertyType"],
    relaxed: [],
  });

  if (maxLevel < 1) return contexts;

  // Level 1: Relax property type (boutique -> any luxury hotel)
  contexts.push({
    level: 1,
    location: ctx.location,
    city: ctx.city,
    state: ctx.state,
    country: ctx.country,
    qualityTier: ctx.qualityTier,
    propertyType: undefined, // any hotel type
    retained: ["city", "qualityTier"],
    relaxed: ["propertyType"],
  });

  if (maxLevel < 2) return contexts;

  // Level 2: Relax geography (city -> state/metro)
  contexts.push({
    level: 2,
    location: ctx.state ? `${ctx.state}, ${ctx.country ?? ""}`.trim() : ctx.location,
    city: undefined,
    state: ctx.state,
    country: ctx.country,
    qualityTier: ctx.qualityTier,
    propertyType: undefined,
    retained: ["state", "qualityTier"],
    relaxed: ["propertyType", "city->state"],
  });

  if (maxLevel < 3) return contexts;

  // Level 3: Relax quality tier (luxury -> upscale, or just any)
  const relaxedTier = relaxQualityTier(ctx.qualityTier);
  contexts.push({
    level: 3,
    location: ctx.state ? `${ctx.state}, ${ctx.country ?? ""}`.trim() : ctx.location,
    city: undefined,
    state: ctx.state,
    country: ctx.country,
    qualityTier: relaxedTier,
    propertyType: undefined,
    retained: ["state"],
    relaxed: ["propertyType", "city->state", "qualityTier->relaxed"],
  });

  if (maxLevel < 4) return contexts;

  // Level 4: State/region level — drop quality tier entirely
  contexts.push({
    level: 4,
    location: ctx.state || ctx.country,
    city: undefined,
    state: ctx.state,
    country: ctx.country,
    qualityTier: undefined,
    propertyType: undefined,
    retained: ["state"],
    relaxed: ["propertyType", "city", "qualityTier"],
  });

  if (maxLevel < 5) return contexts;

  // Level 5: Country level — widest ranges
  contexts.push({
    level: 5,
    location: ctx.country || ctx.state,
    city: undefined,
    state: undefined,
    country: ctx.country,
    qualityTier: undefined,
    propertyType: undefined,
    retained: ["country"],
    relaxed: ["propertyType", "city", "state", "qualityTier"],
  });

  return contexts;
}

export function relaxQualityTier(tier?: string): string | undefined {
  if (!tier) return undefined;
  const relaxMap: Record<string, string> = {
    luxury: "upper_upscale",
    upper_upscale: "upscale",
    upscale: "upper_midscale",
    upper_midscale: "midscale",
    midscale: "economy",
    economy: "economy",
  };
  return relaxMap[tier.toLowerCase()] ?? undefined;
}

export function confidenceFromRelaxation(level: RelaxationLevel): ConfidenceLevel {
  if (level <= 1) return "high";
  if (level <= 3) return "medium";
  return "low";
}
