/**
 * sanitize-error.ts — Strip sensitive data from error messages before logging or sending to clients.
 *
 * Use this whenever an error message from an external service might contain
 * API keys, tokens, or credentials embedded in URLs.
 *
 * Usage:
 *   import { sanitizeError } from "../lib/sanitize-error";
 *   logger.error(sanitizeError(err.message), "my-service");
 *   res.status(500).json({ error: sanitizeError(message) });
 */

/**
 * Replace common credential patterns in error strings:
 * - URL query params: api_key=xxx, token=xxx, app_id=xxx, etc.
 * - Authorization header values accidentally logged
 * - Bearer tokens in error context
 */
export function sanitizeError(message: string): string {
  return message
    // URL query parameter credentials
    .replace(/([?&])(api_key|app_id|key|token|apikey|access_token|client_secret|authorization)=[^&\s]*/gi, "$1$2=***REDACTED***")
    // Bearer tokens in logged strings
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{10,}/g, "Bearer ***REDACTED***")
    // Generic long hex/base64 strings that look like keys (40+ chars)
    .replace(/[A-Za-z0-9]{40,}/g, (match) => {
      // Only redact if it looks like a key (mixed case, no spaces)
      if (/[a-z]/.test(match) && /[A-Z0-9]/.test(match)) {
        return `***${match.slice(0, 4)}...REDACTED***`;
      }
      return match;
    });
}

/**
 * Extract a safe error message from an unknown error value.
 * Returns the message string with credentials stripped.
 */
export function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return sanitizeError(err.message);
  return sanitizeError(String(err));
}
