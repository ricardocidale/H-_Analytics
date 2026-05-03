CREATE TABLE "design_themes" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "design_themes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
        "name" text NOT NULL,
        "description" text NOT NULL,
        "is_active" boolean DEFAULT false NOT NULL,
        "colors" jsonb NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_assumptions" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "global_assumptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
        "user_id" integer,
        "company_name" text DEFAULT 'L+B Hospitality' NOT NULL,
        "company_logo" text,
        "model_start_date" text NOT NULL,
        "company_ops_start_date" text DEFAULT '2026-06-01' NOT NULL,
        "fiscal_year_start_month" integer DEFAULT 1 NOT NULL,
        "inflation_rate" real NOT NULL,
        "fixed_cost_escalation_rate" real DEFAULT 0.03 NOT NULL,
        "base_management_fee" real NOT NULL,
        "incentive_management_fee" real NOT NULL,
        "funding_source_label" text DEFAULT 'SAFE' NOT NULL,
        "safe_tranche1_amount" real DEFAULT 800000 NOT NULL,
        "safe_tranche1_date" text DEFAULT '2026-06-01' NOT NULL,
        "safe_tranche2_amount" real DEFAULT 800000 NOT NULL,
        "safe_tranche2_date" text DEFAULT '2027-04-01' NOT NULL,
        "safe_valuation_cap" real DEFAULT 2500000 NOT NULL,
        "safe_discount_rate" real DEFAULT 0.2 NOT NULL,
        "partner_comp_year1" real DEFAULT 540000 NOT NULL,
        "partner_comp_year2" real DEFAULT 540000 NOT NULL,
        "partner_comp_year3" real DEFAULT 540000 NOT NULL,
        "partner_comp_year4" real DEFAULT 600000 NOT NULL,
        "partner_comp_year5" real DEFAULT 600000 NOT NULL,
        "partner_comp_year6" real DEFAULT 700000 NOT NULL,
        "partner_comp_year7" real DEFAULT 700000 NOT NULL,
        "partner_comp_year8" real DEFAULT 800000 NOT NULL,
        "partner_comp_year9" real DEFAULT 800000 NOT NULL,
        "partner_comp_year10" real DEFAULT 900000 NOT NULL,
        "partner_count_year1" integer DEFAULT 3 NOT NULL,
        "partner_count_year2" integer DEFAULT 3 NOT NULL,
        "partner_count_year3" integer DEFAULT 3 NOT NULL,
        "partner_count_year4" integer DEFAULT 3 NOT NULL,
        "partner_count_year5" integer DEFAULT 3 NOT NULL,
        "partner_count_year6" integer DEFAULT 3 NOT NULL,
        "partner_count_year7" integer DEFAULT 3 NOT NULL,
        "partner_count_year8" integer DEFAULT 3 NOT NULL,
        "partner_count_year9" integer DEFAULT 3 NOT NULL,
        "partner_count_year10" integer DEFAULT 3 NOT NULL,
        "staff_salary" real NOT NULL,
        "office_lease_start" real NOT NULL,
        "professional_services_start" real NOT NULL,
        "tech_infra_start" real NOT NULL,
        "business_insurance_start" real NOT NULL,
        "travel_cost_per_client" real NOT NULL,
        "it_license_per_client" real NOT NULL,
        "marketing_rate" real NOT NULL,
        "misc_ops_rate" real NOT NULL,
        "commission_rate" real DEFAULT 0.05 NOT NULL,
        "standard_acq_package" jsonb NOT NULL,
        "debt_assumptions" jsonb NOT NULL,
        "full_catering_fb_boost" real DEFAULT 0.5 NOT NULL,
        "partial_catering_fb_boost" real DEFAULT 0.25 NOT NULL,
        "company_tax_rate" real DEFAULT 0.3 NOT NULL,
        "exit_cap_rate" real DEFAULT 0.085 NOT NULL,
        "sales_commission_rate" real DEFAULT 0.05 NOT NULL,
        "event_expense_rate" real DEFAULT 0.65 NOT NULL,
        "other_expense_rate" real DEFAULT 0.6 NOT NULL,
        "utilities_variable_split" real DEFAULT 0.6 NOT NULL,
        "asset_definition" jsonb DEFAULT '{"minRooms":10,"maxRooms":80,"hasFB":true,"hasEvents":true,"hasWellness":true,"minAdr":150,"maxAdr":600,"description":"Independently operated, design-forward properties with curated guest experiences, on-site F&B, event hosting, and wellness programming."}'::jsonb NOT NULL,
        "preferred_llm" text DEFAULT 'gpt-4o' NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "login_at" timestamp DEFAULT now() NOT NULL,
        "logout_at" timestamp,
        "session_id" text NOT NULL,
        "ip_address" text
);
--> statement-breakpoint
CREATE TABLE "market_research" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "market_research_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
        "user_id" integer,
        "type" text NOT NULL,
        "property_id" integer,
        "title" text NOT NULL,
        "content" jsonb NOT NULL,
        "llm_model" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "properties_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
        "user_id" integer,
        "name" text NOT NULL,
        "location" text NOT NULL,
        "market" text NOT NULL,
        "image_url" text NOT NULL,
        "status" text NOT NULL,
        "acquisition_date" text NOT NULL,
        "operations_start_date" text NOT NULL,
        "purchase_price" real NOT NULL,
        "building_improvements" real NOT NULL,
        "pre_opening_costs" real NOT NULL,
        "operating_reserve" real NOT NULL,
        "room_count" integer NOT NULL,
        "start_adr" real NOT NULL,
        "adr_growth_rate" real NOT NULL,
        "start_occupancy" real NOT NULL,
        "max_occupancy" real NOT NULL,
        "occupancy_ramp_months" integer NOT NULL,
        "occupancy_growth_step" real NOT NULL,
        "stabilization_months" integer NOT NULL,
        "type" text NOT NULL,
        "catering_level" text NOT NULL,
        "acquisition_ltv" real,
        "acquisition_interest_rate" real,
        "acquisition_term_years" integer,
        "acquisition_closing_cost_rate" real,
        "will_refinance" text,
        "refinance_date" text,
        "refinance_ltv" real,
        "refinance_interest_rate" real,
        "refinance_term_years" integer,
        "refinance_closing_cost_rate" real,
        "cost_rate_rooms" real DEFAULT 0.36 NOT NULL,
        "cost_rate_fb" real DEFAULT 0.15 NOT NULL,
        "cost_rate_admin" real DEFAULT 0.08 NOT NULL,
        "cost_rate_marketing" real DEFAULT 0.01 NOT NULL,
        "cost_rate_property_ops" real DEFAULT 0.04 NOT NULL,
        "cost_rate_utilities" real DEFAULT 0.05 NOT NULL,
        "cost_rate_insurance" real DEFAULT 0.02 NOT NULL,
        "cost_rate_taxes" real DEFAULT 0.03 NOT NULL,
        "cost_rate_it" real DEFAULT 0.005 NOT NULL,
        "cost_rate_ffe" real DEFAULT 0.04 NOT NULL,
        "cost_rate_other" real DEFAULT 0.05 NOT NULL,
        "rev_share_events" real DEFAULT 0.43 NOT NULL,
        "rev_share_fb" real DEFAULT 0.22 NOT NULL,
        "rev_share_other" real DEFAULT 0.07 NOT NULL,
        "full_catering_percent" real DEFAULT 0.4 NOT NULL,
        "partial_catering_percent" real DEFAULT 0.3 NOT NULL,
        "exit_cap_rate" real DEFAULT 0.085 NOT NULL,
        "tax_rate" real DEFAULT 0.25 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scenarios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
        "user_id" integer NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "global_assumptions" jsonb NOT NULL,
        "properties" jsonb NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "expires_at" timestamp NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
        "email" text NOT NULL,
        "password_hash" text NOT NULL,
        "role" text DEFAULT 'user' NOT NULL,
        "name" text,
        "company" text,
        "title" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD CONSTRAINT "global_assumptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_logs" ADD CONSTRAINT "login_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_research" ADD CONSTRAINT "market_research_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_research" ADD CONSTRAINT "market_research_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "design_themes_is_active_idx" ON "design_themes" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "global_assumptions_user_id_idx" ON "global_assumptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_logs_user_id_idx" ON "login_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_logs_session_id_idx" ON "login_logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "login_logs_login_at_idx" ON "login_logs" USING btree ("login_at");--> statement-breakpoint
CREATE INDEX "market_research_user_id_idx" ON "market_research" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "market_research_type_idx" ON "market_research" USING btree ("type");--> statement-breakpoint
CREATE INDEX "market_research_property_id_idx" ON "market_research" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "properties_user_id_idx" ON "properties" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scenarios_user_id_idx" ON "scenarios" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");