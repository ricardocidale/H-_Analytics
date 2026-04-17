/**
 * checkerManualExport.ts — Checker Manual PDF and Full Data Export
 *
 * Provides two export capabilities for administrators and auditors:
 *
 * 1. **Checker Manual PDF** (`exportManualPDF`):
 *    A reference document that lists every formula, business rule, and testing
 *    methodology used by the financial engine. Intended for independent
 *    verification — an auditor can read the manual and manually re-derive any
 *    number the system produces.
 *
 * 2. **Full Data Export PDF** (`exportFullData`):
 *    A comprehensive data dump that fetches all properties and global
 *    assumptions from the server, re-runs the pro-forma engine for every
 *    property and the management company, and renders all resulting financial
 *    statements into a single landscape-oriented PDF. Includes a completeness
 *    report showing what was generated and any data quality warnings.
 *
 * Both exports use jsPDF for PDF rendering and jspdf-autotable for tables.
 */
import { APP_BRAND_NAME } from "@shared/constants";
import { apiRequest } from "@/lib/queryClient";
import { PAGE_DIMS } from "./exportStyles";
import {
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_PROPERTY_INFLATION_RATE,
  DEFAULT_COMPANY_TAX_RATE,
  MONTHS_PER_YEAR,
} from "@shared/constants";

/** Table of contents for the Checker Manual — each section maps to a chapter of the app. */
const MANUAL_SECTIONS = [
  "1. Application Overview",
  "2. Management Company",
  "3. Property Portfolio (SPVs)",
  "4. Global Assumptions",
  "5. Property-Level Assumptions",
  "6. Cash Flow Streams",
  "7. Financial Statements",
  "8. Export System",
  "9. Design Configuration",
  "10. Scenario Management",
  "11. My Profile",
  "12. Dashboard & KPIs",
  "13. AI Research & Calibration",
  "14. Property CRUD & Images",
  "15. Testing Methodology",
  "16. Property Financial Formulas",
  "17. Management Company Formulas",
  "18. Consolidated Portfolio Formulas",
  "19. Investment Returns (DCF/FCF/IRR)",
  "20. Funding, Financing & Refinancing",
  "21. Glossary",
];

/**
 * Core property-level financial formulas. Each row is [ID, Name, Expression].
 * These are the formulas an auditor would check to verify the engine output.
 */
const PROPERTY_FORMULAS = [
  ["F-P-02", "Available Rooms", "Room Count × Days in Month"],
  ["F-P-03", "Room Revenue", "Available Rooms × Occupancy × ADR"],
  ["F-P-09", "GOP", "Total Revenue − Total Operating Expenses"],
  ["F-P-10", "NOI", "GOP − Fixed Charges (Property Taxes)"],
  ["F-P-11", "ANOI", "NOI − Base Fee − Incentive Fee − FF&E Reserve"],
  ["F-P-13", "Depreciable Basis", "Price × (1 − Land%) + Improvements"],
  ["F-P-14", "Monthly Depreciation", "Depreciable Basis / 39 / 12"],
  ["F-P-16", "Net Income", "ANOI − Interest − Depreciation − Tax"],
  ["F-P-17", "CFO", "Net Income + Depreciation"],
];

/** Management company formulas — how the company's revenue and cash flow are derived. */
const COMPANY_FORMULAS = [
  ["F-C-01", "Base Fee Revenue", "Σ(Property Revenue × Base Rate)"],
  ["F-C-02", "Incentive Fee Revenue", "Σ(max(0, Property GOP × Incentive Rate))"],
  ["F-C-04", "Net Income", "Total Revenue − Total Expenses"],
  ["F-C-05", "Cash Flow", "Net Income + Funding"],
];

/** Investment return formulas — DCF, FCF, IRR, exit valuation, equity multiple. */
const RETURN_FORMULAS = [
  ["F-R-01", "FCF", "ANOI − Tax − CapEx"],
  ["F-R-02", "FCFE", "ANOI − Debt Service − Tax"],
  ["F-R-04", "IRR", "Solve: Σ(FCFE_t/(1+r)^t) = Equity₀"],
  ["F-R-05", "Exit Value", "Terminal NOI / Cap Rate"],
  ["F-R-07", "Equity Multiple", "Total Distributions / Equity"],
];

/** Financing and refinancing formulas — loan sizing, PMT calculation, refi proceeds. */
const FINANCING_FORMULAS = [
  ["F-F-01", "Loan Amount", "Purchase Price × LTV"],
  ["F-F-02", "PMT", "P × [r(1+r)^n / ((1+r)^n − 1)]"],
  ["F-F-05", "Refi Value", "Stabilized NOI / Cap Rate"],
  ["F-F-07", "Refi Proceeds", "New Loan − Old Balance − Closing Costs"],
];

/** Mandatory business constraints that the engine must enforce at all times. */
const BUSINESS_RULES = [
  ["BC-01", "Company operations cannot begin before funding is received"],
  ["BC-02", "Property cannot operate before acquisition and funding"],
  ["BC-03", "Cash balances must never go negative for any entity"],
  ["BC-04", "All properties must be debt-free at exit"],
  ["BC-05", "Distributions cannot cause negative cash"],
];

/** Three-phase testing methodology — simple → moderate → edge-case scenarios. */
const TESTING_PHASES = [
  ["Phase 1", "Simple Scenarios", "Single property, all-cash, verify revenue/expense/GOP/NOI/ANOI"],
  ["Phase 2", "Moderate", "Multiple properties, financing, refi, global changes, scenarios"],
  ["Phase 3", "Edge Cases", "Zero revenue, 100% LTV, extreme cap rates, mid-year acquisition"],
];

const REQUIRED_GLOBAL_FIELDS = [
  "modelStartDate", "companyOpsStartDate", "inflationRate",
  "companyInflationRate", "fixedCostEscalationRate",
  "capitalRaise1Amount", "exitCapRate",
];

const REQUIRED_PROPERTY_FIELDS = ["name", "location", "roomCount", "startAdr", "purchasePrice"];

/** Draw the branded dark-blue header with sage-green accent (same style as research PDFs). */
function brandedHeader(doc: any, pageW: number, height: number) {
  doc.setFillColor(26, 35, 50);
  doc.rect(0, 0, pageW, height, "F");
  doc.setFillColor(159, 188, 164);
  doc.rect(0, height - 4, pageW, 2, "F");
}

/**
 * Generate and download the Checker Manual PDF — a self-contained reference
 * document listing all formulas, business rules, and testing phases. This
 * allows an auditor to independently verify any number the system produces.
 */
export async function exportManualPDF(user: { email?: string; role?: string; companyName?: string }, customFilename?: string): Promise<{ success: boolean; status?: "completed" | "error"; error?: string }> {
  try {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [PAGE_DIMS.PORTRAIT_W, PAGE_DIMS.PORTRAIT_H] });
  const pageW = doc.internal.pageSize.getWidth();

  brandedHeader(doc, pageW, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text(user.companyName || APP_BRAND_NAME, 14, 25);
  doc.setFontSize(14);
  doc.setTextColor(159, 188, 164);
  doc.text("Checker Manual — Verification & Testing Guide", 14, 38);
  doc.setFontSize(9);
  doc.setTextColor(200, 200, 200);
  doc.text(`Generated: ${new Date().toLocaleDateString()} | User: ${user.email || "unknown"} (${user.role || "unknown"})`, 14, 50);

  let y = 70;

  const addSection = (title: string, rows: string[][]) => {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(37, 125, 65);
    doc.text(title, 14, y);
    y += 6;
    if (rows.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [rows[0]],
        body: rows.slice(1),
        theme: "grid",
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [26, 46, 61], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });
      y = doc.lastAutoTable!.finalY + 8;
    }
  };

  addSection("Table of Contents", [
    ["#", "Section"],
    ...MANUAL_SECTIONS.map((s, i) => [String(i + 1), s]),
  ]);

  addSection("Key Property Formulas", [
    ["ID", "Formula", "Expression"],
    ...PROPERTY_FORMULAS,
  ]);

  addSection("Key Company Formulas", [
    ["ID", "Formula", "Expression"],
    ...COMPANY_FORMULAS,
  ]);

  addSection("Investment Return Formulas", [
    ["ID", "Formula", "Expression"],
    ...RETURN_FORMULAS,
  ]);

  addSection("Financing Formulas", [
    ["ID", "Formula", "Expression"],
    ...FINANCING_FORMULAS,
  ]);

  addSection("Mandatory Business Rules", [
    ["Rule", "Description"],
    ...BUSINESS_RULES,
  ]);

  addSection("Testing Methodology", [
    ["Phase", "Focus", "Key Tests"],
    ...TESTING_PHASES,
  ]);

  const { saveFile } = await import("./saveFile");
  const pdfBlob = doc.output("blob");
  await saveFile(pdfBlob, customFilename || "LB_Checker_Manual.pdf");
  return { success: true };
  } catch (err: unknown) {
    return { success: false, status: "error", error: err instanceof Error ? err.message : "Manual PDF export failed" };
  }
}

/**
 * Check that properties and global assumptions have all required fields.
 * Returns a list of human-readable warning strings for any missing data.
 * This runs before the full data export so the user knows if their data is incomplete.
 */
function validateData(properties: any[], global: any): string[] {
  const warnings: string[] = [];

  if (!properties?.length) warnings.push("No properties found in database");
  if (!global) warnings.push("Global assumptions not found");
  if (!properties?.length || !global) return warnings;

  const missingGlobal = REQUIRED_GLOBAL_FIELDS.filter(
    f => global[f] === null || global[f] === undefined || global[f] === ""
  );
  if (missingGlobal.length > 0) warnings.push(`Missing global fields: ${missingGlobal.join(", ")}`);

  properties.forEach((p: any, idx: number) => {
    const missing = REQUIRED_PROPERTY_FIELDS.filter(
      f => p[f] === null || p[f] === undefined || p[f] === ""
    );
    if (missing.length > 0) warnings.push(`Property "${p.name || `#${idx + 1}`}" missing: ${missing.join(", ")}`);
    if ((p.roomCount ?? 0) <= 0) warnings.push(`Property "${p.name}" has invalid room count`);
    if ((p.purchasePrice ?? 0) <= 0) warnings.push(`Property "${p.name}" has invalid purchase price`);
  });

  return warnings;
}

/**
 * Generate and download a Full Data Export PDF.
 *
 * This is a comprehensive audit artifact that:
 *   1. Fetches all properties and global assumptions from the API
 *   2. Validates data completeness (warns about missing fields)
 *   3. Runs the financial engine for every property and the management company
 *   4. Renders all Income Statements and Cash Flow summaries into tables
 *   5. Appends a completeness report with warnings and statement inventory
 *
 * The result object reports success/failure, included statements, property
 * count, and any data quality warnings.
 */
export async function exportFullData(user: { email?: string; role?: string; companyName?: string }, customFilename?: string): Promise<{
  success: boolean;
  warnings: string[];
  includedStatements: string[];
  propertyCount: number;
  companyIncluded: boolean;
  projectionYears: number;
  exportTimestamp: string;
  status: "completed" | "completed-with-warnings" | "failed" | "error";
  error?: string;
}> {
  const exportTimestamp = new Date().toISOString();
  const base: Omit<{
    success: boolean;
    warnings: string[];
    includedStatements: string[];
    propertyCount: number;
    companyIncluded: boolean;
    projectionYears: number;
    exportTimestamp: string;
    status: "completed" | "completed-with-warnings" | "failed" | "error";
    error?: string;
  }, "success" | "status"> = {
    warnings: [],
    includedStatements: [],
    propertyCount: 0,
    companyIncluded: false,
    projectionYears: 0,
    exportTimestamp,
  };
  try {

  const [
    { default: jsPDF },
    { default: autoTable },
    { generatePropertyProForma, generateCompanyProForma, formatMoney },
    { aggregatePropertyByYear },
  ] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    import("@/lib/financialEngine"),
    import("@/lib/financial/yearlyAggregator"),
  ]);

  const [propertiesRes, globalRes] = await Promise.all([
    apiRequest("GET", "/api/properties"),
    apiRequest("GET", "/api/global-assumptions"),
  ]);
  const properties = await propertiesRes.json();
  const global = await globalRes.json();

  const warnings = validateData(properties, global);
  base.warnings = warnings;

  if (!properties?.length || !global) {
    return { ...base, success: false, status: "failed" };
  }

  base.propertyCount = properties.length;
  const projYears = global.projectionYears ?? 10;
  const projMonths = projYears * MONTHS_PER_YEAR;
  base.projectionYears = projYears;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [PAGE_DIMS.LANDSCAPE_W, PAGE_DIMS.LANDSCAPE_H] });
  const pageW = doc.internal.pageSize.getWidth();

  brandedHeader(doc, pageW, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(`${user.companyName || APP_BRAND_NAME} — Full Data Export`, 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(159, 188, 164);
  doc.text(`Generated: ${new Date().toLocaleString()} | User: ${user.email || "unknown"} (${user.role || "unknown"}) | Properties: ${properties.length}`, 14, 30);

  let y = 50;

  if (warnings.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(220, 80, 60);
    doc.text("DATA COMPLETENESS WARNINGS", 14, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(180, 60, 40);
    warnings.forEach(w => {
      if (y > 185) { doc.addPage(); y = 20; }
      doc.text(`• ${w}`, 18, y);
      y += 4;
    });
    y += 4;
  }

  const addTable = (title: string, head: string[], rows: string[][]) => {
    if (y > 170) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(37, 125, 65);
    doc.text(title, 14, y);
    y += 5;
    autoTable(doc, {
      startY: y,
      head: [head],
      body: rows,
      theme: "grid",
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: { fillColor: [26, 46, 61], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
    y = doc.lastAutoTable!.finalY + 8;
  };

  addTable("Global Assumptions", ["Parameter", "Value"], [
    ["Company Name", global.companyName || "Hospitality Business"],
    ["Model Start Date", global.modelStartDate || "—"],
    ["Projection Years", String(projYears)],
    ["Company Ops Start", global.companyOpsStartDate || "—"],
    ["Fiscal Year Start Month", String(global.fiscalYearStartMonth ?? 1)],
    ["Global Inflation Rate", `${((global.inflationRate ?? DEFAULT_PROPERTY_INFLATION_RATE) * 100).toFixed(1)}%`],
    ["Company Inflation Rate", global.companyInflationRate ? `${(global.companyInflationRate * 100).toFixed(1)}%` : "Global Default"],
    ["Fixed Cost Escalation Override", global.fixedCostEscalationRate ? `${(global.fixedCostEscalationRate * 100).toFixed(1)}%` : "Global Default"],
    ["Management Fees", "Per-property (see property details)"],
    ["Capital Raise 1", formatMoney(global.capitalRaise1Amount ?? 0)],
    ["Capital Raise 1 Date", global.capitalRaise1Date || "—"],
    ["Capital Raise 2", formatMoney(global.capitalRaise2Amount ?? 0)],
    ["Capital Raise 2 Date", global.capitalRaise2Date || "—"],
    ["Exit Cap Rate", `${((global.exitCapRate ?? DEFAULT_EXIT_CAP_RATE) * 100).toFixed(1)}%`],
    ["Sales Commission", `Per Property (default ${(DEFAULT_COMMISSION_RATE * 100).toFixed(1)}%)`],
    ["Company Income Tax Rate", `${((global.companyTaxRate ?? DEFAULT_COMPANY_TAX_RATE) * 100).toFixed(1)}%`],
    ["Partner Base Compensation", formatMoney(global.partnerBaseCompensation ?? 15000)],
    ["Partner Comp Cap", formatMoney(global.partnerCompensationCap ?? 30000)],
  ]);

  addTable("Properties Summary", ["Name", "Location", "Rooms", "ADR", "Occupancy", "Purchase Price", "LTV", "Status"],
    properties.map((p: any) => [
      p.name,
      p.location || "—",
      String(p.roomCount ?? 0),
      formatMoney(p.startAdr ?? 0),
      `${((p.startOccupancy ?? 0) * 100).toFixed(0)}%`,
      formatMoney(p.purchasePrice ?? 0),
      p.acquisitionLTV ? `${(p.acquisitionLTV * 100).toFixed(0)}%` : "Cash",
      p.status || "active",
    ])
  );

  const includedStatements: string[] = [];

  properties.forEach((p: any) => {
    try {
      const financials = generatePropertyProForma(p, global, projMonths);
      const yearly = aggregatePropertyByYear(financials, projYears);
      const yearHeaders = ["Line Item", ...Array.from({ length: projYears }, (_, i) => `Year ${i + 1}`)];

      addTable(`${p.name} — Income Statement`, yearHeaders, [
        ["Room Revenue", ...yearly.map(yr => formatMoney(yr.revenueRooms))],
        ["F&B Revenue", ...yearly.map(yr => formatMoney(yr.revenueFB))],
        ["Other Revenue", ...yearly.map(yr => formatMoney(yr.revenueOther))],
        ["Total Revenue", ...yearly.map(yr => formatMoney(yr.revenueTotal))],
        ["Total Expenses", ...yearly.map(yr => formatMoney(yr.totalExpenses))],
        ["GOP", ...yearly.map(yr => formatMoney(yr.gop))],
        ["Base Mgmt Fee", ...yearly.map(yr => formatMoney(yr.feeBase))],
        ["Incentive Mgmt Fee", ...yearly.map(yr => formatMoney(yr.feeIncentive))],
        ["AGOP", ...yearly.map(yr => formatMoney(yr.agop))],
        ["Property Taxes", ...yearly.map(yr => formatMoney(yr.expenseTaxes))],
        ["NOI", ...yearly.map(yr => formatMoney(yr.noi))],
        ["ANOI", ...yearly.map(yr => formatMoney(yr.anoi))],
        ["Depreciation", ...yearly.map(yr => formatMoney(yr.depreciationExpense))],
        ["Net Income", ...yearly.map(yr => formatMoney(yr.netIncome))],
      ]);
      includedStatements.push(`${p.name} — Income Statement`);

      addTable(`${p.name} — Cash Flow (ASC 230)`, yearHeaders, [
        ["ANOI", ...yearly.map(yr => formatMoney(yr.anoi))],
        ["Interest Expense", ...yearly.map(yr => formatMoney(yr.interestExpense))],
        ["Principal Payment", ...yearly.map(yr => formatMoney(yr.principalPayment))],
        ["Total Debt Service", ...yearly.map(yr => formatMoney(yr.debtPayment))],
        ["DSCR", ...yearly.map(yr => yr.debtPayment > 0 ? `${(yr.anoi / yr.debtPayment).toFixed(2)}x` : "N/A")],
        ["Operating Cash Flow (CFO)", ...yearly.map(yr => formatMoney(yr.operatingCashFlow))],
        ["Cash Flow", ...yearly.map(yr => formatMoney(yr.cashFlow))],
        ["Ending Cash", ...yearly.map(yr => formatMoney(yr.endingCash))],
      ]);
      includedStatements.push(`${p.name} — Cash Flow`);
    } catch (e: unknown) {
      warnings.push(`Failed to generate financials for "${p.name}": ${e instanceof Error ? e.message : "unknown error"}`);
    }
  });

  let companyIncluded = false;
  try {
    const companyData = generateCompanyProForma(properties, global, projMonths);
    const companyYearly: Record<string, number[]> = {};
    const keys = ["totalRevenue", "totalExpenses", "netIncome", "endingCash", "capitalRaiseFunding"] as const;
    keys.forEach(k => { companyYearly[k] = Array(projYears).fill(0); });
    companyData.forEach((m: any, i: number) => {
      const yr = Math.floor(i / MONTHS_PER_YEAR);
      if (yr < projYears) {
        keys.forEach(k => {
          if (k === "endingCash") companyYearly[k][yr] = m[k];
          else companyYearly[k][yr] += m[k];
        });
      }
    });

    const cYearHeaders = ["Line Item", ...Array.from({ length: projYears }, (_, i) => `Year ${i + 1}`)];
    addTable("Management Company — Summary", cYearHeaders, [
      ["Total Revenue", ...companyYearly.totalRevenue.map(v => formatMoney(v))],
      ["Total Expenses", ...companyYearly.totalExpenses.map(v => formatMoney(v))],
      ["Net Income", ...companyYearly.netIncome.map(v => formatMoney(v))],
      ["Funding Received", ...companyYearly.capitalRaiseFunding.map(v => formatMoney(v))],
      ["Ending Cash", ...companyYearly.endingCash.map(v => formatMoney(v))],
    ]);
    includedStatements.push("Management Company — Summary");
    companyIncluded = true;
  } catch (e: unknown) {
    warnings.push(`Failed to generate Management Company financials: ${e instanceof Error ? e.message : "unknown error"}`);
  }

  doc.addPage();
  y = 20;
  doc.setFillColor(26, 35, 50);
  doc.rect(0, 0, pageW, 15, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("Export Summary & Completeness Report", 14, 11);
  y = 25;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  const summaryLines = [
    `Export Timestamp: ${new Date().toLocaleString()}`,
    `Exported By: ${user.email || "unknown"} (Role: ${user.role || "unknown"})`,
    `Projection Period: ${projYears} years (${projMonths} months)`,
    `Properties Included: ${properties.length}`,
    `Financial Statements Generated: ${includedStatements.length}`,
    `Management Company Included: ${companyIncluded ? "Yes" : "No"}`,
    `Global Assumptions: Included`,
    `Warnings: ${warnings.length}`,
  ];
  summaryLines.forEach(line => {
    doc.text(line, 14, y);
    y += 5;
  });
  y += 3;

  addTable("Included Financial Statements", ["#", "Statement"],
    includedStatements.map((s, i) => [String(i + 1), s])
  );

  if (warnings.length > 0) {
    addTable("Data Completeness Warnings", ["#", "Warning"],
      warnings.map((w, i) => [String(i + 1), w])
    );
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(37, 125, 65);
    if (y > 185) { doc.addPage(); y = 20; }
    doc.text("ALL DATA COMPLETE — No warnings detected.", 14, y);
  }

  const { saveFile } = await import("./saveFile");
  const pdfBlob = doc.output("blob");
  await saveFile(pdfBlob, customFilename || "LB_Full_Data_Export.pdf");

  return {
    success: true,
    status: warnings.length > 0 ? "completed-with-warnings" : "completed",
    warnings,
    includedStatements,
    propertyCount: properties.length,
    companyIncluded,
    projectionYears: projYears,
    exportTimestamp,
  };
  } catch (err: unknown) {
    return {
      success: false,
      status: "error",
      error: err instanceof Error ? err.message : "Full data export failed",
      ...base,
    };
  }
}
