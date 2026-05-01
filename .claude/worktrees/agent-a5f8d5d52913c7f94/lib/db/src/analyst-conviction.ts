/**
 * The Analyst's conviction floor — shared between server and client.
 *
 * If qualityScore < CONVICTION_FLOOR or no verified sources are present,
 * The Analyst refuses to advise rather than risk being wrong.
 */

export interface DataQualitySummary {
  sourceCount: number;
  sourceTypes: Array<"db_table" | "api" | "web" | "estimated">;
  dataAgeDays: number | null;
  rangeSpreadPct: number | null;
  sourcesConverge: boolean;
  qualityScore: number;
  qualityNarrative: string;
}

export const CONVICTION_FLOOR = 40;
export const MIN_SOURCES_FOR_ADVICE = 1;

/**
 * Quality score is bounded [0, 100] across the entire Analyst engine.
 * Voice Renderer, Quality Scorer, and verdict invariants all reference these.
 */
export const MIN_QUALITY_SCORE = 0;
export const MAX_QUALITY_SCORE = 100;

/**
 * Conviction tier thresholds for The Analyst's voice. A qualityScore at or
 * above CONVICTION_HIGH_THRESHOLD reads as "high conviction"; at or above
 * CONVICTION_MODERATE_THRESHOLD reads as "moderate conviction"; at or above
 * CONVICTION_FLOOR reads as "developing conviction"; below the floor is
 * "developing data" and no range is emitted.
 *
 * Calibrated against persona-keyed test bench (see ADR-003). These are
 * conviction tiers — distinct from the legacy confidence labels in
 * server/ai/confidence-scorer.ts (80/50/20), which serve a different domain.
 */
export const CONVICTION_HIGH_THRESHOLD = 80;
export const CONVICTION_MODERATE_THRESHOLD = 60;

/**
 * Tier-1 N+1 rule: a Tier-1 verdict must carry at least this many total
 * evidence entries across all dimensions, and the Quality Scorer awards
 * full source-count credit at this count. Aligned with research-precision.
 */
export const TIER_1_MIN_TOTAL_EVIDENCE = 3;

export function meetsConvictionFloor(quality: DataQualitySummary | null | undefined): boolean {
  if (!quality) return false;
  if (quality.qualityScore < CONVICTION_FLOOR) return false;
  const verifiedSources = quality.sourceTypes.filter(t => t !== "estimated");
  if (verifiedSources.length < MIN_SOURCES_FOR_ADVICE) return false;
  return true;
}

export function insufficientDataMessage(fieldName: string, quality: DataQualitySummary | null | undefined): string {
  const issues: string[] = [];
  if (!quality) {
    issues.push("no guidance available");
  } else {
    if (quality.qualityScore < CONVICTION_FLOOR) issues.push(`quality score ${quality.qualityScore}/100 is below threshold`);
    if (quality.sourceTypes.length > 0 && quality.sourceTypes.every(t => t === "estimated")) issues.push("no verified data sources");
    if (quality.sourceCount === 0) issues.push("no sources found");
  }
  return `The Analyst does not have enough reliable data to advise on ${fieldName} (${issues.join(", ")}). Run a full research pass to gather market intelligence.`;
}
