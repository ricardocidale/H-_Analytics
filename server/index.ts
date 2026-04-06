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
 */
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import { registerRoutes } from "./routes";
import { registerImageRoutes } from "./replit_integrations/image";
import { serveStatic } from "./static";
import { createServer } from "http";
import { authMiddleware, requireAuth, seedAdminUser, cleanupRateLimitMaps } from "./auth";
import { storage } from "./storage";
import { log as serverLog } from "./logger";
import { initSentry, sentryRequestHandler, sentryErrorHandler, setupSentryExpressErrorHandler } from "./sentry";
import {
  COMPRESSION_THRESHOLD_BYTES,
  CACHE_MAX_AGE_SECONDS,
  CACHE_STALE_REVALIDATE_SECONDS,
  HSTS_MAX_AGE_SECONDS,
  MARKET_RATE_REFRESH_INTERVAL_MS,
  SESSION_CLEANUP_INTERVAL_MS,
  MI_CACHE_INVALIDATION_INTERVAL_MS,
  SCENARIO_PURGE_INTERVAL_MS,
} from "./constants";

initSentry();

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.set("trust proxy", 1); // Replit runs behind a reverse proxy
app.use(sentryRequestHandler());
app.use(compression({ threshold: COMPRESSION_THRESHOLD_BYTES }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.ingest.sentry.io https://*.sentry.io https://us.i.posthog.com https://app.posthog.com; media-src 'self' blob:; frame-ancestors 'self' https://*.replit.dev https://*.replit.app https://*.repl.co");
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

// Default-deny: require authentication on all /api/ routes unless explicitly public
const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/admin-login",
  "/api/auth/dev-login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/google",
  "/api/auth/google/callback",
  "/api/auth/google/drive",
  "/api/auth/google/drive/callback",
  "/api/finance/health",
  "/api/health/live",
  "/api/health/ready",
  "/api/health/deep",
]);

const PUBLIC_API_PREFIXES = [
  "/api/public/",
  "/api/letter-logo/",
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
  "/api/companies",
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
  // Migrations and seeds run AFTER the port is open.

  const googleEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"] as const;
  for (const envVar of googleEnvVars) {
    if (process.env[envVar]) {
      serverLog(`${envVar}: set`, "startup", "info");
    } else {
      serverLog(`${envVar}: not set`, "startup", "warn");
    }
  }

  const hasPinecone = !!process.env.PINECONE_API_KEY;
  const hasEmbeddingKey = !!(process.env.OPENAI_EMBEDDING_KEY || process.env.OPENAI_API_KEY);
  if (hasPinecone && hasEmbeddingKey) {
    serverLog("Pinecone + embeddings: ready (knowledge learning active)", "startup", "info");
  } else if (hasPinecone && !hasEmbeddingKey) {
    serverLog("Pinecone: configured but embeddings unavailable — set OPENAI_EMBEDDING_KEY for vector learning. Replit AI integration proxies do not support embedding endpoints.", "startup", "warn");
  } else {
    serverLog("Pinecone: not configured (PINECONE_API_KEY not set)", "startup", "warn");
  }

  registerImageRoutes(app);
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

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
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

      // ── Phase 2: Migrations + seeds (runs after port is open) ────────
      runMigrationsAndSeeds().catch(err => {
        serverLog(`Migrations/seeds failed after retries: ${err instanceof Error ? err.message : err}`, "startup", "error");
      });

      // ── Phase 3: Ambient benchmark scheduler ────────
      import("./ai/ambient/scheduler").then(({ startAmbientScheduler }) => {
        startAmbientScheduler();
      }).catch(err => {
        serverLog(`[ambient-scheduler] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
      });

      // ── Phase 3b: Scheduled research workflow runner ────────
      import("./ai/ambient/research-scheduler").then(({ startResearchScheduler }) => {
        startResearchScheduler();
      }).catch(err => {
        serverLog(`[research-scheduler] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
      });

      // Refresh stale market rates periodically
      setInterval(async () => {
        try {
          const { refreshAllStaleRates } = await import("./data/marketRates");
          const refreshed = await refreshAllStaleRates();
          if (refreshed > 0) log(`Refreshed ${refreshed} stale market rates`);
        } catch (err) {
          serverLog(`[ERROR] [market-rates] Market rate refresh error: ${err instanceof Error ? err.message : err}`);
        }
        try {
          const { getMarketIntelligenceAggregator } = await import("./services/MarketIntelligenceAggregator");
          const aggregator = getMarketIntelligenceAggregator();
          await aggregator.refreshFREDRates();
        } catch (err) {
          serverLog(`[ERROR] [market-rates] FRED refresh error: ${err instanceof Error ? err.message : err}`);
        }
      }, MARKET_RATE_REFRESH_INTERVAL_MS);

      // Clean expired sessions, stale rate-limit entries, and old login logs periodically
      setInterval(async () => {
        try {
          const sessions = await storage.deleteExpiredSessions();
          if (sessions > 0) log(`Cleaned ${sessions} expired sessions`);
          const rateLimits = cleanupRateLimitMaps();
          if (rateLimits > 0) log(`Cleaned ${rateLimits} stale rate-limit entries`);
          const oldLogs = await storage.deleteOldLoginLogs(180);
          if (oldLogs > 0) log(`Cleaned ${oldLogs} login logs older than 180 days`);
        } catch (err) {
          serverLog(`Periodic cleanup error: ${err instanceof Error ? err.message : err}`, "cleanup", "error");
        }
      }, SESSION_CLEANUP_INTERVAL_MS);

      // Invalidate stale property-level MI cache daily so next research regen gets fresh data
      setInterval(async () => {
        try {
          const { cache } = await import("./cache");
          const invalidated = await cache.invalidate("mi:property:*");
          if (invalidated > 0) log(`Invalidated ${invalidated} stale MI cache entries`);
        } catch (err) {
          serverLog(`MI cache invalidation error: ${err instanceof Error ? err.message : err}`, "cache", "error");
        }
      }, MI_CACHE_INVALIDATION_INTERVAL_MS);

      // Purge soft-deleted scenarios past their retention period
      setInterval(async () => {
        try {
          const purged = await storage.purgeExpiredScenarios();
          if (purged > 0) log(`Purged ${purged} expired soft-deleted scenarios`);
        } catch (err) {
          serverLog(`Scenario purge error: ${err instanceof Error ? err.message : err}`, "purge", "error");
        }
      }, SCENARIO_PURGE_INTERVAL_MS);
    },
  );
})();

/**
 * Runs all database migrations and seed operations. Called after the HTTP server
 * is listening so the deployment port-open check succeeds immediately.
 * Errors are caught and logged but do not crash the server.
 */
async function runSchemaMigrations() {
  const { bootstrapDrizzleMigrationState, runDataFixes, isMigrationApplied, markMigrationApplied } = await import("./migrations/consolidated-schema");
  await bootstrapDrizzleMigrationState();

  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { db: drizzleDb } = await import("./db");
  await migrate(drizzleDb, { migrationsFolder: "./migrations" });

  await runDataFixes();

  if (!(await isMigrationApplied("db_hygiene_001"))) {
    const { runDbHygiene001 } = await import("./migrations/db-hygiene-001");
    await runDbHygiene001();
    await markMigrationApplied("db_hygiene_001");
  }

  if (!(await isMigrationApplied("fix_shared_ownership"))) {
    const { fixLegacyOwnership } = await import("./migrations/fix-shared-ownership");
    await fixLegacyOwnership();
    await markMigrationApplied("fix_shared_ownership");
  }

  if (!(await isMigrationApplied("role_partner_to_user_001"))) {
    const { migratePartnerToUser } = await import("./migrations/role-partner-to-user-001");
    await migratePartnerToUser();
    await markMigrationApplied("role_partner_to_user_001");
  }

  if (!(await isMigrationApplied("can_manage_scenarios_001"))) {
    const { runCanManageScenarios001 } = await import("./migrations/can-manage-scenarios-001");
    await runCanManageScenarios001();
    await markMigrationApplied("can_manage_scenarios_001");
  }

  if (!(await isMigrationApplied("appearance_defaults_001"))) {
    const { runAppearanceDefaults001 } = await import("./migrations/appearance-defaults-001");
    await runAppearanceDefaults001();
    await markMigrationApplied("appearance_defaults_001");
  }

  if (!(await isMigrationApplied("fk_hardening_001"))) {
    const { runFkHardening001 } = await import("./migrations/fk-hardening-001");
    await runFkHardening001();
    await markMigrationApplied("fk_hardening_001");
  }

  if (!(await isMigrationApplied("scenario_overrides_001"))) {
    const { runScenarioOverrides001 } = await import("./migrations/scenario-overrides-001");
    await runScenarioOverrides001();
    await markMigrationApplied("scenario_overrides_001");
  }

  if (!(await isMigrationApplied("property_notnull_001"))) {
    const { runPropertyNotNullMigration } = await import("./migrations/property-notnull-001");
    await runPropertyNotNullMigration();
    await markMigrationApplied("property_notnull_001");
  }

  if (!(await isMigrationApplied("scenario_system_unique_001"))) {
    const { runScenarioSystemUnique001 } = await import("./migrations/scenario-system-unique-001");
    await runScenarioSystemUnique001();
    await markMigrationApplied("scenario_system_unique_001");
  }

  if (!(await isMigrationApplied("drop_marcela_columns_001"))) {
    const { runDropMarcelaColumns } = await import("./migrations/drop-marcela-columns");
    await runDropMarcelaColumns();
    await markMigrationApplied("drop_marcela_columns_001");
  }

  if (!(await isMigrationApplied("seed_external_integrations_001"))) {
    const { seedExternalIntegrations } = await import("./migrations/seed-external-integrations");
    await seedExternalIntegrations();
    await markMigrationApplied("seed_external_integrations_001");
  }

  if (!(await isMigrationApplied("photo_image_data_001"))) {
    const { runPhotoImageData001 } = await import("./migrations/photo-image-data-001");
    await runPhotoImageData001();
    await markMigrationApplied("photo_image_data_001");
  }

  if (!(await isMigrationApplied("scenario_access_001"))) {
    const { runScenarioAccess001 } = await import("./migrations/scenario-access-001");
    await runScenarioAccess001();
    await markMigrationApplied("scenario_access_001");
  }
}

async function runSeeds() {
  await seedAdminUser();

  const { seedMissingMarketResearch, seedDefaultLogos, seedUserGroups, seedCompanies, seedFeeCategories, seedServiceTemplates, seedPropertyPhotos, seedGlobalAssumptions, seedMedellinDuplex, seedMedellinDuplexPhotos } = await import("./seed");
  const { seedMarketRates } = await import("./seeds/market-rates");
  const { seedUserCompanyAssignments } = await import("./seeds/users");

  await Promise.all([
    seedMissingMarketResearch(),
    seedMarketRates(),
    seedDefaultLogos(),
    seedUserGroups(),
    seedFeeCategories(),
    seedServiceTemplates(),
    seedPropertyPhotos(),
    seedGlobalAssumptions(),
  ]);

  await seedCompanies();
  await seedUserCompanyAssignments();

  await seedMedellinDuplex();
  await seedMedellinDuplexPhotos();

  const { cleanOrphanedLogos } = await import("./migrations/db-hygiene-001");
  await cleanOrphanedLogos();
}

async function runMigrationsAndSeeds() {
  const startTime = Date.now();

  const { withRetry } = await import("./db");
  await withRetry(() => runSchemaMigrations(), {
    retries: 3,
    baseDelayMs: 2000,
    label: "schema-migrations",
  });

  await withRetry(() => runSeeds(), {
    retries: 2,
    baseDelayMs: 1000,
    label: "seed-data",
  });

  log(`Migrations and seeds completed in ${Date.now() - startTime}ms`);
}
