/**
 * server/index.ts — Application Entry Point
 *
 * This is the main startup file for the Express server. It wires together every
 * layer of the backend in the correct order:
 *
 *   1. Security headers (CSP, HSTS, X-Frame-Options, etc.)
 *   2. Body parsing (JSON + URL-encoded, with raw body preserved for webhooks)
 *   3. Cookie-based session authentication middleware
 *   4. Default-deny authorization: every /api/ route requires a valid session
 *      unless it's on the explicit PUBLIC_API_PATHS whitelist
 *   5. Request logging (method, path, status, duration) for all /api/ calls
 *   6. Seed data: admin user, logos, companies, user groups, fee categories,
 *      and missing market research records are created on first boot
 *   7. Route registration: image routes, API routes, object storage, chat, etc.
 *   8. Error handler (hides internal details in production)
 *   9. Static file serving (production) or Vite dev server (development)
 *  10. Periodic cleanup: expired sessions and stale rate-limit entries every hour
 *
 * The server listens on the PORT environment variable (default 5000). This single
 * port serves both the API and the client SPA — it is the only port not firewalled.
 *
 * After the port opens, Phases 2–4 (migrations, seeds, schedulers, interval jobs,
 * graceful shutdown) are delegated to boot.ts via runBootSequence(httpServer).
 */
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import { registerRoutes } from "./legacyRoutes";
import { registerImageRoutes } from "./routes/images";
import { propertySlidesRouter } from "./routes/property-slides";
import { propertyDeckPdfRouter } from "./routes/property-deck-pdf";
import { propertyDeckSlideRouter } from "./routes/property-deck-slide";
import { internalDeckPayloadRouter } from "./routes/internal-deck-payload";
import { internalLbDeckPayloadRouter } from "./routes/internal-lb-deck-payload";
import { propertyDeckPayloadRouter } from "./routes/property-deck-payload";
import { lbDeckPdfRouter } from "./routes/lb-deck-pdf";
import { slideFactoryRouter } from "./routes/slide-factory";
import { registerSlideFactorySuggestRoutes } from "./routes/slide-factory-suggest";
import { buildContentSecurityPolicy } from "./csp";
import { getAuthProvider } from "./providers/auth";
import { createServer } from "http";
import { authMiddleware, requireAuth } from "./auth";
import { csrfGuardForAdminWrites, type CsrfMode } from "./middleware/csrf";
import { log as serverLog } from "./logger";
import { hasDbUrl } from "@shared/db-url";
import { sentryRequestHandler, setupSentryExpressErrorHandler } from "./sentry";
import { runBootSequence } from "./boot";
import {
  COMPRESSION_THRESHOLD_BYTES,
  CACHE_MAX_AGE_SECONDS,
  CACHE_STALE_REVALIDATE_SECONDS,
  HSTS_MAX_AGE_SECONDS,
} from "./constants";

const contentSecurityPolicy = buildContentSecurityPolicy();

// Sentry.init() runs from ./instrument.ts via `node --import` BEFORE express
// is loaded — see that file for the rationale. Do not call initSentry() here.

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.set("trust proxy", 1); // Replit runs behind a reverse proxy
app.disable("x-powered-by");
app.use(sentryRequestHandler());
app.use(compression({ threshold: COMPRESSION_THRESHOLD_BYTES }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  res.setHeader("Content-Security-Policy", contentSecurityPolicy);
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`);
  }
  next();
});

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(authMiddleware);

// CSRF coverage for admin write routes (POST/PUT/PATCH/DELETE on /api/admin/*).
// Mode is "report" during rollout: missing/invalid tokens are logged but
// requests pass through so that raw-fetch callsites in the frontend can be
// surfaced and migrated to `apiRequest` without breaking admin tabs. Flip to
// "enforce" in a follow-up PR once the report logs are clean.
const CSRF_MODE: CsrfMode = "report";
app.use(csrfGuardForAdminWrites({ mode: CSRF_MODE }));

// Wire the auth provider abstraction (Replit OIDC or local password-based,
// selected by AUTH_PROVIDER env var, defaults to 'replit').
// setupSession adds provider-specific session middleware (e.g. Passport + OIDC).
// registerRoutes adds provider-specific auth endpoints (e.g. /api/login, /api/callback).
// The custom authMiddleware above handles our own cookie-based sessions and runs
// regardless of provider — both systems coexist.
const authProvider = getAuthProvider();
authProvider.setupSession(app);
authProvider.registerRoutes(app);

// Default-deny: require authentication on all /api/ routes unless explicitly public
const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/admin-login",
  "/api/auth/dev-login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/google",
  "/api/auth/google/callback",
  "/api/finance/health",
  "/api/health/live",
  "/api/health/ready",
  "/api/health/deep",
]);

const PUBLIC_API_PREFIXES = [
  "/api/public/",
  "/api/letter-logo/",
  "/api/media/",
  "/api/internal/",
  "/api/brand-assets/",
];

app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.path.startsWith("/api")) return next();
  if (PUBLIC_API_PATHS.has(req.path)) return next();
  if (PUBLIC_API_PREFIXES.some(p => req.path.startsWith(p))) return next();
  return requireAuth(req, res, next);
});

export function log(message: string, source = "express") {
  serverLog(message, source);
}

// Cache-Control for stable, rarely-changing GET endpoints
const CACHEABLE_PATHS = new Set([
  "/api/logos",
  "/api/design-themes",
  "/api/documents/templates",
]);
app.use((req, res, next) => {
  if (req.method === "GET" && CACHEABLE_PATHS.has(req.path)) {
    res.setHeader("Cache-Control", `private, max-age=${CACHE_MAX_AGE_SECONDS}, stale-while-revalidate=${CACHE_STALE_REVALIDATE_SECONDS}`);
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const responseSize = res.getHeader("content-length") || "unknown";
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms :: ${responseSize} bytes`);
    }
  });

  next();
});

(async () => {
  // ── Phase 1: Register routes and open port FAST ──────────────────────
  // The deployment platform requires the port to open within ~60s.
  // Migrations and seeds run AFTER the port is open (see boot.ts).

  const googleEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"] as const;
  for (const envVar of googleEnvVars) {
    if (process.env[envVar]) {
      serverLog(`${envVar}: set`, "startup", "info");
    } else {
      serverLog(`${envVar}: not set`, "startup", "warn");
    }
  }

  const hasVectorStore = hasDbUrl();
  const hasEmbeddingKey = !!(process.env.OPENAI_EMBEDDING_KEY || process.env.OPENAI_API_KEY);
  if (hasVectorStore && hasEmbeddingKey) {
    serverLog("Vector store (pgvector) + embeddings: ready (knowledge learning active)", "startup", "info");
  } else if (hasVectorStore && !hasEmbeddingKey) {
    serverLog("Vector store: configured but embeddings unavailable — set OPENAI_EMBEDDING_KEY for vector learning. Replit AI integration proxies do not support embedding endpoints.", "startup", "warn");
  } else {
    serverLog("Vector store: POSTGRES_URL/DATABASE_URL not set — vector indexing disabled", "startup", "warn");
  }

  const { initStorageProvider } = await import("./providers/storage");
  await initStorageProvider();

  registerImageRoutes(app);
  app.use(propertySlidesRouter);
  app.use(propertyDeckPdfRouter);
  app.use(propertyDeckSlideRouter);
  app.use(internalDeckPayloadRouter);
  app.use(internalLbDeckPayloadRouter);
  app.use(propertyDeckPayloadRouter);
  app.use(lbDeckPdfRouter);
  app.use(slideFactoryRouter);
  registerSlideFactorySuggestRoutes(app);
  const { registerGoogleAuthRoutes } = await import("./routes/google-auth");
  registerGoogleAuthRoutes(app);
  await registerRoutes(httpServer, app);

  setupSentryExpressErrorHandler(app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = process.env.NODE_ENV === "production" && status >= 500
      ? "Internal Server Error"
      : err.message || "Internal Server Error";

    serverLog(`Internal Server Error: ${err instanceof Error ? err.message : err}`, "server", "error");

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ error: message });
  });

  if (process.env.NODE_ENV === "production") {
    const { serveStatic } = await import("./static");
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      runBootSequence(httpServer, app);
    },
  );
})();
