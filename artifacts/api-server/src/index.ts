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
import { indexKnowledgeBase } from "./ai/knowledge-base";
import { indexAllAssets } from "./ai/asset-intelligence";
import { indexAllMarketResearch } from "./ai/vector-indexing";
import { buildContentSecurityPolicy } from "./csp";
import { getAuthProvider } from "./providers/auth";
import { createServer } from "http";
import { authMiddleware, requireAuth, seedAdminUser, cleanupRateLimitMaps } from "./auth";
import { storage } from "./storage";
import { log as serverLog } from "./logger";
import { hasDbUrl } from "@shared/db-url";
import { sentryRequestHandler, setupSentryExpressErrorHandler } from "./sentry";
import {
  COMPRESSION_THRESHOLD_BYTES,
  CACHE_MAX_AGE_SECONDS,
  CACHE_STALE_REVALIDATE_SECONDS,
  HSTS_MAX_AGE_SECONDS,
  MARKET_RATE_REFRESH_INTERVAL_MS,
  SESSION_CLEANUP_INTERVAL_MS,
  MI_CACHE_INVALIDATION_INTERVAL_MS,
  SCENARIO_PURGE_INTERVAL_MS,
  VECTOR_LATENCY_CHECK_INTERVAL_MS,
  CONSTANTS_REFRESH_DIGEST_INTERVAL_MS,
  PERENNIAL_RECOMMENDATIONS_DIGEST_INTERVAL_MS,
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
  // Migrations and seeds run AFTER the port is open.

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

      // ── Phase 2a: Schema migrations (fatal if they fail — schema integrity matters) ──
      runSchemaMigrationsWithRetry()
        .then(() => {
          // ── Phase 2b: Seeds (non-fatal — server stays up if seeds fail) ──
          // Wrapped in setImmediate so any thrown error cannot escape into a
          // process-killing unhandledRejection during the listen callback.
          setImmediate(() => {
            runSeedsSafely().catch(err => {
              serverLog(
                `Seeds completed with warnings (server continues serving): ${err instanceof Error ? err.message : err}`,
                "startup",
                "warn",
              );
            });
          });

          // ── Phase 2c: Knowledge-base vector indexing ─────────────────────
          // Indexes Rebecca's knowledge base into pgvector if the namespace is
          // empty (first boot or after a re-index wipe). The indexKnowledgeBase()
          // function is idempotent — it skips if vectors already exist.
          setImmediate(() => {
            indexKnowledgeBase()
              .then(result => {
                serverLog(
                  `[knowledge-base] Indexed ${result.chunksIndexed} chunks in ${result.timeMs}ms`,
                  "startup",
                  "info",
                );
                return indexAllAssets();
              })
              .then(assets => {
                if (assets.photos > 0 || assets.logos > 0) {
                  serverLog(
                    `[knowledge-base] Assets indexed: ${assets.photos} photos, ${assets.logos} logos`,
                    "startup",
                    "info",
                  );
                }
                return indexAllMarketResearch();
              })
              .then(research => {
                if (research.indexed > 0) {
                  serverLog(
                    `[market-research] Backfilled ${research.indexed} reports into vector store`,
                    "startup",
                    "info",
                  );
                }
              })
              .catch(err => {
                serverLog(
                  `[knowledge-base] Startup indexing failed (non-fatal): ${err instanceof Error ? err.message : err}`,
                  "startup",
                  "warn",
                );
              });
          });

          // ── Phase 3j: Iris backstage agent scheduler ────────
          // Gated on migration success — Iris reads/writes the iris_runs
          // table introduced in migration 0040. On a cold boot, the
          // scheduler must wait for that migration before its first tick.
          // Daily health check + weekly reindex. Skips if a run is already
          // in progress (concurrency guard via getLatestIrisRun).
          setImmediate(() => {
            import("./ai/ambient/iris-scheduler").then(({ startIrisScheduler }) => {
              startIrisScheduler();
            }).catch(err => {
              serverLog(`[iris-scheduler] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
            });
          });
        })
        .catch(err => {
          serverLog(
            `FATAL: Schema migrations failed: ${err instanceof Error ? err.message : err}`,
            "startup",
            "error",
          );
          process.exit(1);
        });

      // ── Phase 3: Ambient benchmark scheduler ────────
      import("./ai/ambient/scheduler").then(({ startAmbientScheduler }) => {
        startAmbientScheduler();
      }).catch(err => {
        serverLog(`[ambient-scheduler] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
      });

      // ── Phase 3b-Pietro: Pietro data infrastructure scheduler ────────
      import("./ai/ambient/pietro-scheduler").then(({ startPietroScheduler }) => {
        startPietroScheduler();
      }).catch(err => {
        serverLog(`[pietro-scheduler] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
      });

      // ── Phase 3b: Scheduled research workflow runner ────────
      import("./ai/ambient/research-scheduler").then(({ startResearchScheduler }) => {
        startResearchScheduler();
      }).catch(err => {
        serverLog(`[research-scheduler] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
      });

      // ── Phase 3c: Resource health checker (per-kind TTL probes) ────────
      import("./jobs/resource-health-checker").then(({ startResourceHealthChecker }) => {
        startResourceHealthChecker();
      }).catch(err => {
        serverLog(`[resource-health-checker] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
      });

      // ── Phase 3d: Constants research refresher (per-Specialist cadence) ────────
      import("./jobs/specialist-constants-refresh").then(({ startConstantsRefreshScheduler }) => {
        startConstantsRefreshScheduler();
      }).catch(err => {
        serverLog(`[constants-refresh-scheduler] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
      });

      // ── Phase 3e: Nightly Specialist quality-score recompute ────────
      import("./jobs/specialist-quality-recompute").then(({ startSpecialistQualityRecomputeScheduler }) => {
        startSpecialistQualityRecomputeScheduler();
      }).catch(err => {
        serverLog(`[specialist-quality-scheduler] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
      });

      // ── Phase 3f: Photos & Renders specialist scheduled batch (Task #433) ────────
      // Polls `specialist_configs.runtimeConfig.batchSchedule` for
      // `photos.photo-enhancer` and dispatches the engine evaluator
      // across the configured property list at the admin-set cadence.
      import("./jobs/specialist-photos-batch").then(({ startSpecialistPhotosBatchScheduler }) => {
        startSpecialistPhotosBatchScheduler();
      }).catch(err => {
        serverLog(`[specialist-photos-batch-scheduler] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
      });

      // ── Phase 3g: Rebecca preview-fixture replay (Task #559) ────────
      // Daily replay of every saved Rebecca fixture against the current
      // settings; emits drift notifications and updates per-fixture
      // last-run badges in the admin Test Chat panel.
      import("./jobs/rebecca-fixture-replay").then(({ startRebeccaFixtureReplayScheduler }) => {
        startRebeccaFixtureReplayScheduler();
      }).catch(err => {
        serverLog(`[rebecca-fixture-replay-scheduler] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
      });

      // ── Phase 3h: Nightly legacy storage URL audit (Task #534) ────────
      // Walks every text/varchar/jsonb column in `public` for legacy
      // Replit Object Storage URL shapes and emails admins when new bad
      // rows reappear (e.g. via a write path that bypasses the
      // source-side guard).
      import("./jobs/legacy-storage-url-audit").then(({ startLegacyStorageUrlAuditScheduler }) => {
        startLegacyStorageUrlAuditScheduler();
      }).catch(err => {
        serverLog(`[legacy-storage-url-audit] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
      });

      // ── Phase 3i: Nightly hero-photo URL audit (Task #937) ────────
      // Compares each property's `properties.image_url` cache against
      // its album hero (with the resync script's first-photo-by-id
      // fallback) and HEAD-checks the resolved URL. Emails on-call
      // admins with the affected property IDs and current/expected URLs
      // when drift or non-200 responses appear.
      import("./jobs/hero-photo-url-audit").then(({ startHeroPhotoUrlAuditScheduler }) => {
        startHeroPhotoUrlAuditScheduler();
      }).catch(err => {
        serverLog(`[hero-photo-url-audit] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
      });

      const intervalHandles: NodeJS.Timeout[] = [];

      // ── Graceful shutdown handler ────────
      let isShuttingDown = false;
      const shutdown = async (signal: string) => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        serverLog(`Received ${signal}, shutting down gracefully...`, "shutdown", "info");
        for (const h of intervalHandles) clearInterval(h);
        // Stop the Constants refresh scheduler so its hourly tick + startup
        // delay timer don't keep the event loop alive past httpServer.close().
        try {
          const { stopConstantsRefreshScheduler } = await import("./jobs/specialist-constants-refresh");
          stopConstantsRefreshScheduler();
        } catch {
          /* best-effort — module may not have loaded yet */
        }
        try {
          const { stopSpecialistQualityRecomputeScheduler } = await import("./jobs/specialist-quality-recompute");
          stopSpecialistQualityRecomputeScheduler();
        } catch {
          /* best-effort — module may not have loaded yet */
        }
        try {
          const { stopSpecialistPhotosBatchScheduler } = await import("./jobs/specialist-photos-batch");
          stopSpecialistPhotosBatchScheduler();
        } catch {
          /* best-effort — module may not have loaded yet */
        }
        try {
          const { stopRebeccaFixtureReplayScheduler } = await import("./jobs/rebecca-fixture-replay");
          stopRebeccaFixtureReplayScheduler();
        } catch {
          /* best-effort — module may not have loaded yet */
        }
        try {
          const { stopLegacyStorageUrlAuditScheduler } = await import("./jobs/legacy-storage-url-audit");
          stopLegacyStorageUrlAuditScheduler();
        } catch {
          /* best-effort — module may not have loaded yet */
        }
        try {
          const { stopHeroPhotoUrlAuditScheduler } = await import("./jobs/hero-photo-url-audit");
          stopHeroPhotoUrlAuditScheduler();
        } catch {
          /* best-effort — module may not have loaded yet */
        }
        try {
          const { stopIrisScheduler } = await import("./ai/ambient/iris-scheduler");
          stopIrisScheduler();
        } catch {
          /* best-effort — module may not have loaded yet */
        }
        const forceTimer = setTimeout(() => { serverLog("Forced exit after timeout", "shutdown", "error"); process.exit(1); }, 10_000);
        httpServer.close(() => {
          serverLog("HTTP server closed", "shutdown", "info");
          clearTimeout(forceTimer);
          import("./db").then(({ pool }) => {
            pool.end().then(() => process.exit(0)).catch(() => process.exit(1));
          }).catch(() => process.exit(0));
        });
      };
      process.on("SIGTERM", () => shutdown("SIGTERM"));
      process.on("SIGINT", () => shutdown("SIGINT"));

      // Refresh stale market rates periodically
      intervalHandles.push(setInterval(async () => {
        try {
          const { refreshAllStaleRates } = await import("./data/marketRates");
          const refreshed = await refreshAllStaleRates();
          if (refreshed > 0) log(`Refreshed ${refreshed} stale market rates`);
        } catch (err: unknown) {
          serverLog(`[ERROR] [market-rates] Market rate refresh error: ${err instanceof Error ? err.message : err}`);
        }
        try {
          const { getMarketIntelligenceAggregator } = await import("./services/MarketIntelligenceAggregator");
          const aggregator = getMarketIntelligenceAggregator();
          await aggregator.refreshFREDRates();
        } catch (err: unknown) {
          serverLog(`[ERROR] [market-rates] FRED refresh error: ${err instanceof Error ? err.message : err}`);
        }
      }, MARKET_RATE_REFRESH_INTERVAL_MS));

      // Clean expired sessions, stale rate-limit entries, and old login logs periodically
      intervalHandles.push(setInterval(async () => {
        try {
          const sessions = await storage.deleteExpiredSessions();
          if (sessions > 0) log(`Cleaned ${sessions} expired sessions`);
          const rateLimits = cleanupRateLimitMaps();
          if (rateLimits > 0) log(`Cleaned ${rateLimits} stale rate-limit entries`);
          const oldLogs = await storage.deleteOldLoginLogs(180);
          if (oldLogs > 0) log(`Cleaned ${oldLogs} login logs older than 180 days`);
        } catch (err: unknown) {
          serverLog(`Periodic cleanup error: ${err instanceof Error ? err.message : err}`, "cleanup", "error");
        }
      }, SESSION_CLEANUP_INTERVAL_MS));

      // Invalidate stale property-level MI cache daily so next research regen gets fresh data
      intervalHandles.push(setInterval(async () => {
        try {
          const { cache } = await import("./cache");
          const invalidated = await cache.invalidate("mi:property:*");
          if (invalidated > 0) log(`Invalidated ${invalidated} stale MI cache entries`);
        } catch (err: unknown) {
          serverLog(`MI cache invalidation error: ${err instanceof Error ? err.message : err}`, "cache", "error");
        }
      }, MI_CACHE_INVALIDATION_INTERVAL_MS));

      // Purge soft-deleted scenarios past their retention period
      intervalHandles.push(setInterval(async () => {
        try {
          const purged = await storage.purgeExpiredScenarios();
          if (purged > 0) log(`Purged ${purged} expired soft-deleted scenarios`);
        } catch (err: unknown) {
          serverLog(`Scenario purge error: ${err instanceof Error ? err.message : err}`, "purge", "error");
        }
      }, SCENARIO_PURGE_INTERVAL_MS));

      // Email admins when the latest vector benchmark run breaches the
      // p95 latency threshold embedded in docs/vector-bench-history.json
      const runVectorLatencyAlert = async () => {
        try {
          const { evaluateVectorLatencyAlert } = await import("./notifications/vector-latency-alert");
          const result = await evaluateVectorLatencyAlert();
          if (result.status === "ok") {
            log(`Vector latency alert sent to ${result.sent}/${result.recipients} admins (runId=${result.runId})`);
          }
        } catch (err: unknown) {
          serverLog(`Vector latency alert error: ${err instanceof Error ? err.message : err}`, "notifications", "error");
        }
      };
      void runVectorLatencyAlert();
      intervalHandles.push(setInterval(runVectorLatencyAlert, VECTOR_LATENCY_CHECK_INTERVAL_MS));

      // Email admins a daily digest of failed scheduled Constants refreshes
      // (server/jobs/specialist-constants-refresh.ts → research_runs failures).
      // Tick every CONSTANTS_REFRESH_DIGEST_INTERVAL_MS; the evaluator dedupes
      // per UTC day so frequent ticks are safe.
      const runConstantsRefreshDigest = async () => {
        try {
          const { evaluateConstantsRefreshFailureDigest } = await import("./notifications/constants-refresh-failure-digest");
          const result = await evaluateConstantsRefreshFailureDigest();
          if (result.status === "ok") {
            log(`Constants refresh failure digest sent to ${result.sent}/${result.recipients} admins (failures=${result.failures}, digestKey=${result.digestKey})`);
          }
        } catch (err: unknown) {
          serverLog(`Constants refresh digest error: ${err instanceof Error ? err.message : err}`, "notifications", "error");
        }
      };
      void runConstantsRefreshDigest();
      intervalHandles.push(setInterval(runConstantsRefreshDigest, CONSTANTS_REFRESH_DIGEST_INTERVAL_MS));

      // Email admins a daily digest of perennial Specialist recommendations
      // (candidate fields with appearances >= 3 AND lastPromotedAt IS NULL).
      // Tick every PERENNIAL_RECOMMENDATIONS_DIGEST_INTERVAL_MS; the
      // evaluator dedupes per UTC day so frequent ticks are safe.
      const runPerennialRecommendationsDigest = async () => {
        try {
          const { evaluatePerennialRecommendationsDigest } = await import("./notifications/perennial-recommendations-digest");
          const result = await evaluatePerennialRecommendationsDigest();
          if (result.status === "ok") {
            log(`Perennial recommendations digest sent to ${result.sent}/${result.recipients} admins (offenders=${result.offenders}, digestKey=${result.digestKey})`);
          }
        } catch (err: unknown) {
          serverLog(`Perennial recommendations digest error: ${err instanceof Error ? err.message : err}`, "notifications", "error");
        }
      };
      void runPerennialRecommendationsDigest();
      intervalHandles.push(setInterval(runPerennialRecommendationsDigest, PERENNIAL_RECOMMENDATIONS_DIGEST_INTERVAL_MS));
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

  // Resolve the drizzle migrations folder robustly across platforms:
  //   - Railway/Docker: Dockerfile copies migrations to /app/migrations,
  //     and cwd is /app, so "./migrations" works.
  //   - Replit deploy: cwd is repo root; migrations live at
  //     artifacts/api-server/migrations.
  //   - Local dev (`pnpm --filter @workspace/api-server run dev`): cwd is
  //     the artifact dir, so "./migrations" works.
  // We probe a list of candidates and use the first one whose
  // meta/_journal.json exists (drizzle's required entrypoint).
  const { existsSync } = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const bundleDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationCandidates = [
    path.resolve(bundleDir, "../migrations"),                               // dist/../migrations  → artifacts/api-server/migrations
    path.resolve(process.cwd(), "migrations"),                              // /app/migrations (Docker/Railway)
    path.resolve(process.cwd(), "artifacts/api-server/migrations"),         // repo-root cwd (Replit deploy)
  ];
  const migrationsFolder = migrationCandidates.find(
    (p) => existsSync(path.join(p, "meta", "_journal.json")),
  );
  if (!migrationsFolder) {
    throw new Error(
      `drizzle migrations folder not found; checked: ${migrationCandidates.join(", ")}`,
    );
  }
  await migrate(drizzleDb, { migrationsFolder });

  const { withRetry } = await import("./db");
  await withRetry(() => runDataFixes(), {
    retries: 3,
    baseDelayMs: 2000,
    label: "data-fixes",
  });

  // db_hygiene_001, fix_shared_ownership, role_partner_to_user_001,
  // role_checker_investor_to_user_001, property_notnull_001 consolidated into
  // 0037_batch8_datafix_and_unique.sql (Phase C batch 8)

  // can_manage_scenarios_001, fk_hardening_001, scenario_overrides_001
  // consolidated into 0036_batch7_pure_ddl.sql (Phase C batch 7)

  // appearance_defaults_001 consolidated into 0034_batch6_ga_columns.sql (Phase C batch 6)

  // scenario_system_unique_001 consolidated into 0036_batch7_pure_ddl.sql (Phase C batch 7)

  // seed_external_integrations_001 → moved to runSeeds() seedTasks (idempotent: skips if rows exist)

  // photo_image_data_001, scenario_access_001, source_call_logs_001, property_urls_001
  // consolidated into 0036_batch7_pure_ddl.sql (Phase C batch 7)

  // drop_engine_suggested_lines_001 consolidated into 0031_batch2_drops.sql (Phase C batch 2)

  // enhanced_photo_001 consolidated into 0030_phase_c_batch_1.sql (Phase C batch 1)

  // rebecca_guardrails_001 → moved to runSeeds() seedTasks (ON CONFLICT DO NOTHING)
  // rebecca_kb_001 → moved to runSeeds() seedTasks (skips if rows exist)

  // rebecca_language_001 consolidated into 0030_phase_c_batch_1.sql (Phase C batch 1)

  // calc_audit_001, admin_resources_001, admin_resources_002, admin_resources_003,
  // property_dd_001 consolidated into 0036_batch7_pure_ddl.sql (Phase C batch 7)

  // admin_resources_004 → moved to runSeeds() seedTasks (ON CONFLICT DO NOTHING)

  // specialist_observed_missing_001, specialist_recommendation_events_001,
  // specialist_recommendation_counters_001 consolidated into
  // 0033_batch4_specialists.sql (Phase C batch 4)

  // specialist_multi_model_001 — columns now owned by Drizzle migration
  // 0022_specialist_llm_overrides.sql. Runtime patch removed; existing DBs
  // have the migration key recorded in _applied_migrations.

  // pipeline_n1_global_models_001, vector_chunks_gin_001 consolidated into
  // 0036_batch7_pure_ddl.sql (Phase C batch 7)

  // admin_resources_005 → moved to runSeeds() seedTasks (ON CONFLICT DO NOTHING)

  // properties_financials_computed_at_001 consolidated into
  // 0035_batch5_standalone_tables.sql (Phase C batch 5)

  // financials_computed_at_backfill_001, app_logo_001 consolidated into
  // 0037_batch8_datafix_and_unique.sql (Phase C batch 8)

  // scenario_service_templates_001 consolidated: its DDL (ADD COLUMN service_templates
  // on scenarios) was already shipped via 0010_scenario_service_templates.sql in the
  // Drizzle migration path. Runtime gate removed as part of Phase C batch 1.

  // drop_company_fk_001 consolidated into 0038_batch9_drop_company_fk.sql (Phase C batch 9)

  // rebecca_opt_out_001, rebecca_fixtures_001 consolidated into
  // 0032_batch3_rebecca.sql (Phase C batch 3)

  // app_name_001 consolidated into 0030_phase_c_batch_1.sql (Phase C batch 1)

  // market_data_tables_001 consolidated into 0035_batch5_standalone_tables.sql (Phase C batch 5)

  // index_coverage_001 consolidated into 0036_batch7_pure_ddl.sql (Phase C batch 7)

  // scheduler_runs_001, scheduler_runs_002, storage_drift_sweep_runs_001
  // consolidated into 0035_batch5_standalone_tables.sql (Phase C batch 5)

  // rebecca_fixture_replay_001 consolidated into 0032_batch3_rebecca.sql (Phase C batch 3)

  // assumption_guidance_dedupe_001, benchmark_snapshots_unique_001,
  // audit_unique_constraints_001 consolidated into
  // 0037_batch8_datafix_and_unique.sql (Phase C batch 8)

  // funding_cascade_001 consolidated into 0034_batch6_ga_columns.sql (Phase C batch 6)

  // cache_entries_001, reference_range_001 consolidated into
  // 0035_batch5_standalone_tables.sql (Phase C batch 5)

  // icp_model_tier_001 consolidated into 0030_phase_c_batch_1.sql (Phase C batch 1)

  // fk_indexes_002 consolidated into 0036_batch7_pure_ddl.sql (Phase C batch 7)

  // property_slide_decks_001, property_slide_decks_002, reference_brands_001,
  // property_photos_hero_unique_001, reference_brands_run_fk_001,
  // property_slide_deck_variants_001 → consolidated into
  // 0029_batch10_slide_decks_and_constraints.sql (Phase C batch 10)

  // slide_recipe_001 → moved to runSeeds() seedTasks (skips if rows exist)

  if (!(await isMigrationApplied("sync_property_assumptions_001"))) {
    const { runSyncPropertyAssumptions001 } = await import("./migrations/sync-property-assumptions-001");
    await runSyncPropertyAssumptions001();
    await markMigrationApplied("sync_property_assumptions_001");
  }

  // Task #919 — backfill `users.google_drive_connected` on production. The
  // legacy bootstrap pre-marked Drizzle migration 0005 as applied without
  // running it, and this column is the only DDL artifact from 0005–0027
  // that the Phase D audit found genuinely missing on prod. Idempotent
  // ADD COLUMN IF NOT EXISTS — safe no-op on any DB that already has it.
  if (!(await isMigrationApplied("users_google_drive_connected_001"))) {
    const { runUsersGoogleDriveConnected001 } = await import("./migrations/users-google-drive-connected-001");
    await runUsersGoogleDriveConnected001();
    await markMigrationApplied("users_google_drive_connected_001");
  }

  // Task #971 — missing FK indexes. Uses CREATE INDEX CONCURRENTLY (which
  // cannot run inside a transaction), so it lives here as a runtime patch
  // rather than as a numbered Drizzle SQL migration. Idempotent.
  if (!(await isMigrationApplied("fk_indexes_003"))) {
    const { runFkIndexes003 } = await import("./migrations/fk-indexes-003");
    const { allApplied } = await runFkIndexes003();
    // Only mark applied when every target index was created. If a table was
    // skipped (e.g. rebecca_context_contract_turns provisioned later by
    // rebecca-context-contract-001), retry on the next boot rather than
    // silently masking schema drift.
    if (allApplied) {
      await markMigrationApplied("fk_indexes_003");
    }
  }
}

async function runSeeds() {
  await seedAdminUser();

  const { seedMissingMarketResearch, seedDefaultLogos, seedCompanies, seedFeeCategories, seedServiceTemplates, seedPropertyPhotos, seedGlobalAssumptions, seedMedellinDuplex, seedMedellinDuplexPhotos } = await import("./seed");
  const { seedMarketRates } = await import("./seeds/market-rates");
  const { seedMarketDataTables } = await import("./seeds/market-data-tables");
  const { seedProductionSql } = await import("./seeds/production-sql");
  const { seedModelConstants } = await import("../script/seed-model-constants");
  const { seedModelDefaults } = await import("../script/seed-model-defaults");

  // Canonical production-sync SQL — gated by content hash via _applied_migrations,
  // so it runs exactly once per unique seed-production.sql file content. After a
  // first successful apply, subsequent boots are no-ops; regenerating the file
  // (next deploy) will run it again. Runs BEFORE the smaller idempotent seeds so
  // those see the canonical baseline.
  //
  // Production-only by default: the SQL contains DELETE statements scoped to the
  // canonical property ID list (32, 33, 35, 39, 41, 43) and would wipe extra
  // dev-only properties on first boot if run against the dev DB. Set
  // FORCE_RUN_PRODUCTION_SEED=true to apply it in non-production environments.
  const isProductionEnv = process.env.NODE_ENV === "production";
  const shouldRunProductionSql =
    isProductionEnv || process.env.FORCE_RUN_PRODUCTION_SEED === "true";
  if (shouldRunProductionSql) {
    try {
      const result = await seedProductionSql();
      serverLog(`[seed:production-sql] ${result.status}`, "startup", "info");
      // Fail-closed in production: if the canonical SQL was not applied or
      // could not be located, abort boot so downstream idempotent seeds do
      // not run on a non-canonical baseline.
      if (
        isProductionEnv &&
        result.status === "skipped-not-found"
      ) {
        serverLog(
          `[seed:production-sql] FATAL in production: seed-production.sql not located in dist/ or script/ — aborting boot to preserve canonical baseline`,
          "startup",
          "error",
        );
        process.exit(1);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      serverLog(`[seed:production-sql] FAILED: ${msg}`, "startup", "error");
      if (isProductionEnv) {
        serverLog(
          `[seed:production-sql] FATAL in production — aborting boot to preserve canonical baseline`,
          "startup",
          "error",
        );
        process.exit(1);
      }
    }
  } else {
    serverLog(
      `[seed:production-sql] skipped (NODE_ENV=${process.env.NODE_ENV ?? "unset"}, set FORCE_RUN_PRODUCTION_SEED=true to override)`,
      "startup",
      "info",
    );
  }

  // Each seed is isolated — one failure does not cancel the others.
  // All seeds are idempotent (skip-if-exists semantics) so partial completion
  // on cold start is safe; the next boot will fill in whatever was missed.
  const seedTasks: Array<{ name: string; run: () => Promise<unknown> }> = [
    { name: "missing-market-research", run: seedMissingMarketResearch },
    { name: "market-rates", run: seedMarketRates },
    { name: "market-data-tables", run: seedMarketDataTables },
    { name: "reference-ranges",   run: async () => { const { seedReferenceRanges } = await import("./seeds/reference-ranges"); await seedReferenceRanges(); } },
    { name: "default-logos", run: seedDefaultLogos },
    { name: "brand-asset-logos", run: async () => { const { seedBrandAssetLogos } = await import("./seed"); await seedBrandAssetLogos(); } },
    { name: "fee-categories", run: seedFeeCategories },
    { name: "service-templates", run: seedServiceTemplates },
    { name: "property-photos", run: seedPropertyPhotos },
    { name: "global-assumptions", run: seedGlobalAssumptions },
    // Pure idempotent upserts of authority-dictated constants and Steady-State
    // defaults from shared/constants.ts. Safe to run on every boot.
    { name: "model-constants", run: () => seedModelConstants({ silent: true }) },
    { name: "model-defaults", run: () => seedModelDefaults({ silent: true }) },
    { name: "reference-brands", run: async () => { const result = await storage.seedReferenceBrandsIfEmpty(); if (result.seeded) serverLog(`[seed:reference-brands] seeded ${result.count} brands`, "startup", "info"); } },
    { name: "external-integrations", run: async () => { const { seedExternalIntegrations } = await import("./migrations/seed-external-integrations"); await seedExternalIntegrations(); } },
    { name: "rebecca-guardrails", run: async () => { const { runRebeccaGuardrails001 } = await import("./migrations/rebecca-guardrails-001"); await runRebeccaGuardrails001(); } },
    { name: "rebecca-kb", run: async () => { const { runRebeccaKB001 } = await import("./migrations/rebecca-kb-001"); await runRebeccaKB001(); } },
    { name: "admin-resources-004", run: async () => { const { runAdminResources004 } = await import("./migrations/admin-resources-004"); await runAdminResources004(); } },
    { name: "admin-resources-005", run: async () => { const { runAdminResources005 } = await import("./migrations/admin-resources-005"); await runAdminResources005(); } },
    { name: "rebecca-rail-open", run: async () => { const { runRebeccaRailOpen001 } = await import("./migrations/rebecca-rail-open-001"); await runRebeccaRailOpen001(); } },
    { name: "rebecca-chat-prefs", run: async () => { const { runRebeccaChatPrefs001 } = await import("./migrations/rebecca-chat-prefs-001"); await runRebeccaChatPrefs001(); } },
    { name: "rebecca-history-chips", run: async () => { const { runRebeccaHistoryChips001 } = await import("./migrations/rebecca-history-chips-001"); await runRebeccaHistoryChips001(); } },
    { name: "knowledge-registry", run: async () => { const { seedKnowledgeRegistry } = await import("./seeds/knowledge-registry"); await seedKnowledgeRegistry(); } },
    { name: "country-economic-data", run: async () => { const { seedCountryEconomicDataIfEmpty } = await import("./seeds/knowledge-registry"); await seedCountryEconomicDataIfEmpty(); } },
  ];

  // Pietro schema DDL guards must run sequentially BEFORE the parallel fan-out.
  // admin-resources-006 adds the daily_request_budget column; pietro-resources-001
  // inserts rows referencing that column. Running them in the same Promise.allSettled
  // batch races the ALTER TABLE against the INSERT on a fresh DB.
  // Pietro schema DDL — run sequentially and rethrow on failure.
  // These are schema repairs, not optional seeds: a failure here means the
  // Pietro tables or column don't exist, which will break every subsequent
  // Pietro minion dispatch. Boot should surface this loudly rather than
  // continuing with a broken schema.
  for (const ddlTask of [
    { name: "admin-resources-006", run: async () => { const { runAdminResources006 } = await import("./migrations/admin-resources-006"); await runAdminResources006(); } },
    { name: "admin-resources-007", run: async () => { const { runAdminResources007 } = await import("./migrations/admin-resources-007"); await runAdminResources007(); } },
    { name: "pietro-tables-001",   run: async () => { const { runPietroTables001 }   = await import("./migrations/pietro-tables-001");   await runPietroTables001();   } },
    { name: "pietro-resources-001",run: async () => { const { runPietroResources001 }= await import("./migrations/pietro-resources-001"); await runPietroResources001(); } },
    { name: "pietro-research-catalog-001", run: async () => { const { runPietroResearchCatalog001 } = await import("./migrations/pietro-research-catalog-001"); await runPietroResearchCatalog001(); } },
  ]) {
    await ddlTask.run();
  }

  const results = await Promise.allSettled(seedTasks.map(t => t.run()));
  results.forEach((r, i) => {
    const name = seedTasks[i].name;
    if (r.status === "rejected") {
      // Surface seed/migration failures at error level — these previously
      // logged as "skipped … will retry next boot" warnings, which let real
      // schema drift (e.g. a missing column) hide in the dev workflow log
      // until the first request blew up. The schema probe below is the
      // safety net, but the error log makes the cause obvious.
      serverLog(
        `[seed:${name}] FAILED (will retry next boot): ${r.reason instanceof Error ? r.reason.message : r.reason}`,
        "startup",
        "error",
      );
    } else {
      serverLog(`[seed:${name}] ok`, "startup", "info");
    }
  });

  // Auto-heal / drift detector. Runs after the idempotent seed/migration
  // steps so any newly-added column has a chance to be created normally;
  // if a known column is still missing (e.g. the rebecca-rail-open seed
  // failed silently against the dev DB), the probe runs the healing
  // ALTER itself. If a required column is missing and we have no heal
  // for it, boot aborts loudly instead of letting login queries 500.
  try {
    const { runSchemaProbe } = await import("./migrations/schema-probe");
    await runSchemaProbe();
    serverLog(`[seed:schema-probe] ok`, "startup", "info");
  } catch (err: unknown) {
    serverLog(
      `[seed:schema-probe] FAILED: ${err instanceof Error ? err.message : String(err)}`,
      "startup",
      "error",
    );
    // Schema drift is fatal — refuse to start the API on a broken schema.
    process.exit(1);
  }

  await seedCompanies().catch(err => {
    serverLog(`[seed:companies] skipped: ${err instanceof Error ? err.message : err}`, "startup", "warn");
  });

  await seedMedellinDuplex().catch(err => {
    serverLog(`[seed:medellin-duplex] skipped: ${err instanceof Error ? err.message : err}`, "startup", "warn");
  });
  await seedMedellinDuplexPhotos().catch(err => {
    serverLog(`[seed:medellin-duplex-photos] skipped: ${err instanceof Error ? err.message : err}`, "startup", "warn");
  });

  try {
    const { cleanOrphanedLogos } = await import("./migrations/db-hygiene-001");
    await cleanOrphanedLogos();
  } catch (err: unknown) {
    serverLog(`[seed:clean-orphaned-logos] skipped: ${err instanceof Error ? err.message : err}`, "startup", "warn");
  }

  // Light up the Sources tab on every Specialist page from the in-code
  // Specialist catalog. Idempotent: re-running is a no-op when the catalog
  // hasn't changed and every assignment slug is already resolved. Runs
  // here (not as a one-shot migration) because production DBs can ship
  // with empty `specialist_assignments` tables — the original
  // admin-resources-004 seed step has nothing to copy from until catalog
  // sync has run at least once. Keeping this in the seed phase means
  // every cold start re-resolves catalog → connections without manual
  // admin action. (Task #507.)
  try {
    const { backfillCatalogConnections } = await import("./jobs/catalog-sync");
    const result = await backfillCatalogConnections();
    serverLog(
      `[seed:catalog-connections] catalog ${result.inserted}+/${result.updated}~/${result.removed}- · ${result.connectionsInserted} new connection(s)`,
      "startup",
      "info",
    );
  } catch (err: unknown) {
    serverLog(
      `[seed:catalog-connections] skipped (will retry next boot): ${err instanceof Error ? err.message : err}`,
      "startup",
      "warn",
    );
  }

  indexPropertiesToVectorStoreAsync();
}

// ── Boot orchestration: schema migrations (fatal) ─────────────────────
async function runSchemaMigrationsWithRetry(): Promise<void> {
  const { withRetry } = await import("./db");
  await withRetry(() => runSchemaMigrations(), {
    retries: 3,
    baseDelayMs: 2000,
    label: "schema-migrations",
  });
}

// ── Boot orchestration: seeds (non-fatal, single-replica) ──
// Uses a Postgres session-level advisory lock so that when Autoscale spins up
// multiple replicas, only one runs the seed phase. Other replicas log and skip.
// We deliberately do NOT impose a hard timeout that releases the lock early:
// releasing the lock while runSeeds() is still in flight would let a second
// replica start a concurrent seed pass, defeating the single-replica guarantee.
// If seeds genuinely run long, we log a soft-warning at SEED_SLOW_WARN_MS but
// keep awaiting the real promise. The server is already serving traffic
// (this whole function runs inside setImmediate after the port is open).
const SEED_ADVISORY_LOCK_KEY = 7244911300; // arbitrary stable bigint, app-specific
const SEED_SLOW_WARN_MS = 90_000;

async function runSeedsSafely(): Promise<void> {
  const startTime = Date.now();
  const { pool } = await import("./db");
  const client = await pool.connect();
  let lockAcquired = false;
  let slowWarnTimer: NodeJS.Timeout | undefined;
  try {
    const lockResult = await client.query<{ pg_try_advisory_lock: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS pg_try_advisory_lock",
      [SEED_ADVISORY_LOCK_KEY],
    );
    lockAcquired = lockResult.rows[0]?.pg_try_advisory_lock === true;

    if (!lockAcquired) {
      serverLog("Another replica holds the seed lock — skipping seeds on this instance", "startup", "info");
      return;
    }

    slowWarnTimer = setTimeout(() => {
      serverLog(
        `Seed phase still running after ${SEED_SLOW_WARN_MS}ms — server continues serving (lock held)`,
        "startup",
        "warn",
      );
    }, SEED_SLOW_WARN_MS);

    await runSeeds();
    log(`Migrations and seeds completed in ${Date.now() - startTime}ms`);
  } finally {
    if (slowWarnTimer) clearTimeout(slowWarnTimer);
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [SEED_ADVISORY_LOCK_KEY]);
      } catch {
        // best-effort unlock; advisory locks auto-release on session close
      }
    }
    client.release();
  }
}

function indexPropertiesToVectorStoreAsync() {
  (async () => {
    try {
      const { indexPropertyProfile } = await import("./ai/vector-store-service");
      const { properties: propertiesTable } = await import("@workspace/db");
      const { db: database } = await import("./db");
      const allProps = await database.select().from(propertiesTable);
      for (const p of allProps) {
        await indexPropertyProfile({
          propertyId: p.id,
          name: p.name ?? "Unnamed Property",
          location: [p.city, p.stateProvince, p.country].filter(Boolean).join(", "),
          propertyType: "hotel",
          roomCount: p.roomCount ?? null,
          status: p.status ?? "active",
          purchasePrice: p.purchasePrice ?? null,
          market: p.market ?? null,
          description: p.description ?? null,
          streetAddress: p.streetAddress ?? null,
        });
      }
      if (allProps.length > 0) {
        log(`Indexed ${allProps.length} property profiles to vector store`);
      }
    } catch (err: unknown) {
      log(`Vector store property indexing failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();
}

