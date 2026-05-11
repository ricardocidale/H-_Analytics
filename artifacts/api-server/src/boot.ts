/**
 * server/boot.ts — Phases 2–4 async startup sequence
 *
 * Called once from the httpServer.listen() callback in index.ts after the port
 * is open. Fires off all post-open background work in order:
 *
 *   2a. Schema migrations (fatal — process.exit(1) on failure)
 *   2b. Seeds (non-fatal, single-replica advisory lock)
 *   2c. Knowledge-base / asset / market-research vector indexing
 *   3.  Ambient schedulers (benchmark, Pietro, research, health, constants,
 *       quality, photos, Rebecca, legacy-storage, hero-photo, Vito, Costantino)
 *   4.  Periodic interval jobs + graceful shutdown handler
 *
 * Migration and seed helpers live in startup/migrations.ts and startup/seeds.ts
 * respectively to keep this file focused and within the 400-line target.
 */
import type { Server } from "http";
import { indexKnowledgeBase } from "./ai/knowledge-base";
import { indexAllAssets } from "./ai/asset-intelligence";
import { indexAllMarketResearch } from "./ai/vector-indexing";
import { cleanupRateLimitMaps } from "./auth";
import { storage } from "./storage";
import { log as serverLog } from "./logger";
import { runSchemaMigrationsWithRetry } from "./startup/migrations";
import { runSeedsSafely } from "./startup/seeds";
import {
  MARKET_RATE_REFRESH_INTERVAL_MS,
  SESSION_CLEANUP_INTERVAL_MS,
  MI_CACHE_INVALIDATION_INTERVAL_MS,
  SCENARIO_PURGE_INTERVAL_MS,
  VECTOR_LATENCY_CHECK_INTERVAL_MS,
  CONSTANTS_REFRESH_DIGEST_INTERVAL_MS,
  PERENNIAL_RECOMMENDATIONS_DIGEST_INTERVAL_MS,
} from "./constants";

/** Mirror of the exported `log` from index.ts — logs to the "express" source. */
const log = (message: string) => serverLog(message, "express");

/**
 * Fires off Phases 2–4 of the startup sequence. Synchronous — called from the
 * httpServer.listen() callback which is itself synchronous. All async work is
 * fire-and-forget via Promise chains and setImmediate.
 */
export function runBootSequence(httpServer: Server, _app: import("express").Express): void {
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

      // ── Phase 3m: Minion self-test scheduler (Task #1397) ────────
      // Gated on migration success — `resolveCadenceMs()` reads the
      // admin_resources row 'minion-self-test-cycle-interval-ms' on
      // every cycle, and the scheduler also writes to
      // `minion_self_test_runs` (migration 0051) and `costantino_findings`.
      // On a cold boot, both must exist before the first tick.
      setImmediate(() => {
        import("./jobs/minion-self-test-scheduler").then(({ startMinionSelfTestScheduler }) => {
          startMinionSelfTestScheduler();
        }).catch(err => {
          serverLog(`[minion-self-test-scheduler] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
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

  // ── Phase 3k: Weekly Vito compliance audit ────────
  import("./jobs/vito-compliance-scheduler").then(({ startVitoComplianceScheduler }) => {
    startVitoComplianceScheduler();
  }).catch(err => {
    serverLog(`[vito-scheduler] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
  });

  // ── Phase 3l: Costantino — Data Custodian (Step 0) ────────
  // Periodic agentic integration-health audit. Cadence is admin-editable
  // via admin_resources parameter row 'costantino-health-cycle-interval-ms'
  // (default 5 days). Self-rescheduling setTimeout chain — see
  // jobs/costantino-scheduler.ts for the concurrency guard and clamp logic.
  import("./jobs/costantino-scheduler").then(({ startCostantinoScheduler }) => {
    startCostantinoScheduler();
  }).catch(err => {
    serverLog(`[costantino-scheduler] Failed to start: ${err instanceof Error ? err.message : err}`, "startup", "error");
  });

  // Phase 3m (minion-self-test scheduler) is started inside the migration
  // `.then()` block above — it must wait for migrations 0051/0052 and the
  // `admin_resources` cadence row before its first tick.

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
      const { stopMinionSelfTestScheduler } = await import("./jobs/minion-self-test-scheduler");
      stopMinionSelfTestScheduler();
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
}
