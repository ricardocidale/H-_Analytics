-- Pietro data infrastructure: add daily_request_budget column to admin_resources.
-- New resource kinds (mcp, search_url, research_prompt) are TypeScript enum values;
-- no Postgres DDL is needed for them — the text column accepts any string.
ALTER TABLE admin_resources
  ADD COLUMN IF NOT EXISTS daily_request_budget integer
  CONSTRAINT admin_resources_daily_budget_nonneg CHECK (daily_request_budget IS NULL OR daily_request_budget >= 0);
