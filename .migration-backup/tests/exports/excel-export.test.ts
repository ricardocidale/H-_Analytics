import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildPropertyISRows } from "../../client/src/lib/exports/excel/property-sheets";
import { makeYearlyData } from "./helpers";

describe("Excel row builder — buildPropertyISRows", () => {
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

describe("Excel workbook — XLSX library integration", () => {
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
