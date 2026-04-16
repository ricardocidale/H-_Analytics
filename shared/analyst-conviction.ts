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
