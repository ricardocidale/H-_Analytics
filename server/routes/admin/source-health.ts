import type { Express } from "express";
import { requireAdmin } from "../../auth";
import { logAndSendError } from "../helpers";
import { storage } from "../../storage";
import { checkAllSources, checkSourceHealth } from "../../ai/source-health-checker";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

const patchSourceSchema = z.object({
  isActive: z.boolean().optional(),
  description: z.string().max(500).optional(),
});

export function registerSourceHealthRoutes(app: Express) {
  // ── Run health check on all sources ────────────────────────────────
  app.post("/api/admin/sources/health-check", requireAdmin, async (_req, res) => {
    try {
      const results = await checkAllSources();
      res.json({
        total: results.length,
        healthy: results.filter(r => r.healthy).length,
        unhealthy: results.filter(r => !r.healthy).length,
        results,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to run health check", error);
    }
  });

  // ── Run health check on a single source ────────────────────────────
  app.post("/api/admin/sources/:serviceKey/health-check", requireAdmin, async (req, res) => {
    try {
      const serviceKey = String(req.params.serviceKey);
      const result = await checkSourceHealth(serviceKey);
      res.json(result);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to run health check", error);
    }
  });

  // ── List all source registry entries ───────────────────────────────
  app.get("/api/admin/sources", requireAdmin, async (_req, res) => {
    try {
      const sources = await storage.getSourceRegistry();
      res.json(sources);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch source registry", error);
    }
  });

  // ── Update a source by serviceKey ──────────────────────────────────
  app.patch("/api/admin/sources/:serviceKey", requireAdmin, async (req, res) => {
    try {
      const serviceKey = String(req.params.serviceKey);
      const parsed = patchSourceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      // Find the source by serviceKey
      const allSources = await storage.getSourceRegistry();
      const source = allSources.find(s => s.serviceKey === serviceKey);
      if (!source) {
        return res.status(404).json({ error: `Source not found: ${serviceKey}` });
      }

      const updated = await storage.updateSourceRegistryEntry(source.id, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "Source not found" });
      }

      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update source", error);
    }
  });
}
