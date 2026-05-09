/**
 * Enzo — verdict cache checker for Marco retriggers.
 *
 * Called by `handleInvokeMaya` in marco-tools.ts before invoking the Maya LLM.
 * Returns the cached Maya verdict for a slide if:
 *   1. The slide's prior verdict was "ok" or "advisory" (approved-ish), AND
 *   2. The slot content for that slide has not changed since the verdict was recorded.
 *
 * Verdicts of "warning" or "block" always force a re-judgment — no cache hit.
 *
 * Content hash: sort all luccaDraft keys that start with the slide prefix, join
 * their `.value` strings with "|". This is a fast deterministic fingerprint —
 * not cryptographically secure, but sufficient for equality checks inside a
 * single run session.
 *
 * Per CLAUDE.md §10 — deterministic helper, no LLM, no judgment. Minion role.
 */
import type { SlideFactoryRun } from "../../storage/slide-factory-runs";
import type { MayaVerdictLevel } from "../maya";

export type EnzoCacheResult =
  | { fromCache: true; mayaVerdict: MayaVerdictLevel; mayaNotes: string | null }
  | { fromCache: false };

/**
 * Compute the content hash for a slide's slot drafts.
 *
 * Sorts all keys in `luccaDraft` that begin with `slideKey + "."` alphabetically,
 * then joins their `value` strings with "|" as the separator.
 *
 * @param luccaDraft - The full luccaDraft map from the run row.
 * @param slideKey   - e.g. "slide1", "slide2".
 * @returns A deterministic string fingerprint of the slot values, or "" if no
 *          matching keys exist.
 */
export function computeSlideContentHash(
  luccaDraft: Record<string, { value: string }>,
  slideKey: string,
): string {
  const prefix = slideKey + ".";
  const sorted = Object.entries(luccaDraft)
    .filter(([k]) => k.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b));
  return sorted.map(([, draft]) => draft.value).join("|");
}

/**
 * Check whether the Enzo verdict cache has a valid hit for this slide.
 *
 * A cache hit requires:
 *   - The run has a prior agentResult for the slide with `mayaVerdict` of "ok"
 *     or "advisory" (block/warning always re-judge).
 *   - The current slot content hash matches the hash recorded when that verdict
 *     was stored in `run.slotContentHashes`.
 *
 * @param run         - The full run row (from getSlideFactoryRunById).
 * @param slideKey    - e.g. "slide1", "slide2" (matches agentResults key format).
 */
export async function checkVerdictCache(
  run: SlideFactoryRun,
  slideKey: string,
): Promise<EnzoCacheResult> {
  const prior = run.agentResults?.[slideKey];

  // No prior verdict — cannot cache
  if (!prior) return { fromCache: false };

  // Only cache approved-ish verdicts; warning/block always re-judge
  if (prior.mayaVerdict !== "ok" && prior.mayaVerdict !== "advisory") {
    return { fromCache: false };
  }

  // Compute current hash
  const luccaDraft = run.luccaDraft ?? {};
  const currentHash = computeSlideContentHash(luccaDraft, slideKey);

  // Compare against stored hash
  const storedHash = run.slotContentHashes?.[slideKey];
  if (storedHash === undefined || storedHash !== currentHash) {
    return { fromCache: false };
  }

  return {
    fromCache: true,
    mayaVerdict: prior.mayaVerdict,
    mayaNotes: prior.mayaNotes,
  };
}
