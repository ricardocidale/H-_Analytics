CREATE TABLE "geography_dimension" (
	"id" serial PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"parent_country_code" text,
	"iso_code" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"currency_symbol" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "geography_dimension_iso_level_uq" UNIQUE("iso_code","level")
);
--> statement-breakpoint
CREATE TABLE "jurisdictional_taxes" (
	"id" serial PRIMARY KEY NOT NULL,
	"country" text NOT NULL,
	"subdivision" text,
	"market" text,
	"tax_name" text NOT NULL,
	"tax_rate" real NOT NULL,
	"is_layered" boolean DEFAULT false NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"source_id" integer,
	"source_name" text,
	"source_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_cap_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"country" text NOT NULL,
	"subdivision" text,
	"market" text NOT NULL,
	"segment" text,
	"cap_rate" real NOT NULL,
	"as_of_date" date NOT NULL,
	"source_id" integer,
	"source_name" text,
	"source_url" text,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulatory_fees" (
	"id" serial PRIMARY KEY NOT NULL,
	"country" text NOT NULL,
	"subdivision" text,
	"market" text,
	"fee_type" text NOT NULL,
	"fee_name" text NOT NULL,
	"amount" real NOT NULL,
	"unit" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"source_id" integer,
	"source_name" text,
	"source_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "competitor_rates_market_category_checkin_source_uniq";--> statement-breakpoint
ALTER TABLE "jurisdictional_taxes" ADD CONSTRAINT "jurisdictional_taxes_source_id_source_registry_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_registry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_cap_rates" ADD CONSTRAINT "market_cap_rates_source_id_source_registry_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_registry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_fees" ADD CONSTRAINT "regulatory_fees_source_id_source_registry_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_registry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geography_dimension_level_idx" ON "geography_dimension" USING btree ("level");--> statement-breakpoint
CREATE INDEX "geography_dimension_parent_idx" ON "geography_dimension" USING btree ("parent_country_code");--> statement-breakpoint
CREATE INDEX "jurisdictional_taxes_lookup_idx" ON "jurisdictional_taxes" USING btree ("country","subdivision","market");--> statement-breakpoint
CREATE INDEX "market_cap_rates_lookup_idx" ON "market_cap_rates" USING btree ("market","as_of_date");--> statement-breakpoint
CREATE INDEX "market_cap_rates_geo_idx" ON "market_cap_rates" USING btree ("country","subdivision");--> statement-breakpoint
CREATE INDEX "regulatory_fees_lookup_idx" ON "regulatory_fees" USING btree ("country","subdivision","market");--> statement-breakpoint
ALTER TABLE "competitor_rates" ADD CONSTRAINT "competitor_rates_market_category_checkin_source_uniq" UNIQUE NULLS NOT DISTINCT("market","property_category","check_in_date","source");