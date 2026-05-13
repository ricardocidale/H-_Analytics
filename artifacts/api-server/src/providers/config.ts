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
 * Production is Railway, which sets `NODE_ENV=production` on every deployed
 * service. The legacy `REPLIT_DEPLOYMENT=1` branch was removed once PR #133
 * moved the published-deployment gate to `RAILWAY_SERVICE_ID` via
 * `isPublishedDeployment()` below — see CLAUDE.md § "Production Deployment".
 *
 * Callers that need to distinguish the Replit dev preview from a real
 * published deployment (e.g., dev-login gating) must use
 * `isPublishedDeployment()` instead — it is strictly stricter and continues
 * to honour `REPLIT_DEPLOYMENT=1` for back-compat.
 */
export function isProductionDeployment(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Check if running in a published user-facing deployment (as opposed to the
 * Replit workspace dev preview or a local dev run).
 *
 * This is intentionally STRICTER than `isProductionDeployment()`: the Replit
 * dev preview can run with `NODE_ENV=production` (e.g. when serving the built
 * web bundle), so NODE_ENV alone cannot tell the two apart. We detect a real
 * published deployment via platform-specific signals:
 *
 *   - Railway sets `RAILWAY_SERVICE_ID` on every deployed service.
 *   - Replit Publish sets `REPLIT_DEPLOYMENT=1` (legacy; kept for back-compat).
 *
 * Use this signal for dev-only conveniences (such as the logo quick-login
 * and `/api/auth/dev-login`) that must NEVER be reachable in production but
 * should still work in the dev preview regardless of how the artifact was
 * built.
 */
export function isPublishedDeployment(): boolean {
  if (process.env.RAILWAY_SERVICE_ID) return true;
  if (process.env.REPLIT_DEPLOYMENT === "1") return true;
  return false;
}
