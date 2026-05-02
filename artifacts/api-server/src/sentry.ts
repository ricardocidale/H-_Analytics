import * as Sentry from "@sentry/node";
import type { Express, Request, Response, NextFunction } from "express";
import { FinancialCalculationError } from "@shared/errors";
import { log } from "./logger";

const DSN = process.env.SENTRY_DSN;

/**
 * Sentry.init() now lives in `./instrument.ts` and runs via
 * `node --import ./dist/instrument.mjs ./dist/index.mjs` BEFORE express is
 * imported. This function is kept as a no-op so any stray callers don't
 * accidentally double-init; remove once we're sure nothing imports it.
 */
export function initSentry() {
  // intentionally empty — see ./instrument.ts
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
