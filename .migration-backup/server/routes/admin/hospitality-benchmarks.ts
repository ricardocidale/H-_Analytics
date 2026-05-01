import type { Express } from "express";
import { storage } from "../../storage";
import { requireAdmin, requireAuth } from "../../auth";
import { logAndSendError, logActivity, parseRouteId } from "../helpers";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { getAuthUser } from "../../auth";

const filterQuerySchema = z.object({
  category: z.string().max(100).optional(),
  segment: z.string().max(100).optional(),
  country: z.string().max(10).optional(),
});

const updateBenchmarkSchema = z.object({
  value: z.number().optional(),
  unit: z.string().max(50).optional(),
  sourceName: z.string().max(200).optional(),
  sourceUrl: z.string().url().nullable().optional(),
  sourceYear: z.number().int().min(1990).max(2100).optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  metricLabel: z.string().max(200).optional(),
  category: z.string().max(100).optional(),
  segment: z.string().max(100).optional(),
  country: z.string().max(10).optional(),
});

export function registerHospitalityBenchmarkRoutes(app: Express) {
  // ── Admin: list all benchmarks ──────────────────────────────────────
  app.get("/api/admin/hospitality-benchmarks", requireAdmin, async (req, res) => {
    try {
      const query = filterQuerySchema.safeParse(req.query);
      if (!query.success) return res.status(400).json({ error: fromZodError(query.error).message });

      const benchmarks = await storage.getHospitalityBenchmarks(query.data);
      res.json(benchmarks);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch hospitality benchmarks", error);
    }
  });

  // ── Admin: update a benchmark ───────────────────────────────────────
  app.put("/api/admin/hospitality-benchmarks/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid ID" });

      const parsed = updateBenchmarkSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });

      const existing = await storage.getHospitalityBenchmarkById(id);
      if (!existing) return res.status(404).json({ error: "Benchmark not found" });

      const user = getAuthUser(req);
      const updated = await storage.updateHospitalityBenchmark(id, {
        ...parsed.data,
        updatedBy: user?.id ?? undefined,
      });

      if (!updated) return res.status(404).json({ error: "Benchmark not found" });
      logActivity(req, "update-benchmark", "benchmark", id, existing.metricLabel ?? `Benchmark ${id}`, { fields: Object.keys(parsed.data) });
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update hospitality benchmark", error);
    }
  });

  // ── Public: read benchmarks (any authenticated user) ────────────────
  app.get("/api/hospitality-benchmarks", requireAuth, async (req, res) => {
    try {
      const query = filterQuerySchema.safeParse(req.query);
      if (!query.success) return res.status(400).json({ error: fromZodError(query.error).message });

      const benchmarks = await storage.getHospitalityBenchmarks({
        ...query.data,
        isActive: true,
      });
      res.json(benchmarks);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch hospitality benchmarks", error);
    }
  });
}
