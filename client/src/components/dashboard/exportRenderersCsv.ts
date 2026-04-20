import { downloadCSV } from "@/lib/exports/csvExport";
import type { ExportRow } from "./statementBuilders";
import type { OverviewExportData } from "./overviewExportData";

export function exportPortfolioCSV(
  years: number[],
  rows: ExportRow[],
  filename: string
): void {
  const headers = ["Category", ...years.map(String)];
  const csvContent = [
    headers.join(","),
    ...rows.map(row => [
      `"${(row.indent ? "  ".repeat(row.indent) : "") + row.category}"`,
      ...row.values.map((v: number) => v.toFixed(2)),
    ].join(",")),
  ].join("\n");
  downloadCSV(csvContent, filename);
}

export function exportOverviewCSV(
  overviewData: OverviewExportData,
  incomeRows: ExportRow[],
  incomeYears: (string | number)[],
  filename: string,
): void {
  const { portfolioKPIs: kpis, capitalStructure: cs } = overviewData;
  const fmtPct = (v: number) => `${v.toFixed(1)}%`;
  const fmtUSD = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

  const lines: string[] = [];

  lines.push("PORTFOLIO SUMMARY");
  lines.push(`Portfolio IRR,${fmtPct(kpis.portfolioIRR * 100)}`);
  lines.push(`Equity Multiple,${kpis.equityMultiple.toFixed(2)}x`);
  lines.push(`Cash-on-Cash Return,${fmtPct(kpis.cashOnCash)}`);
  lines.push(`Total Equity Invested,${fmtUSD(kpis.totalInitialEquity)}`);
  lines.push(`Projected Exit Value,${fmtUSD(kpis.totalExitValue)}`);
  lines.push(`Properties,${cs.totalProperties}`);
  lines.push(`Total Rooms,${cs.totalRooms}`);
  lines.push(`Avg Daily Rate (ADR),${fmtUSD(cs.avgADR)}`);
  lines.push(`Total Purchase Price,${fmtUSD(cs.totalPurchasePrice)}`);
  lines.push(`Avg Exit Cap Rate,${fmtPct(cs.avgExitCapRate * 100)}`);
  lines.push(`Hold Period,${cs.holdPeriod} Years`);
  lines.push(`ANOI Margin,${fmtPct(cs.anoiMargin)}`);
  lines.push(`${cs.holdPeriod}-Year Revenue,${fmtUSD(kpis.totalProjectionRevenue)}`);
  lines.push(`${cs.holdPeriod}-Year NOI,${fmtUSD(kpis.totalProjectionNOI)}`);
  lines.push(`${cs.holdPeriod}-Year ANOI,${fmtUSD(kpis.totalProjectionANOI)}`);
  lines.push(`${cs.holdPeriod}-Year Cash Flow,${fmtUSD(kpis.totalProjectionCashFlow)}`);

  lines.push("");
  lines.push("PROPERTIES & IRR");
  lines.push("#,Property,Market,Rooms,Status,Acquisition Cost,ADR,IRR");
  overviewData.propertyItems.forEach((p, i) => {
    lines.push(`${i + 1},"${p.name}","${p.market}",${p.rooms},"${p.status}",${fmtUSD(p.acquisitionCost)},${fmtUSD(p.adr)},${fmtPct(p.irr)}`);
  });

  lines.push("");
  lines.push("MARKET DISTRIBUTION");
  lines.push("Market,Properties,Share (%)");
  Object.entries(overviewData.marketCounts).forEach(([m, c]) => {
    lines.push(`"${m}",${c},${((c / cs.totalProperties) * 100).toFixed(1)}`);
  });

  lines.push("");
  lines.push("STATUS DISTRIBUTION");
  lines.push("Status,Properties,Share (%)");
  Object.entries(overviewData.statusCounts).forEach(([s, c]) => {
    lines.push(`"${s}",${c},${((c / cs.totalProperties) * 100).toFixed(1)}`);
  });

  lines.push("");
  lines.push("REVENUE & ANOI PROJECTION");
  lines.push("Year,Revenue,NOI,ANOI,Cash Flow");
  overviewData.revenueNOIData.forEach((d) => {
    lines.push(`${d.year},${fmtUSD(d.revenue)},${fmtUSD(d.noi)},${fmtUSD(d.anoi)},${fmtUSD(d.cashFlow)}`);
  });

  lines.push("");
  lines.push("USALI PROFIT WATERFALL");
  lines.push(`"",${overviewData.yearLabels.map(String).join(",")}`);
  overviewData.waterfallRows.forEach((row) => {
    const values = row.values.map((v) => (row.isDeduction ? -v : v));
    lines.push(`"${row.label}",${values.join(",")}`);
  });

  lines.push("");
  lines.push("CONSOLIDATED INCOME STATEMENT");
  lines.push(`"",${incomeYears.map(String).join(",")}`);
  incomeRows.forEach((row) => {
    const label = `"${"  ".repeat(row.indent ?? 0)}${row.category}"`;
    lines.push(`${label},${row.values.join(",")}`);
  });

  downloadCSV(lines.join("\n"), filename);
}

export function exportAllPortfolioStatementsCSV(
  incomeData: { years: (string | number)[]; rows: ExportRow[] },
  cashFlowData: { years: (string | number)[]; rows: ExportRow[] },
  balanceSheetData: { years: (string | number)[]; rows: ExportRow[] },
  investmentData: { years: (string | number)[]; rows: ExportRow[] },
  filename: string,
): void {
  const indent = (row: ExportRow) => (row.indent ? "  ".repeat(row.indent) : "");
  const section = (label: string, data: { years: (string | number)[]; rows: ExportRow[] }): string[] => {
    const lines: string[] = [];
    lines.push(`"${label}",${data.years.map(String).join(",")}`);
    data.rows.forEach(row => {
      lines.push(`"${indent(row)}${row.category}",${row.values.map((v: number) => v.toFixed(0)).join(",")}`);
    });
    return lines;
  };
  const all: string[] = [];
  all.push(...section("CONSOLIDATED INCOME STATEMENT", incomeData));
  all.push("");
  all.push(...section("CONSOLIDATED CASH FLOW STATEMENT", cashFlowData));
  all.push("");
  all.push(...section("CONSOLIDATED BALANCE SHEET", balanceSheetData));
  all.push("");
  all.push(...section("CONSOLIDATED INVESTMENT ANALYSIS", investmentData));
  downloadCSV(all.join("\n"), filename);
}
