/**
 * Felix-04 — Formatter (deterministic).
 *
 * Applies USALI formatting labels to the aggregated financial rows. Converts
 * raw numeric values to locale-formatted currency strings for display in the
 * Slide 6 income statement table.
 *
 * In Phase 1, the usaliRows array is empty so the formatted output is also
 * empty. This module is ready for Phase 2 when real financial data flows in.
 *
 * ADR-007 discipline: this module does not import storage, DB, or logger.
 */
import type { FelixAggregateOutput } from "./aggregate";

// ── Output shape ─────────────────────────────────────────────────────────────

export interface FelixFormatOutput {
  formattedRows: Array<{ label: string; values: string[] }>;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run Felix-04: apply USALI-style currency formatting to aggregated rows.
 * Numeric values are formatted as "$N,NNN" strings (locale US integer).
 */
export function runFelixFormat(agg: FelixAggregateOutput): FelixFormatOutput {
  const formattedRows = agg.usaliRows.map((row) => ({
    label: row.label,
    values: row.values.map((v) => `$${v.toLocaleString()}`),
  }));
  return { formattedRows };
}
