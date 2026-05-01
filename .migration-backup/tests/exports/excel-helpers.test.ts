import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  setColumnWidths,
  applyCurrencyFormat,
  applyHeaderStyle,
} from "../../client/src/lib/exports/excel/helpers";

// ---------------------------------------------------------------------------
// setColumnWidths — sets !cols metadata on a worksheet
// ---------------------------------------------------------------------------
describe("setColumnWidths", () => {
  it("sets column width metadata on worksheet", () => {
    const ws: XLSX.WorkSheet = {};
    setColumnWidths(ws, [30, 15, 15]);
    expect(ws["!cols"]).toEqual([{ wch: 30 }, { wch: 15 }, { wch: 15 }]);
  });

  it("handles empty widths array", () => {
    const ws: XLSX.WorkSheet = {};
    setColumnWidths(ws, []);
    expect(ws["!cols"]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// applyCurrencyFormat — applies number formats based on row labels
// ---------------------------------------------------------------------------
describe("applyCurrencyFormat", () => {
  function buildSheet(rows: (string | number)[][]): XLSX.WorkSheet {
    return XLSX.utils.aoa_to_sheet(rows);
  }

  it("applies percentage format to occupancy rows", () => {
    const rows: (string | number)[][] = [["Occupancy %", 85.5]];
    const ws = buildSheet(rows);
    applyCurrencyFormat(ws, rows);
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: 1 })];
    expect(cell.z).toBe('0.0"%"');
  });

  it("applies decimal format to ADR rows", () => {
    const rows: (string | number)[][] = [["  ADR", 330.5]];
    const ws = buildSheet(rows);
    applyCurrencyFormat(ws, rows);
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: 1 })];
    expect(cell.z).toBe("#,##0.00");
  });

  it("applies decimal format to RevPAR rows", () => {
    const rows: (string | number)[][] = [["RevPAR", 250.0]];
    const ws = buildSheet(rows);
    applyCurrencyFormat(ws, rows);
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: 1 })];
    expect(cell.z).toBe("#,##0.00");
  });

  it("applies whole-dollar currency format to other rows", () => {
    const rows: (string | number)[][] = [["Total Revenue", 1234567]];
    const ws = buildSheet(rows);
    applyCurrencyFormat(ws, rows);
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: 1 })];
    expect(cell.z).toBe("#,##0");
  });

  it("skips non-numeric cells", () => {
    const rows: (string | number)[][] = [["Header", "N/A"]];
    const ws = buildSheet(rows);
    applyCurrencyFormat(ws, rows);
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: 1 })];
    expect(cell.z).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// applyHeaderStyle — bolds ALL-CAPS section headers and total rows
// ---------------------------------------------------------------------------
describe("applyHeaderStyle", () => {
  function buildSheet(rows: (string | number)[][]): XLSX.WorkSheet {
    return XLSX.utils.aoa_to_sheet(rows);
  }

  it("bolds ALL-CAPS section headers", () => {
    const rows: (string | number)[][] = [
      ["REVENUE", 100],
      ["  Room Revenue", 100],
    ];
    const ws = buildSheet(rows);
    applyHeaderStyle(ws, rows);
    const headerCell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
    expect(headerCell.s?.font?.bold).toBe(true);
    const dataCell = ws[XLSX.utils.encode_cell({ r: 1, c: 0 })];
    expect(dataCell.s?.font?.bold).toBeUndefined();
  });

  it("bolds rows starting with 'Total'", () => {
    const rows: (string | number)[][] = [
      ["Room Revenue", 100],
      ["Total Revenue", 100],
    ];
    const ws = buildSheet(rows);
    applyHeaderStyle(ws, rows);
    const totalCell = ws[XLSX.utils.encode_cell({ r: 1, c: 0 })];
    expect(totalCell.s?.font?.bold).toBe(true);
  });

  it("bolds GAAP Net Income, Adjusted NOI, and similar rows", () => {
    const labels = [
      "GAAP Net Income",
      "Adjusted NOI (ANOI)",
      "Gross Operating Profit",
      "Net Cash Flow",
      "Closing Cash Balance",
      "Net Income After Tax",
      "Free Cash Flow to Equity",
    ];
    for (const label of labels) {
      const rows: (string | number)[][] = [[label, 500]];
      const ws = buildSheet(rows);
      applyHeaderStyle(ws, rows);
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
      expect(cell.s?.font?.bold, `Expected "${label}" to be bolded`).toBe(true);
    }
  });

  it("does not bold short ALL-CAPS labels (<=2 chars)", () => {
    const rows: (string | number)[][] = [["FB", 50]];
    const ws = buildSheet(rows);
    applyHeaderStyle(ws, rows);
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
    expect(cell.s?.font?.bold).toBeUndefined();
  });

  it("does not bold ALL-CAPS labels starting with space (indented)", () => {
    const rows: (string | number)[][] = [[" ROOMS", 50]];
    const ws = buildSheet(rows);
    applyHeaderStyle(ws, rows);
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
    // After trim, "ROOMS" doesn't start with space, so it is treated as a section header.
    expect(cell.s?.font?.bold).toBe(true);
  });

  it("skips empty label rows without throwing", () => {
    const rows: (string | number)[][] = [
      ["", 0],
      ["REVENUE", 0],
    ];
    const ws = buildSheet(rows);
    expect(() => applyHeaderStyle(ws, rows)).not.toThrow();
  });
});
