/**
 * Single source of truth for the Postgres connection URL.
 *
 * Why this exists:
 * - On Replit, the env var `DATABASE_URL` is reserved for the Replit-managed
 *   "Helium" Postgres and cannot be overridden via the Secrets UI. To point the
 *   app at a different database (e.g. a dedicated Neon project, a Vercel
 *   Postgres, a local Postgres) without leaving Replit, we read `POSTGRES_URL`
 *   first and fall back to `DATABASE_URL`.
 * - Off Replit (Vercel, local, CI), neither variable is reserved; either one
 *   works, but `POSTGRES_URL` is the convention going forward (matches the
 *   Vercel + Neon naming).
 *
 * All runtime modules, build-time tooling (drizzle.config.ts), and scripts
 * MUST go through this helper so the cutover stays consistent.
 */
export function getDbUrl(): string | undefined {
  // Treat empty string the same as undefined — CI workflows explicitly clear
  // POSTGRES_URL to "" to force fallback to DATABASE_URL (see ci.yml's
  // job-level env block that originally motivated Task #573). Without this
  // empty-string normalization, `??` short-circuits on "" and returns the
  // empty string, breaking every drizzle-kit step that depends on a usable
  // URL.
  const fromPostgresUrl = process.env.POSTGRES_URL;
  if (fromPostgresUrl && fromPostgresUrl.length > 0) return fromPostgresUrl;
  const fromDatabaseUrl = process.env.DATABASE_URL;
  if (fromDatabaseUrl && fromDatabaseUrl.length > 0) return fromDatabaseUrl;
  return undefined;
}

/**
 * Boolean form for "do we have a database connection string available?"
 * Used by feature gates (vector store readiness, startup probes, etc.) that
 * previously checked `process.env.DATABASE_URL` directly and silently
 * disabled themselves on a POSTGRES_URL-only deployment.
 */
export function hasDbUrl(): boolean {
  return Boolean(getDbUrl());
}

/**
 * Strict form: throws if no URL is configured. Use at process startup or in
 * places that legitimately cannot proceed without a database.
 */
export function requireDbUrl(): string {
  const url = getDbUrl();
  if (!url) {
    throw new Error(
      "POSTGRES_URL or DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  return url;
}
