import type { Express } from "express";
import { requireAuth, getAuthUser } from "../auth";
import { storage } from "../storage";
import { z } from "zod";
import { parseRouteId } from "./helpers";

export function register(app: Express): void {
  app.get("/api/calc-audit/:scenarioId", requireAuth, async (req, res) => {
    try {
      const scenarioId = parseRouteId(req.params.scenarioId);
      if (!scenarioId) {
        return res.status(400).json({ error: "Invalid scenario ID" });
      }

      const userId = getAuthUser(req).id;
      const propertyId = req.query.propertyId
        ? parseInt(String(req.query.propertyId), 10)
        : undefined;
      const limit = req.query.limit
        ? Math.min(parseInt(String(req.query.limit), 10), 100)
        : 20;

      const logs = await storage.getCalcAuditLogs(scenarioId, userId, propertyId, limit);
      res.json(logs);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/calc-audit/detail/:id", requireAuth, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) {
        return res.status(400).json({ error: "Invalid audit log ID" });
      }

      const userId = getAuthUser(req).id;
      const log = await storage.getCalcAuditLog(id, userId);
      if (!log) {
        return res.status(404).json({ error: "Audit log not found" });
      }

      res.json(log);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/api/calc-audit/:id/note", requireAuth, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) {
        return res.status(400).json({ error: "Invalid audit log ID" });
      }

      const userId = getAuthUser(req).id;
      const schema = z.object({
        stepIndex: z.number().int().min(0),
        note: z.string().max(500),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }

      const updated = await storage.updateCalcAuditLogNote(id, userId, parsed.data.stepIndex, parsed.data.note);
      if (!updated) {
        return res.status(404).json({ error: "Audit log or step not found" });
      }

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
