import { APP_BRAND_NAME } from "@shared/constants";
import { format } from "date-fns";
import { drawLineChart } from "@/lib/exports/pdfChartDrawer";
import { buildFinancialTableConfig, addFooters, drawDashboardSummaryPage, type DashboardSummaryMetric } from "@/lib/exports/pdfHelpers";
import { PAGE_DIMS, type ThemeColor, buildBrandPalette } from "@/lib/exports/exportStyles";
import { loadExportConfig } from "@/lib/exportConfig";
import type { DashboardFinancials } from "./types";
import type { Property } from "@shared/schema";
import type { OverviewExportData } from "./overviewExportData";
import type { ExportRow } from "./statementBuilders";
import { generatePortfolioCashFlowData, generatePortfolioBalanceSheetData, generatePortfolioInvestmentData } from "./statementBuilders";

export interface ComprehensiveDashboardExportParams {
  financials: DashboardFinancials;
  properties: Property[];
  projectionYears: number;
  getFiscalYear: (i: number) => number;
  companyName?: string;
  incomeRows: ExportRow[];
  modelStartDate?: Date;
  themeColors?: ThemeColor[];
  overviewOnly?: boolean;
  statementsOnly?: boolean;
  overviewData?: OverviewExportData;
  version?: "short" | "extended";
}

function splitRowsBySectionHeaders(rows: ExportRow[]): { title: string; rows: ExportRow[] }[] {
  const sections: { title: string; rows: ExportRow[] }[] = [];
  let current: { title: string; rows: ExportRow[] } | null = null;

  for (const row of rows) {
    if (row.isHeader && !row.indent && row.category.trim()) {
      if (current && current.rows.length > 0) sections.push(current);
      current = { title: row.category, rows: [row] };
    } else if (current) {
      current.rows.push(row);
    }
  }
  if (current && current.rows.length > 0) sections.push(current);

  return sections;
}

const fmtCompact = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);

export async function exportDashboardComprehensivePDF(params: ComprehensiveDashboardExportParams, customFilename?: string): Promise<void> {
  const {
    financials, properties, projectionYears, getFiscalYear,
    companyName = APP_BRAND_NAME,
    incomeRows, modelStartDate, themeColors,
    overviewOnly = false, statementsOnly = false,
    overviewData,
    version,
  } = params;

  const isShort = version === "short";

  const jsPDF = (await import("jspdf")).default;
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [PAGE_DIMS.LANDSCAPE_W, PAGE_DIMS.LANDSCAPE_H] });
  const brand = buildBrandPalette(themeColors);
  const pageW = PAGE_DIMS.LANDSCAPE_W;
  const pageH = PAGE_DIMS.LANDSCAPE_H;
  const years = Array.from({ length: projectionYears }, (_, i) => getFiscalYear(i));
  const entityTag = `${companyName} \u2014 Consolidated Portfolio`;
  const _dateStr = format(new Date(), "MMMM d, yyyy");
  const projRange = `${years[0]} \u2013 ${years[years.length - 1]}`;

  const cfg = loadExportConfig();

  const NAVY: [number, number, number] = brand.PRIMARY_RGB;
  const ACCENT: [number, number, number] = brand.SECONDARY_RGB;

  function drawPageChrome() {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageW, 1.5, "F");
    doc.setFillColor(...ACCENT);
    doc.rect(0, 1.5, pageW, 0.8, "F");
    doc.setFillColor(...NAVY);
    doc.rect(0, pageH - 1.5, pageW, 1.5, "F");
    doc.setFillColor(...ACCENT);
    doc.rect(0, pageH - 2.3, pageW, 0.8, "F");
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.3);
    doc.line(10, 6, 10, pageH - 6);
    doc.line(pageW - 10, 6, pageW - 10, pageH - 6);
  }

  function drawSectionTitle(title: string, subtitle?: string): number {
    drawPageChrome();
    doc.setFillColor(...NAVY);
    doc.rect(16, 10, pageW - 32, 22, "F");
    doc.setFillColor(...ACCENT);
    doc.rect(16, 30, pageW - 32, 1.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...brand.WHITE_RGB);
    doc.text(title, 22, 22);
    if (subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...ACCENT);
      doc.text(subtitle, 22, 28);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...brand.MUTED_RGB);
    doc.text(companyName, pageW - 22, 22, { align: "right" });
    return 38;
  }

  function withChrome(config: Record<string, any>): Record<string, any> {
    const origDidDrawPage = config.didDrawPage;
    return {
      ...config,
      didDrawPage: (data: any) => {
        if (data.pageNumber > 1) drawPageChrome();
        if (origDidDrawPage) origDidDrawPage(data);
      },
    };
  }

  let startY: number;
  let needsNewFirstPage = false;

  if (!statementsOnly) {
    const metrics: DashboardSummaryMetric[] = [
      { label: "Portfolio IRR", value: `${(financials.portfolioIRR * 100).toFixed(1)}%`, section: "Return Metrics" },
      { label: "Equity Multiple", value: `${financials.equityMultiple.toFixed(2)}x`, section: "Return Metrics" },
      { label: "Cash-on-Cash Return", value: `${financials.cashOnCash.toFixed(1)}%`, section: "Return Metrics" },
      { label: "Total Equity Invested", value: fmtCompact(financials.totalInitialEquity), section: "Investment Summary" },
      { label: `Projected Exit Value (Year ${projectionYears})`, value: fmtCompact(financials.totalExitValue), section: "Investment Summary" },
      { label: "Total Properties / Rooms", value: `${properties.length} / ${financials.totalRooms}`, section: "Investment Summary" },
      { label: `${projectionYears}-Year Revenue`, value: fmtCompact(financials.totalProjectionRevenue), section: "Projection Totals" },
      { label: `${projectionYears}-Year NOI`, value: fmtCompact(financials.totalProjectionNOI), section: "Projection Totals" },
      { label: `${projectionYears}-Year Cash Flow`, value: fmtCompact(financials.totalProjectionCashFlow), section: "Projection Totals" },
    ];
    const propertyTable = properties.map(p => ({
      name: p.name, market: p.market, rooms: p.roomCount, status: p.status,
    }));

    if (cfg.overview.kpiMetrics) {
      drawPageChrome();
      drawDashboardSummaryPage(doc, pageW, entityTag, companyName, metrics, propertyTable, brand);
    }

    if (overviewOnly && overviewData) {
      const fmtUSD = (v: number) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
      const fmtPct = (v: number) => `${v.toFixed(1)}%`;

      let overviewPageStarted = cfg.overview.kpiMetrics;

      if (cfg.overview.revenueChart) {
        if (overviewPageStarted) doc.addPage();
        overviewPageStarted = true;
        startY = drawSectionTitle("Revenue & ANOI Projection", `${projectionYears}-Year Consolidated Projection`);
        const revData = overviewData.revenueNOIData.map((d) => ({ label: String(d.year), value: d.revenue }));
        const anoiData = overviewData.revenueNOIData.map((d) => ({ label: String(d.year), value: d.anoi }));
        const noiData = overviewData.revenueNOIData.map((d) => ({ label: String(d.year), value: d.noi }));
        const cfData = overviewData.revenueNOIData.map((d) => ({ label: String(d.year), value: d.cashFlow }));
        drawLineChart({
          doc, x: 16, y: startY!, width: pageW - 32, height: 130,
          title: `Portfolio Revenue & ANOI (${projectionYears}-Year Projection)`,
          series: [
            { name: "Revenue", data: revData, color: `#${brand.LINE_HEX[0]}` },
            { name: "NOI", data: noiData, color: `#${brand.LINE_HEX[1] || brand.SECONDARY_HEX}` },
            { name: "ANOI", data: anoiData, color: `#${brand.LINE_HEX[2] || brand.PRIMARY_HEX}` },
            { name: "Cash Flow", data: cfData, color: `#${brand.LINE_HEX[3] || brand.ACCENT_HEX}` },
          ],
          brand,
        });
        if (cfg.overview.projectionTable) {
          const projTableY = startY! + 140;
          autoTable(doc, {
            startY: projTableY,
            margin: { left: 16, right: 16 },
            head: [["Year", "Revenue", "NOI", "ANOI", "Cash Flow"]],
            body: overviewData.revenueNOIData.map((d) => [
              String(d.year), fmtUSD(d.revenue), fmtUSD(d.noi), fmtUSD(d.anoi), fmtUSD(d.cashFlow),
            ]),
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: { fillColor: brand.SECONDARY_RGB, textColor: [255, 255, 255], fontStyle: "bold" },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            didDrawPage: (data: any) => { if (data.pageNumber > 1) drawPageChrome(); },
          });
        }
      }

      if (cfg.overview.compositionTables) {
        if (overviewPageStarted) doc.addPage();
        overviewPageStarted = true;
        startY = drawSectionTitle("Portfolio & Capital Structure", "Portfolio Composition and Capital Summary");
        const cs = overviewData.capitalStructure;
        const compositionRows = [
          ["Properties", String(cs.totalProperties)],
          ["Total Rooms", String(cs.totalRooms)],
          ["Avg Rooms / Property", cs.avgRoomsPerProperty.toFixed(0)],
          ["Markets", String(cs.totalMarkets)],
          ["Avg Daily Rate (ADR)", fmtUSD(cs.avgADR)],
        ];
        const capitalRows = [
          ["Total Purchase Price", fmtUSD(cs.totalPurchasePrice)],
          ["Avg Purchase Price", fmtUSD(cs.avgPurchasePrice)],
          ["Avg Exit Cap Rate", fmtPct(cs.avgExitCapRate * 100)],
          ["Hold Period", `${cs.holdPeriod} Years`],
          ["ANOI Margin", fmtPct(cs.anoiMargin)],
        ];
        autoTable(doc, {
          startY: startY!,
          margin: { left: 16, right: pageW / 2 + 4 },
          head: [["Portfolio Composition", "Value"]],
          body: compositionRows,
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: brand.SECONDARY_RGB, textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });
        autoTable(doc, {
          startY: startY!,
          margin: { left: pageW / 2 + 4, right: 16 },
          head: [["Capital Structure", "Value"]],
          body: capitalRows,
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: brand.PRIMARY_RGB, textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: { 1: { halign: "right", fontStyle: "bold", textColor: brand.ACCENT_RGB } },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });
      }

      if (cfg.overview.compositionCharts) {
        if (overviewPageStarted) doc.addPage();
        overviewPageStarted = true;
        startY = drawSectionTitle("Portfolio Composition", "Geographic and Status Distribution");
        const totalProps = Math.max(overviewData.capitalStructure.totalProperties, 1);
        const mktRows = Object.entries(overviewData.marketCounts).map(([market, count]) => [
          market, String(count), fmtPct((count / totalProps) * 100),
        ]);
        const stsRows = Object.entries(overviewData.statusCounts).map(([status, count]) => [
          status, String(count), fmtPct((count / totalProps) * 100),
        ]);
        autoTable(doc, {
          startY: startY!,
          margin: { left: 16, right: pageW / 2 + 4 },
          head: [["Market", "Properties", "Share"]],
          body: mktRows,
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: brand.SECONDARY_RGB, textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: { 1: { halign: "right" }, 2: { halign: "right", fontStyle: "bold", textColor: brand.ACCENT_RGB } },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });
        autoTable(doc, {
          startY: startY!,
          margin: { left: pageW / 2 + 4, right: 16 },
          head: [["Status", "Properties", "Share"]],
          body: stsRows,
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: brand.PRIMARY_RGB, textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: { 1: { halign: "right" }, 2: { halign: "right", fontStyle: "bold", textColor: brand.ACCENT_RGB } },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });
      }

      if (cfg.overview.waterfallTable) {
        if (overviewPageStarted) doc.addPage();
        overviewPageStarted = true;
        startY = drawSectionTitle("USALI Profit Waterfall", `${projectionYears}-Year Consolidated USALI Income Bridge`);
        const wfHead = ["", ...overviewData.yearLabels.map(String)];
        const wfBody = overviewData.waterfallRows.map((row) => [
          row.label,
          ...row.values.map((v) => (row.isDeduction ? `(${fmtUSD(v)})` : fmtUSD(v))),
        ]);
        autoTable(doc, {
          startY: startY!,
          margin: { left: 16, right: 16 },
          head: [wfHead],
          body: wfBody,
          styles: { fontSize: 6.5, cellPadding: 1.5 },
          headStyles: { fillColor: brand.SECONDARY_RGB, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
          bodyStyles: { textColor: brand.FOREGROUND_RGB },
          didParseCell: (data: any) => {
            if (data.section === "body") {
              const row = overviewData.waterfallRows[data.row.index];
              if (row?.isSubtotal) {
                data.cell.styles.fontStyle = "bold";
                data.cell.styles.fillColor = [240, 247, 244];
              }
              if (row?.isDeduction) {
                data.cell.styles.textColor = [180, 60, 60];
              }
            }
          },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
          alternateRowStyles: {},
          didDrawPage: (data: any) => { if (data.pageNumber > 1) drawPageChrome(); },
        });
      }

      if (cfg.overview.propertyInsights) {
        if (overviewPageStarted) doc.addPage();
        overviewPageStarted = true;
        startY = drawSectionTitle("Portfolio Insights", `${projectionYears}-Year Properties & Key Metrics`);
        const insightRows = overviewData.propertyItems.map((p, i) => [
          String(i + 1), p.name, p.market, String(p.rooms), p.status,
          fmtUSD(p.acquisitionCost), fmtUSD(p.adr), `${p.irr.toFixed(1)}%`,
        ]);
        autoTable(doc, {
          startY: startY!,
          margin: { left: 16, right: 16 },
          head: [["#", "Property", "Market", "Rooms", "Status", "Acquisition", "ADR", "IRR"]],
          body: insightRows,
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: brand.SECONDARY_RGB, textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            0: { cellWidth: 8, halign: "center" },
            3: { halign: "right" },
            5: { halign: "right" },
            6: { halign: "right" },
            7: { halign: "right", fontStyle: "bold", textColor: brand.ACCENT_RGB },
          },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          didDrawPage: (data: any) => { if (data.pageNumber > 1) drawPageChrome(); },
        });
        if (cfg.overview.aiInsights) {
          const afterTableY = doc.lastAutoTable?.finalY ?? (startY! + 60);
          const { kpis } = { kpis: overviewData.portfolioKPIs };
          const insightLines = [
            `Markets: ${Object.entries(overviewData.marketCounts).map(([m, c]) => `${m} (${c})`).join(", ")}`,
            `${projectionYears}-Year Total Revenue: ${fmtUSD(kpis.totalProjectionRevenue)}`,
            `${projectionYears}-Year Total NOI: ${fmtUSD(kpis.totalProjectionNOI)}`,
            `${projectionYears}-Year Total ANOI: ${fmtUSD(kpis.totalProjectionANOI)}`,
            `${projectionYears}-Year Total Cash Flow: ${fmtUSD(kpis.totalProjectionCashFlow)}`,
          ];
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(...brand.ACCENT_RGB);
          doc.text("Portfolio Insights", 16, afterTableY + 10);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(...brand.FOREGROUND_RGB);
          insightLines.forEach((line, i) => {
            doc.text(`\u2022  ${line}`, 18, afterTableY + 18 + i * 6);
          });
        }
      } else if (cfg.overview.aiInsights) {
        if (overviewPageStarted) doc.addPage();
        overviewPageStarted = true;
        startY = drawSectionTitle("Portfolio Insights", "Key Portfolio Metrics");
        const { kpis } = { kpis: overviewData.portfolioKPIs };
        const insightLines = [
          `Markets: ${Object.entries(overviewData.marketCounts).map(([m, c]) => `${m} (${c})`).join(", ")}`,
          `${projectionYears}-Year Total Revenue: ${fmtUSD(kpis.totalProjectionRevenue)}`,
          `${projectionYears}-Year Total NOI: ${fmtUSD(kpis.totalProjectionNOI)}`,
          `${projectionYears}-Year Total ANOI: ${fmtUSD(kpis.totalProjectionANOI)}`,
          `${projectionYears}-Year Total Cash Flow: ${fmtUSD(kpis.totalProjectionCashFlow)}`,
        ];
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...brand.ACCENT_RGB);
        doc.text("Portfolio Insights", 16, startY! + 10);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...brand.FOREGROUND_RGB);
        insightLines.forEach((line, i) => {
          doc.text(`\u2022  ${line}`, 18, startY! + 18 + i * 6);
        });
      }
    }
  } else {
    needsNewFirstPage = true;
  }

  if (!overviewOnly) {
    if (needsNewFirstPage) {
      startY = drawSectionTitle("Consolidated Income Statement (USALI)", `${projectionYears}-Year Projection (${projRange})`);
      needsNewFirstPage = false;
    } else {
      doc.addPage();
      startY = drawSectionTitle("Consolidated Income Statement (USALI)", `${projectionYears}-Year Projection (${projRange})`);
    }
    const incomeConfig = buildFinancialTableConfig(years, incomeRows, "landscape", startY!, brand);
    autoTable(doc, withChrome(incomeConfig));

    doc.addPage();
    const cashFlowData = generatePortfolioCashFlowData(
      financials.allPropertyYearlyCF, projectionYears, getFiscalYear,
      isShort ? new Set<string>() : new Set(["cfo", "cfi", "cff"]), isShort,
      properties.map(p => p.name),
      financials.yearlyConsolidatedCache,
    );
    startY = drawSectionTitle("Consolidated Cash Flow Statement", `${projectionYears}-Year Projection (${projRange})`);
    const cfConfig = buildFinancialTableConfig(cashFlowData.years, cashFlowData.rows, "landscape", startY, brand);
    autoTable(doc, withChrome(cfConfig));

    doc.addPage();
    const balanceSheetData = generatePortfolioBalanceSheetData(
      financials.allPropertyFinancials, projectionYears, getFiscalYear, modelStartDate, isShort,
    );
    startY = drawSectionTitle("Consolidated Balance Sheet", `${projectionYears}-Year Projection (${projRange})`);
    const bsConfig = buildFinancialTableConfig(balanceSheetData.years, balanceSheetData.rows, "landscape", startY, brand);
    autoTable(doc, withChrome(bsConfig));
  }

  if (!overviewOnly && !statementsOnly) {
    const investmentData = generatePortfolioInvestmentData(financials, properties, projectionYears, getFiscalYear);
    const investmentSections = splitRowsBySectionHeaders(investmentData.rows);

    const anCfg = cfg.analysis;

    const sectionConfigMap: Record<string, boolean> = {
      "Free Cash Flow to Investors": anCfg.freeCashFlowTable,
      "Per-Property Returns": anCfg.propertyIrrTable,
      "Property-Level IRR Analysis": anCfg.propertyIrrTable,
      "Discounted Cash Flow (DCF) Analysis": anCfg.dcfAnalysis,
    };

    let pendingRows: ExportRow[] = [];
    let pendingSectionTitle = "Portfolio Investment Analysis";

    const flushPending = () => {
      if (pendingRows.length === 0) return;
      doc.addPage();
      startY = drawSectionTitle(pendingSectionTitle, `${projectionYears}-Year Projection (${projRange})`);
      const tableCfg = buildFinancialTableConfig(investmentData.years, pendingRows, "landscape", startY!, brand);
      autoTable(doc, withChrome(tableCfg));
      pendingRows = [];
    };

    for (const section of investmentSections) {
      if (section.title in sectionConfigMap) {
        flushPending();
        if (sectionConfigMap[section.title]) {
          pendingSectionTitle = section.title;
          pendingRows = section.rows;
        }
      } else {
        pendingRows.push(...section.rows);
      }
    }
    flushPending();

    if (anCfg.returnChart) {
      const cf = financials.allPropertyYearlyCF;
      doc.addPage();
      startY = drawSectionTitle("Investment Returns", `${projectionYears}-Year Projection (${projRange})`);

      const noiChartData = years.map((_, i) => ({
        label: String(years[i]),
        value: financials.yearlyConsolidatedCache[i]?.noi ?? 0,
      }));
      const anoiChartData = years.map((_, i) => ({
        label: String(years[i]),
        value: financials.yearlyConsolidatedCache[i]?.anoi ?? 0,
      }));
      const debtServiceData = years.map((_, y) => ({
        label: String(years[y]),
        value: cf.reduce((sum, prop) => sum + (prop[y]?.debtService ?? 0), 0),
      }));
      const fcfeData = years.map((_, y) => ({
        label: String(years[y]),
        value: cf.reduce((sum, prop) => sum + (prop[y]?.freeCashFlowToEquity ?? 0), 0),
      }));

      drawLineChart({
        doc,
        x: 16,
        y: startY!,
        width: pageW - 32,
        height: 140,
        title: `Investment Returns (${projectionYears}-Year Projection)`,
        series: [
          { name: "Net Operating Income (NOI)", data: noiChartData, color: `#${brand.LINE_HEX[0]}` },
          { name: "Adjusted NOI (ANOI)", data: anoiChartData, color: `#${brand.LINE_HEX[1] || brand.SECONDARY_HEX}` },
          { name: "Debt Service", data: debtServiceData, color: `#${brand.LINE_HEX[2] || brand.PRIMARY_HEX}` },
          { name: "Free Cash Flow to Equity", data: fcfeData, color: `#${brand.LINE_HEX[3] || brand.ACCENT_HEX}` },
        ],
        brand,
      });
    }

    if (anCfg.performanceTrend) {
      doc.addPage();
      startY = drawSectionTitle("Performance Trend", `${projectionYears}-Year Revenue, Operating Expenses, and Adjusted NOI`);

      const chartData = years.map((year, i) => ({
        label: String(year),
        value: financials.yearlyConsolidatedCache[i]?.revenueTotal ?? 0,
      }));
      const noiData = years.map((year, i) => {
        const d = financials.yearlyConsolidatedCache[i];
        return { label: String(year), value: d?.noi ?? 0 };
      });
      const expenseData = years.map((year, i) => ({
        label: String(year),
        value: financials.yearlyConsolidatedCache[i]?.totalExpenses ?? 0,
      }));

      drawLineChart({
        doc,
        x: 16,
        y: startY,
        width: pageW - 32,
        height: 140,
        title: `Portfolio Performance (${projectionYears}-Year Projection)`,
        series: [
          { name: "Revenue", data: chartData, color: `#${brand.LINE_HEX[0]}` },
          { name: "Operating Expenses", data: expenseData, color: `#${brand.LINE_HEX[1] || brand.SECONDARY_HEX}` },
          { name: "ANOI", data: noiData, color: `#${brand.LINE_HEX[2] || brand.PRIMARY_HEX}` },
        ],
        brand,
      });
    }
  }

  addFooters(doc, companyName, {}, brand);

  const suffix = overviewOnly ? "Portfolio Overview" : statementsOnly ? "Financial Statements" : "Consolidated Portfolio Report";
  const { saveFile: savePdfFile } = await import("./../../lib/exports/saveFile");
  await savePdfFile(doc.output("blob"), customFilename || `${companyName} - ${suffix}.pdf`);
}
