/**
 * Platform-independent configuration helpers.
 * Reads from standard env vars, falling back to Replit-specific ones for backward compatibility.
 */

/** Get the public app URL */
export function getAppUrl(): string {
  // Prefer explicit APP_URL
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }
  // Fall back to Replit domain
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
  }
  // Local development fallback
  return `http://localhost:${process.env.PORT || 5000}`;
}

/** Get the storage provider name */
export function getStorageProviderName(): 'replit' | 's3' | 'r2' | 'local' {
  const val = process.env.STORAGE_PROVIDER;
  if (val === 's3' || val === 'r2' || val === 'local') return val;
  return 'replit';
}

/** Get the auth provider name */
export function getAuthProviderName(): 'replit' | 'local' {
  const val = process.env.AUTH_PROVIDER;
  if (val === 'local') return val;
  return 'replit';
}

/** Check if running on Replit */
export function isReplit(): boolean {
  return !!process.env.REPL_ID;
}

/**
 * Check if running in a production deployment.
 *
 * Honours `NODE_ENV=production` (standard) and Replit's `REPLIT_DEPLOYMENT=1`
 * marker for backward compatibility while the app still runs on Replit.
 */
export function isProductionDeployment(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  if (process.env.REPLIT_DEPLOYMENT === "1") return true;
  return false;
}

/**
 * Check if running in a published Replit deployment (as opposed to the
 * Replit workspace dev preview).
 *
 * This is intentionally STRICTER than `isProductionDeployment()`: the dev
 * preview can run with `NODE_ENV=production` (e.g. when serving the built
 * web bundle), but `REPLIT_DEPLOYMENT` is only set to "1" by Replit on a
 * published deployment. Use this signal for dev-only conveniences (such as
 * the logo quick-login on the login screen) that must NEVER be reachable
 * in production but should still work in the dev preview regardless of
 * how the artifact was built.
 */
export function isPublishedDeployment(): boolean {
  return process.env.REPLIT_DEPLOYMENT === "1";
}
