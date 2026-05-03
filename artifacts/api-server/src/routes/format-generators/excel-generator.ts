import ExcelJS from "exceljs";
import type { ReportDefinition } from "../../report/types";

type ExcelCell = string | number | null;
type ExcelRow = ExcelCell[];

export interface AISheetRow {
  category?: string;
  indent?: number;
  values?: ExcelCell[];
  formula_notes?: string;
  isItalic?: boolean;
  isHeader?: boolean;
  isBold?: boolean;
  type?: string;
  format?: string;
}

interface AISheet {
  name?: string;
  title?: string;
  subtitle?: string;
  years?: (string | number)[];
  summary_metrics?: { label: string; value: ExcelCell }[];
  rows?: AISheetRow[];
}

interface AIExcelResult {
  sheets?: AISheet[];
}

interface StatementInput {
  title: string;
  years: string[];
  rows: AISheetRow[];
}

export async function generateExcelFromReport(report: ReportDefinition): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  for (const section of report.sections) {
    if (section.kind !== "table") continue;

    const safeName = (section.title || "Sheet").substring(0, 31);
    const ws = wb.addWorksheet(safeName);

    ws.columns = [
      { width: 38 },
      ...section.years.map(() => ({ width: 16 })),
    ];

    ws.addRow(["", ...section.years.map((y) => `FY ${y}`)]);

    for (const row of section.rows) {
      const indent = row.indent ? "  ".repeat(row.indent) : "";
      const label = indent + (row.category || "");
      const values: ExcelCell[] = row.rawValues.map((v) => {
        if (typeof v === "number") return v;
        if (typeof v === "string" && v === "—") return "";
        return v;
      });
      ws.addRow([label, ...values]);
    }

    ws.getRow(1).font = { bold: true };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function generateExcelBuffer(aiResult: AIExcelResult, _data: { companyName?: string; entityName: string; years?: string[] }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  if (aiResult.sheets) {
    for (const sheet of aiResult.sheets) {
      const safeName = (sheet.name || "Sheet").substring(0, 31);
      const ws = wb.addWorksheet(safeName);

      if (sheet.years?.length) {
        ws.columns = [
          { width: 35 },
          ...sheet.years.map(() => ({ width: 16 })),
        ];
      }

      if (sheet.title) {
        ws.addRow([sheet.title]);
        if (sheet.subtitle) ws.addRow([sheet.subtitle]);
        ws.addRow([]);
      }

      if (sheet.summary_metrics?.length) {
        for (const m of sheet.summary_metrics) {
          ws.addRow([m.label, m.value]);
        }
        ws.addRow([]);
      }

      if (sheet.years?.length) {
        ws.addRow(["", ...sheet.years]);
      }

      if (sheet.rows?.length) {
        for (const row of sheet.rows) {
          const indent = row.indent ? "  ".repeat(row.indent) : "";
          const label = indent + (row.category || "");
          const values: ExcelCell[] = (row.values || []).map((v) => {
            if (typeof v === "number") return v;
            if (typeof v === "string" && v === "—") return "";
            return v;
          });
          ws.addRow([label, ...values]);

          if (row.formula_notes) {
            ws.addRow(["  → " + row.formula_notes]);
          }
        }
      }
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function filterFormulaRows<T extends { isItalic?: boolean; type?: string }>(rows: T[]): T[] {
  return rows.filter((r) => !r.isItalic && r.type !== "formula");
}

export async function generateExcelFromData(data: { statements?: StatementInput[] }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const statements = data.statements || [];

  for (const stmt of statements) {
    const rows = filterFormulaRows(stmt.rows);
    const safeName = (stmt.title || "Sheet").substring(0, 31);
    const ws = wb.addWorksheet(safeName);

    ws.columns = [
      { width: 38 },
      ...stmt.years.map(() => ({ width: 16 })),
    ];

    ws.addRow(["", ...stmt.years.map((y) => `FY ${y}`)]);

    for (const row of rows) {
      const indent = row.indent ? "  ".repeat(row.indent) : "";
      const label = indent + (row.category || "");
      const values: ExcelCell[] = (row.values || []).map((v) => {
        if (typeof v === "number") return v;
        if (typeof v === "string" && v === "—") return "";
        return v;
      });
      ws.addRow([label, ...values]);
    }

    ws.getRow(1).font = { bold: true };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
