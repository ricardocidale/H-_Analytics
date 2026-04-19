/**
 * fix-shared-ownership.ts — One-time data fixup
 *
 * Corrects a historical seeding bug where properties and global_assumptions
 * were created with userId = adminUserId instead of userId = NULL. Non-null
 * userId makes data invisible to other authenticated users because the
 * storage layer queries `WHERE userId = :uid OR userId IS NULL`.
 *
 * Safe to run on every startup — it's a no-op if data is already correct.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { log } from "../logger";

export async function fixLegacyOwnership(): Promise<void> {
  try {
    // Fix properties: all portfolio properties must be shared (userId = NULL)
    const propResult = await db.execute(
      sql`UPDATE properties SET user_id = NULL WHERE user_id IS NOT NULL`
    );
    const propsFixed = (propResult as { rowCount?: number }).rowCount ?? 0;
    if (propsFixed > 0) {
      log(`[INFO] [fix-shared-ownership] Converted ${propsFixed} properties to shared (userId=NULL)`, "migration");
    }

    // Fix global_assumptions: the singleton row must be shared (userId = NULL)
    const gaResult = await db.execute(
      sql`UPDATE global_assumptions SET user_id = NULL WHERE user_id IS NOT NULL`
    );
    const gaFixed = (gaResult as { rowCount?: number }).rowCount ?? 0;
    if (gaFixed > 0) {
      log(`[INFO] [fix-shared-ownership] Converted ${gaFixed} global_assumptions rows to shared (userId=NULL)`, "migration");
    }

    // Deduplicate: if multiple shared global_assumptions rows exist, keep only the newest
    const dupeCount = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM global_assumptions WHERE user_id IS NULL`
    );
    const count = Number((dupeCount as { rows?: Array<{ cnt?: string | number }> }).rows?.[0]?.cnt ?? 0);
    if (count > 1) {
      const newest = await db.execute(
        sql`SELECT id FROM global_assumptions WHERE user_id IS NULL ORDER BY id DESC LIMIT 1`
      );
      const keepId = (newest as { rows?: Array<{ id?: number }> }).rows?.[0]?.id;
      if (keepId) {
        await db.execute(
          sql`DELETE FROM global_assumptions WHERE user_id IS NULL AND id != ${keepId}`
        );
        log(`[INFO] [fix-shared-ownership] Deduplicated global_assumptions, kept id=${keepId}`, "migration");
      }
    }
  } catch (err: unknown) {
    log(`Migration failed (non-fatal): ${err instanceof Error ? err.message : err}`, "fix-shared-ownership", "error");
  }
}
