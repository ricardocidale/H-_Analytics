/**
 * Constants for the self-test logs admin route (Task #1458).
 *
 * Pulled out into their own module so the no-magic-numbers gate sees
 * named constants in the route handler instead of bare literals.
 */

/** Default page size for `GET /api/admin/intelligence/self-test-logs`. */
export const SELF_TEST_LOGS_DEFAULT_LIMIT = 500;

/** Hard cap on `?limit=` to keep the JSON payload bounded. */
export const SELF_TEST_LOGS_MAX_LIMIT = 2000;

/** "Last 7 days" window expressed as milliseconds. */
export const SELF_TEST_LOGS_RANGE_7D_MS = 7 * 24 * 60 * 60 * 1000;

/** "Last 30 days" window (also the scheduler's default cadence). */
export const SELF_TEST_LOGS_RANGE_30D_MS = 30 * 24 * 60 * 60 * 1000;
