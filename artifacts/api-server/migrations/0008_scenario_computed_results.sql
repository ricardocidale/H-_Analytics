ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS computed_results jsonb;
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS compute_hash text;
