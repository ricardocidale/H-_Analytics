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
import { requireAdmin } from "../../auth";
import { logAndSendError, parseRouteId, zodErrorMessage } from "../helpers";
import { PG_UNIQUE_VIOLATION_CODE, HTTP_409_CONFLICT } from "../../constants";
import { referenceRangeStorage } from "../../storage/reference-range";
import {
  REFERENCE_RANGE_DOMAINS,
  REFERENCE_RANGE_CONFIDENCES,
  insertReferenceRangeSchema,
} from "@workspace/db";

// Range-aware partial schema for PUT /api/admin/reference-ranges/:id.
// When any of low/mid/high is sent, all three must be present and ordered.
const updateBodySchema = z
  .object({
    domain: z.enum(REFERENCE_RANGE_DOMAINS).optional(),
    metricKey: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
    country: z.string().min(1).optional(),
    subdivision: z.string().min(1).nullable().optional(),
    market: z.string().min(1).nullable().optional(),
    segment: z.string().min(1).nullable().optional(),
    propertyType: z.string().min(1).nullable().optional(),
    year: z.number().int().min(0).max(2200).optional(),
    effectiveFrom: z.string().date().nullable().optional(),
    effectiveUntil: z.string().date().nullable().optional(),
    low: z.number().optional(),
    mid: z.number().optional(),
    high: z.number().optional(),
    unit: z.string().min(1).optional(),
    sourceId: z.number().int().nullable().optional(),
    sourceName: z.string().nullable().optional(),
    sourceUrl: z.string().url().nullable().optional(),
    methodology: z.string().nullable().optional(),
    confidence: z.enum(REFERENCE_RANGE_CONFIDENCES).optional(),
    details: z.record(z.unknown()).nullable().optional(),
    lastVerifiedAt: z.coerce.date().nullable().optional(),
    verifiedBy: z.string().nullable().optional(),
  })
  .refine(
    (row) => {
      const anyRange = row.low !== undefined || row.mid !== undefined || row.high !== undefined;
      if (!anyRange) return true;
      if (row.low === undefined || row.mid === undefined || row.high === undefined) return false;
      return row.low <= row.mid && row.mid <= row.high;
    },
    { message: "When updating range, all of low, mid, and high must be provided with low ≤ mid ≤ high", path: ["mid"] },
  );

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    ((err as { code?: string }).code === PG_UNIQUE_VIOLATION_CODE ||
      ((err as { cause?: { code?: string } }).cause?.code === PG_UNIQUE_VIOLATION_CODE))
  );
}

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
      return res.status(400).json({ error: zodErrorMessage(parsed.error) });
    }
    try {
      const rows = await referenceRangeStorage.list(parsed.data);
      res.json({ rows });
    } catch (err: unknown) {
      logAndSendError(res, "Failed to list reference ranges", err, "AREF-001");
    }
  });

  // ── GET /api/admin/reference-ranges/facets ──────────────────────
  app.get("/api/admin/reference-ranges/facets", requireAdmin, async (_req, res) => {
    try {
      const facets = await referenceRangeStorage.facets();
      res.json(facets);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to load reference range facets", err, "AREF-002");
    }
  });

  // ── GET /api/admin/reference-ranges/:id ─────────────────────────
  // Registered AFTER the static segments so paths don't get swallowed.
  app.get("/api/admin/reference-ranges/:id", requireAdmin, async (req, res) => {
    const id = parseRouteId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: "id must be a positive integer", code: "AREF-008" });
    }
    try {
      const row = await referenceRangeStorage.getById(id);
      if (!row) return res.status(404).json({ error: "Not found", code: "AREF-009" });
      res.json(row);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to load reference range", err, "AREF-003");
    }
  });

  // ── POST /api/admin/reference-ranges ────────────────────────────
  app.post("/api/admin/reference-ranges", requireAdmin, async (req: Request, res: Response) => {
    const parsed = insertReferenceRangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: zodErrorMessage(parsed.error) });
    }
    const adminId = (req.user as { email?: string; id?: number })?.email ?? String((req.user as { id?: number })?.id ?? "admin");
    const data = { ...parsed.data, verifiedBy: parsed.data.verifiedBy ?? adminId };
    try {
      const row = await referenceRangeStorage.create(data);
      res.status(201).json(row);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        return res.status(HTTP_409_CONFLICT).json({
          error: "A reference range with the same domain, metric key, jurisdiction, and year already exists.",
        code: "AREF-017" });
      }
      logAndSendError(res, "Failed to create reference range", err, "AREF-004");
    }
  });

  // ── PUT /api/admin/reference-ranges/:id ─────────────────────────
  app.put("/api/admin/reference-ranges/:id", requireAdmin, async (req, res) => {
    const id = parseRouteId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: "id must be a positive integer", code: "AREF-010" });
    }
    const parsed = updateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: zodErrorMessage(parsed.error) });
    }
    if (Object.keys(parsed.data).length === 0) {
      return res.status(400).json({ error: "No fields to update", code: "AREF-011" });
    }
    const adminId = (req.user as { email?: string; id?: number })?.email ?? String((req.user as { id?: number })?.id ?? "admin");
    const data = { ...parsed.data, verifiedBy: parsed.data.verifiedBy ?? adminId };
    try {
      const row = await referenceRangeStorage.update(id, data);
      if (!row) return res.status(404).json({ error: "Not found", code: "AREF-012" });
      res.json(row);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        return res.status(HTTP_409_CONFLICT).json({
          error: "A reference range with the same domain, metric key, jurisdiction, and year already exists.",
        code: "AREF-018" });
      }
      logAndSendError(res, "Failed to update reference range", err, "AREF-005");
    }
  });

  // ── DELETE /api/admin/reference-ranges/:id ──────────────────────
  // Soft delete (sets archivedAt). Hard delete is not supported.
  app.delete("/api/admin/reference-ranges/:id", requireAdmin, async (req, res) => {
    const id = parseRouteId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: "id must be a positive integer", code: "AREF-013" });
    }
    try {
      const row = await referenceRangeStorage.archive(id);
      if (!row) return res.status(404).json({ error: "Not found", code: "AREF-014" });
      res.json(row);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to archive reference range", err, "AREF-006");
    }
  });

  // ── POST /api/admin/reference-ranges/:id/restore ────────────────
  app.post("/api/admin/reference-ranges/:id/restore", requireAdmin, async (req, res) => {
    const id = parseRouteId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: "id must be a positive integer", code: "AREF-015" });
    }
    try {
      const row = await referenceRangeStorage.restore(id);
      if (!row) return res.status(404).json({ error: "Not found", code: "AREF-016" });
      res.json(row);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to restore reference range", err, "AREF-007");
    }
  });
}
