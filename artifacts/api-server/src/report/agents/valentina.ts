/**
 * Agent: Valentina — Financial Report PDF Export Orchestrator.
 *
 * Valentina is a cross-app Specialist (single name, no NN suffix) that owns
 * the end-to-end quality contract for financial report PDF exports. She uses
 * Otavio (deterministic pagination minion) for mechanical row-splitting, and
 * she is accessible to users via Rebecca ("export my report as PDF").
 *
 * Role taxonomy (CLAUDE.md § 10):
 *   - Valentina is a Specialist — used across report generation AND the
 *     Rebecca chat surface.
 *   - Otavio is her Minion — no LLM, purely deterministic.
 *
 * Pagination contract (four rules, enforced together):
 *   a) Each financial statement starts on a fresh page (CSS .statement-first,
 *      injected by buildPdfHtml via extractBaseTitle boundary detection).
 *   b) Charts occupy a full page with generous padding (CSS .chart-solo,
 *      injected on every line_chart section; height 160mm/192mm landscape/
 *      portrait).
 *   c) Assumption sections are split into named semantic groups (e.g.,
 *      "Partner Compensation", "Staffing", "Fixed Overhead"), each starting
 *      on a fresh page (Otavio splitAssumptionSectionByGroups).
 *   d) Page headers use a bordered, light-background treatment — no dark
 *      navy fill. Border-only: top 3px DK, bottom 2px SAGE (pdf-styles.ts).
 *
 * Built by Norfolk AI.
 */

export const VALENTINA = {
  role: "Financial Report PDF Export Orchestrator",

  short_description:
    "Valentina orchestrates the quality and pagination of financial report " +
    "PDF exports. She enforces the four-rule pagination contract (fresh pages " +
    "per statement, full-page charts, assumption group isolation, light headers) " +
    "and coordinates with Otavio for deterministic row-splitting.",

  long_description: `
Valentina is the agent responsible for financial report PDF quality across all
export surfaces in H+ Analytics.

INPUTS
  • A compiled ReportSection[] (from compiler.ts) or a PdfExportData payload
    (from premium-pdf-pipeline.ts)
  • Export options: orientation (landscape | portrait), statement selection,
    include/exclude assumptions, include/exclude charts

PIPELINE
  1. Valentina receives the export request (via Rebecca tool or direct API).
  2. She invokes Otavio (runMinionOtavioPaginate) to pre-split large sections
     into page-safe chunks, with assumption sections split by semantic group.
  3. The chunked sections flow through buildPdfHtml which injects CSS classes
     per Valentina's pagination contract:
       - .statement-first on the first content-page of each new statement
       - .chart-solo .statement-first on every chart page
  4. WeasyPrint renders the annotated HTML to PDF.
  5. Valentina returns the PDF buffer (single statement) or a ZIP archive
     (multi-statement export, PDF_SPLIT_STATEMENT_COUNT >= 2).

OUTPUTS
  • application/pdf — single-statement or cover+statements
  • application/zip — multi-statement, one PDF per statement

REBECCA TOOL
  Tool name: generate_financial_report_export_link
  Triggered when the user asks to "export my report", "download the PDF",
  "get a PDF of the financial statements", etc.
  Returns: export URL, available formats, and pagination summary.

MINION DEPENDENCY
  Otavio (report/minions/otavio-pagination.ts) — deterministic pagination.
  Otavio receives section arrays and row-cap constants; Valentina provides
  the orientation context and initiates the call via compiler.ts.

MODEL TIER
  Valentina herself does not call an LLM for layout decisions — layout is
  fully deterministic (CSS + Otavio). Valentina's LLM role is limited to
  interpreting user intent in the Rebecca context (e.g., "export the income
  statement as landscape PDF") and routing to the correct API call.
  `,
} as const;
