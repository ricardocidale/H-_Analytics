import { type ExportRowMeta } from "@/lib/exports/exportStyles";
import { drawLineChart } from "@/lib/exports/pdfChartDrawer";
import { addFooters, buildFinancialTableConfig, drawTitle, drawSubtitle, drawSubtitleRow } from "@/lib/exports/pdfHelpers";
import type { ExportVersion } from "@/components/ExportDialog";
import {
  type PropertyExportContext,
  getLoanCalcs,
  getBrand,
  computeCashFlowVectors,
  buildIncomeRows,
  buildCashFlowRows,
  resolveExportDepreciationYears,
} from "./propertyExportShared";

export async function exportIncomeStatementPDF(ctx: PropertyExportContext, orientation: 'landscape' | 'portrait' = 'landscape', version: ExportVersion = 'extended', customFilename?: string) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { PAGE_DIMS } = await import("@/lib/exports/exportStyles");
  const brand = getBrand(ctx);
  const { property, global, yearlyChartData, projectionYears, years, startYear } = ctx;
  const dims = orientation === "landscape"
    ? { w: PAGE_DIMS.LANDSCAPE_W, h: PAGE_DIMS.LANDSCAPE_H }
    : { w: PAGE_DIMS.PORTRAIT_W, h: PAGE_DIMS.PORTRAIT_H };
  const doc = new jsPDF({ orientation, unit: "mm", format: [dims.w, dims.h] });
  const pageWidth = dims.w;
  const chartWidth = pageWidth - 28;
  const companyName = global?.companyName || property.name;
  const yearLabels = Array.from({ length: years }, (_, i) => startYear + i);
  const projRange = `${yearLabels[0]} \u2013 ${yearLabels[yearLabels.length - 1]}`;
  const isShort = version === "short";

  const entityTag = `${companyName} \u2014 ${property.name}`;
  drawTitle(doc, `${property.name} \u2014 Income Statement`, 14, 15);
  drawSubtitleRow(doc, `${projectionYears}-Year Projection (${projRange})`, entityTag, 14, 22, pageWidth);
  drawSubtitle(doc, `Generated: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, 14, 27);

  const rows = buildIncomeRows(ctx, isShort);
  const tableConfig = buildFinancialTableConfig(yearLabels, rows, orientation, 32);
  autoTable(doc, tableConfig);

  if (yearlyChartData && yearlyChartData.length > 0) {
    doc.addPage();
    drawTitle(doc, `${property.name} \u2014 Performance Trend`, 14, 15, { fontSize: 16 });
    drawSubtitleRow(doc, `${projectionYears}-Year Revenue, GOP, AGOP, NOI, and ANOI Trend`, entityTag, 14, 22, pageWidth);
    drawLineChart({
      doc, x: 14, y: 30, width: chartWidth, height: 150,
      title: `${property.name} - Financial Performance (${projectionYears}-Year Projection)`,
      series: [
        { name: 'Revenue', data: yearlyChartData.map((d) => ({ label: d.year, value: d.Revenue })), color: `#${brand.LINE_HEX[0]}` },
        { name: 'GOP', data: yearlyChartData.map((d) => ({ label: d.year, value: d.GOP })), color: `#${brand.LINE_HEX[1] || brand.SECONDARY_HEX}` },
        { name: 'AGOP', data: yearlyChartData.map((d) => ({ label: d.year, value: d.AGOP })), color: `#${brand.LINE_HEX[2] || brand.PRIMARY_HEX}` },
        { name: 'NOI', data: yearlyChartData.map((d) => ({ label: d.year, value: d.NOI })), color: `#${brand.LINE_HEX[3] || brand.ACCENT_HEX}` },
        { name: 'ANOI', data: yearlyChartData.map((d) => ({ label: d.year, value: d.ANOI })), color: `#${brand.LINE_HEX[4] || brand.MUTED_HEX}` },
      ],
      brand,
    });
  }

  addFooters(doc, companyName, { skipPages: new Set([1]) });
  const { saveFile } = await import("@/lib/exports/saveFile");
  await saveFile(doc.output("blob"), customFilename || `${property.name.replace(/\s+/g, '_')}_IncomeStatement.pdf`);
}

export async function exportCashFlowPDF(ctx: PropertyExportContext, orientation: 'landscape' | 'portrait' = 'landscape', version: ExportVersion = 'extended', customFilename?: string) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { PAGE_DIMS } = await import("@/lib/exports/exportStyles");
  const brand = getBrand(ctx);
  const { property, global, yearlyChartData, cashFlowData, projectionYears, years, startYear, activeTab } = ctx;
  const { loan, acqYear, totalPropertyCost } = getLoanCalcs(ctx);
  const dims = orientation === "landscape"
    ? { w: PAGE_DIMS.LANDSCAPE_W, h: PAGE_DIMS.LANDSCAPE_H }
    : { w: PAGE_DIMS.PORTRAIT_W, h: PAGE_DIMS.PORTRAIT_H };
  const doc = new jsPDF({ orientation, unit: "mm", format: [dims.w, dims.h] });
  const pageWidth = dims.w;
  const chartWidth = pageWidth - 28;
  const companyName = global?.companyName || property.name;
  const yearLabels = Array.from({ length: years }, (_, i) => startYear + i);
  const projRange = `${yearLabels[0]} \u2013 ${yearLabels[yearLabels.length - 1]}`;
  const isShort = version === "short";
  const { cfo, cfi, cff, netChange, openCash, closeCash } = computeCashFlowVectors(ctx, loan, acqYear, totalPropertyCost);

  const entityTag = `${companyName} \u2014 ${property.name}`;
  drawTitle(doc, `${property.name} \u2014 Cash Flow Statement`, 14, 15);
  drawSubtitleRow(doc, `${projectionYears}-Year Projection (${projRange})`, entityTag, 14, 22, pageWidth);
  drawSubtitle(doc, `Generated: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, 14, 27);

  const rows = buildCashFlowRows(ctx, cfo, cfi, cff, netChange, openCash, closeCash, acqYear, totalPropertyCost, loan, isShort);
  const tableConfig = buildFinancialTableConfig(yearLabels, rows, orientation, 32);
  autoTable(doc, tableConfig);

  if (yearlyChartData && yearlyChartData.length > 0) {
    doc.addPage();
    const chartSubtitle = activeTab === "cashflow"
      ? `${projectionYears}-Year Revenue, ANOI, and Cash Flow Trend`
      : `${projectionYears}-Year Revenue, GOP, AGOP, NOI, and ANOI Trend`;
    drawTitle(doc, `${property.name} \u2014 Performance Trend`, 14, 15, { fontSize: 16 });
    drawSubtitleRow(doc, chartSubtitle, entityTag, 14, 22, pageWidth);

    const chartSeries = activeTab === "cashflow" ? [
      { name: 'Revenue', data: yearlyChartData.map((d) => ({ label: d.year, value: d.Revenue })), color: `#${brand.LINE_HEX[0]}` },
      { name: 'ANOI', data: yearlyChartData.map((d) => ({ label: d.year, value: d.ANOI })), color: `#${brand.LINE_HEX[1] || brand.SECONDARY_HEX}` },
      { name: 'Cash Flow', data: yearlyChartData.map((d) => ({ label: d.year, value: d.CashFlow })), color: `#${brand.LINE_HEX[2] || brand.PRIMARY_HEX}` },
    ] : [
      { name: 'Revenue', data: yearlyChartData.map((d) => ({ label: d.year, value: d.Revenue })), color: `#${brand.LINE_HEX[0]}` },
      { name: 'GOP', data: yearlyChartData.map((d) => ({ label: d.year, value: d.GOP })), color: `#${brand.LINE_HEX[1] || brand.SECONDARY_HEX}` },
      { name: 'AGOP', data: yearlyChartData.map((d) => ({ label: d.year, value: d.AGOP })), color: `#${brand.LINE_HEX[2] || brand.PRIMARY_HEX}` },
      { name: 'NOI', data: yearlyChartData.map((d) => ({ label: d.year, value: d.NOI })), color: `#${brand.LINE_HEX[3] || brand.ACCENT_HEX}` },
      { name: 'ANOI', data: yearlyChartData.map((d) => ({ label: d.year, value: d.ANOI })), color: `#${brand.LINE_HEX[4] || brand.MUTED_HEX}` },
    ];

    drawLineChart({
      doc, x: 14, y: 30, width: chartWidth, height: 150,
      title: `${property.name} - Financial Performance (${projectionYears}-Year Projection)`,
      series: chartSeries,
      brand,
    });
  }

  addFooters(doc, companyName, { skipPages: new Set([1]) });
  const { saveFile: savePdf } = await import("@/lib/exports/saveFile");
  await savePdf(doc.output("blob"), customFilename || `${property.name.replace(/\s+/g, '_')}_CashFlow.pdf`);
}

export async function exportUnifiedPDF(ctx: PropertyExportContext, orientation: 'landscape' | 'portrait' = 'landscape', version: ExportVersion = 'extended', customFilename?: string) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { PAGE_DIMS } = await import("@/lib/exports/exportStyles");
  const brand = getBrand(ctx);
  const { property, global, yearlyDetails, cashFlowData, yearlyChartData, projectionYears, years, startYear } = ctx;
  const { loan, acqYear, totalPropertyCost } = getLoanCalcs(ctx);
  const depYears = resolveExportDepreciationYears(ctx);
  const dims = orientation === "landscape"
    ? { w: PAGE_DIMS.LANDSCAPE_W, h: PAGE_DIMS.LANDSCAPE_H }
    : { w: PAGE_DIMS.PORTRAIT_W, h: PAGE_DIMS.PORTRAIT_H };
  const doc = new jsPDF({ orientation, unit: "mm", format: [dims.w, dims.h] });
  const pageWidth = dims.w;
  const chartWidth = pageWidth - 28;
  const companyName = global?.companyName || property.name;
  const yearLabels = Array.from({ length: years }, (_, i) => startYear + i);
  const projRange = `${yearLabels[0]} \u2013 ${yearLabels[yearLabels.length - 1]}`;
  const isShort = version === "short";
  const entityTag = `${companyName} \u2014 ${property.name}`;

  drawTitle(doc, `${property.name} Income Statement`, 14, 15);
  drawSubtitleRow(doc, `${projectionYears}-Year Projection (${projRange})`, entityTag, 14, 22, pageWidth);
  drawSubtitle(doc, `Generated: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, 14, 27);

  const incomeRows = buildIncomeRows(ctx, isShort);
  autoTable(doc, buildFinancialTableConfig(yearLabels, incomeRows, orientation, 32));

  if (yearlyChartData && yearlyChartData.length > 0) {
    doc.addPage();
    drawTitle(doc, `${property.name} \u2014 Income Statement Trend`, 14, 15, { fontSize: 16 });
    drawSubtitleRow(doc, `${projectionYears}-Year Revenue, GOP, AGOP, NOI, and ANOI Trend`, entityTag, 14, 22, pageWidth);
    drawLineChart({
      doc, x: 14, y: 30, width: chartWidth, height: 150,
      title: `${property.name} - Income Statement (${projectionYears}-Year Projection)`,
      series: [
        { name: 'Revenue', data: yearlyChartData.map((d) => ({ label: d.year, value: d.Revenue })), color: `#${brand.LINE_HEX[0]}` },
        { name: 'GOP', data: yearlyChartData.map((d) => ({ label: d.year, value: d.GOP })), color: `#${brand.LINE_HEX[1] || brand.SECONDARY_HEX}` },
        { name: 'AGOP', data: yearlyChartData.map((d) => ({ label: d.year, value: d.AGOP })), color: `#${brand.LINE_HEX[2] || brand.PRIMARY_HEX}` },
        { name: 'NOI', data: yearlyChartData.map((d) => ({ label: d.year, value: d.NOI })), color: `#${brand.LINE_HEX[3] || brand.ACCENT_HEX}` },
        { name: 'ANOI', data: yearlyChartData.map((d) => ({ label: d.year, value: d.ANOI })), color: `#${brand.LINE_HEX[4] || brand.MUTED_HEX}` },
      ],
      brand,
    });
  }

  const { cfo, cfi, cff, netChange, openCash, closeCash } = computeCashFlowVectors(ctx, loan, acqYear, totalPropertyCost);

  doc.addPage();
  drawTitle(doc, `${property.name} Cash Flow Statement`, 14, 15);
  drawSubtitleRow(doc, `${projectionYears}-Year Projection (${projRange})`, entityTag, 14, 22, pageWidth);
  drawSubtitle(doc, `Generated: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, 14, 27);

  const cfRows = buildCashFlowRows(ctx, cfo, cfi, cff, netChange, openCash, closeCash, acqYear, totalPropertyCost, loan, isShort);
  autoTable(doc, buildFinancialTableConfig(yearLabels, cfRows, orientation, 32));

  if (yearlyChartData && yearlyChartData.length > 0) {
    doc.addPage();
    drawTitle(doc, `${property.name} \u2014 Cash Flow Trend`, 14, 15, { fontSize: 16 });
    drawSubtitleRow(doc, `${projectionYears}-Year NOI, ANOI, FCF, and FCFE Trend`, entityTag, 14, 22, pageWidth);
    drawLineChart({
      doc, x: 14, y: 30, width: chartWidth, height: 150,
      title: `${property.name} - Cash Flow (${projectionYears}-Year Projection)`,
      series: [
        { name: 'NOI', data: yearlyChartData.map((d) => ({ label: d.year, value: d.NOI })), color: `#${brand.LINE_HEX[3] || brand.ACCENT_HEX}` },
        { name: 'ANOI', data: yearlyChartData.map((d) => ({ label: d.year, value: d.ANOI })), color: `#${brand.LINE_HEX[0]}` },
        { name: 'FCF', data: cashFlowData.map((cf, i) => ({ label: String(yearLabels[i]), value: cf.freeCashFlow || 0 })), color: `#${brand.LINE_HEX[1] || brand.SECONDARY_HEX}` },
        { name: 'FCFE', data: cashFlowData.map((cf, i) => ({ label: String(yearLabels[i]), value: cf.freeCashFlowToEquity || 0 })), color: `#${brand.LINE_HEX[2] || brand.PRIMARY_HEX}` },
      ],
      brand,
    });
  }

  let cumLoanBalance = loan.loanAmount;
  const bsRows: ExportRowMeta[] = [];
  bsRows.push({ category: "ASSETS", values: yearlyDetails.map(() => 0), isHeader: true });
  bsRows.push({ category: "Cash & Equivalents", values: closeCash, indent: 1 });
  bsRows.push({ category: "Property (Net Book Value)", values: yearlyDetails.map((_, i) => {
    const depPerYear = totalPropertyCost / DEPRECIATION_YEARS;
    return Math.max(totalPropertyCost - depPerYear * (i + 1), 0);
  }), indent: 1 });
  bsRows.push({ category: "Total Assets", values: yearlyDetails.map((_, i) => {
    const depPerYear = totalPropertyCost / DEPRECIATION_YEARS;
    return closeCash[i] + Math.max(totalPropertyCost - depPerYear * (i + 1), 0);
  }), isBold: true });
  bsRows.push({ category: "LIABILITIES", values: yearlyDetails.map(() => 0), isHeader: true });
  const loanBalances = yearlyDetails.map((_, i) => {
    if (i === 0) cumLoanBalance = loan.loanAmount;
    if (i > 0) cumLoanBalance -= cashFlowData[i - 1].principalPayment;
    return Math.max(cumLoanBalance - cashFlowData[i].principalPayment, 0);
  });
  bsRows.push({ category: "Loan Balance", values: loanBalances, indent: 1 });
  bsRows.push({ category: "Total Liabilities", values: loanBalances, isBold: true });
  bsRows.push({ category: "EQUITY", values: yearlyDetails.map(() => 0), isHeader: true });
  bsRows.push({ category: "Total Equity", values: yearlyDetails.map((_, i) => {
    const depPerYear = totalPropertyCost / DEPRECIATION_YEARS;
    const totalAssets = closeCash[i] + Math.max(totalPropertyCost - depPerYear * (i + 1), 0);
    return totalAssets - loanBalances[i];
  }), isBold: true });

  doc.addPage();
  drawTitle(doc, `${property.name} Balance Sheet`, 14, 15);
  drawSubtitleRow(doc, `${projectionYears}-Year Projection (${projRange})`, entityTag, 14, 22, pageWidth);
  drawSubtitle(doc, `Generated: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, 14, 27);
  autoTable(doc, buildFinancialTableConfig(yearLabels, bsRows, orientation, 32));

  if (yearlyChartData && yearlyChartData.length > 0) {
    doc.addPage();
    const totalAssets = yearlyDetails.map((_, i) => {
      const depPerYear = totalPropertyCost / DEPRECIATION_YEARS;
      return closeCash[i] + Math.max(totalPropertyCost - depPerYear * (i + 1), 0);
    });
    const totalEquity = yearlyDetails.map((_, i) => totalAssets[i] - loanBalances[i]);
    drawTitle(doc, `${property.name} \u2014 Balance Sheet Trend`, 14, 15, { fontSize: 16 });
    drawSubtitleRow(doc, `${projectionYears}-Year Assets, Liabilities, and Equity Trend`, entityTag, 14, 22, pageWidth);
    drawLineChart({
      doc, x: 14, y: 30, width: chartWidth, height: 150,
      title: `${property.name} - Balance Sheet (${projectionYears}-Year Projection)`,
      series: [
        { name: 'Total Assets', data: totalAssets.map((v, i) => ({ label: String(yearLabels[i]), value: v })), color: `#${brand.LINE_HEX[0]}` },
        { name: 'Total Liabilities', data: loanBalances.map((v, i) => ({ label: String(yearLabels[i]), value: v })), color: `#${brand.LINE_HEX[1] || brand.SECONDARY_HEX}` },
        { name: 'Total Equity', data: totalEquity.map((v, i) => ({ label: String(yearLabels[i]), value: v })), color: `#${brand.LINE_HEX[2] || brand.PRIMARY_HEX}` },
      ],
      brand,
    });
  }

  addFooters(doc, companyName, { skipPages: new Set([1]) });
  const { saveFile } = await import("@/lib/exports/saveFile");
  await saveFile(doc.output("blob"), customFilename || `${property.name.replace(/\s+/g, '_')}_Financial_Statements.pdf`);
}
