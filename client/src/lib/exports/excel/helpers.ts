import { getFiscalYearForModelYear } from "@/lib/financialEngine";
import { aggregatePropertyByYear } from "@/lib/financial/yearlyAggregator";
import { YearlyAggregation } from "./types";

function encodeCell(r: number, c: number): string {
  let col = "";
  let cc = c;
  while (cc >= 0) {
    col = String.fromCharCode((cc % 26) + 65) + col;
    cc = Math.floor(cc / 26) - 1;
  }
  return col + (r + 1);
}

/** Trigger a browser download of the given Excel workbook. */
export async function downloadWorkbook(wb: any, filename: string) {
  const XLSX = await import("xlsx");
  const { saveFile } = await import("../saveFile");
  const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  await saveFile(blob, filename);
}

/** Set Excel column widths (in character units) so labels and numbers aren't truncated. */
export function setColumnWidths(ws: any, widths: number[]) {
  ws["!cols"] = widths.map((w) => ({ wch: w }));
}

/**
 * Apply Excel number formats to numeric cells based on their row label.
 * - Occupancy rows get a percentage format (e.g. 85.0%)
 * - ADR / RevPAR rows get a decimal currency format ($250.00)
 * - Percentage/rate rows (IRR, Cash-on-Cash, Net Income Margin, DSCR) get decimal format
 * - Equity Multiple gets a decimal multiplier format (e.g. 1.85x)
 * - Everything else gets a whole-dollar currency format ($1,234)
 */
export function applyCurrencyFormat(ws: any, rows: (string | number)[][]): void {
  const currencyFormat = '#,##0';
  const negCurrencyFormat = '#,##0;(#,##0)';
  const decimalFormat = '#,##0.00';
  const percentFormat = '0.00"%"';
  const multiplierFormat = '0.00"x"';
  const ratioFormat = '0.00';

  for (let r = 0; r < rows.length; r++) {
    for (let c = 1; c < rows[r].length; c++) {
      const cellRef = encodeCell(r, c);
      const cell = ws[cellRef];
      if (!cell || typeof cell.v !== 'number') continue;

      const label = String(rows[r][0] || '').trim().toLowerCase();

      if (label.includes('occupancy %')) {
        cell.z = '0.0"%"';
      } else if (label === 'occupancy') {
        cell.z = '0.0%';
      } else if (label.includes('irr') || label.includes('cash-on-cash') || label.includes('net income margin')) {
        cell.z = percentFormat;
      } else if (label.includes('equity multiple')) {
        cell.z = multiplierFormat;
      } else if (label.includes('dscr')) {
        cell.z = ratioFormat;
      } else if (label.includes('adr') || label.includes('revpar')) {
        cell.z = decimalFormat;
      } else if (
        label.includes('expense') ||
        label.includes('depreciation') ||
        label.includes('liabilit') ||
        label.includes('debt') ||
        label.includes('cash paid')
      ) {
        cell.z = negCurrencyFormat;
      } else {
        cell.z = currencyFormat;
      }
    }
  }
}

/**
 * Bold section headers (ALL-CAPS labels) and total/summary rows so they
 * visually stand out in the exported spreadsheet.
 */
export function applyHeaderStyle(ws: any, rows: (string | number)[][]): void {
  for (let r = 0; r < rows.length; r++) {
    const label = String(rows[r][0] || '').trim();
    if (!label) continue;

    const isSection = label === label.toUpperCase() && label.length > 2 && !label.startsWith(' ');
    const lower = label.toLowerCase();
    const isTotalRow = lower.startsWith('total') ||
      lower.includes('gaap net') ||
      lower.includes('adjusted noi') ||
      lower.includes('adjusted gop') ||
      lower.includes('gross operating') ||
      lower.includes('net operating income') ||
      lower.includes('net cash flow') ||
      lower.includes('net change in cash') ||
      lower.includes('net increase') ||
      lower.includes('closing cash') ||
      lower.includes('net income') ||
      lower.includes('free cash flow') ||
      lower.includes('gross profit') ||
      lower.includes('operating expenses') ||
      lower.includes('fixed charges') ||
      lower.includes('management fees') ||
      lower.includes('portfolio metrics') ||
      lower.includes('annual performance') ||
      lower.includes('operational metrics') ||
      (lower.includes('cash flow') && !lower.startsWith(' '));

    if (isSection || isTotalRow) {
      for (let c = 0; c < rows[r].length; c++) {
        const cellRef = encodeCell(r, c);
        const cell = ws[cellRef];
        if (cell) {
          if (!cell.s) cell.s = {};
          cell.s.font = { bold: true };
        }
      }
    }
  }
}

/**
 * Roll up monthly pro-forma data into fiscal-year buckets and attach a
 * human-readable fiscal-year label to each bucket (e.g. "2027").
 */
export function aggregateByYear(
  data: any[],
  years: number,
  modelStartDate: string,
  fiscalYearStartMonth: number
): YearlyAggregation[] {
  return aggregatePropertyByYear(data, years).map((y) => ({
    ...y,
    label: String(getFiscalYearForModelYear(modelStartDate, fiscalYearStartMonth, y.year)),
  }));
}
