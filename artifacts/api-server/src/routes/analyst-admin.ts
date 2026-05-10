import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getAuthUser } from "../auth";
import { requireAdminGuard } from "../middleware/analyst-refresh-guards";
import { logActivity, logAndSendError } from "./helpers";
import { runAnalystScoped } from "../ai/analyst-scoped-runner";
import { storage } from "../storage";
import { logger } from "../logger";
import { dispatchSpecialist } from "./analyst-admin-dispatch";

const ANALYST_COOLDOWN_MS = 60 * 1000;

const refreshBodySchema = z.object({
  scope: z.enum(["global-assumptions", "property"]),
  /**
   * Required when scope === "property". Identifies which property to
   * evaluate (Daniela / property.risk-intelligence and future property-
   * level Specialists).
   */
  propertyId: z.number().positive().int().optional(),
  fields: z.array(z.string().min(1)).max(100).optional(),
  /**
   * G1.5c-v1 — when set to "mgmt-co.funding", the handler routes through
   * `runFundingSpecialist` (single-shot Opus + careful prompt) instead of
   * the legacy `runAnalystScoped` path.
   * G1.6-v1 (Daniela) — when set to "property.risk-intelligence", the
   * handler routes through `runPropertyRiskIntelligenceSpecialist`.
   * Other Specialists keep the legacy path until their own v1 ships.
   */
  specialistId: z.string().min(1).optional(),
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
    code: "ANLA-010" });
  }
  const { scope, propertyId, fields, specialistId } = parsed.data;

  const user = getAuthUser(req);
  const userId = user.id;

  // catalog hard-required gate. Mirrors the gate on
  // /api/research/generate so a stale or scripted client cannot bypass
  // the admin UI's locked-hard rules. We check BEFORE reserving the
  // 60s cooldown so a missing-field rejection doesn't burn the user's
  // budget. The gate enumerates locked-hard candidate fields across
  // all company-scope Specialists (mgmt-co + portfolio-ops) and
  // verifies them against the user's GlobalAssumptions row.
  // Property-scope requests skip this gate — the property runner
  // performs its own validation and emits honest-fail verdicts on
  // missing fields (per Daniela's Tier-0 fallback design).
  if (scope === "global-assumptions") try {
    const [
      { getLockedHardCandidateFields, SPECIALIST_CATALOG },
      { findMissingRequiredFields },
    ] = await Promise.all([
      import("@engine/analyst/registry/specialist-catalog"),
      import("@engine/analyst/surface/mgmt-co"),
    ]);
    const ga = await storage.getGlobalAssumptions(userId);
    if (ga) {
      const companySpecs = SPECIALIST_CATALOG.filter(
        (s) => s.subject === "mgmt-co" || s.subject === "portfolio-ops",
      );
      const seen = new Set<string>();
      const missingFields: { key: string; label: string; surface: string; surfaceAnchor?: string }[] = [];
      let firstSpecialistId: string | undefined;
      for (const spec of companySpecs) {
        const lockedFields = getLockedHardCandidateFields(spec.id);
        if (lockedFields.length === 0) continue;
        const missingKeys = findMissingRequiredFields(
          ga as unknown as Record<string, unknown>,
          lockedFields.map((f) => f.key),
        );
        for (const key of missingKeys) {
          if (seen.has(key)) continue;
          seen.add(key);
          if (!firstSpecialistId) firstSpecialistId = spec.id;
          const meta = lockedFields.find((f) => f.key === key)!;
          missingFields.push({
            key,
            label: meta.label,
            surface: meta.surface,
            surfaceAnchor: meta.surfaceAnchor,
          });
        }
      }
      if (missingFields.length > 0) {
        return res.status(400).json({
          error: `Required field${missingFields.length === 1 ? "" : "s"} missing on Company Assumptions: ${missingFields
            .map((m) => m.label)
            .join(", ")}. Fill them in before refreshing the Analyst.`,
          code: "REQUIRED_FIELDS_MISSING",
          specialistId: firstSpecialistId ?? "mgmt-co",
          missingFields,
        });
      }
    }
  } catch (gateErr: unknown) {
    // Defense-in-depth: log and fall through if catalog import fails.
    logger.warn(
      `analyst-refresh required-fields gate skipped: ${gateErr instanceof Error ? gateErr.message : String(gateErr)}`,
      "analyst-admin",
    );
  }

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
    code: "ANLA-011" });
  }
  // Slot is held. A failure downstream does NOT release it — the doctrine
  // is a strict 60s budget per admin, even against flaky upstreams.

  // Route named-specialist requests. Returns "handled" (response already
  // sent) or "fallthrough" (continue to legacy runAnalystScoped path).
  const dispatch = await dispatchSpecialist(req, res, {
    specialistId,
    userId,
    propertyId,
    scope,
    fields,
  });
  if (dispatch === "handled") return;

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
    return logAndSendError(res, "Analyst refresh failed", err, "ANLA-009");
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
