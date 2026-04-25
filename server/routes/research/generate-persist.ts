import type { Request } from "express";
import { storage } from "../../storage";
import { getAuthUser } from "../../auth";
import { logActivity } from "../helpers";
import { validateResearchValues } from "../../../calc/research/validate-research";
import {
  DEFAULT_ROOM_COUNT,
  DEFAULT_START_ADR,
  DEFAULT_MAX_OCCUPANCY,
} from "../../../shared/constants";
import { resolveDefault } from "../../defaults";
import { logger } from "../../logger";
import { logApiCost, estimateCost } from "../../middleware/cost-logger";
import { processNotificationEvent } from "../../notifications/engine";
import { createEvent } from "../../notifications/events";
import { parseResearchJSON } from "../../ai/aiResearch";
import type { WebResearchResult } from "../../ai/web-research";
import type { ResearchParams } from "../../ai/research-prompt-builders";
import type { GlobalAssumptions } from "@shared/schema";
import {
  persistPropertyGuidance,
  persistCompanyGuidance,
} from "./generate-persist-guidance";

export interface PersistResearchInput {
  req: Request;
  type: "property" | "company" | "global";
  propertyId: number | undefined;
  ga: GlobalAssumptions | undefined;
  fullContent: string;
  marketIntelligence: any;
  webResearchResults: WebResearchResult[];
  model: string;
  secondaryModel: string | undefined;
  vendorKey: "openai" | "anthropic" | "google";
  params: ResearchParams;
  startTime: number;
  earlyRunId: number | undefined;
  specialistId?: string;
}

export interface PersistResearchResult {
  earlyRunFinalized: boolean;
}

/**
 * Post-streaming pipeline: validates research values, persists guidance
 * records to the assumption store + vector index, attaches market /
 * web-research metadata, upserts the canonical market_research row, logs
 * activity / cost, and emits the RESEARCH_COMPLETE notification.
 *
 * Returns whether the early research_runs row was finalized as part of the
 * property guidance flow so the caller can avoid a duplicate finalize.
 */
export async function persistResearchOutput(
  input: PersistResearchInput,
): Promise<PersistResearchResult> {
  const {
    req,
    type,
    propertyId,
    ga,
    fullContent,
    marketIntelligence,
    webResearchResults,
    model,
    secondaryModel,
    vendorKey,
    params,
    startTime,
    earlyRunId,
    specialistId,
  } = input;

  let earlyRunFinalized = false;
  if (!fullContent) return { earlyRunFinalized };

  const parsed = parseResearchJSON(fullContent);

  // Validate and extract research values for property research.
  if (type === "property" && propertyId && !parsed.rawResponse) {
    await applyValidatedResearchValues({ req, propertyId, parsed });
  }

  if (type === "property" && propertyId && !parsed.rawResponse) {
    const result = await persistPropertyGuidance({
      req,
      propertyId,
      parsed: parsed as Record<string, unknown>,
      fullContent,
      params,
      model,
      secondaryModel,
      startTime,
      earlyRunId,
      specialistId,
    });
    earlyRunFinalized = result.earlyRunFinalized;
  }

  if (type === "company" && !parsed.rawResponse && ga) {
    const companyResult = await persistCompanyGuidance({
      req,
      ga,
      parsed: parsed as Record<string, unknown>,
      fullContent,
      params,
      model,
      secondaryModel,
      startTime,
      earlyRunId,
      specialistId,
    });
    if (companyResult.earlyRunFinalized) earlyRunFinalized = true;
  }

  if (marketIntelligence) {
    parsed._marketIntelligence = {
      benchmarks: marketIntelligence.benchmarks || null,
      moodys: marketIntelligence.moodys || null,
      spGlobal: marketIntelligence.spGlobal || null,
      costar: marketIntelligence.costar || null,
      xotelo: marketIntelligence.xotelo || null,
      groundedResearch: marketIntelligence.groundedResearch || [],
      errors: marketIntelligence.errors || [],
      fetchedAt: marketIntelligence.fetchedAt || null,
    };
  }

  // Attach web research citations alongside market intelligence
  if (webResearchResults.length > 0) {
    parsed._webSources = webResearchResults.map((wr) => ({
      source: wr.source,
      query: wr.query,
      summary: wr.summary,
      citations: wr.citations,
      retrievedAt: wr.retrievedAt.toISOString(),
      tokenCost: wr.tokenCost ?? null,
    }));
  }

  if (parsed.rawResponse && type === "property") {
    logger.warn(
      `Skipping market_research storage for property ${propertyId} — AI returned unparseable response`,
      "research",
    );
  } else {
    await storage.upsertMarketResearch({
      userId: getAuthUser(req).id,
      propertyId,
      type,
      title: `${type === "property" ? "Property" : type === "company" ? "Company" : "Global"} Research`,
      content: parsed,
    });
  }

  logActivity(req, "generate", "market_research", propertyId, type);

  const svcName = (
    vendorKey === "google" ? "gemini" : vendorKey === "openai" ? "openai" : "anthropic"
  ) as "gemini" | "openai" | "anthropic";
  const inTok = Math.round(JSON.stringify(params).length / 4);
  const outTok = Math.round(fullContent.length / 4);
  try {
    logApiCost({
      timestamp: new Date().toISOString(),
      service: svcName,
      model,
      operation: "research",
      inputTokens: inTok,
      outputTokens: outTok,
      estimatedCostUsd: estimateCost(svcName, model, inTok, outTok),
      durationMs: Date.now() - startTime,
      userId: req.user?.id,
      route: "/api/research/generate",
    });
  } catch (e: unknown) {
    logger.warn(
      `Failed to log API cost: ${e instanceof Error ? e.message : String(e)}`,
      "cost-logger",
    );
  }

  processNotificationEvent(
    createEvent("RESEARCH_COMPLETE", {
      propertyId,
      message: `${type === "property" ? "Property" : type === "company" ? "Company" : "Global"} research generation complete`,
      link: propertyId ? `/property/${propertyId}/research` : undefined,
    }),
  ).catch((err) =>
    logger.error(`Notification error: ${err?.message || err}`, "research"),
  );

  return { earlyRunFinalized };
}

interface ApplyValidatedValuesInput {
  req: Request;
  propertyId: number;
  parsed: ReturnType<typeof parseResearchJSON>;
}

/**
 * Pulls the orchestrator-embedded `_researchValues` map, validates each
 * value against the current property defaults, persists the cleaned values
 * back onto the property, and stamps `parsed._validation` with the summary
 * for downstream consumers.
 */
async function applyValidatedResearchValues(
  input: ApplyValidatedValuesInput,
): Promise<void> {
  const { req, propertyId, parsed } = input;
  const researchValues = parsed._researchValues as
    | Record<string, { display: string; mid: number; source: "ai" }>
    | undefined;
  if (!researchValues || Object.keys(researchValues).length === 0) return;

  const property = await storage.getProperty(propertyId);
  if (!property) {
    logger.warn(
      `Skipping researchValues storage for property ${propertyId} — property not found`,
      "research",
    );
    return;
  }

  const validated = validateResearchValues(researchValues, {
    roomCount:
      property.roomCount ??
      (await resolveDefault<number>("mc.property_defaults.roomCount")) ??
      DEFAULT_ROOM_COUNT,
    startAdr:
      property.startAdr ??
      (await resolveDefault<number>("mc.property_defaults.startAdr")) ??
      DEFAULT_START_ADR,
    maxOccupancy:
      property.maxOccupancy ??
      (await resolveDefault<number>("mc.property_defaults.maxOccupancy")) ??
      DEFAULT_MAX_OCCUPANCY,
    purchasePrice: property.purchasePrice ?? undefined,
    costRateRooms: property.costRateRooms ?? undefined,
    costRateFB: property.costRateFB ?? undefined,
    businessModel: property.businessModel ?? undefined,
  });
  const cleanValues: Record<
    string,
    { display: string; mid: number; source: "ai" }
  > = {};
  for (const [k, v] of Object.entries(validated.values)) {
    cleanValues[k] = { display: v.display, mid: v.mid, source: v.source };
  }
  await storage.updateProperty(propertyId, { researchValues: cleanValues });
  logActivity(
    req,
    "apply-research-values",
    "property",
    propertyId,
    property.name,
    {
      fieldsApplied: Object.keys(cleanValues).length,
      warnings: validated.summary.warned,
      failures: validated.summary.failed,
    },
  );
  parsed._validation = validated.summary;
  if (validated.summary.warned > 0 || validated.summary.failed > 0) {
    logger.warn(
      `Research validation for property ${propertyId}: ${validated.summary.warned} warnings, ${validated.summary.failed} failures`,
      "research",
    );
  }
}
