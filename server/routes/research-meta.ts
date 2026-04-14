import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin, getAuthUser } from "../auth";
import { researchQuestionCreateSchema, researchQuestionPatchSchema, logAndSendError, parseRouteId } from "./helpers";
import { fromZodError } from "zod-validation-error";
import type { ResearchConfig } from "@shared/schema";

export function registerResearchMetaRoutes(app: Express) {
  app.get("/api/admin/intelligence/freshness-counts", requireAdmin, async (_req, res) => {
    try {
      const STALE_THRESHOLD_DAYS = 7;
      const allProperties = await storage.getAllProperties();
      const latestRuns = await storage.getLatestCompletedRunsPerEntity("property");

      const runMap = new Map<number, { completedAt: Date; durationMs: number | null }>();
      for (const r of latestRuns) {
        runMap.set(Number(r.entityId), { completedAt: new Date(r.completedAt), durationMs: r.durationMs ? Number(r.durationMs) : null });
      }

      const runningEntityIds = await storage.getRunningResearchEntityIds("property");
      const runningEntities = new Set(runningEntityIds);

      let current = 0;
      let stale = 0;
      let missing = 0;
      let running = 0;
      let totalDurationMs = 0;
      let durationCount = 0;

      for (const p of allProperties) {
        if (runningEntities.has(p.id)) {
          running++;
          continue;
        }

        const run = runMap.get(p.id);
        if (!run) {
          missing++;
          continue;
        }

        const completedTs = run.completedAt.getTime();
        const daysAgo = Math.floor((Date.now() - completedTs) / (1000 * 60 * 60 * 24));
        const assumptionTs = p.lastAssumptionChangeAt ? new Date(p.lastAssumptionChangeAt).getTime() : 0;

        if (assumptionTs > completedTs || daysAgo > STALE_THRESHOLD_DAYS) {
          stale++;
        } else {
          current++;
        }

        if (run.durationMs) {
          totalDurationMs += run.durationMs;
          durationCount++;
        }
      }

      const avgDurationMs = durationCount > 0 ? Math.round(totalDurationMs / durationCount) : null;

      res.json({
        total: allProperties.length,
        current,
        stale,
        missing,
        running,
        avgDurationMs,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch freshness counts", error);
    }
  });

  app.get("/api/research/avg-duration", requireAuth, async (req, res) => {
    try {
      const entityType = (req.query.entityType as string) || "property";
      const latestRuns = await storage.getLatestCompletedRunsPerEntity(entityType);
      let totalDurationMs = 0;
      let durationCount = 0;
      for (const r of latestRuns) {
        if (r.durationMs) {
          totalDurationMs += Number(r.durationMs);
          durationCount++;
        }
      }
      const avgDurationMs = durationCount > 0 ? Math.round(totalDurationMs / durationCount) : null;
      res.json({ avgDurationMs });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch avg duration", error);
    }
  });

  app.get("/api/research/last-full-refresh", requireAuth, async (req, res) => {
    try {
      const lastRefresh = await storage.getLastFullResearchRefresh(getAuthUser(req).id);
      res.json({ lastRefresh: lastRefresh?.toISOString() ?? null });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch last full research refresh", error);
    }
  });

  app.post("/api/research/mark-full-refresh", requireAuth, async (req, res) => {
    try {
      await storage.markFullResearchRefresh(getAuthUser(req).id);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to mark full research refresh", error);
    }
  });

  app.get("/api/research/refresh-config", requireAuth, async (req, res) => {
    try {
      const ga = await storage.getGlobalAssumptions(getAuthUser(req).id);
      if (!ga) return res.status(404).json({ error: "No global assumptions found" });
      res.json((ga.researchConfig as ResearchConfig) ?? {});
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch research refresh config", error);
    }
  });

  app.get("/api/research-questions", requireAuth, async (req, res) => {
    try {
      const questions = await storage.getAllResearchQuestions();
      res.json(questions);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch research questions", error);
    }
  });

  app.post("/api/research-questions", requireAdmin, async (req, res) => {
    try {
      const validation = researchQuestionCreateSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      const q = await storage.createResearchQuestion({ question: validation.data.question });
      res.status(201).json(q);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create research question", error);
    }
  });

  app.patch("/api/research-questions/:id", requireAdmin, async (req, res) => {
    try {
      const validation = researchQuestionPatchSchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: fromZodError(validation.error).message });
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid ID" });
      const q = await storage.updateResearchQuestion(id, validation.data.question);
      res.json(q);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update research question", error);
    }
  });

  app.delete("/api/research-questions/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid ID" });
      await storage.deleteResearchQuestion(id);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete research question", error);
    }
  });
}
