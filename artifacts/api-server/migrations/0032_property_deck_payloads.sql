-- 0032_property_deck_payloads
--
-- Create the editor sidecar table for the L+B canonical 6-slide investor deck.
-- One row per property; holds human-only and LLM-draft-then-approved
-- editorial copy slots. Deterministic slots (name, specs, asking price) are
-- NOT stored here — they are derived at render time from `properties`.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS guard, no destructive statements.

CREATE TABLE IF NOT EXISTS property_deck_payloads (
  property_id integer PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_by  integer     REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);
