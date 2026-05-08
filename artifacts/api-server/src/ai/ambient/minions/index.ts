/**
 * Minion contract — shared types for all Pietro data minions.
 *
 * Minions are deterministic TypeScript functions: no LLM, no judgment.
 * Each minion owns one external source, fetches it, transforms the
 * response to the canonical DB schema, upserts, and returns a structured
 * result to its caller (Pietro agent or scheduler).
 */

export interface MinionResult {
  source: string;
  rowsUpserted: number;
  rowsFailed: number;
  errors: string[];
  durationMs: number;
}
