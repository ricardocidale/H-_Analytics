import { BRAND } from "./premium-export-prompts";
import { logger } from "../logger";
import { type ThemeColorMap, type PdfTemplateData, resolveThemeColors, esc } from "../theme-resolver";
import { renderLineChartSection } from "../svg-charts";
import { renderFinancialTableSection } from "../table-renderer";
import { pageHeader } from "../theme-resolver";
import { buildPdfStylesheet } from "../pdf-styles";

export type { ThemeColorMap, PdfTemplateData };
export { resolveThemeColors };

function renderCoverSection(section: { title?: string; subtitle?: string }, d: PdfTemplateData): string {
  const company = esc(d.companyName);
  const entity = esc(d.entityName);
  const title = esc(d.reportTitle || section.title || "Financial Report");
  const subtitle = section.subtitle ? esc(section.subtitle) : "";
  const dateStr = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return `
    <div class="cover-page">
      <div class="cover-accent-top"></div>
      <div class="cover-geometric"></div>
      <div class="cover-sage-bar"></div>
      <div class="cover-content">
        <div class="cover-badge">CONFIDENTIAL</div>
        <h1 class="cover-company">${company}</h1>
        <div class="cover-rule"></div>
        <h2 class="cover-title">${title}</h2>
        ${subtitle ? `<p class="cover-subtitle">${subtitle}</p>` : ""}
        <div class="cover-meta-card">
          <div class="cover-meta-grid">
            <div class="cover-meta-item">
              <span class="cover-meta-label">PREPARED FOR</span>
              <span class="cover-meta-value">${entity}</span>
            </div>
            <div class="cover-meta-item">
              <span class="cover-meta-label">DATE</span>
              <span class="cover-meta-value">${dateStr}</span>
            </div>
            <div class="cover-meta-item">
              <span class="cover-meta-label">CLASSIFICATION</span>
              <span class="cover-meta-value">Strictly Confidential</span>
            </div>
          </div>
        </div>
      </div>
      <div class="cover-footer">
        <p>This document contains proprietary financial projections and confidential business information.
        Distribution is restricted to authorized recipients only.</p>
      </div>
      <div class="cover-accent-bottom"></div>
    </div>`;
}

function renderTableOfContents(section: { content?: { entries?: Array<{ title: string; page: number }> } }, d: PdfTemplateData): string {
  const entries: { title: string; page: number }[] = section.content?.entries || [];

  const rows = entries.map((e, i: number) => `
    <div class="toc-row">
      <span class="toc-num">${String(i + 1).padStart(2, "0")}</span>
      <span class="toc-label">${esc(e.title)}</span>
      <span class="toc-dots"></span>
      <span class="toc-page">${e.page}</span>
    </div>`
  ).join("");

  return `
    <div class="content-page">
      ${pageHeader("Table of Contents", d)}
      <div class="toc-body">${rows}</div>
    </div>`;
}

interface HighlightItem { value?: string; label?: string; description?: string }

function renderExecutiveSummarySection(section: { content?: { paragraphs?: string[]; highlights?: HighlightItem[] } }, d: PdfTemplateData): string {
  const paragraphs: string[] = section.content?.paragraphs || [];
  const highlights: HighlightItem[] = section.content?.highlights || [];

  const parasHtml = paragraphs.map((p: string) =>
    `<p class="summary-para">${esc(p)}</p>`
  ).join("");

  const highlightsHtml = highlights.map((h, i: number) => {
    const accentColors = d.colors
      ? [`#${d.colors.darkGreen}`, `#${d.colors.navy}`, `#${d.colors.sage}`, `#${d.colors.darkGreen}`, `#${d.colors.navy}`]
      : [`#${BRAND.ACCENT_HEX}`, `#${BRAND.PRIMARY_HEX}`, `#${BRAND.SECONDARY_HEX}`, `#${BRAND.ACCENT_HEX}`, `#${BRAND.PRIMARY_HEX}`];
    const color = accentColors[i % accentColors.length];
    return `
      <div class="highlight-card">
        <div class="highlight-accent" style="background:${color}"></div>
        <div class="highlight-body">
          <div class="highlight-value" style="color:${color}">${esc(h.value || "")}</div>
          <div class="highlight-label">${esc(h.label || "")}</div>
          ${h.description ? `<div class="highlight-desc">${esc(h.description)}</div>` : ""}
        </div>
      </div>`;
  }).join("");

  return `
    <div class="content-page">
      ${pageHeader("Executive Summary", d)}
      <div class="summary-body">
        <div class="summary-text-block">${parasHtml}</div>
        ${highlights.length ? `
          <div class="summary-divider"></div>
          <h3 class="section-label">KEY HIGHLIGHTS</h3>
          <div class="highlights-grid">${highlightsHtml}</div>
        ` : ""}
      </div>
    </div>`;
}

function renderMetricsDashboardSection(section: { content?: { metrics?: HighlightItem[] } }, d: PdfTemplateData): string {
  const metrics: HighlightItem[] = section.content?.metrics || [];
  const accentColors = d.colors
    ? [`#${d.colors.darkGreen}`, `#${d.colors.navy}`, `#${d.colors.sage}`, `#${d.colors.darkGreen}`, `#${d.colors.navy}`, `#${d.colors.sage}`]
    : [`#${BRAND.ACCENT_HEX}`, `#${BRAND.PRIMARY_HEX}`, `#${BRAND.SECONDARY_HEX}`, `#${BRAND.ACCENT_HEX}`, `#${BRAND.PRIMARY_HEX}`, `#${BRAND.SECONDARY_HEX}`];

  const cards = metrics.map((m, i: number) => {
    const accent = accentColors[i % accentColors.length];
    return `
      <div class="kpi-card">
        <div class="kpi-accent" style="background:${accent}"></div>
        <div class="kpi-body">
          <div class="kpi-value" style="color:${accent}">${esc(m.value || "")}</div>
          <div class="kpi-label">${esc(m.label || "")}</div>
          ${m.description ? `<div class="kpi-desc">${esc(m.description)}</div>` : ""}
        </div>
      </div>`;
  }).join("");

  return `
    <div class="content-page">
      ${pageHeader("Key Performance Metrics", d)}
      <div class="kpi-grid">${cards}</div>
    </div>`;
}

function renderChartSection(_section: PdfSection, _d: PdfTemplateData): string {
  return "";
}

function renderAnalysisSection(section: { content?: { insights?: string[]; highlights?: HighlightItem[] } }, d: PdfTemplateData): string {
  const insights: string[] = section.content?.insights || [];
  const highlights: HighlightItem[] = section.content?.highlights || [];

  const insightsHtml = insights.map((text: string) => {
    const match = text.match(/^\*\*(.+?):\*\*\s*(.+)$/);
    if (match) {
      return `
        <div class="insight-block">
          <div class="insight-title">${esc(match[1])}</div>
          <div class="insight-text">${esc(match[2])}</div>
        </div>`;
    }
    return `<p class="insight-text-plain">${esc(text)}</p>`;
  }).join("");

  const highlightsHtml = highlights.length ? `
    <h3 class="section-label">KEY HIGHLIGHTS</h3>
    <div class="analysis-highlights-grid">
      ${highlights.map((h) => `
        <div class="analysis-highlight">
          <div class="analysis-highlight-label">${esc(h.label || "")}</div>
          <div class="analysis-highlight-value">${esc(h.value || "")}</div>
          ${h.description ? `<div class="analysis-highlight-desc">${esc(h.description)}</div>` : ""}
        </div>
      `).join("")}
    </div>` : "";

  return `
    <div class="content-page">
      ${pageHeader("Financial Analysis & Insights", d)}
      <div class="analysis-body">
        <div class="insights-list">${insightsHtml}</div>
        ${highlightsHtml}
      </div>
    </div>`;
}

export interface PdfSection {
  type: string;
  title?: string;
  subtitle?: string;
  content?: Record<string, unknown>;
  [key: string]: unknown;
}

export function buildPdfHtml(aiResult: { sections?: PdfSection[] }, data: PdfTemplateData): string {
  const sections = aiResult.sections || [];
  const isL = data.orientation === "landscape";
  const _pageW = isL ? "406.4mm" : "215.9mm";
  const _pageH = isL ? "228.6mm" : "279.4mm";

  const parts: string[] = [];
  for (const section of sections) {
    switch (section.type) {
      case "cover": parts.push(renderCoverSection(section, data)); break;
      case "table_of_contents": parts.push(renderTableOfContents(section as Parameters<typeof renderTableOfContents>[0], data)); break;
      case "executive_summary": parts.push(renderExecutiveSummarySection(section as Parameters<typeof renderExecutiveSummarySection>[0], data)); break;
      case "metrics_dashboard": parts.push(renderMetricsDashboardSection(section as Parameters<typeof renderMetricsDashboardSection>[0], data)); break;
      case "financial_table": parts.push(renderFinancialTableSection(section, data)); break;
      case "chart": parts.push(renderChartSection(section, data)); break;
      case "line_chart": parts.push(renderLineChartSection(section, data)); break;
      case "analysis": parts.push(renderAnalysisSection(section as Parameters<typeof renderAnalysisSection>[0], data)); break;
      default: logger.warn(`Unknown PDF section type "${section.type}" — skipped`, "pdf-template"); break;
    }
  }

  const stylesheet = buildPdfStylesheet({ orientation: data.orientation, colors: data.colors, densePagination: data.densePagination });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(data.reportTitle || data.companyName + " Report")}</title>
<style>
${stylesheet}
</style>
</head>
<body>
${parts.join("\n")}
</body>
</html>`;
}
