-- 0038_add_capital_raise_3
--
-- Add third management-company raise tranche slots to global_assumptions.
-- Nullable — most users have ≤2 tranches; only populated when the engine
-- recommends or the user configures a third tranche.

ALTER TABLE global_assumptions
  ADD COLUMN IF NOT EXISTS capital_raise_3_amount real,
  ADD COLUMN IF NOT EXISTS capital_raise_3_date text;
