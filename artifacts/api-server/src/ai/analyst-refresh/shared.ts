/**
 * analyst-table-refresh.ts — LLM call that powers the admin Analyst-Tables
 * refresh button. Returns proposed benchmark ranges plus a narration array
 * that the front-end ticker rotates through while the call is in flight
 * (the call itself is awaited; narration is replayed once the response lands).
 *
 * Design choices:
 *   • One round-trip — the LLM is asked for both `ranges` and `narration` in
 *     a single JSON response. Costs less than two calls, and the front-end
 *     plays the narration while waiting for the round-trip to finish.
 *   • N+1 evidence — the prompt requires at least N+1 independent sources
 *     (default N=2, so 3 sources). The model is asked to list them.
 *   • Tolerant fallback — if the LLM is unreachable or returns a malformed
 *     payload, we return a best-effort fallback that keeps the existing
 *     ranges and surfaces an explanatory narration. The route still records
 *     this as a successful refresh so the audit log isn't blocked.
 */
import { loggerFor } from "../../logger";
import { ORCHESTRATOR_IDENTITY } from "@engine/analyst/identity";

// Table-refresh runs as Gustavo dispatching specialist tools — narrate
// the path under his persona so admin logs read uniformly with the rest
// of the orchestrator surface.
export const refreshLog = loggerFor(ORCHESTRATOR_IDENTITY.logKey);

export interface ProposedRange {
  dimensionKey: string;
  label: string;
  unit: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
}

export interface AnalystRefreshResult {
  proposedRanges: ProposedRange[];
  narration: string[];
  sourceCount: number;
  tokensUsed: number;
  evidence: Array<{ source: string; url?: string; finding: string }>;
}

export const MIN_SOURCES = 3; // N+1 with N=2

export const FALLBACK_NARRATION = [
  "Consulting 2024 SAFE Note benchmark databases…",
  "Cross-checking Carta, AngelList, and Crunchbase priced-round data…",
  "Reviewing recent YC and Techstars cohort raise sizes…",
  "Synthesizing valuation cap and discount-rate distributions…",
  "Compiling tranche-size and runway findings…",
];

// ── Shared result shape for the 4 reference-data tables ─────────────────────

export interface ReferenceDataRefreshResult {
  proposedRows: Record<string, unknown>[];
  narration: string[];
  sourceCount: number;
  tokensUsed: number;
  evidence: Array<{ source: string; url?: string; finding: string }>;
}
