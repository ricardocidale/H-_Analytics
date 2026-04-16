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
export function getStorageProviderName(): 'replit' | 's3' | 'local' {
  const val = process.env.STORAGE_PROVIDER;
  if (val === 's3' || val === 'local') return val;
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
