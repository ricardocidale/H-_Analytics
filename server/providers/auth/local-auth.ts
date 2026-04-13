import type { Express, Request, Response, NextFunction } from 'express';
import type { AuthProvider } from './types';
import { getSession } from '../../replit_integrations/auth/replitAuth';

/**
 * Auth provider for running the app without Replit.
 *
 * Session management reuses the same connect-pg-simple store that the Replit
 * provider uses (it is NOT Replit-specific — just a Postgres-backed session).
 *
 * Password-based login/logout routes are registered elsewhere in
 * server/routes.ts, so `registerRoutes` is intentionally a no-op.
 *
 * `isAuthenticated` performs a simple `req.isAuthenticated()` check — there
 * is no OIDC token refresh logic because local auth uses long-lived sessions.
 */
export class LocalAuthProvider implements AuthProvider {
  readonly name = 'local';

  /**
   * Attaches the Postgres-backed express-session middleware.
   * This is the same session store the Replit provider uses.
   */
  setupSession(app: Express): void {
    app.set('trust proxy', 1);
    app.use(getSession());
  }

  /**
   * No-op — password login/logout routes are already registered in
   * server/routes.ts via the existing route modules.
   */
  registerRoutes(_app: Express): void {
    // Nothing to do; password auth routes live in server/routes.ts.
  }

  /**
   * Simple session-based authentication check.
   * Unlike the Replit provider, there are no OIDC tokens to refresh.
   */
  isAuthenticated(req: Request, res: Response, next: NextFunction): void {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    next();
  }
}
