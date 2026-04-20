import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getAuthUser } from "../auth";
import { requireAdminGuard } from "../middleware/analyst-refresh-guards";
import { logActivity, logAndSendError } from "./helpers";
import { runAnalystScoped } from "../ai/analyst-scoped-runner";
import { storage } from "../storage";
import { logger } from "../logger";

const ANALYST_COOLDOWN_MS = 60 * 1000;

const refreshBodySchema = z.object({
  scope: z.literal("global-assumptions"),
  fields: z.array(z.string().min(1)).max(100).optional(),
});

/**
 * Named handler for POST /api/analyst/refresh. Exported for direct unit
 * testing (mock req/res/runner) without having to stand up the full
 * express app.
 *
 * Cooldown policy: the 60s window is reserved BEFORE the run starts and
 * held REGARDLESS of outcome. Failed runs do NOT release the cooldown —
 * the doctrine is a strict "once every 60s" budget per admin. Rationale:
 * 1) a failing LLM call is expensive and likely to fail again on immediate
 * retry, 2) without the hold, an admin hammering a flaky upstream could
 * rack up cost behind the cooldown's back.
 *
 * Cooldown state lives in the `analyst_cooldowns` table (one row per user)
 * so the policy survives process restarts and is shared across app
 * instances. Recovery path if an admin genuinely needs to retry sooner:
 * delete the row (or, in tests, the `__resetAnalystCooldown` hook below).
 */
export async function analystRefreshHandler(req: Request, res: Response) {
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
  // Single atomic admission step: tryReserveAnalystCooldown either acquires
  // the slot in one DB round-trip or rejects with retryAfterMs. A separate
  // read-then-reserve sequence here would race — two concurrent admin clicks
  // (or two app instances) could both pass a stale read and both run.
  const reservation = await storage.tryReserveAnalystCooldown(
    userId,
    new Date(),
    ANALYST_COOLDOWN_MS,
  );
  if (!reservation.granted) {
    res.setHeader("Retry-After", Math.ceil(reservation.retryAfterMs / 1000).toString());
    return res.status(429).json({
      error: "Analyst is cooling down",
      retryAfterMs: reservation.retryAfterMs,
    });
  }
  // Slot is held. A failure downstream does NOT release it — the doctrine
  // is a strict 60s budget per admin, even against flaky upstreams.

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
    // Failed run — cooldown is HELD (see file-level comment). We log and
    // return a normal error; the next call within 60s will get 429 as
    // designed.
    logger.error(
      `analyst-refresh failed: ${err instanceof Error ? err.message : String(err)}`,
      "analyst-admin",
    );
    return logAndSendError(res, "Analyst refresh failed", err, "analyst-admin");
  }
}

export function register(app: Express) {
  // ────────────────────────────────────────────────────────────
  // POST /api/analyst/refresh
  // Admin-only. Kicks off a scoped Analyst run against the admin's
  // global assumptions (company-level) and returns the fresh guidance.
  // Rate-limited to once per ANALYST_COOLDOWN_MS per user — held across
  // successes AND failures (see handler comment).
  // ────────────────────────────────────────────────────────────
  app.post(
    "/api/analyst/refresh",
    requireAuth,
    requireAdminGuard,
    analystRefreshHandler,
  );
}

/**
 * Test hook — clears the cooldown row(s) so a freshly-installed test starts
 * with no carry-over reservation. Do not call from production code.
 */
export async function __resetAnalystCooldown(userId?: number): Promise<void> {
  await storage.clearAnalystCooldown(userId);
}
