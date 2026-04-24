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
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  for (const section of report.sections) {
    if (section.kind !== "table") continue;

    const wsData: ExcelRow[] = [];
    wsData.push(["", ...section.years.map(y => `FY ${y}`)]);

    for (const row of section.rows) {
      const indent = row.indent ? "  ".repeat(row.indent) : "";
      const label = indent + (row.category || "");
      const values: ExcelCell[] = row.rawValues.map((v) => {
        if (typeof v === "number") return v;
        if (typeof v === "string" && v === "\u2014") return "";
        return v;
      });
      wsData.push([label, ...values]);
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 38 }, ...section.years.map(() => ({ wch: 16 }))];

    const headerRange = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) {
        ws[addr].s = { font: { bold: true } };
      }
    }

    const safeName = (section.title || "Sheet").substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}

export async function generateExcelBuffer(aiResult: AIExcelResult, _data: { companyName?: string; entityName: string; years?: string[] }): Promise<Buffer> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  if (aiResult.sheets) {
    for (const sheet of aiResult.sheets) {
      const wsData: ExcelRow[] = [];

      if (sheet.title) {
        wsData.push([sheet.title]);
        if (sheet.subtitle) wsData.push([sheet.subtitle]);
        wsData.push([]);
      }

      if (sheet.summary_metrics?.length) {
        sheet.summary_metrics.forEach((m) => {
          wsData.push([m.label, m.value]);
        });
        wsData.push([]);
      }

      if (sheet.years?.length) {
        wsData.push(["", ...sheet.years]);
      }

      if (sheet.rows?.length) {
        for (const row of sheet.rows) {
          const indent = row.indent ? "  ".repeat(row.indent) : "";
          const label = indent + (row.category || "");
          const values: ExcelCell[] = (row.values || []).map((v) => {
            if (typeof v === "number") return v;
            if (typeof v === "string" && v === "\u2014") return "";
            return v;
          });
          wsData.push([label, ...values]);

          if (row.formula_notes) {
            wsData.push(["  \u2192 " + row.formula_notes]);
          }
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      if (sheet.years?.length) {
        ws["!cols"] = [{ wch: 35 }, ...sheet.years.map(() => ({ wch: 16 }))];
      }

      const safeName = (sheet.name || "Sheet").substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, safeName);
    }
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}

export function filterFormulaRows<T extends { isItalic?: boolean; type?: string }>(rows: T[]): T[] {
  return rows.filter(r => !r.isItalic && r.type !== "formula");
}

export async function generateExcelFromData(data: { statements?: StatementInput[] }): Promise<Buffer> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const statements = data.statements || [];

  for (const stmt of statements) {
    const rows = filterFormulaRows(stmt.rows);
    const wsData: ExcelRow[] = [];

    wsData.push(["", ...stmt.years.map(y => `FY ${y}`)]);

    for (const row of rows) {
      const indent = row.indent ? "  ".repeat(row.indent) : "";
      const label = indent + (row.category || "");
      const values: ExcelCell[] = (row.values || []).map((v) => {
        if (typeof v === "number") return v;
        if (typeof v === "string" && v === "\u2014") return "";
        return v;
      });
      wsData.push([label, ...values]);
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws["!cols"] = [{ wch: 38 }, ...stmt.years.map(() => ({ wch: 16 }))];

    const headerRange = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) {
        ws[addr].s = { font: { bold: true } };
      }
    }

    const safeName = (stmt.title || "Sheet").substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}
