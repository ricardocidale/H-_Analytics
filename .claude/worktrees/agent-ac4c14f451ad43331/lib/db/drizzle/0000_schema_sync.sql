CREATE TABLE "asset_descriptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "asset_descriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_brands" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "business_brands_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"logo_id" integer,
	"is_default" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "companies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"type" text DEFAULT 'spv' NOT NULL,
	"description" text,
	"logo_id" integer,
	"theme_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "design_themes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "design_themes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text NOT NULL,
	"colors" jsonb NOT NULL,
	"icon_set" text DEFAULT 'lucide' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "logos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"company_name" text DEFAULT 'Hospitality Business Group' NOT NULL,
	"url" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_app_logo" boolean DEFAULT false NOT NULL,
	"visibility" text DEFAULT 'all' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_default_properties" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_default_properties_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "uq_user_default_property" UNIQUE("user_id","property_id")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"password_hash" text,
	"role" text DEFAULT 'user' NOT NULL,
	"first_name" text,
	"last_name" text,
	"company" text,
	"title" text,
	"selected_theme_id" integer,
	"phone_number" text,
	"google_id" text,
	"google_access_token" text,
	"google_refresh_token" text,
	"google_token_expiry" timestamp,
	"hide_tour_prompt" boolean DEFAULT false NOT NULL,
	"can_manage_scenarios" boolean DEFAULT true NOT NULL,
	"rebecca_opt_out" boolean DEFAULT false NOT NULL,
	"color_mode" text,
	"bg_animation" text,
	"font_preference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "global_assumptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "global_assumptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"app_name" text,
	"company_name" text DEFAULT 'Hospitality Business' NOT NULL,
	"company_logo" text,
	"company_logo_id" integer,
	"property_label" text DEFAULT 'Boutique Hotel' NOT NULL,
	"asset_description" text,
	"asset_logo_id" integer,
	"model_start_date" text NOT NULL,
	"projection_years" integer DEFAULT 10 NOT NULL,
	"company_ops_start_date" text DEFAULT '2026-06-01' NOT NULL,
	"fiscal_year_start_month" integer DEFAULT 1 NOT NULL,
	"inflation_rate" real DEFAULT 0.03 NOT NULL,
	"fixed_cost_escalation_rate" real DEFAULT 0.03 NOT NULL,
	"company_inflation_rate" real,
	"base_management_fee" real DEFAULT 0.085 NOT NULL,
	"incentive_management_fee" real DEFAULT 0.12 NOT NULL,
	"default_owner_priority_return" real,
	"default_fee_subordination" text DEFAULT 'partial' NOT NULL,
	"funding_source_label" text DEFAULT 'Funding Vehicle' NOT NULL,
	"capital_raise_1_amount" real DEFAULT 800000 NOT NULL,
	"capital_raise_1_date" text DEFAULT '2026-06-01' NOT NULL,
	"capital_raise_2_amount" real DEFAULT 800000 NOT NULL,
	"capital_raise_2_date" text DEFAULT '2027-04-01' NOT NULL,
	"capital_raise_valuation_cap" real DEFAULT 2500000 NOT NULL,
	"capital_raise_discount_rate" real DEFAULT 0.2 NOT NULL,
	"funding_interest_rate" real DEFAULT 0.08 NOT NULL,
	"funding_interest_payment_frequency" text DEFAULT 'accrues_only' NOT NULL,
	"runway_buffer_months" real,
	"sizing_overshoot_pct" real,
	"revenue_ramp_delay_months" real,
	"burn_flex_down_pct" real,
	"icp_model_tier" text,
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
	"staff_salary" real DEFAULT 65000 NOT NULL,
	"staff_tier1_max_properties" integer DEFAULT 3 NOT NULL,
	"staff_tier1_fte" real DEFAULT 2.5 NOT NULL,
	"staff_tier2_max_properties" integer DEFAULT 6 NOT NULL,
	"staff_tier2_fte" real DEFAULT 4.5 NOT NULL,
	"staff_tier3_fte" real DEFAULT 7 NOT NULL,
	"office_lease_start" real DEFAULT 36000 NOT NULL,
	"professional_services_start" real DEFAULT 24000 NOT NULL,
	"tech_infra_start" real DEFAULT 18000 NOT NULL,
	"business_insurance_start" real DEFAULT 12000 NOT NULL,
	"travel_cost_per_client" real DEFAULT 5000 NOT NULL,
	"it_license_per_client" real DEFAULT 3600 NOT NULL,
	"marketing_rate" real DEFAULT 0.05 NOT NULL,
	"misc_ops_rate" real DEFAULT 0.03 NOT NULL,
	"commission_rate" real DEFAULT 0.05 NOT NULL,
	"standard_acq_package" jsonb NOT NULL,
	"debt_assumptions" jsonb NOT NULL,
	"company_tax_rate" real DEFAULT 0.21 NOT NULL,
	"cost_of_equity" real DEFAULT 0.18 NOT NULL,
	"exit_cap_rate" real DEFAULT 0.085 NOT NULL,
	"sales_commission_rate" real DEFAULT 0.05 NOT NULL,
	"industry_vertical" text,
	"exit_revenue_multiple" real,
	"event_expense_rate" real DEFAULT 0.65 NOT NULL,
	"other_expense_rate" real DEFAULT 0.6 NOT NULL,
	"utilities_variable_split" real DEFAULT 0.6 NOT NULL,
	"icp_config" jsonb,
	"export_config" jsonb,
	"asset_definition" jsonb DEFAULT '{"minRooms":10,"maxRooms":80,"hasFB":true,"hasEvents":true,"hasWellness":true,"minAdr":150,"maxAdr":600,"level":"luxury","eventLocations":2,"maxEventCapacity":150,"acreage":10,"privacyLevel":"high","parkingSpaces":50,"description":"Luxury boutique hotels on private estates of 10+ acres, catering to 100+ person exotic, unique, and corporate events in exclusive, secluded settings with full-service F&B, wellness programming, and curated guest experiences."}'::jsonb NOT NULL,
	"preferred_llm" text DEFAULT 'claude-sonnet-4-5' NOT NULL,
	"company_phone" text,
	"company_email" text,
	"company_website" text,
	"company_ein" text,
	"company_founding_year" integer,
	"company_street_address" text,
	"company_city" text,
	"company_state_province" text,
	"company_country" text,
	"company_zip_postal_code" text,
	"show_company_calculation_details" boolean DEFAULT true NOT NULL,
	"show_property_calculation_details" boolean DEFAULT true NOT NULL,
	"sidebar_property_finder" boolean DEFAULT true NOT NULL,
	"sidebar_sensitivity" boolean DEFAULT true NOT NULL,
	"sidebar_financing" boolean DEFAULT true NOT NULL,
	"sidebar_compare" boolean DEFAULT true NOT NULL,
	"sidebar_timeline" boolean DEFAULT true NOT NULL,
	"sidebar_map_view" boolean DEFAULT false NOT NULL,
	"sidebar_executive_summary" boolean DEFAULT true NOT NULL,
	"sidebar_scenarios" boolean DEFAULT true NOT NULL,
	"sidebar_user_manual" boolean DEFAULT true NOT NULL,
	"sidebar_research" boolean DEFAULT true NOT NULL,
	"show_ai_assistant" boolean DEFAULT false NOT NULL,
	"rebecca_enabled" boolean DEFAULT true NOT NULL,
	"rebecca_display_name" text DEFAULT 'Rebecca' NOT NULL,
	"rebecca_system_prompt" text,
	"rebecca_chat_engine" text DEFAULT 'gemini' NOT NULL,
	"rebecca_config" jsonb,
	"research_config" jsonb DEFAULT '{}'::jsonb,
	"last_full_research_refresh" timestamp,
	"auto_research_refresh_enabled" boolean DEFAULT false NOT NULL,
	"depreciation_years" real DEFAULT 39 NOT NULL,
	"days_per_month" real DEFAULT 30.5 NOT NULL,
	"default_start_adr" real,
	"default_adr_growth_rate" real,
	"default_start_occupancy" real,
	"default_max_occupancy" real,
	"default_occupancy_ramp_months" integer,
	"default_room_count" integer,
	"default_rev_share_fb" real,
	"default_rev_share_events" real,
	"default_rev_share_other" real,
	"default_catering_boost_pct" real,
	"default_cost_rate_rooms" real,
	"default_cost_rate_fb" real,
	"default_cost_rate_admin" real,
	"default_cost_rate_marketing" real,
	"default_cost_rate_property_ops" real,
	"default_cost_rate_utilities" real,
	"default_cost_rate_taxes" real,
	"default_cost_rate_it" real,
	"default_cost_rate_ffe" real,
	"default_cost_rate_other" real,
	"default_cost_rate_insurance" real,
	"default_property_tax_rate" real,
	"default_land_value_percent" real,
	"default_color_mode" text,
	"default_bg_animation" text,
	"default_font_preference" text,
	"last_assumption_change_at" timestamp,
	"saved_tabs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ga_projection_years_range" CHECK ("global_assumptions"."projection_years" >= 1 AND "global_assumptions"."projection_years" <= 30),
	CONSTRAINT "ga_inflation_rate_range" CHECK ("global_assumptions"."inflation_rate" >= 0 AND "global_assumptions"."inflation_rate" <= 1),
	CONSTRAINT "ga_base_mgmt_fee_range" CHECK ("global_assumptions"."base_management_fee" >= 0 AND "global_assumptions"."base_management_fee" <= 1),
	CONSTRAINT "ga_incentive_mgmt_fee_range" CHECK ("global_assumptions"."incentive_management_fee" >= 0 AND "global_assumptions"."incentive_management_fee" <= 1),
	CONSTRAINT "ga_commission_rate_range" CHECK ("global_assumptions"."commission_rate" >= 0 AND "global_assumptions"."commission_rate" <= 1),
	CONSTRAINT "ga_company_tax_rate_range" CHECK ("global_assumptions"."company_tax_rate" >= 0 AND "global_assumptions"."company_tax_rate" <= 1),
	CONSTRAINT "ga_exit_cap_rate_range" CHECK ("global_assumptions"."exit_cap_rate" > 0 AND "global_assumptions"."exit_cap_rate" <= 1)
);
--> statement-breakpoint
CREATE TABLE "seed_defaults" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "seed_defaults_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entity_type" text NOT NULL,
	"entity_key" text NOT NULL,
	"field_name" text NOT NULL,
	"seed_value" jsonb NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_seed_defaults_entity_field" UNIQUE("entity_type","entity_key","field_name")
);
--> statement-breakpoint
CREATE TABLE "model_constant_overrides" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "model_constant_overrides_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"constant_key" text NOT NULL,
	"country" text,
	"country_subdivision" text,
	"value" jsonb NOT NULL,
	"source" text NOT NULL,
	"authority" text,
	"reference_url" text,
	"research_run_id" integer,
	"override_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	CONSTRAINT "uq_mco_key_country_subdivision" UNIQUE("constant_key","country","country_subdivision"),
	CONSTRAINT "mco_source_check" CHECK ("model_constant_overrides"."source" IN ('analyst', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "model_constants" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "model_constants_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"constant_key" text NOT NULL,
	"country" text,
	"country_subdivision" text,
	"value" jsonb NOT NULL,
	"unit" text,
	"authority_source" text NOT NULL,
	"authority_ref" text,
	"effective_from" date,
	"notes" text,
	"last_edited_by" integer,
	"last_edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_mc_key_country_subdivision" UNIQUE("constant_key","country","country_subdivision")
);
--> statement-breakpoint
CREATE TABLE "model_defaults" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "model_defaults_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"default_key" text NOT NULL,
	"category" text NOT NULL,
	"sub_tab" text NOT NULL,
	"card_key" text NOT NULL,
	"country" text,
	"country_subdivision" text,
	"business_type" text,
	"size_band" text,
	"value" jsonb NOT NULL,
	"unit" text,
	"label" text,
	"proposed_value" jsonb,
	"proposed_range_low" jsonb,
	"proposed_range_high" jsonb,
	"proposed_authority" text,
	"proposed_reference_url" text,
	"proposed_conviction" real,
	"proposed_research_run_id" integer,
	"proposed_at" timestamp with time zone,
	"last_set_by" integer,
	"last_set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_set_reason" text,
	"last_set_source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_model_defaults_key_scope" UNIQUE("default_key","country","country_subdivision","business_type","size_band"),
	CONSTRAINT "model_defaults_last_set_source_check" CHECK ("model_defaults"."last_set_source" IN ('seed', 'manual', 'analyst_accepted'))
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "properties_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"street_address" text,
	"street_address_2" text,
	"city" text,
	"state_province" text,
	"zip_postal_code" text,
	"country" text,
	"market" text NOT NULL,
	"image_url" text NOT NULL,
	"status" text DEFAULT 'Pipeline' NOT NULL,
	"acquisition_date" text NOT NULL,
	"operations_start_date" text NOT NULL,
	"purchase_price" real NOT NULL,
	"building_improvements" real NOT NULL,
	"land_value_percent" real DEFAULT 0.25 NOT NULL,
	"pre_opening_costs" real NOT NULL,
	"operating_reserve" real NOT NULL,
	"room_count" integer NOT NULL,
	"start_adr" real NOT NULL,
	"adr_growth_rate" real NOT NULL,
	"start_occupancy" real NOT NULL,
	"max_occupancy" real NOT NULL,
	"occupancy_ramp_months" integer NOT NULL,
	"occupancy_growth_step" real NOT NULL,
	"stabilization_months" integer DEFAULT 36 NOT NULL,
	"pricing_model" text,
	"nightly_property_rate" real,
	"max_guests" integer,
	"seasonality_profile" jsonb,
	"occupancy_ramp_curve" jsonb,
	"type" text NOT NULL,
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
	"cost_rate_rooms" real DEFAULT 0.2 NOT NULL,
	"cost_rate_fb" real DEFAULT 0.09 NOT NULL,
	"cost_rate_admin" real DEFAULT 0.08 NOT NULL,
	"cost_rate_marketing" real DEFAULT 0.01 NOT NULL,
	"cost_rate_property_ops" real DEFAULT 0.04 NOT NULL,
	"cost_rate_utilities" real DEFAULT 0.05 NOT NULL,
	"cost_rate_taxes" real DEFAULT 0.012 NOT NULL,
	"cost_rate_it" real DEFAULT 0.005 NOT NULL,
	"cost_rate_ffe" real DEFAULT 0.04 NOT NULL,
	"cost_rate_other" real DEFAULT 0.05 NOT NULL,
	"cost_rate_insurance" real DEFAULT 0.015 NOT NULL,
	"rev_share_events" real DEFAULT 0.18 NOT NULL,
	"rev_share_fb" real DEFAULT 0.3 NOT NULL,
	"rev_share_other" real DEFAULT 0.03 NOT NULL,
	"catering_boost_percent" real DEFAULT 0 NOT NULL,
	"exit_cap_rate" real DEFAULT 0.085 NOT NULL,
	"tax_rate" real DEFAULT 0.25 NOT NULL,
	"inflation_rate" real,
	"country_risk_premium" real,
	"disposition_commission" real DEFAULT 0.05 NOT NULL,
	"refinance_years_after_acquisition" integer,
	"base_management_fee_rate" real DEFAULT 0.085 NOT NULL,
	"incentive_management_fee_rate" real DEFAULT 0.12 NOT NULL,
	"franchise_fee_rate" real,
	"royalty_fee_rate" real,
	"brand_marketing_fee_rate" real,
	"loyalty_program_fee_rate" real,
	"reservation_fee_rate" real,
	"brand_technology_fee_rate" real,
	"hma_term_years" integer,
	"hma_termination_notice_months" integer,
	"hma_contract_start_year" integer,
	"hma_termination_fee_months" integer,
	"pip_schedule_json" jsonb,
	"condo_dues_pct_revenue" real,
	"condo_exposure_notes" text,
	"condo_pending_special_assessments" real,
	"owner_priority_return" real,
	"fee_subordination" text,
	"performance_test_enabled" boolean DEFAULT false NOT NULL,
	"ar_days" integer DEFAULT 30 NOT NULL,
	"ap_days" integer DEFAULT 45 NOT NULL,
	"reinvestment_rate" real DEFAULT 0.05 NOT NULL,
	"day_count_convention" text DEFAULT '30/360' NOT NULL,
	"escalation_method" text DEFAULT 'annual' NOT NULL,
	"cost_seg_enabled" boolean DEFAULT false NOT NULL,
	"cost_seg_5yr_pct" real DEFAULT 0.15 NOT NULL,
	"cost_seg_7yr_pct" real DEFAULT 0.1 NOT NULL,
	"cost_seg_15yr_pct" real DEFAULT 0.05 NOT NULL,
	"depreciation_years" real,
	"star_rating" integer,
	"star_rating_source" text DEFAULT 'manual',
	"star_rating_suggested" integer,
	"quality_tier" text DEFAULT 'upscale' NOT NULL,
	"hospitality_type" text DEFAULT 'hotel' NOT NULL,
	"business_model" text DEFAULT 'hotel' NOT NULL,
	"platform_fee_rate" real,
	"brand_id" integer,
	"description" text,
	"service_level" text,
	"location_type" text,
	"market_tier" text,
	"guest_mix_business" real,
	"guest_mix_leisure" real,
	"guest_mix_group" real,
	"fb_venues" integer,
	"fb_seats" integer,
	"event_space_sqft" integer,
	"total_property_acreage" real,
	"total_building_sqft" integer,
	"year_built" integer,
	"last_renovation_year" integer,
	"management_type" text,
	"on_municipal_sewer" boolean DEFAULT false,
	"str_exempt" boolean DEFAULT false NOT NULL,
	"conversion_cost" real,
	"room_addition_cost" real,
	"event_venue_cost" real,
	"commercial_kitchen_cost" real,
	"zoning_permit_cost" real,
	"fire_code_ada_cost" real,
	"liquor_license_cost" real,
	"operating_deficit_reserve" real,
	"estimated_conversion_months" integer,
	"latitude" real,
	"longitude" real,
	"stable_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"research_values" jsonb,
	"source_urls" text[],
	"price_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"original_list_price" real,
	"original_list_date" text,
	"prior_sale_price" real,
	"prior_sale_date" text,
	"cumulative_drop_pct" real,
	"current_dom" integer,
	"relist_count" integer DEFAULT 0 NOT NULL,
	"motivation_tier" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_assumption_change_at" timestamp,
	"validation_status" text DEFAULT 'pending_validation' NOT NULL,
	"last_validated_at" timestamp,
	"flagged_field_count" integer DEFAULT 0 NOT NULL,
	"financials_computed_at" timestamp,
	"validation_reason" text,
	"archived_at" timestamp,
	"archived_by" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "properties_stable_key_unique" UNIQUE("stable_key"),
	CONSTRAINT "prop_room_count_positive" CHECK ("properties"."room_count" > 0),
	CONSTRAINT "prop_start_adr_positive" CHECK ("properties"."start_adr" > 0),
	CONSTRAINT "prop_start_occupancy_range" CHECK ("properties"."start_occupancy" >= 0 AND "properties"."start_occupancy" <= 1),
	CONSTRAINT "prop_max_occupancy_range" CHECK ("properties"."max_occupancy" >= 0 AND "properties"."max_occupancy" <= 1),
	CONSTRAINT "prop_occupancy_growth_range" CHECK ("properties"."occupancy_growth_step" >= 0 AND "properties"."occupancy_growth_step" <= 1),
	CONSTRAINT "prop_tax_rate_range" CHECK ("properties"."tax_rate" >= 0 AND "properties"."tax_rate" <= 1),
	CONSTRAINT "prop_exit_cap_rate_range" CHECK ("properties"."exit_cap_rate" > 0 AND "properties"."exit_cap_rate" <= 1),
	CONSTRAINT "prop_base_mgmt_fee_range" CHECK ("properties"."base_management_fee_rate" >= 0 AND "properties"."base_management_fee_rate" <= 1),
	CONSTRAINT "prop_incentive_mgmt_fee_range" CHECK ("properties"."incentive_management_fee_rate" >= 0 AND "properties"."incentive_management_fee_rate" <= 1)
);
--> statement-breakpoint
CREATE TABLE "property_urls" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "property_urls_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"is_valid" boolean,
	"is_relevant" boolean,
	"relevance_score" real,
	"last_checked_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dd_template_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dd_template_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"workstream" text NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"is_stop_gate" boolean DEFAULT false NOT NULL,
	"default_vendor_type" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"template_version" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dd_template_items_workstream_valid" CHECK ("dd_template_items"."workstream" IN ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10))
);
--> statement-breakpoint
CREATE TABLE "property_dd_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "property_dd_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"template_item_key" text NOT NULL,
	"workstream" text NOT NULL,
	"label" text NOT NULL,
	"is_stop_gate" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"owner_user_id" integer,
	"owner_name" text,
	"vendor" text,
	"due_date" text,
	"cost_estimate" real,
	"cost_actual" real,
	"findings" text,
	"document_url" text,
	"seeded_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "property_dd_items_status_valid" CHECK ("property_dd_items"."status" IN ($1, $2, $3, $4, $5))
);
--> statement-breakpoint
CREATE TABLE "company_service_templates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "company_service_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"default_rate" real DEFAULT 0 NOT NULL,
	"service_model" text DEFAULT 'centralized' NOT NULL,
	"service_markup" real DEFAULT 0.2 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_template_rate_range" CHECK ("company_service_templates"."default_rate" >= 0 AND "company_service_templates"."default_rate" <= 1),
	CONSTRAINT "service_template_markup_range" CHECK ("company_service_templates"."service_markup" >= 0 AND "company_service_templates"."service_markup" <= 1),
	CONSTRAINT "service_template_model_check" CHECK ("company_service_templates"."service_model" IN ('centralized', 'direct'))
);
--> statement-breakpoint
CREATE TABLE "property_fee_categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "property_fee_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"name" text NOT NULL,
	"rate" real DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fee_cat_rate_range" CHECK ("property_fee_categories"."rate" >= 0 AND "property_fee_categories"."rate" <= 1)
);
--> statement-breakpoint
CREATE TABLE "property_photos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "property_photos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"image_url" text NOT NULL,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_hero" boolean DEFAULT false NOT NULL,
	"variants" jsonb,
	"generation_style" text,
	"before_photo_id" integer,
	"image_data" text,
	"enhanced_image_data" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "render_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "render_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"style_key" text NOT NULL,
	"label" text NOT NULL,
	"model" text NOT NULL,
	"prompt_prefix" text DEFAULT '' NOT NULL,
	"prompt_suffix" text DEFAULT '' NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_img2img" boolean DEFAULT false NOT NULL,
	"requires_source_image" boolean DEFAULT false NOT NULL,
	"prompt_optional" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"auto_enhance_enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_per_minute" integer DEFAULT 5 NOT NULL,
	"default_image_size" text DEFAULT '1024x1024' NOT NULL,
	"default_quality" integer DEFAULT 95 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "render_settings_style_key_unique" UNIQUE("style_key")
);
--> statement-breakpoint
CREATE TABLE "scenario_access" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scenario_access_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scenario_id" integer,
	"owner_id" integer NOT NULL,
	"grantee_id" integer NOT NULL,
	"grant_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scenario_access_unique_grant" UNIQUE("scenario_id","owner_id","grantee_id","grant_type")
);
--> statement-breakpoint
CREATE TABLE "scenario_property_overrides" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scenario_property_overrides_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scenario_id" integer NOT NULL,
	"property_id" integer,
	"property_name" text NOT NULL,
	"change_type" text DEFAULT 'modified' NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"base_property_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "spo_scenario_property_unique" UNIQUE("scenario_id","property_name")
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scenarios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"global_assumptions" jsonb NOT NULL,
	"properties" jsonb NOT NULL,
	"scenario_images" jsonb,
	"fee_categories" jsonb,
	"property_photos" jsonb,
	"service_templates" jsonb,
	"computed_results" jsonb,
	"compute_hash" text,
	"version" integer DEFAULT 1 NOT NULL,
	"base_snapshot_hash" text,
	"last_output_hash" text,
	"last_computed_at" timestamp,
	"last_engine_version" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"kind" text DEFAULT 'manual' NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" integer,
	"purge_after" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_results" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scenario_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scenario_id" integer NOT NULL,
	"engine_version" text NOT NULL,
	"output_hash" text NOT NULL,
	"inputs_hash" text NOT NULL,
	"consolidated_yearly_json" jsonb NOT NULL,
	"audit_opinion" text NOT NULL,
	"projection_years" integer NOT NULL,
	"property_count" integer NOT NULL,
	"computed_by" integer,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scenario_results_scenario_output_unique" UNIQUE("scenario_id","output_hash")
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer,
	"entity_name" text,
	"metadata" jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "verification_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "verification_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"total_checks" integer NOT NULL,
	"passed" integer NOT NULL,
	"failed" integer NOT NULL,
	"audit_opinion" text NOT NULL,
	"overall_status" text NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_resource_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_resource_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"resource_id" integer NOT NULL,
	"version" integer NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_ref" text,
	"change_summary" text,
	"changed_by_user_id" integer,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_resources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_resources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_ref" text,
	"version" integer DEFAULT 1 NOT NULL,
	"last_health_status" text DEFAULT 'gray' NOT NULL,
	"last_checked_at" timestamp,
	"created_by_user_id" integer,
	"updated_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_break_glass_overrides" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_break_glass_overrides_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"specialist_id" text NOT NULL,
	"assignment_kind" text NOT NULL,
	"assignment_slug" text NOT NULL,
	"assignment_role" text,
	"override_resource_id" integer,
	"reason" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"revoked_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "resource_health_checks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "resource_health_checks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"resource_id" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"latency_ms" integer,
	"error_code" text,
	"error_message" text,
	"triggered_by_user_id" integer,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_specialist_connections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "resource_specialist_connections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"resource_id" integer NOT NULL,
	"target" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialist_assignments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "specialist_assignments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"specialist_id" text NOT NULL,
	"assignment_kind" text NOT NULL,
	"assignment_slug" text NOT NULL,
	"assignment_role" text,
	"required" boolean DEFAULT true NOT NULL,
	"resource_id" integer,
	"materialized_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialist_research_quality_snapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "specialist_research_quality_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"specialist_id" text NOT NULL,
	"score" integer NOT NULL,
	"gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialist_config_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "specialist_config_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"specialist_id" text NOT NULL,
	"version" integer NOT NULL,
	"section" text NOT NULL,
	"prompt_template" text DEFAULT '' NOT NULL,
	"model_resource_id" integer,
	"analyst_a_model_resource_id" integer,
	"analyst_b_model_resource_id" integer,
	"synthesis_model_resource_id" integer,
	"fallback_model_resource_id" integer,
	"multi_model_enabled" boolean,
	"workflow_overrides" jsonb,
	"required_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"field_requirements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prerequisite_toggles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"runtime_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"refresh_cadence_days" integer,
	"change_summary" text,
	"changed_by_user_id" integer,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialist_configs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "specialist_configs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"specialist_id" text NOT NULL,
	"prompt_template" text DEFAULT '' NOT NULL,
	"model_resource_id" integer,
	"analyst_a_model_resource_id" integer,
	"analyst_b_model_resource_id" integer,
	"synthesis_model_resource_id" integer,
	"fallback_model_resource_id" integer,
	"multi_model_enabled" boolean,
	"workflow_overrides" jsonb,
	"required_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"field_requirements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prerequisite_toggles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"runtime_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"refresh_cadence_days" integer,
	"last_observed_missing" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_observed_missing_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialist_identity_override_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "specialist_identity_override_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"specialist_id" text NOT NULL,
	"action" text NOT NULL,
	"prev_human_name" text,
	"prev_gender" text,
	"next_human_name" text,
	"next_gender" text,
	"change_summary" text,
	"changed_by_user_id" integer,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialist_identity_overrides" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "specialist_identity_overrides_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"specialist_id" text NOT NULL,
	"human_name" text,
	"gender" text,
	"updated_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialist_recommendation_counters" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "specialist_recommendation_counters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"specialist_id" text NOT NULL,
	"field_key" text NOT NULL,
	"appearances" integer DEFAULT 0 NOT NULL,
	"first_observed_at" timestamp DEFAULT now() NOT NULL,
	"last_observed_at" timestamp DEFAULT now() NOT NULL,
	"last_promoted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "specialist_recommendation_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "specialist_recommendation_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"specialist_id" text NOT NULL,
	"field_key" text NOT NULL,
	"action" text NOT NULL,
	"actor_user_id" integer,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calculation_audit_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "calculation_audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scenario_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"engine_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"output_hash" text NOT NULL,
	"audit_opinion" text NOT NULL,
	"duration_ms" real NOT NULL,
	"total_steps" integer DEFAULT 0 NOT NULL,
	"log_entries" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analyst_refresh_audit_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "analyst_refresh_audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"table_id" text NOT NULL,
	"admin_id" integer,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"source_count" integer,
	"tokens_used" integer,
	"diff_summary" jsonb,
	"ip_address" text,
	"user_agent" text,
	"status" text DEFAULT 'success' NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "analyst_refresh_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"global_cadence_days" integer DEFAULT 30 NOT NULL,
	"last_suspicious_alert_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capital_raise_benchmarks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "capital_raise_benchmarks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"dimension_key" text NOT NULL,
	"label" text NOT NULL,
	"unit" text DEFAULT 'usd' NOT NULL,
	"value_low" real,
	"value_mid" real,
	"value_high" real,
	"source_count" integer DEFAULT 0 NOT NULL,
	"last_refreshed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "capital_raise_benchmarks_dimension_key_unique" UNIQUE("dimension_key")
);
--> statement-breakpoint
CREATE TABLE "exit_multiples" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "exit_multiples_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"dimension_key" text NOT NULL,
	"label" text NOT NULL,
	"unit" text DEFAULT 'x_revenue' NOT NULL,
	"value_low" real,
	"value_mid" real,
	"value_high" real,
	"source_count" integer DEFAULT 0 NOT NULL,
	"last_refreshed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exit_multiples_dimension_key_unique" UNIQUE("dimension_key")
);
--> statement-breakpoint
CREATE TABLE "market_rates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "market_rates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"rate_key" text NOT NULL,
	"value" real,
	"display_value" text,
	"source" text NOT NULL,
	"source_url" text,
	"series_id" text,
	"published_at" timestamp,
	"fetched_at" timestamp,
	"is_manual" boolean DEFAULT false NOT NULL,
	"manual_note" text,
	"max_staleness_hours" integer DEFAULT 24 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "market_rates_rate_key_unique" UNIQUE("rate_key")
);
--> statement-breakpoint
CREATE TABLE "market_research" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "market_research_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"type" text NOT NULL,
	"property_id" integer,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"prompt_conditions" jsonb,
	"llm_model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospective_properties" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "prospective_properties_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"external_id" text NOT NULL,
	"source" text DEFAULT 'realty-in-us' NOT NULL,
	"address" text NOT NULL,
	"city" text,
	"state" text,
	"zip_code" text,
	"price" real,
	"beds" integer,
	"baths" real,
	"sqft" real,
	"lot_size_acres" real,
	"property_type" text,
	"image_url" text,
	"listing_url" text,
	"notes" text,
	"raw_data" jsonb,
	"price_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"original_list_price" real,
	"original_list_date" text,
	"prior_sale_price" real,
	"prior_sale_date" text,
	"cumulative_drop_pct" real,
	"current_dom" integer,
	"relist_count" integer DEFAULT 0 NOT NULL,
	"motivation_tier" text DEFAULT 'firm' NOT NULL,
	"saved_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prospective_props_user_external_source" UNIQUE("user_id","external_id","source")
);
--> statement-breakpoint
CREATE TABLE "research_questions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "research_questions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"question" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "saved_searches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"price_min" text,
	"price_max" text,
	"beds_min" text,
	"lot_size_min" text,
	"property_type" text,
	"saved_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "airport_distances" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "airport_distances_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"airport_code" text NOT NULL,
	"airport_name" text NOT NULL,
	"distance_km" real,
	"drive_minutes" integer,
	"is_international" boolean DEFAULT false,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_airport_property" UNIQUE("property_id","airport_code")
);
--> statement-breakpoint
CREATE TABLE "analyst_cooldowns" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"reserved_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assumption_acknowledgments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assumption_acknowledgments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"field_name" text NOT NULL,
	"value_at_ack" real NOT NULL,
	"range_low_at_ack" real NOT NULL,
	"range_high_at_ack" real NOT NULL,
	"acked_at" timestamp DEFAULT now() NOT NULL,
	"user_id" integer,
	CONSTRAINT "assumption_ack_entity_field_uq" UNIQUE("entity_type","entity_id","field_name","user_id")
);
--> statement-breakpoint
CREATE TABLE "assumption_change_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assumption_change_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"scenario_id" integer,
	"field_name" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"change_source" text NOT NULL,
	"reason" text,
	"user_id" integer,
	"research_run_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assumption_guidance" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assumption_guidance_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scenario_id" integer,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"assumption_key" text NOT NULL,
	"value_low" real,
	"value_mid" real,
	"value_high" real,
	"confidence" text,
	"source_name" text,
	"source_date" text,
	"reasoning" text,
	"comparable_set" jsonb,
	"relaxation_level" integer DEFAULT 0,
	"research_run_id" integer,
	"superseded_at" timestamp,
	"data_quality" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assumption_guidance_unique" UNIQUE("scenario_id","entity_type","entity_id","assumption_key")
);
--> statement-breakpoint
CREATE TABLE "benchmark_snapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "benchmark_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"snapshot_key" text NOT NULL,
	"category" text NOT NULL,
	"value" real,
	"source" text,
	"source_url" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"staleness" text DEFAULT 'fresh',
	"cadence" text DEFAULT 'monthly',
	CONSTRAINT "benchmark_snapshots_snapshot_key_unique" UNIQUE("snapshot_key")
);
--> statement-breakpoint
CREATE TABLE "coverage_snapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coverage_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scenario_id" integer,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"total_fields" integer NOT NULL,
	"fresh_count" integer DEFAULT 0 NOT NULL,
	"stale_count" integer DEFAULT 0 NOT NULL,
	"missing_count" integer DEFAULT 0 NOT NULL,
	"coverage_pct" real DEFAULT 0 NOT NULL,
	"snapshot_date" date DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_calendars" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_calendars_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"market" text NOT NULL,
	"country" text NOT NULL,
	"event_name" text NOT NULL,
	"start_month" integer,
	"end_month" integer,
	"specific_date" text,
	"demand_impact" text NOT NULL,
	"is_recurring" boolean DEFAULT true NOT NULL,
	"category" text,
	"estimated_attendees" integer,
	"notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fb_benchmarks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fb_benchmarks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"market" text NOT NULL,
	"country" text NOT NULL,
	"property_type" text NOT NULL,
	"avg_ticket_per_person" real,
	"avg_breakfast_ticket" real,
	"avg_lunch_ticket" real,
	"avg_dinner_ticket" real,
	"avg_bar_revenue_per_guest" real,
	"covers_per_room_night" real,
	"catering_cost_per_event" real,
	"fb_cost_of_goods_percent" real,
	"fb_labor_cost_percent" real,
	"source" text,
	"source_url" text,
	"source_year" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_fb_market_type" UNIQUE("market","property_type")
);
--> statement-breakpoint
CREATE TABLE "guidance_decisions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "guidance_decisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"assumption_guidance_id" integer NOT NULL,
	"action" text NOT NULL,
	"previous_value" real,
	"new_value" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hospitality_benchmarks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "hospitality_benchmarks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"category" text NOT NULL,
	"segment" text NOT NULL,
	"metric_key" text NOT NULL,
	"metric_label" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text NOT NULL,
	"source_year" integer NOT NULL,
	"source_name" text,
	"source_url" text,
	"country" text DEFAULT 'US',
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer,
	CONSTRAINT "hospitality_benchmarks_metric_country_year" UNIQUE("metric_key","country","source_year")
);
--> statement-breakpoint
CREATE TABLE "integration_key_rotations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "integration_key_rotations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"service_key" text NOT NULL,
	"rotated_by" integer,
	"rotated_at" timestamp DEFAULT now() NOT NULL,
	"previous_key_hash" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "labor_rates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "labor_rates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"market" text NOT NULL,
	"country" text NOT NULL,
	"role" text NOT NULL,
	"hourly_rate" real,
	"annual_salary" real,
	"currency" text DEFAULT 'USD' NOT NULL,
	"employment_type" text DEFAULT 'fte' NOT NULL,
	"source" text,
	"source_url" text,
	"source_year" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_labor_market_role" UNIQUE("market","role","employment_type")
);
--> statement-breakpoint
CREATE TABLE "market_adr_index" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "market_adr_index_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"market" text NOT NULL,
	"country" text NOT NULL,
	"quarter" text NOT NULL,
	"avg_adr" real,
	"luxury_adr" real,
	"upscale_adr" real,
	"midscale_adr" real,
	"economy_adr" real,
	"boutique_adr" real,
	"avg_occupancy" real,
	"avg_revpar" real,
	"source" text,
	"source_url" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_market_adr_quarter" UNIQUE("market","quarter")
);
--> statement-breakpoint
CREATE TABLE "pipeline_policies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pipeline_policies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"policy_key" text NOT NULL,
	"tier" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"staleness_threshold_hours" integer DEFAULT 168,
	"max_concurrent_runs" integer DEFAULT 3,
	"daily_token_budget" integer DEFAULT 100000,
	"monthly_token_budget" integer DEFAULT 2000000,
	"relaxation_max_level" integer DEFAULT 5,
	"min_evidence_score" real DEFAULT 0.3,
	"min_comp_count" integer DEFAULT 3,
	"auto_refresh_interval_hours" integer,
	"analyst_a_model_resource_id" integer,
	"analyst_b_model_resource_id" integer,
	"synthesis_model_resource_id" integer,
	"fallback_model_resource_id" integer,
	CONSTRAINT "pipeline_policies_policy_key_unique" UNIQUE("policy_key")
);
--> statement-breakpoint
CREATE TABLE "rebecca_conversations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rebecca_conversations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"property_id" integer,
	"context_type" text DEFAULT 'general' NOT NULL,
	"context_key" text,
	"model" text,
	"language" text DEFAULT 'en',
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rebecca_emails" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rebecca_emails_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"recipient_email" text NOT NULL,
	"subject" text NOT NULL,
	"html_content" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rebecca_feedback" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rebecca_feedback_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"category" text NOT NULL,
	"notes" text,
	"conversation_context" jsonb,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rebecca_guardrails" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rebecca_guardrails_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"label" text NOT NULL,
	"rule" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rebecca_knowledge_base" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rebecca_knowledge_base_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category" text DEFAULT 'custom' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"tags" text[] DEFAULT '{}',
	"priority" integer DEFAULT 50 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rebecca_knowledge_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rebecca_knowledge_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entry_id" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rebecca_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rebecca_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rebecca_preview_fixtures" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rebecca_preview_fixtures_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"settings" jsonb NOT NULL,
	"turns" jsonb NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_replay_at" timestamp,
	"last_replay_status" text,
	"last_replay_summary" jsonb,
	"last_replay_fingerprint" text,
	CONSTRAINT "rebecca_preview_fixtures_name_uq" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "relaxation_traces" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "relaxation_traces_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"research_run_id" integer NOT NULL,
	"level" integer NOT NULL,
	"criteria_active" jsonb,
	"comps_found" integer DEFAULT 0,
	"evidence_score" real,
	"retained" jsonb,
	"relaxed" jsonb
);
--> statement-breakpoint
CREATE TABLE "research_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "research_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"scenario_id" integer,
	"tier" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"duration_ms" integer,
	"model_primary" text,
	"model_secondary" text,
	"model_synthesis" text,
	"tokens_used" integer,
	"estimated_cost" real,
	"error" text,
	"metadata" jsonb,
	"cache_key" text,
	"cache_inputs_hash" text
);
--> statement-breakpoint
CREATE TABLE "scheduled_research_workflows" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scheduled_research_workflows_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workflow_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"research_type" text DEFAULT 'global' NOT NULL,
	"frequency_hours" integer DEFAULT 168 NOT NULL,
	"prompt_instructions" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"last_run_status" text DEFAULT 'pending',
	"last_run_duration_ms" integer,
	"last_run_error" text,
	"priority" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_research_workflows_workflow_key_unique" UNIQUE("workflow_key")
);
--> statement-breakpoint
CREATE TABLE "seasonal_calendars" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "seasonal_calendars_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"market" text NOT NULL,
	"country" text NOT NULL,
	"month" integer NOT NULL,
	"season_type" text NOT NULL,
	"demand_multiplier" real DEFAULT 1 NOT NULL,
	"avg_adr_multiplier" real DEFAULT 1,
	"notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_seasonal_market_month" UNIQUE("market","month")
);
--> statement-breakpoint
CREATE TABLE "source_call_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "source_call_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source_id" integer NOT NULL,
	"service_key" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"http_status" integer,
	"latency_ms" integer,
	"success" boolean NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "source_registry" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "source_registry_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"service_key" text NOT NULL,
	"name" text NOT NULL,
	"source_type" text NOT NULL,
	"trust_score" text DEFAULT 'unverified',
	"category" text NOT NULL,
	"cadence" text,
	"last_health_check" timestamp,
	"last_data_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"endpoint" text,
	"api_key_ref" text,
	"rate_limit_per_min" integer,
	"success_rate" real,
	"avg_latency_ms" integer,
	"cost_per_call" text,
	"data_provided" jsonb,
	CONSTRAINT "source_registry_service_key_unique" UNIQUE("service_key")
);
--> statement-breakpoint
CREATE TABLE "str_ordinance_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "str_ordinance_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"locality_key" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"event_date" text NOT NULL,
	"event_type" text NOT NULL,
	"direction" text DEFAULT 'stable' NOT NULL,
	"source" text,
	"source_url" text,
	"conviction" text DEFAULT 'medium' NOT NULL,
	"rules_snapshot" jsonb,
	"last_refreshed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submarket_supply_projects" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "submarket_supply_projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"submarket_key" text NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"segment" text,
	"key_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"opening_year" integer,
	"distance_km" real,
	"source" text,
	"source_url" text,
	"conviction" text DEFAULT 'medium' NOT NULL,
	"notes" text,
	"last_refreshed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_bulletin_cache" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tax_bulletin_cache_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"country" text NOT NULL,
	"subdivision" text DEFAULT '' NOT NULL,
	"source_url" text NOT NULL,
	"publisher" text NOT NULL,
	"bulletin_hash" text NOT NULL,
	"parsed_values" jsonb NOT NULL,
	"raw_excerpt" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tax_bulletin_jurisdiction" UNIQUE("country","subdivision")
);
--> statement-breakpoint
CREATE TABLE "reference_range" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reference_range_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"domain" text NOT NULL,
	"metric_key" text NOT NULL,
	"label" text NOT NULL,
	"country" text DEFAULT 'GLOBAL' NOT NULL,
	"subdivision" text,
	"market" text,
	"segment" text,
	"property_type" text,
	"year" integer NOT NULL,
	"effective_from" date,
	"effective_until" date,
	"low" real NOT NULL,
	"mid" real NOT NULL,
	"high" real NOT NULL,
	"unit" text NOT NULL,
	"source_id" integer,
	"source_name" text,
	"source_url" text,
	"methodology" text,
	"confidence" text DEFAULT 'medium' NOT NULL,
	"details" jsonb,
	"last_verified_at" timestamp,
	"verified_by" text,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reference_range_unique" UNIQUE("domain","metric_key","country","subdivision","market","segment","property_type","year")
);
--> statement-breakpoint
CREATE TABLE "analyst_watchdog_benchmarks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "analyst_watchdog_benchmarks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"runway_buffer_months_low" real NOT NULL,
	"runway_buffer_months_mid" real NOT NULL,
	"runway_buffer_months_high" real NOT NULL,
	"sizing_overshoot_pct_low" real NOT NULL,
	"sizing_overshoot_pct_mid" real NOT NULL,
	"sizing_overshoot_pct_high" real NOT NULL,
	"tranche_gap_months_low" real NOT NULL,
	"tranche_gap_months_mid" real NOT NULL,
	"tranche_gap_months_high" real NOT NULL,
	"revenue_ramp_delay_months_low" real NOT NULL,
	"revenue_ramp_delay_months_mid" real NOT NULL,
	"revenue_ramp_delay_months_high" real NOT NULL,
	"burn_flex_down_pct_low" real NOT NULL,
	"burn_flex_down_pct_mid" real NOT NULL,
	"burn_flex_down_pct_high" real NOT NULL,
	"last_refreshed_at" timestamp,
	"refreshed_by" text DEFAULT 'stub' NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"n_plus_one_evidence" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "analyst_watchdog_benchmarks_user_uq" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "conversations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"title" text NOT NULL,
	"channel" text DEFAULT 'web' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alert_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"metric" text NOT NULL,
	"operator" text NOT NULL,
	"threshold" real NOT NULL,
	"scope" text DEFAULT 'all' NOT NULL,
	"property_id" integer,
	"cooldown_minutes" integer DEFAULT 1440 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_extractions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "document_extractions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"property_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_content_type" text NOT NULL,
	"object_path" text NOT NULL,
	"document_type" text DEFAULT 'general' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"raw_extraction_data" jsonb,
	"error_message" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_fields" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "extraction_fields_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"extraction_id" integer NOT NULL,
	"field_name" text NOT NULL,
	"field_label" text NOT NULL,
	"extracted_value" text NOT NULL,
	"mapped_property_field" text,
	"confidence" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"current_value" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notification_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"event_type" text NOT NULL,
	"channel" text NOT NULL,
	"recipient" text,
	"subject" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"metadata" jsonb,
	"alert_rule_id" integer,
	"property_id" integer,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notification_preferences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_pref_unique" UNIQUE("user_id","event_type","channel")
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notification_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"setting_key" text NOT NULL,
	"setting_value" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_settings_setting_key_unique" UNIQUE("setting_key")
);
--> statement-breakpoint
CREATE TABLE "external_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"service_key" text NOT NULL,
	"name" text NOT NULL,
	"source_type" text NOT NULL,
	"credential_env_var" text,
	"host" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_subscribed" boolean DEFAULT true NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "external_integrations_service_key_unique" UNIQUE("service_key")
);
--> statement-breakpoint
CREATE TABLE "user_page_visits" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_page_visits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"page_key" text NOT NULL,
	"entity_type" text,
	"entity_id" integer,
	"first_visited_at" timestamp DEFAULT now(),
	"last_visited_at" timestamp DEFAULT now(),
	"last_saved_at" timestamp,
	"last_analyst_run_at" timestamp,
	"endorsed" boolean DEFAULT false NOT NULL,
	"compulsory_fields_complete" boolean DEFAULT false NOT NULL,
	"visit_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "uq_user_page_visit" UNIQUE("user_id","page_key")
);
--> statement-breakpoint
CREATE TABLE "vector_chunks" (
	"namespace" text NOT NULL,
	"id" text NOT NULL,
	"text" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vector_chunks_pk" PRIMARY KEY("namespace","id")
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "media_assets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_filename_unique" UNIQUE("filename")
);
--> statement-breakpoint
CREATE TABLE "scheduler_run_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"scheduler_key" text NOT NULL,
	"ran_at" timestamp DEFAULT now() NOT NULL,
	"considered" integer DEFAULT 0 NOT NULL,
	"succeeded" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "scheduler_runs" (
	"scheduler_key" text PRIMARY KEY NOT NULL,
	"scheduler_label" text NOT NULL,
	"last_run_at" timestamp DEFAULT now() NOT NULL,
	"considered" integer DEFAULT 0 NOT NULL,
	"succeeded" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"cycle_interval_ms" bigint NOT NULL,
	"duration_ms" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_drift_sweep_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"finished_at" timestamp NOT NULL,
	"exit_code" integer NOT NULL,
	"status" text NOT NULL,
	"rewrote_count" integer DEFAULT 0 NOT NULL,
	"copied_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"residual_count" integer DEFAULT 0 NOT NULL,
	"run_id" text,
	"run_url" text,
	"trigger" text,
	"trigger_reason" text,
	"notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache_entries" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_brands" ADD CONSTRAINT "business_brands_logo_id_logos_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."logos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_logo_id_logos_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."logos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_theme_id_design_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."design_themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_default_properties" ADD CONSTRAINT "user_default_properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_selected_theme_id_design_themes_id_fk" FOREIGN KEY ("selected_theme_id") REFERENCES "public"."design_themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD CONSTRAINT "global_assumptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD CONSTRAINT "global_assumptions_company_logo_id_logos_id_fk" FOREIGN KEY ("company_logo_id") REFERENCES "public"."logos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD CONSTRAINT "global_assumptions_asset_logo_id_logos_id_fk" FOREIGN KEY ("asset_logo_id") REFERENCES "public"."logos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_constant_overrides" ADD CONSTRAINT "model_constant_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_constants" ADD CONSTRAINT "model_constants_last_edited_by_users_id_fk" FOREIGN KEY ("last_edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_defaults" ADD CONSTRAINT "model_defaults_last_set_by_users_id_fk" FOREIGN KEY ("last_set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_brand_id_business_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."business_brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_urls" ADD CONSTRAINT "property_urls_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_dd_items" ADD CONSTRAINT "property_dd_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_dd_items" ADD CONSTRAINT "property_dd_items_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_fee_categories" ADD CONSTRAINT "property_fee_categories_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_photos" ADD CONSTRAINT "property_photos_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_access" ADD CONSTRAINT "scenario_access_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_access" ADD CONSTRAINT "scenario_access_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_access" ADD CONSTRAINT "scenario_access_grantee_id_users_id_fk" FOREIGN KEY ("grantee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_property_overrides" ADD CONSTRAINT "scenario_property_overrides_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_property_overrides" ADD CONSTRAINT "scenario_property_overrides_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_results" ADD CONSTRAINT "scenario_results_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_logs" ADD CONSTRAINT "login_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_resource_versions" ADD CONSTRAINT "admin_resource_versions_resource_id_admin_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."admin_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_resource_versions" ADD CONSTRAINT "admin_resource_versions_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_resources" ADD CONSTRAINT "admin_resources_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_resources" ADD CONSTRAINT "admin_resources_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_break_glass_overrides" ADD CONSTRAINT "audit_break_glass_overrides_override_resource_id_admin_resources_id_fk" FOREIGN KEY ("override_resource_id") REFERENCES "public"."admin_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_break_glass_overrides" ADD CONSTRAINT "audit_break_glass_overrides_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_break_glass_overrides" ADD CONSTRAINT "audit_break_glass_overrides_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_health_checks" ADD CONSTRAINT "resource_health_checks_resource_id_admin_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."admin_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_health_checks" ADD CONSTRAINT "resource_health_checks_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_specialist_connections" ADD CONSTRAINT "resource_specialist_connections_resource_id_admin_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."admin_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_assignments" ADD CONSTRAINT "specialist_assignments_resource_id_admin_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."admin_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_config_versions" ADD CONSTRAINT "specialist_config_versions_model_resource_id_admin_resources_id_fk" FOREIGN KEY ("model_resource_id") REFERENCES "public"."admin_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_config_versions" ADD CONSTRAINT "specialist_config_versions_analyst_a_model_resource_id_admin_resources_id_fk" FOREIGN KEY ("analyst_a_model_resource_id") REFERENCES "public"."admin_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_config_versions" ADD CONSTRAINT "specialist_config_versions_analyst_b_model_resource_id_admin_resources_id_fk" FOREIGN KEY ("analyst_b_model_resource_id") REFERENCES "public"."admin_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_config_versions" ADD CONSTRAINT "specialist_config_versions_synthesis_model_resource_id_admin_resources_id_fk" FOREIGN KEY ("synthesis_model_resource_id") REFERENCES "public"."admin_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_config_versions" ADD CONSTRAINT "specialist_config_versions_fallback_model_resource_id_admin_resources_id_fk" FOREIGN KEY ("fallback_model_resource_id") REFERENCES "public"."admin_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_config_versions" ADD CONSTRAINT "specialist_config_versions_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_configs" ADD CONSTRAINT "specialist_configs_model_resource_id_admin_resources_id_fk" FOREIGN KEY ("model_resource_id") REFERENCES "public"."admin_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_configs" ADD CONSTRAINT "specialist_configs_analyst_a_model_resource_id_admin_resources_id_fk" FOREIGN KEY ("analyst_a_model_resource_id") REFERENCES "public"."admin_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_configs" ADD CONSTRAINT "specialist_configs_analyst_b_model_resource_id_admin_resources_id_fk" FOREIGN KEY ("analyst_b_model_resource_id") REFERENCES "public"."admin_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_configs" ADD CONSTRAINT "specialist_configs_synthesis_model_resource_id_admin_resources_id_fk" FOREIGN KEY ("synthesis_model_resource_id") REFERENCES "public"."admin_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_configs" ADD CONSTRAINT "specialist_configs_fallback_model_resource_id_admin_resources_id_fk" FOREIGN KEY ("fallback_model_resource_id") REFERENCES "public"."admin_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_configs" ADD CONSTRAINT "specialist_configs_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_identity_override_versions" ADD CONSTRAINT "specialist_identity_override_versions_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_identity_overrides" ADD CONSTRAINT "specialist_identity_overrides_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_recommendation_events" ADD CONSTRAINT "specialist_recommendation_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_audit_logs" ADD CONSTRAINT "calculation_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyst_refresh_audit_log" ADD CONSTRAINT "analyst_refresh_audit_log_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_research" ADD CONSTRAINT "market_research_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_research" ADD CONSTRAINT "market_research_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospective_properties" ADD CONSTRAINT "prospective_properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyst_cooldowns" ADD CONSTRAINT "analyst_cooldowns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assumption_acknowledgments" ADD CONSTRAINT "assumption_acknowledgments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assumption_change_log" ADD CONSTRAINT "assumption_change_log_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assumption_change_log" ADD CONSTRAINT "assumption_change_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assumption_change_log" ADD CONSTRAINT "assumption_change_log_research_run_id_research_runs_id_fk" FOREIGN KEY ("research_run_id") REFERENCES "public"."research_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assumption_guidance" ADD CONSTRAINT "assumption_guidance_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_snapshots" ADD CONSTRAINT "coverage_snapshots_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guidance_decisions" ADD CONSTRAINT "guidance_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guidance_decisions" ADD CONSTRAINT "guidance_decisions_assumption_guidance_id_assumption_guidance_id_fk" FOREIGN KEY ("assumption_guidance_id") REFERENCES "public"."assumption_guidance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospitality_benchmarks" ADD CONSTRAINT "hospitality_benchmarks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_key_rotations" ADD CONSTRAINT "integration_key_rotations_rotated_by_users_id_fk" FOREIGN KEY ("rotated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebecca_conversations" ADD CONSTRAINT "rebecca_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebecca_conversations" ADD CONSTRAINT "rebecca_conversations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebecca_emails" ADD CONSTRAINT "rebecca_emails_conversation_id_rebecca_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."rebecca_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebecca_emails" ADD CONSTRAINT "rebecca_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebecca_feedback" ADD CONSTRAINT "rebecca_feedback_conversation_id_rebecca_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."rebecca_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebecca_feedback" ADD CONSTRAINT "rebecca_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebecca_knowledge_history" ADD CONSTRAINT "rebecca_knowledge_history_entry_id_rebecca_knowledge_base_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."rebecca_knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebecca_messages" ADD CONSTRAINT "rebecca_messages_conversation_id_rebecca_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."rebecca_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebecca_preview_fixtures" ADD CONSTRAINT "rebecca_preview_fixtures_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relaxation_traces" ADD CONSTRAINT "relaxation_traces_research_run_id_research_runs_id_fk" FOREIGN KEY ("research_run_id") REFERENCES "public"."research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_call_logs" ADD CONSTRAINT "source_call_logs_source_id_source_registry_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "str_ordinance_events" ADD CONSTRAINT "str_ordinance_events_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submarket_supply_projects" ADD CONSTRAINT "submarket_supply_projects_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_range" ADD CONSTRAINT "reference_range_source_id_source_registry_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_registry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyst_watchdog_benchmarks" ADD CONSTRAINT "analyst_watchdog_benchmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_fields" ADD CONSTRAINT "extraction_fields_extraction_id_document_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."document_extractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_alert_rule_id_alert_rules_id_fk" FOREIGN KEY ("alert_rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_page_visits" ADD CONSTRAINT "user_page_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_logo_id_idx" ON "companies" USING btree ("logo_id");--> statement-breakpoint
CREATE INDEX "companies_theme_id_idx" ON "companies" USING btree ("theme_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_default_properties_user_id_idx" ON "user_default_properties" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_user_sessions_expire" ON "user_sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "users_phone_number_idx" ON "users" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "users_selected_theme_id_idx" ON "users" USING btree ("selected_theme_id");--> statement-breakpoint
CREATE INDEX "global_assumptions_user_id_idx" ON "global_assumptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_seed_defaults_lookup" ON "seed_defaults" USING btree ("entity_type","entity_key");--> statement-breakpoint
CREATE INDEX "idx_mco_key_country" ON "model_constant_overrides" USING btree ("constant_key","country");--> statement-breakpoint
CREATE INDEX "idx_mco_created_by" ON "model_constant_overrides" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_mc_key_country" ON "model_constants" USING btree ("constant_key","country");--> statement-breakpoint
CREATE INDEX "idx_model_defaults_grouping" ON "model_defaults" USING btree ("category","sub_tab","card_key");--> statement-breakpoint
CREATE INDEX "idx_model_defaults_pending" ON "model_defaults" USING btree ("proposed_value");--> statement-breakpoint
CREATE INDEX "properties_user_id_idx" ON "properties" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "properties_created_at_idx" ON "properties" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "properties_brand_id_idx" ON "properties" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "properties_created_by_idx" ON "properties" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "properties_archived_by_idx" ON "properties" USING btree ("archived_by");--> statement-breakpoint
CREATE INDEX "idx_property_urls_property_id" ON "property_urls" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dd_template_items_key_uniq" ON "dd_template_items" USING btree ("key");--> statement-breakpoint
CREATE INDEX "dd_template_items_workstream_idx" ON "dd_template_items" USING btree ("workstream");--> statement-breakpoint
CREATE UNIQUE INDEX "property_dd_items_property_key_uniq" ON "property_dd_items" USING btree ("property_id","template_item_key");--> statement-breakpoint
CREATE INDEX "property_dd_items_property_idx" ON "property_dd_items" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "property_dd_items_workstream_idx" ON "property_dd_items" USING btree ("workstream");--> statement-breakpoint
CREATE INDEX "property_dd_items_owner_user_id_idx" ON "property_dd_items" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "fee_categories_property_id_idx" ON "property_fee_categories" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "property_photos_property_id_idx" ON "property_photos" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "property_photos_before_photo_id_idx" ON "property_photos" USING btree ("before_photo_id");--> statement-breakpoint
CREATE INDEX "scenario_access_owner_id_idx" ON "scenario_access" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "scenario_access_grantee_id_idx" ON "scenario_access" USING btree ("grantee_id");--> statement-breakpoint
CREATE INDEX "scenario_access_scenario_id_idx" ON "scenario_access" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "spo_scenario_id_idx" ON "scenario_property_overrides" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "spo_scenario_property_id_idx" ON "scenario_property_overrides" USING btree ("scenario_id","property_id");--> statement-breakpoint
CREATE INDEX "spo_property_name_idx" ON "scenario_property_overrides" USING btree ("property_name");--> statement-breakpoint
CREATE INDEX "spo_overrides_gin_idx" ON "scenario_property_overrides" USING gin ("overrides");--> statement-breakpoint
CREATE INDEX "scenarios_user_id_idx" ON "scenarios" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scenarios_user_updated_idx" ON "scenarios" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scenarios_user_kind_unique" ON "scenarios" USING btree ("user_id","kind") WHERE "kind" IN ('default', 'autosave') AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scenario_results_scenario_id_idx" ON "scenario_results" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "scenario_results_output_hash_idx" ON "scenario_results" USING btree ("output_hash");--> statement-breakpoint
CREATE INDEX "activity_logs_user_id_created_at_idx" ON "activity_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_logs_entity_type_entity_id_idx" ON "activity_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "login_logs_user_id_idx" ON "login_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_logs_session_id_idx" ON "login_logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "login_logs_login_at_idx" ON "login_logs" USING btree ("login_at");--> statement-breakpoint
CREATE INDEX "verification_runs_user_id_idx" ON "verification_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_runs_created_at_idx" ON "verification_runs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_resource_versions_resource_version_uniq" ON "admin_resource_versions" USING btree ("resource_id","version");--> statement-breakpoint
CREATE INDEX "admin_resource_versions_resource_idx" ON "admin_resource_versions" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_resources_kind_slug_uniq" ON "admin_resources" USING btree ("kind","slug");--> statement-breakpoint
CREATE INDEX "admin_resources_kind_idx" ON "admin_resources" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "break_glass_specialist_idx" ON "audit_break_glass_overrides" USING btree ("specialist_id");--> statement-breakpoint
CREATE INDEX "break_glass_expires_idx" ON "audit_break_glass_overrides" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "resource_health_checks_resource_idx" ON "resource_health_checks" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "resource_health_checks_resource_time_idx" ON "resource_health_checks" USING btree ("resource_id","checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_specialist_connections_uniq" ON "resource_specialist_connections" USING btree ("resource_id","target");--> statement-breakpoint
CREATE INDEX "resource_specialist_connections_target_idx" ON "resource_specialist_connections" USING btree ("target");--> statement-breakpoint
CREATE UNIQUE INDEX "specialist_assignments_uniq" ON "specialist_assignments" USING btree ("specialist_id","assignment_kind","assignment_slug","assignment_role");--> statement-breakpoint
CREATE INDEX "specialist_assignments_specialist_idx" ON "specialist_assignments" USING btree ("specialist_id");--> statement-breakpoint
CREATE INDEX "specialist_assignments_resource_idx" ON "specialist_assignments" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "specialist_quality_specialist_idx" ON "specialist_research_quality_snapshots" USING btree ("specialist_id");--> statement-breakpoint
CREATE INDEX "specialist_quality_specialist_time_idx" ON "specialist_research_quality_snapshots" USING btree ("specialist_id","computed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "specialist_config_versions_uniq" ON "specialist_config_versions" USING btree ("specialist_id","version");--> statement-breakpoint
CREATE INDEX "specialist_config_versions_specialist_idx" ON "specialist_config_versions" USING btree ("specialist_id");--> statement-breakpoint
CREATE INDEX "specialist_config_versions_analyst_a_model_idx" ON "specialist_config_versions" USING btree ("analyst_a_model_resource_id");--> statement-breakpoint
CREATE INDEX "specialist_config_versions_analyst_b_model_idx" ON "specialist_config_versions" USING btree ("analyst_b_model_resource_id");--> statement-breakpoint
CREATE INDEX "specialist_config_versions_synthesis_model_idx" ON "specialist_config_versions" USING btree ("synthesis_model_resource_id");--> statement-breakpoint
CREATE INDEX "specialist_config_versions_fallback_model_idx" ON "specialist_config_versions" USING btree ("fallback_model_resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "specialist_configs_specialist_uniq" ON "specialist_configs" USING btree ("specialist_id");--> statement-breakpoint
CREATE INDEX "specialist_configs_analyst_a_model_idx" ON "specialist_configs" USING btree ("analyst_a_model_resource_id");--> statement-breakpoint
CREATE INDEX "specialist_configs_analyst_b_model_idx" ON "specialist_configs" USING btree ("analyst_b_model_resource_id");--> statement-breakpoint
CREATE INDEX "specialist_configs_synthesis_model_idx" ON "specialist_configs" USING btree ("synthesis_model_resource_id");--> statement-breakpoint
CREATE INDEX "specialist_configs_fallback_model_idx" ON "specialist_configs" USING btree ("fallback_model_resource_id");--> statement-breakpoint
CREATE INDEX "specialist_identity_versions_specialist_idx" ON "specialist_identity_override_versions" USING btree ("specialist_id");--> statement-breakpoint
CREATE UNIQUE INDEX "specialist_identity_overrides_uniq" ON "specialist_identity_overrides" USING btree ("specialist_id");--> statement-breakpoint
CREATE UNIQUE INDEX "specialist_rec_counters_uniq" ON "specialist_recommendation_counters" USING btree ("specialist_id","field_key");--> statement-breakpoint
CREATE INDEX "specialist_rec_counters_specialist_idx" ON "specialist_recommendation_counters" USING btree ("specialist_id");--> statement-breakpoint
CREATE INDEX "specialist_rec_events_specialist_idx" ON "specialist_recommendation_events" USING btree ("specialist_id");--> statement-breakpoint
CREATE INDEX "specialist_rec_events_specialist_field_idx" ON "specialist_recommendation_events" USING btree ("specialist_id","field_key");--> statement-breakpoint
CREATE INDEX "calc_audit_scenario_idx" ON "calculation_audit_logs" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "calc_audit_property_idx" ON "calculation_audit_logs" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "calc_audit_user_idx" ON "calculation_audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calc_audit_computed_at_idx" ON "calculation_audit_logs" USING btree ("computed_at");--> statement-breakpoint
CREATE INDEX "analyst_refresh_audit_table_idx" ON "analyst_refresh_audit_log" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "analyst_refresh_audit_admin_idx" ON "analyst_refresh_audit_log" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "analyst_refresh_audit_started_idx" ON "analyst_refresh_audit_log" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "market_research_user_id_idx" ON "market_research" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "market_research_type_idx" ON "market_research" USING btree ("type");--> statement-breakpoint
CREATE INDEX "market_research_property_id_idx" ON "market_research" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "market_research_updated_at_idx" ON "market_research" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "market_research_type_updated_idx" ON "market_research" USING btree ("type","updated_at");--> statement-breakpoint
CREATE INDEX "prospective_props_user_id_idx" ON "prospective_properties" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "prospective_props_external_id_idx" ON "prospective_properties" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "saved_searches_user_id_idx" ON "saved_searches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_airport_property_id" ON "airport_distances" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "assumption_ack_entity_idx" ON "assumption_acknowledgments" USING btree ("entity_type","entity_id","user_id");--> statement-breakpoint
CREATE INDEX "assumption_change_log_entity_idx" ON "assumption_change_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "assumption_change_log_field_idx" ON "assumption_change_log" USING btree ("field_name");--> statement-breakpoint
CREATE INDEX "assumption_change_log_source_idx" ON "assumption_change_log" USING btree ("change_source");--> statement-breakpoint
CREATE INDEX "assumption_change_log_created_idx" ON "assumption_change_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "assumption_guidance_entity_idx" ON "assumption_guidance" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "assumption_guidance_scenario_idx" ON "assumption_guidance" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "coverage_snapshots_entity_idx" ON "coverage_snapshots" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "coverage_snapshots_scenario_idx" ON "coverage_snapshots" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "guidance_decisions_user_idx" ON "guidance_decisions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "guidance_decisions_guidance_idx" ON "guidance_decisions" USING btree ("assumption_guidance_id");--> statement-breakpoint
CREATE INDEX "hospitality_benchmarks_category_idx" ON "hospitality_benchmarks" USING btree ("category");--> statement-breakpoint
CREATE INDEX "hospitality_benchmarks_segment_idx" ON "hospitality_benchmarks" USING btree ("segment");--> statement-breakpoint
CREATE INDEX "hospitality_benchmarks_active_idx" ON "hospitality_benchmarks" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "integration_key_rotations_service_idx" ON "integration_key_rotations" USING btree ("service_key");--> statement-breakpoint
CREATE INDEX "pipeline_policies_analyst_a_model_idx" ON "pipeline_policies" USING btree ("analyst_a_model_resource_id");--> statement-breakpoint
CREATE INDEX "pipeline_policies_analyst_b_model_idx" ON "pipeline_policies" USING btree ("analyst_b_model_resource_id");--> statement-breakpoint
CREATE INDEX "pipeline_policies_synthesis_model_idx" ON "pipeline_policies" USING btree ("synthesis_model_resource_id");--> statement-breakpoint
CREATE INDEX "pipeline_policies_fallback_model_idx" ON "pipeline_policies" USING btree ("fallback_model_resource_id");--> statement-breakpoint
CREATE INDEX "rebecca_conversations_user_idx" ON "rebecca_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rebecca_conversations_property_idx" ON "rebecca_conversations" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "rebecca_emails_conv_idx" ON "rebecca_emails" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "rebecca_emails_user_idx" ON "rebecca_emails" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rebecca_feedback_status_idx" ON "rebecca_feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rebecca_feedback_user_idx" ON "rebecca_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rebecca_feedback_conv_idx" ON "rebecca_feedback" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "rebecca_kb_category_idx" ON "rebecca_knowledge_base" USING btree ("category");--> statement-breakpoint
CREATE INDEX "rebecca_kb_active_idx" ON "rebecca_knowledge_base" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "rebecca_kb_history_entry_idx" ON "rebecca_knowledge_history" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "rebecca_messages_conv_idx" ON "rebecca_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "rebecca_preview_fixtures_created_by_idx" ON "rebecca_preview_fixtures" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "rebecca_preview_fixtures_created_at_idx" ON "rebecca_preview_fixtures" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "relaxation_traces_run_idx" ON "relaxation_traces" USING btree ("research_run_id");--> statement-breakpoint
CREATE INDEX "research_runs_entity_idx" ON "research_runs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "research_runs_status_idx" ON "research_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "research_runs_user_idx" ON "research_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "research_runs_scenario_idx" ON "research_runs" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "research_runs_cache_key_idx" ON "research_runs" USING btree ("cache_key") WHERE "research_runs"."cache_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "scheduled_research_workflows_enabled_idx" ON "scheduled_research_workflows" USING btree ("is_enabled");--> statement-breakpoint
CREATE INDEX "scheduled_research_workflows_next_run_idx" ON "scheduled_research_workflows" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "source_call_logs_source_idx" ON "source_call_logs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_call_logs_ts_idx" ON "source_call_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "str_ordinance_property_idx" ON "str_ordinance_events" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "str_ordinance_locality_idx" ON "str_ordinance_events" USING btree ("locality_key");--> statement-breakpoint
CREATE INDEX "str_ordinance_date_idx" ON "str_ordinance_events" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "submarket_supply_property_idx" ON "submarket_supply_projects" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "submarket_supply_submarket_idx" ON "submarket_supply_projects" USING btree ("submarket_key");--> statement-breakpoint
CREATE INDEX "submarket_supply_status_idx" ON "submarket_supply_projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reference_range_lookup_idx" ON "reference_range" USING btree ("domain","metric_key","country","year");--> statement-breakpoint
CREATE INDEX "reference_range_jurisdiction_idx" ON "reference_range" USING btree ("country","subdivision","market");--> statement-breakpoint
CREATE INDEX "reference_range_source_idx" ON "reference_range" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "reference_range_verified_idx" ON "reference_range" USING btree ("last_verified_at");--> statement-breakpoint
CREATE INDEX "conversations_user_id_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "alert_rules_property_id_idx" ON "alert_rules" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "doc_extractions_property_id_idx" ON "document_extractions" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "doc_extractions_user_id_idx" ON "document_extractions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "extraction_fields_extraction_id_idx" ON "extraction_fields" USING btree ("extraction_id");--> statement-breakpoint
CREATE INDEX "notification_logs_event_type_idx" ON "notification_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "notification_logs_status_idx" ON "notification_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_logs_created_at_idx" ON "notification_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notification_logs_alert_rule_id_idx" ON "notification_logs" USING btree ("alert_rule_id");--> statement-breakpoint
CREATE INDEX "notification_logs_property_id_idx" ON "notification_logs" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "notification_prefs_user_id_idx" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_page_visits_user" ON "user_page_visits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_page_visits_page" ON "user_page_visits" USING btree ("page_key");--> statement-breakpoint
CREATE INDEX "vector_chunks_namespace_idx" ON "vector_chunks" USING btree ("namespace");--> statement-breakpoint
CREATE INDEX "media_assets_kind_idx" ON "media_assets" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "media_assets_sha256_idx" ON "media_assets" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "scheduler_run_history_key_ran_at_idx" ON "scheduler_run_history" USING btree ("scheduler_key","ran_at");--> statement-breakpoint
CREATE INDEX "cache_entries_expires_idx" ON "cache_entries" USING btree ("expires_at") WHERE "expires_at" IS NOT NULL;