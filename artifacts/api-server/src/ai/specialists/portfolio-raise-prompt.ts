/**
 * portfolio-raise-prompt.ts — system + user prompt builders for the
 * Portfolio Capital Raise Specialist (portfolio.capitalRaise v1).
 *
 * U7 implementation: full LP-grade analysis norms + engine-grounded user prompt.
 */

import type { PortfolioRaisePromptInputContext } from "./portfolio-raise-prompt-input-builder";
import type { LpDealComparable } from "./portfolio-raise-runner";

export function buildPortfolioRaiseSystemPrompt(): string {
  // U7: full implementation
  return "";
}

export function buildPortfolioRaiseUserPrompt(
  ctx: PortfolioRaisePromptInputContext,
  comparables: readonly LpDealComparable[],
): string {
  // U7: full implementation
  void ctx;
  void comparables;
  return "";
}
