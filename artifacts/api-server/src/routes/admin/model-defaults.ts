/**
 * Admin routes for model_defaults — the DB-backed seed values for the
 * Steady State → Defaults page (three-tier cascade: Constants → Defaults
 * → Assumptions).
 *
 * GET  /api/admin/model-defaults
 *   Returns all rows, optionally filtered by ?category= and/or ?cardKey=.
 *   Rows are grouped: { category → subTab → cardKey → rows[] }.
 *   Each row exposes its current value, pending proposal (if any), label,
 *   unit, and full provenance so the UI can render proposal badges inline.
 *
 * PATCH /api/admin/model-defaults/:id
 *   Admin manually updates a single row's value. Sets lastSetSource='manual',
 *   lastSetBy=req.user.id, lastSetAt=now. Requires a `reason` in the body
 *   (same forcing function as model-constants manual overrides).
 *
 * POST /api/admin/model-defaults/:id/accept-proposal
 *   Copies proposedValue → value, sets lastSetSource='analyst_accepted',
 *   clears all proposed_* columns. Idempotent when no proposal is pending.
 *
 * POST /api/admin/model-defaults/:id/reject-proposal
 *   Clears proposed_* columns without touching the current value.
 */

import { type Express } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { modelDefaults } from "@workspace/db";
import { requireAdmin } from "../../auth";
import { logAndSendError, logActivity } from "../helpers";

const patchBodySchema = z.object({
  value: z.unknown(),
  reason: z.string().min(1, "A reason is required for manual overrides"),
});

export function registerModelDefaultsRoutes(app: Express) {
  // ── Read ────────────────────────────────────────────────────────────
  app.get("/api/admin/model-defaults", requireAdmin, async (req, res) => {
    try {
      const { category, cardKey } = req.query as Record<string, string | undefined>;

      const rows = await db.select().from(modelDefaults);

      const filtered = rows.filter(r => {
        if (category && r.category !== category) return false;
        if (cardKey && r.cardKey !== cardKey) return false;
        return true;
      });

      // Group: category → subTab → cardKey → rows[]
      type Grouped = Record<string, Record<string, Record<string, typeof filtered>>>;
      const grouped: Grouped = {};
      for (const row of filtered) {
        grouped[row.category] ??= {};
        grouped[row.category][row.subTab] ??= {};
        grouped[row.category][row.subTab][row.cardKey] ??= [];
        grouped[row.category][row.subTab][row.cardKey].push(row);
      }

      res.json({ rows: filtered, grouped });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch model defaults", error);
    }
  });

  // ── Update value (manual override) ─────────────────────────────────
  app.patch("/api/admin/model-defaults/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

      const validation = patchBodySchema.safeParse(req.body);
      if (!validation.success) return res.status(400).json({ error: validation.error.message });

      const { value, reason } = validation.data;
      const userId = (req as unknown as { user?: { id: number } }).user?.id ?? null;

      const [updated] = await db
        .update(modelDefaults)
        .set({
          value: value as never,
          lastSetSource: "manual",
          lastSetBy: userId,
          lastSetAt: new Date(),
          lastSetReason: reason,
        })
        .where(eq(modelDefaults.id, id))
        .returning();

      if (!updated) return res.status(404).json({ error: "Row not found" });

      logActivity(req, "update-model-default", "model-default", id, `Manual override: ${reason}`, { value });
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update model default", error);
    }
  });

  // ── Accept analyst proposal ─────────────────────────────────────────
  app.post("/api/admin/model-defaults/:id/accept-proposal", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

      const [row] = await db.select().from(modelDefaults).where(eq(modelDefaults.id, id));
      if (!row) return res.status(404).json({ error: "Row not found" });

      if (row.proposedValue === null || row.proposedValue === undefined) {
        return res.status(400).json({ error: "No pending proposal to accept" });
      }

      const userId = (req as unknown as { user?: { id: number } }).user?.id ?? null;

      const [updated] = await db
        .update(modelDefaults)
        .set({
          value: row.proposedValue as never,
          lastSetSource: "analyst_accepted",
          lastSetBy: userId,
          lastSetAt: new Date(),
          lastSetReason: `Accepted analyst proposal (conviction ${row.proposedConviction ?? "n/a"})`,
          proposedValue: null,
          proposedRangeLow: null,
          proposedRangeHigh: null,
          proposedAuthority: null,
          proposedReferenceUrl: null,
          proposedConviction: null,
          proposedResearchRunId: null,
          proposedAt: null,
        })
        .where(eq(modelDefaults.id, id))
        .returning();

      logActivity(req, "accept-model-default-proposal", "model-default", id, "Accepted analyst proposal", {
        previousValue: row.value,
        acceptedValue: row.proposedValue,
      });
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to accept model default proposal", error);
    }
  });

  // ── Reject analyst proposal ─────────────────────────────────────────
  app.post("/api/admin/model-defaults/:id/reject-proposal", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

      const [row] = await db.select().from(modelDefaults).where(eq(modelDefaults.id, id));
      if (!row) return res.status(404).json({ error: "Row not found" });

      const [updated] = await db
        .update(modelDefaults)
        .set({
          proposedValue: null,
          proposedRangeLow: null,
          proposedRangeHigh: null,
          proposedAuthority: null,
          proposedReferenceUrl: null,
          proposedConviction: null,
          proposedResearchRunId: null,
          proposedAt: null,
        })
        .where(eq(modelDefaults.id, id))
        .returning();

      logActivity(req, "reject-model-default-proposal", "model-default", id, "Rejected analyst proposal");
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to reject model default proposal", error);
    }
  });
}
