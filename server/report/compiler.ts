import type {
  ReportDefinition,
  ReportSection,
  DesignTokens,
  KpiSection,
  TableSection,
  ChartSection,
  TableRow,
  FormattedValue,
  KpiMetric,
  CoverMeta,
} from "./types";
import { type ThemeColorMap, resolveThemeColors } from "../theme-resolver";
import { filterFormulaRows } from "../routes/format-generators/excel-generator";
import {
  buildChartsForStatement,
  getMetricDescription,
} from "../routes/premium-pdf-pipeline";

interface ExportRow {
  category: string;
  values: (string | number)[];
  indent?: number;
  isBold?: boolean;
  isHeader?: boolean;
  isItalic?: boolean;
  format?: string;
}

interface StatementBlock {
  title: string;
  years: string[];
  rows: ExportRow[];
  includeTable?: boolean;
  includeChart?: boolean;
}

export interface CompileInput {
  format: string;
  orientation?: string;
  entityName: string;
  companyName?: string;
  statementType?: string;
  years?: string[];
  rows?: ExportRow[];
  statements?: StatementBlock[];
  metrics?: Array<{ label: string; value: string }>;
  themeColors?: Array<{
    name: string;
    hexCode: string;
    rank?: number;
    description?: string;
  }>;
  chartScreenshots?: Array<{
    title: string;
    dataUrl: string;
    aspectRatio?: number;
  }>;
  densePagination?: boolean;
}

function tokensFromColorMap(tc: ThemeColorMap): DesignTokens {
  const h = (hex: string) => (hex.startsWith("#") ? hex : `#${hex}`);
  return {
    primary: h(tc.navy),
    secondary: h(tc.sage),
    accent: h(tc.darkGreen),
    foreground: h(tc.darkText),
    border: h(tc.gray),
    muted: h(tc.altRow),
    surface: h(tc.sectionBg),
    background: h(tc.white),
    white: "#ffffff",
    negativeRed: h(tc.negativeRed),
    chart: tc.chart.map(h),
    line: tc.line.map(h),
  };
}

function isPercentageRow(category: string): boolean {
  const c = (category || "").toLowerCase();
  return (
    c.includes("(%)") ||
    c.includes("margin") ||
    c === "occupancy" ||
    c.includes("cap rate") ||
    c.includes("expense ratio")
  );
}

function isMultiplierRow(category: string): boolean {
  const c = (category || "").toLowerCase();
  return c.includes("equity multiple") || c.includes("dscr");
}

function formatValue(
  v: string | number,
  category: string,
  format?: string,
): FormattedValue {
  const raw = v;
  if (typeof v === "string") return { raw, text: v, negative: false };
  if (typeof v !== "number")
    return { raw, text: String(v ?? ""), negative: false };
  if (isNaN(v)) return { raw, text: "\u2014", negative: false };

  if (format === "percentage" || isPercentageRow(category)) {
    if (v === 0) return { raw, text: "\u2014", negative: false };
    const pct = Math.abs(v) <= 2 ? v * 100 : v;
    if (Math.abs(pct) < 0.05) return { raw, text: "\u2014", negative: false };
    return pct < 0
      ? { raw, text: `(${Math.abs(pct).toFixed(1)}%)`, negative: true }
      : { raw, text: `${pct.toFixed(1)}%`, negative: false };
  }

  if (format === "multiplier" || isMultiplierRow(category)) {
    if (v === 0) return { raw, text: "\u2014", negative: false };
    return { raw, text: v.toFixed(2) + "x", negative: false };
  }

  if (v === 0) return { raw, text: "\u2014", negative: false };
  const abs = Math.abs(v);
  const s = abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return v < 0
    ? { raw, text: `(${s})`, negative: true }
    : { raw, text: s, negative: false };
}

function buildTableRows(
  rawRows: ExportRow[],
): TableRow[] {
  return filterFormulaRows(rawRows).map((r) => ({
    category: r.category,
    values: (r.values || []).map((v: string | number) =>
      formatValue(v, r.category, r.format),
    ),
    rawValues: r.values || [],
    type: r.isHeader
      ? "header"
      : r.isBold
        ? "total"
        : ("data" as "header" | "data" | "total"),
    indent: r.indent || 0,
    format: r.format,
  }));
}

function _buildInvestmentKpi(stmt: StatementBlock): KpiSection | null {
  const investmentMetrics: KpiMetric[] = [];
  const summaryRows = stmt.rows.filter((r) => {
    const cat = (r.category || "").toLowerCase();
    return (
      cat.includes("total initial equity") ||
      cat.includes("total exit value") ||
      cat.includes("portfolio irr") ||
      cat.includes("equity multiple") ||
      cat.includes("cash-on-cash")
    );
  });
  for (const r of summaryRows) {
    const val = typeof r.values?.[0] === "number" ? r.values[0] : 0;
    const cat = r.category || "";
    let displayVal = "";
    if (cat.includes("IRR") || cat.includes("Cash-on-Cash")) {
      displayVal = `${(Math.abs(val) <= 2 ? val * 100 : val).toFixed(1)}%`;
    } else if (cat.includes("Equity Multiple")) {
      displayVal = `${val.toFixed(2)}x`;
    } else {
      const abs = Math.abs(val);
      displayVal =
        abs >= 1e6
          ? `$${(abs / 1e6).toFixed(1)}M`
          : abs >= 1e3
            ? `$${Math.round(abs / 1e3)}K`
            : `$${abs.toFixed(0)}`;
    }
    investmentMetrics.push({
      label: cat.trim(),
      value: displayVal,
      description: getMetricDescription(cat),
    });
  }
  if (!investmentMetrics.length) return null;
  return { kind: "kpi", title: "Investment Summary", metrics: investmentMetrics };
}

function splitInvestmentTables(
  stmt: StatementBlock,
  filteredRows: TableRow[],
): TableSection[] {
  const majorSections = new Set([
    "Free Cash Flow to Investors",
    "Per-Property Returns",
    "Property-Level IRR Analysis",
    "Discounted Cash Flow (DCF) Analysis",
  ]);

  const sections: TableSection[] = [];
  let pending: TableRow[] = [];
  let pendingTitle = "Investment Analysis";

  const flush = () => {
    if (!pending.length) return;
    sections.push({
      kind: "table",
      title: pendingTitle,
      years: stmt.years,
      rows: pending,
    });
    pending = [];
  };

  for (const row of filteredRows) {
    if (
      row.type === "header" &&
      !row.indent &&
      majorSections.has(row.category.trim())
    ) {
      flush();
      pendingTitle = row.category.trim();
      pending = [row];
    } else {
      pending.push(row);
    }
  }
  flush();

  return sections;
}

function buildChartSection(
  stmt: StatementBlock,
  tc: ThemeColorMap,
): ChartSection | null {
  const result = buildChartsForStatement(stmt, tc);
  if (!result) return null;
  return {
    kind: "chart",
    title: result.title,
    years: result.content.years,
    series: result.content.series,
  };
}

export function compileReport(input: CompileInput): ReportDefinition {
  const tc = resolveThemeColors(input.themeColors);
  const tokens = tokensFromColorMap(tc);
  const company = input.companyName || input.entityName || "Financial Report";
  const isLandscape = (input.orientation || "landscape") === "landscape";

  const cover: CoverMeta = {
    companyName: company,
    entityName: input.entityName,
    reportTitle: input.statementType
      ? `${company} \u2014 ${input.statementType}`
      : `${company} \u2014 Financial Report`,
    subtitle: input.statementType,
    date: new Date().toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }),
  };

  const sections: ReportSection[] = [];

  const statements = input.statements || [];
  if (statements.length) {
    for (const stmt of statements) {
      const isInvestment = (stmt.title || "")
        .toLowerCase()
        .includes("investment");

      const skipTable = stmt.includeTable === false;
      const skipChart = stmt.includeChart === false;

      if (!skipTable) {
        const filteredRows = buildTableRows(stmt.rows);

        if (isInvestment && filteredRows.length > 0) {
          const subSections = splitInvestmentTables(stmt, filteredRows);
          sections.push(...subSections);
        } else {
          sections.push({
            kind: "table",
            title: stmt.title,
            years: stmt.years,
            rows: filteredRows,
          });
        }
      }

      if (!skipChart) {
        const chartSection = buildChartSection(stmt, tc);
        if (chartSection) sections.push(chartSection);
      }
    }
  } else if (input.rows?.length && input.years?.length) {
    const filteredRows = buildTableRows(input.rows);
    sections.push({
      kind: "table",
      title: input.statementType || "Financial Statement",
      years: input.years,
      rows: filteredRows,
    });
  }

  if (input.chartScreenshots?.length) {
    const insertIdx = sections.findIndex(s => s.kind === "kpi") + 1 || 0;
    const imageSections: ReportSection[] = input.chartScreenshots.map(ss => ({
      kind: "image" as const,
      title: ss.title,
      dataUrl: ss.dataUrl,
      aspectRatio: ss.aspectRatio,
    }));
    sections.splice(insertIdx, 0, ...imageSections);
  }

  return {
    cover,
    tokens,
    orientation: isLandscape ? "landscape" : "portrait",
    sections,
    densePagination: input.densePagination !== false,
  };
}
