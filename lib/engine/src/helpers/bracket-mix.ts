/**
 * bracket-mix.ts — Client-side bracket-mix normalization helper.
 *
 * Normalizes a BracketMixEntry[] so that weights sum to exactly 1.0,
 * correcting any floating-point drift introduced by percentage → fraction
 * conversion and rounding. Returns the input unchanged when the total is
 * already zero or the array is empty.
 *
 * This is a PURE function — no I/O, no database access.
 */

export interface BracketMixEntry {
  bracketSlug: string;
  weight: number;
}

/**
 * Re-scale bracket weights so they sum to exactly 1.0.
 *
 * The caller is expected to have already validated that weights are
 * non-negative and approximately sum to 1 (e.g. the UI enforces 100%).
 * This function removes any residual floating-point error.
 */
export function normalizeBracketMix(mix: BracketMixEntry[]): BracketMixEntry[] {
  if (mix.length === 0) return mix;
  const total = mix.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) return mix;
  return mix.map((e) => ({ bracketSlug: e.bracketSlug, weight: e.weight / total }));
}
