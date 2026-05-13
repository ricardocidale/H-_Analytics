-- 0064_property_refi_max_ltv_cap
--
-- Plan 2026-05-13-001 (feat seed-calibration-bracket-defaults-and-irr-views) U2.
-- Mirror of lib/db/migrations/0057_property_refi_max_ltv_cap.sql.
--
-- Slot 0064 (not the natural 0060) because PR #138 (Phase C ICP bracket-mix
-- peer-derived) reserves 0060/0061/0062 in this folder. The two folders drift
-- per CLAUDE.md "Migration system architecture"; lib/db/migrations/ uses
-- 0057 because that folder is independent.
--
-- Adds the per-property refi-LTV cap relative to the ORIGINAL acquisition loan
-- amount. See header of the lib/db mirror for full rationale.
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
