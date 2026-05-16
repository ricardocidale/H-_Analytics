import { Router, type Request, type Response } from "express";
import { z } from "zod";
import superjson from "superjson";
import ExcelJS from "exceljs";
import {
  recomputePortfolioWithAuditAndStamp,
  recomputeSinglePropertyAndStamp,
  recomputeCompanyAndStamp,
} from "../finance/recompute";
import { aggregateUnifiedByYear } from "@engine/aggregation/yearlyAggregator";
import { computeExitScenarios, DEFAULT_EXIT_HORIZONS } from "@calc/analysis/exit-scenarios";
import { getAcquisitionYear, calculateLoanParams } from "@engine/debt/loanCalculations";
import type { LoanParams, GlobalLoanParams } from "@engine/debt/loanCalculations";
import { computeSensitivityAnalysis } from "../finance/sensitivity";
import { withModelConstants } from "../finance/apply-model-constants";
import { withNationalBenchmarks, withPropertyCostAnchors } from "../finance/apply-national-benchmarks";
import { withFinancialHydration } from "../defaults";
import { getCacheStatus, invalidateComputeCache, resetCacheStats, computeCacheKey } from "../finance/cache";
import { requireAuth, requireAdmin, isApiRateLimited, getAuthUser } from "../auth";
import { logger } from "../logger";
import { storage } from "../storage";
import { parseRouteId } from "./helpers";
import {
  HTTP_400_BAD_REQUEST,
  HTTP_422_UNPROCESSABLE_ENTITY,
  HTTP_429_TOO_MANY_REQUESTS,
  HTTP_500_INTERNAL_SERVER_ERROR,
} from "../constants";
import type { PropertyInput, GlobalInput, MonthlyFinancials } from "@engine/types";
import type { BracketMixEntry, IcpBracketProfile } from "@engine/company/icp-bracket-types";
import { normalizePersistedBracketMix } from "../finance/normalize-bracket-mix";
import { getEffectivePropertyView } from "@workspace/db";

// Task #1407 (Milestone B) — accessor wrapper applied at every engine entry
// point in this file. Resolves each catalogued descriptor to its effective
// (As-Improved ?? As-Purchased) value so the engine never sees the raw
// pre-renovation envelope when an As-Improved value has been set.
function applyDescriptorView<T extends Record<string, unknown>>(p: T): T {
  return getEffectivePropertyView(p) as T;
}

import type { AuditTrailPerProperty } from "../finance/service";
import { computeIRR } from "@analytics/returns/irr";
import { propertyEquityInvested } from "@engine/debt/equityCalculations";
import { computeWaterfall } from "@calc/analysis/waterfall";
import type { WaterfallOutput } from "@calc/analysis/waterfall";
import { DEFAULT_ROUNDING } from "@calc/shared/utils";
import {
  DEFAULT_PREFERRED_RETURN,
  DEFAULT_LP_EQUITY_PCT,
  DEFAULT_WATERFALL_TIERS,
} from "@shared/constants-research";
import { getMarketRate } from "../data/marketRates";

const TRANSFER_TAX_KEYS = [
  "transfer_tax_default", "transfer_tax_us", "transfer_tax_mexico",
  "transfer_tax_netherlands", "transfer_tax_uk", "transfer_tax_france", "transfer_tax_spain",
  "transfer_tax_state_florida", "transfer_tax_state_new_york", "transfer_tax_state_california",
  "transfer_tax_state_texas", "transfer_tax_state_hawaii", "transfer_tax_state_washington",
  "transfer_tax_state_pennsylvania", "transfer_tax_state_illinois",
  "transfer_tax_state_massachusetts", "transfer_tax_state_colorado",
] as const;

const propertyInputSchema = z.object({
  operationsStartDate: z.string(),
  acquisitionDate: z.string().optional(),
  roomCount: z.number().int().positive(),
  startAdr: z.number().positive(),
  adrGrowthRate: z.number(),
  startOccupancy: z.number().min(0).max(1),
  maxOccupancy: z.number().min(0).max(1),
  occupancyRampMonths: z.number().int().min(1),
  occupancyGrowthStep: z.number(),
  purchasePrice: z.number().nonnegative(),
  buildingImprovements: z.number().nullable().optional(),
  landValuePercent: z.number().nullable().optional(),
  type: z.string(),
  acquisitionLTV: z.number().nullable().optional(),
  acquisitionInterestRate: z.number().nullable().optional(),
  acquisitionTermYears: z.number().nullable().optional(),
  taxRate: z.number().nullable().optional(),
  inflationRate: z.number().nullable().optional(),
  willRefinance: z.string().nullable().optional(),
  refinanceDate: z.string().nullable().optional(),
  refinanceLTV: z.number().nullable().optional(),
  refinanceInterestRate: z.number().nullable().optional(),
  refinanceTermYears: z.number().nullable().optional(),
  refinanceClosingCostRate: z.number().nullable().optional(),
  exitCapRate: z.number().nullable().optional(),
  dispositionCommission: z.number().nullable().optional(),
  operatingReserve: z.number().nullable().optional(),
  refinanceYearsAfterAcquisition: z.number().nullable().optional(),
  // Task #1484: nullable so national-benchmark overlay can distinguish "not
  // explicitly set" (null → anchor from Gaetano feed) from "user override"
  // (number → preserved). Other cost rates stay required (no feed mapping).
  costRateRooms: z.number().nullable().optional(),
  costRateFB: z.number().nullable().optional(),
  costRateAdmin: z.number(),
  costRateMarketing: z.number(),
  costRatePropertyOps: z.number().nullable().optional(),
  costRateUtilities: z.number(),
  costRateTaxes: z.number(),
  costRateIT: z.number(),
  costRateFFE: z.number(),
  costRateOther: z.number(),
  costRateInsurance: z.number(),
  revShareEvents: z.number(),
  revShareFB: z.number(),
  revShareOther: z.number(),
  cateringBoostPercent: z.number().optional(),
  baseManagementFeeRate: z.number().optional(),
  incentiveManagementFeeRate: z.number().optional(),
  feeCategories: z.array(z.object({
    name: z.string(),
    rate: z.number(),
    isActive: z.boolean(),
    serviceMarkup: z.number().nullable().optional(),
  })).optional(),
  arDays: z.number().nullable().optional(),
  apDays: z.number().nullable().optional(),
  reinvestmentRate: z.number().nullable().optional(),
  dayCountConvention: z.string().nullable().optional(),
  escalationMethod: z.string().nullable().optional(),
  costSegEnabled: z.boolean().nullable().optional(),
  costSeg5yrPct: z.number().nullable().optional(),
  costSeg7yrPct: z.number().nullable().optional(),
  costSeg15yrPct: z.number().nullable().optional(),
  depreciationYears: z.number().nullable().optional(),
  // Property descriptors + As-Improved twins (Milestone B, task #1406).
  description: z.string().nullable().optional(),
  descriptionPurchased: z.string().nullable().optional(),
  fbVenues: z.number().nullable().optional(),
  fbSeats: z.number().nullable().optional(),
  eventSpaceSqft: z.number().nullable().optional(),
  totalBuildingSqft: z.number().nullable().optional(),
  fbVenuesImproved: z.number().nullable().optional(),
  fbSeatsImproved: z.number().nullable().optional(),
  eventSpaceSqftImproved: z.number().nullable().optional(),
  totalBuildingSqftImproved: z.number().nullable().optional(),
  plannedReopeningYear: z.number().int().nullable().optional(),
  descriptionImproved: z.string().nullable().optional(),
  id: z.number().optional(),
  name: z.string().optional(),
  // Waterfall / LP-GP capital structure (ADR-011)
  lpEquityPct: z.number().min(0).max(1).nullable().optional(),
  catchUpRate: z.number().min(0).max(1).nullable().optional(),
  catchUpToGpPct: z.number().min(0).max(1).nullable().optional(),
}).passthrough();

const globalInputSchema = z.object({
  modelStartDate: z.string(),
  projectionYears: z.number().optional(),
  companyOpsStartDate: z.string().optional(),
  fiscalYearStartMonth: z.number().optional(),
  inflationRate: z.number(),
  companyInflationRate: z.number().nullish(),
  fixedCostEscalationRate: z.number().optional(),
  marketingRate: z.number(),
  debtAssumptions: z.object({
    interestRate: z.number(),
    amortizationYears: z.number(),
    acqLTV: z.number().optional(),
    refiLTV: z.number().optional(),
    refiClosingCostRate: z.number().optional(),
  }),
}).passthrough();

const bracketMixEntrySchema = z.object({
  bracketSlug: z.string(),
  weight: z.number().min(0).max(1),
});

const computeRequestSchema = z.object({
  properties: z.array(propertyInputSchema).min(1),
  globalAssumptions: globalInputSchema,
  projectionYears: z.number().int().positive().max(30).optional(),
  scenarioId: z.number().int().nonnegative().optional().default(0),
  // Optional override for the company-level bracket mix. When provided, the
  // server uses it instead of the persisted mix in global_assumptions —
  // letting the ICP page preview revenue impact of a proposed mix without
  // saving it. Only honored by /api/finance/company.
  bracketMix: z.array(bracketMixEntrySchema).optional(),
});

const singlePropertyComputeSchema = z.object({
  property: propertyInputSchema,
  globalAssumptions: globalInputSchema,
  projectionYears: z.number().int().positive().max(30).optional(),
});

/**
 * Recursively replace NaN and Infinity with null so JSON.stringify
 * doesn't silently drop them or produce invalid JSON.
 */
function sanitizeNumbers(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "number") {
    return Number.isFinite(obj) ? obj : null;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeNumbers);
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = sanitizeNumbers(value);
    }
    return result;
  }
  return obj;
}

function sendSuperjson(res: Response, data: unknown): void {
  const safe = sanitizeNumbers(data);
  const serialized = superjson.serialize(safe);
  res.setHeader("X-Superjson", "true");
  res.json(serialized);
}

interface AuditPersistMeta {
  scenarioId: number;
  userId: number;
  engineVersion: string;
  inputHash: string;
  outputHash: string;
  opinion: string;
}

async function persistAuditTrails(trails: AuditTrailPerProperty[], meta: AuditPersistMeta): Promise<void> {
  const startTime = Date.now();
  for (const trail of trails) {
    await storage.saveCalcAuditLog({
      scenarioId: meta.scenarioId,
      propertyId: trail.propertyId ?? 0,
      userId: meta.userId,
      engineVersion: meta.engineVersion,
      inputHash: meta.inputHash,
      outputHash: meta.outputHash,
      auditOpinion: meta.opinion,
      durationMs: Date.now() - startTime,
      totalSteps: trail.totalSteps,
      logEntries: trail.entries,
    });
  }
}

// ── Returns Summary ───────────────────────────────────────────────────────────
// Computed server-side so all IRR figures use the canonical aggregateUnifiedByYear
// path. The client renders these values directly without re-running the solver.

interface PropertyReturnMetrics {
  propertyKey: string;
  propertyId: number | null;
  irr: number | null;
  equityMultiple: number;
  cashOnCash: number;
  equityInvested: number;
  exitValue: number;
  netCashFlowsByYear: number[];
  // preferred_return_amount/shortfall are single-period approximations (totalEquity × preferred_return for 1 year, not multi-year accrual)
  waterfallResult: WaterfallOutput | null;
}

interface ReturnsSummary {
  portfolio: {
    irr: number | null;
    equityMultiple: number;
    cashOnCash: number;
    totalEquityInvested: number;
    totalExitValue: number;
    netCashFlowsByYear: number[];
  };
  properties: PropertyReturnMetrics[];
}

function buildPropertyKey(property: PropertyInput, index: number): string {
  if (property.id != null) return `property_${property.id}`;
  const name = (property as unknown as Record<string, unknown>).name ?? `Property_${index + 1}`;
  return `${name as string}__idx${index}`;
}

function computeReturnsSummary(
  properties: PropertyInput[],
  globalAssumptions: GlobalInput,
  perPropertyMonthly: Record<string, MonthlyFinancials[]>,
  projectionYears: number,
): ReturnsSummary {
  const perPropertyResults: PropertyReturnMetrics[] = [];
  const consolidatedFlows = new Array<number>(projectionYears).fill(0);
  const consolidatedAtcf = new Array<number>(projectionYears).fill(0);
  let totalEquityInvested = 0;
  let totalExitValue = 0;

  for (let i = 0; i < properties.length; i++) {
    const property = properties[i];
    const key = buildPropertyKey(property, i);
    const monthly = perPropertyMonthly[key] ?? [];

    const unified = aggregateUnifiedByYear(
      monthly,
      property as LoanParams,
      globalAssumptions as GlobalLoanParams,
      projectionYears,
    );

    const netFlows = Array.from({ length: projectionYears }, (_, y) =>
      unified.yearlyCF[y]?.netCashFlowToInvestors ?? 0,
    );
    const atcfFlows = Array.from({ length: projectionYears }, (_, y) =>
      unified.yearlyCF[y]?.atcf ?? 0,
    );
    const exitVal = unified.yearlyCF[projectionYears - 1]?.exitValue ?? 0;
    const equity = propertyEquityInvested(property);

    let waterfallResult: WaterfallOutput | null = null;
    if (equity > 0) {
      try {
        const lpEquityPct = property.lpEquityPct ?? DEFAULT_LP_EQUITY_PCT;
        const tiers =
          Array.isArray(property.waterfallTiers) && property.waterfallTiers.length > 0
            ? property.waterfallTiers
            : DEFAULT_WATERFALL_TIERS;
        const distributable = Array.from({ length: projectionYears }, (_, y) =>
          Math.max(0, unified.yearlyCF[y]?.atcf ?? 0) +
          (unified.yearlyCF[y]?.refinancingProceeds ?? 0) +
          (unified.yearlyCF[y]?.exitValue ?? 0),
        );
        waterfallResult = computeWaterfall({
          total_equity_invested: equity,
          lp_equity: equity * lpEquityPct,
          gp_equity: equity * (1 - lpEquityPct),
          distributable_cash_flows: distributable,
          preferred_return: property.ownerPriorityReturn ?? DEFAULT_PREFERRED_RETURN,
          tiers,
          catch_up_rate: property.catchUpRate ?? undefined,
          catch_up_to_gp_pct: property.catchUpToGpPct ?? undefined,
          rounding_policy: DEFAULT_ROUNDING,
        });
      } catch (err) {
        logger.warn(
          `Waterfall computation failed for property ${property.id}: ${err instanceof Error ? err.message : String(err)}`,
          "finance",
        );
      }
    }

    for (let y = 0; y < projectionYears; y++) {
      consolidatedFlows[y] += netFlows[y];
      consolidatedAtcf[y] += atcfFlows[y];
    }
    totalEquityInvested += equity;
    totalExitValue += exitVal;

    const hasPositiveFlow = netFlows.some(cf => cf > 0);
    const hasNegativeFlow = netFlows.some(cf => cf < 0);
    let propertyIRR: number | null = null;
    if (hasPositiveFlow && hasNegativeFlow) {
      const irrResult = computeIRR(netFlows, 1);
      propertyIRR = irrResult.irr_periodic ?? null;
    }

    const propTotalCash = netFlows.reduce((sum, cf) => sum + cf, 0);
    const propEquityMultiple = equity > 0 ? (propTotalCash + equity) / equity : 0;
    const propAvgAtcf = atcfFlows.reduce((sum, cf) => sum + cf, 0) / projectionYears;
    const propCashOnCash = equity > 0 ? (propAvgAtcf / equity) * 100 : 0;

    perPropertyResults.push({
      propertyKey: key,
      propertyId: property.id ?? null,
      irr: propertyIRR,
      equityMultiple: propEquityMultiple,
      cashOnCash: propCashOnCash,
      equityInvested: equity,
      exitValue: exitVal,
      netCashFlowsByYear: netFlows,
      waterfallResult,
    });
  }

  const hasPositivePortfolio = consolidatedFlows.some(cf => cf > 0);
  const hasNegativePortfolio = consolidatedFlows.some(cf => cf < 0);
  let portfolioIRR: number | null = null;
  if (hasPositivePortfolio && hasNegativePortfolio) {
    const irrResult = computeIRR(consolidatedFlows, 1);
    portfolioIRR = irrResult.irr_periodic ?? null;
  }

  const portfolioTotalCash = consolidatedFlows.reduce((sum, cf) => sum + cf, 0);
  const portfolioEquityMultiple =
    totalEquityInvested > 0 ? (portfolioTotalCash + totalEquityInvested) / totalEquityInvested : 0;
  const portfolioAvgAtcf = consolidatedAtcf.reduce((sum, cf) => sum + cf, 0) / projectionYears;
  const portfolioCashOnCash =
    totalEquityInvested > 0 ? (portfolioAvgAtcf / totalEquityInvested) * 100 : 0;

  return {
    portfolio: {
      irr: portfolioIRR,
      equityMultiple: portfolioEquityMultiple,
      cashOnCash: portfolioCashOnCash,
      totalEquityInvested,
      totalExitValue,
      netCashFlowsByYear: consolidatedFlows,
    },
    properties: perPropertyResults,
  };
}

export function registerFinanceRoutes(router: Router): void {
  router.post("/api/finance/compute", requireAuth, async (req: Request, res: Response) => {
    try {
      if (isApiRateLimited(getAuthUser(req).id, "finance-compute", 10)) {
        return res.status(HTTP_429_TOO_MANY_REQUESTS).json({ error: "Rate limit exceeded. Please wait before computing again.", code: "FIN-001" });
      }
      const validation = computeRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({
          error: "Invalid input",
          details: validation.error.issues.map(i => ({
            path: i.path.join("."),
            message: i.message,
          code: "FIN-007" })),
        });
      }

      const { properties: allProperties, globalAssumptions: rawGlobal, projectionYears, bracketMix: bracketMixOverride } = validation.data;
      // Overlay admin-governed Model Constants (e.g. daysPerMonth) on top of
      // whatever the client sent. Server is authoritative — admin overrides
      // always win, even against a stale client payload.
      const globalAssumptions = await withModelConstants(rawGlobal);
      // Defense-in-depth: exclude inactive properties even if client already filtered
      const properties = allProperties
        .filter((p: Record<string, unknown>) => p.isActive !== false)
        .map((p: Record<string, unknown>) => applyDescriptorView(p));

      // Warn (don't block) if properties have unvalidated assumptions
      const propertyIds = properties.map((p: Record<string, unknown>) => p.id).filter((id): id is number => typeof id === "number");
      if (propertyIds.length > 0) {
        try {
          const dbProps = await Promise.all(propertyIds.map(id => storage.getProperty(id)));
          const unvalidated = dbProps.filter(p => p && p.validationStatus === "pending_validation");
          if (unvalidated.length > 0) {
            logger.warn(
              `Computing financials with ${unvalidated.length} unvalidated properties: ${unvalidated.map(p => p!.name).join(", ")}`,
              "finance",
            );
          }
        } catch (_err: unknown) {
          // Don't block computation if validation check itself fails
        }
      }
      const wantAudit = req.query.audit === "true";

      // Load service templates for company cost-of-services calculation
      const allTemplates = await storage.getAllServiceTemplates();
      const rawServiceTemplates = allTemplates.map(t => ({
        id: t.id,
        name: t.name,
        defaultRate: (v => Number.isFinite(v) ? v : 0)(Number(t.defaultRate)),
        serviceModel: t.serviceModel as "centralized" | "direct",
        serviceMarkup: (v => Number.isFinite(v) ? v : 0)(Number(t.serviceMarkup)),
        isActive: t.isActive,
        sortOrder: t.sortOrder ?? 0,
      }));
      // Task #1415: overlay national vendor cost / Mgmt Co markup benchmarks
      // (Pietro/Gaetano/Renato feeds) onto the per-template `serviceMarkup`.
      // Falls back to hardcoded national anchors when the DB tables are empty.
      const serviceTemplates = await withNationalBenchmarks(rawServiceTemplates);

      // Task #1484: overlay national vendor cost percentages onto the three
      // property cost rates that have a direct service-line counterpart
      // (housekeeping→costRateRooms, maintenance→costRatePropertyOps,
      //  food_beverage→costRateFB). Only null/undefined slots are filled —
      // explicit numeric values from the client are preserved as-is.
      // Falls back to hardcoded national anchors when the DB table is empty.
      const propertiesWithCostAnchors = await withFinancialHydration(
        await withPropertyCostAnchors(properties),
      );

      // Resolve the bracket mix: explicit request-body override (used by the
      // ICP page to preview the impact of a proposed mix on partner take-home
      // and portfolio IRR) wins over the persisted mix in global_assumptions.
      // enrichWithBrackets in recompute.ts will load the matching icp_brackets
      // rows. Non-fatal: if the DB fetch fails, the engine runs without
      // bracket scaling rather than blocking the projection.
      let portfolioBracketMix: BracketMixEntry[] | undefined;
      let portfolioBrackets: IcpBracketProfile[] | undefined;
      if (bracketMixOverride && bracketMixOverride.length > 0) {
        portfolioBracketMix = bracketMixOverride as BracketMixEntry[];
      } else {
        try {
          const ga = await storage.getGlobalAssumptions(getAuthUser(req).id);
          const rawMix = (ga as Record<string, unknown>)?.bracketMix;
          const normalized = normalizePersistedBracketMix(rawMix);
          if (normalized) {
            portfolioBracketMix = normalized.bracketMix;
            if (normalized.brackets) portfolioBrackets = normalized.brackets;
          }
        } catch (mixErr: unknown) {
          logger.warn(
            `Failed to load bracketMix for portfolio compute: ${mixErr instanceof Error ? mixErr.message : String(mixErr)}`,
            "finance",
          );
        }
      }

      // Engine recompute + DB freshness stamp travel together — see
      // server/finance/recompute.ts. Adding a new compute entrypoint
      // means using the wrapper, never the raw engine function.
      const { result, auditTrails } = await recomputePortfolioWithAuditAndStamp(
        {
          properties: propertiesWithCostAnchors as unknown as PropertyInput[],
          globalAssumptions: globalAssumptions as GlobalInput,
          projectionYears,
          serviceTemplates,
          bracketMix: portfolioBracketMix,
          brackets: portfolioBrackets,
        },
        wantAudit,
      );

      if (wantAudit && auditTrails.length > 0) {
        const userId = getAuthUser(req).id;
        const scenarioId = validation.data.scenarioId ?? 0;
        const inputHash = computeCacheKey({
          properties: properties as unknown as PropertyInput[],
          globalAssumptions: globalAssumptions as GlobalInput,
          projectionYears,
        });

        persistAuditTrails(auditTrails, {
          scenarioId,
          userId,
          engineVersion: result.engineVersion,
          inputHash,
          outputHash: result.outputHash,
          opinion: result.validationSummary.opinion,
        }).catch((err: unknown) => {
          logger.error(`Audit trail persist failed: ${err instanceof Error ? err.message : String(err)}`, "finance");
        });
      }

      res.setHeader("X-Finance-Engine-Version", result.engineVersion);
      res.setHeader("X-Finance-Output-Hash", result.outputHash);
      if (result.cached) res.setHeader("X-Finance-Cache-Hit", "true");
      // Note: `propertyIds` is referenced above for the unvalidated-warning
      // log; the freshness stamp itself is applied inside
      // `recomputePortfolioWithAuditAndStamp` so the engine output and
      // the DB stamp travel as one unit.
      void propertyIds;

      // Compute IRR / equity-multiple / cash-on-cash server-side using the
      // canonical aggregateUnifiedByYear path. The client reads these values
      // directly and does not re-run the IRR solver.
      const returnsSummary = computeReturnsSummary(
        propertiesWithCostAnchors as unknown as PropertyInput[],
        globalAssumptions as GlobalInput,
        result.perPropertyMonthly,
        result.projectionYears,
      );

      return sendSuperjson(res, { ...result, returnsSummary });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Server computation failed";
      logger.error(`Compute error: ${message}`, "finance");
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: process.env.NODE_ENV === "production" ? "Server computation failed" : message });
    }
  });

  router.post("/api/finance/property/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const routeId = parseRouteId(req.params.id);
      if (!routeId) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID in route", code: "FIN-002" });
      }

      const validation = singlePropertyComputeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({
          error: "Invalid input",
          details: validation.error.issues.map(i => ({
            path: i.path.join("."),
            message: i.message,
          code: "FIN-008" })),
        });
      }

      const { property, globalAssumptions: rawGlobal, projectionYears } = validation.data;

      if (property.id !== undefined && property.id !== routeId) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Property ID in body does not match route", code: "FIN-003" });
      }

      // Overlay admin-governed Model Constants before engine call.
      const globalAssumptions = await withModelConstants(rawGlobal);

      // Task #1484: overlay national cost-rate anchors onto the three nullable
      // property cost rates before the engine runs.
      const [propertyWithCostAnchors] = await withFinancialHydration(
        await withPropertyCostAnchors([
          applyDescriptorView({ ...property, id: routeId } as Record<string, unknown>),
        ]),
      );

      // Engine recompute + DB freshness stamp travel together — see
      // server/finance/recompute.ts.
      const stampedProperty = propertyWithCostAnchors as unknown as PropertyInput;
      const result = await recomputeSinglePropertyAndStamp({
        property: stampedProperty,
        globalAssumptions: globalAssumptions as GlobalInput,
        projectionYears,
      });

      // Compute waterfall split for the single property using the same logic as
      // computeReturnsSummary. Attached to the result so PropertyDetail can render
      // the LP/GP economics panel without a second request.
      let singlePropertyWaterfallResult: WaterfallOutput | null = null;
      const singleEquity = propertyEquityInvested(stampedProperty);
      if (singleEquity > 0) {
        try {
          const resolvedYears = result.projectionYears;
          const unified = aggregateUnifiedByYear(
            result.monthly,
            stampedProperty as LoanParams,
            globalAssumptions as GlobalLoanParams,
            resolvedYears,
          );
          const lpEquityPct = stampedProperty.lpEquityPct ?? DEFAULT_LP_EQUITY_PCT;
          const tiers =
            Array.isArray(stampedProperty.waterfallTiers) && stampedProperty.waterfallTiers.length > 0
              ? stampedProperty.waterfallTiers
              : DEFAULT_WATERFALL_TIERS;
          const distributable = Array.from({ length: resolvedYears }, (_, y) =>
            Math.max(0, unified.yearlyCF[y]?.atcf ?? 0) +
            (unified.yearlyCF[y]?.refinancingProceeds ?? 0) +
            (unified.yearlyCF[y]?.exitValue ?? 0),
          );
          singlePropertyWaterfallResult = computeWaterfall({
            total_equity_invested: singleEquity,
            lp_equity: singleEquity * lpEquityPct,
            gp_equity: singleEquity * (1 - lpEquityPct),
            distributable_cash_flows: distributable,
            preferred_return: stampedProperty.ownerPriorityReturn ?? DEFAULT_PREFERRED_RETURN,
            tiers,
            catch_up_rate: stampedProperty.catchUpRate ?? undefined,
            catch_up_to_gp_pct: stampedProperty.catchUpToGpPct ?? undefined,
            rounding_policy: DEFAULT_ROUNDING,
          });
        } catch (err) {
          logger.warn(
            `Waterfall computation failed for property ${routeId}: ${err instanceof Error ? err.message : String(err)}`,
            "finance",
          );
        }
      }

      res.setHeader("X-Finance-Engine-Version", result.engineVersion);
      res.setHeader("X-Finance-Output-Hash", result.outputHash);
      if (result.cached) res.setHeader("X-Finance-Cache-Hit", "true");

      return sendSuperjson(res, { ...result, waterfallResult: singlePropertyWaterfallResult });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Property computation failed";
      logger.error(`Property compute error: ${message}`, "finance");
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: process.env.NODE_ENV === "production" ? "Property computation failed" : message });
    }
  });

  /**
   * POST /api/finance/property/:id/exit-scenarios — Task #807.
   *
   * Returns a 3 × 4 matrix (Pessimistic/Base/Optimistic × 3/5/7/10 yrs) of
   * exit outcomes plus per-scenario breakeven hold and an early-exit-risk
   * callout. Reuses the cached engine recompute so the math underneath is
   * identical to the rest of PropertyDetail. The math itself lives in
   * `calc/analysis/exit-scenarios.ts` (pure module, fully unit-tested).
   */
  router.post("/api/finance/property/:id/exit-scenarios", requireAuth, async (req: Request, res: Response) => {
    try {
      const routeId = parseRouteId(req.params.id);
      if (!routeId) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID in route", code: "FIN-004" });
      }

      const validation = singlePropertyComputeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({
          error: "Invalid input",
          details: validation.error.issues.map(i => ({ path: i.path.join("."), message: i.message , code: "FIN-009" })),
        });
      }

      const { property, globalAssumptions: rawGlobal, projectionYears } = validation.data;
      if (property.id !== undefined && property.id !== routeId) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Property ID in body does not match route", code: "FIN-005" });
      }

      const globalAssumptions = await withModelConstants(rawGlobal);
      const [stampedBase] = await withFinancialHydration([
        applyDescriptorView({ ...property, id: routeId } as Record<string, unknown>),
      ]);
      const stamped = stampedBase as unknown as PropertyInput;

      // Reuse the cached engine output for this property.
      const compute = await recomputeSinglePropertyAndStamp({
        property: stamped,
        globalAssumptions: globalAssumptions as GlobalInput,
        projectionYears,
      });

      // Re-derive the per-year cash-flow-to-investors series. The single
      // property compute returns yearly IS only; the unified aggregator
      // gives us the matching CF rows without re-running the engine.
      const stampedLoanProps = stamped as unknown as Parameters<typeof calculateLoanParams>[0];
      const unified = aggregateUnifiedByYear(
        compute.monthly,
        stampedLoanProps,
        globalAssumptions as GlobalInput,
        compute.projectionYears,
      );

      const loan = calculateLoanParams(stampedLoanProps, globalAssumptions as GlobalInput);
      const acquisitionYear = getAcquisitionYear(loan);

      const transferTaxRateRows = await Promise.all(TRANSFER_TAX_KEYS.map(k => getMarketRate(k)));
      const transferTaxRates: Record<string, number> = {};
      for (let i = 0; i < TRANSFER_TAX_KEYS.length; i++) {
        const row = transferTaxRateRows[i];
        if (row?.value != null) transferTaxRates[TRANSFER_TAX_KEYS[i]] = row.value / 100;
      }

      const exitScenarios = computeExitScenarios({
        property: stamped as unknown as Parameters<typeof computeExitScenarios>[0]["property"],
        global: globalAssumptions as GlobalInput,
        yearlyNoi: unified.yearlyIS.map(y => y.noi),
        netCashFlowToInvestors: unified.yearlyCF.map(y => y.netCashFlowToInvestors),
        acquisitionYear,
        horizons: [...DEFAULT_EXIT_HORIZONS],
        transferTaxRates,
      });

      res.setHeader("X-Finance-Engine-Version", compute.engineVersion);
      res.setHeader("X-Finance-Output-Hash", compute.outputHash);
      if (compute.cached) res.setHeader("X-Finance-Cache-Hit", "true");

      return sendSuperjson(res, {
        engineVersion: compute.engineVersion,
        computedAt: compute.computedAt,
        outputHash: compute.outputHash,
        projectionYears: compute.projectionYears,
        exitScenarios,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Exit scenarios computation failed";
      logger.error(`Exit scenarios error: ${message}`, "finance");
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: process.env.NODE_ENV === "production" ? "Exit scenarios computation failed" : message });
    }
  });

  router.post("/api/finance/company", requireAuth, async (req: Request, res: Response) => {
    try {
      const validation = computeRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({
          error: "Invalid input",
          details: validation.error.issues.map(i => ({
            path: i.path.join("."),
            message: i.message,
          code: "FIN-010" })),
        });
      }

      const { properties: allCompanyProps, globalAssumptions: rawGlobal, projectionYears, bracketMix: bracketMixOverride } = validation.data;
      // Overlay admin-governed Model Constants before engine call.
      const globalAssumptions = await withModelConstants(rawGlobal);
      // Defense-in-depth: exclude inactive properties even if client already filtered
      const properties = allCompanyProps
        .filter((p: Record<string, unknown>) => p.isActive !== false)
        .map((p: Record<string, unknown>) => applyDescriptorView(p));

      // Load service templates for company cost-of-services calculation
      const allTemplates = await storage.getAllServiceTemplates();
      const rawServiceTemplates = allTemplates.map(t => ({
        id: t.id,
        name: t.name,
        defaultRate: (v => Number.isFinite(v) ? v : 0)(Number(t.defaultRate)),
        serviceModel: t.serviceModel as "centralized" | "direct",
        serviceMarkup: (v => Number.isFinite(v) ? v : 0)(Number(t.serviceMarkup)),
        isActive: t.isActive,
        sortOrder: t.sortOrder ?? 0,
      }));
      // Task #1415: overlay national vendor cost / Mgmt Co markup benchmarks
      // (Pietro/Gaetano/Renato feeds) onto the per-template `serviceMarkup`.
      // Falls back to hardcoded national anchors when the DB tables are empty.
      const serviceTemplates = await withNationalBenchmarks(rawServiceTemplates);

      // Resolve bracket mix: explicit request-body override (used by the ICP
      // page to preview the impact of an unsaved mix) wins over the
      // persisted mix in global_assumptions. Non-fatal if the DB fetch fails.
      let companyBracketMix: BracketMixEntry[] | undefined;
      let companyBrackets: IcpBracketProfile[] | undefined;
      if (bracketMixOverride && bracketMixOverride.length > 0) {
        companyBracketMix = bracketMixOverride as BracketMixEntry[];
      } else {
        try {
          const ga = await storage.getGlobalAssumptions(getAuthUser(req).id);
          const rawMix = (ga as Record<string, unknown>)?.bracketMix;
          const normalized = normalizePersistedBracketMix(rawMix);
          if (normalized) {
            companyBracketMix = normalized.bracketMix;
            if (normalized.brackets) companyBrackets = normalized.brackets;
          }
        } catch (mixErr: unknown) {
          logger.warn(
            `Failed to load bracketMix for company compute: ${mixErr instanceof Error ? mixErr.message : String(mixErr)}`,
            "finance",
          );
        }
      }

      // Task #1484: apply cost anchors for company-wide recompute.
      const propertiesWithCostAnchors = await withFinancialHydration(
        await withPropertyCostAnchors(properties),
      );

      // Engine recompute + DB freshness stamp travel together — see
      // server/finance/recompute.ts.
      const result = await recomputeCompanyAndStamp({
        properties: propertiesWithCostAnchors as unknown as PropertyInput[],
        globalAssumptions: globalAssumptions as GlobalInput,
        projectionYears,
        serviceTemplates,
        bracketMix: companyBracketMix,
        brackets: companyBrackets,
      });

      res.setHeader("X-Finance-Engine-Version", result.engineVersion);
      res.setHeader("X-Finance-Output-Hash", result.outputHash);
      if (result.cached) res.setHeader("X-Finance-Cache-Hit", "true");

      return sendSuperjson(res, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Company computation failed";
      logger.error(`Company compute error: ${message}`, "finance");
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: process.env.NODE_ENV === "production" ? "Company computation failed" : message });
    }
  });

  // ── Raw Engine → XLSX Export ──────────────────────────────────────────────────
  // GET /api/finance/compute/export?projectionYears=10
  // Produces a clean Excel workbook from live engine output — no report compiler.
  // One sheet per property (revenue, NOI, ANOI, debt service, cash flow, occ%, ADR)
  // + a Portfolio Summary sheet (IRR, equity multiple, per-property table).
  router.get("/api/finance/compute/export", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getAuthUser(req).id;
      const rawYears = Number(req.query.projectionYears);
      const projectionYears = Number.isFinite(rawYears) && rawYears >= 1 && rawYears <= 30 ? rawYears : 10;

      const [rawProperties, rawGlobal] = await Promise.all([
        storage.getAllProperties(userId),
        storage.getGlobalAssumptions(userId),
      ]);

      if (!rawGlobal) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({ error: "No global assumptions found", code: "FEXP-001" });
      }

      const activeProps = (rawProperties as unknown as (PropertyInput & { id?: number; isActive?: boolean; name?: string })[])
        .filter(p => p.isActive !== false);

      if (!activeProps.length) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({ error: "No active properties found", code: "FEXP-002" });
      }

      const globalAssumptions = await withModelConstants(rawGlobal as unknown as GlobalInput) as unknown as GlobalInput;
      const allTemplates = await storage.getAllServiceTemplates();
      const rawServiceTemplates = allTemplates.map(t => ({
        id: t.id,
        name: t.name,
        defaultRate: (v => Number.isFinite(v) ? v : 0)(Number(t.defaultRate)),
        serviceModel: t.serviceModel as "centralized" | "direct",
        serviceMarkup: (v => Number.isFinite(v) ? v : 0)(Number(t.serviceMarkup)),
        isActive: t.isActive,
        sortOrder: t.sortOrder ?? 0,
      }));
      const serviceTemplates = await withNationalBenchmarks(rawServiceTemplates);
      const propertiesWithCostAnchors = await withFinancialHydration(
        await withPropertyCostAnchors(activeProps as unknown as Record<string, unknown>[]),
      );

      // Resolve bracket mix (non-fatal)
      let portfolioBracketMix: BracketMixEntry[] | undefined;
      let portfolioBrackets: IcpBracketProfile[] | undefined;
      try {
        const ga = await storage.getGlobalAssumptions(userId);
        const rawMix = (ga as Record<string, unknown>)?.bracketMix;
        const normalized = normalizePersistedBracketMix(rawMix);
        if (normalized) {
          portfolioBracketMix = normalized.bracketMix;
          if (normalized.brackets) portfolioBrackets = normalized.brackets;
        }
      } catch { /* non-fatal — runs without bracket scaling */ }

      const { result } = await recomputePortfolioWithAuditAndStamp(
        {
          properties: propertiesWithCostAnchors as unknown as PropertyInput[],
          globalAssumptions: globalAssumptions as GlobalInput,
          projectionYears,
          serviceTemplates,
          bracketMix: portfolioBracketMix,
          brackets: portfolioBrackets,
        },
        false,
      );

      const returnsSummary = computeReturnsSummary(
        propertiesWithCostAnchors as unknown as PropertyInput[],
        globalAssumptions as GlobalInput,
        result.perPropertyMonthly,
        result.projectionYears,
      );

      // ── Build workbook ──────────────────────────────────────────────────────
      // Excel display layout constants (non-financial)
      const XLSX_SHEET_NAME_MAX = 31;     // Excel sheet name character limit
      const XLSX_COL_LABEL_W = 34;        // Summary sheet: label column width
      const XLSX_COL_VALUE_W = 16;        // Summary sheet: value column width
      const XLSX_COL_WIDE_W = 18;         // Summary sheet: wide value column width
      const XLSX_COL_PROP_LABEL_W = 30;   // Property sheet: row-label column width
      const XLSX_COL_PROP_DATA_W = 14;    // Property sheet: yearly data column width
      const XLSX_FONT_TITLE_SIZE = 14;    // Title font size

      const wb = new ExcelJS.Workbook();
      wb.creator = "H+ Analytics";

      const yearLabels = Array.from({ length: result.projectionYears }, (_, i) => `Year ${i + 1}`);
      const pct = (v: number | null) => (v != null ? `${(v * 100).toFixed(1)}%` : "N/A");
      const usd = (v: number) => Math.round(v);

      // --- Portfolio Summary sheet ---
      const sumWs = wb.addWorksheet("Portfolio Summary");
      sumWs.columns = [
        { width: XLSX_COL_LABEL_W },
        { width: XLSX_COL_VALUE_W },
        { width: XLSX_COL_WIDE_W },
        { width: XLSX_COL_VALUE_W },
        { width: XLSX_COL_VALUE_W },
      ];
      sumWs.addRow(["H+ Analytics — Portfolio Export"]).font = { bold: true, size: XLSX_FONT_TITLE_SIZE };
      sumWs.addRow(["Generated:", new Date().toISOString().slice(0, 10)]);
      sumWs.addRow(["Projection Years:", result.projectionYears]);
      sumWs.addRow([]);
      const pf = returnsSummary.portfolio;
      sumWs.addRow(["Portfolio IRR:", pct(pf.irr)]);
      sumWs.addRow(["Equity Multiple:", `${pf.equityMultiple.toFixed(2)}x`]);
      sumWs.addRow(["Total Equity Invested:", usd(pf.totalEquityInvested)]);
      sumWs.addRow(["Total Exit Value:", usd(pf.totalExitValue)]);
      sumWs.addRow([]);
      const hdr = sumWs.addRow(["Property", "IRR", "Equity Invested", "Exit Value", "Equity Multiple"]);
      hdr.font = { bold: true };
      for (const pp of returnsSummary.properties) {
        const propObj = activeProps.find(p => p.id === pp.propertyId);
        const name = propObj?.name ?? `Property ${pp.propertyId}`;
        sumWs.addRow([name, pct(pp.irr), usd(pp.equityInvested), usd(pp.exitValue), `${pp.equityMultiple.toFixed(2)}x`]);
      }

      // --- Per-property sheets ---
      for (let i = 0; i < activeProps.length; i++) {
        const prop = activeProps[i];
        const key = buildPropertyKey(prop as unknown as PropertyInput, i);
        const yearly = result.perPropertyYearly[key] ?? [];
        const name = prop.name ?? `Property ${i + 1}`;
        const ws = wb.addWorksheet(`${i + 1}. ${name}`.substring(0, XLSX_SHEET_NAME_MAX));

        ws.columns = [{ width: XLSX_COL_PROP_LABEL_W }, ...yearLabels.map(() => ({ width: XLSX_COL_PROP_DATA_W }))];

        const addHdr = (label: string) => {
          const r = ws.addRow([label, ...yearLabels]);
          r.font = { bold: true };
          return r;
        };
        const addNumRow = (label: string, vals: number[]) => ws.addRow([label, ...vals.map(usd)]);
        const addPctRow = (label: string, vals: number[]) => ws.addRow([label, ...vals.map(v => pct(v))]);

        addHdr(name);
        ws.addRow([]);
        addNumRow("Revenue", yearly.map(y => y.revenueTotal ?? 0));
        addNumRow("GOP (Gross Operating Income)", yearly.map(y => y.gop ?? 0));
        addNumRow("NOI", yearly.map(y => y.noi ?? 0));
        addNumRow("ANOI (after FFE reserve)", yearly.map(y => y.anoi ?? 0));
        ws.addRow([]);
        addNumRow("Debt Service", yearly.map(y => y.debtPayment ?? 0));
        addNumRow("Cash Flow", yearly.map(y => y.cashFlow ?? 0));
        ws.addRow([]);
        addPctRow("Occupancy %", yearly.map(y => y.availableRooms > 0 ? y.soldRooms / y.availableRooms : 0));
        addNumRow("ADR ($)", yearly.map(y => y.cleanAdr ?? 0));
        addNumRow("Sold Rooms", yearly.map(y => Math.round(y.soldRooms ?? 0)));
        addHdr(""); // spacer
      }

      const buffer = Buffer.from(await wb.xlsx.writeBuffer());
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="hplus-portfolio-export.xlsx"');
      return res.send(buffer);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      logger.error(`Finance export error: ${message}`, "finance");
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: process.env.NODE_ENV === "production" ? "Export failed" : message });
    }
  });

  router.get("/api/finance/cache-status", requireAuth, async (_req: Request, res: Response) => {
    return res.json(getCacheStatus());
  });

  router.post("/api/finance/invalidate", requireAdmin, async (_req: Request, res: Response) => {
    invalidateComputeCache();
    resetCacheStats();
    return res.json({ success: true, message: "Compute cache invalidated" });
  });

  router.get("/api/finance/health", (_req: Request, res: Response) => {
    const cacheInfo = getCacheStatus();
    return res.json({
      status: "ok",
      engineVersion: "1.0.0",
      capabilities: ["portfolio-projection", "single-property", "identity-validation", "lru-cache", "sensitivity"],
      cache: {
        entries: cacheInfo.size,
        hitRate: cacheInfo.hitRate,
      },
    });
  });

  // ── Sensitivity Analysis ─────────────────────────────────────────────────────
  // POST /api/finance/sensitivity
  // Runs tornado (14 scenarios) + heatmap (25 scenarios) server-side.
  // The client keeps only the 2 interactive slider runs (base + adjusted) local.
  const sensitivityRequestSchema = z.object({
    propertyId: z.union([z.literal("all"), z.number().int().positive()]).optional().default("all"),
  });

  router.post("/api/finance/sensitivity", requireAuth, async (req: Request, res: Response) => {
    try {
      if (isApiRateLimited(getAuthUser(req).id, "finance-sensitivity", 10)) {
        return res.status(HTTP_429_TOO_MANY_REQUESTS).json({ error: "Rate limit exceeded. Please wait before running sensitivity analysis again.", code: "FIN-006" });
      }

      const parsed = sensitivityRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid input", details: parsed.error.issues , code: "FIN-011" });
      }

      const userId = getAuthUser(req).id;
      const result = await computeSensitivityAnalysis(userId, parsed.data.propertyId ?? "all");
      return res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sensitivity computation failed";
      logger.error(`Sensitivity compute error: ${message}`, "finance");
      if (message.includes("No global assumptions") || message.includes("No matching properties")) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({ error: message });
      }
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: process.env.NODE_ENV === "production" ? "Sensitivity computation failed" : message });
    }
  });
}
