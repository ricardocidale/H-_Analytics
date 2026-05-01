/**
 * Post-synthesis quality validator for the Revenue Specialist (G2 IB req #9).
 *
 * Checks the Opus synthesis output for defects that Zod schema enforcement
 * cannot catch: out-of-bounds evidence refs, collapsed ranges, missing keys
 * by identity (not just count), and degenerate reasoning. Failures trigger
 * a PE-regress loop (max 2 iterations) per Intelligence Bar requirement #9.
 *
 * Deliberately does NOT re-implement Zod-enforced constraints (low ≤ mid ≤
 * high, required fields, evidence array shape) — those are caught at schema
 * parse time.
 *
 * Note on collapsed ranges: revenue dimensions emit decimal fractions
 * (e.g. 0.06–0.09). The `low === high` sentinel still flags genuine point
 * estimates because no honest Opus emission for a 5%-wide band collapses to
 * a single value — Funding's logic carries over verbatim.
 */

import type { RevenueSpecialistOutput } from "./mgmt-co-revenue-output-schema";
import type { RevenueComparableRow } from "./mgmt-co-revenue-orchestrator-adapter";
import { REVENUE_DIMENSION_KEYS } from "./mgmt-co-revenue-prompt-input-builder";
import { TIER_1_MIN_TOTAL_EVIDENCE } from "@shared/analyst-conviction";

export interface SynthesisValidationResult {
  pass: boolean;
  regressReason?: string;
}

export function validateSynthesisOutput(
  output: RevenueSpecialistOutput,
  comparables: readonly RevenueComparableRow[],
): SynthesisValidationResult {
  // 1. All 5 expected dimension keys present by identity (not just count)
  const emittedKeys = new Set(output.dimensions.map((d) => d.key));
  const missingKeys = REVENUE_DIMENSION_KEYS.filter((k) => !emittedKeys.has(k));
  if (missingKeys.length > 0) {
    return {
      pass: false,
      regressReason: `Synthesis omitted dimensions: ${missingKeys.join(", ")}. Emit exactly these 5 keys: ${REVENUE_DIMENSION_KEYS.join(", ")}.`,
    };
  }

  for (const dim of output.dimensions) {
    // 2. At least one in-bounds evidenceRef per dimension
    if (dim.evidenceRefs.length === 0) {
      return {
        pass: false,
        regressReason: `Dimension "${dim.key}" emitted zero evidenceRefs. Cite at least one comparable index.`,
      };
    }
    const hasValidRef = dim.evidenceRefs.some(
      (i) => i >= 0 && i < comparables.length,
    );
    if (!hasValidRef) {
      return {
        pass: false,
        regressReason: `Dimension "${dim.key}" evidenceRefs are all out-of-bounds (max valid index: ${comparables.length - 1}). Use indices from the comparable set provided.`,
      };
    }

    // 3. No collapsed range (high === low signals a point estimate, not a range)
    if (dim.high === dim.low) {
      return {
        pass: false,
        regressReason: `Dimension "${dim.key}" has a collapsed range (low = high = ${dim.low}). Produce a genuine range that reflects market uncertainty.`,
      };
    }

    // 4. Substantive reasoning (< 20 chars is almost certainly degenerate output)
    if (!dim.reasoning || dim.reasoning.trim().length < 20) {
      return {
        pass: false,
        regressReason: `Dimension "${dim.key}" reasoning is too short (${dim.reasoning?.trim().length ?? 0} chars). Provide grounded reasoning that cites specific comparables.`,
      };
    }
  }

  // 5. Total valid evidence refs >= TIER_1_MIN_TOTAL_EVIDENCE when the
  //    comparable set is large enough to satisfy it (ADR-003 invariant 7).
  if (comparables.length >= TIER_1_MIN_TOTAL_EVIDENCE) {
    const totalValid = output.dimensions.reduce(
      (sum, d) => sum + d.evidenceRefs.filter((i) => i >= 0 && i < comparables.length).length,
      0,
    );
    if (totalValid < TIER_1_MIN_TOTAL_EVIDENCE) {
      return {
        pass: false,
        regressReason: `Total in-bounds evidenceRefs across all dimensions is ${totalValid} (minimum ${TIER_1_MIN_TOTAL_EVIDENCE}). Cite at least ${TIER_1_MIN_TOTAL_EVIDENCE} distinct comparables across dimensions.`,
      };
    }
  }

  return { pass: true };
}
