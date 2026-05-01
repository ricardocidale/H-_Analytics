/**
 * server/ai/comparables/web-enricher.ts — Web-enhanced comparable enrichment
 *
 * When the progressive relaxation engine finds fewer than the target number
 * of DB/Vector store comparables, this module supplements the set with web-sourced
 * market data from Perplexity and Tavily.
 *
 * Web comparables are always tagged confidence: "web_sourced" so the UI can
 * render them differently from DB-sourced comps (lower trust, citation-backed).
 */

import { conductWebResearch, isWebResearchAvailable } from "../web-research";
import type { WebResearchResult } from "../web-research";
import { logger } from "../../logger";

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface WebComparable {
  source: "perplexity" | "tavily";
  propertyName?: string;
  location?: string;
  adr?: number;
  occupancy?: number;
  revpar?: number;
  capRate?: number;
  roomCount?: number;
  qualityTier?: string;
  sourceUrl?: string;
  snippet: string;
  confidence: "web_sourced";
}

export interface WebEnrichmentContext {
  propertyName: string;
  location: string;
  qualityTier?: string;
  roomCount?: number;
  businessModel?: string;
  country?: string;
}

// ── Number extraction helpers ───────────────────────────────────────────────

const ADR_PATTERN = /\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/\s*night|ADR|average daily rate|per\s*night)/gi;
const OCCUPANCY_PATTERN = /([\d.]+)\s*%\s*(?:occupancy|occ\.?)/gi;
const REVPAR_PATTERN = /(?:RevPAR|revenue per available room)\s*(?:of|:)?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/gi;
const CAP_RATE_PATTERN = /(?:cap(?:italization)?\s*rate)\s*(?:of|:)?\s*([\d.]+)\s*%/gi;
const ROOM_COUNT_PATTERN = /([\d,]+)\s*(?:rooms?|keys?|units?|suites?)/gi;

function parseNumber(s: string): number | null {
  const cleaned = s.replace(/,/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function extractFirst(pattern: RegExp, text: string): number | null {
  pattern.lastIndex = 0;
  const match = pattern.exec(text);
  if (!match || !match[1]) return null;
  return parseNumber(match[1]);
}

/**
 * Attempt to extract property names from the research text.
 * Looks for patterns like "Property Name (location)" or "Property Name — details".
 */
const PROPERTY_NAME_PATTERNS = [
  /(?:(?:the|at)\s+)?([A-Z][A-Za-z\s&']+(?:Hotel|Resort|Inn|Lodge|Boutique|Retreat|House|Villa|Manor|Estate|Suites?))\b/g,
];

function extractPropertyNames(text: string): string[] {
  const names = new Set<string>();
  for (const pattern of PROPERTY_NAME_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim();
      if (name.length > 4 && name.length < 80) {
        names.add(name);
      }
    }
  }
  return Array.from(names);
}

// ── Comparable extraction from research results ─────────────────────────────

function extractComparablesFromResult(result: WebResearchResult): WebComparable[] {
  const comps: WebComparable[] = [];
  const fullText = [result.summary, ...result.citations.map(c => c.snippet)].join("\n");

  // Extract named properties with their associated data points
  const propertyNames = extractPropertyNames(fullText);

  if (propertyNames.length > 0) {
    for (const name of propertyNames) {
      // Find the context around this property name (500 chars window)
      const nameIdx = fullText.indexOf(name);
      if (nameIdx < 0) continue;
      const contextStart = Math.max(0, nameIdx - 100);
      const contextEnd = Math.min(fullText.length, nameIdx + name.length + 400);
      const context = fullText.substring(contextStart, contextEnd);

      const comp: WebComparable = {
        source: result.source,
        propertyName: name,
        snippet: context.substring(0, 300),
        confidence: "web_sourced",
      };

      const adr = extractFirst(ADR_PATTERN, context);
      if (adr && adr >= 30 && adr <= 5000) comp.adr = adr;

      const occ = extractFirst(OCCUPANCY_PATTERN, context);
      if (occ && occ >= 5 && occ <= 100) comp.occupancy = occ / 100;

      const revpar = extractFirst(REVPAR_PATTERN, context);
      if (revpar && revpar >= 10 && revpar <= 5000) comp.revpar = revpar;

      const capRate = extractFirst(CAP_RATE_PATTERN, context);
      if (capRate && capRate >= 2 && capRate <= 20) comp.capRate = capRate / 100;

      const rooms = extractFirst(ROOM_COUNT_PATTERN, context);
      if (rooms && rooms >= 1 && rooms <= 500) comp.roomCount = rooms;

      // Find a source URL from citations that mention this property
      const citationMatch = result.citations.find(c =>
        c.snippet.includes(name) || c.title.includes(name),
      );
      if (citationMatch) comp.sourceUrl = citationMatch.url;

      comps.push(comp);
    }
  }

  // Also extract aggregate market data as a "market summary" comparable
  const summaryAdr = extractFirst(ADR_PATTERN, result.summary);
  const summaryOcc = extractFirst(OCCUPANCY_PATTERN, result.summary);
  const summaryRevpar = extractFirst(REVPAR_PATTERN, result.summary);
  const summaryCapRate = extractFirst(CAP_RATE_PATTERN, result.summary);

  if (summaryAdr || summaryOcc || summaryRevpar || summaryCapRate) {
    const marketComp: WebComparable = {
      source: result.source,
      propertyName: `Market Average (${result.source})`,
      snippet: result.summary.substring(0, 300),
      confidence: "web_sourced",
    };
    if (summaryAdr && summaryAdr >= 30 && summaryAdr <= 5000) marketComp.adr = summaryAdr;
    if (summaryOcc && summaryOcc >= 5 && summaryOcc <= 100) marketComp.occupancy = summaryOcc / 100;
    if (summaryRevpar && summaryRevpar >= 10 && summaryRevpar <= 5000) marketComp.revpar = summaryRevpar;
    if (summaryCapRate && summaryCapRate >= 2 && summaryCapRate <= 20) marketComp.capRate = summaryCapRate / 100;

    if (result.citations.length > 0) {
      marketComp.sourceUrl = result.citations[0].url;
    }

    // Only add if it has at least one useful data point
    // and doesn't duplicate an already-extracted named property
    const isDuplicate = comps.some(
      c => c.adr === marketComp.adr && c.occupancy === marketComp.occupancy,
    );
    if (!isDuplicate) {
      comps.push(marketComp);
    }
  }

  return comps;
}

// ── Deduplication ───────────────────────────────────────────────────────────

function dedupeWebComparables(comps: WebComparable[]): WebComparable[] {
  const seen = new Map<string, WebComparable>();
  for (const comp of comps) {
    const key = (comp.propertyName ?? "unknown").toLowerCase().trim();
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, comp);
    } else {
      // Merge: prefer the one with more data points
      const existingFields = [existing.adr, existing.occupancy, existing.revpar, existing.capRate, existing.roomCount].filter(Boolean).length;
      const newFields = [comp.adr, comp.occupancy, comp.revpar, comp.capRate, comp.roomCount].filter(Boolean).length;
      if (newFields > existingFields) {
        seen.set(key, comp);
      }
    }
  }
  return Array.from(seen.values());
}

// ── Main enrichment function ────────────────────────────────────────────────

/**
 * Supplement the comparable set with web-sourced data when the DB/Vector store
 * search returns fewer comps than desired.
 *
 * Only triggers if existingCompCount < targetCompCount (default 3) AND
 * at least one web research provider is configured.
 *
 * Returns structured WebComparable[] tagged as "web_sourced".
 */
export async function enrichComparablesFromWeb(
  context: WebEnrichmentContext,
  existingCompCount: number,
  targetCompCount?: number,
): Promise<WebComparable[]> {
  const target = targetCompCount ?? 3;

  // Gate: don't call web APIs if we already have enough comps
  if (existingCompCount >= target) {
    return [];
  }

  // Gate: check if any web research provider is configured
  if (!isWebResearchAvailable()) {
    logger.info("Web enrichment skipped — no web research providers configured", "web-enricher");
    return [];
  }

  logger.info(
    `Web enrichment triggered: ${existingCompCount} DB comps < ${target} target for "${context.propertyName}" in ${context.location}`,
    "web-enricher",
  );

  try {
    const results = await conductWebResearch({
      propertyContext: {
        name: context.propertyName,
        location: context.location,
        qualityTier: context.qualityTier,
        roomCount: context.roomCount,
        businessModel: context.businessModel,
      },
      researchType: "comparable_properties",
      country: context.country,
    });

    if (results.length === 0) {
      logger.info("Web enrichment returned no results", "web-enricher");
      return [];
    }

    // Extract comparables from all research results
    const allWebComps: WebComparable[] = [];
    for (const result of results) {
      const extracted = extractComparablesFromResult(result);
      allWebComps.push(...extracted);
    }

    // Attach location from context to comps that don't have one
    for (const comp of allWebComps) {
      if (!comp.location) {
        comp.location = context.location;
      }
      if (!comp.qualityTier && context.qualityTier) {
        comp.qualityTier = context.qualityTier;
      }
    }

    const deduped = dedupeWebComparables(allWebComps);

    logger.info(
      `Web enrichment found ${deduped.length} web comparables from ${results.length} source(s)`,
      "web-enricher",
    );

    return deduped;
  } catch (error: unknown) {
    logger.warn(
      `Web enrichment failed: ${error instanceof Error ? error.message : error}`,
      "web-enricher",
    );
    return [];
  }
}
