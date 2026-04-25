import { sql } from "drizzle-orm";
import { db } from "../db";
import { log } from "../logger";

/**
 * Drop the engine_suggested_lines table. The FinancialLinesTab UI, the
 * /api/admin/intelligence/financial-lines routes, and all storage methods
 * that read or wrote this table were removed in Task #449. There are no
 * remaining readers or writers, so the table can be dropped cleanly.
 */
export async function runDropEngineSuggestedLines001() {
  try {
    await db.execute(sql`DROP TABLE IF EXISTS engine_suggested_lines CASCADE`);
    log("engine_suggested_lines table dropped", "migration:drop-engine-suggested-lines-001");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes("does not exist")) {
      log(
        `drop-engine-suggested-lines-001 failed: ${msg}`,
        "migration:drop-engine-suggested-lines-001",
        "error",
      );
    }
  }
}
