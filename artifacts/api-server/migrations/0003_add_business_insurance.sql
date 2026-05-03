-- Add business insurance columns for management company and property-level insurance
-- businessInsuranceStart: annual company-level insurance premium ($12,000 default)
-- costRateInsurance: property-level insurance rate as % of total property value (1.5% default)

ALTER TABLE "global_assumptions"
  ADD COLUMN IF NOT EXISTS "business_insurance_start" real NOT NULL DEFAULT 12000;

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "cost_rate_insurance" real NOT NULL DEFAULT 0.015;
