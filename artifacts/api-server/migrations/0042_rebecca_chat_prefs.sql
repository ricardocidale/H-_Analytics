-- 0042_rebecca_chat_prefs
--
-- Adds per-user Rebecca chat display preference columns to the users table.
-- These preferences are persisted server-side so they roam across devices and
-- browsers, instead of being limited to a single browser's localStorage.
--
--   rebecca_response_mode    — "concise" | "standard" | "detailed"
--   rebecca_show_tool_timing — whether to show elapsed time on tool calls

--> statement-breakpoint
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rebecca_response_mode text;

--> statement-breakpoint
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rebecca_show_tool_timing boolean;
