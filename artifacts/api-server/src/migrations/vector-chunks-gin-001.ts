import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "vector-chunks-gin-001";

/**
 * Adds a GIN index on the metadata column of vector_chunks to support efficient
 * hybrid retrieval via JSON containment (@>).
 */
export async function runVectorChunksGin001(): Promise<void> {
  try {
    // metadata is a jsonb column
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS vector_chunks_metadata_gin_idx
      ON vector_chunks USING gin (metadata jsonb_path_ops)
    `);

    logger.info(`[${TAG}] GIN index on vector_chunks.metadata created (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
