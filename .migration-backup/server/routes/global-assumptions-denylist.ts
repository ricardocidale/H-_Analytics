/**
 * Field-write denylist for the `globalAssumptions` mutation routes.
 *
 * Per Task #379, certain values are canonically owned by the Model
 * Constants tab (Source of Truth) and must NEVER be written via the
 * non-canonical persistence path. Any inbound key in this list is
 * stripped server-side before merge/save so a stale client, a
 * misconfigured admin, or a non-admin management user cannot bypass
 * the canonical edit surface.
 *
 * Both `PUT /api/global-assumptions` and
 * `POST /api/global-assumptions/save-tab` consume this denylist.
 *
 * NOTE: this is *write* protection only — the field is preserved on
 * the existing row and continues to be readable. The engine reads via
 * the Model Constants overlay.
 */
export const GLOBAL_ASSUMPTIONS_CANONICAL_DENYLIST: ReadonlySet<string> = new Set<string>([
  "depreciationYears",
]);

/** Strip every denylisted key from a partial-globalAssumptions payload. */
export function stripCanonicalDenylistedFields<T extends Record<string, unknown>>(
  payload: T,
): T {
  const out = { ...payload } as Record<string, unknown>;
  GLOBAL_ASSUMPTIONS_CANONICAL_DENYLIST.forEach((key) => {
    if (key in out) delete out[key];
  });
  return out as T;
}
