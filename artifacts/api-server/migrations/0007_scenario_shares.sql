-- Create scenario_shares table for admin scenario access grants
CREATE TABLE IF NOT EXISTS "scenario_shares" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "scenario_id" integer NOT NULL,
  "target_type" text NOT NULL,
  "target_id" integer NOT NULL,
  "granted_by" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "scenario_shares" ADD CONSTRAINT "scenario_shares_scenario_id_scenarios_id_fk"
    FOREIGN KEY ("scenario_id") REFERENCES "scenarios"("id") ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "scenario_shares" ADD CONSTRAINT "scenario_shares_granted_by_users_id_fk"
    FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenario_shares_scenario_id_idx" ON "scenario_shares" ("scenario_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenario_shares_target_idx" ON "scenario_shares" ("target_type", "target_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scenario_shares_unique_grant" ON "scenario_shares" ("scenario_id", "target_type", "target_id");
