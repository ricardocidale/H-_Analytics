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
 *   `[gaspar] dispatched Helena to refresh tax constants`
 * so the activity stream reads as a named team rather than opaque
 * specialist ids.
 *
 * `personaKey` MUST be a lower-case first name (Gaspar or one of the 12
 * Specialist humanNames). Callers should derive the key from
 * `engine/analyst/identity.ts` (orchestrator) or from
 * `def.humanName.toLowerCase()` (Specialist) — never hand-type the
 * string at the call site, which would silently desync if the persona
 * is renamed.
 */
export function loggerFor(personaKey: string) {
  const key = personaKey.trim().toLowerCase();
  return {
    info: (message: string) => log(message, key, "info"),
    warn: (message: string) => log(message, key, "warn"),
    error: (message: string) => log(message, key, "error"),
    debug: (message: string) => log(message, key, "debug"),
  };
}
