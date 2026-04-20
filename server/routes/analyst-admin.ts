import type { Express } from "express";
import { z } from "zod";
import { requireAuth, getAuthUser } from "../auth";
import { requireAdminGuard } from "../middleware/analyst-refresh-guards";
import { logActivity, logAndSendError } from "./helpers";
import { runAnalystScoped } from "../ai/analyst-scoped-runner";
import { logger } from "../logger";

const ANALYST_COOLDOWN_MS = 60 * 1000;

// In-memory per-user cooldown. Source of truth is the `research_runs` table
// (createResearchRun inside the runner writes a durable row), so a process
// restart just resets the in-memory clock to zero — a generous failure mode.
const lastRunByUser = new Map<number, number>();

const refreshBodySchema = z.object({
  scope: z.literal("global-assumptions"),
  fields: z.array(z.string().min(1)).max(100).optional(),
});

export function register(app: Express) {
  // ────────────────────────────────────────────────────────────
  // POST /api/analyst/refresh
  // Admin-only. Kicks off a scoped Analyst run against the admin's
  // global assumptions (company-level) and returns the fresh guidance.
  // Rate-limited to once per ANALYST_COOLDOWN_MS per user.
  // ────────────────────────────────────────────────────────────
  app.post(
    "/api/analyst/refresh",
    requireAuth,
    requireAdminGuard,
    async (req, res) => {
      const parsed = refreshBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request body",
          details: parsed.error.flatten(),
        });
      }
      const { scope, fields } = parsed.data;

      const user = getAuthUser(req);
      const userId = user.id;
      const now = Date.now();
      const last = lastRunByUser.get(userId) ?? 0;
      const elapsed = now - last;
      if (elapsed < ANALYST_COOLDOWN_MS) {
        const retryAfterMs = ANALYST_COOLDOWN_MS - elapsed;
        res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000).toString());
        return res.status(429).json({
          error: "Analyst is cooling down",
          retryAfterMs,
        });
      }
      // Reserve the slot up front so concurrent clicks don't all pass the gate.
      lastRunByUser.set(userId, now);

      try {
        // `scope: "global-assumptions"` from the client maps to the runner's
        // `"company"` scope — same table (`entityType="company"`, entityId=userId),
        // different user-facing vocabulary (admin sees "global", runner speaks
        // the research pipeline's dialect).
        const result = await runAnalystScoped({
          scope: "company",
          userId,
          fields,
        });

        logActivity(
          req,
          "analyst-refresh",
          "company",
          userId,
          "Admin Defaults",
          {
            scope,
            requestedFields: fields?.length ?? 0,
            recordsReturned: result.filteredRecords,
            recordsTotal: result.totalRecords,
            durationMs: result.durationMs,
            runId: result.runId,
          },
        );

        return res.json({
          runId: result.runId,
          durationMs: result.durationMs,
          totalRecords: result.totalRecords,
          filteredRecords: result.filteredRecords,
          guidance: result.guidance,
        });
      } catch (err: unknown) {
        // Failed run — clear the cooldown so the admin can retry immediately.
        lastRunByUser.delete(userId);
        logger.error(
          `analyst-refresh failed: ${err instanceof Error ? err.message : String(err)}`,
          "analyst-admin",
        );
        return logAndSendError(res, "Analyst refresh failed", err, "analyst-admin");
      }
    },
  );
}

/**
 * Test hook — resets the in-memory cooldown map. Do not call from production
 * code.
 */
export function __resetAnalystCooldown() {
  lastRunByUser.clear();
}
