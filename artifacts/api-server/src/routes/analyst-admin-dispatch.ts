import type { Request, Response } from "express";
import { logActivity, logAndSendError } from "./helpers";
import { logger } from "../logger";
import { HTTP_503_SERVICE_UNAVAILABLE } from "../constants";
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

interface DispatchOpts {
  specialistId: string | undefined;
  userId: number;
  propertyId: number | undefined;
  scope: "global-assumptions" | "property";
  fields: string[] | undefined;
}

/**
 * Routes a named specialist request to its v1 runner and sends the HTTP
 * response. Returns "handled" when a response has been sent (caller must
 * return). Returns "fallthrough" when no branch matched — caller should
 * continue to the legacy runAnalystScoped path.
 *
 * Branches that degrade on Tier1UnavailableError fall through instead of
 * responding so the legacy Tier-0 path can service the request. Branches
 * with no legacy fallback (portfolio, property) return 503 directly.
 */
export async function dispatchSpecialist(
  req: Request,
  res: Response,
  { specialistId, userId, propertyId, scope, fields: _fields }: DispatchOpts,
): Promise<"handled" | "fallthrough"> {

  // G1.5c-v1 — Funding Specialist (mgmt-co.funding)
  if (specialistId === "mgmt-co.funding") {
    try {
      const result = await runFundingV1Path(userId);
      if ("__icpModelRequired" in result) {
        res.status(400).json({
          code: "ICP_MODEL_REQUIRED",
          message: "Select a management company model (A / B / C) so The Analyst can range your funding plan.",
          models: result.models,
        });
        return "handled";
      }
      logActivity(req, "analyst-refresh", "company", userId, "Mgmt-Co Funding (v1)", {
        scope, specialistId,
        cognitiveRunId: result.meta.cognitiveRunId,
        tier: result.meta.tier,
      });
      res.json({ verdict: result });
      return "handled";
    } catch (err: unknown) {
      if (err instanceof Tier1UnavailableError) {
        logger.warn(`mgmt-co.funding v1 unavailable; degrading to Tier-0 path: ${err.message}`, "analyst-admin");
        return "fallthrough";
      }
      logger.error(`mgmt-co.funding v1 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`, "analyst-admin");
      logAndSendError(res, "Funding Specialist failed", err, "ANLA-001");
      return "handled";
    }
  }

  // G2-v1 — Revenue Specialist (mgmt-co.revenue)
  if (specialistId === "mgmt-co.revenue") {
    try {
      const verdict = await runRevenueV1Path(userId);
      logActivity(req, "analyst-refresh", "company", userId, "Mgmt-Co Revenue (v1)", {
        scope, specialistId, cognitiveRunId: verdict.meta.cognitiveRunId, tier: verdict.meta.tier,
      });
      res.json({ verdict });
      return "handled";
    } catch (err: unknown) {
      if (err instanceof RevenueTier1UnavailableError) {
        logger.warn(`mgmt-co.revenue v1 unavailable; degrading to Tier-0 path: ${err.message}`, "analyst-admin");
        return "fallthrough";
      }
      logger.error(`mgmt-co.revenue v1 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`, "analyst-admin");
      logAndSendError(res, "Revenue Specialist failed", err, "ANLA-002");
      return "handled";
    }
  }

  // G3 — Compensation Specialist (mgmt-co.compensation / Mariana / M)
  if (specialistId === "mgmt-co.compensation") {
    try {
      const verdict = await runCompensationV1Path(userId);
      logActivity(req, "analyst-refresh", "company", userId, "Mgmt-Co Compensation (G3)", {
        scope, specialistId, cognitiveRunId: verdict.meta.cognitiveRunId, tier: verdict.meta.tier,
      });
      res.json({ verdict });
      return "handled";
    } catch (err: unknown) {
      if (err instanceof CompensationTier1UnavailableError) {
        logger.warn(`mgmt-co.compensation G3 unavailable; degrading to Tier-0 path: ${err.message}`, "analyst-admin");
        return "fallthrough";
      }
      logger.error(`mgmt-co.compensation G3 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`, "analyst-admin");
      logAndSendError(res, "Compensation Specialist failed", err, "ANLA-003");
      return "handled";
    }
  }

  // P7-B Phase 2 — Overhead Specialist (mgmt-co.overhead / Natália / N)
  if (specialistId === "mgmt-co.overhead") {
    try {
      const verdict = await runOverheadV1Path(userId);
      logActivity(req, "analyst-refresh", "company", userId, "Mgmt-Co Overhead (Phase 2)", {
        scope, specialistId, cognitiveRunId: verdict.meta.cognitiveRunId, tier: verdict.meta.tier,
      });
      res.json({ verdict });
      return "handled";
    } catch (err: unknown) {
      if (err instanceof OverheadTier1UnavailableError) {
        logger.warn(`mgmt-co.overhead Phase 2 unavailable; degrading to Tier-0 path: ${err.message}`, "analyst-admin");
        return "fallthrough";
      }
      logger.error(`mgmt-co.overhead Phase 2 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`, "analyst-admin");
      logAndSendError(res, "Overhead Specialist failed", err, "ANLA-004");
      return "handled";
    }
  }

  // P7-B Phase 2 — Company Specialist (mgmt-co.company / Olívia / O)
  if (specialistId === "mgmt-co.company") {
    try {
      const verdict = await runCompanyV1Path(userId);
      logActivity(req, "analyst-refresh", "company", userId, "Mgmt-Co Company (Phase 2)", {
        scope, specialistId, cognitiveRunId: verdict.meta.cognitiveRunId, tier: verdict.meta.tier,
      });
      res.json({ verdict });
      return "handled";
    } catch (err: unknown) {
      if (err instanceof CompanyTier1UnavailableError) {
        logger.warn(`mgmt-co.company Phase 2 unavailable; degrading to Tier-0 path: ${err.message}`, "analyst-admin");
        return "fallthrough";
      }
      logger.error(`mgmt-co.company Phase 2 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`, "analyst-admin");
      logAndSendError(res, "Company Specialist failed", err, "ANLA-005");
      return "handled";
    }
  }

  // P7-B Phase 2 — Property-Defaults Specialist (mgmt-co.property-defaults / Paula / P)
  if (specialistId === "mgmt-co.property-defaults") {
    try {
      const verdict = await runPropertyDefaultsV1Path(userId);
      logActivity(req, "analyst-refresh", "company", userId, "Mgmt-Co Property Defaults (Phase 2)", {
        scope, specialistId, cognitiveRunId: verdict.meta.cognitiveRunId, tier: verdict.meta.tier,
      });
      res.json({ verdict });
      return "handled";
    } catch (err: unknown) {
      if (err instanceof PropertyDefaultsTier1UnavailableError) {
        logger.warn(`mgmt-co.property-defaults Phase 2 unavailable; degrading to Tier-0 path: ${err.message}`, "analyst-admin");
        return "fallthrough";
      }
      logger.error(`mgmt-co.property-defaults Phase 2 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`, "analyst-admin");
      logAndSendError(res, "Property Defaults Specialist failed", err, "ANLA-006");
      return "handled";
    }
  }

  // Portfolio Capital Raise Specialist — no Tier-0 fallback; returns 503 on failure
  if (specialistId === "portfolio.capital-raise") {
    try {
      const verdict = await runPortfolioRaiseV1Path(userId);
      if ("__noProperties" in verdict) {
        res.status(400).json({
          code: "NO_PROPERTIES",
          message: "Add at least one investment property to analyze a portfolio capital raise.",
        });
        return "handled";
      }
      logActivity(req, "analyst-refresh", "company", userId, "Portfolio Capital Raise (v1)", {
        scope, specialistId, cognitiveRunId: verdict.meta.cognitiveRunId, tier: verdict.meta.tier,
      });
      res.json({ verdict });
      return "handled";
    } catch (err: unknown) {
      if (err instanceof PortfolioRaiseTier1UnavailableError) {
        logger.warn(`portfolio.capitalRaise v1 unavailable; returning Tier-0 honest-fail: ${err.message}`, "analyst-admin");
        res.status(HTTP_503_SERVICE_UNAVAILABLE).json({
          code: "TIER1_UNAVAILABLE",
          message: "The Analyst is temporarily unavailable. Try again in a moment.",
        });
        return "handled";
      }
      logger.error(`portfolio.capitalRaise v1 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`, "analyst-admin");
      logAndSendError(res, "Portfolio Capital Raise Specialist failed", err, "ANLA-007");
      return "handled";
    }
  }

  // G1.6-v1 — Property Risk Intelligence Specialist (Daniela / D)
  // No Tier-0 fallback for property scope; returns 503 on unavailability.
  if (specialistId === "property.risk-intelligence") {
    if (!propertyId) {
      res.status(400).json({
        error: "propertyId is required for property.risk-intelligence",
        code: "MISSING_PROPERTY_ID",
      });
      return "handled";
    }
    try {
      const verdict = await runPropertyRiskIntelligenceV1Path(propertyId, userId);
      logActivity(req, "analyst-refresh", "property", userId, "Property Risk Intelligence (v1)", {
        scope, specialistId, propertyId,
        cognitiveRunId: verdict.meta.cognitiveRunId,
        tier: verdict.meta.tier,
      });
      res.json({ verdict });
      return "handled";
    } catch (err: unknown) {
      if (err instanceof PropertyTier1UnavailableError) {
        logger.warn(`property.risk-intelligence v1 unavailable; returning Tier-0 honest-fail: ${err.message}`, "analyst-admin");
        res.status(HTTP_503_SERVICE_UNAVAILABLE).json({
          code: "TIER1_UNAVAILABLE",
          message: "The Analyst is temporarily unavailable. Try again in a moment.",
        });
        return "handled";
      }
      logger.error(`property.risk-intelligence v1 failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`, "analyst-admin");
      logAndSendError(res, "Property Risk Intelligence Specialist failed", err, "ANLA-008");
      return "handled";
    }
  }

  // Property-scope requests that don't name a known Specialist have no
  // legacy runner to fall back to. Return 400 rather than silently running
  // the company-scope legacy path on a property request.
  if (scope === "property") {
    res.status(400).json({
      error: "Unknown specialistId for property scope",
      code: "UNKNOWN_SPECIALIST",
    });
    return "handled";
  }

  return "fallthrough";
}
