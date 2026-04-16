/**
 * Backfill script: Index all existing benchmark snapshots into Pinecone's
 * `comparables` namespace.
 *
 * Idempotent — Pinecone upsert by deterministic ID is safe to re-run.
 *
 * Usage:
 *   npx tsx server/scripts/backfill-benchmarks-pinecone.ts
 */

import { storage } from "../storage";
import { indexBenchmarkSnapshot, isPineconeAvailable } from "../ai/pinecone-service";
import { mapCategoryToKpis } from "../ai/pinecone-indexing";
import { logger } from "../logger";

async function main() {
  if (!isPineconeAvailable()) {
    logger.error("[backfill] PINECONE_API_KEY not configured — aborting.");
    process.exit(1);
  }

  logger.info("[backfill] Fetching all benchmark snapshots from PostgreSQL…");
  const snapshots = await storage.getBenchmarkSnapshots();
  logger.info(`[backfill] Found ${snapshots.length} snapshots to index.`);

  let indexed = 0;
  let failed = 0;

  for (const snap of snapshots) {
    try {
      const kpis = mapCategoryToKpis(snap.category, snap.value);
      await indexBenchmarkSnapshot({
        market: snap.snapshotKey,
        propertyType: snap.category,
        ...kpis,
        source: snap.source ?? "unknown",
        snapshotDate: snap.fetchedAt.toISOString(),
      });
      indexed++;
      if (indexed % 10 === 0) {
        logger.info(`[backfill] Progress: ${indexed}/${snapshots.length}`);
      }
    } catch (err: unknown) {
      failed++;
      logger.warn(`[backfill] Failed to index ${snap.snapshotKey}: ${err instanceof Error ? err.message : err}`);
    }
  }

  logger.info(`[backfill] Complete. Indexed: ${indexed}, Failed: ${failed}, Total: ${snapshots.length}`);
  process.exit(0);
}

main().catch((err) => {
  logger.error(`Fatal error: ${err instanceof Error ? err.message : err}`, "backfill");
  process.exit(1);
});
