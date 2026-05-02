/**
 * property-slides.ts
 *
 * Two-format per-property slide deck generation.
 * Uses `property_slide_deck_variants` table (composite PK: property_id + format).
 *
 * Routes:
 *   GET  /api/slides/status                     — all variants status (admin)
 *   GET  /api/properties/:id/slides/status      — single-property both-format status
 *   POST /api/properties/:id/slides/generate    — trigger (re)generation of both formats
 *   GET  /api/properties/:id/slides             — download (?format=pptx|image)
 *   GET  /api/properties/:id/slides/view        — JSON payload for slide viewer
 *
 * Track 1 — PPTX: Python generator → editable PPTX matching L+B template
 * Track 2 — Image: satori+sharp → PNG-per-slide image-PPTX (locked)
 */

import { Router, type Request, type Response } from "express";
import sharp from "sharp";
import archiver from "archiver";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { sql } from "drizzle-orm";
import { requireAuth, requireAdmin, getAuthUser } from "../auth";
import { logger } from "../logger";
import { storage } from "../storage";
import { db } from "../db";
import { getStorageProvider, getStorageProviderAsync } from "../providers/storage";
import { recomputeSinglePropertyAndStamp } from "../finance/recompute";
import {
  RENOV_HISTORIC_PREMIUM,
  RENOV_CONTINGENCY,
  RENOV_MAX_PCT_OF_PRICE,
  RENOV_MIN_PER_KEY,
} from "@shared/constants";
import { aggregateUnifiedByYear } from "@engine/aggregation/yearlyAggregator";
import { calculateLoanParams, getAcquisitionYear } from "@engine/debt/loanCalculations";
import { withModelConstants } from "../finance/apply-model-constants";
import { computeIRR } from "@analytics/returns/irr";
import { generatePropertyVisionText, buildPropertyVisionFallback } from "../ai/property-vision";
import { renderImagePptx, type SlidePayload } from "../slides/image-renderer";
import { generatePropertyImprovements } from "../slides/improvement-suggestions";
import { ensurePortfolioRenders } from "../slides/portfolio-renders";
import { parseRouteId } from "./helpers";
import {
  HTTP_202_ACCEPTED,
  HTTP_400_BAD_REQUEST,
  HTTP_409_CONFLICT,
  HTTP_500_INTERNAL_SERVER_ERROR,
} from "../constants";
import type { PropertyInput, GlobalInput } from "@engine/types";

const router = Router();

const SCRIPT_PATH = path.resolve(
  __dirname,
  "../../../scripts/src/generate_property_slides.py",
);
const PYTHON_TIMEOUT_MS = 120_000;
const MAX_PHOTOS = 8;
const SIBLING_LIMIT = 4;
const PROJ_YEARS_DEFAULT = 5;

const SLIDE_ERROR_MSG_MAX_LENGTH = 500;
const SLIDES_DEFAULT_INFLATION_RATE = 0.03;
const SLIDES_DEFAULT_MARKETING_RATE = 0.01;
const SLIDES_DEFAULT_INTEREST_RATE = 0.065;
const SLIDES_DEFAULT_AMORTIZATION_YEARS = 25;
const SLIDES_DEFAULT_MAX_OCCUPANCY = 0.70;
const SLIDES_DEFAULT_EXIT_CAP_RATE = 0.07;

const r2Key = (propertyId: number, format: SlideFormat) =>
  format === "pptx"
    ? `slides/pptx/property-${propertyId}.pptx`
    : `slides/image/property-${propertyId}.pptx`;

// ── Types ─────────────────────────────────────────────────────────────────

type SlideFormat = "pptx" | "image";

interface VariantRow {
  property_id: number;
  format: string;
  status: string;
  r2_key: string | null;
  file_size_bytes: number | null;
  generated_at: Date | null;
  triggered_by: string | null;
  error_message: string | null;
  updated_at: Date;
}

// ── DB helpers ─────────────────────────────────────────────────────────────

async function getVariantRow(propertyId: number, format: SlideFormat): Promise<VariantRow | null> {
  const rows = await db.execute(sql`
    SELECT * FROM property_slide_deck_variants
    WHERE property_id = ${propertyId} AND format = ${format}
  `);
  return (rows.rows[0] as unknown as VariantRow | undefined) ?? null;
}

async function getAllVariantRows(): Promise<VariantRow[]> {
  const rows = await db.execute(sql`
    SELECT * FROM property_slide_deck_variants
    ORDER BY property_id, format
  `);
  return rows.rows as unknown as VariantRow[];
}

async function tryMarkGenerating(propertyId: number, format: SlideFormat, triggeredBy: string): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO property_slide_deck_variants (property_id, format, status, triggered_by, error_message, updated_at)
    VALUES (${propertyId}, ${format}, 'generating', ${triggeredBy}, null, NOW())
    ON CONFLICT (property_id, format) DO UPDATE SET
      status        = 'generating',
      triggered_by  = EXCLUDED.triggered_by,
      error_message = null,
      updated_at    = NOW()
    WHERE property_slide_deck_variants.status != 'generating'
    RETURNING property_id
  `);
  return (result.rowCount ?? 0) > 0;
}

async function upsertVariantRow(patch: Partial<VariantRow> & { property_id: number; format: SlideFormat }): Promise<void> {
  await db.execute(sql`
    INSERT INTO property_slide_deck_variants
      (property_id, format, status, r2_key, file_size_bytes, generated_at, triggered_by, error_message, updated_at)
    VALUES (
      ${patch.property_id}, ${patch.format},
      ${patch.status ?? "idle"},
      ${patch.r2_key ?? null},
      ${patch.file_size_bytes ?? null},
      ${patch.generated_at ?? null},
      ${patch.triggered_by ?? null},
      ${patch.error_message ?? null},
      NOW()
    )
    ON CONFLICT (property_id, format) DO UPDATE SET
      status          = EXCLUDED.status,
      r2_key          = COALESCE(EXCLUDED.r2_key, property_slide_deck_variants.r2_key),
      file_size_bytes = COALESCE(EXCLUDED.file_size_bytes, property_slide_deck_variants.file_size_bytes),
      generated_at    = COALESCE(EXCLUDED.generated_at, property_slide_deck_variants.generated_at),
      triggered_by    = COALESCE(EXCLUDED.triggered_by, property_slide_deck_variants.triggered_by),
      error_message   = EXCLUDED.error_message,
      updated_at      = NOW()
  `);
}

// ── Data assembly ──────────────────────────────────────────────────────────

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
    return { base64: photo.imageData, isHero: photo.isHero, sortOrder: photo.sortOrder, caption: photo.caption ?? undefined };
  }
  const url = photo.imageUrl;
  if (!url) return null;
  try {
    const port = process.env.PORT ?? "8080";
    if (url.startsWith("/api/")) {
      // DB-backed photo served via authenticated endpoint — fetch internally
      const resp = await fetch(`http://localhost:${port}${url}`, { signal: AbortSignal.timeout(8_000) });
      if (!resp.ok) return null;
      const buf = Buffer.from(await resp.arrayBuffer());
      return { base64: buf.toString("base64"), isHero: photo.isHero, sortOrder: photo.sortOrder, caption: photo.caption ?? undefined };
    }
    if (url.startsWith("/objects/")) {
      // Object storage key — download directly without HTTP round-trip
      const key = url.slice("/objects/".length);
      const storageProvider = await getStorageProviderAsync();
      const result = await storageProvider.downloadBuffer(key);
      if (!result) return null;
      return { base64: result.buffer.toString("base64"), isHero: photo.isHero, sortOrder: photo.sortOrder, caption: photo.caption ?? undefined };
    }
    return null;
  } catch (err) {
    logger.warn(`[resolvePhotoBytes] failed for ${photo.imageUrl}: ${err}`, "property-slides");
    return null;
  }
}

/** Thumbnail dimensions for property card previews embedded in slide decks. */
const CARD_THUMBNAIL_WIDTH = 480;
const CARD_THUMBNAIL_HEIGHT = 320;

async function shrinkForCard(base64: string): Promise<string> {
  try {
    const buf = Buffer.from(base64, "base64");
    const small = await sharp(buf).resize(CARD_THUMBNAIL_WIDTH, CARD_THUMBNAIL_HEIGHT, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
    return small.toString("base64");
  } catch {
    return base64;
  }
}

// ── Renovation budget (TS mirror of scripts/src/renovation_budget.py) ──────
// Source: hplus-renovation-benchmarks skill. Mid-point estimates, contingency,
// historic premium, and clamp bounds must stay in sync with the Python module.
const RENOV_COST_PER_KEY = {
  soft: 33_500,
  upscale: 110_000,
  upper_upscale: 195_000,
  luxury: 415_000,
} as const;
type RenovTier = keyof typeof RENOV_COST_PER_KEY;

// RENOV_HISTORIC_PREMIUM, RENOV_CONTINGENCY, RENOV_MAX_PCT_OF_PRICE, RENOV_MIN_PER_KEY
// are imported from "@shared/constants" — keeps a single source of truth across the engine.

function selectRenovTier(qualityTier: string, hospitalityType: string, renovationScope: string): RenovTier {
  const qt = qualityTier.toLowerCase();
  const ht = hospitalityType.toLowerCase();
  const rs = renovationScope.toLowerCase();
  if (rs === "light" || rs === "cosmetic") return "soft";
  if (qt.includes("luxury") || ht.includes("luxury")) return "luxury";
  if (qt.includes("upper") || ht.includes("upper")) return "upper_upscale";
  if (qt.includes("upscale") || ht.includes("boutique") || ht.includes("hotel")) return "upscale";
  return "upscale";
}

function computeRenovationBudget(input: {
  roomCount?: number | null;
  purchasePrice?: number | null;
  qualityTier?: string | null;
  hospitalityType?: string | null;
  renovationScope?: string | null;
  isHistoric?: boolean | string | null;
}): number {
  const rooms = Math.max(0, input.roomCount ?? 0);
  const tier = selectRenovTier(input.qualityTier ?? "", input.hospitalityType ?? "", input.renovationScope ?? "");
  const isHistoric = input.isHistoric === true || input.isHistoric === "true";
  const perKey = Math.round(RENOV_COST_PER_KEY[tier] * (isHistoric ? 1 + RENOV_HISTORIC_PREMIUM : 1));
  const subtotal = rooms * perKey;
  const contingency = Math.round(subtotal * RENOV_CONTINGENCY);
  const budget = subtotal + contingency;
  const purchasePrice = input.purchasePrice ?? 0;
  const maxB = purchasePrice > 0 ? Math.round(purchasePrice * RENOV_MAX_PCT_OF_PRICE) : budget;
  const minB = RENOV_MIN_PER_KEY * Math.max(1, rooms);
  return Math.max(minB, Math.min(maxB, budget));
}

async function buildSlidePayload(propertyId: number, userId: number | undefined, projYears: number): Promise<SlidePayload & { _propertyName: string }> {
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
  const mainHero = resolvedPhotos.find(p => p.isHero) ?? resolvedPhotos[0];
  const slide4HeroBase64 = mainHero?.base64 ? await shrinkForCard(mainHero.base64) : undefined;

  // Portfolio properties for slide 4 — all properties sorted by acquisition date
  // (matching the front-end Properties page order), excluding current, capped at 5
  // (current property occupies card 1, so siblings fill cards 2–6).
  let siblings: Array<Record<string, unknown>> = [];
  try {
    const allProps = await storage.getAllProperties(userId);
    const sorted = [...allProps]
      .filter(pr => pr.id !== propertyId)
      .sort((a, b) => {
        const da = (a as Record<string, unknown>).acquisitionDate as string | null;
        const db_ = (b as Record<string, unknown>).acquisitionDate as string | null;
        if (!da && !db_) return 0;
        if (!da) return 1;
        if (!db_) return -1;
        return da.localeCompare(db_);
      })
      .slice(0, SIBLING_LIMIT);

    siblings = await Promise.all(sorted.map(async (pr) => {
      const hero = await storage.getHeroPhoto(pr.id);
      let heroPhotoBase64: string | undefined;
      if (hero) {
        const resolved = await resolvePhotoBytes({
          id: hero.id,
          imageData: hero.imageData,
          imageUrl: hero.imageUrl,
          isHero: true,
          sortOrder: hero.sortOrder ?? 0,
          caption: hero.caption,
        });
        if (resolved?.base64) {
          heroPhotoBase64 = await shrinkForCard(resolved.base64);
        }
      }
      const prRec = pr as Record<string, unknown>;
      return {
        id: pr.id,
        name: pr.name,
        city: pr.city,
        stateProvince: pr.stateProvince,
        purchasePrice: pr.purchasePrice,
        hospitalityType: prRec.hospitalityType ?? pr.businessModel,
        acquisitionStatus: prRec.acquisitionStatus,
        heroPhotoBase64,
      };
    }));
  } catch (e) {
    logger.warn(`Failed to fetch portfolio properties for property ${propertyId}: ${e}`, "property-slides");
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
      // netCashFlowToInvestors already has: equity deducted in acquisition year, exitValue
      // added in last year. Use the vector directly — no prepending or appending.
      const irrFlows = unified.yearlyCF.map(y => y.netCashFlowToInvestors ?? 0);
      const irrResult = computeIRR(irrFlows);
      irr = irrResult?.irr_annualized ?? undefined;
      // MOIC: add back equity (already deducted in acq-year flow) to get gross cash returned
      const netSum = irrFlows.reduce((a, b) => a + b, 0);
      equityMultiple = (netSum + initialEquity) / initialEquity;
    }
  } catch (e) {
    logger.warn(`Finance compute failed for slides (empty financials): ${e}`, "property-slides");
  }

  const p = property as Record<string, unknown>;

  const propertyShape = {
    id: property.id, name: property.name,
    city: property.city ?? "", stateProvince: property.stateProvince ?? "",
    county: (p.county ?? "") as string, country: property.country ?? "",
    purchasePrice: property.purchasePrice ?? 0, roomCount: property.roomCount ?? 0,
    startAdr: property.startAdr ?? 0,
    maxOccupancy: property.maxOccupancy ?? SLIDES_DEFAULT_MAX_OCCUPANCY,
    businessModel: property.businessModel ?? "hotel",
    hospitalityType: (p.hospitalityType ?? "") as string,
    qualityTier: (p.qualityTier ?? "") as string,
    description: property.description ?? "",
    acquisitionStatus: (p.acquisitionStatus ?? "pipeline") as string,
    isHistoric: (p.isHistoric as boolean | string | undefined) ?? false,
    renovationScope: (p.renovationScope ?? "") as string,
    exitCapRate: (p.exitCapRate ?? SLIDES_DEFAULT_EXIT_CAP_RATE) as number,
  };

  const renovationBudget = computeRenovationBudget(propertyShape);

  // LLM-generated content — run concurrently
  const [visionText, improvements] = await Promise.all([
    generatePropertyVisionText({
      id: property.id, name: property.name, city: property.city, stateProvince: property.stateProvince,
      county: p.county as string | null, country: property.country, purchasePrice: property.purchasePrice,
      roomCount: property.roomCount, startAdr: property.startAdr, maxOccupancy: property.maxOccupancy,
      businessModel: property.businessModel, hospitalityType: p.hospitalityType as string | null,
      qualityTier: p.qualityTier as string | null, description: property.description,
      acquisitionStatus: p.acquisitionStatus as string | null,
    }),
    generatePropertyImprovements(propertyShape),
  ]);

  return {
    property: propertyShape,
    photos: resolvedPhotos,
    financials: {
      yearlyIS: yearlyIS as SlidePayload["financials"]["yearlyIS"],
      yearlyCF: yearlyCF as SlidePayload["financials"]["yearlyCF"],
      loanAmount, loanLtv, annualDebtService, irr, equityMultiple, renovationBudget,
      exitCapRate: (p.exitCapRate ?? SLIDES_DEFAULT_EXIT_CAP_RATE) as number,
    },
    siblings: siblings as unknown as SlidePayload["siblings"],
    visionText,
    improvements,
    slide4HeroBase64,
    _propertyName: property.name,
  };
}

// ── Python Track 1 runner ────────────────────────────────────────────────

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
        try { const parsed = JSON.parse(stderr.trim()); errMsg = parsed.error ?? errMsg; } catch { if (stderr.trim()) errMsg += `: ${stderr.trim().slice(0, 300)}`; }
        return reject(new Error(errMsg));
      }
      try {
        resolve(JSON.parse(stdout.trim()) as { path: string; slides: number });
      } catch {
        reject(new Error(`Invalid Python output: ${stdout.slice(0, 100)}`));
      }
    });
    py.on("error", (err) => { clearTimeout(timer); reject(err); });
    py.stdin.write(JSON.stringify(payload), "utf-8");
    py.stdin.end();
  });
}

// ── Generation pipeline ──────────────────────────────────────────────────

async function generateTrack1(
  propertyId: number,
  userId: number | undefined,
  triggeredBy: string,
): Promise<void> {
  let tmpPath: string | null = null;
  try {
    const payload = await buildSlidePayload(propertyId, userId, PROJ_YEARS_DEFAULT);
    const result = await runPythonGenerator(payload);
    tmpPath = result.path;

    const fileBuffer = await fs.readFile(tmpPath);
    const key = r2Key(propertyId, "pptx");
    await getStorageProvider().uploadBuffer(
      key, fileBuffer,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    await upsertVariantRow({
      property_id: propertyId, format: "pptx", status: "ready",
      r2_key: key, file_size_bytes: fileBuffer.length,
      generated_at: new Date(), triggered_by: triggeredBy, error_message: null,
    });
    logger.info(`[property-slides] PPTX ready for property ${propertyId} (${fileBuffer.length}B → ${key})`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[property-slides] Track 1 failed for ${propertyId}: ${message}`);
    await upsertVariantRow({
      property_id: propertyId, format: "pptx", status: "error",
      error_message: message.slice(0, SLIDE_ERROR_MSG_MAX_LENGTH), triggered_by: triggeredBy,
    }).catch(() => {});
  } finally {
    if (tmpPath) await fs.unlink(tmpPath).catch(() => {});
  }
}

async function generateTrack2(
  propertyId: number,
  userId: number | undefined,
  triggeredBy: string,
): Promise<void> {
  try {
    // Ensure all portfolio properties have renders before building the payload.
    // This may call Replicate for properties that have no hero photo.
    try {
      const allProps = await storage.getAllProperties(userId);
      const portfolioIds = allProps.map(pr => pr.id);
      await ensurePortfolioRenders(portfolioIds);
    } catch (renderErr) {
      logger.warn(`[property-slides] ensurePortfolioRenders failed (continuing): ${renderErr}`, "property-slides");
    }

    const payload = await buildSlidePayload(propertyId, userId, PROJ_YEARS_DEFAULT);
    const pptxBuffer = await renderImagePptx(payload);

    const key = r2Key(propertyId, "image");
    await getStorageProvider().uploadBuffer(
      key, pptxBuffer,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    await upsertVariantRow({
      property_id: propertyId, format: "image", status: "ready",
      r2_key: key, file_size_bytes: pptxBuffer.length,
      generated_at: new Date(), triggered_by: triggeredBy, error_message: null,
    });
    logger.info(`[property-slides] Image-PPTX ready for property ${propertyId} (${pptxBuffer.length}B → ${key})`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[property-slides] Track 2 failed for ${propertyId}: ${message}`);
    await upsertVariantRow({
      property_id: propertyId, format: "image", status: "error",
      error_message: message.slice(0, SLIDE_ERROR_MSG_MAX_LENGTH), triggered_by: triggeredBy,
    }).catch(() => {});
  }
}

async function generateBoth(
  propertyId: number,
  userId: number | undefined,
  triggeredBy: string,
): Promise<void> {
  logger.info(`[property-slides] Starting both-format generation for property ${propertyId}`);
  await Promise.all([
    generateTrack1(propertyId, userId, triggeredBy),
    generateTrack2(propertyId, userId, triggeredBy),
  ]);
}

// ── Startup pre-generation ────────────────────────────────────────────────

/**
 * Pre-generate slides for all properties that have no `ready` variant.
 * Runs concurrently with a parallelism limit of 2 (quality over speed).
 * Called at server startup — fully backgrounded, never throws to caller.
 */
export async function preGenerateAllSlides(): Promise<void> {
  try {
    const properties = await storage.getAllProperties();
    if (!properties || properties.length === 0) return;

    const existingRows = await getAllVariantRows();
    const readySet = new Set(existingRows.filter(r => r.status === "ready").map(r => `${r.property_id}:${r.format}`));

    const toGenerate = properties.filter(
      p => !readySet.has(`${p.id}:pptx`) || !readySet.has(`${p.id}:image`),
    );
    if (toGenerate.length === 0) {
      logger.info("[property-slides] Pre-gen: all properties already have ready variants");
      return;
    }
    logger.info(`[property-slides] Pre-gen: queuing ${toGenerate.length} properties`);

    const CONCURRENCY = 2;
    for (let i = 0; i < toGenerate.length; i += CONCURRENCY) {
      const batch = toGenerate.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (prop) => {
          const formats: SlideFormat[] = [];
          if (!readySet.has(`${prop.id}:pptx`)) formats.push("pptx");
          if (!readySet.has(`${prop.id}:image`)) formats.push("image");

          for (const fmt of formats) {
            const claimed = await tryMarkGenerating(prop.id, fmt, "startup");
            if (!claimed) continue;
          }
          await Promise.allSettled([
            formats.includes("pptx") ? generateTrack1(prop.id, undefined, "startup") : Promise.resolve(),
            formats.includes("image") ? generateTrack2(prop.id, undefined, "startup") : Promise.resolve(),
          ]);
        }),
      );
    }
    logger.info("[property-slides] Pre-gen: all batches dispatched");
  } catch (err) {
    logger.error(`[property-slides] Pre-gen failed: ${err}`);
  }
}

// ── Hero image resolution helper ───────────────────────────────────────────

async function resolveHeroImageBuffer(
  imageUrl: string,
): Promise<{ buffer: Buffer; ext: string } | null> {
  try {
    const port = process.env.PORT ?? "8080";

    if (imageUrl.startsWith("/objects/")) {
      const key = imageUrl.slice("/objects/".length);
      const sp = await getStorageProviderAsync();
      const result = await sp.downloadBuffer(key);
      if (!result) return null;
      const lower = key.toLowerCase();
      const ext = lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpg"
        : lower.endsWith(".webp") ? "webp"
        : lower.endsWith(".gif") ? "gif"
        : "png";
      return { buffer: result.buffer, ext };
    }

    if (imageUrl.startsWith("/api/")) {
      const resp = await fetch(`http://localhost:${port}${imageUrl}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return null;
      const buf = Buffer.from(await resp.arrayBuffer());
      const contentType = resp.headers.get("content-type") ?? "";
      const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg"
        : contentType.includes("webp") ? "webp"
        : contentType.includes("gif") ? "gif"
        : "png";
      return { buffer: buf, ext };
    }

    return null;
  } catch (err) {
    logger.warn(`[hero-zip] resolveHeroImageBuffer failed for ${imageUrl}: ${err}`, "property-slides");
    return null;
  }
}

/**
 * Resolve the highest-available-resolution hero image for a property,
 * trying each candidate URL in descending quality order and falling back
 * to the next one when a fetch fails. Returns null only when every
 * candidate has been exhausted.
 *
 * Candidate priority for the PowerPoint editing workflow:
 *   1. variants.original — the unmodified upload (highest fidelity)
 *   2. variants.full     — ~2400px webp
 *   3. variants.hero     — ~1600px webp
 *   4. variants.card     — ~800px webp
 *   5. hero photo's own imageUrl (covers DB-served originals)
 *   6. property's denormalized imageUrl (legacy fallback — current behavior)
 */
async function resolveBestHeroImageBuffer(
  property: { id: number; imageUrl?: string | null },
): Promise<{ buffer: Buffer; ext: string } | null> {
  const candidates: string[] = [];

  try {
    const hero = await storage.getHeroPhoto(property.id);
    if (hero) {
      const variants = hero.variants ?? {};
      if (variants.original) candidates.push(variants.original);
      if (variants.full) candidates.push(variants.full);
      if (variants.hero) candidates.push(variants.hero);
      if (variants.card) candidates.push(variants.card);
      if (hero.imageUrl) candidates.push(hero.imageUrl);
    }
  } catch (err) {
    logger.warn(`[hero-zip] getHeroPhoto failed for property ${property.id}: ${err}`, "property-slides");
  }

  if (property.imageUrl) candidates.push(property.imageUrl);

  const seen = new Set<string>();
  for (const url of candidates) {
    if (seen.has(url)) continue;
    seen.add(url);
    const result = await resolveHeroImageBuffer(url);
    if (result) return result;
  }
  return null;
}

// ── Routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/properties/hero-images/zip
 * Streams a ZIP of all property hero images, one file per property,
 * named {sanitized-property-name}.{ext}. Properties with no hero image
 * are silently skipped. Response is streamed so it doesn't time out on
 * large portfolios.
 *
 * IMPORTANT: this literal route must appear before /api/properties/:id/*
 * so Express does not match "hero-images" as an :id param.
 */
router.get("/api/properties/hero-images/zip", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const props = await storage.getAllProperties();
    if (!props || props.length === 0) {
      return res.status(404).json({ error: "No properties found" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="property-hero-images.zip"');
    res.setHeader("Cache-Control", "no-store");

    const archive = archiver("zip", { zlib: { level: 5 } });

    archive.on("error", (err) => {
      logger.error(`[hero-zip] archiver error: ${err.message}`, "property-slides");
      if (!res.headersSent) res.status(500).json({ error: "ZIP generation failed" });
    });

    archive.pipe(res);

    for (const prop of props) {
      const resolved = await resolveBestHeroImageBuffer({
        id: prop.id,
        imageUrl: (prop as Record<string, unknown>).imageUrl as string | undefined | null,
      });
      if (!resolved) continue;

      const safeName = prop.name.replace(/[^a-zA-Z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
      const filename = `${safeName}.${resolved.ext}`;
      archive.append(resolved.buffer, { name: filename });
    }

    await archive.finalize();
    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "ZIP generation failed";
    logger.error(`[hero-zip] error: ${message}`, "property-slides");
    if (!res.headersSent) return res.status(500).json({ error: message });
    return res;
  }
});

router.get("/api/slides/status", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await getAllVariantRows();
    return res.json(
      rows.map(r => ({
        propertyId: r.property_id,
        format: r.format,
        status: r.status,
        r2Key: r.r2_key,
        fileSizeBytes: r.file_size_bytes,
        generatedAt: r.generated_at,
        triggeredBy: r.triggered_by,
        errorMessage: r.error_message,
      })),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch slide status";
    logger.error(`Slide status fetch error: ${message}`, "property-slides");
    return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
  }
});

router.get("/api/properties/:id/slides/status", requireAdmin, async (req: Request, res: Response) => {
  const propertyId = parseRouteId(req.params.id);
  if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });
  try {
    const [pptxRow, imageRow] = await Promise.all([
      getVariantRow(propertyId, "pptx"),
      getVariantRow(propertyId, "image"),
    ]);
    const toStatus = (row: VariantRow | null, fmt: SlideFormat) => row
      ? { propertyId: row.property_id, format: fmt, status: row.status, fileSizeBytes: row.file_size_bytes, generatedAt: row.generated_at, triggeredBy: row.triggered_by, errorMessage: row.error_message }
      : { propertyId, format: fmt, status: "idle", fileSizeBytes: null, generatedAt: null, triggeredBy: null, errorMessage: null };
    return res.json([toStatus(pptxRow, "pptx"), toStatus(imageRow, "image")]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch status";
    return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
  }
});

router.post("/api/properties/:id/slides/generate", requireAdmin, async (req: Request, res: Response) => {
  const propertyId = parseRouteId(req.params.id);
  if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });

  const user = getAuthUser(req);
  const triggeredBy = user?.email ?? user?.id?.toString() ?? "admin";

  try {
    const [claimedPptx, claimedImage] = await Promise.all([
      tryMarkGenerating(propertyId, "pptx", triggeredBy),
      tryMarkGenerating(propertyId, "image", triggeredBy),
    ]);

    if (!claimedPptx && !claimedImage) {
      return res.status(HTTP_409_CONFLICT).json({ error: "Generation already in progress for both formats" });
    }

    void generateBoth(propertyId, user?.id, triggeredBy);

    return res.status(HTTP_202_ACCEPTED).json({ status: "generating", propertyId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to start generation";
    logger.error(`Slide generate error for property ${propertyId}: ${message}`, "property-slides");
    return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
  }
});

router.get("/api/properties/:id/slides", requireAdmin, async (req: Request, res: Response) => {
  const propertyId = parseRouteId(req.params.id);
  if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });

  const format: SlideFormat = req.query.format === "image" ? "image" : "pptx";

  try {
    const row = await getVariantRow(propertyId, format);

    if (!row || row.status !== "ready" || !row.r2_key) {
      const status = row?.status ?? "idle";
      return res.status(HTTP_409_CONFLICT).json({
        error: status === "generating"
          ? `${format === "image" ? "Image slides" : "Slides"} are being generated — try again shortly`
          : `${format === "image" ? "Image slides" : "Slides"} not yet generated`,
        status,
      });
    }

    const property = await storage.getProperty(propertyId);
    const slug = property ? slugify(property.name) : `property-${propertyId}`;
    const filename = format === "image" ? `${slug}-slides-images.pptx` : `${slug}-slides.pptx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    if (row.file_size_bytes) res.setHeader("Content-Length", String(row.file_size_bytes));
    res.setHeader("Cache-Control", "no-store");

    await getStorageProvider().downloadToResponse(row.r2_key, res);
    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Download failed";
    logger.error(`Slide download error for property ${propertyId}: ${message}`, "property-slides");
    if (!res.headersSent) return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
    return res;
  }
});

/**
 * GET /api/properties/:id/slides/view
 * JSON payload for the interactive slide viewer.
 * Returns URLs (not bytes) for photos so the browser can load them directly.
 */
router.get("/api/properties/:id/slides/view", requireAuth, async (req: Request, res: Response) => {
  const propertyId = parseRouteId(req.params.id);
  if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });

  try {
    const user = getAuthUser(req);
    const property = await storage.getProperty(propertyId);
    if (!property) return res.status(404).json({ error: "Property not found" });

    const rawPhotos = await storage.getPropertyPhotos(propertyId);
    const photos = [...rawPhotos]
      .sort((a, b) => (a.isHero ? -1 : b.isHero ? 1 : 0) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .slice(0, MAX_PHOTOS)
      .map(ph => ({ id: ph.id, url: `/api/property-photos/${ph.id}/image`, isHero: ph.isHero, sortOrder: ph.sortOrder ?? 0, caption: ph.caption ?? "" }));

    let siblings: Array<Record<string, unknown>> = [];
    try {
      const allProps = await storage.getAllProperties(user?.id);
      siblings = allProps
        .filter(p => p.id !== propertyId && p.stateProvince === property.stateProvince)
        .slice(0, SIBLING_LIMIT)
        .map(p => ({ id: p.id, name: p.name, city: p.city, stateProvince: p.stateProvince, purchasePrice: p.purchasePrice, hospitalityType: (p as Record<string, unknown>).hospitalityType ?? p.businessModel }));
    } catch (e) {
      logger.warn(`Failed to fetch siblings for slide view ${propertyId}: ${e}`, "property-slides");
    }

    let yearlyIS: unknown[] = [], yearlyCF: unknown[] = [];
    let loanAmount = 0, loanLtv = 0, annualDebtService = 0;
    let irr: number | undefined, equityMultiple: number | undefined;
    try {
      const rawGlobal = user?.id ? await storage.getGlobalAssumptions(user.id) : null;
      const globalAssumptions = await withModelConstants(
        buildGlobalInput((rawGlobal ?? {}) as Record<string, unknown>, PROJ_YEARS_DEFAULT),
      );
      const stamped = { ...property, id: propertyId } as unknown as PropertyInput;
      const compute = await recomputeSinglePropertyAndStamp({ property: stamped, globalAssumptions: globalAssumptions as GlobalInput, projectionYears: PROJ_YEARS_DEFAULT });
      const stampedLoanProps = stamped as unknown as Parameters<typeof calculateLoanParams>[0];
      const unified = aggregateUnifiedByYear(compute.monthly, stampedLoanProps, globalAssumptions as GlobalInput, compute.projectionYears);
      yearlyIS = unified.yearlyIS;
      yearlyCF = unified.yearlyCF;
      const loan = calculateLoanParams(stampedLoanProps, globalAssumptions as GlobalInput);
      loanAmount = loan.loanAmount;
      loanLtv = loan.totalInvestment > 0 ? loan.loanAmount / loan.totalInvestment : 0;
      annualDebtService = loan.monthlyPayment * 12;
      const initialEquity = loan.equityInvested > 0 ? loan.equityInvested : (property.purchasePrice ?? 0);
      if (unified.yearlyCF.length > 0 && initialEquity > 0) {
        const irrFlows = unified.yearlyCF.map(y => y.netCashFlowToInvestors ?? 0);
        const irrResult = computeIRR(irrFlows);
        irr = irrResult?.irr_annualized ?? undefined;
        const netSum = irrFlows.reduce((a, b) => a + b, 0);
        equityMultiple = (netSum + initialEquity) / initialEquity;
      }
    } catch (e) {
      logger.warn(`Finance compute failed for slide view ${propertyId}: ${e}`, "property-slides");
    }

    const pv = property as Record<string, unknown>;
    const renovationBudget = computeRenovationBudget({
      roomCount: property.roomCount,
      purchasePrice: property.purchasePrice,
      qualityTier: pv.qualityTier as string | null,
      hospitalityType: pv.hospitalityType as string | null,
      renovationScope: pv.renovationScope as string | null,
      isHistoric: pv.isHistoric as boolean | string | null,
    });
    const visionInput = { id: property.id, name: property.name, city: property.city, stateProvince: property.stateProvince, county: pv.county as string | null, country: property.country, purchasePrice: property.purchasePrice, roomCount: property.roomCount, startAdr: property.startAdr, maxOccupancy: property.maxOccupancy, businessModel: property.businessModel, hospitalityType: pv.hospitalityType as string | null, qualityTier: pv.qualityTier as string | null, description: property.description, acquisitionStatus: pv.acquisitionStatus as string | null };
    const visionText = await Promise.race([
      generatePropertyVisionText(visionInput),
      new Promise<ReturnType<typeof buildPropertyVisionFallback>>(resolve =>
        setTimeout(() => resolve(buildPropertyVisionFallback(visionInput)), 3_000)),
    ]);

    return res.json({
      property: { id: property.id, name: property.name, city: property.city ?? "", stateProvince: property.stateProvince ?? "", county: (pv.county ?? "") as string, country: property.country ?? "", purchasePrice: property.purchasePrice ?? 0, roomCount: property.roomCount ?? 0, startAdr: property.startAdr ?? 0, maxOccupancy: property.maxOccupancy ?? SLIDES_DEFAULT_MAX_OCCUPANCY, businessModel: property.businessModel ?? "hotel", hospitalityType: (pv.hospitalityType ?? "") as string, qualityTier: (pv.qualityTier ?? "") as string, description: property.description ?? "", acquisitionStatus: (pv.acquisitionStatus ?? "pipeline") as string, isHistoric: pv.isHistoric ?? false, renovationScope: (pv.renovationScope ?? "") as string, exitCapRate: (pv.exitCapRate ?? SLIDES_DEFAULT_EXIT_CAP_RATE) as number },
      photos,
      financials: { yearlyIS, yearlyCF, loanAmount, loanLtv, annualDebtService, irr, equityMultiple, renovationBudget, exitCapRate: (pv.exitCapRate ?? SLIDES_DEFAULT_EXIT_CAP_RATE) as number },
      siblings,
      visionText,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch slide view data";
    logger.error(`Slide view error for property ${propertyId}: ${message}`, "property-slides");
    return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
  }
});

export { router as propertySlidesRouter };
