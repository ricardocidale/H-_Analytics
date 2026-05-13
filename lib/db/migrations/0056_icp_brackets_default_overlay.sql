-- 0056_icp_brackets_default_overlay
--
-- Plan 2026-05-13-001 (feat seed-calibration-bracket-defaults-and-irr-views) U5.
--
-- Adds two NULL-able real columns to icp_brackets so each bracket can carry an
-- optional Layer-2 overlay value for the layered defaults resolver:
--   defaultExitCapRate            (overlays mc.tax_exit.exitCapRate)
--   defaultRefiMaxLtvToOriginal   (overlays mc.funding.refiMaxLtvToOriginal)
--
-- NULL = "this bracket carries no opinion on this field; fall through to the
-- universal Layer-1 model_defaults row." Populated values participate in the
-- weight-blended overlay applied at entity creation by POST /api/properties.
--
-- Idempotent: ALTER TABLE ... ADD COLUMN IF NOT EXISTS. Safe to re-run.
ALTER TABLE "icp_brackets" ADD COLUMN IF NOT EXISTS "default_exit_cap_rate" real;
ALTER TABLE "icp_brackets" ADD COLUMN IF NOT EXISTS "default_refi_max_ltv_to_original" real;
