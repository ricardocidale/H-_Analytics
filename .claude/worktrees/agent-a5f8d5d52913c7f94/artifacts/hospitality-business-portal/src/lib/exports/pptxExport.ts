/**
 * pptxExport.ts — PowerPoint (.pptx) presentation generation
 *
 * Generates branded investor-ready slide decks using the pptxgenjs library.
 * All presentations use 16:9 landscape (LAYOUT_WIDE = 13.33" × 7.5").
 *
 * Three export targets:
 *   1. Portfolio — consolidated multi-property investment summary
 *   2. Property — single-property financial report
 *   3. Company — management company financial report
 *
 * Design rules (shared with PDF via exportStyles.ts):
 *   • Title slides include descriptive title, projection range subtitle,
 *     and right-aligned source tag identifying the report scope
 *   • Financial table slides show the statement name as title and
 *     a right-aligned source tag (e.g., "Income Statement — Consolidated")
 *   • Section headers — bold, section-bg fill, Title Case (not ALL CAPS)
 *   • Numbers — short format ($1.2M, $450K) for readability
 *   • Footer — company name (left) + page number (right) on every slide
 *   • Table framed with sage-green outer border
 */
import { APP_BRAND_NAME } from "@shared/constants";
import {
  type ExportRowMeta,
  type ThemeColor,
  buildBrandPalette,
} from "./exportStyles";
import type { OverviewExportData } from "../../components/dashboard/overviewExportData";
import {
  type SlideContext,
  addAllFooters,
  addTitleSlide,
  addMetricsSlide,
  addFinancialTableSlide,
  addOverviewSlides,
} from "./pptx/slide-helpers";

export type { SlideContext };

export interface PortfolioExportData {
  projectionYears: number;
  getFiscalYear: (i: number) => number;
  totalInitialEquity: number;
  totalExitValue: number;
  equityMultiple: number;
  portfolioIRR: number;
  portfolioMIRR?: number;
  cashOnCash: number;
  totalProperties: number;
  totalRooms: number;
  totalProjectionRevenue: number;
  totalProjectionNOI: number;
  totalProjectionCashFlow: number;
  incomeData: { years: string[]; rows: ExportRowMeta[] };
  cashFlowData: { years: string[]; rows: ExportRowMeta[] };
  balanceSheetData: { years: string[]; rows: ExportRowMeta[] };
  investmentData: { years: string[]; rows: ExportRowMeta[] };
  overviewData?: OverviewExportData;
}

export async function exportPortfolioPPTX(data: PortfolioExportData, companyName = APP_BRAND_NAME, customFilename?: string, themeColors?: ThemeColor[]) {
  const pptxgen = (await import("pptxgenjs")).default;
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.author = companyName;
  pres.title = "Consolidated Portfolio Investment Report";

  const ctx: SlideContext = { pres, companyName, brand: buildBrandPalette(themeColors) };
  const yearRange = `${data.getFiscalYear(0)}\u2013${data.getFiscalYear(data.projectionYears - 1)}`;

  addTitleSlide(
    ctx,
    "Consolidated Portfolio Investment Report",
    `${data.projectionYears}-Year Financial Projection (${yearRange})`,
    `Portfolio \u2014 ${data.totalProperties} Properties, ${data.totalRooms} Rooms`,
  );

  addMetricsSlide(
    ctx,
    "Portfolio Investment Summary",
    `Key performance indicators across ${data.totalProperties} properties over ${data.projectionYears} years`,
    `Consolidated Portfolio \u2014 ${data.totalProperties} Properties`,
    [
      { label: "Total Equity Invested", value: `$${(data.totalInitialEquity / 1_000_000).toFixed(1)}M` },
      { label: `Projected Exit Value (Year ${data.projectionYears})`, value: `$${(data.totalExitValue / 1_000_000).toFixed(1)}M` },
      { label: "Equity Multiple", value: `${data.equityMultiple.toFixed(2)}x` },
      { label: "Portfolio IRR", value: `${(data.portfolioIRR * 100).toFixed(1)}%` },
      { label: "Portfolio MIRR", value: data.portfolioMIRR != null ? `${(data.portfolioMIRR * 100).toFixed(1)}%` : "N/A" },
      { label: "Avg Cash-on-Cash Return", value: `${data.cashOnCash.toFixed(1)}%` },
      { label: "Properties / Total Rooms", value: `${data.totalProperties} / ${data.totalRooms}` },
      { label: `Cumulative ${data.projectionYears}-Year Revenue`, value: `$${(data.totalProjectionRevenue / 1_000_000).toFixed(1)}M` },
      { label: `Cumulative ${data.projectionYears}-Year NOI`, value: `$${(data.totalProjectionNOI / 1_000_000).toFixed(1)}M` },
      { label: `Cumulative ${data.projectionYears}-Year Cash Flow`, value: `$${(data.totalProjectionCashFlow / 1_000_000).toFixed(1)}M` },
    ],
  );

  if (data.overviewData) {
    addOverviewSlides(ctx, data.overviewData, data.projectionYears);
  }

  const entityTag = `Consolidated Portfolio \u2014 ${data.totalProperties} Properties`;
  addFinancialTableSlide(ctx, "Consolidated Income Statement (USALI)", entityTag, data.incomeData.years, data.incomeData.rows);
  addFinancialTableSlide(ctx, "Consolidated Cash Flow Statement", entityTag, data.cashFlowData.years, data.cashFlowData.rows);
  addFinancialTableSlide(ctx, "Consolidated Balance Sheet", entityTag, data.balanceSheetData.years, data.balanceSheetData.rows);
  addFinancialTableSlide(ctx, "Portfolio Investment Analysis", entityTag, data.investmentData.years, data.investmentData.rows);

  addAllFooters(ctx);
  const { saveFile } = await import("./saveFile");
  const pptxBlob = await pres.write({ outputType: "blob" }) as Blob;
  await saveFile(pptxBlob, customFilename || "Portfolio-Investment-Report.pptx");
}

export interface PropertyExportData {
  propertyName: string;
  projectionYears: number;
  getFiscalYear: (i: number) => string;
  incomeData: { years: string[]; rows: ExportRowMeta[] };
  cashFlowData: { years: string[]; rows: ExportRowMeta[] };
  balanceSheetData: { years: string[]; rows: ExportRowMeta[] };
  investmentData?: { years: string[]; rows: ExportRowMeta[] };
  kpiMetrics?: { label: string; value: string }[];
}

export async function exportPropertyPPTX(data: PropertyExportData, companyName = APP_BRAND_NAME, customFilename?: string, themeColors?: ThemeColor[]) {
  const pptxgen = (await import("pptxgenjs")).default;
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.author = companyName;
  pres.title = `${data.propertyName} \u2014 Financial Report`;

  const ctx: SlideContext = { pres, companyName, brand: buildBrandPalette(themeColors) };
  const yearRange = `${data.getFiscalYear(0)}\u2013${data.getFiscalYear(data.projectionYears - 1)}`;

  addTitleSlide(
    ctx,
    `${data.propertyName} \u2014 Financial Report`,
    `${data.projectionYears}-Year Financial Projection (${yearRange})`,
    data.propertyName,
  );

  if (data.kpiMetrics && data.kpiMetrics.length > 0) {
    addMetricsSlide(
      ctx,
      `${data.propertyName} \u2014 Key Metrics`,
      `${data.projectionYears}-Year financial highlights`,
      data.propertyName,
      data.kpiMetrics,
    );
  }

  addFinancialTableSlide(ctx, `${data.propertyName} \u2014 Income Statement (USALI)`, data.propertyName, data.incomeData.years, data.incomeData.rows);
  addFinancialTableSlide(ctx, `${data.propertyName} \u2014 Cash Flow Statement`, data.propertyName, data.cashFlowData.years, data.cashFlowData.rows);
  addFinancialTableSlide(ctx, `${data.propertyName} \u2014 Balance Sheet`, data.propertyName, data.balanceSheetData.years, data.balanceSheetData.rows);
  if (data.investmentData) {
    addFinancialTableSlide(ctx, `${data.propertyName} \u2014 Investment Analysis`, data.propertyName, data.investmentData.years, data.investmentData.rows);
  }

  const safeName = data.propertyName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 30);
  addAllFooters(ctx);
  const { saveFile } = await import("./saveFile");
  const pptxBlob = await pres.write({ outputType: "blob" }) as Blob;
  await saveFile(pptxBlob, customFilename || `${safeName} - Financial Report.pptx`);
}

export interface CompanyExportData {
  projectionYears: number;
  getFiscalYear: (i: number) => string;
  incomeData: { years: string[]; rows: ExportRowMeta[] };
  cashFlowData: { years: string[]; rows: ExportRowMeta[] };
  balanceSheetData: { years: string[]; rows: ExportRowMeta[] };
  companyName?: string;
  kpiMetrics?: { label: string; value: string }[];
}

export async function exportCompanyPPTX(data: CompanyExportData, companyName = APP_BRAND_NAME, customFilename?: string, themeColors?: ThemeColor[]) {
  const pptxgen = (await import("pptxgenjs")).default;
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.author = companyName;
  pres.title = `${companyName} \u2014 Management Company Financial Report`;

  const ctx: SlideContext = { pres, companyName, brand: buildBrandPalette(themeColors) };
  const yearRange = `${data.getFiscalYear(0)}\u2013${data.getFiscalYear(data.projectionYears - 1)}`;

  addTitleSlide(
    ctx,
    `${companyName} \u2014 Management Company Financial Report`,
    `${data.projectionYears}-Year Financial Projection (${yearRange})`,
    companyName,
  );

  if (data.kpiMetrics && data.kpiMetrics.length > 0) {
    addMetricsSlide(
      ctx,
      `${companyName} \u2014 Management Company Key Metrics`,
      `${data.projectionYears}-Year financial highlights`,
      `${companyName} \u2014 Management Company`,
      data.kpiMetrics,
    );
  }

  const entityTag = `${companyName} \u2014 Management Company`;
  addFinancialTableSlide(ctx, `${companyName} \u2014 Income Statement`, entityTag, data.incomeData.years, data.incomeData.rows);
  addFinancialTableSlide(ctx, `${companyName} \u2014 Cash Flow Statement`, entityTag, data.cashFlowData.years, data.cashFlowData.rows);
  addFinancialTableSlide(ctx, `${companyName} \u2014 Balance Sheet`, entityTag, data.balanceSheetData.years, data.balanceSheetData.rows);

  addAllFooters(ctx);
  const { saveFile } = await import("./saveFile");
  const pptxBlob = await pres.write({ outputType: "blob" }) as Blob;
  await saveFile(pptxBlob, customFilename || "Management-Company-Report.pptx");
}
