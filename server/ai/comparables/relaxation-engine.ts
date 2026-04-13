import type { PropertyContextPack } from "../context-pack/types";
import type { Property } from "@shared/schema";
import type { InsertRelaxationTrace } from "@shared/schema/intelligence-v2";
import { ComparableQueryBuilder, type RelaxLevel, type ComparableCriteria } from "./query-builder";
import { queryChunks, isPineconeAvailable, type QueryMatch } from "../pinecone-service";
import { enrichComparablesFromWeb, type WebComparable } from "./web-enricher";
import { storage } from "../../storage";
import { logger } from "../../logger";

export interface ComparableProperty {
  id: number | string;
  name: string;
  source: "local" | "pinecone";
  starRating: number | null;
  hospitalityType: string;
  businessModel: string;
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
  /** Web-sourced comparables (supplements DB comps when few local matches). Always tagged confidence: "web_sourced". */
  webComparables?: WebComparable[];
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
    businessModel: (prop as { businessModel?: string }).businessModel ?? "hotel",
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
    businessModel: String(match.metadata.businessModel ?? "hotel"),
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

function computeGeographicDiversity(comps: ComparableProperty[]): number {
  if (comps.length <= 1) return 0;
  const locations = comps.map(c => (c.city ?? c.state ?? c.country ?? "").toLowerCase().trim());
  const unknownCount = locations.filter(l => l === "" || l === "unknown").length;
  const known = locations.filter(l => l !== "" && l !== "unknown");
  const unique = new Set(known).size;
  if (known.length <= 1) return 0;
  const unknownPenalty = unknownCount > 0 ? 0.8 : 1.0;
  return Math.min((unique - 1) / (known.length - 1), 1) * unknownPenalty;
}

function computeTypeDiversity(comps: ComparableProperty[]): number {
  if (comps.length <= 1) return 0;
  const types = comps.map(c => (c.hospitalityType ?? "").toLowerCase().trim());
  const known = types.filter(t => t !== "" && t !== "unknown");
  const unique = new Set(known).size;
  if (known.length <= 1) return 0;
  return Math.min((unique - 1) / (known.length - 1), 1);
}

function computeBusinessModelAlignment(comps: ComparableProperty[], targetModel: string): number {
  if (comps.length === 0) return 0;
  const sameModelCount = comps.filter(c => c.businessModel === targetModel).length;
  return sameModelCount / comps.length;
}

export function applyBusinessModelBoost(comps: ComparableProperty[], targetModel: string): ComparableProperty[] {
  return comps.map(c => {
    if (c.businessModel === targetModel) {
      return { ...c, score: Math.min(c.score * 1.15, 1) };
    }
    return { ...c, score: c.score * 0.85 };
  });
}

function computeEvidenceScore(
  comps: ComparableProperty[],
  level: RelaxLevel,
  minCompCount: number,
  targetBusinessModel?: string,
): number {
  const countScore = Math.min(comps.length / minCompCount, 1);
  const avgSimilarity = comps.length > 0
    ? comps.reduce((sum, c) => sum + c.score, 0) / comps.length
    : 0;
  const constraintStrength = 1 - (level * 0.15);
  const geoDiversity = computeGeographicDiversity(comps);
  const typeDiversity = computeTypeDiversity(comps);
  const diversityBonus = (geoDiversity + typeDiversity) / 2;
  const modelAlignment = targetBusinessModel
    ? computeBusinessModelAlignment(comps, targetBusinessModel)
    : 0;
  return (
    0.30 * countScore +
    0.25 * avgSimilarity +
    0.20 * Math.max(0, constraintStrength) +
    0.15 * diversityBonus +
    0.10 * modelAlignment
  );
}

function filterCompAgainstCriteria(
  comp: ComparableProperty,
  criteria: ComparableCriteria,
  pack: PropertyContextPack,
): boolean {
  if (criteria.typeMode === "exact" || criteria.typeMode === "family") {
    if (!criteria.allowedTypes.includes(comp.hospitalityType)) return false;
  }

  if (criteria.geoMode === "city" && criteria.geoValue) {
    if ((comp.city ?? "").toLowerCase() !== criteria.geoValue.toLowerCase()) return false;
  } else if (criteria.geoMode === "msa" && criteria.geoValue) {
    const compLoc = `${comp.city ?? ""}, ${comp.state ?? ""}`.trim().toLowerCase();
    if (!compLoc.includes(criteria.geoValue.toLowerCase().split(",")[0] ?? "")) return false;
  } else if (criteria.geoMode === "state" && criteria.geoValue) {
    if ((comp.state ?? "").toLowerCase() !== criteria.geoValue.toLowerCase()) return false;
  } else if (criteria.geoMode === "country" && criteria.geoValue) {
    if ((comp.country ?? "").toLowerCase() !== criteria.geoValue.toLowerCase()) return false;
  }

  if (criteria.sizeRange) {
    if (comp.roomCount < criteria.sizeRange[0] || comp.roomCount > criteria.sizeRange[1]) return false;
  }

  if (criteria.adrRange) {
    if (comp.adr < criteria.adrRange[0] || comp.adr > criteria.adrRange[1]) return false;
  }

  if (String(comp.id) === String(pack.identity.id)) return false;

  return true;
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
    const comps = matches.map(pineconeMatchToComparable);
    return comps.filter(c => filterCompAgainstCriteria(c, criteria, pack));
  } catch (err: unknown) {
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
  } catch (err: unknown) {
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
  const targetBusinessModel = contextPack.classification.businessModel ?? "hotel";
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

    merged = applyBusinessModelBoost(merged, targetBusinessModel);
    merged = merged.sort((a, b) => b.score - a.score);

    const evidenceScore = computeEvidenceScore(merged, level as RelaxLevel, policy.minCompCount, targetBusinessModel);

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
    } catch (err: unknown) {
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

  // ── Web enrichment (post-processing, additive only) ──────────────────────
  // If DB/Pinecone search yielded fewer than the minimum comp count, attempt
  // to supplement with web-sourced comparables. These are kept separate from
  // DB comps and receive a lower evidence-score weight (50%).
  let webComparables: WebComparable[] | undefined;

  if (bestComps.length < policy.minCompCount) {
    try {
      webComparables = await enrichComparablesFromWeb(
        {
          propertyName: contextPack.identity.name,
          location: contextPack.location.display,
          qualityTier: contextPack.classification.compositeLabel,
          roomCount: contextPack.physicalCharacter.roomCount,
          businessModel: contextPack.classification.businessModel ?? "hotel",
          country: contextPack.location.country ?? undefined,
        },
        bestComps.length,
        policy.minCompCount,
      );

      // Adjust evidence score: web comps contribute at 50% weight of DB comps
      if (webComparables && webComparables.length > 0) {
        const webCountContribution = webComparables.length * 0.5;
        const effectiveCount = bestComps.length + webCountContribution;
        const webCountScore = Math.min(effectiveCount / policy.minCompCount, 1);
        // Blend: keep 80% of DB-based score, add 20% from web-adjusted count score
        bestScore = 0.80 * bestScore + 0.20 * webCountScore;
        logger.info(
          `Web enrichment added ${webComparables.length} web comps, adjusted evidence score to ${bestScore.toFixed(3)}`,
          "relaxation",
        );
      }
    } catch (err: unknown) {
      logger.warn(
        `Web enrichment post-processing failed: ${err instanceof Error ? err.message : err}`,
        "relaxation",
      );
    }
  }

  return {
    selectedLevel,
    criteria: bestCriteria,
    comps: bestComps,
    evidenceScore: bestScore,
    traces,
    webComparables,
  };
}

export function formatCompsForPrompt(result: RelaxationResult): string {
  if (result.comps.length === 0 && (!result.webComparables || result.webComparables.length === 0)) {
    return `## COMPARABLE SET\nNo comparables found after ${result.selectedLevel + 1} relaxation levels. Rely on general market benchmarks.`;
  }

  const compLines = result.comps.slice(0, 8).map((c, i) =>
    `${i + 1}. ${c.name} — ${c.starRating ?? "?"}★ ${c.hospitalityType}, ${c.roomCount} rooms, $${c.adr} ADR, ${c.city ?? c.state ?? c.country ?? "unknown"} (${c.source}, score: ${c.score.toFixed(2)})`
  );

  let output = `## COMPARABLE SET (L${result.selectedLevel} relaxation, evidence: ${result.evidenceScore.toFixed(2)})

${compLines.join("\n")}

Relaxation trail: ${result.traces.map(t => `L${t.level}: ${t.compsFound} comps (${(t.evidenceScore ?? 0).toFixed(2)})`).join(" → ")}
Criteria retained: ${result.criteria.retained.join(", ")}
${result.criteria.relaxed.length > 0 ? `Criteria relaxed: ${result.criteria.relaxed.join(", ")}` : ""}`;

  // Append web-sourced comparables if present
  if (result.webComparables && result.webComparables.length > 0) {
    const webLines = result.webComparables.slice(0, 6).map((wc, i) => {
      const parts = [wc.propertyName ?? "Unknown"];
      if (wc.adr) parts.push(`$${wc.adr} ADR`);
      if (wc.occupancy) parts.push(`${(wc.occupancy * 100).toFixed(0)}% occ`);
      if (wc.revpar) parts.push(`$${wc.revpar} RevPAR`);
      if (wc.capRate) parts.push(`${(wc.capRate * 100).toFixed(1)}% cap`);
      if (wc.roomCount) parts.push(`${wc.roomCount} rooms`);
      parts.push(`(${wc.source}, web_sourced)`);
      return `  ${i + 1}. ${parts.join(" — ")}`;
    });

    output += `\n\n### WEB-SOURCED SUPPLEMENTS (lower confidence — verify independently)
${webLines.join("\n")}`;
  }

  return output;
}
