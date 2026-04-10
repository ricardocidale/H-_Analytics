import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { vi } from "vitest";
import { makeBrowserDownloadMocks } from "./helpers";

vi.mock("../../client/src/lib/exports/domCapture", () => ({
  captureToPng: vi.fn().mockResolvedValue("data:image/png;base64,"),
}));

import { downloadCSV } from "../../client/src/lib/exports/csvExport";
import {
  exportPortfolioCSV,
  type ExportRow,
} from "../../client/src/components/dashboard/dashboardExports";

const mocks = makeBrowserDownloadMocks();
beforeEach(() => mocks.install());
afterEach(() => mocks.uninstall());

describe("downloadCSV — edge cases", () => {
  it("creates blob with correct MIME type", async () => {
    await downloadCSV("a,b\n1,2", "test.csv");
    expect(mocks.capturedBlob).toBeInstanceOf(Blob);
    expect(mocks.capturedBlob!.type).toBe("text/csv;charset=utf-8;");
  });

  it("sanitizes dangerous filename characters", async () => {
    await downloadCSV("data", 'portfolio/export:file*"name".csv');
    expect(mocks.mockLink.download).toBe("portfolio_export_file__name_.csv");
  });

  it("preserves safe filename characters", async () => {
    await downloadCSV("data", "my-report_2025.csv");
    expect(mocks.mockLink.download).toBe("my-report_2025.csv");
  });

  it("handles commas in pre-escaped cell values", async () => {
    const content = '"Category","Value"\n"Grand Hotel, NYC","$1,500,000"';
    await downloadCSV(content, "test.csv");

    const text = await mocks.capturedBlob!.text();
    expect(text).toContain('"Grand Hotel, NYC"');
    expect(text).toContain('"$1,500,000"');
  });

  it("handles quotes in pre-escaped cell values", async () => {
    const content = '"Name","Description"\n"The ""Grand"" Hotel","A luxury property"';
    await downloadCSV(content, "quotes.csv");

    const text = await mocks.capturedBlob!.text();
    expect(text).toContain('""Grand""');
  });

  it("handles newlines within quoted cells", async () => {
    const content = '"Name","Notes"\n"Hotel A","Line 1\nLine 2"';
    await downloadCSV(content, "multiline.csv");

    const text = await mocks.capturedBlob!.text();
    expect(text).toContain("Line 1\nLine 2");
  });

  it("handles unicode characters in financial data", async () => {
    const content = '"Category","Year 1"\n"Revenue \u2014 Total","$1,234,567"\n"NOI (Net Operating Income)","$500,000"';
    await downloadCSV(content, "unicode.csv");

    const text = await mocks.capturedBlob!.text();
    expect(text).toContain("Revenue \u2014 Total");
  });

  it("handles empty content", async () => {
    const result = await downloadCSV("", "empty.csv");
    expect(result).toBe(true);
  });

  it("returns true on success", async () => {
    expect(await downloadCSV("a,b\n1,2", "test.csv")).toBe(true);
  });
});

describe("exportPortfolioCSV — CSV structure and encoding", () => {
  it("builds correct CSV structure from ExportRow data", async () => {
    const years = [2025, 2026, 2027];
    const rows: ExportRow[] = [
      { category: "Total Revenue", values: [6000000, 6500000, 7000000], isHeader: true },
      { category: "Room Revenue", values: [4000000, 4300000, 4600000], indent: 1 },
      { category: "F&B Revenue", values: [1200000, 1300000, 1400000], indent: 1 },
    ];

    exportPortfolioCSV(years, rows, "portfolio-is.csv");

    await new Promise(r => setTimeout(r, 50));
    const text = await mocks.capturedBlob!.text();

    expect(text).toContain("Category,2025,2026,2027");
    expect(text).toContain('"Total Revenue"');
    expect(text).toContain("6000000.00");
    expect(text).toContain('"  Room Revenue"');
    expect(text).toContain('"  F&B Revenue"');
  });

  it("applies double-indent for nested rows", async () => {
    const years = [2025];
    const rows: ExportRow[] = [
      { category: "Hotel A", values: [3000000], indent: 2 },
    ];
    exportPortfolioCSV(years, rows, "nested.csv");

    await new Promise(r => setTimeout(r, 50));
    const text = await mocks.capturedBlob!.text();
    expect(text).toContain('"    Hotel A"');
  });

  it("handles special characters in category names via quoting", async () => {
    const years = [2025];
    const rows: ExportRow[] = [
      { category: "O'Brien's Resort & Spa", values: [2000000] },
      { category: "Ch\u00e2teau du Lac", values: [5000000] },
    ];
    exportPortfolioCSV(years, rows, "special.csv");

    await new Promise(r => setTimeout(r, 50));
    const text = await mocks.capturedBlob!.text();
    expect(text).toContain("O'Brien's Resort & Spa");
    expect(text).toContain("Ch\u00e2teau du Lac");
  });

  it("wraps category values in quotes to handle embedded commas safely", async () => {
    const years = [2025];
    const rows: ExportRow[] = [
      { category: "Revenue, Total", values: [1000000] },
    ];
    exportPortfolioCSV(years, rows, "comma-category.csv");

    await new Promise(r => setTimeout(r, 50));
    const text = await mocks.capturedBlob!.text();
    expect(text).toContain('"Revenue, Total"');
  });

  it("formats numeric values to 2 decimal places in CSV output", async () => {
    const years = [2025, 2026];
    const rows: ExportRow[] = [
      { category: "NOI", values: [1234567.891, 2345678.999] },
    ];
    exportPortfolioCSV(years, rows, "decimals.csv");

    await new Promise(r => setTimeout(r, 50));
    const text = await mocks.capturedBlob!.text();
    expect(text).toContain("1234567.89");
    expect(text).toContain("2345679.00");
  });

  it("generates valid CSV with header row and data rows", async () => {
    const years = [2025, 2026];
    const rows: ExportRow[] = [
      { category: "Revenue", values: [100, 200], isHeader: true },
      { category: "Rooms", values: [60, 120], indent: 1 },
      { category: "F&B", values: [40, 80], indent: 1 },
    ];
    exportPortfolioCSV(years, rows, "structured.csv");

    await new Promise(r => setTimeout(r, 50));
    const text = await mocks.capturedBlob!.text();
    const lines = text.split("\n");
    expect(lines[0]).toBe("Category,2025,2026");
    expect(lines).toHaveLength(4);
  });

  it("handles large number of rows without error", () => {
    const years = [2025, 2026];
    const rows: ExportRow[] = Array.from({ length: 100 }, (_, i) => ({
      category: `Line Item ${i}`,
      values: [i * 10000, i * 11000],
    }));
    exportPortfolioCSV(years, rows, "large.csv");
    expect(mocks.mockLink.click).toHaveBeenCalled();
  });
});
