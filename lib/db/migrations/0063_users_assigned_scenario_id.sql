ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "assigned_scenario_id" integer;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_assigned_scenario_id_fkey'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_assigned_scenario_id_fkey"
      FOREIGN KEY ("assigned_scenario_id") REFERENCES "scenarios"("id") ON DELETE SET NULL;
  END IF;
END $$;
