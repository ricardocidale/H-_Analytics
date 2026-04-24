/**
 * csp.ts — Content-Security-Policy header builder (Task #402)
 *
 * Lives under `server/replit_integrations/` so the literal "replit.dev" /
 * "replit.app" hostnames stay confined to the Replit-coupled corner of the
 * codebase that the independence guardrail allow-lists.
 *
 * The frame-ancestors clause lets the app be embedded inside the Replit IDE
 * preview pane during development; on a non-Replit deploy nothing relies on
 * those hosts being whitelisted.
 */

const REPLIT_FRAME_ANCESTORS = [
  "https://*.replit.dev",
  "https://*.replit.app",
  "https://*.repl.co",
];

const DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'"],
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  "font-src": ["'self'", "https://fonts.gstatic.com"],
  "img-src": ["'self'", "data:", "blob:", "https:"],
  "connect-src": [
    "'self'",
    "https://*.ingest.sentry.io",
    "https://*.sentry.io",
    "https://us.i.posthog.com",
    "https://app.posthog.com",
  ],
  "media-src": ["'self'", "blob:"],
  "frame-ancestors": ["'self'", ...REPLIT_FRAME_ANCESTORS],
};

export function buildContentSecurityPolicy(): string {
  return Object.entries(DIRECTIVES)
    .map(([directive, values]) => `${directive} ${values.join(" ")}`)
    .join("; ");
}
