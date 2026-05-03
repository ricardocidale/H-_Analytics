import type { ServerExportData } from "../report/server-export-data";

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `"${value}"`;
}

export function generateCsvFromExportData(data: ServerExportData): Buffer {
  const lines: string[] = [];

  for (const stmt of data.statements) {
    lines.push(csvEscape(stmt.title));
    lines.push(["", ...stmt.years.map(y => csvEscape(y))].join(","));

    for (const row of stmt.rows) {
      const indent = row.indent ? "  ".repeat(row.indent) : "";
      const label = csvEscape(`${indent}${row.category}`);
      const values = row.values.map(v => {
        if (typeof v === "number") return v.toFixed(0);
        return csvEscape(String(v));
      });
      lines.push([label, ...values].join(","));
    }
    lines.push("");
  }

  return Buffer.from(lines.join("\n"), "utf-8");
}
