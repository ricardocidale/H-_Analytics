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
  return (process.env.STORAGE_PROVIDER as any) || 'replit';
}

/** Get the auth provider name */
export function getAuthProviderName(): 'replit' | 'local' {
  return (process.env.AUTH_PROVIDER as any) || 'replit';
}

/** Check if running on Replit */
export function isReplit(): boolean {
  return !!process.env.REPL_ID;
}
