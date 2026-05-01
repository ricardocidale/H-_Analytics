/**
 * calc/refinance/index.ts — Public API for the Refinance Calculator Module
 *
 * This barrel file exports all public functions and types from the refinance
 * calculator sub-modules. External code (like financialEngine.ts) should import
 * from this index rather than reaching into individual files.
 *
 * The refinance module is structured as a pipeline:
 *   validate → payoff → sizing → schedule → journal-hooks → refinance-calculator
 * Each step is in its own file for testability, and refinance-calculator.ts
 * orchestrates them into the full computeRefinance() flow.
 */
export { computeRefinance } from "./refinance-calculator.js";
export { pmt, ioPayment } from "./pmt.js";
export { computePayoff, type PayoffResult } from "./payoff.js";
export {
  computeSizing,
  resolvePropertyValue,
  type SizingResult,
} from "./sizing.js";
export { buildSchedule } from "./schedule.js";
export { buildJournalHooks, type JournalHookInputs } from "./journal-hooks.js";
export { validateRefinanceInput } from "./validate.js";
export type {
  RefinanceInput,
  RefinanceOutput,
  RefinanceFlags,
  ScheduleEntry,
  ProceedsLineItem,
  PrepaymentPenalty,
  PrepaymentPenaltyType,
  NewLoanTerms,
  PropertyValuation,
} from "./types.js";
