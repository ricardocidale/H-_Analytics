/**
 * Minion: Otavio — deterministic report pagination.
 *
 * Otavio pre-splits a flat ReportSection[] into page-safe chunks before HTML
 * generation. He is purely deterministic — no LLM, no judgment.
 *
 * Row capacity is calibrated to Playwright/WeasyPrint output at:
 *   Landscape: 406.4mm × 228.6mm  (usable content height ≈ 193mm)
 *   Portrait:  215.9mm × 279.4mm  (usable content height ≈ 244mm)
 * with a 15mm page-header bar, 20mm footer, and 4mm top/side padding at 11pt.
 *
 * Naming convention: Minions carry a single name, are deterministic helpers,
 * and never call an LLM. Built by Norfolk AI.
 */

import type { ReportSection, TableSection, TableRow } from "../types";
import { ASSUMPTIONS_TITLE_PREFIX } from "../assumption-sections";

// ─── Page-capacity constants ───────────────────────────────────────────────
// Landscape: usable content height ≈ 193mm ÷ 7mm per weighted row unit × 0.78 fill → 21
export const LANDSCAPE_TABLE_ROW_CAP = 21;

// Portrait: narrower col width limits dense packing → 16
export const PORTRAIT_TABLE_ROW_CAP = 16;

// Assumptions sections are single-column (one FY value). More rows fit because
// no multi-year numeric columns → wider label space, shorter per-row height.
export const LANDSCAPE_ASSUMPTIONS_ROW_CAP = 23;
export const PORTRAIT_ASSUMPTIONS_ROW_CAP = 18;

// Orphan guard: minimum consecutive data rows that must follow a section header
// on the same page. Prevents a header landing alone at the bottom of a page.
const MIN_ROWS_AFTER_HEADER = 2;

// ─── Row weight model ──────────────────────────────────────────────────────
// Section header rows are styled with a background colour, bold text, and a
// top border — visually ~25% taller than a plain data row.
export const HEADER_ROW_WEIGHT = 1.25;

// Total/subtotal rows have a bold top border → ~15% taller than a data row.
export const TOTAL_ROW_WEIGHT = 1.15;

// Baseline data row weight.
export const DATA_ROW_WEIGHT = 1.0;

// ─── Public types ─────────────────────────────────────────────────────────

export interface PaginationOptions {
  orientation: "landscape" | "portrait";
  dense: boolean;
  /**
   * Explicit flag set by the caller when the report covers exactly one fiscal
   * year. When true, all table sections are paginated with the assumptions row
   * cap (wider label column, single value column) rather than the multi-year
   * cap. This replaces the old `section.years.length === 1` heuristic which
   * was brittle: a two-year projection whose last year was dropped would be
   * silently misclassified, causing incorrect page breaks (CR-01).
   *
   * Contract: callers MUST derive this from the canonical year list they pass
   * to the report compiler, not by inspecting section.years at pagination time.
   */
  isSingleYear: boolean;
}

export interface PaginatedReport {
  flattenedSections: ReportSection[];
}

// ─── Main entry point ──────────────────────────────────────────────────────

/**
 * Takes a flat section list and returns the same sections but with large
 * TableSections split into page-sized chunks. All other section kinds (kpi,
 * chart, image) pass through unchanged — they are single-page by nature.
 *
 * Assumption sections receive special treatment per Valentina's pagination
 * contract (rule c): they are first split into semantic groups (one page per
 * named group such as "Partner Compensation", "Staffing", etc.), then each
 * group is further row-count-split if its row total exceeds the page cap.
 *
 * Chart sections that immediately follow a table are intentionally kept in
 * sequence: the last table chunk will naturally be followed by its chart.
 */
export function runMinionOtavioPaginate(
  sections: ReportSection[],
  opts: PaginationOptions,
): PaginatedReport {
  const isLandscape = opts.orientation === "landscape";
  const result: ReportSection[] = [];

  for (const section of sections) {
    if (section.kind !== "table") {
      result.push(section);
      continue;
    }

    // A section is treated as an "assumptions-style" section — using the wider
    // single-column row cap — when it either carries the canonical assumptions
    // title prefix OR the caller has declared this as a single-year report via
    // opts.isSingleYear. We do NOT fall back to inspecting section.years.length
    // here; that heuristic was removed in CR-01 because a two-year projection
    // whose last year was dropped would silently trigger the wrong cap.
    const isAssumptions =
      section.title.startsWith(ASSUMPTIONS_TITLE_PREFIX) ||
      opts.isSingleYear;

    const rowCap = isAssumptions
      ? isLandscape
        ? LANDSCAPE_ASSUMPTIONS_ROW_CAP
        : PORTRAIT_ASSUMPTIONS_ROW_CAP
      : isLandscape
        ? LANDSCAPE_TABLE_ROW_CAP
        : PORTRAIT_TABLE_ROW_CAP;

    if (isAssumptions) {
      // Rule (c): split into semantic groups first (one page per named group),
      // then apply row-count splitting within each group.
      const groupSections = splitAssumptionSectionByGroups(section);
      for (const grp of groupSections) {
        const chunks = splitTableSection(grp, rowCap);
        result.push(...chunks);
      }
    } else {
      const chunks = splitTableSection(section, rowCap);
      result.push(...chunks);
    }
  }

  return { flattenedSections: result };
}

// ─── Internal helpers ─────────────────────────────────────────────────────

/**
 * Split an assumption TableSection into one sub-section per named semantic
 * group (e.g. "Partner Compensation", "Staffing", "Fixed Overhead").
 *
 * Groups are delineated by `type === "header"` rows. Each header row starts
 * a new group whose title becomes `"${parentTitle} — ${headerLabel}"`.
 * The header row itself is included as the first row of its group so the
 * section label still appears at the top of the page.
 *
 * If no header rows are found (flat section), the original section is
 * returned as-is.
 *
 * Called by runMinionOtavioPaginate for all assumption sections before
 * row-count splitting, per Valentina's pagination contract (rule c).
 */
function splitAssumptionSectionByGroups(section: TableSection): TableSection[] {
  const rows = section.rows;
  if (rows.length === 0) return [section];

  type Group = { label: string; rows: TableRow[] };
  const groups: Group[] = [];
  let currentLabel = "";
  let currentRows: TableRow[] = [];

  for (const row of rows) {
    if (row.type === "header") {
      if (currentRows.length > 0) {
        groups.push({ label: currentLabel, rows: currentRows });
      }
      currentLabel = (row.category || "").trim();
      currentRows = [row];
    } else {
      currentRows.push(row);
    }
  }
  if (currentRows.length > 0) {
    groups.push({ label: currentLabel, rows: currentRows });
  }

  if (groups.length <= 1) return [section];

  return groups.map((g) => ({
    kind: "table" as const,
    title: g.label ? `${section.title} — ${g.label}` : section.title,
    years: section.years,
    rows: g.rows,
  }));
}

export function getRowWeight(row: TableRow): number {
  if (row.type === "header") return HEADER_ROW_WEIGHT;
  if (row.type === "total" || row.type === "subtotal") return TOTAL_ROW_WEIGHT;
  return DATA_ROW_WEIGHT;
}

/**
 * Compute the total weighted row count for a TableSection.
 * Used by the compiler's runtime overflow guard to detect calibration drift.
 */
export function getSectionWeightedCount(section: TableSection): number {
  return section.rows.reduce((sum, r) => sum + getRowWeight(r), 0);
}

/**
 * Splits a single TableSection into multiple page-sized chunks.
 * Each chunk becomes an independent TableSection with a "(cont'd N/M)" suffix
 * on the title for continuation pages.
 *
 * Orphan prevention: trailing header rows at the end of a chunk are carried
 * forward to the start of the next chunk so a section header never appears
 * alone at the bottom of a page without MIN_ROWS_AFTER_HEADER data rows.
 */
function splitTableSection(
  section: TableSection,
  rowCap: number,
): TableSection[] {
  const rows = section.rows;
  if (rows.length === 0) return [section];

  // Fast path: if the total weighted row count fits on one page, no split needed.
  const totalWeight = rows.reduce((sum, r) => sum + getRowWeight(r), 0);
  if (totalWeight <= rowCap) return [section];

  const chunks: TableRow[][] = [];
  let chunk: TableRow[] = [];
  let weight = 0;

  for (const row of rows) {
    const w = getRowWeight(row);

    if (weight + w > rowCap && chunk.length > 0) {
      // Orphan prevention: move any trailing header rows to the next chunk
      // so they are never stranded at the bottom of a page without data.
      const carryOver: TableRow[] = [];
      while (
        chunk.length > MIN_ROWS_AFTER_HEADER &&
        chunk[chunk.length - 1].type === "header"
      ) {
        const h = chunk.pop()!;
        carryOver.unshift(h);
        weight -= getRowWeight(h);
      }

      if (chunk.length > 0) {
        chunks.push(chunk);
        chunk = [...carryOver];
        weight = carryOver.reduce((s, r) => s + getRowWeight(r), 0);
      }
    }

    chunk.push(row);
    weight += w;
  }

  if (chunk.length > 0) chunks.push(chunk);

  // Guard: if we ended up with only one chunk (e.g. one giant header block),
  // return the original section to avoid producing an empty continuation title.
  if (chunks.length === 1) return [section];

  const totalChunks = chunks.length;
  return chunks.map((chunkRows, idx) => ({
    kind: "table" as const,
    title:
      idx === 0
        ? section.title
        : `${section.title} (cont\u2019d ${idx + 1}/${totalChunks})`,
    years: section.years,
    rows: chunkRows,
  }));
}
