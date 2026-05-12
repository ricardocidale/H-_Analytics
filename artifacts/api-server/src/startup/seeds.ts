/**
 * startup/seeds.ts — Seed and vector-indexing helpers
 *
 * Contains the seed runner, the advisory-lock wrapper that ensures only one
 * replica seeds on each boot, and the async property-vector indexer. Called
 * from boot.ts as part of Phase 2b startup.
 *
 * All paths use `../` because this file lives in src/startup/ not src/.
 */
import { seedAdminUser } from "../auth";
import { storage } from "../storage";
import { log as serverLog } from "../logger";

/** Mirror of the exported `log` from index.ts — logs to the "express" source. */
const log = (message: string) => serverLog(message, "express");

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

export async function runSeedsSafely(): Promise<void> {
  const startTime = Date.now();
  const { pool } = await import("../db");
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

export function indexPropertiesToVectorStoreAsync() {
  (async () => {
    try {
      const { indexPropertyProfile } = await import("../ai/vector-store-service");
      const { properties: propertiesTable } = await import("@workspace/db");
      const { db: database } = await import("../db");
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

async function runSeeds() {
  await seedAdminUser();

  const { seedMissingMarketResearch, seedDefaultLogos, seedCompanies, seedFeeCategories, seedServiceTemplates, seedPropertyPhotos, seedGlobalAssumptions, seedMedellinDuplex, seedMedellinDuplexPhotos } = await import("../seed");
  const { seedMarketRates } = await import("../seeds/market-rates");
  const { seedMarketDataTables } = await import("../seeds/market-data-tables");
  const { seedProductionSql } = await import("../seeds/production-sql");
  const { seedModelConstants } = await import("../../script/seed-model-constants");
  const { seedModelDefaults } = await import("../../script/seed-model-defaults");

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
    { name: "reference-ranges",   run: async () => { const { seedReferenceRanges } = await import("../seeds/reference-ranges"); await seedReferenceRanges(); } },
    { name: "default-logos", run: seedDefaultLogos },
    { name: "brand-asset-logos", run: async () => { const { seedBrandAssetLogos } = await import("../seed"); await seedBrandAssetLogos(); } },
    { name: "fee-categories", run: seedFeeCategories },
    { name: "service-templates", run: seedServiceTemplates },
    { name: "property-photos", run: seedPropertyPhotos },
    { name: "global-assumptions", run: seedGlobalAssumptions },
    // Pure idempotent upserts of authority-dictated constants and Steady-State
    // defaults from shared/constants.ts. Safe to run on every boot.
    { name: "model-constants", run: () => seedModelConstants({ silent: true }) },
    { name: "model-defaults", run: () => seedModelDefaults({ silent: true }) },
    { name: "reference-brands", run: async () => { const result = await storage.seedReferenceBrandsIfEmpty(); if (result.seeded) serverLog(`[seed:reference-brands] seeded ${result.count} brands`, "startup", "info"); } },
    { name: "external-integrations", run: async () => { const { seedExternalIntegrations } = await import("../migrations/seed-external-integrations"); await seedExternalIntegrations(); } },
    { name: "rebecca-guardrails", run: async () => { const { runRebeccaGuardrails001 } = await import("../migrations/rebecca-guardrails-001"); await runRebeccaGuardrails001(); } },
    { name: "rebecca-kb", run: async () => { const { runRebeccaKB001 } = await import("../migrations/rebecca-kb-001"); await runRebeccaKB001(); } },
    { name: "admin-resources-004", run: async () => { const { runAdminResources004 } = await import("../migrations/admin-resources-004"); await runAdminResources004(); } },
    { name: "admin-resources-005", run: async () => { const { runAdminResources005 } = await import("../migrations/admin-resources-005"); await runAdminResources005(); } },
    { name: "rebecca-rail-open", run: async () => { const { runRebeccaRailOpen001 } = await import("../migrations/rebecca-rail-open-001"); await runRebeccaRailOpen001(); } },
    { name: "rebecca-chat-prefs", run: async () => { const { runRebeccaChatPrefs001 } = await import("../migrations/rebecca-chat-prefs-001"); await runRebeccaChatPrefs001(); } },
    { name: "rebecca-history-chips", run: async () => { const { runRebeccaHistoryChips001 } = await import("../migrations/rebecca-history-chips-001"); await runRebeccaHistoryChips001(); } },
    { name: "slide-factory-runs-v2-columns", run: async () => { const { runSlideFactoryRunsV2Columns } = await import("../migrations/slide-factory-runs-v2-columns"); await runSlideFactoryRunsV2Columns(); } },
    { name: "knowledge-registry", run: async () => { const { seedKnowledgeRegistry } = await import("../seeds/knowledge-registry"); await seedKnowledgeRegistry(); } },
    { name: "country-economic-data", run: async () => { const { seedCountryEconomicDataIfEmpty } = await import("../seeds/knowledge-registry"); await seedCountryEconomicDataIfEmpty(); } },
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
    { name: "admin-resources-006", run: async () => { const { runAdminResources006 } = await import("../migrations/admin-resources-006"); await runAdminResources006(); } },
    { name: "admin-resources-007", run: async () => { const { runAdminResources007 } = await import("../migrations/admin-resources-007"); await runAdminResources007(); } },
    { name: "pietro-tables-001",   run: async () => { const { runPietroTables001 }   = await import("../migrations/pietro-tables-001");   await runPietroTables001();   } },
    { name: "pietro-resources-001",run: async () => { const { runPietroResources001 }= await import("../migrations/pietro-resources-001"); await runPietroResources001(); } },
    { name: "pietro-resources-002",run: async () => { const { runPietroResources002 }= await import("../migrations/pietro-resources-002"); await runPietroResources002(); } },
    { name: "pietro-research-catalog-001", run: async () => { const { runPietroResearchCatalog001 } = await import("../migrations/pietro-research-catalog-001"); await runPietroResearchCatalog001(); } },
  ]) {
    await ddlTask.run();
  }

  // LLM slot model upgrades must run sequentially (008 → 010) so that
  // each migration sees the DB state left by its predecessor in a single boot.
  // Running them in the parallel fan-out risks 010 executing before 008 has
  // finished, leaving stale slots until the next restart.
  // Note: admin-resources-009 (claude-opus-4-7 → claude-sonnet-4-5 patch in
  // global_assumptions) is retired — migration 010 corrected the llm_slots in
  // admin_resources, and nothing in the codebase writes claude-opus-4-7 into
  // global_assumptions any longer, so 009 was permanently a no-op.
  for (const modelMigrationTask of [
    { name: "admin-resources-008", run: async () => { const { runAdminResources008 } = await import("../migrations/admin-resources-008"); await runAdminResources008(); } },
    { name: "admin-resources-010", run: async () => { const { runAdminResources010 } = await import("../migrations/admin-resources-010"); await runAdminResources010(); } },
    { name: "admin-resources-011", run: async () => { const { runAdminResources011 } = await import("../migrations/admin-resources-011"); await runAdminResources011(); } },
  ]) {
    await modelMigrationTask.run();
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
    const { runSchemaProbe } = await import("../migrations/schema-probe");
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
    const { cleanOrphanedLogos } = await import("../migrations/db-hygiene-001");
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
    const { backfillCatalogConnections } = await import("../jobs/catalog-sync");
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
