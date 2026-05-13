/**
 * Sentry pre-import entry. MUST be loaded via `node --import ./dist/instrument.mjs`
 * BEFORE the main bundle imports `express` — otherwise OpenTelemetry cannot
 * monkey-patch express and Sentry logs `[Sentry] express is not instrumented`
 * on every boot, silently dropping HTTP spans / per-request error context.
 *
 * Do NOT collapse this back into `index.ts` or drop the `--import` flag in
 * `package.json` / `Dockerfile` CMD. The whole point of this file is that it
 * runs in its own tick before any other module is evaluated.
 */
import * as Sentry from "@sentry/node";

const DSN = process.env.SENTRY_DSN;

if (DSN) {
  // NODE_ENV is the portable signal — the Dockerfile sets NODE_ENV=production
  // on the runtime stage (and `.replit` `[userenv.shared]` sets it for the dev
  // workspace), so we deliberately do NOT read any REPLIT_* env vars here
  // (replit-independence).
  const isProduction = process.env.NODE_ENV === "production";

  Sentry.init({
    dsn: DSN,
    environment: isProduction ? "production" : "development",
    tracesSampleRate: isProduction ? 0.2 : 1.0,
    // postgresIntegration() is also auto-added by Sentry's default
    // getAutoPerformanceIntegrations() when tracing is enabled, but we list it
    // explicitly so the intent is obvious and a future SDK refactor can't
    // silently drop it. See Task #952 — pg must also stay external in
    // build.mjs for OpenTelemetry's import-in-the-middle hook to wrap it.
    integrations: [Sentry.expressIntegration(), Sentry.postgresIntegration()],
    beforeSend(event) {
      const err = event.exception?.values?.[0];
      if (err?.type === "FinancialCalculationError") {
        const tags = (err as { mechanism?: { data?: Record<string, string> } }).mechanism
          ?.data;
        if (tags) {
          event.tags = { ...event.tags, ...tags };
        }
      }
      return event;
    },
  });
}
