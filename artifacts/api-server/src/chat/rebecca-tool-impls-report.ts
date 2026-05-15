/**
 * Rebecca tool implementations for financial report export.
 * Owned by Valentina (PDF Export Agent).
 *
 * These implementations provide guidance and export URLs — the actual PDF
 * rendering happens server-side in premium-exports.ts via WeasyPrint.
 */

import { VALENTINA } from "../report/agents/valentina";

const FORMAT_LABELS: Record<string, string> = {
  pdf: "PDF report (all statements, WeasyPrint)",
  excel: "Excel workbook",
  csv: "CSV bundle",
  zip: "ZIP archive (one PDF per statement)",
};

const FORMAT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  zip: "application/zip",
};

export function toolGenerateFinancialReportExportLink(
  args: Record<string, unknown>,
): { result: unknown } {
  const format = typeof args.format === "string" ? args.format : "pdf";
  const orientation =
    typeof args.orientation === "string" ? args.orientation : "landscape";
  const propertyId =
    args.propertyId !== undefined && args.propertyId !== null
      ? Number(args.propertyId)
      : null;
  const statements =
    Array.isArray(args.statements) ? (args.statements as string[]) : [];

  const scope = propertyId !== null ? `property ${propertyId}` : "company-level";

  const exportPath =
    format === "pdf"
      ? `/api/exports/premium/pdf`
      : format === "excel"
        ? `/api/exports/premium/excel`
        : format === "zip"
          ? `/api/exports/premium/zip`
          : `/api/exports/premium/csv`;

  const paginationSummary = [
    "Each financial statement starts on a fresh page",
    "Charts occupy a full page with generous padding",
    "Assumption groups (Partner Compensation, Staffing, etc.) each get their own page",
    "Page headers use borders only — no dark backgrounds",
  ];

  return {
    result: {
      agent: VALENTINA.role,
      scope,
      format,
      mimeType: FORMAT_MIME[format] ?? "application/octet-stream",
      label: FORMAT_LABELS[format] ?? format,
      orientation: format === "pdf" ? orientation : "n/a",
      statements: statements.length > 0 ? statements : "all",
      exportEndpoint: exportPath,
      instructions:
        `To download your ${scope} ${FORMAT_LABELS[format] ?? format}, ` +
        `navigate to the Reports section, select your property, and click ` +
        `"Export → ${format.toUpperCase()}". ` +
        (format === "pdf"
          ? `Valentina will apply the following pagination rules: ` +
            paginationSummary.join("; ") + "."
          : ""),
      paginationRules: format === "pdf" ? paginationSummary : [],
    },
  };
}
