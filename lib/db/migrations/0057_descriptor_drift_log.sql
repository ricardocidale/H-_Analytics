-- 0057_descriptor_drift_log
--
-- Plan 2026-05-13-002 — Property Assumptions Restructure — Finish (Unit U1).
--
-- Persists every descriptor-drift event observed by `detectDescriptorDrift`
-- after a property write. Replaces the prior log-only warning in
-- `routes/properties.ts:479-495`. The 14-day clean-window query that gates
-- the U8 cleanup unit (drop dual-write + drop deprecated typed columns) reads
-- this table; until it returns count=0 for 14 consecutive days, U8 cannot
-- proceed.
--
-- Append-only. Rows are not updated or deleted by application code; an
-- operational TTL pass MAY trim rows older than 90 days, but the gate query
-- only ever looks at a sliding window so growth is bounded.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS "property_descriptor_drift_log" (
  "id" bigserial PRIMARY KEY,
  "property_id" integer NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "field_key" text NOT NULL,
  "side" text NOT NULL,
  "typed_value" jsonb,
  "jsonb_value" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Gate query is `WHERE created_at >= now() - interval '14 days'`; this index
-- makes that and any sub-window probe a fast index-only range scan.
CREATE INDEX IF NOT EXISTS "property_descriptor_drift_log_created_at_idx"
  ON "property_descriptor_drift_log" ("created_at" DESC);

-- Per-property lookup for ad-hoc investigation ("what drifted on prop 42?").
CREATE INDEX IF NOT EXISTS "property_descriptor_drift_log_property_id_idx"
  ON "property_descriptor_drift_log" ("property_id");
