/**
 * Confidence Scoring Module
 *
 * Computes a structured confidence breakdown for guidance records,
 * exposing how trustworthy AI-generated assumptions are based on
 * comparable count, quality, recency, relaxation level, cross-validation,
 * and field coverage.
 *
 * All scores are computed at response time (derived data, never stored).
 */

import type { AssumptionGuidance } from "@shared/schema/intelligence-v2";
import { PROPERTY_ASSUMPTION_KEYS, COMPANY_ASSUMPTION_KEYS } from "./guidance/schemas";
import { getHealthySources } from "./source-health-checker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfidenceBreakdown {
  overall: "high" | "medium" | "low" | "none";
  overallScore: number;          // 0-100 numeric score
  factors: {
    comparableCount: number;     // How many comps were found
    comparableQuality: number;   // 0-100 based on evidence score
    sourceRecency: number;       // 0-100 based on how fresh the data is
    relaxationLevel: number;     // 0-100, lower relaxation = higher score
    crossValidation: number;     // 0-100, do multiple sources agree?
    fieldCoverage: number;       // 0-100, % of key fields with guidance
    sourceAvailability: number;  // 0-100, critical data sources online
  };
  explanation: string;           // Human-readable explanation
  recommendations: string[];    // What would improve confidence
}

export interface PerFieldConfidence {
  confidenceScore: number;       // 0-100 numeric score for this individual record
}

// Critical fields whose coverage matters most for investor credibility
const CRITICAL_PROPERTY_FIELDS = new Set([
  "adr", "maxOccupancy", "capRate", "costRooms", "costFB", "costAdmin",
  "costPropertyOps", "costUtilities", "costFFE",
]);

const CRITICAL_COMPANY_FIELDS = new Set([
  "baseManagementFee", "incentiveManagementFee", "companyTaxRate",
  "costOfEquity", "partnerComp", "staffSalary",
]);

// ---------------------------------------------------------------------------
// Factor scoring functions
// ---------------------------------------------------------------------------

function scoreComparableCount(count: number): number {
  if (count >= 8) return 100;
  if (count >= 6) return 90;
  if (count >= 3) return 60;
  if (count >= 1) return 30;
  return 0;
}

function scoreComparableQuality(evidenceScore: number | null): number {
  if (evidenceScore == null) return 0;
  // evidenceScore is 0-1 from the relaxation engine; scale to 0-100
  return Math.round(Math.min(Math.max(evidenceScore, 0), 1) * 100);
}

function scoreSourceRecency(sourceDateStr: string | null, updatedAt: Date | string): number {
  const refDate = sourceDateStr ? new Date(sourceDateStr) : new Date(updatedAt);
  if (isNaN(refDate.getTime())) return 20;
  const ageDays = (Date.now() - refDate.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 7) return 100;
  if (ageDays <= 15) return 75;
  if (ageDays <= 30) return 50;
  return 20;
}

function scoreRelaxationLevel(level: number | null): number {
  if (level == null) return 50; // unknown relaxation — neutral
  switch (level) {
    case 0: return 100;
    case 1: return 80;
    case 2: return 60;
    case 3: return 40;
    case 4: return 20;
    case 5: return 10;
    default: return 10;
  }
}

function scoreCrossValidation(records: AssumptionGuidance[]): number {
  // Check how many records have non-null mid values and whether
  // different records' comparable sets suggest agreement.
  // Since each guidance record represents a different assumption key,
  // cross-validation is measured by looking at records that have
  // comparable sets with multiple sources.
  if (records.length === 0) return 0;

  let agreementSum = 0;
  let checked = 0;

  for (const r of records) {
    if (r.valueLow == null || r.valueHigh == null || r.valueMid == null) continue;
    if (r.valueMid === 0) continue;
    const rangeSpread = Math.abs(r.valueHigh - r.valueLow) / Math.abs(r.valueMid);
    checked++;
    // Tight spread means sources agree
    if (rangeSpread <= 0.10) agreementSum += 100;
    else if (rangeSpread <= 0.20) agreementSum += 70;
    else if (rangeSpread <= 0.30) agreementSum += 40;
    else agreementSum += 20;
  }

  return checked > 0 ? Math.round(agreementSum / checked) : 20;
}

function scoreFieldCoverage(
  records: AssumptionGuidance[],
  entityType: string,
): number {
  const criticalFields = entityType === "company"
    ? CRITICAL_COMPANY_FIELDS
    : CRITICAL_PROPERTY_FIELDS;

  if (criticalFields.size === 0) return 100;

  const coveredKeys = new Set(records.map(r => r.assumptionKey));
  let covered = 0;
  const criticalArray = Array.from(criticalFields);
  for (const field of criticalArray) {
    if (coveredKeys.has(field)) covered++;
  }

  return Math.round((covered / criticalFields.size) * 100);
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const WEIGHTS = {
  comparableCount: 0.22,
  comparableQuality: 0.22,
  sourceRecency: 0.13,
  relaxationLevel: 0.13,
  crossValidation: 0.10,
  fieldCoverage: 0.10,
  sourceAvailability: 0.10,
};

function overallLabel(score: number): "high" | "medium" | "low" | "none" {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  if (score >= 20) return "low";
  return "none";
}

// ---------------------------------------------------------------------------
// Explanation and recommendation generators
// ---------------------------------------------------------------------------

function buildExplanation(
  label: "high" | "medium" | "low" | "none",
  factors: ConfidenceBreakdown["factors"],
  records: AssumptionGuidance[],
): string {
  const compCount = records.length > 0
    ? extractMaxCompCount(records)
    : 0;

  const avgRelax = records.length > 0
    ? Math.round(records.reduce((s, r) => s + (r.relaxationLevel ?? 0), 0) / records.length)
    : -1;

  const parts: string[] = [];
  parts.push(`${capitalize(label)} confidence`);

  if (compCount > 0) {
    parts.push(`${compCount} comparable propert${compCount === 1 ? "y" : "ies"}`);
  }

  if (avgRelax >= 0) {
    parts.push(`at L${avgRelax} relaxation`);
  }

  if (factors.crossValidation >= 80) {
    parts.push("sources agree tightly");
  } else if (factors.crossValidation >= 50) {
    parts.push("moderate source agreement");
  }

  if (factors.fieldCoverage < 50) {
    parts.push(`only ${factors.fieldCoverage}% of critical fields covered`);
  }

  return parts.join(": ").replace(/: /, ": ").replace(/: :/, ":");
}

function buildRecommendations(
  factors: ConfidenceBreakdown["factors"],
  records: AssumptionGuidance[],
  entityType: string,
): string[] {
  const recs: string[] = [];

  // Missing critical fields
  const criticalFields = entityType === "company"
    ? CRITICAL_COMPANY_FIELDS
    : CRITICAL_PROPERTY_FIELDS;
  const coveredKeys = new Set(records.map(r => r.assumptionKey));
  const criticalArray = Array.from(criticalFields);
  for (const field of criticalArray) {
    if (!coveredKeys.has(field)) {
      recs.push(`Run research for ${field} — no guidance available`);
    }
  }

  // Stale data
  if (factors.sourceRecency <= 20) {
    const oldest = findOldestRecord(records);
    if (oldest) {
      const ageDays = Math.round(
        (Date.now() - new Date(oldest.sourceDate ?? oldest.updatedAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      recs.push(`Data is ${ageDays} days old — consider refreshing`);
    }
  } else if (factors.sourceRecency <= 50) {
    recs.push("Some data is aging — a refresh within 2 weeks would improve confidence");
  }

  // Low comp count
  if (factors.comparableCount < 60) {
    recs.push("Fewer than 3 comparable properties found — broaden search or add local comps");
  }

  // High relaxation
  if (factors.relaxationLevel < 40) {
    recs.push("Criteria were heavily relaxed to find comps — results may be less relevant");
  }

  // Low cross-validation
  if (factors.crossValidation < 40) {
    recs.push("Sources disagree significantly — run a deep-dive to get tighter ranges");
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractMaxCompCount(records: AssumptionGuidance[]): number {
  let max = 0;
  for (const r of records) {
    const cs = r.comparableSet as Record<string, unknown> | null;
    if (cs && typeof cs === "object") {
      // comparableSet may contain a "comps" array or be an array itself
      const comps = Array.isArray(cs) ? cs : (Array.isArray(cs.comps) ? cs.comps : null);
      if (comps && comps.length > max) max = comps.length;
    }
  }
  return max;
}

function extractAvgEvidenceScore(records: AssumptionGuidance[]): number | null {
  let sum = 0;
  let count = 0;
  for (const r of records) {
    const cs = r.comparableSet as Record<string, unknown> | null;
    if (cs && typeof cs.evidenceScore === "number") {
      sum += cs.evidenceScore;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

function findOldestRecord(records: AssumptionGuidance[]): AssumptionGuidance | null {
  if (records.length === 0) return null;
  let oldest: AssumptionGuidance = records[0];
  let oldestTime = new Date(oldest.sourceDate ?? oldest.updatedAt).getTime();
  for (const r of records) {
    const t = new Date(r.sourceDate ?? r.updatedAt).getTime();
    if (t < oldestTime) {
      oldest = r;
      oldestTime = t;
    }
  }
  return oldest;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function avgRecency(records: AssumptionGuidance[]): number {
  if (records.length === 0) return 0;
  let sum = 0;
  for (const r of records) {
    sum += scoreSourceRecency(r.sourceDate ?? null, r.updatedAt);
  }
  return Math.round(sum / records.length);
}

function avgRelaxation(records: AssumptionGuidance[]): number {
  if (records.length === 0) return 50;
  let sum = 0;
  for (const r of records) {
    sum += scoreRelaxationLevel(r.relaxationLevel ?? null);
  }
  return Math.round(sum / records.length);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a full confidence breakdown for a set of guidance records
 * belonging to a single entity.
 */
export async function computeConfidenceBreakdown(
  records: AssumptionGuidance[],
  entityType: string,
): Promise<ConfidenceBreakdown> {
  const compCount = extractMaxCompCount(records);
  const evidenceScore = extractAvgEvidenceScore(records);

  // Source availability factor — check if critical data sources are online
  const criticalSources = ["fred", "anthropic", "pinecone"];
  let healthySources: string[] = [];
  try {
    healthySources = await getHealthySources();
  } catch {
    // If health check fails, assume sources are available (optimistic fallback)
    healthySources = [...criticalSources];
  }
  const downCritical = criticalSources.filter(s => !healthySources.includes(s));
  const sourceAvailability = downCritical.length === 0 ? 100 : Math.max(0, 100 - downCritical.length * 30);

  const factors: ConfidenceBreakdown["factors"] = {
    comparableCount: scoreComparableCount(compCount),
    comparableQuality: scoreComparableQuality(evidenceScore),
    sourceRecency: avgRecency(records),
    relaxationLevel: avgRelaxation(records),
    crossValidation: scoreCrossValidation(records),
    fieldCoverage: scoreFieldCoverage(records, entityType),
    sourceAvailability,
  };

  const overallScore = Math.round(
    factors.comparableCount * WEIGHTS.comparableCount +
    factors.comparableQuality * WEIGHTS.comparableQuality +
    factors.sourceRecency * WEIGHTS.sourceRecency +
    factors.relaxationLevel * WEIGHTS.relaxationLevel +
    factors.crossValidation * WEIGHTS.crossValidation +
    factors.fieldCoverage * WEIGHTS.fieldCoverage +
    factors.sourceAvailability * WEIGHTS.sourceAvailability,
  );

  const overall = overallLabel(overallScore);
  const explanation = buildExplanation(overall, factors, records);
  const recommendations = buildRecommendations(factors, records, entityType);

  // Add recommendation if critical sources are down
  if (downCritical.length > 0) {
    recommendations.push(`Data quality reduced: ${downCritical.join(", ")} unavailable`);
  }

  return {
    overall,
    overallScore,
    factors,
    explanation,
    recommendations,
  };
}

/**
 * Compute a per-field numeric confidence score (0-100) for a single
 * guidance record. This is derived at response time and never stored.
 */
export function computePerFieldConfidence(record: AssumptionGuidance): number {
  // Three signals: text confidence label, relaxation level, source recency
  const labelScore =
    record.confidence === "high" ? 90 :
    record.confidence === "medium" ? 60 :
    record.confidence === "low" ? 30 : 20;

  const relaxScore = scoreRelaxationLevel(record.relaxationLevel ?? null);
  const recencyScore = scoreSourceRecency(record.sourceDate ?? null, record.updatedAt);

  // Also factor in whether a range was provided (richer data = higher confidence)
  const hasRange = record.valueLow != null && record.valueHigh != null && record.valueLow !== record.valueHigh;
  const rangeBonus = hasRange ? 10 : 0;

  const raw = Math.round(
    labelScore * 0.40 +
    relaxScore * 0.30 +
    recencyScore * 0.30 +
    rangeBonus,
  );

  return Math.min(raw, 100);
}
