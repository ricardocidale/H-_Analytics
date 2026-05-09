CREATE TABLE "compliance_violations" (
	"id" serial PRIMARY KEY NOT NULL,
	"violation_fingerprint" text NOT NULL,
	"violation_type" text NOT NULL,
	"severity" text NOT NULL,
	"file" text NOT NULL,
	"line_hint" integer,
	"description" text NOT NULL,
	"suggested_fix" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_run_id" integer,
	"resolved_at" timestamp,
	"resolved_by" integer,
	"accepted_at" timestamp,
	"accepted_note" text,
	CONSTRAINT "compliance_violations_fingerprint_unique" UNIQUE("violation_fingerprint")
);
--> statement-breakpoint
CREATE TABLE "vito_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"mode" text DEFAULT 'runtime' NOT NULL,
	"passes_completed" integer DEFAULT 0 NOT NULL,
	"block_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"advisory_count" integer DEFAULT 0 NOT NULL,
	"info_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"notes" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compliance_violations" ADD CONSTRAINT "compliance_violations_last_run_id_vito_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."vito_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_violations" ADD CONSTRAINT "compliance_violations_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compliance_violations_severity_status_idx" ON "compliance_violations" USING btree ("severity","resolved_at","accepted_at");