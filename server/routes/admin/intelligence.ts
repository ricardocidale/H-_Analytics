import type { Express } from "express";
import { storage } from "../../storage";
import { requireAdmin, requireAuth, getAuthUser } from "../../auth";
import { logAndSendError } from "../helpers";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { buildPropertyContextPack } from "../../ai/context-pack/property-pack";
import { buildCompanyContextPack } from "../../ai/context-pack/company-pack";
import { assembleResearchPrompt } from "../../ai/prompt/assemble-research-prompt";
import type { IcpConfig } from "@shared/schema/types/jsonb-shapes";
import { resolveLlm, getVendorService, checkVendorAvailability, getRecommendedDefaults } from "../../ai/resolve-llm";
import { createResearchClient } from "../../ai/research-client";
import { getGeminiClient, getAnthropicClient, getOpenAIClient } from "../../ai/clients";
import { isPineconeAvailable, isEmbeddingAvailable, getNamespaceStats, deleteNamespace, getTotalVectorCount, ALL_NAMESPACES, type PineconeNamespace, indexScenarioSummary, indexPropertyProfile } from "../../ai/pinecone-service";
import { indexAllAssets } from "../../ai/asset-intelligence";
import { indexKnowledgeBase } from "../../ai/knowledge-base";
import type { ResearchConfig } from "@shared/schema";
import { insertScheduledResearchWorkflowSchema } from "@shared/schema";
import { executeScheduledWorkflow } from "../../ai/ambient/research-scheduler";
import { logger } from "../../logger";

const scenarioQuerySchema = z.object({
  scenarioId: z.coerce.number().int().positive().optional(),
});

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export function registerIntelligenceRoutes(app: Express) {
  app.get("/api/admin/coverage", requireAdmin, async (_req, res) => {
    try {
      const query = scenarioQuerySchema.safeParse(_req.query);
      if (!query.success) return res.status(400).json({ error: fromZodError(query.error).message });

      const scenarioId = query.data.scenarioId ?? null;
      const user = getAuthUser(_req);
      const allPropsRaw = await storage.getAllProperties();
      const allProps = allPropsRaw
        .map(p => ({ id: p.id, name: p.name, starRating: p.starRating }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const now = Date.now();
      const entities: Array<{
        entityType: string;
        entityId: number;
        name: string;
        totalFields: number;
        freshCount: number;
        staleCount: number;
        coveragePct: number;
        lastUpdated: string | null;
      }> = [];

      let totalMapped = 0;
      let totalFresh = 0;
      let totalStale = 0;
      let totalMissing = 0;

      for (const prop of allProps) {
        const guidance = await storage.getAssumptionGuidance(scenarioId, "property", prop.id);
        let fresh = 0;
        let stale = 0;
        let lastUpdated: string | null = null;

        for (const g of guidance) {
          const age = now - new Date(g.updatedAt).getTime();
          if (age < STALE_THRESHOLD_MS) fresh++;
          else stale++;
          const ts = new Date(g.updatedAt).toISOString();
          if (!lastUpdated || ts > lastUpdated) lastUpdated = ts;
        }

        const missing = Math.max(0, 53 - guidance.length);
        totalMapped += guidance.length;
        totalFresh += fresh;
        totalStale += stale;
        totalMissing += missing;

        entities.push({
          entityType: "property",
          entityId: prop.id,
          name: prop.name,
          totalFields: guidance.length,
          freshCount: fresh,
          staleCount: stale,
          coveragePct: guidance.length > 0 ? Math.round((fresh / guidance.length) * 100) : 0,
          lastUpdated,
        });
      }

      const companyGuidance = await storage.getAssumptionGuidance(scenarioId, "company", 1);
      let compFresh = 0, compStale = 0;
      let compLastUpdated: string | null = null;
      for (const g of companyGuidance) {
        const age = now - new Date(g.updatedAt).getTime();
        if (age < STALE_THRESHOLD_MS) compFresh++;
        else compStale++;
        const ts = new Date(g.updatedAt).toISOString();
        if (!compLastUpdated || ts > compLastUpdated) compLastUpdated = ts;
      }
      const compMissing = Math.max(0, 20 - companyGuidance.length);
      totalMapped += companyGuidance.length;
      totalFresh += compFresh;
      totalStale += compStale;
      totalMissing += compMissing;

      entities.unshift({
        entityType: "company",
        entityId: 1,
        name: "Management Company",
        totalFields: companyGuidance.length,
        freshCount: compFresh,
        staleCount: compStale,
        coveragePct: companyGuidance.length > 0 ? Math.round((compFresh / companyGuidance.length) * 100) : 0,
        lastUpdated: compLastUpdated,
      });

      res.json({
        summary: {
          totalMapped,
          freshCount: totalFresh,
          staleCount: totalStale,
          missingCount: totalMissing,
          freshPct: totalMapped > 0 ? Math.round((totalFresh / totalMapped) * 100) : 0,
        },
        entities,
      });
    } catch (error) {
      logAndSendError(res, "Failed to fetch coverage analytics", error);
    }
  });

  app.get("/api/admin/coverage/:entityType/:entityId", requireAdmin, async (req, res) => {
    try {
      const params = z.object({
        entityType: z.enum(["property", "company"]),
        entityId: z.coerce.number().int().positive(),
      }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ error: fromZodError(params.error).message });

      const query = scenarioQuerySchema.safeParse(req.query);
      if (!query.success) return res.status(400).json({ error: fromZodError(query.error).message });

      const { entityType, entityId } = params.data;
      const scenarioId = query.data.scenarioId ?? null;
      const guidance = await storage.getAssumptionGuidance(scenarioId, entityType, entityId);

      const now = Date.now();
      const fields = guidance.map(g => {
        const age = now - new Date(g.updatedAt).getTime();
        const isFresh = age < STALE_THRESHOLD_MS;
        return {
          id: g.id,
          assumptionKey: g.assumptionKey,
          status: isFresh ? "fresh" : "stale",
          confidence: g.confidence,
          valueLow: g.valueLow,
          valueMid: g.valueMid,
          valueHigh: g.valueHigh,
          sourceName: g.sourceName,
          updatedAt: g.updatedAt,
        };
      });

      const runs = await storage.getResearchRuns(entityType, entityId);
      const lastRun = runs[0] ?? null;

      res.json({
        entityType,
        entityId,
        totalFields: guidance.length,
        freshCount: fields.filter(f => f.status === "fresh").length,
        staleCount: fields.filter(f => f.status === "stale").length,
        fields,
        lastRun: lastRun ? {
          id: lastRun.id,
          tier: lastRun.tier,
          status: lastRun.status,
          startedAt: lastRun.startedAt,
          completedAt: lastRun.completedAt,
          tokensUsed: lastRun.tokensUsed,
        } : null,
      });
    } catch (error) {
      logAndSendError(res, "Failed to fetch entity coverage detail", error);
    }
  });

  app.get("/api/admin/pipeline-policies", requireAdmin, async (_req, res) => {
    try {
      const policies = await storage.getPipelinePolicies();
      res.json(policies);
    } catch (error) {
      logAndSendError(res, "Failed to fetch pipeline policies", error);
    }
  });

  app.patch("/api/admin/pipeline-policies/:policyKey", requireAdmin, async (req, res) => {
    try {
      const policyKeyParsed = z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/i).safeParse(req.params.policyKey);
      if (!policyKeyParsed.success) return res.status(400).json({ error: "Invalid policyKey" });
      const policyKey = policyKeyParsed.data;

      const updateSchema = z.object({
        tier: z.number().int().min(0).max(2).optional(),
        isEnabled: z.boolean().optional(),
        stalenessThresholdHours: z.number().int().min(0).max(8760).optional(),
        maxConcurrentRuns: z.number().int().min(1).max(20).optional(),
        dailyTokenBudget: z.number().int().min(0).max(10000000).optional(),
        monthlyTokenBudget: z.number().int().min(0).max(100000000).optional(),
        relaxationMaxLevel: z.number().int().min(0).max(10).optional(),
        minEvidenceScore: z.number().min(0).max(1).optional(),
        minCompCount: z.number().int().min(0).max(50).optional(),
        autoRefreshIntervalHours: z.number().int().min(1).max(8760).nullable().optional(),
      });

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });

      const updated = await storage.upsertPipelinePolicy({
        policyKey,
        ...parsed.data,
      });

      res.json(updated);
    } catch (error) {
      logAndSendError(res, "Failed to update pipeline policy", error);
    }
  });

  const qaEntitySchema = z.object({
    entityType: z.enum(["property", "company"]),
    entityId: z.coerce.number().int().positive().optional(),
    tier: z.number().int().min(1).max(2).optional().default(1),
    assumptionKeys: z.array(z.string()).optional(),
  });

  app.post("/api/admin/qa/preview-context-pack", requireAdmin, async (req, res) => {
    try {
      const parsed = qaEntitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });

      const { entityType, entityId } = parsed.data;
      const user = getAuthUser(req);
      const ga = await storage.getGlobalAssumptions(user.id);

      if (entityType === "property") {
        if (!entityId) return res.status(400).json({ error: "entityId is required for property" });
        const property = await storage.getProperty(entityId);
        if (!property) return res.status(404).json({ error: "Property not found" });
        const icpConfig = (ga?.icpConfig as IcpConfig) ?? null;
        const contextPack = buildPropertyContextPack(property, ga ?? null, icpConfig);
        res.json({ entityType, entityId, entityName: property.name, contextPack });
      } else {
        if (!ga) return res.status(404).json({ error: "Global assumptions not found" });
        const allProps = await storage.getAllProperties();
        const serviceTemplates = await storage.getAllServiceTemplates();
        const contextPack = buildCompanyContextPack(
          ga,
          allProps,
          serviceTemplates.map(st => ({
            name: st.name,
            defaultRate: st.defaultRate ?? 0,
            serviceModel: st.serviceModel ?? "percentage",
            serviceMarkup: st.serviceMarkup ?? 0,
            isActive: st.isActive !== false,
          })),
        );
        res.json({ entityType, entityName: ga.companyName ?? "Management Company", contextPack });
      }
    } catch (error) {
      logAndSendError(res, "Failed to preview context pack", error);
    }
  });

  app.post("/api/admin/qa/preview-prompt", requireAdmin, async (req, res) => {
    try {
      const parsed = qaEntitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });

      const { entityType, entityId, tier, assumptionKeys } = parsed.data;
      const user = getAuthUser(req);
      const ga = await storage.getGlobalAssumptions(user.id);

      const benchmarks = await storage.getBenchmarkSnapshots();
      let ambientDataStr: string | undefined;
      if (benchmarks.length > 0) {
        ambientDataStr = benchmarks.map(b =>
          `${b.snapshotKey} (${b.category}): ${b.value}${b.source ? ` [${b.source}]` : ""}${b.staleness === "stale" ? " [STALE]" : ""}`
        ).join("\n");
      }

      let prompt: string;
      let entityName: string;

      if (entityType === "property") {
        if (!entityId) return res.status(400).json({ error: "entityId is required for property" });
        const property = await storage.getProperty(entityId);
        if (!property) return res.status(404).json({ error: "Property not found" });
        entityName = property.name;
        const icpConfig = (ga?.icpConfig as IcpConfig) ?? null;
        const contextPack = buildPropertyContextPack(property, ga ?? null, icpConfig);
        prompt = assembleResearchPrompt(contextPack, {
          tier: tier as 1 | 2,
          entityType: "property",
          assumptionKeys,
          ambientData: ambientDataStr,
        });
      } else {
        if (!ga) return res.status(404).json({ error: "Global assumptions not found" });
        entityName = ga.companyName ?? "Management Company";
        const allProps = await storage.getAllProperties();
        const serviceTemplates = await storage.getAllServiceTemplates();
        const companyPack = buildCompanyContextPack(
          ga,
          allProps,
          serviceTemplates.map(st => ({
            name: st.name,
            defaultRate: st.defaultRate ?? 0,
            serviceModel: st.serviceModel ?? "percentage",
            serviceMarkup: st.serviceMarkup ?? 0,
            isActive: st.isActive !== false,
          })),
        );
        prompt = assembleResearchPrompt(companyPack, {
          tier: tier as 1 | 2,
          entityType: "company",
          assumptionKeys,
          ambientData: ambientDataStr,
        });
      }

      if (!prompt || prompt.length === 0) {
        return res.status(422).json({ error: "Prompt assembly returned empty — check entity data and tier configuration" });
      }
      const tokenEstimate = Math.ceil(prompt.length / 4);
      const costPerMillionTokens = 3.0;
      const estimatedCost = (tokenEstimate / 1_000_000) * costPerMillionTokens;

      res.json({
        entityType,
        entityId,
        entityName,
        tier,
        prompt,
        tokenEstimate,
        estimatedCostUsd: Math.round(estimatedCost * 10000) / 10000,
        promptLengthChars: prompt.length,
      });
    } catch (error) {
      logAndSendError(res, "Failed to preview prompt", error);
    }
  });

  const serviceKeySchema = z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/i);

  app.get("/api/admin/integrations/:serviceKey/rotations", requireAdmin, async (req, res) => {
    try {
      const parsed = serviceKeySchema.safeParse(req.params.serviceKey);
      if (!parsed.success) return res.status(400).json({ error: "Invalid serviceKey" });
      const rotations = await storage.getKeyRotationsByService(parsed.data);
      res.json(rotations);
    } catch (error) {
      logAndSendError(res, "Failed to fetch key rotations", error);
    }
  });

  app.post("/api/admin/integrations/:serviceKey/rotate-key", requireAdmin, async (req, res) => {
    try {
      const parsed = serviceKeySchema.safeParse(req.params.serviceKey);
      if (!parsed.success) return res.status(400).json({ error: "Invalid serviceKey" });
      const bodySchema = z.object({
        notes: z.string().max(500).optional(),
      });
      const body = bodySchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: fromZodError(body.error).message });

      const user = getAuthUser(req);
      const crypto = await import("crypto");
      const previousKeyHash = crypto.createHash("sha256").update(`${parsed.data}-${Date.now()}`).digest("hex").slice(0, 16);

      const rotation = await storage.createKeyRotation({
        serviceKey: parsed.data,
        rotatedBy: user?.id ?? null,
        previousKeyHash,
        notes: body.data.notes ?? null,
      });
      res.json({ success: true, rotatedAt: rotation.rotatedAt, id: rotation.id });
    } catch (error) {
      logAndSendError(res, "Failed to rotate key", error);
    }
  });

  app.post("/api/admin/qa/run-live-test", requireAdmin, async (req, res) => {
    try {
      const parsed = qaEntitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });

      const { entityType, entityId, tier } = parsed.data;
      const user = getAuthUser(req);
      const ga = await storage.getGlobalAssumptions(user.id);

      const benchmarks = await storage.getBenchmarkSnapshots();
      let ambientDataStr: string | undefined;
      if (benchmarks.length > 0) {
        ambientDataStr = benchmarks.map(b =>
          `${b.snapshotKey} (${b.category}): ${b.value}${b.source ? ` [${b.source}]` : ""}${b.staleness === "stale" ? " [STALE]" : ""}`
        ).join("\n");
      }

      let prompt: string;
      let entityName: string;
      const domain = entityType === "property" ? "propertyLlm" : "companyLlm";

      if (entityType === "property") {
        if (!entityId) return res.status(400).json({ error: "entityId is required for property" });
        const property = await storage.getProperty(entityId);
        if (!property) return res.status(404).json({ error: "Property not found" });
        entityName = property.name;
        const icpConfig = (ga?.icpConfig as IcpConfig) ?? null;
        const contextPack = buildPropertyContextPack(property, ga ?? null, icpConfig);
        prompt = assembleResearchPrompt(contextPack, {
          tier: tier as 1 | 2,
          entityType: "property",
          ambientData: ambientDataStr,
        });
      } else {
        if (!ga) return res.status(404).json({ error: "Global assumptions not found" });
        entityName = ga.companyName ?? "Management Company";
        const allProps = await storage.getAllProperties();
        const serviceTemplates = await storage.getAllServiceTemplates();
        const companyPack = buildCompanyContextPack(
          ga,
          allProps,
          serviceTemplates.map(st => ({
            name: st.name,
            defaultRate: st.defaultRate ?? 0,
            serviceModel: st.serviceModel ?? "percentage",
            serviceMarkup: st.serviceMarkup ?? 0,
            isActive: st.isActive !== false,
          })),
        );
        prompt = assembleResearchPrompt(companyPack, {
          tier: tier as 1 | 2,
          entityType: "company",
          ambientData: ambientDataStr,
        });
      }

      if (!prompt || prompt.length === 0) {
        return res.status(422).json({ error: "Prompt assembly returned empty" });
      }

      const researchConfig = ga?.researchConfig as ResearchConfig | undefined;
      const resolved = resolveLlm(researchConfig, domain as any);
      const vendorKey = getVendorService(resolved.vendor);

      const supportedVendor: "anthropic" | "openai" | "google" =
        vendorKey === "gemini" ? "google" : vendorKey === "anthropic" ? "anthropic" : "openai";

      const clients: Record<string, unknown> = {};
      try {
        if (supportedVendor === "google") clients.gemini = getGeminiClient();
        else if (supportedVendor === "anthropic") clients.anthropic = getAnthropicClient();
        else clients.openai = getOpenAIClient();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to initialize AI client";
        return res.status(503).json({ error: msg });
      }

      const researchClient = createResearchClient(supportedVendor, clients as any);
      const startTime = Date.now();

      const response = await researchClient.createMessage({
        model: resolved.model,
        maxTokens: 4096,
        system: "You are an expert hospitality financial analyst. Provide structured research analysis based on the provided context. Return your analysis as JSON when possible.",
        messages: [{ role: "user", content: prompt }],
      });

      const durationMs = Date.now() - startTime;
      const responseText = response.textBlocks.join("\n");
      const tokenEstimate = Math.ceil(prompt.length / 4) + Math.ceil(responseText.length / 4);
      const costPerMillionTokens = 3.0;
      const estimatedCost = (tokenEstimate / 1_000_000) * costPerMillionTokens;

      res.json({
        entityType,
        entityId,
        entityName,
        tier,
        vendor: resolved.vendor,
        model: resolved.model,
        response: responseText,
        promptLengthChars: prompt.length,
        responseLengthChars: responseText.length,
        tokenEstimate,
        estimatedCostUsd: Math.round(estimatedCost * 10000) / 10000,
        durationMs,
      });
    } catch (error) {
      logAndSendError(res, "Failed to run live test", error);
    }
  });

  app.get("/api/admin/source-registry", requireAdmin, async (_req, res) => {
    try {
      const sources = await storage.getSourceRegistry();
      res.json(sources);
    } catch (error) {
      logAndSendError(res, "Failed to fetch source registry", error);
    }
  });

  app.post("/api/admin/source-registry", requireAdmin, async (req, res) => {
    try {
      const bodySchema = z.object({
        serviceKey: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/i),
        name: z.string().min(1).max(200),
        sourceType: z.string().min(1).max(100),
        category: z.enum(["apis", "scrapers", "sources", "models"]),
        description: z.string().max(500).optional(),
        endpoint: z.string().url().optional().or(z.literal("")),
        apiKeyRef: z.string().max(200).optional(),
        rateLimitPerMin: z.number().int().min(0).max(10000).optional(),
        costPerCall: z.string().max(50).optional(),
        dataProvided: z.array(z.string().max(50)).max(20).optional(),
        cadence: z.string().max(50).optional(),
        trustScore: z.enum(["verified", "estimated", "unverified"]).optional(),
        isActive: z.boolean().optional(),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });
      const created = await storage.createSourceRegistryEntry(parsed.data);
      res.status(201).json(created);
    } catch (error) {
      logAndSendError(res, "Failed to create source registry entry", error);
    }
  });

  app.patch("/api/admin/source-registry/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

      const bodySchema = z.object({
        name: z.string().min(1).max(200).optional(),
        sourceType: z.string().min(1).max(100).optional(),
        category: z.enum(["apis", "scrapers", "sources", "models"]).optional(),
        description: z.string().max(500).optional(),
        endpoint: z.string().url().optional().or(z.literal("")),
        apiKeyRef: z.string().max(200).optional(),
        rateLimitPerMin: z.number().int().min(0).max(10000).optional(),
        costPerCall: z.string().max(50).optional(),
        dataProvided: z.array(z.string().max(50)).max(20).optional(),
        cadence: z.string().max(50).optional(),
        trustScore: z.enum(["verified", "estimated", "unverified"]).optional(),
        isActive: z.boolean().optional(),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });

      const updated = await storage.updateSourceRegistryEntry(id, parsed.data);
      if (!updated) return res.status(404).json({ error: "Source not found" });
      res.json(updated);
    } catch (error) {
      logAndSendError(res, "Failed to update source registry entry", error);
    }
  });

  app.patch("/api/admin/source-registry/:id/toggle", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const { isActive } = req.body;
      if (typeof isActive !== "boolean") return res.status(400).json({ error: "isActive must be a boolean" });
      const updated = await storage.updateSourceRegistryEntry(id, { isActive });
      if (!updated) return res.status(404).json({ error: "Source not found" });
      res.json(updated);
    } catch (error) {
      logAndSendError(res, "Failed to toggle source", error);
    }
  });

  app.delete("/api/admin/source-registry/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const existing = await storage.getSourceRegistryEntry(id);
      if (!existing) return res.status(404).json({ error: "Source not found" });
      await storage.deleteSourceRegistryEntry(id);
      res.json({ success: true });
    } catch (error) {
      logAndSendError(res, "Failed to delete source", error);
    }
  });

  app.get("/api/admin/source-registry/:id/logs", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const source = await storage.getSourceRegistryEntry(id);
      if (!source) return res.status(404).json({ error: "Source not found" });
      const logs = await storage.getSourceCallLogs(id, 50);
      res.json(logs);
    } catch (error) {
      logAndSendError(res, "Failed to fetch source call logs", error);
    }
  });

  app.post("/api/admin/source-registry/:id/test", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const source = await storage.getSourceRegistryEntry(id);
      if (!source) return res.status(404).json({ error: "Source not found" });

      const startTime = Date.now();
      let healthy = false;
      let errorMsg: string | undefined;
      let httpStatus: number | undefined;

      if (source.endpoint) {
        try {
          const url = new URL(source.endpoint);
          if (!["https:", "http:"].includes(url.protocol)) {
            return res.status(400).json({ error: "Only HTTP(S) endpoints are supported" });
          }
          const rawHostname = url.hostname.toLowerCase();
          const hostname = rawHostname.replace(/^\[|\]$/g, "");

          const isPrivateAddr = (addr: string): boolean => {
            const h = addr.replace(/^\[|\]$/g, "").toLowerCase();
            if (h === "localhost" || h === "::1" || h === "0.0.0.0") return true;
            if (h.endsWith(".local") || h.endsWith(".internal")) return true;
            if (h.includes("metadata.google") || h.includes("metadata.aws")) return true;
            if (/^(127\.|10\.|0\.|192\.168\.|169\.254\.)/.test(h)) return true;
            if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
            if (/^(fc|fd)[0-9a-f]{0,2}:/i.test(h) || /^fe80:/i.test(h)) return true;
            return false;
          };

          if (isPrivateAddr(hostname)) {
            return res.status(400).json({ error: "Internal/private endpoints are not allowed" });
          }

          const dns = await import("dns");
          const ipv4 = await dns.promises.resolve4(hostname).catch(() => [] as string[]);
          const ipv6 = await dns.promises.resolve6(hostname).catch(() => [] as string[]);
          const allResolved = [...ipv4, ...ipv6];
          if (allResolved.some(isPrivateAddr)) {
            return res.status(400).json({ error: "Endpoint resolves to a private IP address" });
          }

          if (allResolved.length === 0) {
            return res.status(400).json({ error: "Could not resolve endpoint hostname" });
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(source.endpoint, {
            method: "HEAD",
            signal: controller.signal,
            redirect: "manual",
          }).catch(() => fetch(source.endpoint!, { method: "GET", signal: controller.signal, redirect: "manual" }));
          clearTimeout(timeout);
          httpStatus = response.status;
          healthy = response.ok || response.status < 500;
        } catch (err: unknown) {
          errorMsg = err instanceof Error ? err.message : "Connection failed";
        }
      } else {
        healthy = source.isActive;
        if (!healthy) errorMsg = "No endpoint configured and source is inactive";
      }

      const latencyMs = Date.now() - startTime;

      const now = new Date();
      await storage.updateSourceRegistryEntry(id, { lastHealthCheck: now });

      await storage.createSourceCallLog({
        sourceId: id,
        serviceKey: source.serviceKey,
        httpStatus: httpStatus ?? null,
        latencyMs,
        success: healthy,
        errorMessage: errorMsg ?? null,
      });

      res.json({ healthy, latencyMs, error: errorMsg });
    } catch (error) {
      logAndSendError(res, "Failed to test source connectivity", error);
    }
  });

  app.get("/api/admin/intelligence/financial-lines", requireAdmin, async (req, res) => {
    try {
      const status = z.enum(["all", "pending", "approved", "rejected"]).optional().safeParse(req.query.status);
      const filter = status.success ? status.data : undefined;
      const [lines, counts] = await Promise.all([
        storage.getEngineSuggestedLines(filter),
        storage.getEngineSuggestedLineCounts(),
      ]);
      res.json({ lines, counts });
    } catch (error) {
      logAndSendError(res, "Failed to fetch financial line suggestions", error);
    }
  });

  app.patch("/api/admin/intelligence/financial-lines/:id/approve", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const user = getAuthUser(req);
      const existing = await storage.getEngineSuggestedLineById(id);
      if (!existing) return res.status(404).json({ error: "Suggestion not found" });
      const updated = await storage.approveEngineSuggestedLine(id, user.id);

      if (updated) {
        try {
          const { indexToKnowledgeBase } = await import("../../ai/pinecone-service");
          const text = `Approved financial line suggestion: ${updated.lineName} (${updated.statementType} / ${updated.category}). ${updated.description ?? ""} ${updated.justification ?? ""}`;
          await indexToKnowledgeBase(`financial-line-${updated.id}`, text, {
            type: "financial-line-suggestion",
            statementType: updated.statementType,
            category: updated.category,
            lineName: updated.lineName,
            status: "approved",
          });
        } catch {
          logger.warn("Failed to index approved financial line to Pinecone", "financial-lines");
        }
      }

      res.json(updated);
    } catch (error) {
      logAndSendError(res, "Failed to approve financial line suggestion", error);
    }
  });

  app.patch("/api/admin/intelligence/financial-lines/:id/reject", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const body = z.object({ reason: z.string().min(1).max(500) }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Rejection reason is required (1-500 chars)" });
      const user = getAuthUser(req);
      const existing = await storage.getEngineSuggestedLineById(id);
      if (!existing) return res.status(404).json({ error: "Suggestion not found" });
      const updated = await storage.rejectEngineSuggestedLine(id, user.id, body.data.reason);
      res.json(updated);
    } catch (error) {
      logAndSendError(res, "Failed to reject financial line suggestion", error);
    }
  });

  app.get("/api/admin/system-intelligence-status", requireAdmin, async (_req, res) => {
    try {
      const vendors = checkVendorAvailability();
      const recommended = getRecommendedDefaults();
      const pinecone = isPineconeAvailable();
      const embeddings = isEmbeddingAvailable();

      const knowledgeLearning = pinecone && embeddings;

      res.json({
        llmVendors: vendors,
        recommendedDefaults: recommended,
        knowledgeBase: {
          pinecone,
          embeddings,
          learningActive: knowledgeLearning,
          message: knowledgeLearning
            ? "Knowledge learning is active — research results are indexed for future retrieval"
            : !pinecone
              ? "Pinecone not configured (PINECONE_API_KEY) — knowledge learning disabled"
              : "Embedding API not available — set OPENAI_EMBEDDING_KEY for vector learning. Replit AI integration proxies do not support embedding endpoints.",
        },
        missingKeys: {
          fredApiKey: !process.env.FRED_API_KEY,
          pineconeApiKey: !pinecone,
          embeddingKey: !embeddings,
        },
      });
    } catch (error) {
      logAndSendError(res, "Failed to check system intelligence status", error);
    }
  });

  app.get("/api/admin/scheduled-research", requireAdmin, async (_req, res) => {
    try {
      const workflows = await storage.getScheduledResearchWorkflows();
      res.json(workflows);
    } catch (error) {
      logAndSendError(res, "Failed to fetch scheduled research workflows", error);
    }
  });

  app.post("/api/admin/scheduled-research", requireAdmin, async (req, res) => {
    try {
      const validation = insertScheduledResearchWorkflowSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const workflow = await storage.upsertScheduledResearchWorkflow(validation.data);
      res.json(workflow);
    } catch (error) {
      logAndSendError(res, "Failed to create scheduled research workflow", error);
    }
  });

  app.put("/api/admin/scheduled-research/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid workflow ID" });

      const existing = await storage.getScheduledResearchWorkflowById(id);
      if (!existing) return res.status(404).json({ error: "Workflow not found" });

      const validation = insertScheduledResearchWorkflowSchema.partial().safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const data = { ...validation.data, workflowKey: existing.workflowKey };
      if (validation.data.frequencyHours && validation.data.frequencyHours !== existing.frequencyHours) {
        (data as any).nextRunAt = new Date(
          Date.now() + (validation.data.frequencyHours * 60 * 60 * 1000),
        );
      }
      const workflow = await storage.upsertScheduledResearchWorkflow(data as any);
      res.json(workflow);
    } catch (error) {
      logAndSendError(res, "Failed to update scheduled research workflow", error);
    }
  });

  app.delete("/api/admin/scheduled-research/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid workflow ID" });
      await storage.deleteScheduledResearchWorkflow(id);
      res.json({ success: true });
    } catch (error) {
      logAndSendError(res, "Failed to delete scheduled research workflow", error);
    }
  });

  app.post("/api/admin/scheduled-research/:id/execute", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid workflow ID" });

      const workflow = await storage.getScheduledResearchWorkflowById(id);
      if (!workflow) return res.status(404).json({ error: "Workflow not found" });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const sendSSE = (type: string, data: any) => {
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      };

      sendSSE("phase", { phase: "starting", message: `Starting: ${workflow.name}` });

      await storage.updateScheduledWorkflowRun(workflow.id, {
        lastRunAt: new Date(),
        nextRunAt: new Date(Date.now() + workflow.frequencyHours * 60 * 60 * 1000),
        lastRunStatus: "running",
      });

      const result = await executeScheduledWorkflow(workflow);

      await storage.updateScheduledWorkflowRun(workflow.id, {
        lastRunAt: new Date(),
        nextRunAt: new Date(Date.now() + workflow.frequencyHours * 60 * 60 * 1000),
        lastRunStatus: result.success ? "completed" : "failed",
        lastRunDurationMs: result.durationMs,
        lastRunError: result.error ?? null,
      });

      if (result.success) {
        sendSSE("content", result.content.slice(0, 500));
        sendSSE("done", {
          success: true,
          durationMs: result.durationMs,
          workflowKey: workflow.workflowKey,
        });
      } else {
        sendSSE("error", { message: result.error, durationMs: result.durationMs });
      }

      res.end();
    } catch (error) {
      logAndSendError(res, "Failed to execute scheduled research workflow", error);
    }
  });

  app.get("/api/research/scheduled/check-stale", requireAdmin, async (req, res) => {
    try {
      const staleWorkflows = await storage.getDueScheduledWorkflows();
      res.json({
        hasStale: staleWorkflows.length > 0,
        workflows: staleWorkflows.map(w => ({
          id: w.id,
          workflowKey: w.workflowKey,
          name: w.name,
          description: w.description,
          lastRunAt: w.lastRunAt?.toISOString() ?? null,
          frequencyHours: w.frequencyHours,
        })),
      });
    } catch (error) {
      logAndSendError(res, "Failed to check stale scheduled workflows", error);
    }
  });

  app.post("/api/research/scheduled/:id/execute", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid workflow ID" });

      const workflow = await storage.getScheduledResearchWorkflowById(id);
      if (!workflow) return res.status(404).json({ error: "Workflow not found" });
      if (!workflow.isEnabled) return res.status(400).json({ error: "Workflow is disabled" });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const sendSSE = (type: string, data: any) => {
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      };

      sendSSE("phase", { phase: "starting", message: `Starting: ${workflow.name}` });

      await storage.updateScheduledWorkflowRun(workflow.id, {
        lastRunAt: new Date(),
        nextRunAt: new Date(Date.now() + workflow.frequencyHours * 60 * 60 * 1000),
        lastRunStatus: "running",
      });

      const result = await executeScheduledWorkflow(workflow);

      await storage.updateScheduledWorkflowRun(workflow.id, {
        lastRunAt: new Date(),
        nextRunAt: new Date(Date.now() + workflow.frequencyHours * 60 * 60 * 1000),
        lastRunStatus: result.success ? "completed" : "failed",
        lastRunDurationMs: result.durationMs,
        lastRunError: result.error ?? null,
      });

      if (result.success) {
        sendSSE("content", result.content.slice(0, 500));
        sendSSE("done", { success: true, durationMs: result.durationMs, workflowKey: workflow.workflowKey });
      } else {
        sendSSE("error", { message: result.error, durationMs: result.durationMs });
      }

      res.end();
    } catch (error) {
      logAndSendError(res, "Failed to execute scheduled research workflow", error);
    }
  });

  app.post("/api/admin/intelligence/index-assets", requireAdmin, async (_req, res) => {
    try {
      if (!isPineconeAvailable()) {
        return res.status(400).json({ error: "Pinecone not configured" });
      }
      if (!isEmbeddingAvailable()) {
        return res.status(400).json({ error: "Embedding service not available" });
      }
      const result = await indexAllAssets();
      res.json({ success: true, indexed: result });
    } catch (error) {
      logAndSendError(res, "Failed to index assets", error);
    }
  });

  app.get("/api/admin/pinecone/stats", requireAdmin, async (_req, res) => {
    try {
      if (!isPineconeAvailable()) {
        return res.json({ available: false, namespaces: {}, totalVectors: 0 });
      }
      const [namespaces, totalVectors] = await Promise.all([
        getNamespaceStats(),
        getTotalVectorCount(),
      ]);
      res.json({
        available: true,
        embeddingsAvailable: isEmbeddingAvailable(),
        totalVectors,
        namespaces,
        allNamespaces: ALL_NAMESPACES,
      });
    } catch (error) {
      logAndSendError(res, "Failed to get Pinecone stats", error);
    }
  });

  app.post("/api/admin/pinecone/reindex/:namespace", requireAdmin, async (req, res) => {
    try {
      const ns = req.params.namespace as PineconeNamespace;
      if (!ALL_NAMESPACES.includes(ns)) {
        return res.status(400).json({ error: `Invalid namespace: ${ns}` });
      }
      if (!isPineconeAvailable()) {
        return res.status(400).json({ error: "Pinecone not configured" });
      }
      if (!isEmbeddingAvailable()) {
        return res.status(400).json({ error: "Embedding service not available" });
      }

      let result: Record<string, any> = { namespace: ns };

      if (ns === "knowledge-base") {
        await deleteNamespace(ns);
        const kbResult = await indexKnowledgeBase();
        const assetResult = await indexAllAssets();
        result.chunksIndexed = kbResult.chunksIndexed;
        result.photosIndexed = assetResult.photos;
        result.logosIndexed = assetResult.logos;
        result.timeMs = kbResult.timeMs;
      } else if (ns === "scenarios") {
        await deleteNamespace(ns);
        const allScenariosRaw = await storage.getAllScenarios();
        const allScenarios = allScenariosRaw.filter(s => !s.deletedAt);
        let indexed = 0;
        for (const scenario of allScenarios) {
          try {
            const propArr = Array.isArray(scenario.properties) ? scenario.properties : [];
            const firstProp = propArr[0] as Record<string, any> | undefined;
            const ga = scenario.globalAssumptions as Record<string, any> | null;
            const cr = scenario.computedResults as Record<string, any> | null;
            await indexScenarioSummary({
              scenarioId: scenario.id,
              scenarioName: scenario.name,
              propertyId: firstProp?.id ?? 0,
              propertyName: firstProp?.name ?? "Portfolio",
              location: firstProp?.location ?? firstProp?.city ?? "",
              propertyType: firstProp?.propertyType ?? firstProp?.property_type ?? "hotel",
              totalRevenue: cr?.totalRevenue ?? null,
              totalExpenses: cr?.totalExpenses ?? null,
              noi: cr?.noi ?? null,
              adr: ga?.adr ?? firstProp?.adr ?? null,
              occupancy: ga?.occupancy ?? firstProp?.occupancy ?? null,
              revpar: cr?.revpar ?? null,
              years: ga?.holdPeriod ?? ga?.projectionYears ?? null,
              createdBy: scenario.userId ? String(scenario.userId) : undefined,
            });
            indexed++;
          } catch { /* skip failed */ }
        }
        result.indexed = indexed;
        result.total = allScenarios.length;
      } else if (ns === "properties") {
        await deleteNamespace(ns);
        const allProperties = await storage.getAllProperties();
        let indexed = 0;
        for (const property of allProperties) {
          try {
            await indexPropertyProfile({
              propertyId: property.id,
              name: property.name ?? "Unnamed Property",
              location: [property.city, property.stateProvince, property.country].filter(Boolean).join(", "),
              propertyType: (property as any).propertyType ?? (property as any).property_type ?? "hotel",
              roomCount: (property as any).roomCount ?? (property as any).room_count ?? null,
              starRating: (property as any).starRating ?? (property as any).star_rating ?? null,
              status: (property as any).status ?? "active",
              purchasePrice: (property as any).purchasePrice ?? (property as any).purchase_price ?? null,
              market: (property as any).market ?? null,
            });
            indexed++;
          } catch { /* skip failed */ }
        }
        result.indexed = indexed;
        result.total = allProperties.length;
      } else if (ns === "comparables") {
        await deleteNamespace(ns);
        const snapshots = await storage.getBenchmarkSnapshots();
        const { indexBenchmarkSnapshot } = await import("../../ai/pinecone-service");
        let indexed = 0;
        for (const snap of snapshots) {
          try {
            await indexBenchmarkSnapshot({
              market: snap.snapshotKey,
              propertyType: snap.category,
              adr: snap.category === "adr" ? snap.value : null,
              occupancy: snap.category === "occupancy" ? snap.value : null,
              capRate: snap.category === "capRate" ? snap.value : null,
              revpar: snap.category === "revpar" ? snap.value : null,
              source: snap.source ?? "unknown",
              snapshotDate: snap.fetchedAt.toISOString(),
            });
            indexed++;
          } catch { /* skip failed */ }
        }
        result.indexed = indexed;
        result.total = snapshots.length;
      } else {
        await deleteNamespace(ns);
        result.cleared = true;
        result.message = `Namespace "${ns}" cleared. Data will be re-indexed as new items are created.`;
      }

      logger.info(`Admin re-indexed Pinecone namespace "${ns}": ${JSON.stringify(result)}`, "pinecone");
      res.json({ success: true, ...result });
    } catch (error) {
      logAndSendError(res, `Failed to reindex namespace ${req.params.namespace}`, error);
    }
  });

  app.delete("/api/admin/pinecone/clear/:namespace", requireAdmin, async (req, res) => {
    try {
      const ns = req.params.namespace as PineconeNamespace;
      if (!ALL_NAMESPACES.includes(ns)) {
        return res.status(400).json({ error: `Invalid namespace: ${ns}` });
      }
      if (!isPineconeAvailable()) {
        return res.status(400).json({ error: "Pinecone not configured" });
      }
      await deleteNamespace(ns);
      logger.info(`Admin cleared Pinecone namespace "${ns}"`, "pinecone");
      res.json({ success: true, namespace: ns, cleared: true });
    } catch (error) {
      logAndSendError(res, `Failed to clear namespace ${req.params.namespace}`, error);
    }
  });
}
