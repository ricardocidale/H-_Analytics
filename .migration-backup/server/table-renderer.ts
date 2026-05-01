import type { PdfTemplateData } from "./theme-resolver";
import { esc, pageHeader } from "./theme-resolver";

type RenderableValue = number | string | null | undefined;

interface RenderableRow {
  category?: string;
  values?: RenderableValue[];
  type?: "header" | "data" | "total" | "subtotal" | "formula";
  isHeader?: boolean;
  isBold?: boolean;
  isItalic?: boolean;
  indent?: number;
  format?: string;
}

interface RenderableTableSection {
  title?: string;
  content?: { years?: (string | number)[]; rows?: RenderableRow[] };
}

export function isPercentageRow(category: string): boolean {
  const c = (category || "").toLowerCase();
  return c.includes("(%)") || c.includes("margin") || c === "occupancy"
    || c.includes("cap rate") || c.includes("expense ratio");
}

export function isMultiplierRow(category: string): boolean {
  const c = (category || "").toLowerCase();
  return c.includes("equity multiple") || c.includes("dscr");
}

export function formatTableValue(v: RenderableValue, category: string, format?: string): string {
  if (typeof v === "string") return esc(v);
  if (typeof v !== "number") return esc(String(v ?? ""));
  if (isNaN(v)) return "\u2014";

  if (format === "percentage" || isPercentageRow(category)) {
    if (v === 0) return "\u2014";
    const pct = Math.abs(v) <= 2 ? v * 100 : v;
    if (Math.abs(pct) < 0.05) return "\u2014";
    const cls = pct < 0 ? ' class="val-neg"' : "";
    return pct < 0 ? `<span${cls}>(${Math.abs(pct).toFixed(1)}%)</span>` : `${pct.toFixed(1)}%`;
  }

  if (format === "multiplier" || isMultiplierRow(category)) {
    if (v === 0) return "\u2014";
    return v.toFixed(2) + "x";
  }

  if (v === 0) return "\u2014";
  const abs = Math.abs(v);
  const s = abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return v < 0 ? `<span class="val-neg">(${s})</span>` : s;
}

export function renderFinancialTableSection(section: RenderableTableSection, d: PdfTemplateData): string {
  const title = esc(section.title || "Financial Statement");
  const years = section.content?.years || [];
  const rows = section.content?.rows || [];

  if (!years.length || !rows.length) {
    return `
      <div class="content-page">
        ${pageHeader(title, d)}
        <p class="empty-state">No financial data available for this section.</p>
      </div>`;
  }

  const yearHeaders = years.map((yr) =>
    `<th class="tbl-year">FY ${esc(String(yr))}</th>`
  ).join("");

  const bodyRows = rows.map((r, idx) => {
    const isHeader = r.type === "header" || r.isHeader;
    const isTotal = r.type === "total" || r.type === "subtotal" || r.isBold;
    const isFormula = r.isItalic || r.type === "formula";
    const indent = r.indent ?? 0;
    const category = (r.category || "").trim();

    if (!category && (r.values || []).every((v) => v === 0 || v === null || v === "")) {
      return `<tr class="row-spacer"><td colspan="${years.length + 1}" style="height:3mm;border:none"></td></tr>`;
    }

    let cls = "";
    if (isHeader) cls = "row-header";
    else if (isTotal) cls = "row-total";
    else if (isFormula) cls = "row-formula";
    else if (idx % 2 === 0) cls = "row-stripe";

    const indentPx = indent * 14;
    const label = esc(category);

    const allZero = (r.values || []).every((v) => v === 0 || v === null || v === "");
    const vals = (r.values || []).map((v) =>
      `<td class="tbl-val">${allZero && isHeader ? "" : formatTableValue(v, category, r.format)}</td>`
    ).join("");

    return `<tr class="${cls}"><td class="tbl-label" style="padding-left:${8 + indentPx}px">${label}</td>${vals}</tr>`;
  }).join("");

  return `
    <div class="content-page">
      ${pageHeader(title, d)}
      <table class="fin-table">
        <thead><tr><th class="tbl-label-hdr"></th>${yearHeaders}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;
}
