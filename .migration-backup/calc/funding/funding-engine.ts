import type { FundingInput, FundingOutput } from "./types.js";
import { validateFundingInput } from "./validate.js";
import { buildFundingTimeline } from "./timeline.js";
import { checkGates } from "./gates.js";
import { buildEquityRollForward } from "./equity-rollforward.js";
import { buildFundingJournalHooks } from "./journal-hooks.js";
import { roundTo } from "../../domain/types/rounding.js";

function buildErrorResult(errors: string[]): FundingOutput {
  return {
    funding_timeline: [],
    gate_checks: [],
    equity_rollforward: [],
    total_equity_committed: 0,
    total_funded_opco: 0,
    total_funded_properties: 0,
    journal_hooks: [],
    flags: {
      all_gates_passed: false,
      has_shortfalls: false,
      invalid_inputs: errors,
    },
    warnings: [],
  };
}

/**
 * Main orchestrator for the Funding & Tranche Engine (Skill 3).
 *
 * Flow:
 * 1. Validate inputs
 * 2. Resolve tranche triggers → chronological timeline
 * 3. Check funding gates (OpCo + property)
 * 4. Build equity roll-forward per entity
 * 5. Build journal hooks
 * 6. Assemble output
 */
export function computeFunding(input: FundingInput): FundingOutput {
  const rounding = input.rounding_policy;

  // 1. Validate
  const errors = validateFundingInput(input);
  if (errors.length > 0) {
    return buildErrorResult(errors);
  }

  // 2. Build timeline
  const { events, warnings } = buildFundingTimeline(
    input.tranches,
    input.property_requirements,
  );

  // 3. Check gates
  const gateChecks = checkGates(
    input.company_ops_start_date,
    events,
    input.property_requirements,
    rounding,
  );

  // 4. Equity roll-forward
  const equityRollforward = buildEquityRollForward(
    events,
    input.model_start_date,
    rounding,
  );

  // 5. Journal hooks
  const journalHooks = buildFundingJournalHooks(events);

  // 6. Assemble totals and flags
  const totalEquityCommitted = roundTo(
    events.reduce((sum, e) => sum + e.amount, 0),
    rounding,
  );

  const totalFundedOpco = roundTo(
    events
      .filter((e) => e.target_entity.type === "OPCO")
      .reduce((sum, e) => sum + e.amount, 0),
    rounding,
  );

  const totalFundedProperties = roundTo(
    events
      .filter((e) => e.target_entity.type === "PROPERTY")
      .reduce((sum, e) => sum + e.amount, 0),
    rounding,
  );

  const allGatesPassed = gateChecks.every((g) => g.passed);
  const hasShortfalls = gateChecks.some(
    (g) => g.gate_type === "funding_shortfall" && !g.passed,
  );

  return {
    funding_timeline: events,
    gate_checks: gateChecks,
    equity_rollforward: equityRollforward,
    total_equity_committed: totalEquityCommitted,
    total_funded_opco: totalFundedOpco,
    total_funded_properties: totalFundedProperties,
    journal_hooks: journalHooks,
    flags: {
      all_gates_passed: allGatesPassed,
      has_shortfalls: hasShortfalls,
      invalid_inputs: [],
    },
    warnings,
  };
}
