/**
 * property-slides.ts — GET /api/properties/:id/slides
 *
 * Generates a 6-slide per-property PPTX deck using the L+B template.
 * Slide 7 ("The Ask") is always excluded.
 *
 * Flow:
 *   1. Fetch property + global assumptions from storage
 *   2. Fetch property photos, resolve bytes
 *   3. Fetch sibling properties (same state)
 *   4. Compute financials via recomputeSinglePropertyAndStamp + aggregateUnifiedByYear
 *   5. Generate vision text (LLM + deterministic fallback)
 *   6. Spawn Python generator, pass JSON on stdin, receive temp path on stdout
 *   7. Stream PPTX back, delete temp file in finally
 *
 * Timeout: 45 s for Python process.
 * See .agents/skills/hplus-pptx-generator/SKILL.md for full architecture.
 */

import { Router, type Request, type Response } from "express";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { requireAuth, getAuthUser } from "../auth";
import { logger } from "../logger";
import { storage } from "../storage";
import { recomputeSinglePropertyAndStamp } from "../finance/recompute";
import { aggregateUnifiedByYear } from "@engine/aggregation/yearlyAggregator";
import { calculateLoanParams, getAcquisitionYear } from "@engine/debt/loanCalculations";
import { withModelConstants } from "../finance/apply-model-constants";
import { computeIRR } from "@analytics/returns/irr";
import { generatePropertyVisionText } from "../ai/property-vision";
import { parseRouteId } from "./helpers";
import {
  HTTP_400_BAD_REQUEST,
  HTTP_404_NOT_FOUND,
  HTTP_500_INTERNAL_SERVER_ERROR,
  HTTP_504_GATEWAY_TIMEOUT,
} from "../constants";
import type { PropertyInput, GlobalInput } from "@engine/types";

const router = Router();

const SCRIPT_PATH = path.resolve(
  __dirname,
  "../../../../scripts/src/generate_property_slides.py",
);
const PYTHON_TIMEOUT_MS = 45_000;
const MAX_PHOTOS = 8;
const SIBLING_LIMIT = 4;
const PROJ_YEARS_DEFAULT = 5;
const PROJ_YEARS_MIN = 3;
const PROJ_YEARS_MAX = 10;

// Financial fallback defaults for slide deck generation
const SLIDES_DEFAULT_INFLATION_RATE = 0.03;
const SLIDES_DEFAULT_MARKETING_RATE = 0.01;
const SLIDES_DEFAULT_INTEREST_RATE = 0.065;
const SLIDES_DEFAULT_AMORTIZATION_YEARS = 25;
const SLIDES_DEFAULT_MAX_OCCUPANCY = 0.70;
const SLIDES_DEFAULT_EXIT_CAP_RATE = 0.07;

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  // imageData is stored as a base64 string in the DB
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

    py.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    py.stdin.write(JSON.stringify(payload), "utf-8");
    py.stdin.end();
  });
}

// ── Route ────────────────────────────────────────────────────────────────────

/**
 * GET /api/properties/:id/slides
 * Returns a binary .pptx as download attachment.
 * Query: projectionYears? (int, default 5, clamped 3–10)
 */
router.get("/api/properties/:id/slides", requireAuth, async (req: Request, res: Response) => {
  const propertyId = parseRouteId(req.params.id);
  if (!propertyId) {
    return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });
  }

  const projYears = Math.min(PROJ_YEARS_MAX, Math.max(PROJ_YEARS_MIN, Number(req.query.projectionYears ?? PROJ_YEARS_DEFAULT)));
  const user = getAuthUser(req);
  let tmpPath: string | null = null;

  try {
    // ── 1. Fetch property ──────────────────────────────────────────────────
    const property = await storage.getProperty(propertyId);
    if (!property) {
      return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found" });
    }

    const userId = user?.id;

    // ── 2. Fetch photos and resolve bytes ──────────────────────────────────
    const rawPhotos = await storage.getPropertyPhotos(propertyId);
    const sortedPhotos = [...rawPhotos].sort((a, b) => {
      if (a.isHero !== b.isHero) return a.isHero ? -1 : 1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });

    const resolvedPhotos = (
      await Promise.all(sortedPhotos.slice(0, MAX_PHOTOS).map(resolvePhotoBytes))
    ).filter(Boolean) as Array<{ base64: string; isHero: boolean; sortOrder: number }>;

    // ── 3. Fetch sibling properties ────────────────────────────────────────
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

    // ── 4. Compute financials ──────────────────────────────────────────────
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

      // Derive per-year IS and CF using the same aggregator pattern as finance.ts
      const stampedLoanProps = stamped as unknown as Parameters<typeof calculateLoanParams>[0];
      const unified = aggregateUnifiedByYear(
        compute.monthly,
        stampedLoanProps,
        globalAssumptions as GlobalInput,
        compute.projectionYears,
      );

      yearlyIS = unified.yearlyIS;
      yearlyCF = unified.yearlyCF;

      // Loan params — LoanCalculation has loanAmount, equityInvested, monthlyPayment
      const loan = calculateLoanParams(stampedLoanProps, globalAssumptions as GlobalInput);
      void getAcquisitionYear(loan); // available but not needed for slides
      loanAmount = loan.loanAmount;
      // LTV = loan / total investment; annualDebtService = monthly * 12
      loanLtv = loan.totalInvestment > 0 ? loan.loanAmount / loan.totalInvestment : 0;
      annualDebtService = loan.monthlyPayment * 12;

      // IRR: computeIRR takes full cash-flow array where first element is the (negative) initial outlay
      const initialEquity = loan.equityInvested > 0 ? loan.equityInvested : (property.purchasePrice ?? 0);

      if (unified.yearlyCF.length > 0 && initialEquity > 0) {
        const operatingFlows = unified.yearlyCF.map(y => y.netCashFlowToInvestors ?? 0);
        const lastRow = unified.yearlyCF[unified.yearlyCF.length - 1];
        operatingFlows[operatingFlows.length - 1] =
          (operatingFlows[operatingFlows.length - 1] ?? 0) + (lastRow?.exitValue ?? 0);
        // Prepend the negative initial equity outlay so computeIRR gets a proper sign change
        const allFlows = [-initialEquity, ...operatingFlows];
        const irrResult = computeIRR(allFlows);
        irr = irrResult?.irr_annualized ?? undefined;
        const totalReturn = operatingFlows.reduce((a, b) => a + b, 0);
        equityMultiple = totalReturn / initialEquity;
      }
    } catch (e) {
      logger.warn(`Finance compute failed for slides (empty financials): ${e}`, "property-slides");
    }

    // ── 5. Generate vision text ────────────────────────────────────────────
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

    // ── 6. Call Python generator ───────────────────────────────────────────
    const payload = {
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
    };

    const result = await runPythonGenerator(payload);
    tmpPath = result.path;

    // ── 7. Stream PPTX file back ───────────────────────────────────────────
    const fileBuffer = await fs.readFile(tmpPath);
    const filename = `${slugify(property.name)}-slides.pptx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(fileBuffer.length));
    res.setHeader("Cache-Control", "no-store");

    return res.send(fileBuffer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Slide generation failed";
    const isTimeout = message.includes("timed out");

    logger.error(`Slide generation error for property ${propertyId}: ${message}`, "property-slides");

    if (!res.headersSent) {
      const status = isTimeout ? HTTP_504_GATEWAY_TIMEOUT : HTTP_500_INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        error: isTimeout ? "Slide generation timed out — try again" : "Failed to generate slides",
        detail: process.env.NODE_ENV !== "production" ? message : undefined,
      });
    }
    return res;
  } finally {
    if (tmpPath) {
      await fs.unlink(tmpPath).catch(() => {});
    }
  }
});

export { router as propertySlidesRouter };
