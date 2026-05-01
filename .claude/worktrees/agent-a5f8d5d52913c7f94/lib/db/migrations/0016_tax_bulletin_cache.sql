-- Phase 2c — Helena's deterministic tax-bulletin-diff tool needs a per-
-- jurisdiction cache so successive refreshes can produce real diffs
-- (changed fields only) rather than full re-reads. One row per
-- (country, subdivision); upsert on every successful fetch.
--
-- subdivision is NOT NULL (default '') because Postgres treats NULLs as
-- distinct in unique indexes — without the empty-string coercion the
-- unique constraint would allow duplicates per country.
CREATE TABLE IF NOT EXISTS tax_bulletin_cache (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  country TEXT NOT NULL,
  subdivision TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  publisher TEXT NOT NULL,
  bulletin_hash TEXT NOT NULL,
  parsed_values JSONB NOT NULL,
  raw_excerpt TEXT NOT NULL,
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tax_bulletin_jurisdiction UNIQUE (country, subdivision)
);
