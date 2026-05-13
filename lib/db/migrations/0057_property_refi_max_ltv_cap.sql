-- 0057_property_refi_max_ltv_cap
--
-- Plan 2026-05-13-001 (feat seed-calibration-bracket-defaults-and-irr-views) U2.
-- Mirror of artifacts/api-server/migrations/0064_property_refi_max_ltv_cap.sql.
--
-- Adds the per-property refi-LTV cap relative to the ORIGINAL acquisition loan
-- amount. Without it, the refinance pass can produce a new loan that is many
-- times larger than the original debt (e.g. a $3.75M acquisition refi-ing into
-- an $11M cash-out spike when income-cap valuation surges in mid-projection),
-- which silently inflates combined portfolio IRR.
--
-- Default value 0.70 sourced from
-- lib/shared/src/constants-funding.ts:DEFAULT_REFI_MAX_LTV_TO_ORIGINAL
-- (mirrored in lib/db/src/constants.ts). The SQL literal here is the only
-- place this value is repeated; Drizzle's `.default(DEFAULT_REFI_MAX_LTV_TO_ORIGINAL)`
-- on the schema TS uses the named constant.
--
-- Idempotent: ALTER TABLE ... ADD COLUMN IF NOT EXISTS + DO-block-guarded
-- CHECK constraint. Safe to re-run.

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "refi_max_ltv_to_original" real NOT NULL DEFAULT 0.70;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prop_refi_max_ltv_to_original_range'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'properties'
      AND column_name = 'refi_max_ltv_to_original'
  ) THEN
    ALTER TABLE "properties"
      ADD CONSTRAINT "prop_refi_max_ltv_to_original_range"
      CHECK ("refi_max_ltv_to_original" >= 0 AND "refi_max_ltv_to_original" <= 1);
  END IF;
END $$;
