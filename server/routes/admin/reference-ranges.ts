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
 * Write paths (create / update / archive) and the deep-research-driven
 * refresh endpoint land in Phase 2 / Phase 4 respectively. Phase 1 is
 * intentionally read-only so the edit / refresh surface can be hardened
 * with the same CSRF + rate + concurrency guards used by analyst admin
 * POST routes before being exposed.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { requireAdmin } from "../../auth";
import { logAndSendError, parseRouteId } from "../helpers";
import { referenceRangeStorage } from "../../storage/reference-range";
import { REFERENCE_RANGE_DOMAINS } from "@shared/schema/reference-range";

const listFilterSchema = z.object({
  domain: z.enum(REFERENCE_RANGE_DOMAINS).optional(),
  metricKey: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  // year = 0 is the evergreen convention (rows with no calendar anchor,
  // e.g. permanent statutory rules); positive years are calendar years.
  year: z.coerce.number().int().min(0).max(2200).optional(),
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
