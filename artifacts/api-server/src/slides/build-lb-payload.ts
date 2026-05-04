/**
 * build-lb-payload.ts
 *
 * Assembles the composite LbSlidePayload for the ONE portfolio investor deck
 * ("LB Slide Deck"). Each of the 6 slides receives its own SlidePayload:
 *
 *   Slide 1 — admin-assigned property (Pipeline Spotlight)
 *   Slide 2 — admin-assigned property (Photo Gallery)
 *   Slide 3 — admin-assigned property (Investment Model)
 *   Slide 4 — auto: portfolio grid (ALL properties as siblings)
 *   Slide 5 — admin-assigned property (Financial Snapshot)
 *   Slide 6 — auto: 10-year aggregated pro forma (sum across all properties)
 *
 * See docs/solutions/architecture-patterns/lb-deck-composite-payload-architecture-2026-05-04.md
 * for the full design rationale (Option B: single Playwright pass).
 */

import { aggregateUnifiedByYear } from "@engine/aggregation/yearlyAggregator";
import { calculateLoanParams } from "@engine/debt/loanCalculations";
import { computeIRR } from "@analytics/returns/irr";
import type { PropertyInput, GlobalInput } from "@engine/types";
import { logger } from "../logger";
import { storage } from "../storage";
import { buildSlidePayload } from "./build-payload";
import { recomputeSinglePropertyAndStamp } from "../finance/recompute";
import { withModelConstants } from "../finance/apply-model-constants";
import { EMPTY_DECK_PAYLOAD_V2 } from "@shared/deck-payload-v2";
import type { SlidePayload, YearlyIS, YearlyCF, SiblingProperty } from "./types";

const LB_PROJ_YEARS = 10;
const SLIDES_DEFAULT_INFLATION_RATE = 0.03;
const SLIDES_DEFAULT_MARKETING_RATE = 0.01;
const SLIDES_DEFAULT_INTEREST_RATE = 0.065;
const SLIDES_DEFAULT_AMORTIZATION_YEARS = 25;
const SLIDES_DEFAULT_EXIT_CAP_RATE = 0.07;

export interface LbSlidePayload {
  slides: [SlidePayload, SlidePayload, SlidePayload, SlidePayload, SlidePayload, SlidePayload];
  config: {
    slide1PropertyId: number | null;
    slide2PropertyId: number | null;
    slide3PropertyId: number | null;
    slide5PropertyId: number | null;
  };
}

function buildGlobalInputLb(projYears: number): Record<string, unknown> {
  return {
    modelStartDate: String(new Date().getFullYear()),
    inflationRate: SLIDES_DEFAULT_INFLATION_RATE,
    marketingRate: SLIDES_DEFAULT_MARKETING_RATE,
    debtAssumptions: {
      interestRate: SLIDES_DEFAULT_INTEREST_RATE,
      amortizationYears: SLIDES_DEFAULT_AMORTIZATION_YEARS,
    },
    projectionYears: projYears,
  };
}

interface PropertyRow {
  id: number;
  name: string;
  city?: string | null;
  stateProvince?: string | null;
  purchasePrice?: number | null;
  roomCount?: number | null;
  businessModel?: string | null;
  [key: string]: unknown;
}

/**
 * Build the portfolio grid payload for Slide 4.
 * Reuses one of the assigned property's payload but replaces `siblings`
 * with ALL portfolio properties (not excluding any).
 */
async function buildSlide4Payload(
  allPropertyIds: number[],
  anchorPayload: SlidePayload,
): Promise<SlidePayload> {
  const siblings: SiblingProperty[] = [];
  for (const id of allPropertyIds) {
    try {
      const prop = await storage.getProperty(id) as PropertyRow | null;
      if (!prop) continue;
      const hero = await storage.getHeroPhoto(id);
      let heroPhotoBase64: string | undefined;
      if (hero?.imageData) {
        heroPhotoBase64 = hero.imageData;
      } else if (hero?.imageUrl?.startsWith("/objects/")) {
        try {
          const { getStorageProviderAsync } = await import("../providers/storage");
          const storageProvider = await getStorageProviderAsync();
          const key = (hero.imageUrl as string).slice("/objects/".length);
          const result = await storageProvider.downloadBuffer(key);
          if (result?.buffer) {
            const { default: sharp } = await import("sharp");
            const small = await sharp(result.buffer)
              .resize(480, 320, { fit: "cover" })
              .jpeg({ quality: 82 })
              .toBuffer();
            heroPhotoBase64 = small.toString("base64");
          }
        } catch {
          // no thumbnail — grid works without it
        }
      }
      siblings.push({
        id: prop.id,
        name: prop.name,
        city: (prop.city as string | undefined) ?? undefined,
        stateProvince: (prop.stateProvince as string | undefined) ?? undefined,
        purchasePrice: (prop.purchasePrice as number | undefined) ?? undefined,
        hospitalityType: ((prop.hospitalityType ?? prop.businessModel) as string | undefined) ?? undefined,
        acquisitionStatus: (prop.acquisitionStatus as string | undefined) ?? undefined,
        heroPhotoBase64,
      });
    } catch {
      // skip property on error — grid degrades gracefully
    }
  }

  return { ...anchorPayload, siblings };
}

interface PerPropertyResult {
  unified: ReturnType<typeof aggregateUnifiedByYear>;
  loan: ReturnType<typeof calculateLoanParams>;
  roomCount: number;
  purchasePrice: number;
}

/**
 * Build the aggregated 10-year pro forma payload for Slide 6.
 * Runs the engine for each property at 10 projection years and sums results.
 */
async function buildSlide6Payload(allPropertyIds: number[]): Promise<SlidePayload> {
  const rawGlobal = buildGlobalInputLb(LB_PROJ_YEARS);
  const globalAssumptions = await withModelConstants(rawGlobal as unknown as GlobalInput);

  const perPropertyResults: PerPropertyResult[] = [];

  for (const id of allPropertyIds) {
    try {
      const property = await storage.getProperty(id) as PropertyRow | null;
      if (!property) continue;
      const stamped = { ...property, id } as unknown as PropertyInput;
      const compute = await recomputeSinglePropertyAndStamp({
        property: stamped,
        globalAssumptions: globalAssumptions as GlobalInput,
        projectionYears: LB_PROJ_YEARS,
      });
      const stampedLoanProps = stamped as unknown as Parameters<typeof calculateLoanParams>[0];
      const unified = aggregateUnifiedByYear(
        compute.monthly,
        stampedLoanProps,
        globalAssumptions as GlobalInput,
        compute.projectionYears,
      );
      const loan = calculateLoanParams(stampedLoanProps, globalAssumptions as GlobalInput);
      perPropertyResults.push({
        unified,
        loan,
        roomCount: (property.roomCount as number | null) ?? 0,
        purchasePrice: (property.purchasePrice as number | null) ?? 0,
      });
    } catch (err) {
      logger.warn(`[build-lb-payload] Failed to compute property ${id} for Slide 6: ${err}`, "build-lb-payload");
    }
  }

  if (perPropertyResults.length === 0) {
    logger.warn("[build-lb-payload] No properties computed for Slide 6 — returning zero financials", "build-lb-payload");
  }

  // Sum yearlyIS across all properties for each year index
  const maxYears = Math.max(...perPropertyResults.map(r => r.unified.yearlyIS.length), LB_PROJ_YEARS);
  const summedYearlyIS: YearlyIS[] = [];

  for (let yi = 0; yi < maxYears; yi++) {
    const base: YearlyIS = {
      year: yi + 1,
      revenueTotal: 0, totalExpenses: 0, noi: 0, gop: 0,
      operationalMonthsInYear: 12, soldRooms: 0, availableRooms: 0, cleanAdr: 0,
    };
    let adrCount = 0;
    for (const r of perPropertyResults) {
      const row = r.unified.yearlyIS[yi] as unknown as YearlyIS | undefined;
      if (!row) continue;
      base.revenueTotal += (row.revenueTotal as number) || 0;
      base.totalExpenses += (row.totalExpenses as number) || 0;
      base.noi += (row.noi as number) || 0;
      base.gop += (row.gop as number) || 0;
      base.soldRooms += (row.soldRooms as number) || 0;
      base.availableRooms += (row.availableRooms as number) || 0;
      if (row.cleanAdr) { base.cleanAdr += (row.cleanAdr as number); adrCount++; }
    }
    if (adrCount > 0) base.cleanAdr = base.cleanAdr / adrCount;
    summedYearlyIS.push(base);
  }

  // Sum yearlyCF across all properties for each year index
  const summedYearlyCF: YearlyCF[] = [];
  let cumulativeCF = 0;
  for (let yi = 0; yi < maxYears; yi++) {
    const base: YearlyCF = { year: yi + 1, debtService: 0, netCashFlowToInvestors: 0, cumulativeCashFlow: 0, exitValue: 0 };
    for (const r of perPropertyResults) {
      const row = r.unified.yearlyCF[yi] as YearlyCF | undefined;
      if (!row) continue;
      base.debtService += (row.debtService as number) || 0;
      base.netCashFlowToInvestors += (row.netCashFlowToInvestors as number) || 0;
      if (yi === maxYears - 1) base.exitValue += (row.exitValue as number) || 0;
    }
    cumulativeCF += base.netCashFlowToInvestors;
    base.cumulativeCashFlow = cumulativeCF;
    summedYearlyCF.push(base);
  }

  // Portfolio-level summary metrics
  const totalEquity = perPropertyResults.reduce((s, r) => s + (r.loan.equityInvested > 0 ? r.loan.equityInvested : 0), 0);
  const totalLoanAmount = perPropertyResults.reduce((s, r) => s + (r.loan.loanAmount ?? 0), 0);
  const totalAnnualDebtService = perPropertyResults.reduce((s, r) => s + ((r.loan.monthlyPayment ?? 0) * 12), 0);
  const totalPurchasePrice = perPropertyResults.reduce((s, r) => s + r.purchasePrice, 0);
  const totalRoomCount = perPropertyResults.reduce((s, r) => s + r.roomCount, 0);
  const portfolioLtv = (totalPurchasePrice + totalLoanAmount) > 0 ? totalLoanAmount / (totalPurchasePrice + totalLoanAmount) : 0;
  const exitValue = summedYearlyCF[summedYearlyCF.length - 1]?.exitValue ?? 0;

  let irr: number | undefined;
  let equityMultiple: number | undefined;
  if (summedYearlyCF.length > 0 && totalEquity > 0) {
    try {
      const irrFlows = summedYearlyCF.map(y => y.netCashFlowToInvestors);
      const irrResult = computeIRR(irrFlows);
      irr = irrResult?.irr_annualized ?? undefined;
      const netSum = irrFlows.reduce((a, b) => a + b, 0);
      equityMultiple = (netSum + totalEquity + exitValue) / totalEquity;
    } catch { /* leave undefined */ }
  }

  return {
    property: {
      id: 0,
      name: "Portfolio — Combined Properties",
      city: "", stateProvince: "", county: "", country: "",
      purchasePrice: totalPurchasePrice,
      roomCount: totalRoomCount,
      startAdr: 0, maxOccupancy: 0.7,
      businessModel: "portfolio",
      hospitalityType: "Portfolio", qualityTier: "", description: "",
      acquisitionStatus: "portfolio",
    },
    photos: [],
    financials: {
      yearlyIS: summedYearlyIS,
      yearlyCF: summedYearlyCF,
      loanAmount: totalLoanAmount,
      loanLtv: portfolioLtv,
      annualDebtService: totalAnnualDebtService,
      renovationBudget: 0,
      irr,
      equityMultiple,
      exitCapRate: SLIDES_DEFAULT_EXIT_CAP_RATE,
    },
    siblings: [],
    deckPayloadV2: EMPTY_DECK_PAYLOAD_V2,
    projYears: LB_PROJ_YEARS,
    usaliMode: true,
  };
}

/**
 * Build the full LbSlidePayload — one composite object with 6 per-slide payloads.
 * Throws if any assigned property ID is missing/invalid.
 */
export async function buildLbPayload(): Promise<LbSlidePayload> {
  const config = await storage.getLbSlidesConfig();

  const slide1PropertyId = config?.slide1PropertyId ?? null;
  const slide2PropertyId = config?.slide2PropertyId ?? null;
  const slide3PropertyId = config?.slide3PropertyId ?? null;
  const slide5PropertyId = config?.slide5PropertyId ?? null;

  if (!slide1PropertyId || !slide2PropertyId || !slide3PropertyId || !slide5PropertyId) {
    throw new Error(
      "LB Slide Deck is not fully configured. Please assign all four properties " +
      "(slides 1, 2, 3, 5) in the LB Slides admin page.",
    );
  }

  const [s1, s2, s3, s5] = await Promise.all([
    buildSlidePayload(slide1PropertyId, undefined, 5),
    buildSlidePayload(slide2PropertyId, undefined, 5),
    buildSlidePayload(slide3PropertyId, undefined, 5),
    buildSlidePayload(slide5PropertyId, undefined, 5),
  ]);

  const allProps = await storage.getAllProperties(undefined);
  const allPropertyIds = allProps.map(p => p.id);

  const s4 = await buildSlide4Payload(allPropertyIds, s1);
  const s6 = await buildSlide6Payload(allPropertyIds);

  return {
    slides: [s1, s2, s3, s4, s5, s6],
    config: { slide1PropertyId, slide2PropertyId, slide3PropertyId, slide5PropertyId },
  };
}
