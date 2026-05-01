import { sql } from "drizzle-orm";
import { db } from "../db";
import { log } from "../logger";

/**
 * Drop all Plaid-related tables. Plaid integration has been removed from the platform.
 * Tables: plaid_categorization_cache, plaid_transactions, plaid_connections
 * Order matters due to foreign key constraints.
 */
export async function runDropPlaid001() {
  try {
    await db.execute(sql`DROP TABLE IF EXISTS plaid_categorization_cache CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS plaid_transactions CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS plaid_connections CASCADE`);
    log("Plaid tables dropped", "migration:drop-plaid-001");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes("does not exist")) {
      log(`drop-plaid-001 failed: ${msg}`, "migration:drop-plaid-001", "error");
    }
  }
}
