import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getAuthUser } from "../auth";
import { requireAdminGuard } from "../middleware/analyst-refresh-guards";
import { logActivity, logAndSendError } from "./helpers";
import { runAnalystScoped } from "../ai/analyst-scoped-runner";
import {
  Tier1UnavailableError,
} from "../ai/specialists/mgmt-co-funding-runner";
import {
  Tier1UnavailableError as RevenueTier1UnavailableError,
} from "../ai/specialists/mgmt-co-revenue-runner";
import {
  Tier1UnavailableError as CompensationTier1UnavailableError,
} from "../ai/specialists/mgmt-co-compensation-runner";
import {
  Tier1UnavailableError as OverheadTier1UnavailableError,
} from "../ai/specialists/mgmt-co-overhead-runner";
import {
  Tier1UnavailableError as CompanyTier1UnavailableError,
} from "../ai/specialists/mgmt-co-company-runner";
import {
  Tier1UnavailableError as PropertyDefaultsTier1UnavailableError,
} from "../ai/specialists/mgmt-co-property-defaults-runner";
import {
  Tier1UnavailableError as PropertyTier1UnavailableError,
} from "../ai/specialists/property-risk-intelligence-runner";
import {
  Tier1UnavailableError as PortfolioRaiseTier1UnavailableError,
} from "../ai/specialists/portfolio-raise-runner";
import { storage } from "../storage";
import { logger } from "../logger";
import { HTTP_503_SERVICE_UNAVAILABLE } from "../constants";
import {
  runFundingV1Path,
  runRevenueV1Path,
  runCompensationV1Path,
  runOverheadV1Path,
  runCompanyV1Path,
  runPropertyDefaultsV1Path,
} from "./analyst-admin-runners-mgmt";
import {
  runPortfolioRaiseV1Path,
  runPropertyRiskIntelligenceV1Path,
} from "./analyst-admin-runners-portfolio";

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

  // G1.5c-v1 — Funding Specialist branch. When the request names the
  // mgmt-co.funding Specialist, route through the v1 single-shot Opus
  // runner instead of the legacy property-research orchestrator. Other
  // scopes keep the legacy path until their own v1 ships.
  if (specialistId === "mgmt-co.funding") {
    try {
      const result = await runFundingV1Path(userId);

      // ICP model required — client must show model-selection dialog
      if ("__icpModelRequired" in result) {
        return res.status(400).json({
          code: "ICP_MODEL_REQUIRED",
          message: "Select a management company model (A / B / C) so The Analyst can range your funding plan.",
          models: result.models,
        });
      }

      const verdict = result;
      logActivity(req, "analyst-refresh", "company", userId, "Mgmt-Co Funding (v1)", {
        scope,
        specialistId,
        cognitiveRunId: verdict.meta.cognitiveRunId,
        tier: verdict.meta.tier,
      });
      return res.json({ verdict });
    } catch (err: unknown) {
      // Tier1UnavailableError → degrade to Tier-0 fallback by falling
      // through to the legacy runAnalystScoped path (which handles
      // company-scope refresh against all Specialists, including funding).
      if (err instanceof Tier1UnavailableError) {
        logger.warn(
          `mgmt-co.funding v1 unavailable; degrading to Tier-0 path: ${err.message}`,
          "analyst-admin",
        );
        // fall through to legacy path below
      } else {
        // Unexpected error — surface it (cooldown remains held per doctrine)
        logger.error(
          `mgmt-co.funding v1 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
          "analyst-admin",
        );
        return logAndSendError(res, "Funding Specialist failed", err, "ANLA-001");
      }
    }
  }

  // G2-v1 — Revenue Specialist branch (mgmt-co.revenue / B).
  // Single-shot Opus runner for the Revenue tab. Falls back to the legacy
  // Tier-0 path (runAnalystScoped) on Tier1UnavailableError — same fallback
  // policy as Funding (mgmt-co.funding).
  if (specialistId === "mgmt-co.revenue") {
    try {
      const verdict = await runRevenueV1Path(userId);
      logActivity(req, "analyst-refresh", "company", userId, "Mgmt-Co Revenue (v1)", {
        scope,
        specialistId,
        cognitiveRunId: verdict.meta.cognitiveRunId,
        tier: verdict.meta.tier,
      });
      return res.json({ verdict });
    } catch (err: unknown) {
      if (err instanceof RevenueTier1UnavailableError) {
        logger.warn(
          `mgmt-co.revenue v1 unavailable; degrading to Tier-0 path: ${err.message}`,
          "analyst-admin",
        );
        // fall through to legacy runAnalystScoped below
      } else {
        logger.error(
          `mgmt-co.revenue v1 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
          "analyst-admin",
        );
        return logAndSendError(res, "Revenue Specialist failed", err, "ANLA-002");
      }
    }
  }

  // G3 — Compensation Specialist branch (mgmt-co.compensation / Mariana / M).
  // N+1 runner (PE + parallel quant/market panels + Opus synthesis + bounded
  // regress). Falls back to the legacy Tier-0 path (runAnalystScoped) on
  // Tier1UnavailableError — same fallback policy as Funding/Revenue.
  if (specialistId === "mgmt-co.compensation") {
    try {
      const verdict = await runCompensationV1Path(userId);
      logActivity(req, "analyst-refresh", "company", userId, "Mgmt-Co Compensation (G3)", {
        scope,
        specialistId,
        cognitiveRunId: verdict.meta.cognitiveRunId,
        tier: verdict.meta.tier,
      });
      return res.json({ verdict });
    } catch (err: unknown) {
      if (err instanceof CompensationTier1UnavailableError) {
        logger.warn(
          `mgmt-co.compensation G3 unavailable; degrading to Tier-0 path: ${err.message}`,
          "analyst-admin",
        );
        // fall through to legacy runAnalystScoped below
      } else {
        logger.error(
          `mgmt-co.compensation G3 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
          "analyst-admin",
        );
        return logAndSendError(res, "Compensation Specialist failed", err, "ANLA-003");
      }
    }
  }

  // P7-B Phase 2 — Overhead Specialist branch (mgmt-co.overhead / Natália / N).
  // N+1 runner (PE + parallel quant/market panels + Opus synthesis + bounded
  // regress). Falls back to the legacy Tier-0 path (runAnalystScoped) on
  // Tier1UnavailableError — same fallback policy as Funding/Revenue/Compensation.
  if (specialistId === "mgmt-co.overhead") {
    try {
      const verdict = await runOverheadV1Path(userId);
      logActivity(req, "analyst-refresh", "company", userId, "Mgmt-Co Overhead (Phase 2)", {
        scope,
        specialistId,
        cognitiveRunId: verdict.meta.cognitiveRunId,
        tier: verdict.meta.tier,
      });
      return res.json({ verdict });
    } catch (err: unknown) {
      if (err instanceof OverheadTier1UnavailableError) {
        logger.warn(
          `mgmt-co.overhead Phase 2 unavailable; degrading to Tier-0 path: ${err.message}`,
          "analyst-admin",
        );
        // fall through to legacy runAnalystScoped below
      } else {
        logger.error(
          `mgmt-co.overhead Phase 2 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
          "analyst-admin",
        );
        return logAndSendError(res, "Overhead Specialist failed", err, "ANLA-004");
      }
    }
  }

  // P7-B Phase 2 — Company Specialist branch (mgmt-co.company / Olívia / O).
  // N+1 runner (PE + parallel quant/market panels + Opus synthesis + bounded
  // regress). Falls back to the legacy Tier-0 path (runAnalystScoped) on
  // CompanyTier1UnavailableError — same fallback policy as Overhead.
  if (specialistId === "mgmt-co.company") {
    try {
      const verdict = await runCompanyV1Path(userId);
      logActivity(req, "analyst-refresh", "company", userId, "Mgmt-Co Company (Phase 2)", {
        scope,
        specialistId,
        cognitiveRunId: verdict.meta.cognitiveRunId,
        tier: verdict.meta.tier,
      });
      return res.json({ verdict });
    } catch (err: unknown) {
      if (err instanceof CompanyTier1UnavailableError) {
        logger.warn(
          `mgmt-co.company Phase 2 unavailable; degrading to Tier-0 path: ${err.message}`,
          "analyst-admin",
        );
        // fall through to legacy runAnalystScoped below
      } else {
        logger.error(
          `mgmt-co.company Phase 2 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
          "analyst-admin",
        );
        return logAndSendError(res, "Company Specialist failed", err, "ANLA-005");
      }
    }
  }

  // P7-B Phase 2 — Property-Defaults Specialist branch (mgmt-co.property-defaults / Paula / P).
  // N+1 runner (PE + parallel quant/market panels + Opus synthesis + bounded
  // regress). Falls back to the legacy Tier-0 path (runAnalystScoped) on
  // PropertyDefaultsTier1UnavailableError — same fallback policy as Company/Overhead.
  if (specialistId === "mgmt-co.property-defaults") {
    try {
      const verdict = await runPropertyDefaultsV1Path(userId);
      logActivity(req, "analyst-refresh", "company", userId, "Mgmt-Co Property Defaults (Phase 2)", {
        scope,
        specialistId,
        cognitiveRunId: verdict.meta.cognitiveRunId,
        tier: verdict.meta.tier,
      });
      return res.json({ verdict });
    } catch (err: unknown) {
      if (err instanceof PropertyDefaultsTier1UnavailableError) {
        logger.warn(
          `mgmt-co.property-defaults Phase 2 unavailable; degrading to Tier-0 path: ${err.message}`,
          "analyst-admin",
        );
        // fall through to legacy runAnalystScoped below
      } else {
        logger.error(
          `mgmt-co.property-defaults Phase 2 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
          "analyst-admin",
        );
        return logAndSendError(res, "Property Defaults Specialist failed", err, "ANLA-006");
      }
    }
  }

  // Portfolio Capital Raise Specialist — portfolio-level LP equity analysis.
  // No Tier-0 fallback (no legacy runner covers this); returns 503 on failure.
  if (specialistId === "portfolio.capital-raise") {
    try {
      const verdict = await runPortfolioRaiseV1Path(userId);
      if ("__noProperties" in verdict) {
        return res.status(400).json({
          code: "NO_PROPERTIES",
          message: "Add at least one investment property to analyze a portfolio capital raise.",
        });
      }
      logActivity(req, "analyst-refresh", "company", userId, "Portfolio Capital Raise (v1)", {
        scope,
        specialistId,
        cognitiveRunId: verdict.meta.cognitiveRunId,
        tier: verdict.meta.tier,
      });
      return res.json({ verdict });
    } catch (err: unknown) {
      if (err instanceof PortfolioRaiseTier1UnavailableError) {
        logger.warn(
          `portfolio.capitalRaise v1 unavailable; returning Tier-0 honest-fail: ${err.message}`,
          "analyst-admin",
        );
        return res.status(HTTP_503_SERVICE_UNAVAILABLE).json({
          code: "TIER1_UNAVAILABLE",
          message: "The Analyst is temporarily unavailable. Try again in a moment.",
        });
      }
      logger.error(
        `portfolio.capitalRaise v1 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
        "analyst-admin",
      );
      return logAndSendError(res, "Portfolio Capital Raise Specialist failed", err, "ANLA-007");
    }
  }

  // G1.6-v1 — Property Risk Intelligence Specialist branch (Daniela / D).
  // When the request names property.risk-intelligence, route through the
  // v1 single-shot Opus runner. Property-scope requests that don't match a
  // known Specialist fall through to the 400 below (no legacy fallback for
  // property scope — there is no company-level scoped runner for properties).
  if (specialistId === "property.risk-intelligence") {
    if (!propertyId) {
      return res.status(400).json({
        error: "propertyId is required for property.risk-intelligence",
        code: "MISSING_PROPERTY_ID",
      });
    }
    try {
      const verdict = await runPropertyRiskIntelligenceV1Path(propertyId, userId);
      logActivity(req, "analyst-refresh", "property", userId, "Property Risk Intelligence (v1)", {
        scope,
        specialistId,
        propertyId,
        cognitiveRunId: verdict.meta.cognitiveRunId,
        tier: verdict.meta.tier,
      });
      return res.json({ verdict });
    } catch (err: unknown) {
      if (err instanceof PropertyTier1UnavailableError) {
        logger.warn(
          `property.risk-intelligence v1 unavailable; returning Tier-0 honest-fail: ${err.message}`,
          "analyst-admin",
        );
        // No legacy fallback for property scope. Return a structured
        // "unavailable" response so the client shows the empty state +
        // "Ask the Analyst" CTA rather than a hard error.
        return res.status(HTTP_503_SERVICE_UNAVAILABLE).json({
          code: "TIER1_UNAVAILABLE",
          message: "The Analyst is temporarily unavailable. Try again in a moment.",
        });
      }
      logger.error(
        `property.risk-intelligence v1 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
        "analyst-admin",
      );
      return logAndSendError(res, "Property Risk Intelligence Specialist failed", err, "ANLA-008");
    }
  }

  // Property-scope requests that don't name a known Specialist have no
  // legacy runner to fall back to. Return 400 rather than silently running
  // the company-scope legacy path on a property request.
  if (scope === "property") {
    return res.status(400).json({
      error: "Unknown specialistId for property scope",
      code: "UNKNOWN_SPECIALIST",
    });
  }

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
