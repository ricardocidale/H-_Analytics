import type { ExportData } from "./statementBuilders";
import type { OverviewExportData } from "./overviewExportData";

export async function exportPortfolioExcel(
  datasets: {
    incomeData: ExportData;
    cashFlowData: ExportData;
    balanceSheetData: ExportData;
    investmentData: ExportData;
  },
  companyName = "Portfolio",
  customFilename?: string,
  overviewData?: OverviewExportData
): Promise<void> {
  const XLSX = await import("xlsx");
  const { applyCurrencyFormat, applyHeaderStyle, setColumnWidths } = await import("@/lib/exports/excel/helpers");
  const wb = XLSX.utils.book_new();

  const fmtUSD = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  const fmtPct = (v: number) => `${v.toFixed(1)}%`;

  if (overviewData) {
    const { portfolioKPIs: kpis, capitalStructure: cs } = overviewData;

    const summaryData: (string | number)[][] = [
      ["Portfolio Summary"],
      [],
      ["Return Metrics"],
      ["Portfolio IRR", fmtPct(kpis.portfolioIRR * 100)],
      ["Equity Multiple", `${kpis.equityMultiple.toFixed(2)}x`],
      ["Cash-on-Cash Return", fmtPct(kpis.cashOnCash)],
      [],
      ["Investment Summary"],
      ["Total Equity Invested", fmtUSD(kpis.totalInitialEquity)],
      ["Projected Exit Value", fmtUSD(kpis.totalExitValue)],
      ["Properties", cs.totalProperties],
      ["Total Rooms", cs.totalRooms],
      [],
      ["Projection Totals"],
      [`${cs.holdPeriod}-Year Revenue`, fmtUSD(kpis.totalProjectionRevenue)],
      [`${cs.holdPeriod}-Year NOI`, fmtUSD(kpis.totalProjectionNOI)],
      [`${cs.holdPeriod}-Year ANOI`, fmtUSD(kpis.totalProjectionANOI)],
      [`${cs.holdPeriod}-Year Cash Flow`, fmtUSD(kpis.totalProjectionCashFlow)],
      [],
      ["Capital Structure"],
      ["Total Purchase Price", fmtUSD(cs.totalPurchasePrice)],
      ["Avg Purchase Price", fmtUSD(cs.avgPurchasePrice)],
      ["Avg Exit Cap Rate", fmtPct(cs.avgExitCapRate * 100)],
      ["Hold Period", `${cs.holdPeriod} Years`],
      ["ANOI Margin", fmtPct(cs.anoiMargin)],
      ["Avg Rooms / Property", cs.avgRoomsPerProperty.toFixed(0)],
      ["Avg Daily Rate (ADR)", fmtUSD(cs.avgADR)],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    setColumnWidths(wsSummary, [36, 20]);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Portfolio Summary");

    const propHeaders = ["#", "Property", "Market", "Rooms", "Status", "Acquisition Cost", "ADR", "IRR"];
    const propRows = overviewData.propertyItems.map((p, i) => [
      i + 1, p.name, p.market, p.rooms, p.status, fmtUSD(p.acquisitionCost), fmtUSD(p.adr), fmtPct(p.irr),
    ]);
    const wsProps = XLSX.utils.aoa_to_sheet([propHeaders, ...propRows]);
    setColumnWidths(wsProps, [5, 28, 18, 10, 16, 20, 12, 10]);
    XLSX.utils.book_append_sheet(wb, wsProps, "Properties & IRR");

    const mktRows: (string | number)[][] = [
      ["Market", "Properties", "Share (%)"],
      ...Object.entries(overviewData.marketCounts).map(([m, c]) => [
        m, c, parseFloat(((c / cs.totalProperties) * 100).toFixed(1)),
      ]),
      [],
      ["Status", "Properties", "Share (%)"],
      ...Object.entries(overviewData.statusCounts).map(([s, c]) => [
        s, c, parseFloat(((c / cs.totalProperties) * 100).toFixed(1)),
      ]),
    ];
    const wsMkt = XLSX.utils.aoa_to_sheet(mktRows);
    setColumnWidths(wsMkt, [24, 14, 14]);
    XLSX.utils.book_append_sheet(wb, wsMkt, "Market & Status");

    const projHeader = ["Year", "Revenue", "NOI", "ANOI", "Cash Flow"];
    const projRows = overviewData.revenueNOIData.map((d) => [
      d.year, fmtUSD(d.revenue), fmtUSD(d.noi), fmtUSD(d.anoi), fmtUSD(d.cashFlow),
    ]);
    const wsProj = XLSX.utils.aoa_to_sheet([projHeader, ...projRows]);
    setColumnWidths(wsProj, [10, 18, 18, 18, 18]);
    XLSX.utils.book_append_sheet(wb, wsProj, "Revenue Projection");

    const wfHeader = ["", ...overviewData.yearLabels.map(String)];
    const wfRows = overviewData.waterfallRows.map((row) => [
      row.label,
      ...row.values.map((v) => (row.isDeduction ? -v : v)),
    ]);
    const wsWf = XLSX.utils.aoa_to_sheet([wfHeader, ...wfRows]);
    setColumnWidths(wsWf, [40, ...overviewData.yearLabels.map(() => 16)]);
    applyCurrencyFormat(wsWf, [wfHeader, ...wfRows]);
    applyHeaderStyle(wsWf, [wfHeader, ...wfRows]);
    XLSX.utils.book_append_sheet(wb, wsWf, "USALI Waterfall");
  }

  const sheets: { name: string; data: ExportData }[] = [
    { name: "Income Statement", data: datasets.incomeData },
    { name: "Cash Flow", data: datasets.cashFlowData },
    { name: "Balance Sheet", data: datasets.balanceSheetData },
    { name: "Investment Analysis", data: datasets.investmentData },
  ];

  for (const sheet of sheets) {
    const wsData = [
      [sheet.name, ...sheet.data.years.map(String)],
      ...sheet.data.rows.map(row => [
        (row.indent ? "  ".repeat(row.indent) : "") + row.category,
        ...row.values,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    setColumnWidths(ws, [38, ...sheet.data.years.map(() => 16)]);
    applyCurrencyFormat(ws, wsData);
    applyHeaderStyle(ws, wsData);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }

  const safeName = companyName.replace(/[^a-zA-Z0-9 &\-]/g, "").substring(0, 60);
  const { saveFile: saveXlsx } = await import("./../../lib/exports/saveFile");
  const xlData = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const xlBlob = new Blob([xlData], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  await saveXlsx(xlBlob, customFilename || `${safeName} - Consolidated Financial Statements.xlsx`);
}
