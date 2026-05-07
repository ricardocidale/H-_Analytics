/**
 * Felix-01 — Aggregator (deterministic).
 *
 * Processes financial data for the Slide 6 USALI 10-year income statement
 * aggregate. In Phase 1, financialInputs is null and the aggregator returns
 * an empty but structurally valid output. Future phases will extract USALI
 * rows from Davide's output with projYears=10, usaliMode=true.
 *
 * ADR-007 discipline: this module does not import storage, DB, or logger.
 * All inputs are passed as parameters from the orchestrator.
 */
import { FELIX_PROJECTION_YEARS } from "../../deck-render-constants";

// ── Output shape ─────────────────────────────────────────────────────────────

export interface FelixAggregateOutput {
  usaliRows: Array<{ label: string; values: number[] }>;
  projectionYears: number;
  usaliMode: boolean;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run Felix-01: aggregate financial data for Slide 6.
 *
 * Phase 1: financialInputs is null — returns an empty aggregation with
 * canonical projectionYears and usaliMode=true.
 *
 * If financialInputs is already a structured FelixAggregateOutput (e.g. from a
 * test fixture or future Davide integration), pass it through so the validator
 * and formatter can exercise all paths.
 */
export function runFelixAggregate(financialInputs: unknown): FelixAggregateOutput {
  // Phase 1: no financial data injected yet — return canonical empty aggregation.
  if (!financialInputs) {
    return { usaliRows: [], projectionYears: FELIX_PROJECTION_YEARS, usaliMode: true };
  }

  // Pass through if already a structured FelixAggregateOutput (test fixtures,
  // future Davide integration). Validate shape loosely — Felix-03 does strict
  // validation downstream.
  if (
    typeof financialInputs === "object" &&
    financialInputs !== null &&
    "usaliMode" in financialInputs &&
    "projectionYears" in financialInputs
  ) {
    return financialInputs as FelixAggregateOutput;
  }

  // Unrecognized shape — fall back to empty aggregation.
  return { usaliRows: [], projectionYears: FELIX_PROJECTION_YEARS, usaliMode: true };
}
