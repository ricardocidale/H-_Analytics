/**
 * Shared date utilities for Pietro minions that fetch weekly snapshots.
 */

const DAYS_IN_WEEK = 7;
// getDay() returns 0=Sunday … 5=Friday … 6=Saturday
const FRIDAY_DAY_OF_WEEK = 5;

/** Returns the next Friday (or the coming Friday if today is Friday). */
export function nextFriday(): Date {
  const now = new Date();
  const day = now.getDay();
  const daysUntilFriday = day <= FRIDAY_DAY_OF_WEEK
    ? FRIDAY_DAY_OF_WEEK - day
    : DAYS_IN_WEEK - day + FRIDAY_DAY_OF_WEEK;
  const friday = new Date(now);
  friday.setDate(now.getDate() + (daysUntilFriday === 0 ? DAYS_IN_WEEK : daysUntilFriday));
  return friday;
}

/** Formats a Date as an ISO date string (YYYY-MM-DD). */
export function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}
