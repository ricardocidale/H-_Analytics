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
import { getBrowser } from "./playwright-browser";
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

// ── USALI PNG renderer ────────────────────────────────────────────────────

const USALI_TABLE_VIEWPORT_WIDTH = 1180;
const USALI_TABLE_VIEWPORT_HEIGHT = 600;
const USALI_DEVICE_SCALE_FACTOR = 2;
const USALI_CSS_FW_NORMAL = 500;
const USALI_CSS_FW_MEDIUM = 600;
const USALI_CSS_FW_BOLD = 700;
const USALI_CSS_TABLE_WIDTH = "100%";
const USALI_CSS_LABEL_COL_WIDTH = 160;

function buildUsaliTableHtml(yearlyIS: YearlyIS[], yearlyCF: YearlyCF[], projYears: number): string {
  const yrs = Math.min(yearlyIS.length, yearlyCF.length);
  const fmt = (n: number): string => {
    const abs = Math.abs(n);
    const sign = n < 0 ? "(" : "";
    const end = n < 0 ? ")" : "";
    return `${sign}$${Math.round(abs).toLocaleString("en-US")}${end}`;
  };
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

  const headers = ["", ...Array.from({ length: yrs }, (_, i) => `Yr ${i + 1}`)];

  type Row = { label: string; vals: number[]; cls?: string };
  const rows: Row[] = [
    { label: "Revenue", vals: yearlyIS.map(y => y.revenueTotal) },
    { label: "Operating Expenses", vals: yearlyIS.map(y => y.totalExpenses) },
    { label: "Gross Operating Profit", vals: yearlyIS.map(y => y.gop), cls: "subtotal" },
    { label: "NOI", vals: yearlyIS.map(y => y.noi), cls: "noi" },
    { label: "Debt Service", vals: yearlyCF.map(y => y.debtService), cls: "section-break" },
    { label: "Net Cash Flow", vals: yearlyCF.map(y => y.netCashFlowToInvestors) },
    { label: "Cumulative Cash Flow", vals: yearlyCF.map(y => y.cumulativeCashFlow), cls: "cumul" },
  ];

  // ADR row uses averages already stored on yearlyIS
  const occupancyRow: Row = {
    label: "Occupancy",
    vals: yearlyIS.map(y => y.availableRooms > 0 ? y.soldRooms / y.availableRooms : 0),
  };
  const adrRow: Row = { label: "ADR", vals: yearlyIS.map(y => y.cleanAdr) };

  const renderRow = (r: Row, isOcc = false): string => {
    const cells = r.vals.slice(0, yrs).map(v => {
      const display = isOcc ? pct(v) : fmt(v);
      return `<td>${display}</td>`;
    }).join("");
    return `<tr class="${r.cls ?? ""}"><td>${r.label}</td>${cells}</tr>`;
  };

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#fff;font-family:system-ui,-apple-system,sans-serif;padding:18px 20px 22px 20px}
  h4{font-size:10px;font-weight:${USALI_CSS_FW_BOLD};color:#1c2b1e;margin-bottom:12px;letter-spacing:.12em;text-transform:uppercase}
  table{border-collapse:collapse;width:${USALI_CSS_TABLE_WIDTH};font-size:11px}
  th{background:#1c2b1e;color:#f5f0e8;text-align:right;padding:7px 9px;font-weight:${USALI_CSS_FW_MEDIUM};font-size:10px;letter-spacing:.04em;white-space:nowrap}
  th:first-child{text-align:left;min-width:${USALI_CSS_LABEL_COL_WIDTH}px}
  td{padding:6px 9px;border-bottom:1px solid #e8e8e5;text-align:right;color:#222;white-space:nowrap;font-variant-numeric:tabular-nums}
  td:first-child{text-align:left;color:#333;font-weight:${USALI_CSS_FW_NORMAL}}
  tr:nth-child(even) td{background:#f7f7f4}
  .subtotal td{font-weight:${USALI_CSS_FW_MEDIUM};border-top:1px solid #ccc}
  .noi td{font-weight:${USALI_CSS_FW_BOLD};color:#1a6b38;border-top:1px solid #1c2b1e;border-bottom:2px solid #1c2b1e}
  .section-break td{border-top:2px solid #d0d0d0}
  .cumul td{color:#555;font-style:italic}
  .dim td{color:#888;font-size:10px}
</style></head><body>
<h4>${projYears}-Year Portfolio Pro Forma — Income Statement (USD)</h4>
<table>
  <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
  <tbody>
    ${rows.map(r => renderRow(r)).join("\n    ")}
    ${renderRow(occupancyRow, true)}
    ${renderRow(adrRow)}
  </tbody>
</table>
</body></html>`;
}

async function renderUsaliTablePng(yearlyIS: YearlyIS[], yearlyCF: YearlyCF[], projYears: number): Promise<string> {
  const html = buildUsaliTableHtml(yearlyIS, yearlyCF, projYears);
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: USALI_TABLE_VIEWPORT_WIDTH, height: USALI_TABLE_VIEWPORT_HEIGHT },
    deviceScaleFactor: USALI_DEVICE_SCALE_FACTOR,
  });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const screenshot = await page.screenshot({ fullPage: true });
    return screenshot.toString("base64");
  } finally {
    await context.close().catch(() => {});
  }
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
    usaliPngBase64 = await renderUsaliTablePng(summedYearlyIS, summedYearlyCF, projYears);
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
