-- 0058_properties_refi_ltv_cap
--
-- Adds refi_max_ltv_to_original to properties.
--
-- Caps the refi loan at (refi_max_ltv_to_original × purchase_price). NULL =
-- uncapped (legacy behaviour). Prevents equity stripping on Full Equity
-- properties where high in-place NOI could otherwise justify a refi loan that
-- exceeds the original cost basis.
--
-- Wired in:
--   lib/engine/src/property/refinance-pass.ts  (caps propertyValueAtRefi)
--   lib/engine/src/debt/loanCalculations.ts     (caps refiLoanAmount)
--
-- Idempotent.

ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "refi_max_ltv_to_original" real;
