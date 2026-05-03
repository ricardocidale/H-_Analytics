/**
 * exports/index.ts — Barrel file for the export system
 *
 * Re-exports all export functions so the rest of the app can import from a
 * single path: `@/lib/exports`. Covers Excel (.xlsx), PowerPoint (.pptx),
 * PDF, PNG screenshot, and CSV export formats.
 *
 * Shared formatting / styling modules:
 *   exportStyles.ts  — brand palette, row classification, number formatting
 *   pdfHelpers.ts    — jsPDF page layout, tables, footers
 *   pptxExport.ts    — pptxgenjs slide generation (uses exportStyles)
 */
export {
  exportPropertyIncomeStatement,
  exportPropertyCashFlow,
  exportPropertyBalanceSheet,
  exportCompanyIncomeStatement,
  exportCompanyCashFlow,
  exportCompanyBalanceSheet,
  exportFullPropertyWorkbook,
} from "./excelExport";

export { drawLineChart } from "./pdfChartDrawer";

export {
  exportTablePNG,
  exportChartPNG,
  captureChartAsImage,
} from "./pngExport";

export { downloadCSV } from "./csvExport";

export {
  BRAND,
  classifyRow,
  normalizeCaps,
  formatShort,
  formatFull,
  formatPct,
  indentLabel,
  pptxFontSize,
  pptxColumnWidths,
} from "./exportStyles";
export type { ExportRowMeta } from "./exportStyles";

export {
  drawBrandedHeader,
  drawTitle,
  drawSubtitle,
  drawSubtitleRow,
  drawDashboardSummaryPage,
  drawSectionHeader,
  drawParagraph,
  drawKeyValue,
  buildFinancialTableConfig,
  addFooters,
} from "./pdfHelpers";

export {
  exportPortfolioPPTX,
  exportPropertyPPTX,
  exportCompanyPPTX,
} from "./pptxExport";
export type {
  PortfolioExportData,
  PropertyExportData,
  CompanyExportData,
} from "./pptxExport";

export {
  headerRow,
  lineItem,
  subtotalRow,
  spacerRow,
  formulaRow,
  perPropertyRows,
  yearValues,
  consolidate,
  toExportShape,
} from "./row-builders";
export type { ExportRow, ExportData } from "./row-builders";
