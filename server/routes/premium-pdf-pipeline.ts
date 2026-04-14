import { BRAND } from "./premium-export-prompts";

import { type ThemeColorMap, resolveThemeColors } from "../theme-resolver";
import { type PdfSection } from "./pdf-html-templates";
import { filterFormulaRows } from "./format-generators/excel-generator";

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
}

interface MetricItem {
  label: string;
  value: string;
}

interface PdfExportData {
  format: string;
  orientation?: string;
  entityName: string;
  companyName?: string;
  statementType?: string;
  years?: string[];
  rows?: ExportRow[];
  statements?: StatementBlock[];
  metrics?: MetricItem[];
  themeColors?: Array<{ name: string; hexCode: string; rank?: number; description?: string }>;
}

export function buildChartSeriesByStatement(tc?: ThemeColorMap): Record<string, Array<{ keyword: string; label: string; color: string }>> {
  const ln = tc?.line || [];
  const accent  = `#${ln[0] || tc?.darkGreen || BRAND.ACCENT_HEX}`;
  const series2 = `#${ln[1] || tc?.navy      || BRAND.PRIMARY_HEX}`;
  const series3 = `#${ln[2] || tc?.sage      || BRAND.SECONDARY_HEX}`;
  const series4 = `#${ln[3] || tc?.lightGray || BRAND.MUTED_HEX}`;
  return {
    income: [
      { keyword: "total revenue",            label: "Revenue", color: accent  },
      { keyword: "gross operating profit",   label: "GOP",     color: series2 },
      { keyword: "net operating income",     label: "NOI",     color: series3 },
      { keyword: "adjusted noi",             label: "ANOI",    color: series4 },
    ],
    cashflow: [
      { keyword: "cash flow from operations", label: "CFO",  color: accent  },
      { keyword: "cash flow from investing",   label: "CFI",  color: series2 },
      { keyword: "cash flow from financing",   label: "CFF",  color: series3 },
      { keyword: "net change in cash",         label: "Net Cash", color: series4 },
    ],
    balance: [
      { keyword: "total assets",      label: "Total Assets",      color: accent  },
      { keyword: "total liabilities", label: "Total Liabilities",  color: series2 },
      { keyword: "total equity",      label: "Total Equity",       color: series3 },
    ],
    investment: [
      { keyword: "net operating income",     label: "NOI",          color: accent  },
      { keyword: "adjusted noi",             label: "ANOI",         color: series2 },
      { keyword: "debt service",             label: "Debt Service", color: series3 },
      { keyword: "free cash flow to equity", label: "FCFE",         color: series4 },
    ],
  };
}

function detectStatementType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("income")) return "income";
  if (t.includes("cash flow")) return "cashflow";
  if (t.includes("balance")) return "balance";
  if (t.includes("investment")) return "investment";
  return "income";
}

export function buildChartsForStatement(stmt: { title: string; years: string[]; rows: ExportRow[] }, tc?: ThemeColorMap): { type: string; title: string; content: { series: Array<{ label: string; values: number[]; color: string }>; years: string[] } } | null {
  const years = stmt.years || [];
  const stmtType = detectStatementType(stmt.title);
  const chartSeries = buildChartSeriesByStatement(tc);
  const seriesDefs = chartSeries[stmtType] || chartSeries.income;

  const series: Array<{ label: string; values: number[]; color: string }> = [];
  for (const def of seriesDefs) {
    for (const row of stmt.rows) {
      const cat = (row.category || "").toLowerCase();
      if (cat.includes(def.keyword)) {
        const vals = (row.values || []).map((v) => typeof v === "number" ? v : 0);
        if (vals.some((v: number) => v !== 0)) {
          series.push({ label: def.label, values: vals, color: def.color });
        }
        break;
      }
    }
  }

  if (series.length < 1) return null;

  return {
    type: "line_chart",
    title: `${stmt.title} — Trends`,
    content: { series, years },
  };
}

export function getMetricDescription(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("irr")) return "Overall investment performance";
  if (l.includes("equity multiple")) return "Return on initial equity";
  if (l.includes("cash-on-cash")) return "Annual cash income yield";
  if (l.includes("total properties") || l.includes("properties")) return "Number of properties managed";
  if (l.includes("total rooms") || l.includes("rooms")) return "Total hotel rooms count";
  return "";
}

export function buildPdfSectionsFromData(data: PdfExportData): PdfSection[] {
  const sections: PdfSection[] = [];
  const tc = resolveThemeColors(data.themeColors);

  if (data.metrics?.length) {
    sections.push({
      type: "metrics_dashboard",
      title: "Key Performance Metrics",
      content: {
        metrics: data.metrics.map(m => ({
          label: m.label,
          value: m.value,
          description: getMetricDescription(m.label),
        })),
      },
    });
  }

  const statements = data.statements || [];
  if (statements.length) {
    for (const stmt of statements) {
      const isInvestment = (stmt.title || "").toLowerCase().includes("investment");

      if (isInvestment) {
        const investmentMetrics: Array<{ label: string; value: string; description: string }> = [];
        const summaryRows = stmt.rows.filter(r => {
          const cat = (r.category || "").toLowerCase();
          return cat.includes("total initial equity") || cat.includes("total exit value")
            || cat.includes("portfolio irr") || cat.includes("equity multiple")
            || cat.includes("cash-on-cash");
        });
        for (const r of summaryRows) {
          const val = typeof r.values?.[0] === "number" ? r.values[0] : 0;
          const cat = (r.category || "");
          let displayVal = "";
          if (cat.includes("IRR") || cat.includes("Cash-on-Cash")) {
            displayVal = `${(Math.abs(val) <= 2 ? val * 100 : val).toFixed(1)}%`;
          } else if (cat.includes("Equity Multiple")) {
            displayVal = `${val.toFixed(2)}x`;
          } else {
            const abs = Math.abs(val);
            displayVal = abs >= 1e6 ? `$${(abs / 1e6).toFixed(1)}M` : abs >= 1e3 ? `$${Math.round(abs / 1e3)}K` : `$${abs.toFixed(0)}`;
          }
          investmentMetrics.push({ label: cat.trim(), value: displayVal, description: getMetricDescription(cat) });
        }
        if (investmentMetrics.length) {
          sections.push({
            type: "metrics_dashboard",
            title: "Investment Summary",
            content: { metrics: investmentMetrics },
          });
        }
      }

      const filteredRows = filterFormulaRows(stmt.rows).map(r => ({
        category: r.category,
        values: r.values,
        type: r.isHeader ? "header" : r.isBold ? "total" : "data",
        indent: r.indent || 0,
        format: r.format,
      }));

      if (isInvestment && filteredRows.length > 0) {
        const majorSections = new Set([
          "Free Cash Flow to Investors",
          "Per-Property Returns",
          "Property-Level IRR Analysis",
          "Discounted Cash Flow (DCF) Analysis",
        ]);

        let pending: typeof filteredRows = [];
        let pendingTitle = "Investment Analysis";

        const flushSection = () => {
          if (!pending.length) return;
          sections.push({
            type: "financial_table",
            title: pendingTitle,
            content: { years: stmt.years, rows: pending },
          });
          pending = [];
        };

        for (const row of filteredRows) {
          if (row.type === "header" && !row.indent && majorSections.has(row.category.trim())) {
            flushSection();
            pendingTitle = row.category.trim();
            pending = [row];
          } else {
            pending.push(row);
          }
        }
        flushSection();
      } else {
        sections.push({
          type: "financial_table",
          title: stmt.title,
          content: { years: stmt.years, rows: filteredRows },
        });
      }

      const chartSection = buildChartsForStatement(stmt, tc);
      if (chartSection) sections.push(chartSection);
    }
  } else if (data.rows?.length && data.years?.length) {
    const filteredRows = filterFormulaRows(data.rows).map(r => ({
      category: r.category,
      values: r.values,
      type: r.isHeader ? "header" : r.isBold ? "total" : "data",
      indent: r.indent || 0,
      format: r.format,
    }));
    sections.push({
      type: "financial_table",
      title: data.statementType || "Financial Statement",
      content: { years: data.years, rows: filteredRows },
    });
  }

  return sections;
}

