-- Phase 4 (Task #454) — Specialist recommendation event telemetry.
-- Append-only log for promote-vs-ignore signals on Specialist candidate
-- fields. Consumed by the Catalog Calibration reports and by the
-- SpecialistPage Required Fields tab stats endpoint.

CREATE TABLE IF NOT EXISTS specialist_recommendation_events (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  specialist_id text NOT NULL,
  field_key text NOT NULL,
  action text NOT NULL,
  actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS specialist_rec_events_specialist_idx
  ON specialist_recommendation_events (specialist_id);

CREATE INDEX IF NOT EXISTS specialist_rec_events_specialist_field_idx
  ON specialist_recommendation_events (specialist_id, field_key);
