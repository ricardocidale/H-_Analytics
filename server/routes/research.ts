import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin, isApiRateLimited, checkPropertyAccess , getAuthUser } from "../auth";
import { researchGenerateSchema, researchQuestionCreateSchema, researchQuestionPatchSchema, logActivity, logAndSendError } from "./helpers";
import { fromZodError } from "zod-validation-error";
import { generateResearchWithToolsStream, buildUserPrompt, parseResearchJSON, extractResearchValues } from "../ai/aiResearch";
import { orchestrateResearch, isOrchestratorAvailable } from "../ai/research-orchestrator";
import { validateResearchValues } from "../../calc/research/validate-research";
import { processNotificationEvent } from "../notifications/engine";
import { createEvent } from "../notifications/events";
import { getAnthropicClient, getOpenAIClient, getGeminiClient, normalizeModelId } from "../ai/clients";
import { createResearchClient, resolveVendorFromModel } from "../ai/research-client";
import { DEFAULT_RESEARCH_MODEL } from "../ai/resolve-llm";
import type { ResearchConfig, ResearchEventConfig, LlmVendor } from "@shared/schema";
import { DEFAULT_RESEARCH_EVENT_CONFIG, DEFAULT_RESEARCH_REFRESH_INTERVAL_DAYS, DEFAULT_ROOM_COUNT, DEFAULT_START_ADR, DEFAULT_MAX_OCCUPANCY } from "../../shared/constants";
import { getMarketIntelligenceAggregator } from "../services/MarketIntelligenceAggregator";
import { logApiCost, estimateCost } from "../middleware/cost-logger";
import { logger } from "../logger";
import { buildPropertyContextPack } from "../ai/context-pack/property-pack";
import { buildCompanyContextPack } from "../ai/context-pack/company-pack";
import { assembleResearchPrompt } from "../ai/prompt/assemble-research-prompt";
import { extractGuidance } from "../ai/guidance/extractor";
import { flag } from "../feature-flags";
import type { IcpConfig } from "@shared/schema/types/jsonb-shapes";
import { indexAssumptionGuidance, retrieveSimilarGuidance, isPineconeAvailable } from "../ai/pinecone-service";

export function register(app: Express) {
  // ────────────────────────────────────────────────────────────
  // MARKET RESEARCH
  // AI-powered research generation using Claude/GPT/Gemini. Streams responses
  // via Server-Sent Events (SSE) and persists results to the database.
  // ────────────────────────────────────────────────────────────

  // Research status summary — used by the Research Hub page
  app.get("/api/research/status", requireAuth, async (req, res) => {
    try {
      const allResearch = await storage.getAllMarketResearch(getAuthUser(req).id);
      const allProperties = await storage.getAllProperties(getAuthUser(req).id);

      const ga = await storage.getGlobalAssumptions(getAuthUser(req).id);
      const researchConfig = (ga?.researchConfig as ResearchConfig) ?? {};

      const getStatus = (updatedAt: Date | null | undefined, type: 'property' | 'company' | 'global'): "fresh" | "stale" | "missing" => {
        if (!updatedAt) return "missing";
        const intervalDays = researchConfig[type]?.refreshIntervalDays ?? DEFAULT_RESEARCH_REFRESH_INTERVAL_DAYS;
        const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
        return Date.now() - new Date(updatedAt).getTime() < intervalMs ? "fresh" : "stale";
      };

      // Property research status
      const propertyResearchMap = new Map<number, { updatedAt: Date | null; llmModel: string | null }>();
      for (const r of allResearch) {
        if (r.type === "property" && r.propertyId) {
          const existing = propertyResearchMap.get(r.propertyId);
          if (!existing || (r.updatedAt && (!existing.updatedAt || r.updatedAt > existing.updatedAt))) {
            propertyResearchMap.set(r.propertyId, { updatedAt: r.updatedAt, llmModel: r.llmModel });
          }
        }
      }

      const propertyStatuses = allProperties.map((p) => {
        const r = propertyResearchMap.get(p.id);
        return {
          propertyId: p.id,
          name: p.name,
          location: p.location,
          imageUrl: p.imageUrl,
          status: getStatus(r?.updatedAt, "property"),
          updatedAt: r?.updatedAt?.toISOString() || null,
          llmModel: r?.llmModel || null,
        };
      });

      // Company & global research
      const companyResearch = allResearch.find((r) => r.type === "company");
      const globalResearch = allResearch.find((r) => r.type === "global");

      res.json({
        properties: propertyStatuses,
        company: { status: getStatus(companyResearch?.updatedAt, "company"), updatedAt: companyResearch?.updatedAt?.toISOString() || null },
        global: { status: getStatus(globalResearch?.updatedAt, "global"), updatedAt: globalResearch?.updatedAt?.toISOString() || null },
      });
    } catch (error) {
      logAndSendError(res, "Failed to fetch research status", error);
    }
  });

  app.get("/api/market-research", requireAuth, async (req, res) => {
    try {
      const { type, propertyId } = req.query;
      if (propertyId && !(await checkPropertyAccess(getAuthUser(req), Number(propertyId)))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const research = await storage.getMarketResearch(
        type as string,
        getAuthUser(req).id,
        propertyId ? Number(propertyId) : undefined
      );
      res.json(research || null);
    } catch (error) {
      logAndSendError(res, "Failed to fetch research", error);
    }
  });

  app.get("/api/research/property", requireAuth, async (req, res) => {
    try {
      const { propertyId } = req.query;
      if (propertyId && !(await checkPropertyAccess(getAuthUser(req), Number(propertyId)))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const research = await storage.getMarketResearch(
        "property",
        getAuthUser(req).id,
        propertyId ? Number(propertyId) : undefined
      );
      res.json(research || null);
    } catch (error) {
      logAndSendError(res, "Failed to fetch research", error);
    }
  });

  app.post("/api/research/generate", requireAuth, async (req, res) => {
    try {
      const validation = researchGenerateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const { type, propertyId, propertyContext, assetDefinition, researchVariables } = validation.data;

      if (propertyId && !(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (isApiRateLimited(getAuthUser(req).id, "market-research", 5)) {
        return res.status(429).json({ error: "Rate limit exceeded. Please wait a minute." });
      }

      const ga = await storage.getGlobalAssumptions(getAuthUser(req).id);
      
      // Resolve admin-configured event config for this research type
      const researchConfig = (ga?.researchConfig as ResearchConfig) ?? {};
      const contextKey = type === "property" ? "propertyLlm" : type === "global" ? "marketLlm" : "companyLlm";
      const contextLlm = researchConfig[contextKey as keyof ResearchConfig] as import("@shared/schema").ContextLlmConfig | undefined;
      const model = normalizeModelId(contextLlm?.primaryLlm || researchConfig.preferredLlm || ga?.preferredLlm || DEFAULT_RESEARCH_MODEL);
      const secondaryModel = contextLlm?.llmMode === "dual" && contextLlm.secondaryLlm ? normalizeModelId(contextLlm.secondaryLlm) : undefined;

      const configuredVendor = (contextLlm?.llmVendor || "anthropic") as LlmVendor;
      const vendorKey = (["openai", "anthropic", "google"].includes(configuredVendor)
        ? configuredVendor
        : resolveVendorFromModel(model)) as "openai" | "anthropic" | "google";

      const researchClient = createResearchClient(vendorKey, {
        anthropic: vendorKey === "anthropic" ? getAnthropicClient() : undefined,
        openai: vendorKey === "openai" ? getOpenAIClient() : undefined,
        gemini: vendorKey === "google" ? getGeminiClient() : undefined,
      });

      const rawEventConfig = researchConfig[type as 'property' | 'company' | 'global'];
      const eventConfig: ResearchEventConfig = { ...DEFAULT_RESEARCH_EVENT_CONFIG, ...(rawEventConfig ?? {}) };

      const sourceEntries = eventConfig.sources ?? [];
      if (type === "company") {
        const companySrc = researchConfig.companySources ?? [];
        sourceEntries.push(...companySrc);
      }
      if (sourceEntries.length > 0) {
        eventConfig.customSources = sourceEntries.map((s) => ({ name: s.label, url: s.url, category: s.category || "General" }));
      }

      // If admin disabled this research type, block the request
      if (!eventConfig.enabled) {
        return res.status(403).json({ error: `Research type "${type}" is disabled by admin configuration.` });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const adWithGlobal = {
        ...(assetDefinition as any),
        description: (assetDefinition as any)?.description || ga?.assetDescription || undefined,
      };

      let marketIntelligence;
      try {
        const aggregator = getMarketIntelligenceAggregator();
        const pc = propertyContext as any;
        marketIntelligence = await aggregator.gather({
          location: pc?.location || pc?.market,
          propertyType: (assetDefinition as any)?.level || "boutique hotel",
          propertyId: propertyId || undefined,
        });
      } catch (err) {
        logger.warn(`Market intelligence fetch failed (non-blocking): ${err instanceof Error ? err.message : err}`, "research");
      }

      const params = {
        type,
        propertyId: propertyId || undefined,
        propertyContext: propertyContext as any,
        assetDefinition: adWithGlobal,
        researchVariables,
        propertyLabel: ga?.propertyLabel,
        eventConfig,
        marketIntelligence,
      };

      const startTime = Date.now();

      let v2Prompt: string | undefined;
      let propertyContextPack: import("../ai/context-pack/types").PropertyContextPack | undefined;
      if (flag("RI_V2_WRITE")) {
        try {
          let ambientDataStr: string | undefined;
          const benchmarks = await storage.getBenchmarkSnapshots();
          if (benchmarks.length > 0) {
            ambientDataStr = benchmarks.map(b =>
              `${b.snapshotKey} (${b.category}): ${b.value}${b.source ? ` [${b.source}]` : ""}${b.staleness === "stale" ? " [STALE]" : ""}`
            ).join("\n");
          }

          if (type === "property" && propertyId) {
            const property = await storage.getProperty(propertyId);
            if (property) {
              const icpConfig = (ga?.icpConfig as IcpConfig) ?? null;
              propertyContextPack = buildPropertyContextPack(property, ga ?? null, icpConfig);

              // Retrieve prior assumption guidance from similar properties (non-blocking)
              let priorGuidanceStr: string | undefined;
              try {
                if (isPineconeAvailable()) {
                  const priorGuidance = await retrieveSimilarGuidance({
                    location: property.location ?? "",
                    propertyType: (property as any).hospitalityType ?? "boutique hotel",
                    topK: 15,
                  });
                  if (priorGuidance.length > 0) {
                    const lines = priorGuidance.map(g =>
                      `- **${g.assumptionKey}** (${g.location}, ${g.propertyType}): low=${g.valueLow ?? "—"}, mid=${g.valueMid ?? "—"}, high=${g.valueHigh ?? "—"} [confidence: ${g.confidence.toFixed(1)}, score: ${g.score.toFixed(2)}]${g.reasoning ? ` — ${g.reasoning.slice(0, 120)}` : ""}`
                    );
                    priorGuidanceStr = `## Prior Assumption Benchmarks (from similar properties)\n\n${lines.join("\n")}`;
                  }
                }
              } catch (err) {
                logger.warn(`Prior guidance retrieval failed (non-blocking): ${err instanceof Error ? err.message : err}`, "research");
              }

              v2Prompt = assembleResearchPrompt(propertyContextPack, {
                tier: 1,
                entityType: "property",
                ambientData: ambientDataStr,
                priorResearch: priorGuidanceStr,
              });
            }
          } else if (type === "company" && ga) {
            const properties = await storage.getAllProperties(getAuthUser(req).id);
            const serviceTemplates = await storage.getAllServiceTemplates();
            const companyPack = buildCompanyContextPack(
              ga,
              properties,
              serviceTemplates.map(st => ({
                name: st.name,
                defaultRate: st.defaultRate ?? 0,
                serviceModel: st.serviceModel ?? "percentage",
                serviceMarkup: st.serviceMarkup ?? 0,
                isActive: st.isActive !== false,
              })),
            );
            v2Prompt = assembleResearchPrompt(companyPack, {
              tier: 1,
              entityType: "company",
              ambientData: ambientDataStr,
            });
          }
        } catch (err) {
          logger.warn(`RI v2 prompt assembly failed, falling back to v1: ${err instanceof Error ? err.message : err}`, "research");
        }
      }

      const useOrchestrator = type === "property" && isOrchestratorAvailable();
      let earlyRunId: number | undefined;
      if (useOrchestrator && propertyContextPack && propertyId) {
        const earlyRun = await storage.createResearchRun({
          userId: getAuthUser(req).id,
          entityType: "property",
          entityId: propertyId,
          scenarioId: null,
          tier: 1,
          status: "running",
          completedAt: null,
          durationMs: null,
          modelPrimary: model,
          modelSecondary: secondaryModel ?? null,
          tokensUsed: null,
          estimatedCost: null,
          error: null,
          metadata: null,
        });
        earlyRunId = earlyRun.id;
      }
      const relaxCtx = (useOrchestrator && propertyContextPack && propertyId && earlyRunId)
        ? { researchRunId: earlyRunId, userId: getAuthUser(req).id, contextPack: propertyContextPack }
        : undefined;
      const stream = useOrchestrator
        ? orchestrateResearch(params, v2Prompt, relaxCtx)
        : generateResearchWithToolsStream(params, researchClient, model, secondaryModel, v2Prompt);

      // ── Stream loop — accumulate content, forward events to client ──
      let fullContent = "";

      for await (const chunk of stream) {
        // Orchestrator hard failure — fall back to single-model
        if (chunk.type === "error" && chunk.data.startsWith("ORCHESTRATOR_BOTH_FAILED")) {
          res.write(`data: ${JSON.stringify({ type: "phase", data: "Falling back to single-model research…" })}\n\n`);
          const fallback = generateResearchWithToolsStream(params, researchClient, model, secondaryModel, v2Prompt);
          for await (const fb of fallback) {
            res.write(`data: ${JSON.stringify(fb)}\n\n`);
            if (fb.type === "content") fullContent += fb.data;
          }
          break;
        }
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (chunk.type === "content") fullContent += chunk.data;
      }

      // ── Post-processing — runs after both orchestrator and fallback paths ──
      let earlyRunFinalized = false;
      if (fullContent) {
        const parsed = parseResearchJSON(fullContent);

        // Validate and extract research values for property research
        if (type === "property" && propertyId && !parsed.rawResponse) {
          const researchValues = extractResearchValues(parsed);
          if (researchValues) {
            const property = await storage.getProperty(propertyId);
            if (property) {
              const validated = validateResearchValues(researchValues, {
                roomCount: property.roomCount ?? DEFAULT_ROOM_COUNT,
                startAdr: property.startAdr ?? DEFAULT_START_ADR,
                maxOccupancy: property.maxOccupancy ?? DEFAULT_MAX_OCCUPANCY,
                purchasePrice: property.purchasePrice ?? undefined,
                costRateRooms: property.costRateRooms ?? undefined,
                costRateFB: property.costRateFB ?? undefined,
              });
              const cleanValues: Record<string, { display: string; mid: number; source: "ai" }> = {};
              for (const [k, v] of Object.entries(validated.values)) {
                cleanValues[k] = { display: v.display, mid: v.mid, source: v.source };
              }
              await storage.updateProperty(propertyId, { researchValues: cleanValues });
              logActivity(req, "apply-research-values", "property", propertyId, property.name, {
                fieldsApplied: Object.keys(cleanValues).length,
                warnings: validated.summary.warned,
                failures: validated.summary.failed,
              });
              parsed._validation = validated.summary;
              if (validated.summary.warned > 0 || validated.summary.failed > 0) {
                logger.warn(`Research validation for property ${propertyId}: ${validated.summary.warned} warnings, ${validated.summary.failed} failures`, "research");
              }
            } else {
              logger.warn(`Skipping researchValues storage for property ${propertyId} — property not found`, "research");
            }
          }
        }

        if (flag("RI_V2_WRITE") && type === "property" && propertyId && !parsed.rawResponse) {
          try {
            const guidanceResult = extractGuidance(parsed as Record<string, unknown>, 1, "property");
            if (guidanceResult.records.length > 0) {
              const property = await storage.getProperty(propertyId);
              if (property) {
                let runId: number;
                if (earlyRunId) {
                  await storage.updateResearchRun(earlyRunId, {
                    status: "completed",
                    completedAt: new Date(),
                    durationMs: Date.now() - startTime,
                    tokensUsed: Math.round((JSON.stringify(params).length + fullContent.length) / 4),
                    metadata: { guidanceRecords: guidanceResult.records.length, errors: guidanceResult.errors },
                  });
                  runId = earlyRunId;
                  earlyRunFinalized = true;
                } else {
                  const runRecord = await storage.createResearchRun({
                    userId: getAuthUser(req).id,
                    entityType: "property",
                    entityId: propertyId,
                    scenarioId: null,
                    tier: 1,
                    status: "completed",
                    completedAt: new Date(),
                    durationMs: Date.now() - startTime,
                    modelPrimary: model,
                    modelSecondary: secondaryModel ?? null,
                    tokensUsed: Math.round((JSON.stringify(params).length + fullContent.length) / 4),
                    estimatedCost: null,
                    error: null,
                    metadata: { guidanceRecords: guidanceResult.records.length, errors: guidanceResult.errors },
                  });
                  runId = runRecord.id;
                }

                const propLocation = property.location ?? "";
                const propType = (property as any).hospitalityType ?? "boutique hotel";
                for (const rec of guidanceResult.records) {
                  await storage.upsertAssumptionGuidance({
                    researchRunId: runId,
                    entityType: "property",
                    entityId: propertyId,
                    scenarioId: null,
                    assumptionKey: rec.assumptionKey,
                    valueLow: rec.valueLow ?? null,
                    valueMid: rec.valueMid ?? null,
                    valueHigh: rec.valueHigh ?? null,
                    confidence: rec.confidence,
                    sourceName: rec.sourceName ?? null,
                    sourceDate: rec.sourceDate ?? null,
                    reasoning: rec.reasoning ?? null,
                    comparableSet: (rec.comparableSet as Record<string, unknown>) ?? null,
                  });

                  // Index to Pinecone for cross-property retrieval (fire-and-forget)
                  indexAssumptionGuidance({
                    entityType: "property",
                    entityId: propertyId,
                    location: propLocation,
                    propertyType: propType,
                    assumptionKey: rec.assumptionKey,
                    valueLow: rec.valueLow ?? null,
                    valueMid: rec.valueMid ?? null,
                    valueHigh: rec.valueHigh ?? null,
                    confidence: rec.confidence === "high" ? 0.9 : rec.confidence === "medium" ? 0.7 : 0.4,
                    reasoning: rec.reasoning ?? null,
                  }).catch(err => logger.warn(`Failed to index guidance to Pinecone: ${err}`, "research"));
                }

                logger.info(`RI v2: wrote ${guidanceResult.records.length} guidance records for property ${propertyId} (run ${runId})`, "research");
              }
            }
            if (guidanceResult.errors.length > 0) {
              logger.warn(`RI v2 extraction errors: ${guidanceResult.errors.join("; ")}`, "research");
            }
          } catch (err) {
            logger.warn(`RI v2 guidance extraction failed (non-blocking): ${err instanceof Error ? err.message : err}`, "research");
          }
        }

        const authCompanyId = (getAuthUser(req) as { companyId?: number | null }).companyId;
        if (flag("RI_V2_WRITE") && type === "company" && !parsed.rawResponse && ga && authCompanyId) {
          try {
            const guidanceResult = extractGuidance(parsed as Record<string, unknown>, 1, "company");
            if (guidanceResult.records.length > 0) {
              const companyId = authCompanyId;
              const runRecord = await storage.createResearchRun({
                userId: getAuthUser(req).id,
                entityType: "company",
                entityId: companyId,
                scenarioId: null,
                tier: 1,
                status: "completed",
                completedAt: new Date(),
                durationMs: Date.now() - startTime,
                modelPrimary: model,
                modelSecondary: secondaryModel ?? null,
                tokensUsed: Math.round((JSON.stringify(params).length + fullContent.length) / 4),
                estimatedCost: null,
                error: null,
                metadata: { guidanceRecords: guidanceResult.records.length, errors: guidanceResult.errors },
              });

              for (const rec of guidanceResult.records) {
                await storage.upsertAssumptionGuidance({
                  researchRunId: runRecord.id,
                  entityType: "company",
                  entityId: companyId,
                  scenarioId: null,
                  assumptionKey: rec.assumptionKey,
                  valueLow: rec.valueLow ?? null,
                  valueMid: rec.valueMid ?? null,
                  valueHigh: rec.valueHigh ?? null,
                  confidence: rec.confidence,
                  sourceName: rec.sourceName ?? null,
                  sourceDate: rec.sourceDate ?? null,
                  reasoning: rec.reasoning ?? null,
                  comparableSet: (rec.comparableSet as Record<string, unknown>) ?? null,
                });

                // Index to Pinecone for cross-entity retrieval (fire-and-forget)
                indexAssumptionGuidance({
                  entityType: "company",
                  entityId: companyId,
                  location: ga?.companyName ?? "Management Company",
                  propertyType: "management company",
                  assumptionKey: rec.assumptionKey,
                  valueLow: rec.valueLow ?? null,
                  valueMid: rec.valueMid ?? null,
                  valueHigh: rec.valueHigh ?? null,
                  confidence: rec.confidence === "high" ? 0.9 : rec.confidence === "medium" ? 0.7 : 0.4,
                  reasoning: rec.reasoning ?? null,
                }).catch(err => logger.warn(`Failed to index company guidance to Pinecone: ${err}`, "research"));
              }

              logger.info(`RI v2: wrote ${guidanceResult.records.length} guidance records for company ${companyId} (run ${runRecord.id})`, "research");
            }
            if (guidanceResult.errors.length > 0) {
              logger.warn(`RI v2 company extraction errors: ${guidanceResult.errors.join("; ")}`, "research");
            }
          } catch (err) {
            logger.warn(`RI v2 company guidance extraction failed (non-blocking): ${err instanceof Error ? err.message : err}`, "research");
          }
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

        if (parsed.rawResponse && type === "property") {
          logger.warn(`Skipping market_research storage for property ${propertyId} — AI returned unparseable response`, "research");
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

        const svcName = vendorKey === "google" ? "gemini" : vendorKey === "openai" ? "openai" : "anthropic";
        const inTok  = Math.round(JSON.stringify(params).length / 4);
        const outTok = Math.round(fullContent.length / 4);
        try {
          logApiCost({ timestamp: new Date().toISOString(), service: svcName as any, model, operation: "research", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost(svcName, model, inTok, outTok), durationMs: Date.now() - startTime, userId: req.user?.id, route: "/api/research/generate" });
        } catch (e) { logger.warn(`Failed to log API cost: ${(e as Error).message}`, "cost-logger"); }

        processNotificationEvent(createEvent("RESEARCH_COMPLETE", {
          propertyId,
          message: `${type === "property" ? "Property" : type === "company" ? "Company" : "Global"} research generation complete`,
          link: propertyId ? `/property/${propertyId}/research` : undefined,
        })).catch((err) => logger.error(`Notification error: ${err?.message || err}`, "research"));
      }

      if (earlyRunId && !earlyRunFinalized) {
        try {
          await storage.updateResearchRun(earlyRunId, {
            status: fullContent ? "completed" : "failed",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            tokensUsed: Math.round((JSON.stringify(params).length + (fullContent || "").length) / 4),
            error: fullContent ? null : "No content generated",
          });
        } catch (e) {
          logger.warn(`Failed to finalize early research run ${earlyRunId}: ${(e as Error).message}`, "research");
        }
      }

      res.end();
    } catch (error) {
      logger.error(`Research generation error: ${error instanceof Error ? error.message : error}`, "research");
      res.write(`data: ${JSON.stringify({ type: "error", message: "Generation failed" })}\n\n`);
      res.end();
    }
  });

  app.get("/api/research/last-full-refresh", requireAuth, async (req, res) => {
    try {
      const lastRefresh = await storage.getLastFullResearchRefresh(getAuthUser(req).id);
      res.json({ lastRefresh: lastRefresh?.toISOString() ?? null });
    } catch (error) {
      logAndSendError(res, "Failed to fetch last full research refresh", error);
    }
  });

  app.post("/api/research/mark-full-refresh", requireAuth, async (req, res) => {
    try {
      await storage.markFullResearchRefresh(getAuthUser(req).id);
      res.json({ success: true });
    } catch (error) {
      logAndSendError(res, "Failed to mark full research refresh", error);
    }
  });

  app.get("/api/research/refresh-config", requireAuth, async (req, res) => {
    try {
      const ga = await storage.getGlobalAssumptions(getAuthUser(req).id);
      if (!ga) return res.status(404).json({ error: "No global assumptions found" });
      res.json((ga.researchConfig as ResearchConfig) ?? {});
    } catch (error) {
      logAndSendError(res, "Failed to fetch research refresh config", error);
    }
  });

  // Research Questions CRUD
  app.get("/api/research-questions", requireAuth, async (req, res) => {
    try {
      const questions = await storage.getAllResearchQuestions();
      res.json(questions);
    } catch (error) {
      logAndSendError(res, "Failed to fetch research questions", error);
    }
  });

  app.post("/api/research-questions", requireAdmin, async (req, res) => {
    try {
      const validation = researchQuestionCreateSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      const q = await storage.createResearchQuestion({ question: validation.data.question });
      res.status(201).json(q);
    } catch (error) {
      logAndSendError(res, "Failed to create research question", error);
    }
  });

  app.patch("/api/research-questions/:id", requireAdmin, async (req, res) => {
    try {
      const validation = researchQuestionPatchSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      const q = await storage.updateResearchQuestion(Number(req.params.id), validation.data.question);
      res.json(q);
    } catch (error) {
      logAndSendError(res, "Failed to update research question", error);
    }
  });

  app.delete("/api/research-questions/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteResearchQuestion(Number(req.params.id));
      res.json({ success: true });
    } catch (error) {
      logAndSendError(res, "Failed to delete research question", error);
    }
  });
}
