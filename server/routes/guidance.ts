import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, getAuthUser, checkPropertyAccess } from "../auth";
import { logAndSendError, logActivity } from "./helpers";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { buildPropertyContextPack } from "../ai/context-pack/property-pack";
import { buildCompanyContextPack } from "../ai/context-pack/company-pack";
import { assembleResearchPrompt } from "../ai/prompt/assemble-research-prompt";
import { extractGuidance } from "../ai/guidance/extractor";
import { generateResearchWithToolsStream, parseResearchJSON } from "../ai/aiResearch";
import { createResearchClient, resolveVendorFromModel } from "../ai/research-client";
import { getAnthropicClient, getOpenAIClient, getGeminiClient } from "../ai/clients";
import { DEFAULT_RESEARCH_MODEL } from "../ai/resolve-llm";
import type { IcpConfig } from "@shared/schema/types/jsonb-shapes";

const VALID_ENTITY_TYPES = ["property", "company"] as const;
type EntityType = typeof VALID_ENTITY_TYPES[number];

const entityParamsSchema = z.object({
  entityType: z.enum(VALID_ENTITY_TYPES),
  entityId: z.coerce.number().int().positive(),
});

const guidanceQuerySchema = z.object({
  scenarioId: z.coerce.number().int().positive().optional(),
});

const guidanceDecisionSchema = z.object({
  assumptionGuidanceId: z.number().int().positive(),
  action: z.enum(["accept", "reject", "pin", "dismiss", "apply_p25", "apply_p50", "apply_p75"]),
  previousValue: z.number().nullable().optional(),
  newValue: z.number().nullable().optional(),
});

const researchRunsQuerySchema = z.object({
  entityType: z.enum(VALID_ENTITY_TYPES),
  entityId: z.coerce.number().int().positive(),
});

async function checkEntityAccess(user: Express.User, entityType: EntityType, entityId: number): Promise<boolean> {
  if (entityType === "property") {
    return checkPropertyAccess(user, entityId);
  }
  if (entityType === "company") {
    const authUser = user as { companyId?: number | null; role?: string };
    if (authUser.role === "admin") return true;
    return authUser.companyId === entityId;
  }
  return false;
}

export function register(app: Express) {
  app.get("/api/guidance/:entityType/:entityId", requireAuth, async (req, res) => {
    try {
      const params = entityParamsSchema.safeParse(req.params);
      if (!params.success) return res.status(400).json({ error: fromZodError(params.error).message });

      const { entityType, entityId } = params.data;
      if (!(await checkEntityAccess(getAuthUser(req), entityType, entityId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      const query = guidanceQuerySchema.safeParse(req.query);
      if (!query.success) return res.status(400).json({ error: fromZodError(query.error).message });

      const scenarioId = query.data.scenarioId ?? null;
      const guidance = await storage.getAssumptionGuidance(scenarioId, entityType, entityId);
      res.json(guidance);
    } catch (error) {
      logAndSendError(res, "Failed to fetch guidance", error);
    }
  });

  app.get("/api/guidance/:entityType/:entityId/:assumptionKey", requireAuth, async (req, res) => {
    try {
      const params = entityParamsSchema.safeParse(req.params);
      if (!params.success) return res.status(400).json({ error: fromZodError(params.error).message });

      const { entityType, entityId } = params.data;
      const assumptionKey = String(req.params.assumptionKey);
      if (!(await checkEntityAccess(getAuthUser(req), entityType, entityId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      const query = guidanceQuerySchema.safeParse(req.query);
      if (!query.success) return res.status(400).json({ error: fromZodError(query.error).message });

      const scenarioId = query.data.scenarioId ?? null;
      const guidance = await storage.getAssumptionGuidance(scenarioId, entityType, entityId);
      const match = guidance.find(g => g.assumptionKey === assumptionKey);
      res.json(match ?? null);
    } catch (error) {
      logAndSendError(res, "Failed to fetch guidance for key", error);
    }
  });

  app.post("/api/guidance/decision", requireAuth, async (req, res) => {
    try {
      const validation = guidanceDecisionSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });

      const { assumptionGuidanceId, action, previousValue, newValue } = validation.data;
      const user = getAuthUser(req);

      const guidanceRecord = await storage.getAssumptionGuidanceById(assumptionGuidanceId);
      if (!guidanceRecord) {
        return res.status(404).json({ error: "Guidance record not found" });
      }
      if (!(await checkEntityAccess(user, guidanceRecord.entityType as EntityType, guidanceRecord.entityId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      const decision = await storage.createGuidanceDecision({
        userId: user.id,
        assumptionGuidanceId,
        action,
        previousValue: previousValue ?? null,
        newValue: newValue ?? null,
      });

      logActivity(req, "guidance-decision", "guidance", assumptionGuidanceId, action);
      res.status(201).json(decision);
    } catch (error) {
      logAndSendError(res, "Failed to record guidance decision", error);
    }
  });

  app.get("/api/research/runs", requireAuth, async (req, res) => {
    try {
      const query = researchRunsQuerySchema.safeParse(req.query);
      if (!query.success) return res.status(400).json({ error: fromZodError(query.error).message });

      const { entityType, entityId } = query.data;
      if (!(await checkEntityAccess(getAuthUser(req), entityType, entityId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      const runs = await storage.getResearchRuns(entityType, entityId);
      res.json(runs);
    } catch (error) {
      logAndSendError(res, "Failed to fetch research runs", error);
    }
  });

  app.get("/api/guidance/coverage/:entityType/:entityId", requireAuth, async (req, res) => {
    try {
      const params = entityParamsSchema.safeParse(req.params);
      if (!params.success) return res.status(400).json({ error: fromZodError(params.error).message });

      const { entityType, entityId } = params.data;
      if (!(await checkEntityAccess(getAuthUser(req), entityType, entityId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      const query = guidanceQuerySchema.safeParse(req.query);
      if (!query.success) return res.status(400).json({ error: fromZodError(query.error).message });

      const scenarioId = query.data.scenarioId ?? null;
      const guidance = await storage.getAssumptionGuidance(scenarioId, entityType, entityId);

      const now = Date.now();
      let freshCount = 0;
      let staleCount = 0;

      for (const g of guidance) {
        const age = now - new Date(g.updatedAt).getTime();
        const staleThresholdMs = 7 * 24 * 60 * 60 * 1000;
        if (age < staleThresholdMs) freshCount++;
        else staleCount++;
      }

      res.json({
        totalFields: guidance.length,
        freshCount,
        staleCount,
        coveragePct: guidance.length > 0 ? Math.round((freshCount / guidance.length) * 100) : 0,
      });
    } catch (error) {
      logAndSendError(res, "Failed to fetch coverage", error);
    }
  });

  const tier2Schema = z.object({
    entityType: z.enum(VALID_ENTITY_TYPES),
    entityId: z.coerce.number().int().positive(),
    assumptionKeys: z.array(z.string().min(1)).min(1).max(5),
    scenarioId: z.number().int().positive().optional(),
  });

  app.post("/api/guidance/deep-dive", requireAuth, async (req, res) => {
    try {
      const parsed = tier2Schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { entityType, entityId, assumptionKeys, scenarioId } = parsed.data;
      const user = getAuthUser(req);

      if (entityType === "property") {
        const props = await storage.getAllProperties(user.id);
        if (!props.some(p => p.id === entityId)) {
          return res.status(403).json({ error: "Property access denied" });
        }
      } else {
        const authCompanyId = (user as { companyId?: number | null }).companyId;
        if (!authCompanyId || authCompanyId !== entityId) {
          return res.status(403).json({ error: "Company access denied" });
        }
      }

      const ga = await storage.getGlobalAssumptions();
      let v2Prompt: string | undefined;

      let ambientDataStr: string | undefined;
      const benchmarks = await storage.getBenchmarkSnapshots();
      if (benchmarks.length > 0) {
        ambientDataStr = benchmarks.map(b =>
          `${b.snapshotKey} (${b.category}): ${b.value}${b.source ? ` [${b.source}]` : ""}${b.staleness === "stale" ? " [STALE]" : ""}`
        ).join("\n");
      }

      if (entityType === "property") {
        const property = await storage.getProperty(entityId);
        if (!property) return res.status(404).json({ error: "Property not found" });
        const icpConfig = (ga?.icpConfig as IcpConfig) ?? null;
        const contextPack = buildPropertyContextPack(property, ga ?? null, icpConfig);
        v2Prompt = assembleResearchPrompt(contextPack, {
          tier: 2,
          entityType: "property",
          assumptionKeys,
          ambientData: ambientDataStr,
        });
      } else if (ga) {
        const properties = await storage.getAllProperties(user.id);
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
          tier: 2,
          entityType: "company",
          assumptionKeys,
          ambientData: ambientDataStr,
        });
      }

      if (!v2Prompt) {
        return res.status(400).json({ error: "Could not build context for deep-dive" });
      }

      const modelId = DEFAULT_RESEARCH_MODEL;
      const vendorKey = resolveVendorFromModel(modelId) as "openai" | "anthropic" | "google";

      const researchClient = createResearchClient(vendorKey, {
        anthropic: vendorKey === "anthropic" ? getAnthropicClient() : undefined,
        openai: vendorKey === "openai" ? getOpenAIClient() : undefined,
        gemini: vendorKey === "google" ? getGeminiClient() : undefined,
      });

      const stream = generateResearchWithToolsStream(
        { type: entityType } as Parameters<typeof generateResearchWithToolsStream>[0],
        researchClient,
        modelId,
        undefined,
        v2Prompt,
      );

      let fullContent = "";
      for await (const chunk of stream) {
        if (chunk.type === "content") fullContent += chunk.data;
      }

      const researchResult = parseResearchJSON(fullContent);
      if (!researchResult || researchResult.rawResponse) {
        return res.status(502).json({ error: "AI research did not return valid JSON" });
      }

      const guidanceResult = extractGuidance(researchResult as Record<string, unknown>, 2, entityType);

      if (guidanceResult.records.length > 0) {
        const runRecord = await storage.createResearchRun({
          userId: user.id,
          entityType,
          entityId,
          tier: 2,
          modelPrimary: modelId,
        });

        for (const rec of guidanceResult.records) {
          await storage.upsertAssumptionGuidance({
            scenarioId: scenarioId ?? null,
            entityType,
            entityId,
            assumptionKey: rec.assumptionKey,
            valueLow: rec.valueLow,
            valueMid: rec.valueMid,
            valueHigh: rec.valueHigh,
            confidence: rec.confidence,
            sourceName: rec.sourceName ?? null,
            sourceDate: rec.sourceDate ?? null,
            reasoning: rec.reasoning ?? null,
            comparableSet: (rec.comparableSet as Record<string, unknown> | null) ?? null,
            relaxationLevel: null,
            researchRunId: runRecord.id,
          });
        }
      }

      logActivity(req, "guidance_deep_dive", entityType, entityId);

      res.json({
        records: guidanceResult.records,
        tier: 2,
        entityType,
        entityId,
        assumptionKeys,
        errors: guidanceResult.errors,
      });
    } catch (error) {
      logAndSendError(res, "Tier 2 deep-dive failed", error);
    }
  });
}
