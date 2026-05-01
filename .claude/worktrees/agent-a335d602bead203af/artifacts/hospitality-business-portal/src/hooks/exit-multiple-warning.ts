/**
 * exit-multiple-warning.ts — Pure helper that decides whether a saved
 * `exitRevenueMultiple` (paired with an `industryVertical`) should surface a
 * post-save warning because it falls outside the admin-managed band for that
 * vertical (`exit_multiples` table).
 *
 * Lives next to `useCompanyAssumptionsForm` (the only consumer) but kept
 * pure and side-effect-free so it can be unit-tested without React.
 *
 * Mirrors the same band check the inline `PropertyExitDefaultsCard` already
 * performs and the same one the server-side `assumption-consistency`
 * watchdog runs — three call sites, one rule, no drift.
 */

export interface ExitMultipleBand {
  dimensionKey: string;
  label: string;
  unit?: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
}

export interface ExitMultipleAck {
  rangeLowAtAck: number;
  rangeHighAtAck: number;
}

export interface ExitMultipleWarning {
  fieldName: "exitRevenueMultiple";
  fieldLabel: string;
  currentValue: number;
  rangeLow: number;
  rangeHigh: number;
  display: string;
}

export interface ComputeExitMultipleWarningArgs {
  industryVertical: string | null | undefined;
  exitRevenueMultiple: number | null | undefined;
  bands: ReadonlyArray<ExitMultipleBand>;
  /** Existing "Keep my value" ack for `exitRevenueMultiple`, if any. */
  ack?: ExitMultipleAck | null;
}

/**
 * Returns a warning when the supplied multiple is outside the matching
 * vertical's [valueLow, valueHigh] band. Returns null when:
 *   - the user has not picked a vertical or entered a multiple
 *   - no admin band exists for the chosen vertical
 *   - the band has incomplete bounds (low/high missing)
 *   - the multiple is inside the band
 *   - an existing acknowledgment still covers the value (user previously
 *     chose "Keep my value" and the live value remains inside that snapshot)
 */
export function computeExitMultipleWarning(
  args: ComputeExitMultipleWarningArgs,
): ExitMultipleWarning | null {
  const verticalRaw = args.industryVertical;
  const multipleRaw = args.exitRevenueMultiple;
  if (typeof verticalRaw !== "string" || verticalRaw.trim() === "") return null;
  if (typeof multipleRaw !== "number" || !Number.isFinite(multipleRaw)) return null;

  const verticalKey = verticalRaw.toLowerCase().trim();
  const band = args.bands.find(
    (b) => b.dimensionKey?.toLowerCase().trim() === verticalKey,
  );
  if (!band) return null;
  const low = band.valueLow;
  const high = band.valueHigh;
  if (low == null || high == null) return null;
  if (multipleRaw >= low && multipleRaw <= high) return null;

  if (
    args.ack &&
    multipleRaw >= args.ack.rangeLowAtAck &&
    multipleRaw <= args.ack.rangeHighAtAck
  ) {
    return null;
  }

  const midText = band.valueMid != null ? ` (mid ${band.valueMid.toFixed(1)}x)` : "";
  return {
    fieldName: "exitRevenueMultiple",
    fieldLabel: `Exit Revenue Multiple — ${band.label ?? band.dimensionKey}`,
    currentValue: multipleRaw,
    rangeLow: low,
    rangeHigh: high,
    display: `${low.toFixed(1)}x – ${high.toFixed(1)}x${midText}`,
  };
}
