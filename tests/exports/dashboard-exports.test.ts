import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeBrowserDownloadMocks, makeYearlyFinancials } from "./helpers";

vi.mock("../../client/src/lib/exports/domCapture", () => ({
  captureToPng: vi.fn().mockResolvedValue("data:image/png;base64,"),
}));

import {
  toExportData,
  exportPortfolioCSV,
  generatePortfolioIncomeData,
  generatePortfolioInvestmentData,
  type ExportRow,
  type ExportData,
} from "../../client/src/components/dashboard/dashboardExports";

const mocks = makeBrowserDownloadMocks();
beforeEach(() => mocks.install());
afterEach(() => mocks.uninstall());

describe("toExportData", () => {
  it("converts ExportData years to strings", () => {
    const input: ExportData = {
      years: [2025, 2026, 2027],
      rows: [
        { category: "Revenue", values: [100, 200, 300], isHeader: true },
        { category: "Room Revenue", values: [60, 120, 180], indent: 1 },
      ],
    };
    const result = toExportData(input);
    expect(result.years).toEqual(["2025", "2026", "2027"]);
    expect(result.rows[0].isBold).toBe(true);
    expect(result.rows[0].isHeader).toBe(true);
    expect(result.rows[1].indent).toBe(1);
    expect(result.rows[1].values).toEqual([60, 120, 180]);
  });

  it("maps isHeader to isBold when isBold not set", () => {
    const input: ExportData = {
      years: [2025],
      rows: [{ category: "Total", values: [100], isHeader: true }],
    };
    const result = toExportData(input);
    expect(result.rows[0].isBold).toBe(true);
  });

  it("preserves explicit isBold over isHeader", () => {
    const input: ExportData = {
      years: [2025],
      rows: [{ category: "Detail", values: [50], isBold: false, isHeader: true }],
    };
    const result = toExportData(input);
    expect(result.rows[0].isBold).toBe(false);
  });
});

describe("exportPortfolioCSV — download integration", () => {
  it("builds CSV with headers and rows and triggers download", () => {
    const years = [2025, 2026];
    const rows: ExportRow[] = [
      { category: "Total Revenue", values: [6000000, 6500000], isHeader: true },
      { category: "Room Revenue", values: [4000000, 4300000], indent: 1 },
    ];

    exportPortfolioCSV(years, rows, "portfolio.csv");

    expect(mocks.mockLink.click).toHaveBeenCalled();
    expect(mocks.mockLink.download).toBe("portfolio.csv");
  });

  it("includes indentation in CSV category column", async () => {
    const years = [2025];
    const rows: ExportRow[] = [
      { category: "Room Revenue", values: [4000000], indent: 2 },
    ];
    exportPortfolioCSV(years, rows, "indent-test.csv");

    await new Promise(r => setTimeout(r, 50));
    const text = await mocks.capturedBlob!.text();
    expect(text).toContain('"    Room Revenue"');
  });

  it("formats values with 2 decimal places", async () => {
    const years = [2025];
    const rows: ExportRow[] = [
      { category: "Revenue", values: [1234567.89] },
    ];
    exportPortfolioCSV(years, rows, "decimals.csv");

    await new Promise(r => setTimeout(r, 50));
    const text = await mocks.capturedBlob!.text();
    expect(text).toContain("1234567.89");
  });
});

describe("generatePortfolioIncomeData", () => {
  it("generates summary-only income statement rows", () => {
    const cache = [makeYearlyFinancials(), makeYearlyFinancials({ revenueTotal: 7000000 })];
    const result = generatePortfolioIncomeData(cache, 2, (i) => 2025 + i, true);

    expect(result.years).toEqual([2025, 2026]);

    const totalRevRow = result.rows.find(r => r.category === "Total Revenue");
    expect(totalRevRow).toBeDefined();
    expect(totalRevRow!.values[0]).toBe(6030000);
    expect(totalRevRow!.values[1]).toBe(7000000);
    expect(totalRevRow!.isHeader).toBe(true);

    const gopRow = result.rows.find(r => r.category.includes("Gross Operating Profit"));
    expect(gopRow).toBeDefined();
    expect(gopRow!.isHeader).toBe(true);

    const noiRow = result.rows.find(r => r.category.includes("Net Operating Income"));
    expect(noiRow).toBeDefined();

    const anoiRow = result.rows.find(r => r.category.includes("Adjusted NOI"));
    expect(anoiRow).toBeDefined();
  });

  it("generates detailed income statement with operational metrics", () => {
    const cache = [makeYearlyFinancials()];
    const result = generatePortfolioIncomeData(cache, 1, (i) => 2025 + i, false);

    const roomRevRow = result.rows.find(r => r.category === "Room Revenue");
    expect(roomRevRow).toBeDefined();
    expect(roomRevRow!.indent).toBe(1);

    const adrRow = result.rows.find(r => r.category === "ADR (Effective)");
    expect(adrRow).toBeDefined();
    expect(adrRow!.values[0]).toBeCloseTo(4380000 / 29200, 0);

    const occRow = result.rows.find(r => r.category === "Occupancy");
    expect(occRow).toBeDefined();
    expect(occRow!.values[0]).toBeCloseTo(29200 / 36500, 4);
  });

  it("includes per-property breakdown when property data provided", () => {
    const cache = [makeYearlyFinancials()];
    const propData = [[makeYearlyFinancials({ revenueTotal: 3000000 })]];
    const result = generatePortfolioIncomeData(cache, 1, (i) => 2025 + i, false, propData, ["Hotel A"]);

    const hotelRow = result.rows.find(r => r.category === "Hotel A" && r.indent === 2);
    expect(hotelRow).toBeDefined();
    expect(hotelRow!.values[0]).toBe(3000000);
  });
});

describe("generatePortfolioInvestmentData", () => {
  it("generates investment metrics rows", () => {
    const financials = {
      totalInitialEquity: 5000000,
      totalExitValue: 15000000,
      portfolioIRR: 0.18,
      equityMultiple: 3.0,
      cashOnCash: 12.5,
      yearlyConsolidatedCache: [makeYearlyFinancials()],
      allPropertyYearlyCF: [[{ freeCashFlowToEquity: 500000, debtService: 200000, cashFromOperations: 300000, freeCashFlow: 400000, principalPayment: 50000, noi: 600000 }]],
      allPropertyFinancials: [],
      allPropertyYearlyIS: [],
      weightedMetricsByYear: [{ weightedADR: 250, weightedOcc: 0.7, revPAR: 175, totalAvailableRoomNights: 36500 }],
    } as any;

    const properties = [{ name: "Hotel A" }] as any[];
    const result = generatePortfolioInvestmentData(financials, properties, 1, (i) => 2025 + i);

    expect(result.years).toEqual([2025]);

    const equityRow = result.rows.find(r => r.category === "Total Initial Equity");
    expect(equityRow).toBeDefined();
    expect(equityRow!.values[0]).toBe(5000000);

    const irrRow = result.rows.find(r => r.category === "Portfolio IRR (%)");
    expect(irrRow).toBeDefined();
    expect(irrRow!.values[0]).toBe(0.18);

    const exitRow = result.rows.find(r => r.category === "Total Exit Value");
    expect(exitRow).toBeDefined();
    expect(exitRow!.values[0]).toBe(15000000);

    const noiRow = result.rows.find(r => r.category === "Net Operating Income (NOI)");
    expect(noiRow).toBeDefined();
    expect(noiRow!.values[0]).toBe(2903400);

    const dscrRow = result.rows.find(r => r.category === "DSCR");
    expect(dscrRow).toBeDefined();
    expect(dscrRow!.values[0]).toBeCloseTo(2782800 / 200000, 1);
  });
});
