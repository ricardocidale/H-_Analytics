import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSave = vi.fn();
const mockText = vi.fn();
const mockAutoTableFn = vi.fn();
const mockAddPage = vi.fn();
const mockSetPage = vi.fn();
const mockRect = vi.fn();
const mockAddImage = vi.fn();
let pageCount = 1;

vi.mock("jspdf", () => {
  class MockJsPDF {
    internal = {
      pageSize: { getWidth: () => 210, getHeight: () => 297 },
      getNumberOfPages: () => pageCount,
    };
    lastAutoTable: any = null;
    setFillColor = vi.fn();
    setTextColor = vi.fn();
    setFont = vi.fn();
    setFontSize = vi.fn();
    setDrawColor = vi.fn();
    setLineWidth = vi.fn();
    rect = mockRect;
    text = mockText;
    line = vi.fn();
    addPage = mockAddPage.mockImplementation(() => { pageCount++; });
    save = mockSave;
    output = vi.fn().mockReturnValue(new Blob(["pdf"], { type: "application/pdf" }));
    setPage = mockSetPage;
    splitTextToSize = vi.fn((text: string) => [text]);
    addImage = mockAddImage;
    roundedRect = vi.fn();
  }
  return { default: MockJsPDF };
});

vi.mock("../../client/src/lib/exports/saveFile", () => ({
  saveFile: vi.fn(),
  saveDataUrl: vi.fn(),
}));

vi.mock("jspdf-autotable", () => {
  return {
    default: function (doc: any, opts: any) {
      doc.lastAutoTable = { finalY: (opts.startY || 0) + 20 };
      mockAutoTableFn(doc, opts);
    },
  };
});

import { downloadResearchPDF } from "../../client/src/lib/exports/researchPdfExport";

describe("downloadResearchPDF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pageCount = 1;
  });

  it("generates a property research PDF with correct filename", async () => {
    await downloadResearchPDF({
      type: "property",
      title: "Market Research",
      content: {
        marketOverview: {
          summary: "Strong hotel market with growing tourism.",
          keyMetrics: [{ label: "ADR", value: "$250", source: "STR" }],
        },
      },
      branding: { userName: "Test User", companyName: "Test Hotels", logoUrl: null },
    });

    const { saveFile } = await import("../../client/src/lib/exports/saveFile");
    expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), "Market_Research_Research.pdf");
  });

  it("renders branded header with navy background", async () => {
    await downloadResearchPDF({
      type: "property",
      title: "Test Report",
      content: {},
      branding: { userName: "Admin", companyName: "Luxury Hotels", logoUrl: null },
    });

    expect(mockRect).toHaveBeenCalled();
    const navyCall = mockRect.mock.calls.find(
      (c: any) => c[4] === "F"
    );
    expect(navyCall).toBeDefined();
  });

  it("renders company name in PDF header", async () => {
    await downloadResearchPDF({
      type: "global",
      title: "Industry Research",
      content: {},
      branding: { userName: "Admin", companyName: "Boutique Hotels Group", logoUrl: null },
    });

    expect(mockText).toHaveBeenCalledWith(
      "Boutique Hotels Group",
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("renders property research sections with market overview table", async () => {
    await downloadResearchPDF({
      type: "property",
      title: "Property Analysis",
      content: {
        marketOverview: {
          summary: "Market is strong",
          keyMetrics: [
            { label: "ADR", value: "$250", source: "STR" },
            { label: "Occupancy", value: "78%", source: "Smith Travel" },
          ],
        },
        adrAnalysis: {
          marketAverage: "$220",
          boutiqueRange: "$180-$300",
          recommendedRange: "$200-$260",
          rationale: "Based on comparable boutique hotels in the area.",
        },
      },
      branding: { userName: "User", companyName: "Hotels Inc", logoUrl: null },
    });

    expect(mockAutoTableFn).toHaveBeenCalled();
    const tableCall = mockAutoTableFn.mock.calls[0];
    expect(tableCall[1].head[0]).toEqual(["Metric", "Value", "Source"]);
    expect(tableCall[1].body).toHaveLength(2);
  });

  it("renders global research sections", async () => {
    await downloadResearchPDF({
      type: "global",
      title: "Global Hospitality",
      content: {
        industryOverview: {
          marketSize: "$1.2T",
          growthRate: "5.3%",
          boutiqueShare: "12%",
          keyTrends: ["Sustainability", "Digital transformation"],
        },
        financialBenchmarks: {
          adrTrends: [{ year: "2024", national: "$150", boutique: "$220", luxury: "$350" }],
        },
      },
      branding: { userName: "Admin", companyName: "Research Corp", logoUrl: null },
    });

    expect(mockText).toHaveBeenCalledWith(
      expect.stringContaining("Industry Overview"),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("renders company research sections", async () => {
    await downloadResearchPDF({
      type: "company",
      title: "Management Company Analysis",
      content: {
        managementFees: {
          baseFee: {
            industryRange: "2-4%",
            boutiqueRange: "3-5%",
            recommended: "3.5%",
          },
        },
        gaapStandards: [
          { standard: "ASC 606", reference: "Revenue Recognition", application: "Management fees" },
        ],
      },
      branding: { userName: "CFO", companyName: "Mgmt Co", logoUrl: null },
    });

    expect(mockText).toHaveBeenCalledWith(
      expect.stringContaining("Management Fees"),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("renders prompt conditions when provided", async () => {
    await downloadResearchPDF({
      type: "property",
      title: "Conditioned Report",
      content: {},
      promptConditions: {
        llmModel: "gpt-4o",
        projectionYears: 10,
        focusAreas: ["ADR", "Occupancy", "Cap Rates"],
      },
      branding: { userName: "User", companyName: "Hotels", logoUrl: null },
    });

    expect(mockText).toHaveBeenCalledWith(
      expect.stringContaining("Research Conditions"),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("renders page footers with confidential text and page numbers", async () => {
    await downloadResearchPDF({
      type: "property",
      title: "Footer Test",
      content: {},
      branding: { userName: "User", companyName: "Confidential Corp", logoUrl: null },
    });

    expect(mockSetPage).toHaveBeenCalled();
    expect(mockText).toHaveBeenCalledWith(
      expect.stringContaining("Confidential Corp"),
      expect.any(Number),
      expect.any(Number)
    );
    const pageNumCalls = mockText.mock.calls.filter(
      (c: any) => typeof c[0] === "string" && c[0].startsWith("Page ")
    );
    expect(pageNumCalls.length).toBeGreaterThan(0);
  });

  it("includes subtitle and LLM model in metadata", async () => {
    await downloadResearchPDF({
      type: "property",
      title: "With Metadata",
      subtitle: "Sub-Market Analysis",
      llmModel: "claude-3.5-sonnet",
      content: {},
      branding: { userName: "User", companyName: "Corp", logoUrl: null },
    });

    expect(mockText).toHaveBeenCalledWith(
      "Sub-Market Analysis",
      expect.any(Number),
      expect.any(Number)
    );
    const modelCall = mockText.mock.calls.find(
      (c: any) => typeof c[0] === "string" && c[0].includes("claude-3.5-sonnet")
    );
    expect(modelCall).toBeDefined();
  });
});
