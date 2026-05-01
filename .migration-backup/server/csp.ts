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
  "frame-ancestors": ["'self'"],
};

export function buildContentSecurityPolicy(): string {
  return Object.entries(DIRECTIVES)
    .map(([directive, values]) => `${directive} ${values.join(" ")}`)
    .join("; ");
}
