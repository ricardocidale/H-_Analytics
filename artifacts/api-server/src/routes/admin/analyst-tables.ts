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
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError, logActivity, zodErrorMessage } from "../helpers";
import { logger } from "../../logger";
import {
  analystRefreshGuards,
  csrfTokenGuard,
  releaseInFlight,
  ANALYST_TABLE_ALLOW_LIST,
  type AnalystTableId,
} from "../../middleware/analyst-refresh-guards";
import { researchCapitalRaiseBenchmarks, researchExitMultiples, researchReferenceBrands } from "../../ai/analyst-table-refresh";
import { runCapitalRaiseWatchdogCycle } from "../../ai/ambient/capital-raise-watchdog";
import { narrateSpecialistHandoff } from "../../lib/specialist-identity-resolver";
import type { AnalystRefreshAuditLog } from "@workspace/db";

const TABLE_LABELS: Record<AnalystTableId, string> = {
  capital_raise_benchmarks: "Capital Raise Benchmarks",
  exit_multiples: "Exit Multiples",
  reference_brands: "Reference Brands",
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

// ── Per-admin rate limiter for the on-demand watchdog trigger ────
// Keyed by adminId, stores the timestamp of the most recent forced
// `runCapitalRaiseWatchdogCycle` call. Returns 0 if a slot is available
// (and records the new attempt), or the number of milliseconds the
// caller must wait before the next attempt.
//
// In-memory only by design — this is a soft anti-spam guard for the
// admin-facing button, not a security boundary. The watchdog itself
// also writes audit-log rows, which the existing per-admin counter
// in `analystRefreshGuards` already polls; that's the durable
// cross-process limit. This in-memory map adds a tighter 60s cooldown
// on the specific watchdog trigger so a single admin double-clicking
// the button can't burn LLM budget twice in two seconds.
const WATCHDOG_MIN_INTERVAL_MS = 60 * 1000;
const watchdogLastRunAt = new Map<number, number>();

export function clearWatchdogRateState() {
  watchdogLastRunAt.clear();
}

function takeWatchdogRateSlot(adminId: number, now: number = Date.now()): number {
  const last = watchdogLastRunAt.get(adminId);
  if (last != null) {
    const elapsed = now - last;
    if (elapsed < WATCHDOG_MIN_INTERVAL_MS) {
      return WATCHDOG_MIN_INTERVAL_MS - elapsed;
    }
  }
  watchdogLastRunAt.set(adminId, now);
  return 0;
}

// Phase 3 (#453) — owning specialist per analyst table. Used to
// narrate the handoff line at the head of `narration[]` with the
// override-resolved humanName + gender-derived pronoun. Both refresh
// jobs are dispatched by the funding specialist (Beatriz by default).
const TABLE_OWNER_SPECIALIST_ID: Record<AnalystTableId, string> = {
  capital_raise_benchmarks: "mgmt-co.funding",
  exit_multiples: "mgmt-co.funding",
  reference_brands: "mgmt-co.funding",
};

export function registerAdminAnalystTableRoutes(app: Express) {
  // ── GET /api/admin/analyst-tables ──────────────────────────────
  app.get("/api/admin/analyst-tables", requireAdmin, async (_req, res) => {
    try {
      const settings = await storage.getAnalystRefreshSettings();
      const tables = [];

      const cadenceMs = settings.globalCadenceDays * 24 * 60 * 60 * 1000;
      for (const id of ANALYST_TABLE_ALLOW_LIST) {
        let ranges: Array<{
          dimensionKey: string; label: string; unit: string;
          valueLow: number | null; valueMid: number | null; valueHigh: number | null;
        }>;
        let lastRefreshedAt: Date | null;
        let sourceCount: number;
        // Full brand detail rows — only set for reference_brands; undefined for
        // other tables so their range-grid rendering is unaffected.
        let brandDetails: Array<{
          id: number;
          brandName: string;
          niche: string | null;
          adrUsd: number | null;
          occupancyPct: number | null;
          revparUsd: number | null;
          propertyCount: number | null;
          geographicFocus: string | null;
          description: string | null;
        }> | undefined;

        if (id === "reference_brands") {
          const summary = await storage.getReferenceBrandsSummary();
          lastRefreshedAt = summary.lastRefreshedAt;
          sourceCount = summary.sourceCount;
          ranges = summary.rows.map(b => ({
            dimensionKey: `brand_${b.id}`,
            label: b.niche ? `${b.brandName} · ${b.niche}` : b.brandName,
            unit: "properties",
            valueLow: b.keyCountMin ?? null,
            valueMid: b.propertyCount ?? null,
            valueHigh: b.keyCountMax ?? null,
          }));
          brandDetails = summary.rows.map(b => ({
            id: b.id,
            brandName: b.brandName,
            niche: b.niche ?? null,
            adrUsd: b.adrUsd ?? null,
            occupancyPct: b.occupancyPct ?? null,
            revparUsd: b.revparUsd ?? null,
            propertyCount: b.propertyCount ?? null,
            geographicFocus: b.geographicFocus ?? null,
            description: b.description ?? null,
          }));
        } else {
          const summary = id === "capital_raise_benchmarks"
            ? await storage.getCapitalRaiseBenchmarkSummary()
            : await storage.getExitMultiplesSummary();
          lastRefreshedAt = summary.lastRefreshedAt;
          sourceCount = summary.sourceCount;
          ranges = summary.rows.map(r => ({
            dimensionKey: r.dimensionKey,
            label: r.label,
            unit: r.unit,
            valueLow: r.valueLow,
            valueMid: r.valueMid,
            valueHigh: r.valueHigh,
          }));
        }

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
          ranges,
          brands: brandDetails,
          sourceCount,
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
      if (!parsed.success) return res.status(400).json({ error: zodErrorMessage(parsed.error) });
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
        let llmResult;
        if (tableId === "capital_raise_benchmarks") {
          llmResult = await researchCapitalRaiseBenchmarks(await storage.getCapitalRaiseBenchmarks());
        } else if (tableId === "exit_multiples") {
          llmResult = await researchExitMultiples(await storage.getExitMultiples());
        } else {
          // reference_brands: auto-commits to DB inside researchReferenceBrands
          llmResult = await researchReferenceBrands(await storage.getReferenceBrands(), auditId);
        }

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
        // reference_brands uses full-replace auto-commit; skip diff/review dialog
        const autoCommitted = "autoCommitted" in llmResult ? llmResult.autoCommitted : false;
        res.json({
          tableId,
          auditId,
          autoCommitted,
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
      // reference_brands auto-commits inside the refresh handler; there is no
      // staged diff to commit separately. Reject early to prevent misrouting.
      if (tableId === "reference_brands") {
        return res.status(409).json({
          error: "reference_brands is an auto-committed table; commit/discard endpoints are not supported. Use the /refresh endpoint instead.",
        });
      }
      const parsed = commitSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: zodErrorMessage(parsed.error) });

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
      // reference_brands auto-commits; no staged state to discard.
      if (tableId === "reference_brands") {
        return res.status(409).json({
          error: "reference_brands is an auto-committed table; commit/discard endpoints are not supported.",
        });
      }
      const parsed = discardSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: zodErrorMessage(parsed.error) });
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

  // ── POST /api/admin/analyst-tables/:id/run-watchdog ───────────
  // Admin-only on-demand trigger for the Capital-Raise Watchdog. The
  // ambient scheduler calls `runCapitalRaiseWatchdogCycle` on a 6h tick
  // with the cadence guard active (default weekly); this endpoint
  // bypasses the cadence guard via `{ force: true }` so admins can
  // exercise the real scheduled code path on demand — for testing,
  // post-market-shock manual nudges, or end-to-end cron verification.
  //
  // Distinct from the manual `POST .../refresh` (which calls the LLM
  // synthesizer and stages a diff for admin commit/discard); the
  // watchdog runs the full ingest pipeline including the N+1 evidence
  // gate and atomically writes the snapshot itself, just like the
  // scheduled cron path.
  //
  // Security:
  //   - admin-only (requireAdmin)
  //   - CSRF-protected (same double-submit / HMAC contract as /refresh)
  //   - allow-list scoped to capital_raise_benchmarks
  //   - per-admin rate limit: ≤1 forced run per minute (prevents
  //     runaway LLM spend if the button is mashed)
  app.post(
    "/api/admin/analyst-tables/:id/run-watchdog",
    requireAdmin,
    csrfTokenGuard,
    async (req: Request, res: Response) => {
      const tableId = req.params.id;
      if (tableId !== "capital_raise_benchmarks") {
        return res.status(400).json({
          error: `Watchdog trigger is only available for capital_raise_benchmarks (got ${tableId})`,
        });
      }
      const adminId = req.user?.id;
      if (!adminId) return res.status(401).json({ error: "Authentication required" });

      // Per-admin rate limit: once per minute. The watchdog itself runs
      // the LLM synthesizer, so even a "successful" forced run can cost
      // a non-trivial number of tokens — a 60s cooldown keeps a
      // double-click or accidental F5 storm from compounding spend.
      const wait = takeWatchdogRateSlot(adminId);
      if (wait > 0) {
        const retryAfter = Math.ceil(wait / 1000);
        res.setHeader("Retry-After", String(retryAfter));
        return res.status(429).json({
          error: "RATE_LIMITED",
          // Both `retryAfter` (canonical) and `retryAfterSeconds` (legacy)
          // are returned so existing/older clients keep working while the
          // admin UI reads the canonical key.
          retryAfter,
          retryAfterSeconds: retryAfter,
          message: `Watchdog rate limit: please wait ${retryAfter}s before forcing another run.`,
        });
      }

      try {
        const outcome = await runCapitalRaiseWatchdogCycle({ force: true });
        // The cadence-skipped branch can't fire under force:true today,
        // but defending against future logic changes is cheap.
        if (!outcome.ran) {
          return res.json({
            ran: false,
            reason: outcome.reason,
            nextEligibleAt: outcome.nextEligibleAt,
          });
        }
        logActivity(req, "analyst-table-run-watchdog", "analyst_table", null, tableId, {
          reason: outcome.reason,
          auditId: outcome.result.auditId,
          appliedDimensions: outcome.result.appliedDimensions,
          skippedDimensions: outcome.result.skippedDimensions,
          tokensUsed: outcome.tokensUsed,
          sourceCount: outcome.sourceCount,
        });
        return res.json({
          ran: true,
          reason: outcome.reason,
          tableId: outcome.result.tableId,
          auditId: outcome.result.auditId,
          appliedDimensions: outcome.result.appliedDimensions,
          skippedDimensions: outcome.result.skippedDimensions,
          recordedAt: outcome.result.recordedAt,
          sourceCount: outcome.sourceCount,
          tokensUsed: outcome.tokensUsed,
        });
      } catch (err: unknown) {
        // The rate-limit slot is already spent — that's intentional;
        // a failing watchdog run still consumed LLM time, so we don't
        // hand the admin a "free retry" cookie inside the cooldown.
        logger.error(
          `Forced capital-raise watchdog run failed for adminId=${adminId}: ${String(err)}`,
          "analyst-refresh",
        );
        logAndSendError(res, "Forced watchdog run failed", err);
      }
    },
  );

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
