import type { Express, RequestHandler } from 'express';

export interface AuthProvider {
  /** Provider name for logging */
  readonly name: string;

  /** Set up session middleware on the Express app */
  setupSession(app: Express): void;

  /** Register auth routes (login, callback, logout) on the Express app */
  registerRoutes(app: Express): void;

  /** Middleware that checks if request is authenticated */
  isAuthenticated: RequestHandler;
}
