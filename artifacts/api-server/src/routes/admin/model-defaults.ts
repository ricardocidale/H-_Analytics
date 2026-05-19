/**
 * Admin routes for model_defaults — the DB-backed seed values for the
 * Model Defaults → Defaults page (three-tier cascade: Constants → Defaults
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
import { runValentinaResearch, VALENTINA_ENABLED_PARAM, type ValentinaInputRow } from "../../ai/valentina-model-defaults";
import { storage } from "../../storage";

const patchBodySchema = z.object({
  value: z.unknown(),
  reason: z.string().min(1, "A reason is required for manual overrides"),
});

let isValentinaResearchRunning = false;

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
      logAndSendError(res, "Failed to fetch model defaults", error, "AMDF-001");
    }
  });

  // ── Update value (manual override) ─────────────────────────────────
  app.patch("/api/admin/model-defaults/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id", code: "AMDF-005" });

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

      if (!updated) return res.status(404).json({ error: "Row not found", code: "AMDF-006" });

      logActivity(req, "update-model-default", "model-default", id, `Manual override: ${reason}`, { value });
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update model default", error, "AMDF-002");
    }
  });

  // ── Accept analyst proposal ─────────────────────────────────────────
  app.post("/api/admin/model-defaults/:id/accept-proposal", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id", code: "AMDF-007" });

      const [row] = await db.select().from(modelDefaults).where(eq(modelDefaults.id, id));
      if (!row) return res.status(404).json({ error: "Row not found", code: "AMDF-008" });

      if (row.proposedValue === null || row.proposedValue === undefined) {
        return res.status(400).json({ error: "No pending proposal to accept", code: "AMDF-009" });
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
      logAndSendError(res, "Failed to accept model default proposal", error, "AMDF-003");
    }
  });

  // ── Valentina: trigger model defaults research ──────────────────────
  app.post("/api/admin/model-defaults/research", requireAdmin, async (req, res) => {
    if (isValentinaResearchRunning) {
      return res.status(409).json({ error: "Research already in progress", code: "MD-002" });
    }
    isValentinaResearchRunning = true;
    try {
      // Feature flag gate — ships dark (value: 0).
      const flagRow = await storage.getAdminResourceBySlug("parameter", VALENTINA_ENABLED_PARAM);
      const flagValue = (flagRow?.config as { value?: number } | undefined)?.value ?? 0;
      if (flagValue !== 1) {
        return res.status(503).json({ error: "Valentina is not yet enabled", code: "MD-001" });
      }

      // Fetch seed rows from property and management_company categories.
      const rows = await db
        .select()
        .from(modelDefaults)
        .then((all) =>
          all.filter(
            (r) => r.lastSetSource === "seed" && ["property", "management_company"].includes(r.category),
          ),
        );

      if (rows.length === 0) {
        return res.json({ proposed: 0, skipped: 0, runId: null });
      }

      const inputRows: ValentinaInputRow[] = rows.map((r) => ({
        id: r.id,
        defaultKey: r.defaultKey,
        label: r.label,
        unit: r.unit ?? null,
        value: r.value,
        category: r.category,
        subTab: r.subTab,
      }));

      const proposals = await runValentinaResearch(inputRows);

      let proposed = 0;
      let skipped = 0;

      for (const proposal of proposals) {
        if (proposal.skipped) {
          skipped++;
          continue;
        }

        await db
          .update(modelDefaults)
          .set({
            proposedValue: proposal.proposedValue as never,
            proposedRangeLow: proposal.proposedRangeLow as never,
            proposedRangeHigh: proposal.proposedRangeHigh as never,
            proposedAuthority: proposal.proposedAuthority ?? null,
            proposedReferenceUrl: proposal.proposedReferenceUrl ?? null,
            proposedConviction: proposal.proposedConviction ?? null,
            proposedAt: new Date(),
          })
          .where(eq(modelDefaults.id, proposal.id));

        proposed++;
      }

      logActivity(req, "trigger-valentina-research", "model-defaults", null, `Proposed ${proposed}, skipped ${skipped}`, { proposed, skipped });
      res.json({ proposed, skipped, runId: null });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to run Valentina research", error, "AMDF-012");
    } finally {
      isValentinaResearchRunning = false;
    }
  });

  // ── Reject analyst proposal ─────────────────────────────────────────
  app.post("/api/admin/model-defaults/:id/reject-proposal", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id", code: "AMDF-010" });

      const [row] = await db.select().from(modelDefaults).where(eq(modelDefaults.id, id));
      if (!row) return res.status(404).json({ error: "Row not found", code: "AMDF-011" });

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
      logAndSendError(res, "Failed to reject model default proposal", error, "AMDF-004");
    }
  });
}
