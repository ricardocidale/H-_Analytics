-- Add industry_vertical + exit_revenue_multiple to global_assumptions.
-- Surfaces the Analyst watchdog's exit-multiple band check (per industry vertical)
-- in the Assumptions UI. Both columns nullable: the watchdog skips the check
-- entirely until the user picks a vertical and enters a multiple.
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "industry_vertical" text;--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "exit_revenue_multiple" real;
