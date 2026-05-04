/**
 * build-payload.ts
 *
 * Assembles the full SlidePayload for a single property — property data,
 * resolved photos (base64), portfolio siblings, finance projections, and
 * editor-authored sidecar copy (deckPayloadV2).
 *
 * Sole consumer is `routes/internal-deck-payload.ts`, which serves the
 * payload to the React deck route Playwright navigates for PDF render.
 */

import sharp from "sharp";
import {
  RENOV_HISTORIC_PREMIUM,
  RENOV_CONTINGENCY,
  RENOV_MAX_PCT_OF_PRICE,
  RENOV_MIN_PER_KEY,
} from "@shared/constants";
import { aggregateUnifiedByYear } from "@engine/aggregation/yearlyAggregator";
import { calculateLoanParams, getAcquisitionYear } from "@engine/debt/loanCalculations";
import { computeIRR } from "@analytics/returns/irr";
import type { PropertyInput, GlobalInput } from "@engine/types";
import { logger } from "../logger";
import { storage } from "../storage";
import { getStorageProviderAsync } from "../providers/storage";
import { recomputeSinglePropertyAndStamp } from "../finance/recompute";
import { withModelConstants } from "../finance/apply-model-constants";
import {
  parseDeckPayloadV2,
  EMPTY_DECK_PAYLOAD_V2,
  type DeckPayloadV2,
} from "@shared/deck-payload-v2";
import type { SlidePayload } from "./types";

const MAX_PHOTOS = 8;
const SIBLING_LIMIT = 4;

const SLIDES_DEFAULT_INFLATION_RATE = 0.03;
const SLIDES_DEFAULT_MARKETING_RATE = 0.01;
const SLIDES_DEFAULT_INTEREST_RATE = 0.065;
const SLIDES_DEFAULT_AMORTIZATION_YEARS = 25;
const SLIDES_DEFAULT_MAX_OCCUPANCY = 0.70;
const SLIDES_DEFAULT_EXIT_CAP_RATE = 0.07;

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
      const resp = await fetch(`http://localhost:${port}${url}`, { signal: AbortSignal.timeout(8_000) });
      if (!resp.ok) return null;
      const buf = Buffer.from(await resp.arrayBuffer());
      return { base64: buf.toString("base64"), isHero: photo.isHero, sortOrder: photo.sortOrder, caption: photo.caption ?? undefined };
    }
    if (url.startsWith("/objects/")) {
      const key = url.slice("/objects/".length);
      const storageProvider = await getStorageProviderAsync();
      const result = await storageProvider.downloadBuffer(key);
      if (!result) return null;
      return { base64: result.buffer.toString("base64"), isHero: photo.isHero, sortOrder: photo.sortOrder, caption: photo.caption ?? undefined };
    }
    return null;
  } catch (err) {
    logger.warn(`[resolvePhotoBytes] failed for ${photo.imageUrl}: ${err}`, "build-payload");
    return null;
  }
}

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

// ── Renovation budget ──────────────────────────────────────────────────────
// Source: hplus-renovation-benchmarks skill. Mid-point estimates with
// historic premium, contingency, and clamp bounds from @shared/constants.
const RENOV_COST_PER_KEY = {
  soft: 33_500,
  upscale: 110_000,
  upper_upscale: 195_000,
  luxury: 415_000,
} as const;
type RenovTier = keyof typeof RENOV_COST_PER_KEY;

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

export async function buildSlidePayload(
  propertyId: number,
  userId: number | undefined,
  projYears: number,
): Promise<SlidePayload & { _propertyName: string }> {
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

  // Portfolio siblings for the portfolio slide — sorted by acquisition date,
  // excluding current property, capped at SIBLING_LIMIT.
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
    logger.warn(`Failed to fetch portfolio properties for property ${propertyId}: ${e}`, "build-payload");
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
      const irrFlows = unified.yearlyCF.map(y => y.netCashFlowToInvestors ?? 0);
      const irrResult = computeIRR(irrFlows);
      irr = irrResult?.irr_annualized ?? undefined;
      const netSum = irrFlows.reduce((a, b) => a + b, 0);
      equityMultiple = (netSum + initialEquity) / initialEquity;
    }
  } catch (e) {
    logger.warn(`Finance compute failed for slides (empty financials): ${e}`, "build-payload");
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

  // The render path is LLM-free and fully deterministic. Editorial copy
  // (vision bullets, header subtitle, photo captions, closing tagline, etc.)
  // lives in the `property_deck_payloads` sidecar and is authored on the
  // admin LB-Slides page via /api/admin/properties/:id/deck-payload — see
  // routes/property-deck-payload.ts. If no row exists yet, `deckPayloadV2`
  // returns EMPTY_DECK_PAYLOAD_V2 and renderers fall back to deterministic
  // per-slot templates.
  let deckPayloadV2: DeckPayloadV2 = EMPTY_DECK_PAYLOAD_V2;
  try {
    const row = await storage.getDeckPayload(propertyId);
    if (row) deckPayloadV2 = parseDeckPayloadV2(row.payload);
  } catch (e) {
    logger.warn(`Failed to load deck payload sidecar for property ${propertyId}: ${e}`, "build-payload");
  }

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
    deckPayloadV2,
    slide4HeroBase64,
    _propertyName: property.name,
  };
}
