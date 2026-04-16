import type { Express } from 'express';
import type { AuthProvider } from './types';
import {
  setupAuth,
  isAuthenticated,
} from '../../replit_integrations/auth/replitAuth';
import { logger } from '../../logger';

/**
 * Auth provider that delegates to the existing Replit OIDC implementation.
 *
 * `setupAuth` from replitAuth.ts already:
 *   1. Attaches session middleware (connect-pg-simple)
 *   2. Initialises Passport with the OIDC strategy
 *   3. Registers /api/login, /api/callback, /api/logout
 *
 * Because that single function does both session + routes, we call it once
 * lazily and make the second call a no-op.
 */
export class ReplitAuthProvider implements AuthProvider {
  readonly name = 'replit';

  private setupDone = false;

  /**
   * Calls the original `setupAuth` which installs session middleware,
   * Passport, and OIDC routes all in one shot.
   *
   * `setupAuth` is async (it fetches the OIDC discovery document), so we
   * kick it off here and let Express continue — the routes it registers
   * will be ready by the time any request arrives.
   */
  setupSession(app: Express): void {
    if (this.setupDone) return;
    this.setupDone = true;

    // setupAuth is async; fire-and-forget is fine because it only awaits
    // the OIDC discovery call, which resolves well before any user hits
    // the login endpoint.
    setupAuth(app).catch((err) => {
      logger.error(`Failed to initialise OIDC: ${err instanceof Error ? err.message : err}`, 'auth');
      process.exit(1);
    });
  }

  /**
   * No-op — routes are already registered inside `setupSession` via
   * the original `setupAuth` call.
   */
  registerRoutes(_app: Express): void {
    // Replit routes (/api/login, /api/callback, /api/logout) are
    // registered as part of setupAuth, called from setupSession.
  }

  /** Delegates to the existing Replit `isAuthenticated` middleware. */
  isAuthenticated = isAuthenticated;
}
