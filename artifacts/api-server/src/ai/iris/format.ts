/** Maximum number of error messages stored per Iris run in health_summary.errors. */
export const IRIS_HEALTH_SUMMARY_MAX_ERRORS = 50;

/**
 * Caps an errors array to at most `limit` entries, appending a truncation
 * sentinel so readers know items were dropped.
 */
export function capErrors(errors: string[] | undefined, limit: number): string[] | undefined {
  if (!errors || errors.length <= limit) return errors;
  const truncated = errors.slice(0, limit);
  truncated.push(`... and ${errors.length - limit} more`);
  return truncated;
}
