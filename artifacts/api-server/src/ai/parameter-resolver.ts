/**
 * DB-driven behavioral parameter resolver.
 *
 * Reads `admin_resources` at runtime so admins can tune behavioral
 * parameters (convergence thresholds, iteration limits, diff tolerances)
 * without a code deploy. The directive: no numeric behavioral tunable
 * hardcoded at call sites — every tunable that may change in production
 * must go through this resolver.
 *
 * Resolution:
 *   1. `admin_resources` row where kind="parameter" and slug=<slug>
 *      → (config as { value: number }).value
 *   2. If the row is missing, config is malformed, or any error occurs
 *      → returns the caller-supplied fallback. This resolver NEVER throws.
 *
 * The fallback is always the caller's existing named constant so the
 * steady-state behaviour is unchanged and the DB row is an override path.
 */
import { storage } from "../storage";

/**
 * Return the numeric value for a behavioral parameter slug.
 *
 * Guaranteed to return a number — falls back to `fallback` on any error,
 * missing row, or malformed config. Never throws.
 *
 * @param slug     - admin_resources slug for the parameter row (kebab-case)
 * @param fallback - named constant to use when the row is absent or broken
 */
export async function getParameterValue(slug: string, fallback: number): Promise<number> {
  try {
    const row = await storage.getAdminResourceBySlug?.("parameter", slug);
    const value = (row?.config as { value?: number } | undefined)?.value;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  } catch {
    // Non-fatal — return fallback below
  }
  return fallback;
}
