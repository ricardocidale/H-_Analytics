import { storage } from "../storage";
import { logger } from "../logger";
import {
  orchestrateResearch,
  isOrchestratorAvailable,
} from "./research-orchestrator";
import {
  generateResearchWithToolsStream,
  parseResearchJSON,
} from "./aiResearch";
import { createResearchClient, resolveVendorFromModel } from "./research-client";
import { getAnthropicClient, getOpenAIClient, getGeminiClient } from "./clients";
import { DEFAULT_RESEARCH_MODEL } from "./resolve-llm";
import { extractGuidance } from "./guidance/extractor";
import { PROPERTY_ASSUMPTION_KEYS } from "./guidance/schemas";
import { buildCompanyContextPack } from "./context-pack/company-pack";
import { assembleResearchPrompt } from "./prompt/assemble-research-prompt";
import {
  indexAssumptionGuidance,
  isVectorStoreAvailable,
} from "./vector-store-service";
import type { ResearchParams } from "./research-prompt-builders";
import type { GuidanceRecord } from "./guidance/schemas";
import type { LlmVendor, ResearchConfig, ContextLlmConfig } from "@shared/schema";

export type AnalystScope = "company";

export interface RunAnalystScopedParams {
  scope: AnalystScope;
  userId: number;
  /**
   * Optional filter — only guidance records whose `assumptionKey` is in this
   * list are returned to the caller. All records are still persisted so the
   * work is not wasted if a different tab asks for overlapping fields later.
   */
  fields?: string[];
}

export interface RunAnalystScopedResult {
  guidance: GuidanceRecord[];
  runId: number;
  durationMs: number;
  totalRecords: number;
  filteredRecords: number;
}

/**
 * Non-HTTP entry point to the Analyst research pipeline.
 *
 * Mirrors the company branch of `POST /api/market-research` but without
 * streaming, Express coupling, or notification side-effects. Intended for:
 *
 *  - the Admin "Analyst" button (scoped refresh of a sub-tab's fields)
 *  - the later scheduled/batch pre-population worker
 *  - tests
 *
 * Persists a `research_runs` row and upserts `assumption_guidance` for every
 * record the Analyst produced (entityType="company", entityId=userId). The
 * `fields` parameter only filters the returned slice — it does not scope
 * the LLM prompt. That keeps prompt assembly stable and lets subsequent
 * calls re-use recently-produced guidance without re-running the model.
 */
export async function runAnalystScoped(
  params: RunAnalystScopedParams,
): Promise<RunAnalystScopedResult> {
  const { scope, userId, fields } = params;
  if (scope !== "company") {
    throw new Error(`runAnalystScoped: unsupported scope "${scope}"`);
  }

  const startTime = Date.now();

  const ga = await storage.getGlobalAssumptions(userId);
  if (!ga) {
    throw new Error("runAnalystScoped: global assumptions not found for user");
  }

  const researchConfig = (ga.researchConfig as ResearchConfig) ?? {};
  const contextLlm = researchConfig.companyLlm;
  const configuredVendor = (contextLlm?.llmVendor || "anthropic") as LlmVendor;
  const model =
    contextLlm?.primaryLlm ||
    researchConfig.preferredLlm ||
    DEFAULT_RESEARCH_MODEL;

  const vendorKey = (["openai", "anthropic", "google"].includes(configuredVendor)
    ? configuredVendor
    : resolveVendorFromModel(model)) as "openai" | "anthropic" | "google";

  const researchClient = createResearchClient(vendorKey, {
    anthropic: vendorKey === "anthropic" ? getAnthropicClient() : undefined,
    openai: vendorKey === "openai" ? getOpenAIClient() : undefined,
    gemini: vendorKey === "google" ? getGeminiClient() : undefined,
  });

  // ── Build company context pack + v2 prompt ──
  const properties = await storage.getAllProperties();
  const serviceTemplates = await storage.getAllServiceTemplates();
  const companyPack = buildCompanyContextPack(
    ga,
    properties,
    serviceTemplates.map((st) => ({
      name: st.name,
      defaultRate: st.defaultRate ?? 0,
      serviceModel: st.serviceModel ?? "percentage",
      serviceMarkup: st.serviceMarkup ?? 0,
      isActive: st.isActive !== false,
    })),
  );

  let ambientDataStr: string | undefined;
  try {
    const benchmarks = await storage.getBenchmarkSnapshots();
    if (benchmarks.length > 0) {
      ambientDataStr = benchmarks
        .map(
          (b) =>
            `${b.snapshotKey} (${b.category}): ${b.value}${b.source ? ` [${b.source}]` : ""}${b.staleness === "stale" ? " [STALE]" : ""}`,
        )
        .join("\n");
    }
  } catch (err: unknown) {
    logger.warn(
      `analyst-scoped-runner: benchmark snapshot fetch failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      "analyst-scoped-runner",
    );
  }

  const v2Prompt = assembleResearchPrompt(companyPack, {
    tier: 1,
    entityType: "company",
    ambientData: ambientDataStr,
  });

  // ── Minimal ResearchParams for the company scope ──
  // We intentionally skip the MarketIntelligenceAggregator + web research here
  // (both are property-scoped in practice). Follow-up: if company-scope
  // research quality suffers, re-add an aggregator call with a "global"
  // context.
  const researchParams: ResearchParams = {
    type: "company",
    assetDefinition: {
      minRooms: 0,
      maxRooms: 0,
      hasFB: false,
      hasEvents: false,
      hasWellness: false,
      minAdr: 0,
      maxAdr: 0,
    },
    researchVariables: {},
    propertyLabel: ga.propertyLabel ?? undefined,
  };

  // ── Run the engine ──
  const useOrchestrator = isOrchestratorAvailable();
  const stream = useOrchestrator
    ? orchestrateResearch(researchParams, v2Prompt)
    : generateResearchWithToolsStream(
        researchParams,
        researchClient,
        model,
        undefined,
        v2Prompt,
      );

  let fullContent = "";
  for await (const chunk of stream) {
    if (chunk.type === "content") {
      fullContent += chunk.data;
    } else if (
      chunk.type === "error" &&
      typeof chunk.data === "string" &&
      chunk.data.startsWith("ORCHESTRATOR_BOTH_FAILED")
    ) {
      // Orchestrator gave up — fall back to single-model
      logger.warn(
        "analyst-scoped-runner: orchestrator failed, falling back to single-model",
        "analyst-scoped-runner",
      );
      const fallback = generateResearchWithToolsStream(
        researchParams,
        researchClient,
        model,
        undefined,
        v2Prompt,
      );
      for await (const fb of fallback) {
        if (fb.type === "content") fullContent += fb.data;
      }
      break;
    }
  }

  if (!fullContent) {
    throw new Error("runAnalystScoped: engine produced no content");
  }

  const parsed = parseResearchJSON(fullContent);
  if (parsed.rawResponse) {
    throw new Error("runAnalystScoped: engine output was not valid JSON");
  }

  // Admin "global" defaults are a union of company- AND property-flavored
  // fields (e.g., PropertyUnderwriting tab edits `adr`, `ltv`, `maxOccupancy`).
  // Pass `PROPERTY_ASSUMPTION_KEYS` as the extra valid-key set so those
  // keys survive the filter step; persistence still happens under
  // `entityType="company"` (admin scope), preserving the downstream
  // contract for the assumption_guidance table.
  const guidanceResult = extractGuidance(
    parsed as Record<string, unknown>,
    1,
    "company",
    { extraValidKeys: PROPERTY_ASSUMPTION_KEYS },
  );
  if (guidanceResult.errors.length > 0) {
    logger.warn(
      `analyst-scoped-runner: extraction warnings — ${guidanceResult.errors.join("; ")}`,
      "analyst-scoped-runner",
    );
  }

  const durationMs = Date.now() - startTime;

  // ── Persist research_run + assumption_guidance rows ──
  const runRecord = await storage.createResearchRun({
    userId,
    entityType: "company",
    entityId: userId,
    scenarioId: null,
    tier: 1,
    status: "completed",
    completedAt: new Date(),
    durationMs,
    modelPrimary: model,
    modelSecondary: null,
    tokensUsed: Math.round(
      (JSON.stringify(researchParams).length + fullContent.length) / 4,
    ),
    estimatedCost: null,
    error: null,
    metadata: {
      guidanceRecords: guidanceResult.records.length,
      errors: guidanceResult.errors,
      scope,
      requestedFields: fields ?? null,
    },
  });

  for (const rec of guidanceResult.records) {
    await storage.upsertAssumptionGuidance({
      researchRunId: runRecord.id,
      entityType: "company",
      entityId: userId,
      scenarioId: null,
      assumptionKey: rec.assumptionKey,
      valueLow: rec.valueLow ?? null,
      valueMid: rec.valueMid ?? null,
      valueHigh: rec.valueHigh ?? null,
      confidence: rec.confidence,
      sourceName: rec.sourceName ?? null,
      sourceDate: rec.sourceDate ?? null,
      reasoning: rec.reasoning ?? null,
      comparableSet:
        (rec.comparableSet as Record<string, unknown> | null | undefined) ??
        null,
    });

    if (isVectorStoreAvailable()) {
      indexAssumptionGuidance({
        entityType: "company",
        entityId: userId,
        scenarioId: null,
        location: "",
        propertyType: "company",
        businessModel: "company",
        assumptionKey: rec.assumptionKey,
        valueLow: rec.valueLow ?? null,
        valueMid: rec.valueMid ?? null,
        valueHigh: rec.valueHigh ?? null,
        confidence:
          rec.confidence === "high"
            ? 0.9
            : rec.confidence === "medium"
              ? 0.7
              : 0.4,
        reasoning: rec.reasoning ?? null,
      }).catch((err) =>
        logger.warn(
          `analyst-scoped-runner: vector index failed (non-blocking): ${err instanceof Error ? err.message : err}`,
          "analyst-scoped-runner",
        ),
      );
    }
  }

  logger.info(
    `analyst-scoped-runner: ${guidanceResult.records.length} guidance records written for user ${userId} (run ${runRecord.id}, ${durationMs}ms)`,
    "analyst-scoped-runner",
  );

  // ── Filter returned slice by requested fields (if any) ──
  const fieldSet = fields && fields.length > 0 ? new Set(fields) : null;
  const filtered = fieldSet
    ? guidanceResult.records.filter((r) => fieldSet.has(r.assumptionKey))
    : guidanceResult.records;

  return {
    guidance: filtered,
    runId: runRecord.id,
    durationMs,
    totalRecords: guidanceResult.records.length,
    filteredRecords: filtered.length,
  };
}
