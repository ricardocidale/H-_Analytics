// Re-export from the authoritative source to avoid duplicate interfaces
export type { ExportRow, ExportData } from "@/components/dashboard/statementBuilders";
import type { ExportRow, ExportData } from "@/components/dashboard/statementBuilders";
import type { ExportFormat } from "./exportStyles";

export function headerRow(category: string, values: number[], opts?: { isBold?: boolean }): ExportRow {
  return { category, values, isHeader: true, isBold: opts?.isBold };
}

export function lineItem(category: string, values: number[], opts?: { indent?: number; format?: ExportFormat; isBold?: boolean }): ExportRow {
  return { category, values, indent: opts?.indent ?? 1, format: opts?.format, isBold: opts?.isBold };
}

export function subtotalRow(category: string, values: number[]): ExportRow {
  return { category, values, isHeader: true, isBold: true };
}

export function spacerRow(yearCount: number): ExportRow {
  return { category: "", values: Array(yearCount).fill(0) };
}

export function formulaRow(text: string, values: number[]): ExportRow {
  return { category: `Formula: ${text}`, values, indent: 2, isItalic: true };
}

export function perPropertyRows(
  label: string,
  yearCount: number,
  getter: (yearIdx: number) => number,
  indent = 1
): ExportRow {
  return { category: label, values: Array.from({ length: yearCount }, (_, i) => getter(i)), indent };
}

export function yearValues<T>(years: number[], cache: T[], accessor: (item: T) => number): number[] {
  return years.map((_, i) => {
    const item = cache[i];
    return item ? accessor(item) : 0;
  });
}

export function consolidate(
  years: number[],
  allPropertyData: unknown[][],
  accessor: (item: unknown) => number
): number[] {
  return years.map((_, y) =>
    allPropertyData.reduce((sum, prop) => sum + (prop[y] ? accessor(prop[y]) : 0), 0)
  );
}

export function toExportShape(data: ExportData): {
  years: string[];
  rows: { category: string; values: number[]; indent?: number; isBold?: boolean; isHeader?: boolean }[];
} {
  return {
    years: data.years.map(String),
    rows: data.rows.map(r => ({
      category: r.category,
      values: r.values,
      indent: r.indent,
      isBold: r.isBold ?? r.isHeader,
      isHeader: r.isHeader,
    })),
  };
}
