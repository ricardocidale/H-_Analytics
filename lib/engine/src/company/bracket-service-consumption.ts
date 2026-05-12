/**
 * bracket-service-consumption.ts — Bracket-mix → service-consumption scalars
 *
 * Task #1409 — given a Management Company's bracket mix (weights summing to 1.0)
 * and the bracket catalog profiles, returns a per-service-category scalar in [0, 1].
 *
 * Doctrine (requirements.md R8/R9/R10):
 *   - Hotel brackets → service consumption profile = 'full' (all categories at 1.0)
 *   - STR brackets   → service consumption profile = 'str_only'
 *                      Only ICP_STR_ELIGIBLE_SERVICE_CATEGORIES receive 1.0; rest = 0.0
 *   - The scalar for a category = Σ(weight_i × applies(bracket_i, category))
 *
 * Named constants rule (R24 / CLAUDE.md §1):
 *   STR-eligible category names come from ICP_STR_ELIGIBLE_SERVICE_CATEGORIES
 *   in @workspace/shared/constants — never inline literals.
 *
 * No LLM, no I/O — pure deterministic calculation (minion-level logic).
 */

import { ICP_STR_ELIGIBLE_SERVICE_CATEGORIES } from "@norfolk/shared/constants";
import type { IcpBracketProfile, BracketMixEntry } from "./icp-bracket-types";

/**
 * Compute per-service-category effective consumption scalars from a bracket mix.
 *
 * @param bracketMix     Weighted distribution (weights must sum to ≈ 1.0)
 * @param brackets       Bracket catalog profiles (from icp_brackets table)
 * @param categoryNames  Canonical service category names to evaluate
 * @returns              Record<categoryName, scalar> where scalar ∈ [0, 1]
 *
 * Categories not listed in categoryNames are not returned.
 * Bracket slugs in bracketMix with no matching catalog entry are skipped.
 */
export function computeServiceConsumptionScalars(
  bracketMix: BracketMixEntry[],
  brackets: IcpBracketProfile[],
  categoryNames: readonly string[],
): Record<string, number> {
  const scalars: Record<string, number> = {};

  for (const category of categoryNames) {
    scalars[category] = 0;
  }

  const bracketBySlug = new Map<string, IcpBracketProfile>();
  for (const b of brackets) {
    bracketBySlug.set(b.slug, b);
  }

  for (const mixEntry of bracketMix) {
    const bracket = bracketBySlug.get(mixEntry.bracketSlug);
    if (!bracket || mixEntry.weight <= 0) continue;

    for (const category of categoryNames) {
      const categoryApplies = bracketConsumesCategory(bracket, category);
      scalars[category] = (scalars[category] ?? 0) + mixEntry.weight * (categoryApplies ? 1.0 : 0.0);
    }
  }

  return scalars;
}

/**
 * Returns true when the bracket's service consumption profile covers the
 * given service category name.
 *
 * Rules:
 *   'full'     → all categories consumed
 *   'str_only' → only ICP_STR_ELIGIBLE_SERVICE_CATEGORIES consumed
 */
function bracketConsumesCategory(bracket: IcpBracketProfile, categoryName: string): boolean {
  if (bracket.serviceConsumptionProfile === "full") return true;
  return (ICP_STR_ELIGIBLE_SERVICE_CATEGORIES as readonly string[]).includes(categoryName);
}

/**
 * Returns true when a bracket mix contains any STR-type brackets (weight > 0).
 * Used by the engine to decide whether to apply scalars at all.
 */
export function bracketMixHasStrComponent(
  bracketMix: BracketMixEntry[],
  brackets: IcpBracketProfile[],
): boolean {
  const bracketBySlug = new Map<string, IcpBracketProfile>();
  for (const b of brackets) {
    bracketBySlug.set(b.slug, b);
  }
  return bracketMix.some((entry) => {
    const bracket = bracketBySlug.get(entry.bracketSlug);
    return bracket?.serviceConsumptionProfile === "str_only" && entry.weight > 0;
  });
}
