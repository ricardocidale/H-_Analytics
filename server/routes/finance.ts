import { Router, type Request, type Response } from "express";
import { z } from "zod";
import superjson from "superjson";
import { computePortfolioProjection, computePortfolioProjectionWithAudit, computeSingleProperty, computeCompanyProjection } from "../finance/service";
import { computeSensitivityAnalysis } from "../finance/sensitivity";
import { getCacheStatus, invalidateComputeCache, resetCacheStats, computeCacheKey } from "../finance/cache";
import { requireAuth, requireAdmin, isApiRateLimited, getAuthUser } from "../auth";
import { logger } from "../logger";
import { storage } from "../storage";
import type { PropertyInput, GlobalInput } from "@engine/types";
import type { AuditTrailPerProperty } from "../finance/service";

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
  costRateRooms: z.number(),
  costRateFB: z.number(),
  costRateAdmin: z.number(),
  costRateMarketing: z.number(),
  costRatePropertyOps: z.number(),
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
  id: z.number().optional(),
  name: z.string().optional(),
}).passthrough();

const globalInputSchema = z.object({
  modelStartDate: z.string(),
  projectionYears: z.number().optional(),
  companyOpsStartDate: z.string().optional(),
  fiscalYearStartMonth: z.number().optional(),
  inflationRate: z.number(),
  companyInflationRate: z.number().optional(),
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

const computeRequestSchema = z.object({
  properties: z.array(propertyInputSchema).min(1),
  globalAssumptions: globalInputSchema,
  projectionYears: z.number().int().positive().max(30).optional(),
});

const singlePropertyComputeSchema = z.object({
  property: propertyInputSchema,
  globalAssumptions: globalInputSchema,
  projectionYears: z.number().int().positive().max(30).optional(),
});

function sendSuperjson(res: Response, data: unknown): void {
  const serialized = superjson.serialize(data);
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

export function registerFinanceRoutes(router: Router): void {
  router.post("/api/finance/compute", requireAuth, async (req: Request, res: Response) => {
    try {
      if (isApiRateLimited(getAuthUser(req).id, "finance-compute", 10)) {
        return res.status(429).json({ error: "Rate limit exceeded. Please wait before computing again." });
      }
      const validation = computeRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validation.error.issues.map(i => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const { properties, globalAssumptions, projectionYears } = validation.data;
      const wantAudit = req.query.audit === "true";

      const { result, auditTrails } = computePortfolioProjectionWithAudit(
        {
          properties: properties as PropertyInput[],
          globalAssumptions: globalAssumptions as GlobalInput,
          projectionYears,
        },
        wantAudit,
      );

      if (wantAudit && auditTrails.length > 0) {
        const userId = getAuthUser(req).id;
        const scenarioId = typeof req.body.scenarioId === "number" ? req.body.scenarioId : 0;
        const inputHash = computeCacheKey({
          properties: properties as PropertyInput[],
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

      return sendSuperjson(res, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Server computation failed";
      logger.error(`Compute error: ${message}`, "finance");
      return res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Server computation failed" : message });
    }
  });

  router.post("/api/finance/property/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const routeId = Number(req.params.id);
      if (!Number.isFinite(routeId) || routeId <= 0) {
        return res.status(400).json({ error: "Invalid property ID in route" });
      }

      const validation = singlePropertyComputeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validation.error.issues.map(i => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const { property, globalAssumptions, projectionYears } = validation.data;

      if (property.id !== undefined && property.id !== routeId) {
        return res.status(400).json({ error: "Property ID in body does not match route" });
      }

      const result = computeSingleProperty({
        property: property as PropertyInput,
        globalAssumptions: globalAssumptions as GlobalInput,
        projectionYears,
      });

      res.setHeader("X-Finance-Engine-Version", result.engineVersion);
      res.setHeader("X-Finance-Output-Hash", result.outputHash);
      if (result.cached) res.setHeader("X-Finance-Cache-Hit", "true");

      return sendSuperjson(res, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Property computation failed";
      logger.error(`Property compute error: ${message}`, "finance");
      return res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Property computation failed" : message });
    }
  });

  router.post("/api/finance/company", requireAuth, async (req: Request, res: Response) => {
    try {
      const validation = computeRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validation.error.issues.map(i => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const { properties, globalAssumptions, projectionYears } = validation.data;

      const result = computeCompanyProjection({
        properties: properties as PropertyInput[],
        globalAssumptions: globalAssumptions as GlobalInput,
        projectionYears,
      });

      res.setHeader("X-Finance-Engine-Version", result.engineVersion);
      res.setHeader("X-Finance-Output-Hash", result.outputHash);
      if (result.cached) res.setHeader("X-Finance-Cache-Hit", "true");

      return sendSuperjson(res, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Company computation failed";
      logger.error(`Company compute error: ${message}`, "finance");
      return res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Company computation failed" : message });
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
        return res.status(429).json({ error: "Rate limit exceeded. Please wait before running sensitivity analysis again." });
      }

      const parsed = sensitivityRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
      }

      const userId = getAuthUser(req).id;
      const result = await computeSensitivityAnalysis(userId, parsed.data.propertyId ?? "all");
      return res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sensitivity computation failed";
      logger.error(`Sensitivity compute error: ${message}`, "finance");
      if (message.includes("No global assumptions") || message.includes("No matching properties")) {
        return res.status(422).json({ error: message });
      }
      return res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Sensitivity computation failed" : message });
    }
  });
}
