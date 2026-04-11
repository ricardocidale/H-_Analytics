import { APP_BRAND_NAME } from "@shared/constants";
import { format } from "date-fns";
import { drawLineChart } from "@/lib/exports/pdfChartDrawer";
import { buildFinancialTableConfig, addFooters, drawTitle, drawSubtitle, drawSubtitleRow } from "@/lib/exports/pdfHelpers";
import { PAGE_DIMS, type ThemeColor, buildBrandPalette } from "@/lib/exports/exportStyles";
import type { ExportRow } from "./statementBuilders";
import type { YearlyPropertyFinancials } from "@/lib/financial/yearlyAggregator";

export async function exportPortfolioPDF(
  orientation: "landscape" | "portrait",
  projectionYears: number,
  years: number[],
  rows: ExportRow[],
  getYearlyConsolidated: (i: number) => YearlyPropertyFinancials,
  title: string,
  companyName = APP_BRAND_NAME,
  customFilename?: string,
  themeColors?: ThemeColor[]
): Promise<void> {
  const jsPDF = (await import("jspdf")).default;
  const autoTable = (await import("jspdf-autotable")).default;
  const dims = orientation === "landscape"
    ? { w: PAGE_DIMS.LANDSCAPE_W, h: PAGE_DIMS.LANDSCAPE_H }
    : { w: PAGE_DIMS.PORTRAIT_W, h: PAGE_DIMS.PORTRAIT_H };
  const doc = new jsPDF({ orientation, unit: "mm", format: [dims.w, dims.h] });
  const brand = buildBrandPalette(themeColors);

  const pageWidth = dims.w;
  const entityTag = `${companyName} \u2014 Consolidated Portfolio`;
  const projRange = `${years[0]} \u2013 ${years[projectionYears - 1]}`;

  drawTitle(doc, `${companyName} \u2014 ${title}`, 14, 15, undefined, brand);
  drawSubtitleRow(doc,
    `${projectionYears}-Year Projection (${projRange})`,
    entityTag, 14, 22, pageWidth, undefined, brand);
  drawSubtitle(doc, `Generated: ${format(new Date(), "MMM d, yyyy")}`, 14, 27, undefined, brand);

  const tableConfig = buildFinancialTableConfig(years, rows, orientation, 32, brand);
  autoTable(doc, tableConfig);

  const portfolioFinalY = doc.lastAutoTable?.finalY ?? 100;
  if (portfolioFinalY > 40) doc.addPage();
  drawTitle(doc, `${companyName} \u2014 ${title} Performance Trend`, 14, 15, { fontSize: 16 }, brand);
  drawSubtitleRow(doc,
    `${projectionYears}-Year Revenue, Operating Expenses, and Adjusted NOI Trend`,
    entityTag, 14, 22, pageWidth, undefined, brand);

  const chartData = years.map((year, i) => ({
    label: String(year),
    value: getYearlyConsolidated(i)?.revenueTotal ?? 0,
  }));
  const noiData = years.map((year, i) => {
    const d = getYearlyConsolidated(i);
    return { label: String(year), value: d?.noi ?? 0 };
  });
  const expenseData = years.map((year, i) => ({
    label: String(year),
    value: getYearlyConsolidated(i)?.totalExpenses ?? 0,
  }));

  drawLineChart({
    doc,
    x: 14,
    y: 30,
    width: orientation === "landscape" ? 269 : 183,
    height: orientation === "landscape" ? 150 : 200,
    title: `Portfolio Performance (${projectionYears}-Year Projection)`,
    series: [
      { name: "Revenue", data: chartData, color: `#${brand.LINE_HEX[0]}` },
      { name: "Operating Expenses", data: expenseData, color: `#${brand.LINE_HEX[1] || brand.SECONDARY_HEX}` },
      { name: "ANOI", data: noiData, color: `#${brand.LINE_HEX[2] || brand.PRIMARY_HEX}` },
    ],
    brand,
  });

  addFooters(doc, companyName, {}, brand);
  const { saveFile } = await import("./../../lib/exports/saveFile");
  await saveFile(doc.output("blob"), customFilename || `portfolio-${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}
