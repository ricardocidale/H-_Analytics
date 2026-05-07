/**
 * Felix-03 — Validator (deterministic).
 *
 * Validates the aggregated financial data structure produced by Felix-01.
 * Enforces USALI mode and correct projection-year count before formatting
 * proceeds. In Phase 1 (empty usaliRows), validation trivially passes.
 *
 * ADR-007 discipline: this module does not import storage, DB, or logger.
 */
import type { FelixAggregateOutput } from "./aggregate";
import { FELIX_PROJECTION_YEARS } from "../../deck-render-constants";

// ── Output shape ─────────────────────────────────────────────────────────────

export interface FelixValidateResult {
  valid: boolean;
  error: string | null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run Felix-03: validate the Felix-01 aggregation output.
 * Returns { valid: true, error: null } on success.
 * Returns { valid: false, error: <message> } on failure.
 */
export function runFelixValidate(agg: FelixAggregateOutput): FelixValidateResult {
  if (!agg.usaliMode) {
    return { valid: false, error: "Felix-03: usaliMode must be true for slide 6" };
  }
  if (agg.projectionYears !== FELIX_PROJECTION_YEARS) {
    return {
      valid: false,
      error: `Felix-03: expected ${FELIX_PROJECTION_YEARS} projection years, got ${agg.projectionYears}`,
    };
  }
  // Phase 1: empty usaliRows is acceptable — no financial data injected yet.
  return { valid: true, error: null };
}
