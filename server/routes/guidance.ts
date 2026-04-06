import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, getAuthUser, checkPropertyAccess } from "../auth";
import { logAndSendError, logActivity } from "./helpers";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

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
  return true;
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
}
