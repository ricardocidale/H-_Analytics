/**
 * render-report-png.ts — Factory v2 U5.
 *
 * Lifts the previously-inline `renderUsaliTablePng` pattern from
 * `build-lb-payload.ts` into a shared, generic module that takes any
 * `ReportDefinition` (the same shape consumed by the existing
 * `format-generators/*` exporters) and renders it to a PNG buffer via
 * Playwright at 2x DPR.
 *
 * Design:
 *   - Pure HTML builder (`buildReportHtml`) is exported separately so unit
 *     tests can snapshot the HTML output deterministically without launching
 *     Chromium.
 *   - `renderReportToPng` is the thin Playwright wrapper around the singleton
 *     `getBrowser()` shared with the rest of the slide pipeline.
 *   - Styling preserves the USALI dark-green / cream palette used by the
 *     prior inline implementation so slide 6's embedded income-statement PNG
 *     remains visually consistent through the refactor. The palette is
 *     hard-coded in this module — extending `ReportDefinition.tokens` is not
 *     an option because `artifacts/api-server/src/report/` is in the
 *     financial-engine authoring-authority surface (CLAUDE.md §9).
 *
 * `TableRow.type` → CSS class mapping:
 *   - `total`    → `.row-total`    (NOI highlight: bold green, top/bottom dark border)
 *   - `subtotal` → `.row-subtotal` (medium weight, top border)
 *   - `header`   → `.row-header`   (treated as in-body header)
 *   - `data`     → (default)
 *
 * `TableRow.format` convention for USALI:
 *   - "section-break" → adds a divider top border (Debt Service)
 *   - "cumul"         → italic, muted color (Cumulative Cash Flow)
 *   - "percent"       → values rendered as raw text (formatting done upstream;
 *                       the renderer is purely presentational)
 *
 * See `docs/plans/2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md`
 * (U5) for the contract and R6 ("embedded-report pattern") for the use case.
 */

import type {
  ReportDefinition,
  ReportSection,
  TableSection,
  KpiSection,
  TableRow,
} from "../report/types";
import { logger } from "../logger";
import { getBrowser } from "./playwright-browser";

// ── Render constants (named per CLAUDE.md §1) ────────────────────────────────

/** Default initial viewport width for the headless Chromium context. */
export const DEFAULT_REPORT_WIDTH_PX = 1180;

/** Default initial viewport height. With `fullPage: true` the screenshot
 *  expands to content height; this just controls the layout viewport. */
export const DEFAULT_REPORT_HEIGHT_PX = 600;

/** Default device-pixel-ratio for retina-quality output. */
export const DEFAULT_REPORT_DPR = 2;

/** CSS font weights used by the table HTML. */
const CSS_FW_NORMAL = 500;
const CSS_FW_MEDIUM = 600;
const CSS_FW_BOLD = 700;

/**
 * Maximum scheme length we'll consider valid for logging. A URL "scheme"
 * (`https`, `data`, `file`, …) is a short identifier per RFC 3986. Anything
 * longer than 16 chars before the first colon is probably not a real scheme
 * — log as `(no-scheme)` to avoid echoing attacker-controlled content.
 */
const MAX_SCHEME_LENGTH_FOR_LOG = 16;

/** CSS table layout dimensions. */
const CSS_TABLE_WIDTH_PCT = "100%";
const CSS_LABEL_COL_MIN_WIDTH_PX = 160;

/** KPI grid columns (3-up card layout for KPI sections). */
const KPI_GRID_COLUMNS = 3;

/** USALI palette (dark green + cream) preserved from the prior inline impl. */
const COLOR_HEADER_BG = "#1c2b1e";
const COLOR_HEADER_FG = "#f5f0e8";
const COLOR_ROW_FG = "#222";
const COLOR_LABEL_FG = "#333";
const COLOR_ZEBRA_BG = "#f7f7f4";
const COLOR_BORDER = "#e8e8e5";
const COLOR_SUBTOTAL_TOP = "#ccc";
const COLOR_NOI_FG = "#1a6b38";
const COLOR_SECTION_BREAK = "#d0d0d0";
const COLOR_CUMUL_FG = "#555";
const COLOR_DIM_FG = "#888";
const COLOR_TITLE_FG = "#1c2b1e";
const COLOR_BG = "#fff";

/** Render options. */
export interface RenderReportPngOptions {
  /** Initial viewport width (full-page screenshot still expands to content). */
  widthPx?: number;
  /** Initial viewport height hint. */
  heightPx?: number;
  /** Device pixel ratio (2 = retina). */
  dpr?: number;
}

// ── HTML builders ────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * SSRF mitigation for `<img src>` values in the rendered HTML.
 *
 * Threat model: `ReportDefinition` flows through the engine in production
 * but the renderer is hermetic by contract — only `data:image/...` URLs are
 * a valid input here. A `https://`, `http://`, `javascript:`, `file://`, or
 * any other-scheme URL on `ImageSection.dataUrl` would coerce the headless
 * Chromium context into an outbound fetch (or worse) — a server-side
 * request-forgery surface keyed on an attacker-influenceable field.
 *
 * Returns the source unchanged if it starts with `data:image/`; otherwise
 * `null`. The caller (`renderSection` `case "image"`) substitutes a
 * placeholder `<div>` when this returns `null`, so the renderer never emits
 * an `<img src>` that the browser can fetch.
 *
 * CodeRabbit PR #117 — `render-report-png.ts:~188` (img src SSRF).
 */
function sanitizeImageSrc(src: string): string | null {
  if (typeof src === "string" && src.startsWith("data:image/")) {
    return src;
  }
  // Surface the rejection in Sentry / log aggregation so operators see
  // unexpected schemes from the engine. The renderer continues with a
  // placeholder rather than throwing — `ReportDefinition` is engine-
  // generated, so an unexpected scheme is a bug to surface, not a runtime
  // failure that aborts the slide-factory run.
  //
  // Log derived metadata only (scheme + length), NOT the raw URL. The URL is
  // (in principle) attacker-controlled if a malicious ReportDefinition ever
  // reaches the renderer, and even truncated URL fragments can leak
  // attacker-supplied content into centralized logs. CR finding on PR #119.
  const scheme = typeof src === "string" ? extractScheme(src) : typeof src;
  const length = typeof src === "string" ? src.length : 0;
  logger.warn(
    `rejected non-data-image src in ImageSection (scheme=${scheme}, length=${length})`,
    "render-report-png",
  );
  return null;
}

/** Extract the URL scheme (everything before the first `:`) for safe logging. */
function extractScheme(src: string): string {
  const colonIdx = src.indexOf(":");
  if (colonIdx === -1 || colonIdx > MAX_SCHEME_LENGTH_FOR_LOG) return "(no-scheme)";
  return src.slice(0, colonIdx);
}

function rowClass(row: TableRow): string {
  const classes: string[] = [];
  switch (row.type) {
    case "total":
      classes.push("row-total");
      break;
    case "subtotal":
      classes.push("row-subtotal");
      break;
    case "header":
      classes.push("row-header");
      break;
    case "data":
    default:
      break;
  }
  const fmt = row.format ?? "";
  if (fmt === "section-break") classes.push("row-section-break");
  if (fmt === "cumul") classes.push("row-cumul");
  if (fmt === "dim") classes.push("row-dim");
  return classes.join(" ");
}

function renderTableSection(section: TableSection): string {
  const headers = ["", ...section.years];
  const headerHtml = headers
    .map((h) => `<th>${escapeHtml(h)}</th>`)
    .join("");

  const rowHtml = section.rows
    .map((row) => {
      const cells = row.values
        .map((fv) => `<td>${escapeHtml(fv.text)}</td>`)
        .join("");
      const cls = rowClass(row);
      const labelTd = `<td>${escapeHtml(row.category)}</td>`;
      return `<tr class="${cls}">${labelTd}${cells}</tr>`;
    })
    .join("\n      ");

  return `<section class="report-table">
  <h4>${escapeHtml(section.title)}</h4>
  <table>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>
      ${rowHtml}
    </tbody>
  </table>
</section>`;
}

function renderKpiSection(section: KpiSection): string {
  const cards = section.metrics
    .map(
      (m) => `<div class="kpi-card">
      <div class="kpi-value">${escapeHtml(m.value)}</div>
      <div class="kpi-label">${escapeHtml(m.label)}</div>
      <div class="kpi-desc">${escapeHtml(m.description)}</div>
    </div>`,
    )
    .join("\n    ");
  return `<section class="report-kpi">
  <h4>${escapeHtml(section.title)}</h4>
  <div class="kpi-grid">
    ${cards}
  </div>
</section>`;
}

function renderSection(section: ReportSection): string {
  switch (section.kind) {
    case "table":
      return renderTableSection(section);
    case "kpi":
      return renderKpiSection(section);
    case "chart":
      // Charts are out of scope for U5 — embed a placeholder so the section
      // index stays stable in the rendered output. Slide 6 only uses tables.
      return `<section class="report-chart"><h4>${escapeHtml(section.title)}</h4><div class="placeholder">[chart]</div></section>`;
    case "image": {
      // SSRF mitigation: only `data:image/` schemes are emitted as `<img>`.
      // Anything else renders a placeholder so the browser never fetches.
      // See `sanitizeImageSrc` for the threat model.
      const safeSrc = sanitizeImageSrc(section.dataUrl);
      if (safeSrc === null) {
        return `<section class="report-image"><h4>${escapeHtml(section.title)}</h4><div class="placeholder">[image]</div></section>`;
      }
      return `<section class="report-image"><h4>${escapeHtml(section.title)}</h4><img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(section.title)}"/></section>`;
    }
    default:
      return "";
  }
}

/**
 * Build the standalone HTML document for a `ReportDefinition`.
 * Exported for snapshot-style tests that don't need to launch Playwright.
 *
 * The HTML uses an inline `<style>` block (no external CSS or fonts) so the
 * render is hermetic and reproducible across environments.
 */
export function buildReportHtml(report: ReportDefinition): string {
  const sectionsHtml =
    report.sections.length === 0
      ? `<section class="report-empty"><h4>${escapeHtml(report.cover.reportTitle || "Report")}</h4><div class="placeholder">No data</div></section>`
      : report.sections.map(renderSection).join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(report.cover.reportTitle || "Report")}</title><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:${COLOR_BG};font-family:system-ui,-apple-system,sans-serif;padding:18px 20px 22px 20px}
  h4{font-size:10px;font-weight:${CSS_FW_BOLD};color:${COLOR_TITLE_FG};margin-bottom:12px;letter-spacing:.12em;text-transform:uppercase}
  table{border-collapse:collapse;width:${CSS_TABLE_WIDTH_PCT};font-size:11px}
  th{background:${COLOR_HEADER_BG};color:${COLOR_HEADER_FG};text-align:right;padding:7px 9px;font-weight:${CSS_FW_MEDIUM};font-size:10px;letter-spacing:.04em;white-space:nowrap}
  th:first-child{text-align:left;min-width:${CSS_LABEL_COL_MIN_WIDTH_PX}px}
  td{padding:6px 9px;border-bottom:1px solid ${COLOR_BORDER};text-align:right;color:${COLOR_ROW_FG};white-space:nowrap;font-variant-numeric:tabular-nums}
  td:first-child{text-align:left;color:${COLOR_LABEL_FG};font-weight:${CSS_FW_NORMAL}}
  tr:nth-child(even) td{background:${COLOR_ZEBRA_BG}}
  .row-subtotal td{font-weight:${CSS_FW_MEDIUM};border-top:1px solid ${COLOR_SUBTOTAL_TOP}}
  .row-total td{font-weight:${CSS_FW_BOLD};color:${COLOR_NOI_FG};border-top:1px solid ${COLOR_HEADER_BG};border-bottom:2px solid ${COLOR_HEADER_BG}}
  .row-section-break td{border-top:2px solid ${COLOR_SECTION_BREAK}}
  .row-cumul td{color:${COLOR_CUMUL_FG};font-style:italic}
  .row-dim td{color:${COLOR_DIM_FG};font-size:10px}
  .row-header td{font-weight:${CSS_FW_BOLD};background:${COLOR_HEADER_BG};color:${COLOR_HEADER_FG}}
  section{margin-bottom:20px}
  .kpi-grid{display:grid;grid-template-columns:repeat(${KPI_GRID_COLUMNS},1fr);gap:12px}
  .kpi-card{padding:12px;background:${COLOR_ZEBRA_BG};border:1px solid ${COLOR_BORDER}}
  .kpi-value{font-size:18px;font-weight:${CSS_FW_BOLD};color:${COLOR_NOI_FG}}
  .kpi-label{font-size:10px;color:${COLOR_LABEL_FG};margin-top:4px}
  .kpi-desc{font-size:9px;color:${COLOR_CUMUL_FG};margin-top:2px}
  .placeholder{padding:24px;text-align:center;color:${COLOR_DIM_FG};font-size:11px;background:${COLOR_ZEBRA_BG};border:1px dashed ${COLOR_BORDER}}
</style></head><body>
${sectionsHtml}
</body></html>`;
}

// ── Playwright render ────────────────────────────────────────────────────────

/**
 * Render a `ReportDefinition` to a PNG buffer via Playwright.
 *
 * Uses `fullPage: true`, so `heightPx` is an initial layout-viewport hint
 * only — the resulting PNG's height tracks the rendered content height.
 *
 * Empty reports (zero sections) render a "No data" placeholder rather than
 * throwing, so callers don't need to guard the call site.
 */
export async function renderReportToPng(
  report: ReportDefinition,
  options: RenderReportPngOptions = {},
): Promise<Buffer> {
  const widthPx = options.widthPx ?? DEFAULT_REPORT_WIDTH_PX;
  const heightPx = options.heightPx ?? DEFAULT_REPORT_HEIGHT_PX;
  const dpr = options.dpr ?? DEFAULT_REPORT_DPR;

  const html = buildReportHtml(report);
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: widthPx, height: heightPx },
    deviceScaleFactor: dpr,
  });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const screenshot = await page.screenshot({ fullPage: true, type: "png" });
    return screenshot;
  } finally {
    await context.close().catch(() => {});
  }
}
