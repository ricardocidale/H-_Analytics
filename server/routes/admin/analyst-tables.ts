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
import { researchCapitalRaiseBenchmarks, researchExitMultiples } from "../../ai/analyst-table-refresh";
import { narrateSpecialistHandoff } from "../../lib/specialist-identity-resolver";
import type { AnalystRefreshAuditLog } from "@shared/schema";

const TABLE_LABELS: Record<AnalystTableId, string> = {
  capital_raise_benchmarks: "Capital Raise Benchmarks",
  exit_multiples: "Exit Multiples",
};

// User-Agent stamped on audit-log rows written by the Capital-Raise Watchdog
// ingest path (`server/ai/analyst-table-refresh.ts → applyWatchdogCapitalRaiseSnapshot`).
// Used here to label the source of each refresh so the Analyst Tables admin
// UI can show "Refreshed by: Watchdog" vs "Refreshed by: Admin <name>".
const WATCHDOG_USER_AGENT = "capital-raise-watchdog";

type RefreshSource =
  | { kind: "watchdog"; label: string }
  | { kind: "admin"; adminId: number; adminName: string; label: string }
  | { kind: "unknown"; label: string };

function deriveRefreshSource(
  row: Pick<AnalystRefreshAuditLog, "userAgent" | "adminId">,
  adminNameById: Map<number, string>,
): RefreshSource {
  if (row.userAgent === WATCHDOG_USER_AGENT) {
    return { kind: "watchdog", label: "Watchdog" };
  }
  if (row.adminId != null) {
    // For known users we render "Admin <Name>"; for users that have been
    // deleted (lookup miss) we drop the "Admin " prefix to avoid the
    // doubled "Admin Admin #11" label and use the explicit "Admin #<id>"
    // form on its own.
    const resolvedName = adminNameById.get(row.adminId);
    const adminName = resolvedName ?? `Admin #${row.adminId}`;
    const label = resolvedName ? `Admin ${resolvedName}` : adminName;
    return {
      kind: "admin",
      adminId: row.adminId,
      adminName,
      label,
    };
  }
  return { kind: "unknown", label: "Unknown" };
}

// Phase 3 (#453) — owning specialist per analyst table. Used to
// narrate the handoff line at the head of `narration[]` with the
// override-resolved humanName + gender-derived pronoun. Both refresh
// jobs are dispatched by the funding specialist (Beatriz by default).
const TABLE_OWNER_SPECIALIST_ID: Record<AnalystTableId, string> = {
  capital_raise_benchmarks: "mgmt-co.funding",
  exit_multiples: "mgmt-co.funding",
};

export function registerAdminAnalystTableRoutes(app: Express) {
  // ── GET /api/admin/analyst-tables ──────────────────────────────
  app.get("/api/admin/analyst-tables", requireAdmin, async (_req, res) => {
    try {
      const settings = await storage.getAnalystRefreshSettings();
      const tables = [];

      const cadenceMs = settings.globalCadenceDays * 24 * 60 * 60 * 1000;
      for (const id of ANALYST_TABLE_ALLOW_LIST) {
        const summary = id === "capital_raise_benchmarks"
          ? await storage.getCapitalRaiseBenchmarkSummary()
          : await storage.getExitMultiplesSummary();
        const lastRefreshedAt = summary.lastRefreshedAt;
        const ageMs = lastRefreshedAt ? Date.now() - lastRefreshedAt.getTime() : null;
        const freshness =
          lastRefreshedAt == null ? "missing" :
          ageMs! > cadenceMs ? "stale" : "fresh";

        // Pull the recent audit-log rows so we can both (a) name the source
        // of the most-recent successful refresh on the table card and (b)
        // render the recent-refresh history list with the same labels.
        // Limit:10 keeps headroom for a few in-flight/aborted rows above the
        // 5 we surface in the history strip.
        const recent = await storage.getRecentAnalystRefreshAuditLogs({ tableId: id, limit: 10 });

        // Resolve admin display names in one batch per table. Audit rows
        // written by the watchdog have adminId=null so they're skipped.
        const adminIds = Array.from(
          new Set(
            recent
              .map(r => r.adminId)
              .filter((x): x is number => x != null),
          ),
        );
        const adminNameById = new Map<number, string>();
        await Promise.all(
          adminIds.map(async (adminId) => {
            const u = await storage.getUserById(adminId).catch(() => undefined);
            if (!u) return;
            const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim()
              || u.email
              || `Admin #${u.id}`;
            adminNameById.set(adminId, name);
          }),
        );

        const lastSuccess = recent.find(r => r.status === "success");
        const lastRefreshSource = lastSuccess
          ? deriveRefreshSource(lastSuccess, adminNameById)
          : null;
        // Prefer a finalized success row for tokens-used; fall back to the
        // newest row only if no success exists yet (e.g. brand-new tables).
        const tokensUsedLastRefresh = lastSuccess?.tokensUsed ?? recent[0]?.tokensUsed ?? null;

        const recentRefreshes = recent.slice(0, 5).map(r => ({
          id: r.id,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
          status: r.status,
          source: deriveRefreshSource(r, adminNameById),
        }));

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
          tokensUsedLastRefresh,
          lastRefreshedAt,
          freshness,
          lastRefreshSource,
          recentRefreshes,
        });
      }

      res.json({
        tables,
        settings: {
          globalCadenceDays: settings.globalCadenceDays,
          lastSuspiciousAlertAt: settings.lastSuspiciousAlertAt,
        },
      });
    } catch (err: unknown) {
      logAndSendError(res, "Failed to list analyst tables", err);
    }
  });

  // ── GET / PATCH /api/admin/analyst-refresh-settings ───────────
  app.get("/api/admin/analyst-refresh-settings", requireAdmin, async (_req, res) => {
    try {
      const settings = await storage.getAnalystRefreshSettings();
      res.json(settings);
    } catch (err: unknown) {
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
    } catch (err: unknown) {
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
    } catch (err: unknown) {
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
        const llmResult = tableId === "capital_raise_benchmarks"
          ? await researchCapitalRaiseBenchmarks(await storage.getCapitalRaiseBenchmarks())
          : await researchExitMultiples(await storage.getExitMultiples());

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
        // Phase 3 (#453) — prepend a deterministic, pronoun-aware
        // handoff line that uses the override-resolved humanName +
        // gender. Renaming the funding specialist or flipping pronouns
        // through /identity flows directly into this narration on the
        // very next refresh, with no restart.
        //
        // The narration is decorative: the LLM work is already done and
        // the audit row is already finalized=success above. A failure
        // inside narrateSpecialistHandoff (e.g. transient
        // storage.getIdentityOverride outage) must NOT downgrade a
        // successful refresh into a 500 that the client can't act on.
        // Fall back to a neutral, identity-free line in that case.
        const narrationLines = [...llmResult.narration];
        try {
          const handoff = await narrateSpecialistHandoff(
            TABLE_OWNER_SPECIALIST_ID[tableId],
            `${TABLE_LABELS[tableId]} refresh`,
          );
          if (handoff) narrationLines.unshift(handoff);
        } catch (handoffErr: unknown) {
          logger.warn(
            `narrateSpecialistHandoff failed for ${tableId}; continuing without handoff line: ${String(handoffErr)}`,
            "analyst-refresh",
          );
        }
        res.json({
          tableId,
          auditId,
          proposedRanges: llmResult.proposedRanges,
          narration: narrationLines,
          sourceCount: llmResult.sourceCount,
          tokensUsed: llmResult.tokensUsed,
          evidence: llmResult.evidence,
        });
      } catch (err: unknown) {
        if (auditId) {
          await storage.finalizeAnalystRefreshAuditLog(auditId, {
            status: "failure",
            finishedAt: new Date(),
            errorMessage: err instanceof Error ? err.message : String(err),
          }).catch(() => { /* ignore — already inside an error path; audit-log finalize is best-effort */ });
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
      const defaultUnit = tableId === "exit_multiples" ? "x_revenue" : "usd";
      for (const r of parsed.data.proposedRanges) {
        const payload = {
          dimensionKey: r.dimensionKey,
          label: r.label,
          unit: r.unit ?? defaultUnit,
          valueLow: r.valueLow,
          valueMid: r.valueMid,
          valueHigh: r.valueHigh,
          sourceCount: parsed.data.sourceCount ?? 0,
          lastRefreshedAt: now,
        };
        if (tableId === "capital_raise_benchmarks") {
          await storage.upsertCapitalRaiseBenchmark(payload);
        } else {
          await storage.upsertExitMultiple(payload);
        }
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
    } catch (err: unknown) {
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
    } catch (err: unknown) {
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
      const rows = tableId === "capital_raise_benchmarks"
        ? await storage.getCapitalRaiseBenchmarks()
        : await storage.getExitMultiples();
      for (const r of rows) {
        const payload = {
          dimensionKey: r.dimensionKey,
          label: r.label,
          unit: r.unit,
          valueLow: r.valueLow,
          valueMid: r.valueMid,
          valueHigh: r.valueHigh,
          sourceCount: r.sourceCount,
          lastRefreshedAt: now,
        };
        if (tableId === "capital_raise_benchmarks") {
          await storage.upsertCapitalRaiseBenchmark(payload);
        } else {
          await storage.upsertExitMultiple(payload);
        }
      }
      logActivity(req, "analyst-table-reseed", "analyst_table", null, tableId as string, {
        rowsReseeded: rows.length,
      });
      res.json({ ok: true, rowsReseeded: rows.length });
    } catch (err: unknown) {
      logAndSendError(res, "Failed to reseed accounts", err);
    }
  });
}
