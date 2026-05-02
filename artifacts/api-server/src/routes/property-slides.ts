/**
 * property-slides.ts
 *
 * Pre-generated per-property PPTX decks stored in R2 and tracked in DB.
 *
 * Routes:
 *   GET  /api/slides/status                     — all-properties status list
 *   GET  /api/properties/:id/slides/status      — single-property status
 *   POST /api/properties/:id/slides/generate    — admin: trigger (re)generation
 *   GET  /api/properties/:id/slides             — download from R2 (requireAuth)
 *
 * Flow on generate:
 *   1. Mark status = 'generating' immediately (returns 202)
 *   2. Background: assemble data → Python → upload to R2 → mark ready
 *   3. On error: mark status = 'error' with message
 *
 * Download: streams the stored PPTX from R2. Returns 409 if not yet generated.
 */

import { Router, type Request, type Response } from "express";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { sql } from "drizzle-orm";
import { requireAuth, requireAdmin, getAuthUser } from "../auth";
import { logger } from "../logger";
import { storage } from "../storage";
import { db } from "../db";
import { getStorageProvider } from "../providers/storage";
import { recomputeSinglePropertyAndStamp } from "../finance/recompute";
import { aggregateUnifiedByYear } from "@engine/aggregation/yearlyAggregator";
import { calculateLoanParams, getAcquisitionYear } from "@engine/debt/loanCalculations";
import { withModelConstants } from "../finance/apply-model-constants";
import { computeIRR } from "@analytics/returns/irr";
import { generatePropertyVisionText } from "../ai/property-vision";
import { parseRouteId } from "./helpers";
import {
  HTTP_400_BAD_REQUEST,
  HTTP_409_CONFLICT,
  HTTP_500_INTERNAL_SERVER_ERROR,
} from "../constants";
import type { PropertyInput, GlobalInput } from "@engine/types";

const router = Router();

const SCRIPT_PATH = path.resolve(
  __dirname,
  "../../../../scripts/src/generate_property_slides.py",
);
const PYTHON_TIMEOUT_MS = 120_000;
const MAX_PHOTOS = 8;
const SIBLING_LIMIT = 4;
const PROJ_YEARS_DEFAULT = 5;
const PROJ_YEARS_MIN = 3;
const PROJ_YEARS_MAX = 10;

const SLIDE_ERROR_MSG_MAX_LENGTH = 500;
const SLIDES_DEFAULT_INFLATION_RATE = 0.03;
const SLIDES_DEFAULT_MARKETING_RATE = 0.01;
const SLIDES_DEFAULT_INTEREST_RATE = 0.065;
const SLIDES_DEFAULT_AMORTIZATION_YEARS = 25;
const SLIDES_DEFAULT_MAX_OCCUPANCY = 0.70;
const SLIDES_DEFAULT_EXIT_CAP_RATE = 0.07;

// R2 key pattern for stored PPTX files
const slideR2Key = (propertyId: number) => `slides/property-${propertyId}.pptx`;

// ── DB helpers ─────────────────────────────────────────────────────────────

interface SlideRow {
  property_id: number;
  status: string;
  r2_key: string | null;
  file_size_bytes: number | null;
  generated_at: Date | null;
  triggered_by: string | null;
  error_message: string | null;
  updated_at: Date;
}

async function getSlideRow(propertyId: number): Promise<SlideRow | null> {
  const rows = await db.execute(
    sql`SELECT * FROM property_slide_decks WHERE property_id = ${propertyId}`,
  );
  return (rows.rows[0] as unknown as SlideRow | undefined) ?? null;
}

/**
 * Atomically transition a row to status='generating'.
 * Returns true if the transition succeeded, false if already generating.
 * Uses a conditional UPSERT so concurrent requests cannot both win.
 */
async function tryMarkGenerating(
  propertyId: number,
  triggeredBy: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO property_slide_decks (property_id, status, triggered_by, error_message, updated_at)
    VALUES (${propertyId}, 'generating', ${triggeredBy}, null, NOW())
    ON CONFLICT (property_id) DO UPDATE SET
      status       = 'generating',
      triggered_by = EXCLUDED.triggered_by,
      error_message = null,
      updated_at   = NOW()
    WHERE property_slide_decks.status != 'generating'
    RETURNING property_id
  `);
  return (result.rowCount ?? 0) > 0;
}

async function upsertSlideRow(patch: Partial<SlideRow> & { property_id: number }): Promise<void> {
  await db.execute(sql`
    INSERT INTO property_slide_decks (property_id, status, r2_key, file_size_bytes, generated_at, triggered_by, error_message, updated_at)
    VALUES (
      ${patch.property_id},
      ${patch.status ?? "idle"},
      ${patch.r2_key ?? null},
      ${patch.file_size_bytes ?? null},
      ${patch.generated_at ?? null},
      ${patch.triggered_by ?? null},
      ${patch.error_message ?? null},
      NOW()
    )
    ON CONFLICT (property_id) DO UPDATE SET
      status          = EXCLUDED.status,
      r2_key          = COALESCE(EXCLUDED.r2_key, property_slide_decks.r2_key),
      file_size_bytes = COALESCE(EXCLUDED.file_size_bytes, property_slide_decks.file_size_bytes),
      generated_at    = COALESCE(EXCLUDED.generated_at, property_slide_decks.generated_at),
      triggered_by    = COALESCE(EXCLUDED.triggered_by, property_slide_decks.triggered_by),
      error_message   = EXCLUDED.error_message,
      updated_at      = NOW()
  `);
}

// ── Data assembly helpers ─────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildGlobalInput(ga: Record<string, unknown>, projYears: number): GlobalInput {
  const dbDebt = ga.debtAssumptions as Record<string, unknown> | null;
  return {
    modelStartDate: (ga.modelStartDate as string) ?? String(new Date().getFullYear()),
    inflationRate: Number(ga.inflationRate ?? SLIDES_DEFAULT_INFLATION_RATE),
    marketingRate: Number(ga.marketingRate ?? SLIDES_DEFAULT_MARKETING_RATE),
    debtAssumptions: {
      interestRate: Number(dbDebt?.interestRate ?? SLIDES_DEFAULT_INTEREST_RATE),
      amortizationYears: Number(dbDebt?.amortizationYears ?? SLIDES_DEFAULT_AMORTIZATION_YEARS),
    },
    projectionYears: projYears,
  } as unknown as GlobalInput;
}

async function resolvePhotoBytes(photo: {
  id: number;
  imageData?: string | null;
  imageUrl?: string | null;
  isHero: boolean;
  sortOrder: number;
  caption?: string | null;
}): Promise<{ base64: string; isHero: boolean; sortOrder: number; caption?: string } | null> {
  if (photo.imageData && photo.imageData.length > 0) {
    return {
      base64: photo.imageData,
      isHero: photo.isHero,
      sortOrder: photo.sortOrder,
      caption: photo.caption ?? undefined,
    };
  }
  const url = photo.imageUrl;
  if (!url) return null;
  try {
    const port = process.env.PORT ?? "8080";
    const fetchUrl = url.startsWith("/api/")
      ? `http://localhost:${port}${url}`
      : url.startsWith("http")
        ? url
        : null;
    if (!fetchUrl) return null;
    const resp = await fetch(fetchUrl, { signal: AbortSignal.timeout(8_000) });
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    return {
      base64: buf.toString("base64"),
      isHero: photo.isHero,
      sortOrder: photo.sortOrder,
      caption: photo.caption ?? undefined,
    };
  } catch {
    return null;
  }
}

function runPythonGenerator(payload: unknown): Promise<{ path: string; slides: number }> {
  return new Promise((resolve, reject) => {
    const py = spawn("python3", [SCRIPT_PATH], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      py.kill("SIGKILL");
      reject(new Error("Python slide generator timed out"));
    }, PYTHON_TIMEOUT_MS);
    py.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    py.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    py.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code !== 0) {
        let errMsg = `Python exited with code ${code}`;
        try {
          const parsed = JSON.parse(stderr.trim());
          errMsg = parsed.error ?? errMsg;
        } catch {
          if (stderr.trim()) errMsg += `: ${stderr.trim().slice(0, 300)}`;
        }
        return reject(new Error(errMsg));
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result as { path: string; slides: number });
      } catch {
        reject(new Error(`Invalid Python output: ${stdout.slice(0, 100)}`));
      }
    });
    py.on("error", (err) => { clearTimeout(timer); reject(err); });
    py.stdin.write(JSON.stringify(payload), "utf-8");
    py.stdin.end();
  });
}

async function buildSlidePayload(
  propertyId: number,
  userId: number | undefined,
  projYears: number,
) {
  const property = await storage.getProperty(propertyId);
  if (!property) throw new Error("Property not found");

  const rawPhotos = await storage.getPropertyPhotos(propertyId);
  const sortedPhotos = [...rawPhotos].sort((a, b) => {
    if (a.isHero !== b.isHero) return a.isHero ? -1 : 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
  const resolvedPhotos = (
    await Promise.all(sortedPhotos.slice(0, MAX_PHOTOS).map(resolvePhotoBytes))
  ).filter(Boolean) as Array<{ base64: string; isHero: boolean; sortOrder: number }>;

  let siblings: Array<Record<string, unknown>> = [];
  if (userId) {
    try {
      const allProps = await storage.getAllProperties(userId);
      const state = property.stateProvince;
      siblings = allProps
        .filter(p => p.id !== propertyId && (state ? p.stateProvince === state : true))
        .slice(0, SIBLING_LIMIT)
        .map(p => ({
          id: p.id,
          name: p.name,
          city: p.city,
          stateProvince: p.stateProvince,
          purchasePrice: p.purchasePrice,
          hospitalityType: (p as Record<string, unknown>).hospitalityType ?? p.businessModel,
          acquisitionStatus: (p as Record<string, unknown>).acquisitionStatus,
        }));
    } catch (e) {
      logger.warn(`Failed to fetch siblings for property ${propertyId}: ${e}`, "property-slides");
    }
  }

  let yearlyIS: unknown[] = [];
  let yearlyCF: unknown[] = [];
  let loanAmount = 0;
  let loanLtv = 0;
  let annualDebtService = 0;
  let irr: number | undefined;
  let equityMultiple: number | undefined;

  try {
    const rawGlobal = userId ? await storage.getGlobalAssumptions(userId) : null;
    const globalAssumptions = await withModelConstants(
      buildGlobalInput((rawGlobal ?? {}) as Record<string, unknown>, projYears),
    );
    const stamped = { ...property, id: propertyId } as unknown as PropertyInput;
    const compute = await recomputeSinglePropertyAndStamp({
      property: stamped,
      globalAssumptions: globalAssumptions as GlobalInput,
      projectionYears: projYears,
    });
    const stampedLoanProps = stamped as unknown as Parameters<typeof calculateLoanParams>[0];
    const unified = aggregateUnifiedByYear(
      compute.monthly,
      stampedLoanProps,
      globalAssumptions as GlobalInput,
      compute.projectionYears,
    );
    yearlyIS = unified.yearlyIS;
    yearlyCF = unified.yearlyCF;
    const loan = calculateLoanParams(stampedLoanProps, globalAssumptions as GlobalInput);
    void getAcquisitionYear(loan);
    loanAmount = loan.loanAmount;
    loanLtv = loan.totalInvestment > 0 ? loan.loanAmount / loan.totalInvestment : 0;
    annualDebtService = loan.monthlyPayment * 12;
    const initialEquity = loan.equityInvested > 0 ? loan.equityInvested : (property.purchasePrice ?? 0);
    if (unified.yearlyCF.length > 0 && initialEquity > 0) {
      const operatingFlows = unified.yearlyCF.map(y => y.netCashFlowToInvestors ?? 0);
      const lastRow = unified.yearlyCF[unified.yearlyCF.length - 1];
      operatingFlows[operatingFlows.length - 1] =
        (operatingFlows[operatingFlows.length - 1] ?? 0) + (lastRow?.exitValue ?? 0);
      const allFlows = [-initialEquity, ...operatingFlows];
      const irrResult = computeIRR(allFlows);
      irr = irrResult?.irr_annualized ?? undefined;
      const totalReturn = operatingFlows.reduce((a, b) => a + b, 0);
      equityMultiple = totalReturn / initialEquity;
    }
  } catch (e) {
    logger.warn(`Finance compute failed for slides (empty financials): ${e}`, "property-slides");
  }

  const p = property as Record<string, unknown>;
  const visionText = await generatePropertyVisionText({
    id: property.id,
    name: property.name,
    city: property.city,
    stateProvince: property.stateProvince,
    county: p.county as string | null,
    country: property.country,
    purchasePrice: property.purchasePrice,
    roomCount: property.roomCount,
    startAdr: property.startAdr,
    maxOccupancy: property.maxOccupancy,
    businessModel: property.businessModel,
    hospitalityType: p.hospitalityType as string | null,
    qualityTier: p.qualityTier as string | null,
    description: property.description,
    acquisitionStatus: p.acquisitionStatus as string | null,
  });

  return {
    property: {
      id: property.id,
      name: property.name,
      city: property.city ?? "",
      stateProvince: property.stateProvince ?? "",
      county: p.county ?? "",
      country: property.country ?? "",
      purchasePrice: property.purchasePrice ?? 0,
      roomCount: property.roomCount ?? 0,
      startAdr: property.startAdr ?? 0,
      maxOccupancy: property.maxOccupancy ?? SLIDES_DEFAULT_MAX_OCCUPANCY,
      businessModel: property.businessModel ?? "hotel",
      hospitalityType: p.hospitalityType ?? "",
      qualityTier: p.qualityTier ?? "",
      description: property.description ?? "",
      acquisitionStatus: p.acquisitionStatus ?? "pipeline",
      isHistoric: p.isHistoric ?? false,
      renovationScope: p.renovationScope ?? "",
      exitCapRate: p.exitCapRate ?? SLIDES_DEFAULT_EXIT_CAP_RATE,
    },
    photos: resolvedPhotos,
    financials: {
      yearlyIS,
      yearlyCF,
      loanAmount,
      loanLtv,
      annualDebtService,
      irr,
      equityMultiple,
      exitCapRate: p.exitCapRate ?? SLIDES_DEFAULT_EXIT_CAP_RATE,
    },
    siblings,
    visionText,
    _propertyName: property.name,
  };
}

/**
 * Runs the full generation pipeline and uploads the result to R2.
 * Called asynchronously — does not throw to caller; records errors in DB.
 */
async function generateAndStore(
  propertyId: number,
  userId: number | undefined,
  triggeredBy: string,
): Promise<void> {
  let tmpPath: string | null = null;
  try {
    logger.info(`[property-slides] Starting generation for property ${propertyId}`, "property-slides");
    const projYears = PROJ_YEARS_DEFAULT;
    const payload = await buildSlidePayload(propertyId, userId, projYears);
    const result = await runPythonGenerator(payload);
    tmpPath = result.path;

    const fileBuffer = await fs.readFile(tmpPath);
    const r2Key = slideR2Key(propertyId);
    const storageProvider = getStorageProvider();
    await storageProvider.uploadBuffer(
      r2Key,
      fileBuffer,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );

    await upsertSlideRow({
      property_id: propertyId,
      status: "ready",
      r2_key: r2Key,
      file_size_bytes: fileBuffer.length,
      generated_at: new Date(),
      triggered_by: triggeredBy,
      error_message: null,
    });
    logger.info(
      `[property-slides] Generation complete for property ${propertyId} (${fileBuffer.length} bytes → ${r2Key})`,
      "property-slides",
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[property-slides] Generation failed for property ${propertyId}: ${message}`, "property-slides");
    await upsertSlideRow({
      property_id: propertyId,
      status: "error",
      error_message: message.slice(0, SLIDE_ERROR_MSG_MAX_LENGTH),
      triggered_by: triggeredBy,
    }).catch((dbErr: unknown) => {
      logger.error(
        `[property-slides] Failed to record error state for property ${propertyId}: ${dbErr}`,
        "property-slides",
      );
    });
  } finally {
    if (tmpPath) await fs.unlink(tmpPath).catch(() => {});
  }
}

// ── Routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/slides/status
 * Returns generation status for all properties that have a row.
 * Admin-only — used by the LB Slides admin page.
 */
router.get("/api/slides/status", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(
      sql`SELECT property_id, status, r2_key, file_size_bytes, generated_at, triggered_by, error_message, updated_at
          FROM property_slide_decks
          ORDER BY property_id`,
    );
    return res.json(
      rows.rows.map((r) => {
        const row = r as unknown as SlideRow;
        return {
          propertyId: row.property_id,
          status: row.status,
          r2Key: row.r2_key,
          fileSizeBytes: row.file_size_bytes,
          generatedAt: row.generated_at,
          triggeredBy: row.triggered_by,
          errorMessage: row.error_message,
        };
      }),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch slide status";
    logger.error(`Slide status fetch error: ${message}`, "property-slides");
    return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
  }
});

/**
 * GET /api/properties/:id/slides/status
 * Single-property status — used for polling during generation. Admin-only.
 */
router.get("/api/properties/:id/slides/status", requireAdmin, async (req: Request, res: Response) => {
  const propertyId = parseRouteId(req.params.id);
  if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });
  try {
    const row = await getSlideRow(propertyId);
    return res.json(
      row
        ? {
            propertyId: row.property_id,
            status: row.status,
            fileSizeBytes: row.file_size_bytes,
            generatedAt: row.generated_at,
            triggeredBy: row.triggered_by,
            errorMessage: row.error_message,
          }
        : { propertyId, status: "idle", fileSizeBytes: null, generatedAt: null, triggeredBy: null, errorMessage: null },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch status";
    return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
  }
});

/**
 * POST /api/properties/:id/slides/generate
 * Admin-only. Marks the property as generating and fires off the background job.
 * Returns 202 immediately — client polls /status to detect completion.
 */
router.post("/api/properties/:id/slides/generate", requireAdmin, async (req: Request, res: Response) => {
  const propertyId = parseRouteId(req.params.id);
  if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });

  const user = getAuthUser(req);
  const triggeredBy = user?.email ?? user?.id?.toString() ?? "admin";

  try {
    // Atomically transition to 'generating' — returns false if already in progress
    const claimed = await tryMarkGenerating(propertyId, triggeredBy);
    if (!claimed) {
      return res.status(HTTP_409_CONFLICT).json({ error: "Generation already in progress" });
    }

    // Kick off async — intentionally not awaited
    void generateAndStore(propertyId, user?.id, triggeredBy);

    return res.status(202).json({ status: "generating", propertyId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to start generation";
    logger.error(`Slide generate error for property ${propertyId}: ${message}`, "property-slides");
    return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
  }
});

/**
 * GET /api/properties/:id/slides
 * Download the stored PPTX from R2. Returns 409 with status if not yet generated.
 * Admin-only.
 */
router.get("/api/properties/:id/slides", requireAdmin, async (req: Request, res: Response) => {
  const propertyId = parseRouteId(req.params.id);
  if (!propertyId) {
    return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });
  }

  try {
    const row = await getSlideRow(propertyId);

    if (!row || row.status !== "ready" || !row.r2_key) {
      const status = row?.status ?? "idle";
      return res.status(HTTP_409_CONFLICT).json({
        error: status === "generating" ? "Slides are being generated — try again shortly" : "Slides not yet generated — click Analyst to generate",
        status,
      });
    }

    // Fetch property name for the download filename
    const property = await storage.getProperty(propertyId);
    const filename = property ? `${slugify(property.name)}-slides.pptx` : `property-${propertyId}-slides.pptx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    if (row.file_size_bytes) res.setHeader("Content-Length", String(row.file_size_bytes));
    res.setHeader("Cache-Control", "no-store");

    const storageProvider = getStorageProvider();
    await storageProvider.downloadToResponse(row.r2_key, res);
    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Download failed";
    logger.error(`Slide download error for property ${propertyId}: ${message}`, "property-slides");
    if (!res.headersSent) {
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
    }
    return res;
  }
});

export { router as propertySlidesRouter };
