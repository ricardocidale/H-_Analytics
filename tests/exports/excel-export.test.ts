import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  applyCurrencyFormat,
  applyHeaderStyle,
  setColumnWidths,
} from "../../client/src/lib/exports/excel/helpers";
import { buildPropertyISRows } from "../../client/src/lib/exports/excel/property-sheets";
import type { YearlyPropertyFinancials } from "../../client/src/lib/financial/yearlyAggregator";

function makeYearlyData(yearCount: number): (YearlyPropertyFinancials & { label: string })[] {
  return Array.from({ length: yearCount }, (_, i) => ({
    year: i,
    label: String(2027 + i),
    soldRooms: 5000 + i * 200,
    availableRooms: 7320,
    cleanAdr: 330 + i * 10,
    revenueRooms: 1650000 + i * 100000,
    revenueEvents: 400000 + i * 30000,
    revenueFB: 350000 + i * 20000,
    revenueOther: 100000 + i * 5000,
    revenueTotal: 2500000 + i * 155000,
    expenseRooms: 600000 + i * 30000,
    expenseFB: 100000 + i * 8000,
    expenseEvents: 260000 + i * 15000,
    expenseOther: 60000 + i * 3000,
    expenseOtherCosts: 50000 + i * 2000,
    expensePlatformFees: 0,
    expensePreOpening: 0,
    expenseMarketing: 125000 + i * 7000,
    expensePropertyOps: 100000 + i * 5000,
    expenseUtilitiesVar: 90000 + i * 4000,
    expenseUtilitiesFixed: 35000 + i * 1000,
    expenseUtilities: 125000 + i * 5000,
    expenseAdmin: 200000 + i * 10000,
    expenseIT: 50000 + i * 2000,
    expenseTaxes: 60000 + i * 2000,
    expenseFFE: 100000 + i * 6000,
    feeBase: 125000 + i * 7000,
    feeIncentive: 80000 + i * 5000,
    totalExpenses: 1800000 + i * 100000,
    gop: 900000 + i * 55000,
    noi: 500000 + i * 30000,
    interestExpense: 50000 - i * 1000,
    depreciationExpense: 27273,
    incomeTax: 100000 + i * 5000,
    netIncome: 320000 + i * 25000,
    principalPayment: 20000 + i * 500,
    debtPayment: 70000 - i * 500,
    refinancingProceeds: 0,
    cashFlow: 250000 + i * 20000,
    operatingCashFlow: 350000 + i * 25000,
    financingCashFlow: -70000 + i * 500,
    endingCash: 250000 + i * 270000,
  }));
}

describe("Excel helpers", () => {
  describe("setColumnWidths", () => {
    it("sets column widths on worksheet", () => {
      const ws: XLSX.WorkSheet = {};
      setColumnWidths(ws, [30, 15, 15, 15]);

      expect(ws["!cols"]).toHaveLength(4);
      expect(ws["!cols"]![0]).toEqual({ wch: 30 });
      expect(ws["!cols"]![1]).toEqual({ wch: 15 });
    });
  });

  describe("applyCurrencyFormat", () => {
    it("applies currency format to numeric cells", () => {
      const rows: (string | number)[][] = [
        ["Revenue", 500000, 600000],
        ["Occupancy %", 85.0, 87.5],
        ["ADR", 330.50, 340.25],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      applyCurrencyFormat(ws, rows);

      // Revenue row should have #,##0 format
      const b1 = ws[XLSX.utils.encode_cell({ r: 0, c: 1 })];
      expect(b1.z).toBe("#,##0");

      // Occupancy row should have percentage format
      const b2 = ws[XLSX.utils.encode_cell({ r: 1, c: 1 })];
      expect(b2.z).toBe('0.0"%"');

      // ADR row should have decimal format
      const b3 = ws[XLSX.utils.encode_cell({ r: 2, c: 1 })];
      expect(b3.z).toBe("#,##0.00");
    });

    it("skips non-numeric cells", () => {
      const rows: (string | number)[][] = [
        ["Label", "N/A", 100],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      applyCurrencyFormat(ws, rows);

      // String cell should not have format
      const b1 = ws[XLSX.utils.encode_cell({ r: 0, c: 1 })];
      expect(b1.z).toBeUndefined();
    });

    it("applies percentage format for occupancy rows", () => {
      const rows: (string | number)[][] = [
        ["  Occupancy %", 75.5],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      applyCurrencyFormat(ws, rows);

      const cell = ws[XLSX.utils.encode_cell({ r: 0, c: 1 })];
      expect(cell.z).toBe('0.0"%"');
    });

    it("applies decimal format for RevPAR rows", () => {
      const rows: (string | number)[][] = [
        ["  RevPAR", 225.75],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      applyCurrencyFormat(ws, rows);

      const cell = ws[XLSX.utils.encode_cell({ r: 0, c: 1 })];
      expect(cell.z).toBe("#,##0.00");
    });
  });

  describe("applyHeaderStyle", () => {
    it("bolds ALL-CAPS section headers", () => {
      const rows: (string | number)[][] = [
        ["REVENUE", 0],
        ["  Room Revenue", 500000],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      applyHeaderStyle(ws, rows);

      const headerCell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
      expect(headerCell.s?.font?.bold).toBe(true);

      const dataCell = ws[XLSX.utils.encode_cell({ r: 1, c: 0 })];
      expect(dataCell.s?.font?.bold).toBeUndefined();
    });

    it("bolds total rows", () => {
      const rows: (string | number)[][] = [
        ["Total Revenue", 2500000],
        ["  Room Revenue", 1500000],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      applyHeaderStyle(ws, rows);

      const totalCell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
      expect(totalCell.s?.font?.bold).toBe(true);
    });

    it("bolds NOI and Net Income rows", () => {
      const rows: (string | number)[][] = [
        ["Adjusted NOI (ANOI)", 500000],
        ["GAAP Net Income", 200000],
        ["Gross Operating Profit (GOP)", 800000],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      applyHeaderStyle(ws, rows);

      for (let r = 0; r < rows.length; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
        expect(cell.s?.font?.bold).toBe(true);
      }
    });

    it("skips empty label rows", () => {
      const rows: (string | number)[][] = [
        ["", 0],
        ["REVENUE", 0],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      // Should not throw
      applyHeaderStyle(ws, rows);
    });
  });
});

describe("buildPropertyISRows", () => {
  it("builds income statement with correct header row", () => {
    const yearly = makeYearlyData(3);
    const rows = buildPropertyISRows(yearly);

    expect(rows[0][0]).toBe("Income Statement");
    expect(rows[0]).toHaveLength(4); // label + 3 years
    expect(rows[0][1]).toBe("2027");
    expect(rows[0][2]).toBe("2028");
    expect(rows[0][3]).toBe("2029");
  });

  it("includes all USALI revenue sections", () => {
    const yearly = makeYearlyData(2);
    const rows = buildPropertyISRows(yearly);
    const labels = rows.map((r) => String(r[0]).trim());

    expect(labels).toContain("REVENUE");
    expect(labels).toContain("Room Revenue");
    expect(labels).toContain("Food & Beverage");
    expect(labels).toContain("Events & Functions");
    expect(labels).toContain("Other Revenue");
    expect(labels).toContain("Total Revenue");
  });

  it("includes operating expense categories", () => {
    const yearly = makeYearlyData(2);
    const rows = buildPropertyISRows(yearly);
    const labels = rows.map((r) => String(r[0]).trim());

    expect(labels).toContain("OPERATING EXPENSES");
    expect(labels).toContain("Housekeeping");
    expect(labels).toContain("Sales & Marketing");
    expect(labels).toContain("Administrative & General");
  });

  it("includes profitability metrics", () => {
    const yearly = makeYearlyData(2);
    const rows = buildPropertyISRows(yearly);
    const labels = rows.map((r) => String(r[0]).trim());

    expect(labels).toContain("Gross Operating Profit (GOP)");
    expect(labels).toContain("Adjusted NOI (ANOI)");
    expect(labels).toContain("GAAP Net Income");
  });

  it("includes debt service and below-ANOI items", () => {
    const yearly = makeYearlyData(2);
    const rows = buildPropertyISRows(yearly);
    const labels = rows.map((r) => String(r[0]).trim());

    expect(labels).toContain("DEBT SERVICE");
    expect(labels).toContain("Interest Expense");
    expect(labels).toContain("Depreciation");
    expect(labels).toContain("Income Tax");
  });

  it("maps numeric values from yearly data", () => {
    const yearly = makeYearlyData(2);
    const rows = buildPropertyISRows(yearly);

    // Find Total Revenue row
    const totalRevRow = rows.find((r) => String(r[0]).trim() === "Total Revenue");
    expect(totalRevRow).toBeDefined();
    expect(totalRevRow![1]).toBe(yearly[0].revenueTotal);
    expect(totalRevRow![2]).toBe(yearly[1].revenueTotal);
  });

  it("computes ADR from revenue/rooms", () => {
    const yearly = makeYearlyData(2);
    const rows = buildPropertyISRows(yearly);

    const adrRow = rows.find((r) => String(r[0]).trim() === "ADR");
    expect(adrRow).toBeDefined();
    // ADR = revenueRooms / soldRooms
    const expectedAdr = yearly[0].revenueRooms / yearly[0].soldRooms;
    expect(adrRow![1]).toBeCloseTo(expectedAdr, 2);
  });

  it("computes occupancy percentage", () => {
    const yearly = makeYearlyData(2);
    const rows = buildPropertyISRows(yearly);

    const occRow = rows.find((r) => String(r[0]).trim() === "Occupancy %");
    expect(occRow).toBeDefined();
    const expectedOcc = (yearly[0].soldRooms / yearly[0].availableRooms) * 100;
    expect(occRow![1]).toBeCloseTo(expectedOcc, 1);
  });
});

describe("Excel workbook creation", () => {
  it("creates a workbook with a sheet", () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ["Income Statement", "2027", "2028"],
      ["Total Revenue", 2500000, 2655000],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "IS");

    expect(wb.SheetNames).toContain("IS");
    expect(wb.Sheets["IS"]).toBeDefined();
  });

  it("stores cell values correctly", () => {
    const rows = [
      ["Label", 12345],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: 1 })];
    expect(cell.v).toBe(12345);
    expect(cell.t).toBe("n"); // number type
  });

  it("handles multiple sheets", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["IS"]]), "Income Statement");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["CF"]]), "Cash Flow");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["BS"]]), "Balance Sheet");

    expect(wb.SheetNames).toHaveLength(3);
    expect(wb.SheetNames).toEqual(["Income Statement", "Cash Flow", "Balance Sheet"]);
  });

  it("generates a buffer without errors", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["Test", 100]]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    expect(buf).toBeDefined();
    expect(buf.length).toBeGreaterThan(0);
  });
});
