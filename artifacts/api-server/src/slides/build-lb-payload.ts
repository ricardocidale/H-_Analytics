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
import { buildSlidePayload, buildGlobalInput } from "./build-payload";
import { buildFactoryPayload } from "./build-factory-payload";
import { renderReportToPng } from "./render-report-png";
import type { ReportDefinition, TableRow, FormattedValue } from "../report/types";
import { recomputeSinglePropertyAndStamp } from "../finance/recompute";
import { withModelConstants } from "../finance/apply-model-constants";
import { EMPTY_DECK_PAYLOAD_V2 } from "@shared/deck-payload-v2";
import { DEFAULT_PROJECTION_YEARS, DEFAULT_EXIT_CAP_RATE } from "@shared/constants";
import type { SlidePayload, YearlyIS, YearlyCF, SiblingProperty } from "./types";
import type { SlideFactoryRun } from "@workspace/db";

export interface LbSlidePayload {
  slides: [SlidePayload, SlidePayload, SlidePayload, SlidePayload, SlidePayload, SlidePayload];
  config: {
    slide1PropertyId: number | null;
    slide2PropertyId: number | null;
    slide3PropertyId: number | null;
    slide5PropertyId: number | null;
  };
}

// ── USALI ReportDefinition adapter ────────────────────────────────────────
//
// Factory v2 U5 lifted the actual PNG rendering into `render-report-png.ts`
// (a generic `ReportDefinition` → PNG module). This adapter shapes the
// portfolio yearly IS/CF arrays into the same `ReportDefinition` shape the
// `format-generators/*` exporters consume, so the renderer stays purely
// generic and the call site stays purely about data.

const USALI_REPORT_TOKENS_PLACEHOLDER = {
  // The renderer module uses a fixed palette (see render-report-png.ts) so
  // these tokens are only required to satisfy the ReportDefinition shape.
  primary: "#1c2b1e",
  secondary: "#1c2b1e",
  accent: "#1c2b1e",
  foreground: "#222222",
  border: "#e8e8e5",
  muted: "#f7f7f4",
  surface: "#ffffff",
  background: "#ffffff",
  white: "#ffffff",
  negativeRed: "#b00020",
  chart: [] as string[],
  line: [] as string[],
};

function formatUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "(" : "";
  const end = n < 0 ? ")" : "";
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}${end}`;
}

const PCT_DECIMALS = 1; // 1 decimal place (e.g. "67.5%"); structural display choice.

function formatPct(n: number): string {
  // Multiply by 100 (percent-of-1 → percent display). The "100" is a
  // documented unit-conversion factor per CLAUDE.md §2 (true constant).
  const PERCENT_SCALE = 100;
  return `${(n * PERCENT_SCALE).toFixed(PCT_DECIMALS)}%`;
}

function fv(raw: number, text: string): FormattedValue {
  return { raw, text, negative: raw < 0 };
}

function makeRow(
  label: string,
  vals: number[],
  formatter: (n: number) => string,
  type: TableRow["type"],
  format?: string,
): TableRow {
  return {
    category: label,
    values: vals.map((v) => fv(v, formatter(v))),
    rawValues: vals,
    type,
    indent: 0,
    ...(format ? { format } : {}),
  };
}

/**
 * Adapt the portfolio yearly IS/CF aggregates into a `ReportDefinition`
 * suitable for the generic `renderReportToPng` module. Preserves the prior
 * inline implementation's row order, labels, and formatting so the rendered
 * PNG remains visually consistent with the pre-U5 slide 6 output.
 */
export function buildUsaliReportDefinition(
  yearlyIS: YearlyIS[],
  yearlyCF: YearlyCF[],
  projYears: number,
): ReportDefinition {
  const yrs = Math.min(yearlyIS.length, yearlyCF.length);
  const years = Array.from({ length: yrs }, (_, i) => `Yr ${i + 1}`);
  const sliceIS = yearlyIS.slice(0, yrs);
  const sliceCF = yearlyCF.slice(0, yrs);

  const occupancyVals = sliceIS.map((y) =>
    y.availableRooms > 0 ? y.soldRooms / y.availableRooms : 0,
  );

  const rows: TableRow[] = [
    makeRow("Revenue", sliceIS.map((y) => y.revenueTotal), formatUsd, "data"),
    makeRow("Operating Expenses", sliceIS.map((y) => y.totalExpenses), formatUsd, "data"),
    makeRow("Gross Operating Profit", sliceIS.map((y) => y.gop), formatUsd, "subtotal"),
    makeRow("NOI", sliceIS.map((y) => y.noi), formatUsd, "total"),
    makeRow("Debt Service", sliceCF.map((y) => y.debtService), formatUsd, "data", "section-break"),
    makeRow("Net Cash Flow", sliceCF.map((y) => y.netCashFlowToInvestors), formatUsd, "data"),
    makeRow("Cumulative Cash Flow", sliceCF.map((y) => y.cumulativeCashFlow), formatUsd, "data", "cumul"),
    makeRow("Occupancy", occupancyVals, formatPct, "data"),
    makeRow("ADR", sliceIS.map((y) => y.cleanAdr), formatUsd, "data"),
  ];

  return {
    cover: {
      companyName: "H+ Analytics",
      entityName: "Portfolio",
      reportTitle: `${projYears}-Year Portfolio Pro Forma — Income Statement (USD)`,
      // Date is not surfaced in the rendered PNG output (the renderer reads
      // only `sections[]`); empty string satisfies the type shape.
      date: "",
    },
    tokens: USALI_REPORT_TOKENS_PLACEHOLDER,
    orientation: "landscape",
    sections: [
      {
        kind: "table",
        title: `${projYears}-Year Portfolio Pro Forma — Income Statement (USD)`,
        years,
        rows,
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────

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
 * Build the aggregated pro forma payload for Slide 6.
 * Uses projectionYears from stored global assumptions (falls back to DEFAULT_PROJECTION_YEARS).
 * Runs the engine for each property and sums results across the portfolio.
 */
async function buildSlide6Payload(allPropertyIds: number[]): Promise<SlidePayload> {
  const storedGlobal = (await storage.getGlobalAssumptions(undefined)) as Record<string, unknown> | null;
  const ga = storedGlobal ?? {};
  const projYears = Number((ga as Record<string, unknown>).projectionYears ?? DEFAULT_PROJECTION_YEARS);
  const globalAssumptions = await withModelConstants(buildGlobalInput(ga, projYears) as unknown as GlobalInput);

  const perPropertyResults: PerPropertyResult[] = [];

  for (const id of allPropertyIds) {
    try {
      const property = await storage.getProperty(id) as PropertyRow | null;
      if (!property) continue;
      const stamped = { ...property, id } as unknown as PropertyInput;
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
  const maxYears = Math.max(...perPropertyResults.map(r => r.unified.yearlyIS.length), projYears);
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

  let usaliPngBase64: string | undefined;
  try {
    const usaliReport = buildUsaliReportDefinition(summedYearlyIS, summedYearlyCF, projYears);
    const pngBuffer = await renderReportToPng(usaliReport);
    usaliPngBase64 = pngBuffer.toString("base64");
  } catch (err) {
    logger.warn(`[build-lb-payload] Failed to render USALI table PNG: ${err}`, "build-lb-payload");
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
      exitCapRate: Number((ga as Record<string, unknown>).exitCapRate ?? DEFAULT_EXIT_CAP_RATE),
    },
    siblings: [],
    deckPayloadV2: EMPTY_DECK_PAYLOAD_V2,
    projYears,
    usaliMode: true,
    usaliPngBase64,
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
    buildSlidePayload(slide1PropertyId, undefined),
    buildSlidePayload(slide2PropertyId, undefined),
    buildSlidePayload(slide3PropertyId, undefined),
    buildSlidePayload(slide5PropertyId, undefined),
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

/**
 * Build the full LbSlidePayload from a slide-factory run instead of from
 * the legacy `lb_slides_config` table. The property data + photos +
 * financials assembly is shared with the legacy path (`buildSlidePayload`,
 * `buildSlide4Payload`, `buildSlide6Payload`); the only delta is that each
 * slide's `deckPayloadV2` is overlaid with the run's lucca-drafted slot
 * copy (via `buildFactoryPayload`) instead of the property's own published
 * copy.
 *
 * Caller is responsible for verifying the run's status is `complete`. This
 * function does not gate on status — that's the route layer's job.
 *
 * Throws if any of the four `slide<N>PropertyId` columns on the run is
 * unset or invalid (Marco's `transition_status` to `complete` should never
 * leave them unset, but defending here keeps the contract explicit).
 */
export async function buildLbPayloadFromFactoryRun(
  run: SlideFactoryRun,
): Promise<LbSlidePayload> {
  const slide1PropertyId = run.slide1PropertyId ?? null;
  const slide2PropertyId = run.slide2PropertyId ?? null;
  const slide3PropertyId = run.slide3PropertyId ?? null;
  const slide5PropertyId = run.slide5PropertyId ?? null;

  if (!slide1PropertyId || !slide2PropertyId || !slide3PropertyId || !slide5PropertyId) {
    throw new Error(
      `Slide factory run ${run.id} is not fully configured: ` +
      `all four properties (slides 1, 2, 3, 5) must be assigned before building the deck payload.`,
    );
  }

  const [s1, s2, s3, s5] = await Promise.all([
    buildSlidePayload(slide1PropertyId, undefined),
    buildSlidePayload(slide2PropertyId, undefined),
    buildSlidePayload(slide3PropertyId, undefined),
    buildSlidePayload(slide5PropertyId, undefined),
  ]);

  const allProps = await storage.getAllProperties(undefined);
  const allPropertyIds = allProps.map((p) => p.id);

  const s4 = await buildSlide4Payload(allPropertyIds, s1);
  const s6 = await buildSlide6Payload(allPropertyIds);

  // Overlay: replace each slide's `.deckPayloadV2` with the run's lucca-drafted
  // slot copy. The factory's DeckPayloadV2 carries all 6 slide slices; every
  // SlidePayload.deckPayloadV2 references the SAME shared object (each slide
  // reads its own slice via `deckPayloadV2.slide<N>` on the React side, so
  // sharing one object across all slides is correct).
  const factoryDeckPayloadV2 = buildFactoryPayload(run);
  const slides: LbSlidePayload["slides"] = [
    { ...s1, deckPayloadV2: factoryDeckPayloadV2 },
    { ...s2, deckPayloadV2: factoryDeckPayloadV2 },
    { ...s3, deckPayloadV2: factoryDeckPayloadV2 },
    { ...s4, deckPayloadV2: factoryDeckPayloadV2 },
    { ...s5, deckPayloadV2: factoryDeckPayloadV2 },
    { ...s6, deckPayloadV2: factoryDeckPayloadV2 },
  ];

  return {
    slides,
    config: { slide1PropertyId, slide2PropertyId, slide3PropertyId, slide5PropertyId },
  };
}
