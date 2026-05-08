CREATE TABLE "competitor_rates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "competitor_rates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"market" text NOT NULL,
	"property_category" text,
	"check_in_date" date,
	"avg_rate" double precision,
	"currency" text DEFAULT 'USD' NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reit_benchmarks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reit_benchmarks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ticker" text NOT NULL,
	"metric_key" text NOT NULL,
	"value" double precision,
	"period" text NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_resources" ADD COLUMN "daily_request_budget" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_rates_market_category_checkin_source_uniq" ON "competitor_rates" USING btree ("market","property_category","check_in_date","source");--> statement-breakpoint
CREATE INDEX "competitor_rates_market_fetched_idx" ON "competitor_rates" USING btree ("market","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reit_benchmarks_ticker_metric_period_uniq" ON "reit_benchmarks" USING btree ("ticker","metric_key","period");--> statement-breakpoint
CREATE INDEX "reit_benchmarks_ticker_idx" ON "reit_benchmarks" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "reit_benchmarks_fetched_idx" ON "reit_benchmarks" USING btree ("fetched_at");