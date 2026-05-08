export type LogLevel = "info" | "warn" | "error" | "debug";

export function log(message: string, source = "server", level: LogLevel = "info") {
  const timestamp = new Date().toISOString();
  const levelUpper = level.toUpperCase();
  // eslint-disable-next-line no-console
  console.log(`${timestamp} [${levelUpper}] [${source}] ${message}`);
}

export const logger = {
  info: (message: string, source?: string) => log(message, source, "info"),
  warn: (message: string, source?: string) => log(message, source, "warn"),
  error: (message: string, source?: string) => log(message, source, "error"),
  debug: (message: string, source?: string) => log(message, source, "debug"),
};

/**
 * Persona-prefixed logger. Produces log lines like
 *   `[helena] refreshing taxRate for US/CA`
 *   `[gustavo] dispatched Helena to refresh tax constants`
 * so the activity stream reads as a named team rather than opaque
 * specialist ids.
 *
 * `personaKey` MUST be a lower-case first name (Gustavo or one of the 12
 * Specialist humanNames). Callers should derive the key from
 * `engine/analyst/identity.ts` (orchestrator) or from
 * `def.humanName.toLowerCase()` (Specialist) — never hand-type the
 * string at the call site, which would silently desync if the persona
 * is renamed.
 */
/**
 * Format an unknown error for logging with as much diagnostic detail as
 * possible. For plain `Error` instances this returns the message. For
 * database driver errors (node-postgres, postgres-js, Drizzle wrappers)
 * this also pulls in fields like `code`, `detail`, `hint`, `schema`,
 * `table`, `column`, and `constraint` so a log line for "user lookup
 * failed" actually names the missing column instead of just echoing the
 * SQL the driver tried to run.
 */
export function formatError(error: unknown): string {
  if (error === null || error === undefined) return String(error);
  if (typeof error !== "object") return String(error);

  const err = error as Record<string, unknown> & { message?: unknown; cause?: unknown };
  const base = typeof err.message === "string" && err.message.length > 0
    ? err.message
    : String(error);

  const detailKeys = [
    "code",
    "detail",
    "hint",
    "severity",
    "schema",
    "schema_name",
    "table",
    "table_name",
    "column",
    "column_name",
    "constraint",
    "constraint_name",
    "dataType",
    "data_type_name",
    "routine",
    "where",
    "position",
  ];
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const key of detailKeys) {
    const value = err[key];
    if (value === undefined || value === null || value === "") continue;
    const normalized = key.replace(/_name$/, "");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    parts.push(`${normalized}=${typeof value === "string" ? value : JSON.stringify(value)}`);
  }

  let out = parts.length > 0 ? `${base} (${parts.join(", ")})` : base;

  if (err.cause !== undefined && err.cause !== null && err.cause !== error) {
    out += ` | cause: ${formatError(err.cause)}`;
  }
  return out;
}

export function loggerFor(personaKey: string) {
  const key = personaKey.trim().toLowerCase();
  return {
    info: (message: string) => log(message, key, "info"),
    warn: (message: string) => log(message, key, "warn"),
    error: (message: string) => log(message, key, "error"),
    debug: (message: string) => log(message, key, "debug"),
  };
}
