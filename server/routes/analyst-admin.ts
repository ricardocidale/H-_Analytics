import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getAuthUser } from "../auth";
import { requireAdminGuard } from "../middleware/analyst-refresh-guards";
import { logActivity, logAndSendError } from "./helpers";
import { runAnalystScoped } from "../ai/analyst-scoped-runner";
import {
  runFundingSpecialist,
  Tier1UnavailableError,
} from "../ai/specialists/mgmt-co-funding-runner";
import { getCannedLpComparables } from "../ai/specialists/mgmt-co-funding-orchestrator-adapter";
import { withFundingDefaults } from "../finance/apply-funding-defaults";
import type { FundingPromptInputContext } from "../ai/specialists/mgmt-co-funding-prompt-input-builder";
import type { CapitalRaiseInputs } from "../../engine/watchdog/capitalRaiseEvaluator";
import { getFactoryNumber } from "@shared/model-constants-registry";
import { DEFAULT_RUNWAY_NEED_MONTHS_PLACEHOLDER } from "@shared/constants-funding";
import {
  ICP_MODEL_PROFILES,
  type IcpModelTier,
} from "@shared/constants-benchmarks";
import {
  runPropertyRiskIntelligenceSpecialist,
  Tier1UnavailableError as PropertyTier1UnavailableError,
} from "../ai/specialists/property-risk-intelligence-runner";
import type { PropertyRiskIntelligencePromptInputContext } from "../ai/specialists/property-risk-intelligence-prompt";
import type { CountryInflationOutlook } from "../../engine/analyst/surface/property/risk-intelligence-specialist";
import type { ModelConstant } from "@shared/schema";
import { storage } from "../storage";
import { logger } from "../logger";

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
    });
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
      import("../../engine/analyst/registry/specialist-catalog"),
      import("../../engine/analyst/surface/mgmt-co"),
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
    });
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
        return logAndSendError(res, "Funding Specialist failed", err, "analyst-admin");
      }
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
        return res.status(503).json({
          code: "TIER1_UNAVAILABLE",
          message: "The Analyst is temporarily unavailable. Try again in a moment.",
        });
      }
      logger.error(
        `property.risk-intelligence v1 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
        "analyst-admin",
      );
      return logAndSendError(res, "Property Risk Intelligence Specialist failed", err, "analyst-admin");
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

// ────────────────────────────────────────────────────────────────────────────
// G1.5c-v1 — Funding Specialist v1 path
// ────────────────────────────────────────────────────────────────────────────

/**
 * Assemble the v1 deps + invoke `runFundingSpecialist`. Pure orchestration:
 * reads saved state via storage facade, builds the FundingPromptInputContext,
 * and calls the runner. Throws Tier1UnavailableError on any failure (the
 * route handler catches and degrades to Tier-0).
 *
 * v1 deferrals (per .claude/replit-handoffs/g1.5c-v1-funding-specialist.md):
 *   - Live LP comparables → G6-P3 (uses canned dataset for v1)
 *   - Persona resolution → G6-P3 (canonical persona derived from globalAssumptions)
 *   - Verdict cache → G6-P3 (every call is a fresh "miss")
 *   - N+1 panels → G6-P2 (single-shot Anthropic Opus for v1)
 */
async function runFundingV1Path(userId: number) {
  const ga = await storage.getGlobalAssumptions(userId);
  if (!ga) {
    throw new Tier1UnavailableError(
      "globalAssumptions row missing for user",
      null,
    );
  }

  // ICP model gate — require the user to choose a management company scale
  // (A / B / C) before The Analyst can range the Funding tab. Without this,
  // Opus is guessing raise amounts with no anchor. The client renders a
  // model-selection dialog when it sees ICP_MODEL_REQUIRED.
  const icpTier = (ga.icpModelTier ?? null) as IcpModelTier | null;
  if (!icpTier || !ICP_MODEL_PROFILES[icpTier]) {
    return { __icpModelRequired: true, models: ICP_MODEL_PROFILES } as const;
  }
  const icpModel = ICP_MODEL_PROFILES[icpTier];

  // Apply admin-Default overlay (G1.5b cascade) so the runner sees the
  // resolved cascade values, not raw NULLs.
  const overlaidGa = await withFundingDefaults(ga);

  const benchmarks = await storage.getAnalystWatchdogBenchmarks(userId);
  const properties = await storage.getAllProperties(userId);

  // Build CapitalRaiseInputs from the resolved globalAssumptions row. The 5
  // funding columns + the trancheGapMonths derived field cover the inputs.
  const inputs: CapitalRaiseInputs = {
    runwayBufferMonths: overlaidGa.runwayBufferMonths,
    sizingOvershootPct: overlaidGa.sizingOvershootPct,
    trancheGapMonths: deriveTrancheGapMonths(overlaidGa),
    revenueRampDelayMonths: overlaidGa.revenueRampDelayMonths,
    burnFlexDownPct: overlaidGa.burnFlexDownPct,
  };

  // Canonical persona for v1 — derived from globalAssumptions identity
  // hints when present, otherwise sensible defaults. G6-P3 replaces this
  // with full persona resolution.
  const persona: FundingPromptInputContext["persona"] = {
    verticalSlug: "boutique-luxury",
    marketTier: "L+B",
    locale: "US",
  };

  // Portfolio aggregate — count + raise need from the saved Funding-tab amounts.
  // capitalRaise1Amount + capitalRaise2Amount are the actual management-company
  // raise targets saved by the user. sum(purchasePrice) is property acquisition
  // cost — a different quantity entirely (audit finding: data lineage).
  const totalRaiseNeedUsd =
    (overlaidGa.capitalRaise1Amount ?? 0) + (overlaidGa.capitalRaise2Amount ?? 0);
  const portfolio: FundingPromptInputContext["portfolio"] = {
    propertyCount: properties.length,
    totalRaiseNeedUsd,
    runwayNeedMonths: DEFAULT_RUNWAY_NEED_MONTHS_PLACEHOLDER,
  };

  const ctx: FundingPromptInputContext = {
    inputs,
    persona,
    portfolio,
    icpModel,
    priorVerdicts: [], // v1: no composition; G6-P3 wires verdict-cache reads
  };

  const comparables = getCannedLpComparables();

  return runFundingSpecialist(ctx, benchmarks, comparables);
}

// ────────────────────────────────────────────────────────────────────────────
// G1.6-v1 — Property Risk Intelligence Specialist v1 path (Daniela / D)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Assemble context and invoke `runPropertyRiskIntelligenceSpecialist`.
 * Throws `PropertyTier1UnavailableError` on any failure; the route
 * handler catches and returns HTTP 503 (no legacy fallback for property scope).
 *
 * v1 deferrals:
 *   - CountryInflationOutlook: resolved from `model_constants` when
 *     available (requires Isadora / macro-research Specialist to have run);
 *     `null` when no canonical row exists — runner emits developing-conviction.
 *   - Persona: derived from property fields (hospitalityType, marketTier,
 *     country); G6-P3 will enrich with full persona resolution.
 */
async function runPropertyRiskIntelligenceV1Path(
  propertyId: number,
  _userId: number,
) {
  const property = await storage.getProperty(propertyId);
  if (!property) {
    throw new PropertyTier1UnavailableError(
      `Property ${propertyId} not found`,
      null,
    );
  }

  // Resolve CountryInflationOutlook from model_constants (Isadora's domain).
  // Returns null when no canonical row exists — the runner's honest-fail
  // path handles this per the inflation-cascade rule.
  const canonicalRow = await storage.findCanonical(
    "inflationRate",
    property.country ?? null,
    null,
  );
  const countryInflationOutlook = canonicalRow
    ? modelConstantToCountryInflationOutlook(canonicalRow)
    : null;

  // Persona derived from property fields. G6-P3 replaces with full resolver.
  const persona: PropertyRiskIntelligencePromptInputContext["persona"] = {
    verticalSlug: hospitalityTypeToVerticalSlug(property.hospitalityType ?? "hotel"),
    marketTier: (property.marketTier ?? "L+B") as string,
    locale: property.country ?? "US",
  };

  const ctx: PropertyRiskIntelligencePromptInputContext = {
    persona,
    inputs: {
      propertyInflationRate: property.inflationRate ?? null,
      country: property.country ?? undefined,
      city: property.city ?? undefined,
    },
    countryInflationOutlook,
  };

  return runPropertyRiskIntelligenceSpecialist(ctx);
}

/**
 * Map a `model_constants` row to `CountryInflationOutlook`. The row's
 * `value` may be a scalar (single point estimate) or a `{low,mid,high}`
 * range object written by Isadora (the macro-research Specialist).
 * Returns `null` when the value cannot be interpreted as a valid range.
 */
function modelConstantToCountryInflationOutlook(
  row: ModelConstant,
): CountryInflationOutlook | null {
  const val = row.value;
  let low: number, mid: number, high: number;

  if (typeof val === "number" && Number.isFinite(val)) {
    // Single-point constant: collapse to a flat range at the point value.
    low = val;
    mid = val;
    high = val;
  } else if (
    typeof val === "object" &&
    val !== null &&
    "low" in val &&
    "mid" in val &&
    "high" in val
  ) {
    const v = val as { low: unknown; mid: unknown; high: unknown };
    if (
      typeof v.low !== "number" ||
      typeof v.mid !== "number" ||
      typeof v.high !== "number" ||
      !Number.isFinite(v.low) ||
      !Number.isFinite(v.mid) ||
      !Number.isFinite(v.high)
    )
      return null;
    low = v.low;
    mid = v.mid;
    high = v.high;
  } else {
    return null;
  }

  return {
    low,
    mid,
    high,
    source: row.authoritySource ?? "model_constants",
    asOf:
      row.lastEditedAt instanceof Date
        ? row.lastEditedAt.toISOString()
        : String(row.lastEditedAt ?? new Date().toISOString()),
    url: row.authorityRef ?? undefined,
  };
}

/**
 * Map the property's `hospitalityType` string to a persona vertical slug
 * that the Property Risk Intelligence runner understands.
 */
function hospitalityTypeToVerticalSlug(type: string): string {
  const normalized = type.toLowerCase().replace(/[^a-z]/g, "-");
  const knownSlugs: Record<string, string> = {
    hotel: "boutique-luxury",
    "boutique-hotel": "boutique-luxury",
    resort: "boutique-luxury",
    hostel: "budget-independent",
    "bed-and-breakfast": "boutique-luxury",
    "vacation-rental": "short-term-rental",
    motel: "budget-independent",
  };
  return knownSlugs[normalized] ?? "boutique-luxury";
}

/**
 * Derive trancheGapMonths from capitalRaise1Date + capitalRaise2Date when
 * both are present. Mirrors the client form-hook derivation
 * (useCompanyAssumptionsForm.ts:454-456) so the runner sees the same value
 * the user sees on the Funding tab.
 */
function deriveTrancheGapMonths(
  ga: { capitalRaise1Date?: string | Date | null; capitalRaise2Date?: string | Date | null },
): number | null {
  const d1 = ga.capitalRaise1Date ? new Date(ga.capitalRaise1Date).getTime() : NaN;
  const d2 = ga.capitalRaise2Date ? new Date(ga.capitalRaise2Date).getTime() : NaN;
  if (!Number.isFinite(d1) || !Number.isFinite(d2)) return null;
  // Negative gap means Tranche 2 is before Tranche 1 — invalid configuration.
  // Return null (routes to missing-data intent) rather than Math.abs which would
  // silently produce a plausible positive number.
  if (d2 <= d1) return null;
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24 * getFactoryNumber("daysPerMonth")));
}
