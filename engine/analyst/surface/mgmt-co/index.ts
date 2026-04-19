// engine/analyst/surface/mgmt-co — Surface Specialists for Management
// Company tabs (Funding, Revenue, Compensation, Overhead, Company, ...).
//
// Phase 2: re-exports the two existing tab evaluators (Funding, Revenue)
// from engine/watchdog/. Phase 3 backfills both to the AnalystVerdict
// contract; Phase 4 ships Compensation as the first new Specialist
// (Norfolk audit Phase 3 ships under this surface).
//
// Spec: docs/architecture/analyst/mgmt-co-specialists.md

export {
  evaluateCapitalRaise,
  evaluateStub as evaluateCapitalRaiseStub,
} from "../../../watchdog/capitalRaiseEvaluator";
export type {
  WatchdogSeverity,
  WatchdogActionKind,
  WatchdogAction,
  WatchdogResult,
  CapitalRaiseInputs,
} from "../../../watchdog/capitalRaiseEvaluator";

export { evaluateRevenue } from "../../../watchdog/revenueEvaluator";
export type { RevenueInputs } from "../../../watchdog/revenueEvaluator";
