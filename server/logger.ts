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
