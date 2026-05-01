export const BRAND = {
  PRIMARY_HEX: "18181B",
  SECONDARY_HEX: "3F3F46",
  ACCENT_HEX: "10B981",
  FOREGROUND_HEX: "09090B",
  BORDER_HEX: "E4E4E7",
  WHITE_HEX: "FFFFFF",
  BACKGROUND_HEX: "FFFFFF",
  SURFACE_HEX: "F4F4F5",
  MUTED_HEX: "A1A1AA",
  NEGATIVE_HEX: "F43F5E",
};

interface ExportDataShape {
  entityName: string;
  companyName?: string;
  format: string;
  orientation?: string;
  version?: string;
  statementType?: string;
  years?: string[];
  rows?: { category: string; values: (string | number)[]; indent?: number; isBold?: boolean; isHeader?: boolean; isItalic?: boolean }[];
  statements?: { title: string; years: string[]; rows: { category: string; values: (string | number)[]; indent?: number; isBold?: boolean; isHeader?: boolean }[] }[];
  metrics?: { label: string; value: string }[];
  memoSections?: { executiveSummary?: string; investmentThesis?: string; marketOverview?: string; financialHighlights?: string; riskFactors?: string; conclusion?: string };
}

export function buildFinancialDataContext(data: ExportDataShape): string {
  const parts: string[] = [];
  parts.push(`Entity: ${data.entityName}`);
  parts.push(`Company: ${data.companyName}`);

  if (data.metrics?.length) {
    parts.push("\nKey Metrics:");
    data.metrics.forEach(m => parts.push(`  ${m.label}: ${m.value}`));
  }

  if (data.statements?.length) {
    data.statements.forEach(stmt => {
      parts.push(`\n${stmt.title}:`);
      parts.push(`Years: ${stmt.years.join(", ")}`);
      stmt.rows.forEach(row => {
        const indent = row.indent ? "  ".repeat(row.indent) : "";
        const prefix = row.isHeader ? "[SECTION] " : row.isBold ? "[TOTAL] " : "";
        const vals = row.values.map(v =>
          typeof v === "number" ? (v === 0 ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 0 })) : v
        ).join(" | ");
        parts.push(`  ${indent}${prefix}${row.category}: ${vals}`);
      });
    });
  } else if (data.rows?.length && data.years?.length) {
    parts.push(`\n${data.statementType || "Financial Statement"}:`);
    parts.push(`Years: ${data.years.join(", ")}`);
    data.rows.forEach(row => {
      const indent = row.indent ? "  ".repeat(row.indent) : "";
      const prefix = row.isHeader ? "[SECTION] " : row.isBold ? "[TOTAL] " : "";
      const vals = row.values.map(v =>
        typeof v === "number" ? (v === 0 ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 0 })) : v
      ).join(" | ");
      parts.push(`  ${indent}${prefix}${row.category}: ${vals}`);
    });
  }

  return parts.join("\n");
}

function themePaletteBlock(tc?: Array<{name: string; hexCode: string}>): string {
  if (tc?.length) return tc.map(c => `- ${c.name}: ${c.hexCode}`).join("\n");
  return `- Primary: #${BRAND.PRIMARY_HEX}\n- Secondary: #${BRAND.SECONDARY_HEX}\n- Accent: #${BRAND.ACCENT_HEX}\n- Section Background: #${BRAND.BACKGROUND_HEX}\n- Alternating Row: #${BRAND.SURFACE_HEX}`;
}

export function getExcelPrompt(data: ExportDataShape, themeColors?: Array<{name: string; hexCode: string}>): string {
  const versionHint = data.version === "extended"
    ? "Include all line-item breakdowns and detailed sub-categories in each sheet."
    : "Show summary-level totals and key aggregates only.";
  return `You are generating a premium Excel financial workbook. Detail level: ${data.version || "short"}. ${versionHint} Based on the financial data below, produce a JSON structure for Excel generation with enhanced formatting.

Brand palette:
${themePaletteBlock(themeColors)}

Financial Data:
${buildFinancialDataContext(data)}

Return a JSON object with this structure:
{
  "sheets": [
    {
      "name": "Sheet Name",
      "title": "Sheet Title",
      "subtitle": "Optional subtitle",
      "years": ["Year1", "Year2", ...],
      "rows": [
        {
          "category": "Row Label",
          "values": [number or string values],
          "type": "header" | "data" | "subtotal" | "total" | "formula",
          "indent": 0-2,
          "formula_notes": "optional formula explanation"
        }
      ],
      "summary_metrics": [{"label": "...", "value": "..."}],
      "conditional_formatting": [
        {"range": "description", "rule": "positive_green_negative_red" | "data_bars" | "top_bottom"}
      ]
    }
  ],
  "workbook_summary": "Brief description for the summary sheet"
}

Include enhanced formatting instructions like conditional formatting rules, formula notes, and summary metrics that wouldn't be possible with basic client-side generation. Add a summary dashboard sheet if there are multiple financial statements. RESPOND WITH ONLY VALID JSON.`;
}

export function getPptxPrompt(data: ExportDataShape, _themeColors?: Array<{name: string; hexCode: string}>): string {
  const versionHint = data.version === "extended"
    ? "Include detailed financial tables with all line-item breakdowns."
    : "Show summary-level metrics and key aggregates only.";
  return `You are generating a premium PowerPoint investor presentation. Detail level: ${data.version || "short"}. ${versionHint} Based on the financial data below, produce a JSON structure for slide generation with enhanced layouts.

IMPORTANT STYLING RULES — YOU MUST FOLLOW THESE:
- Do NOT include any color values, hex codes, or color names in your output.
- Do NOT suggest gradients, shadows, or visual effects.
- Colors and styling are applied programmatically by the rendering engine. Your job is ONLY to structure content.
- Focus exclusively on slide types, titles, data organization, and textual content.

Financial Data:
${buildFinancialDataContext(data)}

Return a JSON object with this structure:
{
  "slides": [
    {
      "type": "title" | "metrics" | "table" | "comparison" | "summary",
      "title": "Slide Title",
      "subtitle": "Optional subtitle",
      "source_tag": "e.g. Portfolio — 3 Properties",
      "content": {
        // For metrics slides:
        "metrics": [{"label": "...", "value": "...", "trend": "up" | "down" | "stable"}],
        // For table slides:
        "years": ["..."],
        "rows": [{"category": "...", "values": [...], "type": "header|data|subtotal|total", "indent": 0}],
        // For comparison slides:
        "items": [{"name": "...", "metrics": [{"label": "...", "value": "..."}]}],
        // For summary slides:
        "key_takeaways": ["..."],
        "recommendations": ["..."]
      }
    }
  ],
  "presentation_notes": "Brief description"
}

Add insight slides with key takeaways and recommendations that enhance beyond simple data tables. Include trend indicators on metrics. RESPOND WITH ONLY VALID JSON.`;
}

export function getPdfPrompt(data: ExportDataShape): string {
  const isShort = data.version !== "extended";
  const versionHint = isShort
    ? "SHORT version: include ONLY header rows, bold totals, and key subtotals. Omit individual line-item breakdowns. Keep each financial table compact."
    : "EXTENDED version: include all line-item breakdowns and detailed sub-categories.";
  return `You are generating a data-focused ${data.orientation || "landscape"}-oriented PDF financial report. Detail level: ${data.version || "short"}. ${versionHint}

IMPORTANT RULES:
- This report is DATA ONLY. Do NOT include executive_summary, analysis, or notes sections.
- Only include: metrics_dashboard and financial_table sections. Do NOT include a cover section.
- No prose paragraphs, no observations, no written commentary.
- Focus on clean presentation of the financial statements and metrics.

Financial Data:
${buildFinancialDataContext(data)}

Return a JSON object with this structure:
{
  "sections": [
    {
      "type": "metrics_dashboard",
      "title": "Key Performance Metrics",
      "content": {
        "metrics": [{"label": "...", "value": "...", "description": "brief 3-5 word description"}]
      }
    },
    {
      "type": "financial_table",
      "title": "Statement Title",
      "content": {
        "years": ["..."],
        "rows": [{"category": "...", "values": [...], "type": "header|data|subtotal|total", "indent": 0}]
      }
    }
  ],
  "report_title": "Full report title",
  "confidential_notice": "Confidential — For authorized recipients only"
}

RESPOND WITH ONLY VALID JSON.`;
}

export function getPdfDesignPrompt(data: ExportDataShape, themeColors?: Array<{name: string; hexCode: string}>): string {
  const isShort = data.version !== "extended";
  const orientation = data.orientation || "landscape";
  const colorPalette = themeColors?.length
    ? themeColors.map(c => `${c.name}: ${c.hexCode}`).join(", ")
    : `Primary: #${BRAND.PRIMARY_HEX}, Secondary: #${BRAND.SECONDARY_HEX}, Accent: #${BRAND.ACCENT_HEX}, Foreground: #${BRAND.FOREGROUND_HEX}`;

  return `You are a senior graphic designer at a top-tier investment bank. A client handed you this financial data for their hospitality portfolio. Design a ${orientation} PDF report that tells the investment story visually.

Think like a designer, not an engineer:
- What is the hero number? What grabs attention first?
- How does the reader's eye flow through the pages?
- Where do you create visual breathing room (white space)?
- What makes this look like a $100K custom report, not a template?
- Use color psychology: bold accent for wins, subtle neutral for supporting data
- The report should have a narrative arc: evidence (statements) → conclusion (metrics and analysis)

FINANCIAL DATA:
${buildFinancialDataContext(data)}

BRAND PALETTE: ${colorPalette}

VERSION: ${isShort ? "Summary — show only the key totals/headers per statement (like chevrons closed). Clean, executive-level." : "Detailed — show all line items with full breakdowns. Comprehensive analyst-level."}

ORIENTATION: ${orientation} (${orientation === "landscape" ? "406.4mm × 228.6mm, wide format" : "215.9mm × 279.4mm, US Letter"})

STATEMENTS TO INCLUDE: ${data.statements?.map(s => s.title).join(", ") || "Income Statement, Cash Flow, Balance Sheet, Investment Analysis"}

Return a JSON object describing your design vision:
{
  "recommended_orientation": "landscape" | "portrait",
  "design_vision": "2-3 sentence description of the overall visual concept",
  "pages": [
    {
      "type": "metrics_dashboard",
      "title": "Page title",
      "design_notes": "How this page should feel visually",
      "hero_metric": "The single most impressive metric to make largest",
      "metrics": [
        { "label": "Metric Name", "value": "Formatted Value", "visual_weight": "hero" | "primary" | "secondary" }
      ],
      "insight_callout": "1 sentence key takeaway for this section"
    },
    {
      "type": "financial_table",
      "statement_title": "Exact title matching one of the statements",
      "design_notes": "How this table should be styled",
      "highlight_categories": ["Row names that deserve visual emphasis"],
      "insight_callout": "1 sentence observation about this statement's data"
    },
    {
      "type": "line_chart",
      "title": "Chart page title",
      "for_statement": "Which statement this chart accompanies",
      "series": [
        { "label": "Series Name", "color_intent": "primary" | "accent" | "muted" | "warn" }
      ],
      "design_notes": "Chart style guidance — area fills, gradient, minimal, bold"
    }
  ]
}

RULES:
- Every financial statement MUST have a table page followed by a line chart page
- The chart series must match real data keys from the statements (Revenue, GOP, NOI, ANOI, CFO, FCFE, Total Assets, etc.)
- Do NOT invent or hallucinate financial numbers — only reference metrics and labels from the data provided
- Investment Analysis section may use a different visual treatment (KPI cards before the table)
- RESPOND WITH ONLY VALID JSON`;
}

export type AnalysisSectionFlags = {
  kpiSummaryCards?: boolean;
  returnChart?: boolean;
  freeCashFlowTable?: boolean;
  propertyIrrTable?: boolean;
  dcfAnalysis?: boolean;
  performanceTrend?: boolean;
};

const ANALYSIS_SECTION_PROMPTS: Record<keyof AnalysisSectionFlags, string> = {
  kpiSummaryCards: `
SECTION: Portfolio KPI Summary Cards
LAYOUT: Five metric cards in a single full-width row at the top of the Investment Analysis page.
METRICS TO INCLUDE (exact values from data, in this order):
  1. Total Equity — sum of equity invested across all properties (purchase price + improvements + pre-opening + reserves − financing). Label: "Total Equity". Color: neutral.
  2. Exit Value — sum of projected sale values at final hold year (per-property NOI ÷ exit cap rate − outstanding debt). Label: "Exit Value (Year N)". Color: accent/green.
  3. Equity Multiple — total cash returned ÷ total equity invested. Format: "2.34x". Label: "Equity Multiple". Color: blue.
  4. Avg Cash-on-Cash — average annual After-Tax Cash Flow (ATCF) ÷ total equity × 100. Format: "8.2%". Label: "Avg Cash-on-Cash". Color: amber.
  5. Portfolio IRR — Newton-Raphson IRR on the consolidated investor cash flow series (initial outflow + annual ATCF + exit proceeds). Format: "14.7%". Label: "Portfolio IRR". Color: secondary/teal.
PAGINATION: Place at the very top of the Investment Analysis page, before any table.`,

  returnChart: `
SECTION: Investment Returns Line Chart
LAYOUT: Full-width landscape line chart spanning the complete hold period.
SERIES (four lines, in this order):
  1. Net Operating Income (NOI) — revenue minus operating expenses before debt and taxes
  2. Adjusted NOI (ANOI) — NOI adjusted for FF&E reserves and management fee
  3. Debt Service — total annual principal + interest payments (shown as a negative drain or separate downward line)
  4. Free Cash Flow to Equity (FCFE) — After-Tax Cash Flow available to investors after all obligations
X-AXIS: Fiscal years of the hold period (e.g. FY2025–FY2034).
Y-AXIS: Dollar amounts; use M/K suffix abbreviations for readability.
ANNOTATION: Highlight the first year where FCFE turns positive (break-even crossing point).
DESIGN: Area fills with light transparency; legend placed below the chart axes.
PAGINATION: Standalone page; chart fills ≥ 55% of page height with adequate margin below for legend.`,

  freeCashFlowTable: `
SECTION: Free Cash Flow Analysis Table (N-Year)
SUBTITLE: Investor cash flows including distributions, refinancing proceeds, and exit values.
LAYOUT: Horizontal table — categories as rows, fiscal years as columns (Year 0 … Year N).
ROWS (in this exact order):
  1. Equity Investment — negative outflow at each property's acquisition year; format in red/parentheses. Expandable to show per-property rows.
  2. Free Cash Flow to Equity (FCFE) — equals After-Tax Cash Flow (ATCF) each year. Expandable sub-rows: ANOI → Less Debt Service → BTCF → Less Interest → Less Depreciation → Taxable Income → Tax Liability → ATCF.
  3. Refinancing Proceeds — positive cash event in the refi year for properties that refinance; dash if none.
  4. Exit Proceeds — gross sale price of all properties at final hold year only; dashes in all other years.
  5. Net Cash Flow to Investors — algebraic sum of rows 1–4 for each year. Bold row, highlighted background.
  6. Cumulative Cash Flow — running total of Net Cash Flow from Year 0 onward. Negative values in red; show the payback year where cumulative turns positive.
FORMATTING: Negative values in parentheses, red; totals and subtotals in bold; cumulative payback year cell highlighted.
PAGINATION: If hold period > 10 years allow the table to span two pages with column headers repeated.`,

  propertyIrrTable: `
SECTION: Property-Level IRR Analysis Table
SUBTITLE: Individual property returns based on equity investment, cash flows, and exit value.
LAYOUT: One row per property, plus a bold "Portfolio Total" summary row at the bottom.
COLUMNS (in this exact order):
  Property | Equity Investment | Income Tax (%) | Exit Cap Rate (%) | Exit Value (Year N) | Total Distributions | Equity Multiple | IRR (%)
FORMULAS:
  - Equity Investment: purchase price + improvements + pre-opening + reserves − loan proceeds
  - Exit Value: per-property NOI ÷ exit cap rate − outstanding mortgage at sale
  - Total Distributions: sum of all annual ATCF + exit proceeds for that property
  - Equity Multiple: Total Distributions ÷ Equity Investment
  - IRR: Newton-Raphson solver on [−Equity, yr1 ATCF, …, yrN ATCF + Exit Proceeds]
COLOR CODING: IRR above portfolio threshold → green/accent; IRR > 0 → primary; IRR ≤ 0 → red/destructive.
PORTFOLIO TOTAL ROW: Bold; sum equity, sum exit value, sum distributions; capital-weighted equity multiple; blended portfolio IRR.
PAGINATION: All properties typically fit one page; allow continuation if > 12 properties.`,

  dcfAnalysis: `
SECTION: Discounted Cash Flow (DCF) Analysis — Per Property
SUBTITLE: Individual property valuations with country-adjusted discount rates (Damodaran Jan 2026).
LAYOUT:
  PART A — Four KPI summary cards:
    1. Portfolio WACC — capital-weighted average WACC across all properties. Format: "11.3%".
    2. DCF Portfolio Value — sum of individual property DCF present values. Format: "$X.XM".
    3. Net Present Value (NPV) — DCF Value minus Equity Invested. Positive = green; Negative = red.
    4. Value Creation — Portfolio NPV ÷ Total Equity × 100. Format: "+18.4%" or "−3.2%".
  PART B — Per-property table with columns:
    Property | Country | CRP (%) | Re (%) | E/V (%) | WACC (%) | Equity | DCF Value | NPV | Value Δ (%)
FORMULAS:
  - CRP: Country Risk Premium from Damodaran tables (extra equity return for country-specific risk)
  - Re: Base Cost of Equity + CRP
  - E/V: Equity ÷ (Equity + Debt) as percentage
  - WACC: (E/V × Re) + (D/V × Rd × (1 − Tax Rate))
  - DCF Value: Σ(ATCF_t ÷ (1 + WACC)^t) + ExitValue ÷ (1 + WACC)^N
  - NPV: DCF Value − Equity Invested
  - Value Δ: NPV ÷ Equity × 100
COLOR CODING: Positive NPV / Value Δ → green/accent; Negative → red/destructive.
PORTFOLIO TOTAL ROW: Weighted-average WACC, summed equity, summed DCF Value, portfolio NPV, portfolio Value Δ.
PAGINATION: One page per table; if > 8 properties allow table to continue with repeated column headers.`,

  performanceTrend: `
SECTION: Portfolio Performance Trend Chart
SUBTITLE: N-Year Revenue, Operating Expenses, and Adjusted NOI across the full hold period.
LAYOUT: Full-width landscape line chart spanning the complete hold period.
SERIES (three lines, in this order):
  1. Total Revenue — top-line consolidated revenue across all properties each year
  2. Operating Expenses — total operating costs (excluding debt service and taxes)
  3. Adjusted NOI (ANOI) — revenue minus all operating expenses and management adjustments; the primary profit metric
X-AXIS: Fiscal years of the hold period (e.g. FY2025–FY2034).
Y-AXIS: Dollar amounts; use M/K suffix abbreviations.
ANNOTATION: Show the ANOI margin (ANOI ÷ Revenue × 100) as a callout or secondary axis for each year.
DESIGN: Area fills with light transparency; Revenue above Expenses with ANOI as the delta line; legend placed below axes.
PAGINATION: Standalone page; chart fills ≥ 55% of page height.`,
};

export function buildAnalysisExportSectionContext(flags: AnalysisSectionFlags): string {
  const activeSections = (Object.keys(ANALYSIS_SECTION_PROMPTS) as Array<keyof AnalysisSectionFlags>)
    .filter((key) => flags[key] !== false);

  if (activeSections.length === 0) {
    return "No Investment Analysis sections are enabled. Do not include any Investment Analysis content.";
  }

  return [
    `INVESTMENT ANALYSIS SECTIONS TO INCLUDE (${activeSections.length} of 6 enabled):`,
    ...activeSections.map((key, i) => `\n--- Section ${i + 1} ---${ANALYSIS_SECTION_PROMPTS[key]}`),
  ].join("\n");
}

export function getDocxPrompt(data: ExportDataShape, themeColors?: Array<{name: string; hexCode: string}>): string {
  const versionHint = data.version === "extended"
    ? "Include comprehensive detail with full line-item breakdowns in appendix tables."
    : "Keep the memo concise with summary-level figures and key aggregates only.";
  return `You are generating a professional investor memo / due diligence report as a Word document. Detail level: ${data.version || "short"}. ${versionHint} Based on the financial data below, produce a JSON structure for DOCX generation.

Brand palette:
${themePaletteBlock(themeColors)}

Financial Data:
${buildFinancialDataContext(data)}

${data.memoSections ? `
Provided memo sections to incorporate:
${Object.entries(data.memoSections).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join("\n")}
` : ""}

Return a JSON object with this structure:
{
  "title": "Document Title",
  "subtitle": "Subtitle or date",
  "sections": [
    {
      "heading": "Section Heading",
      "level": 1 | 2,
      "content": [
        {"type": "paragraph", "text": "...", "style": "normal" | "bold" | "italic"},
        {"type": "bullet_list", "items": ["..."]},
        {"type": "table", "headers": ["..."], "rows": [["..."]]},
        {"type": "key_value", "pairs": [{"label": "...", "value": "..."}]}
      ]
    }
  ],
  "appendix": {
    "financial_tables": [
      {
        "title": "Table Title",
        "years": ["..."],
        "rows": [{"category": "...", "values": [...], "type": "header|data|subtotal|total"}]
      }
    ]
  }
}

Generate a comprehensive investor memo with:
1. Executive Summary with investment thesis
2. Market Overview and positioning
3. Financial Performance Summary with key metrics in narrative form
4. Risk Factors and mitigations
5. Conclusion and recommendation
6. Appendix with detailed financial tables

Write in professional investment memo style. Numbers should be formatted as currency where appropriate. RESPOND WITH ONLY VALID JSON.`;
}
