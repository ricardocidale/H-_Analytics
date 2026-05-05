-- NAI-26: Railway's migration runner incorrectly extracts statements from
-- inside PL/pgSQL DO blocks, stripping the EXCEPTION handler and emitting
-- the inner EXECUTE string without the vector_cosine_ops operator class.
-- This migration creates the HNSW index directly (no DO block) so Railway
-- can execute it reliably. IF NOT EXISTS makes it idempotent for envs
-- where 0012 already partially succeeded.
--
-- Prerequisite: pgvector >= 0.5.0 (prod is 0.8.0). HNSW requires 0.5+.
-- If the extension is not yet installed, CREATE EXTENSION below handles it.

CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vector_chunks_embedding_hnsw"
  ON "vector_chunks"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
