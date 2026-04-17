-- Rename funding fields from SAFE-prefixed names to generic capital_raise names.
-- Funding instruments may not be SAFEs (could be convertible notes, seed rounds, etc.).
-- ALTER TABLE ... RENAME COLUMN preserves all existing values.

ALTER TABLE "global_assumptions" RENAME COLUMN "safe_tranche1_amount" TO "capital_raise_1_amount";--> statement-breakpoint
ALTER TABLE "global_assumptions" RENAME COLUMN "safe_tranche1_date" TO "capital_raise_1_date";--> statement-breakpoint
ALTER TABLE "global_assumptions" RENAME COLUMN "safe_tranche2_amount" TO "capital_raise_2_amount";--> statement-breakpoint
ALTER TABLE "global_assumptions" RENAME COLUMN "safe_tranche2_date" TO "capital_raise_2_date";--> statement-breakpoint
ALTER TABLE "global_assumptions" RENAME COLUMN "safe_valuation_cap" TO "capital_raise_valuation_cap";--> statement-breakpoint
ALTER TABLE "global_assumptions" RENAME COLUMN "safe_discount_rate" TO "capital_raise_discount_rate";
