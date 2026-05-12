-- Migration: create assumption_guardrails table (Task #1414).
-- Stores deterministic plausibility bounds (low/high) per assumption key,
-- read by the Fabio minion to decide range-badge dot color and "out of
-- range" chip visibility across the front-of-app.
--
-- Read-only from the application; rows are seeded from code.

CREATE TABLE IF NOT EXISTS "assumption_guardrails" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "assumption_key" text NOT NULL,
  "low" double precision NOT NULL,
  "high" double precision NOT NULL,
  "target_low" double precision,
  "target_high" double precision,
  "unit" text NOT NULL,
  "rationale" text,
  "source" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "assumption_guardrails_key_uniq"
  ON "assumption_guardrails" ("assumption_key");

-- First-cut seed: vendor pass-through cost + Mgmt Co markup guardrails
-- per service line (decimal fractions of revenue). Bounds come from the
-- HMA handbook benchmark spread observed across STR / CBRE / HVS / PKF
-- for boutique hospitality. Conservative — outliers outside these bands
-- almost always indicate a unit-of-measure error rather than a real
-- business condition.

INSERT INTO "assumption_guardrails"
  ("assumption_key", "low", "high", "target_low", "target_high", "unit", "rationale", "source")
VALUES
  ('vendor_passthrough_cost.marketing',          0.010, 0.060, 0.020, 0.040, 'fraction_of_revenue',
    'Boutique marketing pass-through typically 2–4% of revenue; outliers <1% or >6% are usually misclassified.', 'HMA handbook + STR boutique benchmarks'),
  ('vendor_passthrough_cost.it',                 0.005, 0.040, 0.010, 0.025, 'fraction_of_revenue',
    'IT pass-through typically 1–2.5% of revenue.', 'HMA handbook'),
  ('vendor_passthrough_cost.reservations',       0.010, 0.050, 0.015, 0.030, 'fraction_of_revenue',
    'Reservations / OTA tech 1.5–3% of revenue.', 'STR + CBRE'),
  ('vendor_passthrough_cost.accounting',         0.005, 0.030, 0.010, 0.020, 'fraction_of_revenue',
    'Outsourced accounting 1–2% of revenue.', 'HVS'),
  ('vendor_passthrough_cost.revenue_management', 0.005, 0.030, 0.010, 0.020, 'fraction_of_revenue',
    'Outsourced RM 1–2% of revenue.', 'HVS'),
  ('vendor_passthrough_cost.procurement',        0.002, 0.020, 0.005, 0.012, 'fraction_of_revenue',
    'Procurement service fees 0.5–1.2% of revenue.', 'PKF'),
  ('vendor_passthrough_cost.hr',                 0.005, 0.030, 0.010, 0.020, 'fraction_of_revenue',
    'HR pass-through 1–2% of revenue.', 'HMA handbook'),
  ('vendor_passthrough_cost.design',             0.000, 0.020, 0.000, 0.010, 'fraction_of_revenue',
    'Design / brand pass-through 0–1% of revenue (project, not steady-state).', 'Internal calibration'),
  ('vendor_passthrough_cost.general_management', 0.010, 0.060, 0.020, 0.040, 'fraction_of_revenue',
    'General Mgmt oversight 2–4% of revenue.', 'HMA handbook'),
  ('vendor_passthrough_cost.housekeeping',       0.030, 0.150, 0.060, 0.110, 'fraction_of_revenue',
    'Housekeeping vendor pass-through 6–11% of revenue for boutique.', 'STR boutique'),
  ('vendor_passthrough_cost.maintenance',        0.010, 0.080, 0.025, 0.060, 'fraction_of_revenue',
    'Maintenance pass-through 2.5–6% of revenue.', 'PKF'),
  ('vendor_passthrough_cost.food_beverage',      0.200, 0.450, 0.260, 0.380, 'fraction_of_revenue',
    'F&B vendor cost 26–38% of F&B revenue (COGS-heavy).', 'CBRE F&B benchmarks'),

  ('mgmt_co_markup_factor.marketing',            0.005, 0.030, 0.010, 0.020, 'fraction_of_revenue',
    'Mgmt Co markup on marketing 1–2% of revenue.', 'HMA handbook'),
  ('mgmt_co_markup_factor.it',                   0.002, 0.020, 0.005, 0.012, 'fraction_of_revenue',
    'Mgmt Co markup on IT 0.5–1.2% of revenue.', 'HMA handbook'),
  ('mgmt_co_markup_factor.reservations',         0.005, 0.025, 0.008, 0.018, 'fraction_of_revenue',
    'Mgmt Co markup on reservations 0.8–1.8% of revenue.', 'HVS'),
  ('mgmt_co_markup_factor.accounting',           0.002, 0.020, 0.005, 0.012, 'fraction_of_revenue',
    'Mgmt Co markup on accounting 0.5–1.2% of revenue.', 'HVS'),
  ('mgmt_co_markup_factor.revenue_management',   0.002, 0.020, 0.005, 0.012, 'fraction_of_revenue',
    'Mgmt Co markup on RM 0.5–1.2% of revenue.', 'HVS'),
  ('mgmt_co_markup_factor.procurement',          0.001, 0.015, 0.003, 0.008, 'fraction_of_revenue',
    'Mgmt Co markup on procurement 0.3–0.8% of revenue.', 'PKF'),
  ('mgmt_co_markup_factor.hr',                   0.002, 0.020, 0.005, 0.012, 'fraction_of_revenue',
    'Mgmt Co markup on HR 0.5–1.2% of revenue.', 'HMA handbook'),
  ('mgmt_co_markup_factor.design',               0.000, 0.015, 0.000, 0.008, 'fraction_of_revenue',
    'Mgmt Co markup on design 0–0.8% of revenue.', 'Internal calibration'),
  ('mgmt_co_markup_factor.general_management',   0.005, 0.040, 0.012, 0.025, 'fraction_of_revenue',
    'Mgmt Co markup on general management 1.2–2.5% of revenue.', 'HMA handbook'),
  ('mgmt_co_markup_factor.housekeeping',         0.005, 0.030, 0.010, 0.020, 'fraction_of_revenue',
    'Mgmt Co markup on housekeeping 1–2% of revenue.', 'STR boutique'),
  ('mgmt_co_markup_factor.maintenance',          0.002, 0.020, 0.005, 0.012, 'fraction_of_revenue',
    'Mgmt Co markup on maintenance 0.5–1.2% of revenue.', 'PKF'),
  ('mgmt_co_markup_factor.food_beverage',        0.005, 0.040, 0.012, 0.025, 'fraction_of_revenue',
    'Mgmt Co markup on F&B 1.2–2.5% of revenue.', 'CBRE F&B benchmarks')
ON CONFLICT ("assumption_key") DO UPDATE SET
  "low" = EXCLUDED."low",
  "high" = EXCLUDED."high",
  "target_low" = EXCLUDED."target_low",
  "target_high" = EXCLUDED."target_high",
  "unit" = EXCLUDED."unit",
  "rationale" = EXCLUDED."rationale",
  "source" = EXCLUDED."source",
  "updated_at" = now();
