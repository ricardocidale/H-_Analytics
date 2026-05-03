/**
 * analyst-refresh-helpers.ts — Pure decision helpers extracted from the
 * AnalystTables refresh mutation's onSuccess handler.
 *
 * Isolating these as pure functions makes the auto-commit contract testable
 * without rendering the full component.
 *
 * Contract (Task #910):
 *   When autoCommitted is true  → skip RefreshDiffDialog (brands already live)
 *   When autoCommitted is false/absent → open RefreshDiffDialog for admin review
 */

export interface RefreshPayloadShape {
  /** Optional: only present when the server auto-committed (e.g. reference_brands). */
  autoCommitted?: boolean;
  proposedRanges: { dimensionKey: string }[];
  tableId?: string;
}

/**
 * Returns true when the refresh result should open the diff/review dialog.
 * Returns false for auto-committed tables (e.g. reference_brands) where the
 * data is already live in the DB and no admin approval is needed.
 *
 * Defaults to true (show dialog) when autoCommitted is absent or false.
 */
export function shouldOpenDiffDialog(payload: RefreshPayloadShape): boolean {
  return !(payload.autoCommitted ?? false);
}

/**
 * Builds the toast description for an auto-committed refresh result.
 * Used so the auto-commit path's user-facing message can be unit-tested
 * independently of the toast hook.
 */
export function buildAutoCommitToastDescription(payload: RefreshPayloadShape): string {
  return `${payload.proposedRanges.length} reference brands auto-committed to the database.`;
}
