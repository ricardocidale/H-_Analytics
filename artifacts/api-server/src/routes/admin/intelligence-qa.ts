import type { Express } from "express";
import { storage } from "../../storage";
import { requireAdmin, getAuthUser } from "../../auth";
import { logAndSendError, logActivity, zodErrorMessage } from "../helpers";
import { z } from "zod";
import { buildPropertyContextPack } from "../../ai/context-pack/property-pack";
import { buildCompanyContextPack } from "../../ai/context-pack/company-pack";
import { assembleResearchPrompt } from "../../ai/prompt/assemble-research-prompt";
import type { IcpConfig } from "@workspace/db";
import {
  HTTP_400_BAD_REQUEST,
  HTTP_404_NOT_FOUND,
  HTTP_422_UNPROCESSABLE_ENTITY,
  HTTP_503_SERVICE_UNAVAILABLE,
} from "../../constants";
import { resolveLlm } from "../../ai/resolve-llm";
import { createResearchClient } from "../../ai/research-client";
import { getGeminiClient, getAnthropicClient, getOpenAIClient } from "../../ai/clients";
import type { ResearchConfig } from "@workspace/db";

const qaEntitySchema = z.object({
  entityType: z.enum(["property", "company"]),
  entityId: z.coerce.number().int().positive().optional(),
  tier: z.number().int().min(1).max(2).optional().default(1),
  assumptionKeys: z.array(z.string()).optional(),
});

const serviceKeySchema = z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/i);

async function buildBenchmarkString(): Promise<string | undefined> {
  const benchmarks = await storage.getBenchmarkSnapshots();
  if (benchmarks.length === 0) return undefined;
  return benchmarks.map(b =>
    `${b.snapshotKey} (${b.category}): ${b.value}${b.source ? ` [${b.source}]` : ""}${b.staleness === "stale" ? " [STALE]" : ""}`
  ).join("\n");
}

async function buildServiceTemplateSummary() {
  const serviceTemplates = await storage.getAllServiceTemplates();
  return serviceTemplates.map(st => ({
    name: st.name,
    defaultRate: st.defaultRate ?? 0,
    serviceModel: st.serviceModel ?? "percentage",
    serviceMarkup: st.serviceMarkup ?? 0,
    isActive: st.isActive !== false,
  }));
}

export function registerQaRoutes(app: Express) {
  app.post("/api/admin/qa/preview-context-pack", requireAdmin, async (req, res) => {
    try {
      const parsed = qaEntitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });

      const { entityType, entityId } = parsed.data;
      const user = getAuthUser(req);
      const ga = await storage.getGlobalAssumptions(user.id);

      if (entityType === "property") {
        if (!entityId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "entityId is required for property", code: "AIQA-006" });
        const property = await storage.getProperty(entityId);
        if (!property) return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found", code: "AIQA-007" });
        const icpConfig = (ga?.icpConfig as IcpConfig) ?? null;
        const contextPack = buildPropertyContextPack(property, ga ?? null, icpConfig);
        res.json({ entityType, entityId, entityName: property.name, contextPack });
      } else {
        if (!ga) return res.status(HTTP_404_NOT_FOUND).json({ error: "Global assumptions not found", code: "AIQA-008" });
        const allProps = await storage.getAllProperties();
        const contextPack = buildCompanyContextPack(ga, allProps, await buildServiceTemplateSummary());
        res.json({ entityType, entityName: ga.companyName ?? "Management Company", contextPack });
      }
    } catch (error: unknown) {
      logAndSendError(res, "Failed to preview context pack", error, "AIQA-001");
    }
  });

  app.post("/api/admin/qa/preview-prompt", requireAdmin, async (req, res) => {
    try {
      const parsed = qaEntitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });

      const { entityType, entityId, tier, assumptionKeys } = parsed.data;
      const user = getAuthUser(req);
      const ga = await storage.getGlobalAssumptions(user.id);
      const ambientDataStr = await buildBenchmarkString();

      let prompt: string;
      let entityName: string;

      if (entityType === "property") {
        if (!entityId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "entityId is required for property", code: "AIQA-009" });
        const property = await storage.getProperty(entityId);
        if (!property) return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found", code: "AIQA-010" });
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
        if (!ga) return res.status(HTTP_404_NOT_FOUND).json({ error: "Global assumptions not found", code: "AIQA-011" });
        entityName = ga.companyName ?? "Management Company";
        const allProps = await storage.getAllProperties();
        const companyPack = buildCompanyContextPack(ga, allProps, await buildServiceTemplateSummary());
        prompt = assembleResearchPrompt(companyPack, {
          tier: tier as 1 | 2,
          entityType: "company",
          assumptionKeys,
          ambientData: ambientDataStr,
        });
      }

      if (!prompt || prompt.length === 0) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({ error: "Prompt assembly returned empty — check entity data and tier configuration", code: "AIQA-012" });
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
    } catch (error: unknown) {
      logAndSendError(res, "Failed to preview prompt", error, "AIQA-002");
    }
  });

  app.get("/api/admin/integrations/:serviceKey/rotations", requireAdmin, async (req, res) => {
    try {
      const parsed = serviceKeySchema.safeParse(req.params.serviceKey);
      if (!parsed.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid serviceKey", code: "AIQA-013" });
      const rotations = await storage.getKeyRotationsByService(parsed.data);
      res.json(rotations);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch key rotations", error, "AIQA-003");
    }
  });

  app.post("/api/admin/integrations/:serviceKey/rotate-key", requireAdmin, async (req, res) => {
    try {
      const parsed = serviceKeySchema.safeParse(req.params.serviceKey);
      if (!parsed.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid serviceKey", code: "AIQA-014" });
      const bodySchema = z.object({
        notes: z.string().max(500).optional(),
      });
      const body = bodySchema.safeParse(req.body);
      if (!body.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(body.error) });

      const user = getAuthUser(req);
      const crypto = await import("crypto");
      const previousKeyHash = crypto.createHash("sha256").update(`${parsed.data}-${Date.now()}`).digest("hex").slice(0, 16);

      const rotation = await storage.createKeyRotation({
        serviceKey: parsed.data,
        rotatedBy: user?.id ?? null,
        previousKeyHash,
        notes: body.data.notes ?? null,
      });
      logActivity(req, "rotate-api-key", "integration", null, parsed.data, { notes: body.data.notes });
      res.json({ success: true, rotatedAt: rotation.rotatedAt, id: rotation.id });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to rotate key", error, "AIQA-004");
    }
  });

  app.post("/api/admin/qa/run-live-test", requireAdmin, async (req, res) => {
    try {
      const parsed = qaEntitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });

      const { entityType, entityId, tier } = parsed.data;
      const user = getAuthUser(req);
      const ga = await storage.getGlobalAssumptions(user.id);
      const ambientDataStr = await buildBenchmarkString();

      let prompt: string;
      let entityName: string;
      const domain = entityType === "property" ? "propertyLlm" : "companyLlm";

      if (entityType === "property") {
        if (!entityId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "entityId is required for property", code: "AIQA-015" });
        const property = await storage.getProperty(entityId);
        if (!property) return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found", code: "AIQA-016" });
        entityName = property.name;
        const icpConfig = (ga?.icpConfig as IcpConfig) ?? null;
        const contextPack = buildPropertyContextPack(property, ga ?? null, icpConfig);
        prompt = assembleResearchPrompt(contextPack, {
          tier: tier as 1 | 2,
          entityType: "property",
          ambientData: ambientDataStr,
        });
      } else {
        if (!ga) return res.status(HTTP_404_NOT_FOUND).json({ error: "Global assumptions not found", code: "AIQA-017" });
        entityName = ga.companyName ?? "Management Company";
        const allProps = await storage.getAllProperties();
        const companyPack = buildCompanyContextPack(ga, allProps, await buildServiceTemplateSummary());
        prompt = assembleResearchPrompt(companyPack, {
          tier: tier as 1 | 2,
          entityType: "company",
          ambientData: ambientDataStr,
        });
      }

      if (!prompt || prompt.length === 0) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({ error: "Prompt assembly returned empty", code: "AIQA-018" });
      }

      const researchConfig = ga?.researchConfig as ResearchConfig | undefined;
      const resolved = resolveLlm(researchConfig, domain);
      const supportedVendor: "anthropic" | "openai" | "google" =
        resolved.vendor === "anthropic" ? "anthropic" : resolved.vendor === "google" ? "google" : "openai";

      const clients: Parameters<typeof createResearchClient>[1] = {};
      try {
        if (supportedVendor === "google") clients.gemini = getGeminiClient();
        else if (supportedVendor === "anthropic") clients.anthropic = getAnthropicClient();
        else clients.openai = getOpenAIClient();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to initialize AI client";
        return res.status(HTTP_503_SERVICE_UNAVAILABLE).json({ error: msg });
      }

      const researchClient = createResearchClient(supportedVendor, clients);
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

      logActivity(req, "run-live-qa-test", "qa_test", entityId ?? null, entityName, { entityType, tier, vendor: resolved.vendor, model: resolved.model, durationMs });
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
    } catch (error: unknown) {
      logAndSendError(res, "Failed to run live test", error, "AIQA-005");
    }
  });
}
