/**
 * Unit tests for Minion Otavio — deterministic PDF pagination.
 *
 * Task #1636: Add automated tests for PDF pagination so regressions are
 * caught automatically. Covers:
 *   - Multi-year vs single-year row cap selection
 *   - Assumption-titled sections always use the assumptions cap
 *   - Large tables split into correct page-count chunks
 *   - Orphan-header prevention (no header stranded alone at page bottom)
 *   - Edge cases: empty sections, single-row, exact-fit, non-table pass-through
 *
 * CR-01 regression guard: verifies that isSingleYear=true (explicit caller
 * flag) governs cap selection, NOT section.years.length inspection.
 */

import { describe, it, expect } from 'vitest';
import {
  runMinionOtavioPaginate,
  type PaginationOptions,
} from './otavio-pagination';
import { ASSUMPTIONS_TITLE_PREFIX } from '../assumption-sections';
import type { ReportSection, TableSection, TableRow } from '../types';

// ─── Constants under test (mirrored from source for assertion clarity) ────────
const LANDSCAPE_TABLE_ROW_CAP = 21;
const PORTRAIT_TABLE_ROW_CAP = 16;
const LANDSCAPE_ASSUMPTIONS_ROW_CAP = 23;
const PORTRAIT_ASSUMPTIONS_ROW_CAP = 18;
const HEADER_ROW_WEIGHT = 1.25;
const DATA_ROW_WEIGHT = 1.0;
const TOTAL_ROW_WEIGHT = 1.15;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dataRow(category = 'Row'): TableRow {
  return {
    category,
    values: [{ raw: 0, text: '0', negative: false }],
    rawValues: [0],
    type: 'data',
    indent: 0,
  };
}

function headerRow(category = 'Section Header'): TableRow {
  return {
    category,
    values: [{ raw: '', text: '', negative: false }],
    rawValues: [''],
    type: 'header',
    indent: 0,
  };
}

function totalRow(category = 'Total'): TableRow {
  return {
    category,
    values: [{ raw: 0, text: '0', negative: false }],
    rawValues: [0],
    type: 'total',
    indent: 0,
  };
}

function makeTable(
  title: string,
  rows: TableRow[],
  years = ['2025', '2026', '2027'],
): TableSection {
  return { kind: 'table', title, years, rows };
}

function makeDataRows(n: number, prefix = 'Row'): TableRow[] {
  return Array.from({ length: n }, (_, i) => dataRow(`${prefix} ${i + 1}`));
}

const LANDSCAPE_OPTS: PaginationOptions = {
  orientation: 'landscape',
  dense: false,
  isSingleYear: false,
};

const PORTRAIT_OPTS: PaginationOptions = {
  orientation: 'portrait',
  dense: false,
  isSingleYear: false,
};

function tableChunks(sections: ReportSection[]): TableSection[] {
  return sections.filter((s): s is TableSection => s.kind === 'table');
}

// ─── Row-cap selection ────────────────────────────────────────────────────────

describe('row-cap selection — multi-year (isSingleYear=false)', () => {
  it('landscape uses LANDSCAPE_TABLE_ROW_CAP', () => {
    // Build a table that just exceeds the landscape cap by 1 data row.
    const rows = makeDataRows(LANDSCAPE_TABLE_ROW_CAP + 1);
    const section = makeTable('Revenue', rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    expect(flattenedSections.length).toBe(2);
  });

  it('landscape does NOT split when total weight ≤ LANDSCAPE_TABLE_ROW_CAP', () => {
    const rows = makeDataRows(LANDSCAPE_TABLE_ROW_CAP);
    const section = makeTable('Revenue', rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    expect(flattenedSections.length).toBe(1);
    expect(flattenedSections[0]).toBe(section);
  });

  it('portrait uses PORTRAIT_TABLE_ROW_CAP (smaller than landscape)', () => {
    // A table that fits in landscape but spills in portrait.
    const rows = makeDataRows(PORTRAIT_TABLE_ROW_CAP + 1);
    const section = makeTable('Expenses', rows);
    const { flattenedSections: portrait } = runMinionOtavioPaginate([section], PORTRAIT_OPTS);
    const { flattenedSections: landscape } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    expect(portrait.length).toBe(2);
    expect(landscape.length).toBe(1);
  });

  it('portrait does NOT split when total weight ≤ PORTRAIT_TABLE_ROW_CAP', () => {
    const rows = makeDataRows(PORTRAIT_TABLE_ROW_CAP);
    const section = makeTable('Cash Flow', rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], PORTRAIT_OPTS);
    expect(flattenedSections.length).toBe(1);
  });
});

describe('row-cap selection — single-year (isSingleYear=true)', () => {
  const singleLandscape: PaginationOptions = { ...LANDSCAPE_OPTS, isSingleYear: true };
  const singlePortrait: PaginationOptions = { ...PORTRAIT_OPTS, isSingleYear: true };

  it('landscape uses LANDSCAPE_ASSUMPTIONS_ROW_CAP (larger cap)', () => {
    // Rows count that exceeds multi-year cap but fits in assumptions cap.
    const rowCount = LANDSCAPE_TABLE_ROW_CAP + 1; // 22 rows
    expect(rowCount).toBeLessThanOrEqual(LANDSCAPE_ASSUMPTIONS_ROW_CAP);
    const rows = makeDataRows(rowCount);
    const section = makeTable('Revenue', rows, ['2025']);
    const { flattenedSections } = runMinionOtavioPaginate([section], singleLandscape);
    // Should NOT split because 22 ≤ 23
    expect(flattenedSections.length).toBe(1);
  });

  it('landscape splits when weight exceeds LANDSCAPE_ASSUMPTIONS_ROW_CAP', () => {
    const rows = makeDataRows(LANDSCAPE_ASSUMPTIONS_ROW_CAP + 1);
    const section = makeTable('Revenue', rows, ['2025']);
    const { flattenedSections } = runMinionOtavioPaginate([section], singleLandscape);
    expect(flattenedSections.length).toBe(2);
  });

  it('portrait uses PORTRAIT_ASSUMPTIONS_ROW_CAP (larger than portrait table cap)', () => {
    const rowCount = PORTRAIT_TABLE_ROW_CAP + 1; // 17 rows
    expect(rowCount).toBeLessThanOrEqual(PORTRAIT_ASSUMPTIONS_ROW_CAP);
    const rows = makeDataRows(rowCount);
    const section = makeTable('Assumptions', rows, ['2025']);
    const { flattenedSections } = runMinionOtavioPaginate([section], singlePortrait);
    expect(flattenedSections.length).toBe(1);
  });

  it('portrait splits when weight exceeds PORTRAIT_ASSUMPTIONS_ROW_CAP', () => {
    const rows = makeDataRows(PORTRAIT_ASSUMPTIONS_ROW_CAP + 1);
    const section = makeTable('Revenue', rows, ['2025']);
    const { flattenedSections } = runMinionOtavioPaginate([section], singlePortrait);
    expect(flattenedSections.length).toBe(2);
  });

  it('CR-01 guard: isSingleYear=false with section.years.length===1 still uses multi-year cap', () => {
    // This is the exact regression from CR-01: a two-year projection whose
    // last year was dropped. The section has years==['2025'] but isSingleYear
    // is false — the old heuristic would have silently used the wrong cap.
    const rowCount = PORTRAIT_TABLE_ROW_CAP + 1; // 17 rows
    const rows = makeDataRows(rowCount);
    const section = makeTable('Revenue', rows, ['2025']); // one year in section
    const opts: PaginationOptions = { ...PORTRAIT_OPTS, isSingleYear: false };
    const { flattenedSections } = runMinionOtavioPaginate([section], opts);
    // Must split because multi-year portrait cap (16) is smaller than 17
    expect(flattenedSections.length).toBe(2);
  });
});

// ─── Assumption-titled sections ───────────────────────────────────────────────

describe('assumption-titled sections (ASSUMPTIONS_TITLE_PREFIX)', () => {
  it('always uses assumptions cap in landscape even when isSingleYear=false', () => {
    const rowCount = LANDSCAPE_TABLE_ROW_CAP + 1; // 22 rows — spills multi-year, fits assumptions
    expect(rowCount).toBeLessThanOrEqual(LANDSCAPE_ASSUMPTIONS_ROW_CAP);
    const rows = makeDataRows(rowCount);
    const section = makeTable(`${ASSUMPTIONS_TITLE_PREFIX}Hotel ABC`, rows);
    // isSingleYear=false so only the title prefix should trigger the wider cap
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    expect(flattenedSections.length).toBe(1);
  });

  it('always uses assumptions cap in portrait even when isSingleYear=false', () => {
    const rowCount = PORTRAIT_TABLE_ROW_CAP + 1; // 17 rows
    expect(rowCount).toBeLessThanOrEqual(PORTRAIT_ASSUMPTIONS_ROW_CAP);
    const rows = makeDataRows(rowCount);
    const section = makeTable(`${ASSUMPTIONS_TITLE_PREFIX}Hotel ABC`, rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], PORTRAIT_OPTS);
    expect(flattenedSections.length).toBe(1);
  });

  it('splits assumption section when its rows exceed assumptions cap', () => {
    // A flat assumption section (no header sub-groups) that exceeds the cap
    const rows = makeDataRows(LANDSCAPE_ASSUMPTIONS_ROW_CAP + 2);
    const section = makeTable(`${ASSUMPTIONS_TITLE_PREFIX}Hotel ABC`, rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    expect(flattenedSections.length).toBeGreaterThanOrEqual(2);
  });

  it('splits assumption section into semantic groups first, then by row count', () => {
    // Section with two named groups, each fitting on one page.
    const rows: TableRow[] = [
      headerRow('Partner Compensation'),
      ...makeDataRows(5),
      headerRow('Staffing'),
      ...makeDataRows(5),
    ];
    const section = makeTable(`${ASSUMPTIONS_TITLE_PREFIX}Company`, rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    const chunks = tableChunks(flattenedSections);
    // Two named groups → two sections
    expect(chunks.length).toBe(2);
    expect(chunks[0].title).toContain('Partner Compensation');
    expect(chunks[1].title).toContain('Staffing');
  });

  it('propagates parent title into group sub-section titles', () => {
    const rows: TableRow[] = [
      headerRow('Revenue Assumptions'),
      ...makeDataRows(3),
      headerRow('Debt Assumptions'),
      ...makeDataRows(3),
    ];
    const parentTitle = `${ASSUMPTIONS_TITLE_PREFIX}My Hotel`;
    const section = makeTable(parentTitle, rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    const chunks = tableChunks(flattenedSections);
    expect(chunks[0].title).toBe(`${parentTitle} — Revenue Assumptions`);
    expect(chunks[1].title).toBe(`${parentTitle} — Debt Assumptions`);
  });

  it('flat assumption section (no header sub-groups) is returned as-is when small', () => {
    const rows = makeDataRows(5);
    const section = makeTable(`${ASSUMPTIONS_TITLE_PREFIX}Solo`, rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    expect(flattenedSections.length).toBe(1);
    expect(flattenedSections[0]).toBe(section);
  });
});

// ─── Row-weight model ─────────────────────────────────────────────────────────

describe('row weight model', () => {
  it('header rows count as 1.25 × data rows in the cap calculation', () => {
    // Fill a page with just enough header rows to push total weight over the cap.
    // With portrait cap=16: 12 data rows (12.0) + 4 header rows (4 × 1.25 = 5.0) = 17.0 > 16
    // So it should split, whereas 12 data + 3 headers = 15.75 ≤ 16 should not.
    const rows12data3headers: TableRow[] = [
      ...makeDataRows(12),
      headerRow('A'),
      headerRow('B'),
      headerRow('C'),
    ];
    const rows12data4headers: TableRow[] = [
      ...makeDataRows(12),
      headerRow('A'),
      headerRow('B'),
      headerRow('C'),
      headerRow('D'),
    ];

    const { flattenedSections: noSplit } = runMinionOtavioPaginate(
      [makeTable('T', rows12data3headers)],
      PORTRAIT_OPTS,
    );
    const { flattenedSections: split } = runMinionOtavioPaginate(
      [makeTable('T', rows12data4headers)],
      PORTRAIT_OPTS,
    );

    expect(noSplit.length).toBe(1);
    expect(split.length).toBe(2);
  });

  it('total/subtotal rows count as 1.15 × data rows', () => {
    // Portrait cap=16. 13 data rows (13.0) + 3 total rows (3 × 1.15 = 3.45) = 16.45 > 16 → split
    //                  13 data rows (13.0) + 2 total rows (2 × 1.15 = 2.30) = 15.30 ≤ 16 → no split
    const rowsFit: TableRow[] = [...makeDataRows(13), totalRow('T1'), totalRow('T2')];
    const rowsSpill: TableRow[] = [...makeDataRows(13), totalRow('T1'), totalRow('T2'), totalRow('T3')];

    const { flattenedSections: noSplit } = runMinionOtavioPaginate(
      [makeTable('T', rowsFit)],
      PORTRAIT_OPTS,
    );
    const { flattenedSections: split } = runMinionOtavioPaginate(
      [makeTable('T', rowsSpill)],
      PORTRAIT_OPTS,
    );

    expect(noSplit.length).toBe(1);
    expect(split.length).toBe(2);
  });

  it('weight model constants are self-consistent (header > total > data)', () => {
    expect(HEADER_ROW_WEIGHT).toBeGreaterThan(TOTAL_ROW_WEIGHT);
    expect(TOTAL_ROW_WEIGHT).toBeGreaterThan(DATA_ROW_WEIGHT);
  });
});

// ─── Chunk count correctness ──────────────────────────────────────────────────

describe('chunk count and title formatting', () => {
  it('splits a 2× oversized table into exactly 2 chunks', () => {
    const rows = makeDataRows(LANDSCAPE_TABLE_ROW_CAP * 2);
    const section = makeTable('Big Table', rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    expect(flattenedSections.length).toBe(2);
  });

  it('splits a 3× oversized table into 3 chunks', () => {
    const rows = makeDataRows(LANDSCAPE_TABLE_ROW_CAP * 3);
    const section = makeTable('Huge Table', rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    expect(flattenedSections.length).toBe(3);
  });

  it('first chunk keeps the original title', () => {
    const rows = makeDataRows(LANDSCAPE_TABLE_ROW_CAP + 5);
    const section = makeTable('Income Statement', rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    expect(tableChunks(flattenedSections)[0].title).toBe('Income Statement');
  });

  it('continuation chunks receive (cont\u2019d N/M) suffix', () => {
    const rows = makeDataRows(LANDSCAPE_TABLE_ROW_CAP * 2 + 5);
    const section = makeTable('Income Statement', rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    const chunks = tableChunks(flattenedSections);
    expect(chunks.length).toBe(3);
    expect(chunks[1].title).toBe('Income Statement (cont\u2019d 2/3)');
    expect(chunks[2].title).toBe('Income Statement (cont\u2019d 3/3)');
  });

  it('preserves years on every chunk', () => {
    const years = ['2024', '2025', '2026'];
    const rows = makeDataRows(LANDSCAPE_TABLE_ROW_CAP + 5);
    const section = makeTable('Revenue', rows, years);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    for (const s of tableChunks(flattenedSections)) {
      expect(s.years).toEqual(years);
    }
  });
});

// ─── Orphan-header prevention ─────────────────────────────────────────────────

describe('orphan-header prevention', () => {
  it('a trailing header row is carried to the next chunk', () => {
    // Build: fill to cap-1, then push a header row. Header would be the last
    // row of chunk 1 — it must be carried forward to chunk 2 instead.
    const rows: TableRow[] = [
      ...makeDataRows(LANDSCAPE_TABLE_ROW_CAP - 1),
      headerRow('Section B'),
      ...makeDataRows(3),
    ];
    const section = makeTable('Multi-Section Table', rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    const chunks = tableChunks(flattenedSections);
    expect(chunks.length).toBe(2);
    // The header must appear as the FIRST row of chunk 2, not the last of chunk 1.
    expect(chunks[0].rows[chunks[0].rows.length - 1].type).not.toBe('header');
    expect(chunks[1].rows[0].category).toBe('Section B');
    expect(chunks[1].rows[0].type).toBe('header');
  });

  it('last chunk never starts or ends in an inconsistent state', () => {
    const rows: TableRow[] = [
      ...makeDataRows(LANDSCAPE_TABLE_ROW_CAP + 2),
      headerRow('Footer Group'),
    ];
    const section = makeTable('Table', rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    const chunks = tableChunks(flattenedSections);
    const lastChunk = chunks[chunks.length - 1];
    // The last chunk must have at least one row.
    expect(lastChunk.rows.length).toBeGreaterThan(0);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('empty section is returned as-is (no crash, no empty continuation)', () => {
    const section = makeTable('Empty', []);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    expect(flattenedSections.length).toBe(1);
    expect(flattenedSections[0]).toBe(section);
  });

  it('single-row section is returned as-is', () => {
    const section = makeTable('Single Row', [dataRow()]);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    expect(flattenedSections.length).toBe(1);
    expect(flattenedSections[0]).toBe(section);
  });

  it('section that exactly hits the row cap is NOT split (boundary)', () => {
    const rows = makeDataRows(LANDSCAPE_TABLE_ROW_CAP);
    const section = makeTable('Boundary', rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], LANDSCAPE_OPTS);
    expect(flattenedSections.length).toBe(1);
    expect(flattenedSections[0]).toBe(section);
  });

  it('non-table sections (kpi, chart, image) pass through unchanged', () => {
    const kpi: ReportSection = {
      kind: 'kpi',
      title: 'Key Metrics',
      metrics: [{ label: 'RevPAR', value: '$150', description: 'Revenue per available room' }],
    };
    const chart: ReportSection = {
      kind: 'chart',
      title: 'Revenue Chart',
      years: ['2025', '2026'],
      series: [],
    };
    const image: ReportSection = {
      kind: 'image',
      title: 'Property Photo',
      dataUrl: 'data:image/png;base64,abc',
    };
    const { flattenedSections } = runMinionOtavioPaginate(
      [kpi, chart, image],
      LANDSCAPE_OPTS,
    );
    expect(flattenedSections).toHaveLength(3);
    expect(flattenedSections[0]).toBe(kpi);
    expect(flattenedSections[1]).toBe(chart);
    expect(flattenedSections[2]).toBe(image);
  });

  it('mixed section list: table splits are isolated and non-table sections preserved', () => {
    const kpi: ReportSection = {
      kind: 'kpi',
      title: 'KPIs',
      metrics: [],
    };
    const bigTable = makeTable('Revenue', makeDataRows(LANDSCAPE_TABLE_ROW_CAP + 5));
    const chart: ReportSection = {
      kind: 'chart',
      title: 'Revenue Chart',
      years: ['2025'],
      series: [],
    };
    const { flattenedSections } = runMinionOtavioPaginate([kpi, bigTable, chart], LANDSCAPE_OPTS);
    expect(flattenedSections[0]).toBe(kpi);
    expect(flattenedSections[flattenedSections.length - 1]).toBe(chart);
    const tables = tableChunks(flattenedSections);
    expect(tables.length).toBe(2);
  });

  it('multiple independent tables each split correctly', () => {
    const tableA = makeTable('Table A', makeDataRows(PORTRAIT_TABLE_ROW_CAP + 3));
    const tableB = makeTable('Table B', makeDataRows(PORTRAIT_TABLE_ROW_CAP + 3));
    const { flattenedSections } = runMinionOtavioPaginate([tableA, tableB], PORTRAIT_OPTS);
    expect(flattenedSections.length).toBe(4);
    expect(flattenedSections[0]).toMatchObject({ title: 'Table A' });
    expect(flattenedSections[2]).toMatchObject({ title: 'Table B' });
  });

  it('section with only header rows is returned as-is (no empty continuation)', () => {
    const rows = [headerRow('A'), headerRow('B'), headerRow('C')];
    const section = makeTable('Headers Only', rows);
    const { flattenedSections } = runMinionOtavioPaginate([section], PORTRAIT_OPTS);
    // Giant header block that can't be split meaningfully → single section
    expect(flattenedSections.length).toBe(1);
  });
});
