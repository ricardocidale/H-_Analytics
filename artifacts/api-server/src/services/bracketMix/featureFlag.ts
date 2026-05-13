/**
 * Phase B bracket-mix feature flag
 *
 * U5 of the ICP bracket-mix peer-derived rebuild plan
 * (docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md).
 *
 * Reads `process.env.BRACKET_MIX_PHASE_B` with environment-aware defaults:
 *
 *   - explicit "on" / "true" / "1"  → enabled
 *   - explicit "off" / "false" / "0" → disabled
 *   - unset:
 *       - production           → disabled  (legacy property-level path)
 *       - dev / staging / test → enabled   (gather dual-run diff data)
 *
 * The orchestrator (recomputeGlobalDefault) honours this flag for the
 * `globalAssumptions.bracket_mix` write. The diff log is written on every
 * recompute regardless of the flag, so operators can observe the would-be
 * Phase B value before flipping prod.
 */

import { isProductionDeployment } from "../../providers/config";

const ON_VALUES = new Set(["on", "true", "1"]);
const OFF_VALUES = new Set(["off", "false", "0"]);

const PHASE_B_ENV_VAR = "BRACKET_MIX_PHASE_B";

/**
 * Returns the effective state of the Phase B bracket-mix feature flag.
 * Pure helper — call at each decision point rather than caching at boot.
 */
export function isPhaseBBracketMixEnabled(): boolean {
  const raw = (process.env[PHASE_B_ENV_VAR] ?? "").trim().toLowerCase();
  if (ON_VALUES.has(raw)) return true;
  if (OFF_VALUES.has(raw)) return false;
  return !isProductionDeployment();
}
