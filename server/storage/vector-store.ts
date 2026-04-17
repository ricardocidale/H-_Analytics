/**
 * Vector store data-access layer.
 *
 * Exposes the raw `pg` pool to the vector-store service so it can issue the
 * pgvector-specific SQL (`<=>`, `vector(1536)`, HNSW index hints) that doesn't
 * map cleanly to Drizzle's typed query builder. Keeping the pool import here
 * (rather than in `server/ai/`) preserves the storage-boundary invariant: only
 * `server/storage/*` reaches into `server/db`.
 */
import { pool } from "../db";

export const vectorStorePool = pool;
