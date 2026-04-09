import * as Sentry from "@sentry/node";
import type { Express, Request, Response, NextFunction } from "express";
import { FinancialCalculationError } from "@shared/errors";
import { log } from "./logger";

const DSN = process.env.SENTRY_DSN;
const isProduction = process.env.REPLIT_DEPLOYMENT === "1";

let initialized = false;

export function initSentry() {
  if (!DSN || initialized) return;
  initialized = true;

  Sentry.init({
    dsn: DSN,
    environment: isProduction ? "production" : "development",
    tracesSampleRate: isProduction ? 0.2 : 1.0,
    integrations: [Sentry.expressIntegration()],
    beforeSend(event) {
      const err = event.exception?.values?.[0];
      if (err?.type === "FinancialCalculationError") {
        const tags = (err as { mechanism?: { data?: Record<string, string> } }).mechanism?.data;
        if (tags) {
          event.tags = { ...event.tags, ...tags };
        }
      }
      return event;
    },
  });
}

export function sentryRequestHandler() {
  return (_req: Request, _res: Response, next: NextFunction) => next();
}

export function sentryErrorHandler() {
  if (!DSN) return (err: any, _req: Request, _res: Response, next: NextFunction) => next(err);
  return (err: any, _req: Request, res: Response, next: NextFunction) => {
    Sentry.captureException(err);
    next(err);
  };
}

export function setupSentryExpressErrorHandler(app: Express) {
  if (!DSN) return;
  Sentry.setupExpressErrorHandler(app);
}

export function captureException(error: unknown, extra?: Record<string, unknown>) {
  if (!DSN) {
    const msg = error instanceof Error ? error.message : String(error);
    log(msg, "sentry", "error");
    return;
  }

  if (error instanceof FinancialCalculationError) {
    Sentry.withScope((scope) => {
      scope.setTags(error.toSentryTags());
      if (extra) scope.setExtras(extra);
      Sentry.captureException(error);
    });
  } else {
    if (extra) {
      Sentry.withScope((scope) => {
        scope.setExtras(extra);
        Sentry.captureException(error);
      });
    } else {
      Sentry.captureException(error);
    }
  }
}

export function setUser(user: { id: number; email: string; role?: string }) {
  if (!DSN) return;
  Sentry.setUser({ id: String(user.id), email: user.email, role: user.role });
}

export function startSpan<T>(name: string, op: string, fn: () => T): T {
  if (!DSN) return fn();
  return Sentry.startSpan({ name, op }, fn);
}

export async function startSpanAsync<T>(name: string, op: string, fn: () => Promise<T>): Promise<T> {
  if (!DSN) return fn();
  return Sentry.startSpan({ name, op }, () => fn());
}

export { Sentry };
