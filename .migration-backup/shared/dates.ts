/**
 * shared/dates.ts — Canonical date utilities shared between client and server.
 *
 * parseLocalDate() prevents timezone-related off-by-one-day errors that occur
 * when using `new Date("2027-07-01")` in Western Hemisphere timezones. By
 * appending "T00:00:00", we force local-time interpretation instead of UTC.
 *
 * This is the SINGLE SOURCE OF TRUTH — do NOT create local copies.
 */

/**
 * Parse a date string into a Date object, treating bare YYYY-MM-DD as local
 * midnight (not UTC). Strings that already contain "T" pass through unchanged.
 */
export function parseLocalDate(dateStr: string): Date {
  if (dateStr.includes('T')) return new Date(dateStr);
  return new Date(dateStr + 'T00:00:00');
}
