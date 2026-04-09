import type { Express } from "express";
import { storage } from "../../storage";
import { requireAdmin, getAuthUser } from "../../auth";
import { logAndSendError } from "../helpers";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { registerSourceRoutes } from "./intelligence-sources";
import { registerScheduledResearchRoutes } from "./intelligence-scheduled";
import { registerPineconeRoutes } from "./intelligence-pinecone";
import { registerQaRoutes } from "./intelligence-qa";

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

      const allGuidance = await storage.getAllAssumptionGuidanceForScenario(scenarioId);
      const guidanceByEntity = new Map<string, typeof allGuidance>();
      for (const g of allGuidance) {
        const key = `${g.entityType}:${g.entityId}`;
        const arr = guidanceByEntity.get(key);
        if (arr) arr.push(g);
        else guidanceByEntity.set(key, [g]);
      }

      for (const prop of allProps) {
        const guidance = guidanceByEntity.get(`property:${prop.id}`) ?? [];
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

      const companyGuidance = guidanceByEntity.get("company:1") ?? [];
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

  registerSourceRoutes(app);
  registerScheduledResearchRoutes(app);
  registerPineconeRoutes(app);
  registerQaRoutes(app);
}
