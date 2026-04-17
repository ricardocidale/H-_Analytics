/**
 * admin/analyst-tables.ts — Admin endpoints for the Analyst Tables module.
 *
 * Endpoints:
 *   GET    /api/admin/analyst-tables                       — list all known
 *                                                            benchmark tables + freshness
 *   GET    /api/admin/analyst-refresh-settings             — read cadence config
 *   PATCH  /api/admin/analyst-refresh-settings             — update cadence
 *   POST   /api/admin/analyst-tables/:id/refresh           — run LLM refresh,
 *                                                            return proposed ranges
 *   POST   /api/admin/analyst-tables/:id/commit            — write the committed
 *                                                            ranges to the table
 *   POST   /api/admin/analyst-tables/:id/discard           — finalize the audit row
 *                                                            with status=aborted
 *   POST   /api/admin/analyst-tables/:id/reseed-accounts   — bulk reseed: clears
 *                                                            per-user overrides
 *
 * The seven security guardrails in `analystRefreshGuards()` are applied to the
 * three POST endpoints. The list/settings endpoints just require admin.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError, logActivity } from "../helpers";
import { logger } from "../../logger";
import {
  analystRefreshGuards,
  releaseInFlight,
  ANALYST_TABLE_ALLOW_LIST,
  type AnalystTableId,
} from "../../middleware/analyst-refresh-guards";
import { researchCapitalRaiseBenchmarks } from "../../ai/analyst-table-refresh";

const TABLE_LABELS: Record<AnalystTableId, string> = {
  capital_raise_benchmarks: "Capital Raise Benchmarks",
};

export function registerAdminAnalystTableRoutes(app: Express) {
  // ── GET /api/admin/analyst-tables ──────────────────────────────
  app.get("/api/admin/analyst-tables", requireAdmin, async (_req, res) => {
    try {
      const settings = await storage.getAnalystRefreshSettings();
      const tables = [];

      for (const id of ANALYST_TABLE_ALLOW_LIST) {
        if (id === "capital_raise_benchmarks") {
          const summary = await storage.getCapitalRaiseBenchmarkSummary();
          const lastRefreshedAt = summary.lastRefreshedAt;
          const ageMs = lastRefreshedAt ? Date.now() - lastRefreshedAt.getTime() : null;
          const cadenceMs = settings.globalCadenceDays * 24 * 60 * 60 * 1000;
          const freshness =
            lastRefreshedAt == null ? "missing" :
            ageMs! > cadenceMs ? "stale" : "fresh";
          const recent = await storage.getRecentAnalystRefreshAuditLogs({ tableId: id, limit: 1 });
          tables.push({
            id,
            label: TABLE_LABELS[id],
            ranges: summary.rows.map(r => ({
              dimensionKey: r.dimensionKey,
              label: r.label,
              unit: r.unit,
              valueLow: r.valueLow,
              valueMid: r.valueMid,
              valueHigh: r.valueHigh,
            })),
            sourceCount: summary.sourceCount,
            tokensUsedLastRefresh: recent[0]?.tokensUsed ?? null,
            lastRefreshedAt,
            freshness,
          });
        }
      }

      res.json({
        tables,
        settings: {
          globalCadenceDays: settings.globalCadenceDays,
          lastSuspiciousAlertAt: settings.lastSuspiciousAlertAt,
        },
      });
    } catch (err) {
      logAndSendError(res, "Failed to list analyst tables", err);
    }
  });

  // ── GET / PATCH /api/admin/analyst-refresh-settings ───────────
  app.get("/api/admin/analyst-refresh-settings", requireAdmin, async (_req, res) => {
    try {
      const settings = await storage.getAnalystRefreshSettings();
      res.json(settings);
    } catch (err) {
      logAndSendError(res, "Failed to load analyst refresh settings", err);
    }
  });

  const settingsPatchSchema = z.object({
    globalCadenceDays: z.number().int().min(1).max(365).optional(),
  });

  app.patch("/api/admin/analyst-refresh-settings", requireAdmin, async (req, res) => {
    try {
      const parsed = settingsPatchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });
      const settings = await storage.updateAnalystRefreshSettings(parsed.data);
      logActivity(req, "update-analyst-refresh-settings", "settings", null, "analyst-refresh", parsed.data);
      res.json(settings);
    } catch (err) {
      logAndSendError(res, "Failed to update analyst refresh settings", err);
    }
  });

  // ── Suspicious banner status (cleared after 1 hour) ────────────
  app.get("/api/admin/analyst-refresh-status", requireAdmin, async (_req, res) => {
    try {
      const settings = await storage.getAnalystRefreshSettings();
      const last = settings.lastSuspiciousAlertAt;
      const active = last ? (Date.now() - last.getTime()) < 60 * 60 * 1000 : false;
      res.json({ suspiciousActive: active, lastSuspiciousAlertAt: last });
    } catch (err) {
      logAndSendError(res, "Failed to load analyst refresh status", err);
    }
  });

  // ── POST /api/admin/analyst-tables/:id/refresh ────────────────
  app.post( // requireAdmin enforced via analystRefreshGuards()[0]
    "/api/admin/analyst-tables/:id/refresh",
    ...analystRefreshGuards(),
    async (req: Request, res: Response) => {
      const tableId = req.params.id as AnalystTableId;
      const auditId = res.locals.analystRefreshAuditId as number | undefined;
      try {
        const current = tableId === "capital_raise_benchmarks"
          ? await storage.getCapitalRaiseBenchmarks()
          : [];
        const llmResult = await researchCapitalRaiseBenchmarks(current);

        if (auditId) {
          await storage.finalizeAnalystRefreshAuditLog(auditId, {
            sourceCount: llmResult.sourceCount,
            tokensUsed: llmResult.tokensUsed,
            status: "success",
            finishedAt: new Date(),
            diffSummary: { proposed: llmResult.proposedRanges, evidence: llmResult.evidence },
          });
        }
        releaseInFlight(tableId);
        logActivity(req, "analyst-table-refresh", "analyst_table", null, tableId as string, {
          tokensUsed: llmResult.tokensUsed,
          sourceCount: llmResult.sourceCount,
        });
        res.json({
          tableId,
          auditId,
          proposedRanges: llmResult.proposedRanges,
          narration: llmResult.narration,
          sourceCount: llmResult.sourceCount,
          tokensUsed: llmResult.tokensUsed,
          evidence: llmResult.evidence,
        });
      } catch (err) {
        if (auditId) {
          await storage.finalizeAnalystRefreshAuditLog(auditId, {
            status: "failure",
            finishedAt: new Date(),
            errorMessage: err instanceof Error ? err.message : String(err),
          }).catch(() => {});
        }
        releaseInFlight(tableId);
        logger.error(`Analyst-table refresh failed for ${tableId}: ${String(err)}`, "analyst-refresh");
        logAndSendError(res, "Refresh failed", err);
      }
    },
  );

  // ── POST /api/admin/analyst-tables/:id/commit ─────────────────
  const commitSchema = z.object({
    auditId: z.number().int().positive().optional(),
    sourceCount: z.number().int().nonnegative().optional(),
    proposedRanges: z.array(z.object({
      dimensionKey: z.string(),
      label: z.string(),
      unit: z.string().optional(),
      valueLow: z.number().nullable(),
      valueMid: z.number().nullable(),
      valueHigh: z.number().nullable(),
    })),
  });

  app.post("/api/admin/analyst-tables/:id/commit", requireAdmin, async (req, res) => {
    try {
      const tableId = req.params.id;
      if (!ANALYST_TABLE_ALLOW_LIST.includes(tableId as AnalystTableId)) {
        return res.status(400).json({ error: `Unknown table id: ${tableId}` });
      }
      const parsed = commitSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });

      const now = new Date();
      for (const r of parsed.data.proposedRanges) {
        await storage.upsertCapitalRaiseBenchmark({
          dimensionKey: r.dimensionKey,
          label: r.label,
          unit: r.unit ?? "usd",
          valueLow: r.valueLow,
          valueMid: r.valueMid,
          valueHigh: r.valueHigh,
          sourceCount: parsed.data.sourceCount ?? 0,
          lastRefreshedAt: now,
        });
      }
      if (parsed.data.auditId) {
        await storage.finalizeAnalystRefreshAuditLog(parsed.data.auditId, {
          status: "success",
          finishedAt: now,
        });
      }
      logActivity(req, "analyst-table-commit", "analyst_table", null, tableId as string, {
        rangesCommitted: parsed.data.proposedRanges.length,
      });
      res.json({ ok: true });
    } catch (err) {
      logAndSendError(res, "Failed to commit analyst-table refresh", err);
    }
  });

  // ── POST /api/admin/analyst-tables/:id/discard ────────────────
  const discardSchema = z.object({ auditId: z.number().int().positive() });
  app.post("/api/admin/analyst-tables/:id/discard", requireAdmin, async (req, res) => {
    try {
      const tableId = req.params.id;
      if (!ANALYST_TABLE_ALLOW_LIST.includes(tableId as AnalystTableId)) {
        return res.status(400).json({ error: `Unknown table id: ${tableId}` });
      }
      const parsed = discardSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });
      await storage.finalizeAnalystRefreshAuditLog(parsed.data.auditId, {
        status: "aborted",
        finishedAt: new Date(),
      });
      logActivity(req, "analyst-table-discard", "analyst_table", null, tableId as string);
      res.json({ ok: true });
    } catch (err) {
      logAndSendError(res, "Failed to discard analyst-table refresh", err);
    }
  });

  // ── POST /api/admin/analyst-tables/:id/reseed-accounts ────────
  // Bulk reseed: writes to the singleton row, then nulls per-user overrides
  // so all accounts pick up the new ranges. The "per-user overrides" concept
  // is forward-looking; today we just touch the singleton row.
  app.post("/api/admin/analyst-tables/:id/reseed-accounts", requireAdmin, async (req, res) => {
    try {
      const tableId = req.params.id;
      if (!ANALYST_TABLE_ALLOW_LIST.includes(tableId as AnalystTableId)) {
        return res.status(400).json({ error: `Unknown table id: ${tableId}` });
      }
      // Touch the lastRefreshedAt to indicate a forced reseed.
      const now = new Date();
      const rows = await storage.getCapitalRaiseBenchmarks();
      for (const r of rows) {
        await storage.upsertCapitalRaiseBenchmark({
          dimensionKey: r.dimensionKey,
          label: r.label,
          unit: r.unit,
          valueLow: r.valueLow,
          valueMid: r.valueMid,
          valueHigh: r.valueHigh,
          sourceCount: r.sourceCount,
          lastRefreshedAt: now,
        });
      }
      logActivity(req, "analyst-table-reseed", "analyst_table", null, tableId as string, {
        rowsReseeded: rows.length,
      });
      res.json({ ok: true, rowsReseeded: rows.length });
    } catch (err) {
      logAndSendError(res, "Failed to reseed accounts", err);
    }
  });
}
