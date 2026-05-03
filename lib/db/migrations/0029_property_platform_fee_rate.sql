-- Add platform_fee_rate to properties.
-- Nullable — NULL means use BUSINESS_MODEL_DEFAULTS[businessModel].platformFeeRate
-- (the TS constant for the archetype). When non-NULL, the user's explicit
-- override wins in resolve-assumptions.ts.
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "platform_fee_rate" real;
