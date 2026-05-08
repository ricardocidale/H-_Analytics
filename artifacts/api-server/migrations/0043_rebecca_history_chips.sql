-- 0043_rebecca_history_chips
--
-- Extends per-user Rebecca chat preferences with two new columns:
--
--   rebecca_history_open    — whether the conversation history panel was last open
--   rebecca_suggested_chips — the most recent AI-generated chip suggestions
--                             stored as a JSON array so they reappear on the
--                             next session instead of falling back to the
--                             generic DEFAULT_CHIPS.

--> statement-breakpoint
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rebecca_history_open boolean;

--> statement-breakpoint
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rebecca_suggested_chips jsonb;
