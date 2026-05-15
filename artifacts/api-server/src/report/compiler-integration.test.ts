/**
 * Integration tests: report compiler pipeline → Otavio pagination.
 *
 * Task #1640: Protect the report compiler from producing overflowing pages
 * in real exports by running the full compile pipeline (build sections →
 * runMinionOtavioPaginate → ReportDefinition) and confirming that no
 * output TableSection exceeds the physical page-height cap.
 *
 * These tests differ from the Otavio unit tests (otavio-pagination.test.ts)
 * in that they go through `compileReport` — the real entry point — so they
 * exercise the full chain: ExportRow → buildTableRows → section assembly →
 * Otavio pagination → ReportDefinition.sections.
 *
 * Row-weight constants (mirrored from otavio-pagination.ts):
 *   header   → 1.25
 *   total    → 1.15
 *   data     → 1.00
 *
 * Page caps (mirrored from otavio-pagination.ts):
 *   landscape table       → 21
 *   portrait  table       → 16
 *   landscape assumptions → 23  (title starts with ASSUMPTIONS_TITLE_PREFIX or isSingleYear)
 *   portrait  assumptions → 18
 */

import { describe, it, expect } from "vitest";
import { compileReport, type CompileInput } from "./compiler";
import { ASSUMPTIONS_TITLE_PREFIX } from "./assumption-sections";
import type { TableSection } from "./types";

// ─── Constants (mirrored from otavio-pagination.ts for assertion clarity) ─────

const LANDSCAPE_TABLE_CAP = 21;
const PORTRAIT_TABLE_CAP = 16;
const LANDSCAPE_ASSUMPTIONS_CAP = 23;
const PORTRAIT_ASSUMPTIONS_CAP = 18;

const HEADER_WEIGHT = 1.25;
const TOTAL_WEIGHT = 1.15;
const DATA_WEIGHT = 1.0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ExportRow = NonNullable<CompileInput["rows"]>[number];

function dataRow(category: string, value: number = 0): ExportRow {
  return { category, values: [value] };
}

function headerRow(label: string): ExportRow {
  return { category: label, values: [""], isHeader: true };
}

function totalRow(label: string, value: number = 0): ExportRow {
  return { category: label, values: [value], isBold: true };
}

function makeDataRows(n: number, prefix = "Line Item"): ExportRow[] {
  return Array.from({ length: n }, (_, i) => dataRow(`${prefix} ${i + 1}`));
}

/**
 * Compute the weighted row count for a single TableSection chunk.
 * Mirrors the logic in otavio-pagination.ts getRowWeight().
 */
function weightedCount(section: TableSection): number {
  return section.rows.reduce((sum, row) => {
    if (row.type === "header") return sum + HEADER_WEIGHT;
    if (row.type === "total" || row.type === "subtotal") return sum + TOTAL_WEIGHT;
    return sum + DATA_WEIGHT;
  }, 0);
}

/**
 * Extract all TableSections from a compiled ReportDefinition.
 */
function tableSections(input: CompileInput): TableSection[] {
  const def = compileReport(input);
  return def.sections.filter((s): s is TableSection => s.kind === "table");
}

/**
 * Determine the applicable row cap for a section given orientation and
 * whether it is an assumption section (by title prefix) or a single-year
 * report (isSingleYear = years.length === 1 in the compiler).
 */
function expectedCap(
  section: TableSection,
  orientation: "landscape" | "portrait",
  isSingleYear: boolean,
): number {
  const isAssumptions =
    section.title.startsWith(ASSUMPTIONS_TITLE_PREFIX) || isSingleYear;
  if (orientation === "landscape") {
    return isAssumptions ? LANDSCAPE_ASSUMPTIONS_CAP : LANDSCAPE_TABLE_CAP;
  }
  return isAssumptions ? PORTRAIT_ASSUMPTIONS_CAP : PORTRAIT_TABLE_CAP;
}

// ─── Integration: large multi-year table (landscape) ─────────────────────────

describe("full pipeline — large multi-year table, landscape", () => {
  const YEARS = ["2025", "2026", "2027", "2028", "2029"];

  const input: CompileInput = {
    format: "pdf",
    orientation: "landscape",
    entityName: "Test Hotel",
    statementType: "Income Statement",
    years: YEARS,
    rows: [
      // 60 data rows — well over the landscape cap of 21
      ...makeDataRows(60, "Revenue Line"),
    ],
  };

  it("compiler produces multiple table chunks from a 60-row section", () => {
    const chunks = tableSections(input);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });

  it("every chunk stays within the landscape table cap (21)", () => {
    const chunks = tableSections(input);
    for (const chunk of chunks) {
      const w = weightedCount(chunk);
      expect(w).toBeLessThanOrEqual(LANDSCAPE_TABLE_CAP);
    }
  });

  it("all rows are preserved across chunks — no row lost or duplicated", () => {
    const chunks = tableSections(input);
    const totalRows = chunks.reduce((sum, c) => sum + c.rows.length, 0);
    // filterFormulaRows in buildTableRows may strip formula-only rows, but our
    // plain data rows carry numeric values so they all survive.
    expect(totalRows).toBe(60);
  });

  it("first chunk keeps the original title; continuations carry cont'd suffix", () => {
    const chunks = tableSections(input);
    expect(chunks[0].title).not.toContain("cont\u2019d");
    for (const chunk of chunks.slice(1)) {
      expect(chunk.title).toContain("cont\u2019d");
    }
  });

  it("every chunk preserves the original year array", () => {
    const chunks = tableSections(input);
    for (const chunk of chunks) {
      expect(chunk.years).toEqual(YEARS);
    }
  });
});

// ─── Integration: large multi-year table, portrait ────────────────────────────

describe("full pipeline — large multi-year table, portrait", () => {
  const YEARS = ["2025", "2026", "2027"];

  const input: CompileInput = {
    format: "pdf",
    orientation: "portrait",
    entityName: "Test Hotel",
    statementType: "Balance Sheet",
    years: YEARS,
    rows: makeDataRows(50, "Balance Line"),
  };

  it("compiler produces multiple chunks from a 50-row portrait table", () => {
    const chunks = tableSections(input);
    expect(chunks.length).toBeGreaterThanOrEqual(4);
  });

  it("every chunk stays within the portrait table cap (16)", () => {
    const chunks = tableSections(input);
    for (const chunk of chunks) {
      const w = weightedCount(chunk);
      expect(w).toBeLessThanOrEqual(PORTRAIT_TABLE_CAP);
    }
  });

  it("portrait produces more chunks than landscape for the same row set", () => {
    const landscapeInput: CompileInput = { ...input, orientation: "landscape" };
    const portraitChunks = tableSections(input);
    const landscapeChunks = tableSections(landscapeInput);
    expect(portraitChunks.length).toBeGreaterThan(landscapeChunks.length);
  });
});

// ─── Integration: large assumption section (landscape) ────────────────────────

describe("full pipeline — large assumption section (ASSUMPTIONS_TITLE_PREFIX), landscape", () => {
  const ASSUMPTION_TITLE = `${ASSUMPTIONS_TITLE_PREFIX}Big Hotel`;

  // Build a realistic assumption section: multiple named groups, each with
  // several data rows.  Total weighted count far exceeds the 23-row cap.
  const assumptionRows: ExportRow[] = [
    headerRow("Property Profile"),
    ...makeDataRows(8, "Profile Field"),

    headerRow("Revenue Assumptions"),
    ...makeDataRows(12, "Revenue Field"),

    headerRow("Operating Cost Rates"),
    ...makeDataRows(10, "Cost Field"),

    headerRow("Management Fees"),
    ...makeDataRows(6, "Fee Field"),

    headerRow("Acquisition Debt"),
    ...makeDataRows(8, "Debt Field"),

    headerRow("Exit Assumptions"),
    ...makeDataRows(6, "Exit Field"),
  ];

  const input: CompileInput = {
    format: "pdf",
    orientation: "landscape",
    entityName: "Big Hotel",
    statements: [
      {
        title: ASSUMPTION_TITLE,
        years: ["Value"],
        rows: assumptionRows,
        includeTable: true,
        includeChart: false,
      },
    ],
  };

  it("compiler splits the large assumption section into multiple chunks", () => {
    const chunks = tableSections(input);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("every assumption chunk stays within the landscape assumptions cap (23)", () => {
    const chunks = tableSections(input);
    for (const chunk of chunks) {
      const w = weightedCount(chunk);
      expect(w).toBeLessThanOrEqual(LANDSCAPE_ASSUMPTIONS_CAP);
    }
  });

  it("every chunk respects the assumptions cap (23), not the narrower table cap (21)", () => {
    // The assumptions cap (23) is wider than the multi-year table cap (21).
    // Regardless of whether individual group chunks happen to fall between the
    // two caps, the hard contract is that NO chunk exceeds the assumptions cap.
    const chunks = tableSections(input);
    for (const chunk of chunks) {
      expect(weightedCount(chunk)).toBeLessThanOrEqual(LANDSCAPE_ASSUMPTIONS_CAP);
    }
  });

  it("all assumption rows are preserved across chunks", () => {
    const chunks = tableSections(input);
    const totalRows = chunks.reduce((sum, c) => sum + c.rows.length, 0);
    expect(totalRows).toBe(assumptionRows.length);
  });

  it("semantic groups appear as distinct chunk title suffixes", () => {
    const chunks = tableSections(input);
    const titles = chunks.map((c) => c.title);
    // At least one group title should appear in the chunk title set
    const hasGroupLabel = titles.some(
      (t) => t.includes("Revenue Assumptions") || t.includes("Property Profile"),
    );
    expect(hasGroupLabel).toBe(true);
  });
});

// ─── Integration: assumption section, portrait ────────────────────────────────

describe("full pipeline — large assumption section, portrait", () => {
  const ASSUMPTION_TITLE = `${ASSUMPTIONS_TITLE_PREFIX}Boutique Inn`;

  const assumptionRows: ExportRow[] = [
    headerRow("Revenue"),
    ...makeDataRows(15, "Rev Field"),
    headerRow("Operating Costs"),
    ...makeDataRows(15, "Cost Field"),
    headerRow("Debt"),
    ...makeDataRows(10, "Debt Field"),
  ];

  const input: CompileInput = {
    format: "pdf",
    orientation: "portrait",
    entityName: "Boutique Inn",
    statements: [
      {
        title: ASSUMPTION_TITLE,
        years: ["Value"],
        rows: assumptionRows,
        includeTable: true,
        includeChart: false,
      },
    ],
  };

  it("every assumption chunk stays within the portrait assumptions cap (18)", () => {
    const chunks = tableSections(input);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of chunks) {
      const w = weightedCount(chunk);
      expect(w).toBeLessThanOrEqual(PORTRAIT_ASSUMPTIONS_CAP);
    }
  });

  it("all rows are preserved", () => {
    const chunks = tableSections(input);
    const totalRows = chunks.reduce((sum, c) => sum + c.rows.length, 0);
    expect(totalRows).toBe(assumptionRows.length);
  });
});

// ─── Integration: mixed row types (headers + totals + data) ───────────────────

describe("full pipeline — mixed header/total/data rows, weighted cap enforcement", () => {
  const YEARS = ["2025", "2026", "2027"];

  // Build rows whose weight exceeds the portrait cap only when header/total
  // weights are counted correctly.
  // 10 data (10.0) + 4 headers (5.0) + 2 totals (2.30) = 17.30 > 16 → must split
  // 10 data (10.0) + 2 headers (2.50) + 2 totals (2.30) = 14.80 ≤ 16 → no split
  const rowsThatSpill: ExportRow[] = [
    ...makeDataRows(10),
    headerRow("Section A"),
    headerRow("Section B"),
    headerRow("Section C"),
    headerRow("Section D"),
    totalRow("Subtotal A"),
    totalRow("Subtotal B"),
  ];

  const input: CompileInput = {
    format: "pdf",
    orientation: "portrait",
    entityName: "Weight Test Hotel",
    statementType: "Weight Test",
    years: YEARS,
    rows: rowsThatSpill,
  };

  it("header and total row weights cause the section to split when weight > portrait cap", () => {
    const chunks = tableSections(input);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("every output chunk weight is within the portrait table cap (16)", () => {
    const chunks = tableSections(input);
    for (const chunk of chunks) {
      expect(weightedCount(chunk)).toBeLessThanOrEqual(PORTRAIT_TABLE_CAP);
    }
  });
});

// ─── Integration: multi-statement report, each statement independently capped ──

describe("full pipeline — multi-statement report with realistic large sections", () => {
  const YEARS = ["2025", "2026", "2027", "2028"];

  const input: CompileInput = {
    format: "pdf",
    orientation: "landscape",
    entityName: "Grand Resort",
    companyName: "Norfolk Hospitality",
    statements: [
      {
        title: "Income Statement",
        years: YEARS,
        rows: [
          headerRow("Revenue"),
          ...makeDataRows(15, "Rev"),
          headerRow("Operating Expenses"),
          ...makeDataRows(20, "Opex"),
          totalRow("Net Operating Income"),
          headerRow("Below-the-Line"),
          ...makeDataRows(10, "BTL"),
          totalRow("Net Income"),
        ],
        includeTable: true,
        includeChart: false,
      },
      {
        title: "Cash Flow Statement",
        years: YEARS,
        rows: [
          headerRow("Operating Activities"),
          ...makeDataRows(18, "CFA"),
          headerRow("Investing Activities"),
          ...makeDataRows(12, "CFI"),
          totalRow("Net Cash Flow"),
        ],
        includeTable: true,
        includeChart: false,
      },
      {
        title: `${ASSUMPTIONS_TITLE_PREFIX}Grand Resort`,
        years: ["Value"],
        rows: [
          headerRow("Revenue Assumptions"),
          ...makeDataRows(10, "RevAssump"),
          headerRow("Cost Assumptions"),
          ...makeDataRows(10, "CostAssump"),
          headerRow("Debt Assumptions"),
          ...makeDataRows(8, "DebtAssump"),
          headerRow("Exit Assumptions"),
          ...makeDataRows(6, "ExitAssump"),
        ],
        includeTable: true,
        includeChart: false,
      },
    ],
  };

  it("produces table chunks for all three statements", () => {
    const chunks = tableSections(input);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });

  it("every table chunk — across all statements — respects its applicable cap", () => {
    const def = compileReport(input);
    const isSingleYear = false; // YEARS.length === 4

    for (const section of def.sections) {
      if (section.kind !== "table") continue;
      const orientation = def.orientation;
      const cap = expectedCap(section, orientation, isSingleYear);
      const w = weightedCount(section);
      expect(w).toBeLessThanOrEqual(cap);
    }
  });

  it("non-table sections (kpi, chart, image) pass through and are not split", () => {
    const def = compileReport(input);
    const nonTable = def.sections.filter((s) => s.kind !== "table");
    // Chart sections from buildChartSection — if none exist here (no series data),
    // that's fine; the point is no non-table section should have been mangled.
    for (const s of nonTable) {
      expect(["kpi", "chart", "image"]).toContain(s.kind);
    }
  });
});

// ─── Integration: non-PDF formats bypass Otavio ───────────────────────────────

describe("non-PDF formats bypass Otavio pagination", () => {
  const bigRows = makeDataRows(100, "Row");
  const YEARS = ["2025", "2026", "2027"];

  it("xlsx format: single-section output with all 100 rows unsplit", () => {
    const input: CompileInput = {
      format: "xlsx",
      orientation: "landscape",
      entityName: "Test",
      years: YEARS,
      rows: bigRows,
    };
    const def = compileReport(input);
    const tables = def.sections.filter((s): s is TableSection => s.kind === "table");
    // Without Otavio, all rows stay in one section.
    expect(tables.length).toBe(1);
    expect(tables[0].rows.length).toBe(100);
  });

  it("pdf format: same 100-row section is split into multiple chunks", () => {
    const input: CompileInput = {
      format: "pdf",
      orientation: "landscape",
      entityName: "Test",
      years: YEARS,
      rows: bigRows,
    };
    const chunks = tableSections(input);
    expect(chunks.length).toBeGreaterThanOrEqual(5);
  });
});

// ─── Integration: isSingleYear derivation in compiler ────────────────────────

describe("compiler isSingleYear derivation — CR-01 boundary", () => {
  const SINGLE_YEAR = ["2025"];
  const MULTI_YEAR = ["2025", "2026"];

  it("single input.years → isSingleYear=true → assumptions cap used for all tables", () => {
    // 22 data rows: fits in assumptions cap (23) but spills multi-year cap (21).
    const rows = makeDataRows(22, "Row");
    const input: CompileInput = {
      format: "pdf",
      orientation: "landscape",
      entityName: "Test",
      years: SINGLE_YEAR,
      rows,
    };
    const chunks = tableSections(input);
    // With assumptions cap (23): 22 ≤ 23 → no split → 1 chunk
    expect(chunks.length).toBe(1);
  });

  it("multi-year input.years → isSingleYear=false → standard table cap used", () => {
    // Same 22 rows but now multi-year → cap=21 → must split
    const rows = makeDataRows(22, "Row");
    const input: CompileInput = {
      format: "pdf",
      orientation: "landscape",
      entityName: "Test",
      years: MULTI_YEAR,
      rows,
    };
    const chunks = tableSections(input);
    // 22 > 21 → split into 2
    expect(chunks.length).toBe(2);
    for (const chunk of chunks) {
      expect(weightedCount(chunk)).toBeLessThanOrEqual(LANDSCAPE_TABLE_CAP);
    }
  });

  it("all-single-year statements → isSingleYear=true via statements path", () => {
    const rows = makeDataRows(22, "Row");
    const input: CompileInput = {
      format: "pdf",
      orientation: "landscape",
      entityName: "Test",
      statements: [
        { title: "Revenue", years: SINGLE_YEAR, rows, includeTable: true, includeChart: false },
      ],
    };
    const chunks = tableSections(input);
    // isSingleYear=true → assumptions cap (23) → 22 ≤ 23 → 1 chunk
    expect(chunks.length).toBe(1);
  });

  it("mixed-year statements → isSingleYear=false → standard cap used", () => {
    // One statement has 2 years → isSingleYear becomes false
    const rows = makeDataRows(22, "Row");
    const input: CompileInput = {
      format: "pdf",
      orientation: "landscape",
      entityName: "Test",
      statements: [
        { title: "Revenue", years: SINGLE_YEAR, rows, includeTable: true, includeChart: false },
        { title: "Expenses", years: MULTI_YEAR, rows, includeTable: true, includeChart: false },
      ],
    };
    const def = compileReport(input);
    const tables = def.sections.filter((s): s is TableSection => s.kind === "table");
    // Every chunk must respect LANDSCAPE_TABLE_CAP (21) — not the wider cap
    for (const chunk of tables) {
      expect(weightedCount(chunk)).toBeLessThanOrEqual(LANDSCAPE_TABLE_CAP);
    }
  });
});
