import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN;

export function initClientSentry() {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.PROD ? "production" : "development",
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    replaysOnErrorSampleRate: 0,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
  });
}

export function captureClientException(error: unknown, tags?: Record<string, string>) {
  if (!DSN) {
    console.error("[Sentry disabled]", error);
    return;
  }
  if (tags) {
    Sentry.withScope((scope) => {
      scope.setTags(tags);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

export function setClientUser(user: { id: number; email: string; role?: string }) {
  if (!DSN) return;
  Sentry.setUser({ id: String(user.id), email: user.email });
}

export { Sentry };
