import type { PropertyContextPack } from "../context-pack/types";
import type { Property } from "@shared/schema";
import type { InsertRelaxationTrace } from "@shared/schema/intelligence-v2";
import { ComparableQueryBuilder, type RelaxLevel, type ComparableCriteria } from "./query-builder";
import { queryChunks, isPineconeAvailable, type QueryMatch } from "../pinecone-service";
import { storage } from "../../storage";
import { logger } from "../../logger";

export interface ComparableProperty {
  id: number | string;
  name: string;
  source: "local" | "pinecone";
  starRating: number | null;
  hospitalityType: string;
  roomCount: number;
  adr: number;
  city: string | null;
  state: string | null;
  country: string | null;
  hasFB: boolean;
  hasEvents: boolean;
  hasWellness: boolean;
  score: number;
}

export interface RelaxationResult {
  selectedLevel: RelaxLevel;
  criteria: ComparableCriteria;
  comps: ComparableProperty[];
  evidenceScore: number;
  traces: InsertRelaxationTrace[];
}

interface PolicyThresholds {
  minEvidenceScore: number;
  minCompCount: number;
  relaxationMaxLevel: RelaxLevel;
}

const DEFAULT_POLICY: PolicyThresholds = {
  minEvidenceScore: 0.3,
  minCompCount: 3,
  relaxationMaxLevel: 5,
};

async function loadPolicy(): Promise<PolicyThresholds> {
  try {
    const policies = await storage.getPipelinePolicies();
    const tier1 = policies.find(p => p.policyKey === "tier1_property" || p.tier === 1);
    if (tier1) {
      return {
        minEvidenceScore: tier1.minEvidenceScore ?? DEFAULT_POLICY.minEvidenceScore,
        minCompCount: tier1.minCompCount ?? DEFAULT_POLICY.minCompCount,
        relaxationMaxLevel: Math.min(tier1.relaxationMaxLevel ?? 5, 5) as RelaxLevel,
      };
    }
  } catch {
    logger.warn("Failed to load pipeline policies, using defaults", "relaxation");
  }
  return DEFAULT_POLICY;
}

function matchesCriteria(prop: Property, criteria: ComparableCriteria, targetPack: PropertyContextPack): boolean {
  const propStar = (prop as { starRating?: number | null }).starRating ?? null;
  if (criteria.starMin != null && propStar != null && propStar < criteria.starMin) return false;
  if (criteria.starMax != null && propStar != null && propStar > criteria.starMax) return false;

  if (criteria.typeMode === "exact") {
    const propType = (prop as { hospitalityType?: string }).hospitalityType ?? "hotel";
    if (!criteria.allowedTypes.includes(propType)) return false;
  } else if (criteria.typeMode === "family") {
    const propType = (prop as { hospitalityType?: string }).hospitalityType ?? "hotel";
    if (!criteria.allowedTypes.includes(propType)) return false;
  }

  if (criteria.geoMode === "city" && criteria.geoValue) {
    if ((prop.city ?? "").toLowerCase() !== criteria.geoValue.toLowerCase()) return false;
  } else if (criteria.geoMode === "msa" && criteria.geoValue) {
    const propLoc = `${prop.city ?? ""}, ${prop.stateProvince ?? ""}`.trim().toLowerCase();
    if (!propLoc.includes(criteria.geoValue.toLowerCase().split(",")[0] ?? "")) return false;
  } else if (criteria.geoMode === "state" && criteria.geoValue) {
    if ((prop.stateProvince ?? "").toLowerCase() !== criteria.geoValue.toLowerCase()) return false;
  } else if (criteria.geoMode === "country" && criteria.geoValue) {
    if ((prop.country ?? "").toLowerCase() !== criteria.geoValue.toLowerCase()) return false;
  }

  const rooms = prop.roomCount ?? 0;
  if (criteria.sizeRange) {
    if (rooms < criteria.sizeRange[0] || rooms > criteria.sizeRange[1]) return false;
  }

  const adr = prop.startAdr ?? 0;
  if (criteria.adrRange) {
    if (adr < criteria.adrRange[0] || adr > criteria.adrRange[1]) return false;
  }

  if (prop.id === targetPack.identity.id) return false;

  return true;
}

function starGuard(comp: ComparableProperty, targetStar: number | null): boolean {
  if (targetStar == null) return true;
  if (comp.starRating == null) return false;
  return Math.abs(comp.starRating - targetStar) <= 1;
}

function localPropToComparable(prop: Property): ComparableProperty {
  const hasEvents = !!(prop.revShareEvents && prop.revShareEvents > 0);
  const hasFB = !!(prop.revShareFB && prop.revShareFB > 0);
  const combined = `${prop.name ?? ""} ${prop.description ?? ""}`.toLowerCase();
  const hasWellness = /wellness|spa|retreat|yoga|thermal|massage|fitness|gym|sauna|pool|plunge/.test(combined);
  return {
    id: prop.id,
    name: prop.name,
    source: "local",
    starRating: (prop as { starRating?: number | null }).starRating ?? null,
    hospitalityType: (prop as { hospitalityType?: string }).hospitalityType ?? "hotel",
    roomCount: prop.roomCount ?? 0,
    adr: prop.startAdr ?? 0,
    city: prop.city ?? null,
    state: prop.stateProvince ?? null,
    country: prop.country ?? null,
    hasFB,
    hasEvents,
    hasWellness,
    score: 0.5,
  };
}

function pineconeMatchToComparable(match: QueryMatch): ComparableProperty {
  return {
    id: match.id,
    name: String(match.metadata.name ?? match.id),
    source: "pinecone",
    starRating: typeof match.metadata.starRating === "number" ? match.metadata.starRating : null,
    hospitalityType: String(match.metadata.hospitalityType ?? "hotel"),
    roomCount: typeof match.metadata.roomCount === "number" ? match.metadata.roomCount : 0,
    adr: typeof match.metadata.adr === "number" ? match.metadata.adr : 0,
    city: typeof match.metadata.city === "string" ? match.metadata.city : null,
    state: typeof match.metadata.state === "string" ? match.metadata.state : null,
    country: typeof match.metadata.country === "string" ? match.metadata.country : null,
    hasFB: !!match.metadata.hasFB,
    hasEvents: !!match.metadata.hasEvents,
    hasWellness: !!match.metadata.hasWellness,
    score: match.score,
  };
}

function computeEvidenceScore(
  comps: ComparableProperty[],
  level: RelaxLevel,
  minCompCount: number,
): number {
  const countScore = Math.min(comps.length / minCompCount, 1);
  const avgSimilarity = comps.length > 0
    ? comps.reduce((sum, c) => sum + c.score, 0) / comps.length
    : 0;
  const constraintStrength = 1 - (level * 0.15);
  return 0.45 * countScore + 0.35 * avgSimilarity + 0.20 * Math.max(0, constraintStrength);
}

async function queryPinecone(pack: PropertyContextPack, criteria: ComparableCriteria): Promise<ComparableProperty[]> {
  if (!isPineconeAvailable()) return [];
  try {
    const queryText = [
      pack.classification.compositeLabel,
      pack.location.display,
      `${pack.physicalCharacter.roomCount} rooms`,
      `$${pack.revenueProfile.startAdr} ADR`,
      criteria.geoValue ?? "",
    ].filter(Boolean).join(" ");

    const matches = await queryChunks("research-history", queryText, 15);
    return matches.map(pineconeMatchToComparable);
  } catch (err) {
    logger.warn(`Pinecone comparable query failed at L${criteria.level}: ${err instanceof Error ? err.message : err}`, "relaxation");
    return [];
  }
}

async function queryLocalDb(
  pack: PropertyContextPack,
  criteria: ComparableCriteria,
  userId: number,
): Promise<ComparableProperty[]> {
  try {
    const allProps = await storage.getAllProperties(userId);
    return allProps
      .filter(p => matchesCriteria(p, criteria, pack))
      .map(localPropToComparable);
  } catch (err) {
    logger.warn(`Local DB comparable query failed at L${criteria.level}: ${err instanceof Error ? err.message : err}`, "relaxation");
    return [];
  }
}

function dedupeComps(comps: ComparableProperty[]): ComparableProperty[] {
  const seen = new Set<string>();
  const result: ComparableProperty[] = [];
  for (const c of comps) {
    const key = `${c.source}:${c.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }
  return result.sort((a, b) => b.score - a.score);
}

export async function progressiveRelax(options: {
  contextPack: PropertyContextPack;
  researchRunId: number;
  userId: number;
}): Promise<RelaxationResult> {
  const { contextPack, researchRunId, userId } = options;
  const policy = await loadPolicy();
  const builder = new ComparableQueryBuilder(contextPack);
  const targetStar = contextPack.classification.starRating ?? contextPack.classification.starRatingSuggested;
  const traces: InsertRelaxationTrace[] = [];
  let selectedLevel: RelaxLevel = 0;
  let bestComps: ComparableProperty[] = [];
  let bestScore = 0;
  let bestCriteria: ComparableCriteria = builder.build(0);

  for (let level = 0; level <= policy.relaxationMaxLevel; level++) {
    const criteria = builder.build(level as RelaxLevel);

    const [localComps, pineconeComps] = await Promise.all([
      queryLocalDb(contextPack, criteria, userId),
      queryPinecone(contextPack, criteria),
    ]);

    let merged = dedupeComps([...localComps, ...pineconeComps]);

    merged = merged.filter(c => starGuard(c, targetStar));

    const evidenceScore = computeEvidenceScore(merged, level as RelaxLevel, policy.minCompCount);

    const trace: InsertRelaxationTrace = {
      researchRunId,
      level,
      criteriaActive: criteria as unknown as Record<string, unknown>,
      compsFound: merged.length,
      evidenceScore,
      retained: criteria.retained,
      relaxed: criteria.relaxed,
    };
    traces.push(trace);

    try {
      await storage.createRelaxationTrace(trace);
    } catch (err) {
      logger.warn(`Failed to persist relaxation trace L${level}: ${err instanceof Error ? err.message : err}`, "relaxation");
    }

    if (merged.length > bestComps.length || evidenceScore > bestScore) {
      bestComps = merged;
      bestScore = evidenceScore;
      bestCriteria = criteria;
      selectedLevel = level as RelaxLevel;
    }

    if (evidenceScore >= policy.minEvidenceScore && merged.length >= policy.minCompCount) {
      logger.info(`Relaxation stopped at L${level}: ${merged.length} comps, evidence ${evidenceScore.toFixed(3)}`, "relaxation");
      break;
    }
  }

  return {
    selectedLevel,
    criteria: bestCriteria,
    comps: bestComps,
    evidenceScore: bestScore,
    traces,
  };
}

export function formatCompsForPrompt(result: RelaxationResult): string {
  if (result.comps.length === 0) {
    return `## COMPARABLE SET\nNo comparables found after ${result.selectedLevel + 1} relaxation levels. Rely on general market benchmarks.`;
  }

  const compLines = result.comps.slice(0, 8).map((c, i) =>
    `${i + 1}. ${c.name} — ${c.starRating ?? "?"}★ ${c.hospitalityType}, ${c.roomCount} rooms, $${c.adr} ADR, ${c.city ?? c.state ?? c.country ?? "unknown"} (${c.source}, score: ${c.score.toFixed(2)})`
  );

  return `## COMPARABLE SET (L${result.selectedLevel} relaxation, evidence: ${result.evidenceScore.toFixed(2)})

${compLines.join("\n")}

Relaxation trail: ${result.traces.map(t => `L${t.level}: ${t.compsFound} comps (${(t.evidenceScore ?? 0).toFixed(2)})`).join(" → ")}
Criteria retained: ${result.criteria.retained.join(", ")}
${result.criteria.relaxed.length > 0 ? `Criteria relaxed: ${result.criteria.relaxed.join(", ")}` : ""}`;
}
