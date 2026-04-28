/**
 * admin/reference-ranges.ts — Phase 1 read-only admin endpoints for the
 * `reference_range` table (deterministic ranges + RAG plan, see
 * `.local/tasks/specialist-reference-ranges.md`).
 *
 * Endpoints:
 *   GET /api/admin/reference-ranges            — list (filter by domain,
 *                                                metricKey, country, year)
 *   GET /api/admin/reference-ranges/facets     — counts for filter pills
 *   GET /api/admin/reference-ranges/:id        — single row
 *
 * Write paths (create / update / archive) land in Phase 2.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { requireAdmin } from "../../auth";
import { logAndSendError, parseRouteId } from "../helpers";
import { referenceRangeStorage } from "../../storage/reference-range";
import { REFERENCE_RANGE_DOMAINS } from "@shared/schema/reference-range";
import { logger } from "../../logger";

const listFilterSchema = z.object({
  domain: z.enum(REFERENCE_RANGE_DOMAINS).optional(),
  metricKey: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  includeArchived: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .transform((v) => v === true || v === "true")
    .optional(),
});

export function registerAdminReferenceRangeRoutes(app: Express) {
  // ── GET /api/admin/reference-ranges ─────────────────────────────
  app.get("/api/admin/reference-ranges", requireAdmin, async (req: Request, res: Response) => {
    const parsed = listFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: fromZodError(parsed.error).toString() });
    }
    try {
      const rows = await referenceRangeStorage.list(parsed.data);
      res.json({ rows });
    } catch (err: unknown) {
      logAndSendError(res, "Failed to list reference ranges", err, "reference-ranges");
    }
  });

  // ── GET /api/admin/reference-ranges/facets ──────────────────────
  app.get("/api/admin/reference-ranges/facets", requireAdmin, async (_req, res) => {
    try {
      const facets = await referenceRangeStorage.facets();
      res.json(facets);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to load reference range facets", err, "reference-ranges");
    }
  });

  // ── POST /api/admin/reference-ranges/refresh ────────────────────
  // Admin presses the Analyst button to refresh live market data.
  // Calls AirROI (KPI) + FRED (macro) and upserts into reference_range.
  // Responds immediately with { started: true }; progress is visible in
  // the server log. For a full streaming progress UX wire SSE in Phase 2.
  app.post("/api/admin/reference-ranges/refresh", requireAdmin, async (req, res) => {
    const domain = (req.body as Record<string, unknown>)?.domain as string | undefined;
    res.json({ started: true, domain: domain ?? "all" });

    // Fire-and-forget behind response so admin doesn't wait.
    (async () => {
      const { refreshKpiFromAirROI, refreshMacroFromFRED } = await import("../../seeds/reference-ranges");
      try {
        if (!domain || domain === "kpi") {
          const kpi = await refreshKpiFromAirROI();
          logger.info(`[reference-ranges] AirROI refresh: ${kpi.updated} updated, ${kpi.skipped} skipped`, "admin");
        }
        if (!domain || domain === "macro") {
          const macro = await refreshMacroFromFRED();
          logger.info(`[reference-ranges] FRED refresh: ${macro.updated} series updated`, "admin");
        }
      } catch (err: unknown) {
        logger.error(`[reference-ranges] Refresh failed: ${err instanceof Error ? err.message : String(err)}`, "admin");
      }
    })();
  });

  // ── GET /api/admin/reference-ranges/:id ─────────────────────────
  // Registered AFTER the static segments so paths don't get swallowed.
  app.get("/api/admin/reference-ranges/:id", requireAdmin, async (req, res) => {
    const id = parseRouteId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: "id must be a positive integer" });
    }
    try {
      const row = await referenceRangeStorage.getById(id);
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to load reference range", err, "reference-ranges");
    }
  });
}
