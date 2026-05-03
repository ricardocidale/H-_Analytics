-- Replace Pinecone with Neon pgvector for the intelligence layer.
-- Stores all embeddings (1536-dim, cosine) used by the H+ Analytics
-- intelligence stack across the seven legacy "namespaces":
--   knowledge-base, research-history, comparables, assumption-guidance,
--   documents, scenarios, properties.

CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vector_chunks" (
  "namespace"  text NOT NULL,
  "id"         text NOT NULL,
  "text"       text NOT NULL,
  "metadata"   jsonb NOT NULL DEFAULT '{}'::jsonb,
  "embedding"  vector(1536) NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "vector_chunks_pk" PRIMARY KEY ("namespace", "id")
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vector_chunks_namespace_idx"
  ON "vector_chunks" ("namespace");--> statement-breakpoint

-- HNSW index for fast cosine-distance ANN. Falls back to a sequential scan
-- automatically if the extension build is too old for HNSW; in that case
-- swap to: USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100).
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "vector_chunks_embedding_hnsw" '
         || 'ON "vector_chunks" USING hnsw (embedding vector_cosine_ops) '
         || 'WITH (m = 16, ef_construction = 64)';
  EXCEPTION WHEN feature_not_supported OR undefined_object OR syntax_error THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "vector_chunks_embedding_ivfflat" '
         || 'ON "vector_chunks" USING ivfflat (embedding vector_cosine_ops) '
         || 'WITH (lists = 100)';
  END;
END $$;
