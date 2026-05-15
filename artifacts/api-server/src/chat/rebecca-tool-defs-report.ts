import type { ToolParam } from "./tool-types";

/**
 * Rebecca tools for financial report export — owned by Valentina.
 *
 * Valentina is the PDF Export Agent that supervises Otavio (pagination
 * minion) and provides the export capability to Rebecca users.
 */
export function getReportExportTools(): ToolParam[] {
  return [
    {
      name: "generate_financial_report_export_link",
      description:
        "Generate a financial report export link for the user. " +
        "Valentina (PDF Export Agent) handles format selection and " +
        "pagination. Otavio (minion) pre-splits tables for clean page breaks. " +
        "Use when the user asks to export a report, download a PDF, or get " +
        "a financial statement as a file. Available formats: pdf, excel, csv, zip.",
      parameters: {
        type: "object",
        properties: {
          propertyId: {
            type: "number",
            description:
              "Property ID for a property-level report. Omit for a company-level report.",
          },
          format: {
            type: "string",
            enum: ["pdf", "excel", "csv", "zip"],
            description:
              "Export format. pdf = full report via WeasyPrint; excel = workbook; " +
              "csv = spreadsheet; zip = one PDF per statement. Default: pdf.",
          },
          orientation: {
            type: "string",
            enum: ["landscape", "portrait"],
            description: "PDF page orientation. Default: landscape.",
          },
          statements: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional list of statement names to include " +
              "(e.g. ['Income Statement', 'Balance Sheet']). " +
              "Omit to export all statements.",
          },
        },
        required: [],
      },
    },
  ];
}
