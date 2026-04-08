-- =============================================================================
-- Production Database Sync Script
-- Generated from development database state
-- Company: Hospitality Business Group
-- =============================================================================
-- This script synchronizes the production database with development.
-- It DELETES non-canonical data, then UPSERTS canonical rows.
-- Safe to run multiple times (fully idempotent).
-- Transient tables (sessions, activity_logs, login_logs, verification_runs,
-- conversations, messages) are intentionally skipped.
-- Uses OVERRIDING SYSTEM VALUE to preserve identity column IDs.
-- Resets sequences after all inserts.
-- =============================================================================

BEGIN;

-- =============================================================================
-- CLEANUP: Remove non-canonical data before inserting
-- Order matters: delete dependent rows first (FK constraints)
-- =============================================================================
DELETE FROM property_fee_categories WHERE property_id NOT IN (32, 33, 35, 39, 41, 43);
DELETE FROM market_research WHERE type = 'property' AND property_id NOT IN (32, 33, 35, 39, 41, 43);
DELETE FROM properties WHERE id NOT IN (32, 33, 35, 39, 41, 43);

-- =============================================================================
-- COMPANIES
-- =============================================================================
INSERT INTO companies (id, name, type, description, logo_id, is_active, theme_id) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Hospitality Business Group', 'management', 'Management company overseeing all hotel SPVs', 1, TRUE, NULL),
  (2, 'HBG Property 1 LLC', 'spv', 'SPV for first hotel property', 2, TRUE, NULL),
  (3, 'HBG Property 2 LLC', 'spv', 'SPV for second hotel property', 3, TRUE, NULL),
  (10, 'The Norfolk AI Group', 'management', 'AI-powered hospitality technology and management group based in Norfolk, VA', NULL, TRUE, 14),
  (11, 'Jano Grande Ranch LLC', 'spv', 'SPV entity for Jano Grande Ranch property', NULL, TRUE, 14),
  (12, 'Loch Sheldrake LLC', 'spv', 'SPV entity for Loch Sheldrake property', NULL, TRUE, 14),
  (13, 'Belleayre Mountain LLC', 'spv', 'SPV entity for Belleayre Mountain property', NULL, TRUE, 14),
  (14, 'Scott''s House LLC', 'spv', 'SPV entity for Scott''s House property', NULL, TRUE, 14),
  (15, 'Lakeview Haven Lodge LLC', 'spv', 'SPV entity for Lakeview Haven Lodge property', NULL, TRUE, 14),
  (16, 'San Diego Boutique LLC', 'spv', 'SPV entity for San Diego property', NULL, TRUE, 14)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, description = EXCLUDED.description,
  logo_id = EXCLUDED.logo_id, is_active = EXCLUDED.is_active, theme_id = EXCLUDED.theme_id;

-- =============================================================================
-- LOGOS
-- =============================================================================
INSERT INTO logos (id, name, url, is_default, company_name) OVERRIDING SYSTEM VALUE VALUES
  (1, 'The Norfolk AI Group', '/logos/default-hbg.png', TRUE, 'The Norfolk AI Group'),
  (2, 'Norfolk AI - Blue', '/logos/norfolk-ai-blue.png', FALSE, 'The Norfolk AI Group'),
  (3, 'Norfolk AI - Yellow', '/logos/norfolk-ai-yellow.png', FALSE, 'The Norfolk AI Group'),
  (4, 'Norfolk AI - Wireframe', '/logos/norfolk-ai-wireframe.png', FALSE, 'The Norfolk AI Group')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, url = EXCLUDED.url, is_default = EXCLUDED.is_default,
  company_name = EXCLUDED.company_name;

-- =============================================================================
-- USER GROUPS
-- =============================================================================
INSERT INTO user_groups (id, name, logo_id, theme_id, asset_description_id, is_default) OVERRIDING SYSTEM VALUE VALUES
  (1, 'KIT Group', NULL, NULL, NULL, FALSE),
  (2, 'The Norfolk AI Group', NULL, NULL, NULL, FALSE),
  (3, 'General', NULL, NULL, NULL, TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, is_default = EXCLUDED.is_default;

-- =============================================================================
-- DESIGN THEMES
-- =============================================================================
INSERT INTO design_themes (id, name, description, is_default, colors) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Fluid Glass', 'Inspired by Apple''s iOS design language, Fluid Glass creates a sense of depth and dimension through translucent layers, subtle gradients, and smooth animations. The design emphasizes content while maintaining visual hierarchy through careful use of blur effects and glass-like surfaces.', TRUE, '[{"name": "Sage Green", "rank": 1, "hexCode": "#9FBCA4", "description": "PALETTE: Secondary accent for subtle highlights, card borders, and supporting visual elements."}, {"name": "Deep Green", "rank": 2, "hexCode": "#257D41", "description": "PALETTE: Primary brand color for main action buttons, active navigation items, and key highlights."}, {"name": "Warm Cream", "rank": 3, "hexCode": "#FFF9F5", "description": "PALETTE: Light background for page backgrounds, card surfaces, and warm accents."}, {"name": "Deep Black", "rank": 4, "hexCode": "#0a0a0f", "description": "PALETTE: Dark theme background for navigation sidebars, dark glass panels, and login screens."}, {"name": "Salmon", "rank": 5, "hexCode": "#F4795B", "description": "PALETTE: Accent color for warnings, notifications, and emphasis highlights."}, {"name": "Yellow Gold", "rank": 6, "hexCode": "#F59E0B", "description": "PALETTE: Accent color for highlights, badges, and attention-drawing elements."}, {"name": "Chart Blue", "rank": 1, "hexCode": "#3B82F6", "description": "CHART: Primary chart line color for revenue and key financial metrics."}, {"name": "Chart Red", "rank": 2, "hexCode": "#EF4444", "description": "CHART: Secondary chart line color for expenses and cost-related metrics."}, {"name": "Chart Purple", "rank": 3, "hexCode": "#8B5CF6", "description": "CHART: Tertiary chart line color for cash flow and profitability metrics."}]'),
  (5, 'Indigo Blue', 'A bold, professional theme centered on deep indigo-blue tones with cool steel accents. Conveys trust, authority, and modern sophistication — ideal for investor-facing presentations.', FALSE, '[{"name": "Indigo", "rank": 1, "hexCode": "#4F46E5", "description": "PALETTE: Primary brand color for main action buttons, active navigation items, and key highlights."}, {"name": "Deep Navy", "rank": 2, "hexCode": "#1E1B4B", "description": "PALETTE: Dark theme background for navigation sidebars, dark glass panels, and login screens."}, {"name": "Ice White", "rank": 3, "hexCode": "#F0F4FF", "description": "PALETTE: Light background for page backgrounds, card surfaces, and cool accents."}, {"name": "Steel Blue", "rank": 4, "hexCode": "#64748B", "description": "PALETTE: Secondary accent for subtle highlights, card borders, and supporting visual elements."}, {"name": "Coral", "rank": 5, "hexCode": "#F43F5E", "description": "PALETTE: Accent color for warnings, notifications, and emphasis highlights."}, {"name": "Amber", "rank": 6, "hexCode": "#F59E0B", "description": "PALETTE: Accent color for highlights, badges, and attention-drawing elements."}, {"name": "Chart Indigo", "rank": 1, "hexCode": "#6366F1", "description": "CHART: Primary chart line color for revenue and key financial metrics."}, {"name": "Chart Teal", "rank": 2, "hexCode": "#14B8A6", "description": "CHART: Secondary chart line color for expenses and cost-related metrics."}, {"name": "Chart Violet", "rank": 3, "hexCode": "#A855F7", "description": "CHART: Tertiary chart line color for cash flow and profitability metrics."}]'),
  (19, 'Claude', 'Warm terracotta and cream inspired by Anthropic''s Claude interface. Earthy, approachable, and quietly confident — professional warmth without pretension.', FALSE, '[{"name":"Terracotta","rank":1,"hexCode":"#D97757","description":"PALETTE: Primary brand color. Warm terracotta for buttons, active nav, focus rings."},{"name":"Warm Umber","rank":2,"hexCode":"#8B6F5E","description":"PALETTE: Secondary accent. Muted warm brown for contrast badges and secondary elements."},{"name":"Cream","rank":3,"hexCode":"#FAF7F4","description":"PALETTE: Background and card surfaces. Warm off-white cream canvas."},{"name":"Charcoal","rank":4,"hexCode":"#2D2B28","description":"PALETTE: Foreground text. Near-black warm charcoal for readable type."},{"name":"Linen","rank":5,"hexCode":"#F0EBE5","description":"PALETTE: Muted surfaces. Light warm beige for secondary cards and table alternates."},{"name":"Sand Border","rank":6,"hexCode":"#E5DED6","description":"PALETTE: Borders and input outlines. Subtle warm gray border tone."},{"name":"Teal","rank":1,"hexCode":"#0D9488","description":"ACCENT: Standout highlight for IRR circles, key KPIs, and success badges."},{"name":"Warm Amber","rank":2,"hexCode":"#D4A76A","description":"ACCENT: Secondary emphasis for charts, infographics, and comparative metrics."},{"name":"Teal","rank":1,"hexCode":"#0D9488","description":"CHART: Primary series — revenue and key metrics."},{"name":"Terracotta","rank":2,"hexCode":"#D97757","description":"CHART: Secondary series — net income and profitability."},{"name":"Slate Blue","rank":3,"hexCode":"#6B7FA3","description":"CHART: Tertiary series — cash flow and operational metrics."},{"name":"Amber","rank":4,"hexCode":"#D4A76A","description":"CHART: Quaternary series — expenses and budget."},{"name":"Muted Plum","rank":5,"hexCode":"#9B7A94","description":"CHART: Quinary series — background and comparison."},{"name":"Teal","rank":1,"hexCode":"#0D9488","description":"LINE: Primary line — revenue trend."},{"name":"Terracotta","rank":2,"hexCode":"#D97757","description":"LINE: Secondary line — income trend."},{"name":"Slate Blue","rank":3,"hexCode":"#6B7FA3","description":"LINE: Tertiary line — expense trend."},{"name":"Amber","rank":4,"hexCode":"#D4A76A","description":"LINE: Quaternary line — cash flow trend."},{"name":"Muted Plum","rank":5,"hexCode":"#9B7A94","description":"LINE: Quinary line — projection overlay."}]')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  is_default = EXCLUDED.is_default, colors = EXCLUDED.colors;

-- =============================================================================
-- USERS (password hashes from development database)
-- NOTE: Production passwords are overridden by environment variables on startup
-- via seedAdminUser() in server/auth.ts
-- =============================================================================
INSERT INTO users (id, email, password_hash, role, first_name, last_name, company, company_id, title, user_group_id, selected_theme_id) OVERRIDING SYSTEM VALUE VALUES
  (1, 'admin', '$2b$12$LEFrDu6a77FlYOEDQeKtU.TQHAkpW9iFs8E0e/Awt6F.PfiRK9UUO', 'admin', 'Ricardo', 'Cidale', 'The Norfolk AI Group', NULL, 'Partner', 2, NULL),
  (2, 'rosario@kitcapital.com', '$2b$12$Mu44raajtDj0ziaX9rBrze37JJei1rd7.zKAYzEZKrXlYYT/qqL4q', 'partner', 'Rosario', 'David', 'KIT Capital', NULL, 'COO', 1, NULL),
  (4, 'kit@kitcapital.com', '$2b$12$Rdwzg7sKCitjg1uh.9XTh.PHuhkDpjyMMQYoyPd1LnTwuAeagXjku', 'partner', 'Dov', 'Tuzman', 'KIT Capital', NULL, 'Principal', 1, NULL),
  (6, 'checker@norfolkgroup.io', '$2b$12$W.PjaLvNEaABPiCgl5BarOR06IGkAQlHFalWYQuLxzZSnJa.iOMaO', 'checker', 'Checker', NULL, 'Norfolk AI', NULL, 'Checker', 2, NULL),
  (8, 'reynaldo.fagundes@norfolk.ai', '$2b$12$aydqk0KCG53UqgPfTPjfc.8D2dG3/be0oVvDfjqOogd80FUhIYAL2', 'partner', 'Reynaldo', 'Fagundes', 'Norfolk AI', NULL, 'CTO', 2, NULL),
  (9, 'lemazniku@icloud.com', '$2b$12$3NeyqaN1WO1Du7BBE15UUuDuXFyA2FdoagYnrRIGxyfXILt0xsQES', 'partner', 'Lea', 'Mazniku', 'KIT Capital', NULL, 'Partner', 1, NULL),
  (10, 'leslie@cidale.com', '$2b$12$qteDJQIl0arFbXeTX9F9sedImkyb8fybK1GuIbBq/fkRpiZgQWWoy', 'partner', 'Leslie', 'Cidale', 'Numeratti Endeavors', NULL, 'Senior Partner', 3, NULL),
  (11, 'wlaruffa@gmail.com', '$2b$12$zgCQMEpmemJfZcazxUXshu4P5yK1OsIdRdEWgTFSiNA2xiOKHS1xC', 'partner', 'William', 'Laruffa', 'Independent', NULL, 'Partner', 3, NULL)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, role = EXCLUDED.role, first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name, company = EXCLUDED.company, title = EXCLUDED.title,
  user_group_id = EXCLUDED.user_group_id;

-- =============================================================================
-- GLOBAL ASSUMPTIONS
-- =============================================================================
INSERT INTO global_assumptions (
  id, user_id, model_start_date, inflation_rate, base_management_fee, incentive_management_fee,
  staff_salary, travel_cost_per_client, it_license_per_client, marketing_rate, misc_ops_rate,
  office_lease_start, professional_services_start, tech_infra_start, business_insurance_start,
  standard_acq_package, debt_assumptions, commission_rate, fixed_cost_escalation_rate,
  safe_tranche1_amount, safe_tranche1_date, safe_tranche2_amount, safe_tranche2_date,
  safe_valuation_cap, safe_discount_rate, company_tax_rate, company_ops_start_date,
  fiscal_year_start_month, partner_comp_year1, partner_comp_year2, partner_comp_year3,
  partner_comp_year4, partner_comp_year5, partner_comp_year6, partner_comp_year7,
  partner_comp_year8, partner_comp_year9, partner_comp_year10,
  partner_count_year1, partner_count_year2, partner_count_year3, partner_count_year4,
  partner_count_year5, partner_count_year6, partner_count_year7, partner_count_year8,
  partner_count_year9, partner_count_year10,
  company_name, funding_source_label, exit_cap_rate, sales_commission_rate,
  event_expense_rate, other_expense_rate, utilities_variable_split,
  preferred_llm, asset_definition, projection_years,
  staff_tier1_max_properties, staff_tier1_fte, staff_tier2_max_properties, staff_tier2_fte, staff_tier3_fte,
  property_label, show_company_calculation_details, show_property_calculation_details,
  sidebar_property_finder, sidebar_sensitivity, sidebar_financing, sidebar_compare,
  sidebar_timeline, sidebar_map_view, sidebar_executive_summary, sidebar_scenarios, sidebar_user_manual,
  show_ai_assistant,
  company_phone, company_email, company_website, company_ein, company_founding_year,
  company_street_address, company_city, company_state_province, company_country, company_zip_postal_code,
  icp_config, research_config
) OVERRIDING SYSTEM VALUE VALUES (
  7, 1, '2026-04-01', 0.03, 0.085, 0.12,
  75000, 12000, 3000, 0.05, 0.03,
  36000, 24000, 18000, 12000,
  '{"monthsToOps": 6, "purchasePrice": 3800000, "preOpeningCosts": 200000, "operatingReserve": 250000, "buildingImprovements": 1200000}', '{"acqLTV": 0.75, "refiLTV": 0.75, "interestRate": 0.09, "amortizationYears": 25, "acqClosingCostRate": 0.02, "refiClosingCostRate": 0.03}', 0.05, 0.03,
  1000000, '2026-06-01', 1000000, '2027-04-01',
  2500000, 0.2, 0.3, '2026-06-01',
  1, 540000, 540000, 540000,
  600000, 600000, 700000, 700000,
  800000, 800000, 900000,
  3, 3, 3, 3,
  3, 3, 3, 3,
  3, 3,
  'The Norfolk AI Group', 'Funding Vehicle', 0.085, 0.05,
  0.65, 0.6, 0.6,
  'claude-sonnet-4-5', '{"hasFB": true, "level": "luxury", "maxAdr": 600, "minAdr": 150, "acreage": 10, "maxRooms": 80, "minRooms": 10, "hasEvents": true, "description": "Luxury boutique hotels on private estates of 10+ acres, catering to 100+ person exotic, unique, and corporate events in exclusive, secluded settings with full-service F&B, wellness programming, and curated guest experiences.", "hasWellness": true, "privacyLevel": "high", "parkingSpaces": 50, "eventLocations": 2, "maxEventCapacity": 150}', 10,
  3, 2.5, 6, 4.5, 7,
  'Boutique Hotel', TRUE, TRUE,
  TRUE, TRUE, TRUE, TRUE,
  TRUE, FALSE, TRUE, TRUE, TRUE,
  FALSE,
  '+1 (757) 555-0142', 'info@norfolk.ai', 'https://norfolk.ai', '92-1847356', 2024,
  '150 West Main Street, Suite 400', 'Norfolk', 'VA', 'United States', '23510',
  '{"guestSegments": [{"name": "Corporate Retreats", "weight": 0.30, "avgGroupSize": 25, "avgStayNights": 3, "seasonality": "year-round"}, {"name": "Luxury Leisure", "weight": 0.25, "avgGroupSize": 2, "avgStayNights": 4, "seasonality": "peak"}, {"name": "Weddings & Social Events", "weight": 0.20, "avgGroupSize": 80, "avgStayNights": 2, "seasonality": "spring-fall"}, {"name": "Wellness Retreats", "weight": 0.15, "avgGroupSize": 12, "avgStayNights": 5, "seasonality": "year-round"}, {"name": "Adventure & Experiential", "weight": 0.10, "avgGroupSize": 6, "avgStayNights": 3, "seasonality": "seasonal"}], "demographics": {"ageRange": "35-65", "incomeLevel": "HHI $250K+", "geography": "US East Coast, Latin America, International", "travelStyle": "Experiential luxury, privacy-focused"}, "bookingBehavior": {"leadTimeDays": 90, "directBookingPct": 0.60, "repeatGuestPct": 0.35, "avgRevenuePerGuest": 1200}}',
  '{"property": {"enabled": true, "focusAreas": ["boutique hospitality", "luxury lodging", "event venues", "F&B operations", "wellness tourism"], "regions": ["US Northeast", "US Mountain West", "Colombia", "Latin America"], "timeHorizon": "10-year", "customInstructions": "Focus on boutique hotels with 10-80 rooms, event-driven revenue models, and properties on 10+ acre estates. Emphasize AI-driven operations and technology integration.", "customQuestions": "", "enabledTools": []}, "company": {"enabled": true, "focusAreas": ["hospitality management companies", "hotel investment", "PropTech", "AI in hospitality"], "regions": ["United States", "Latin America"], "timeHorizon": "5-year", "customInstructions": "Research AI-powered hospitality management trends, boutique hotel acquisition strategies, and technology-driven operational efficiencies.", "customQuestions": "", "enabledTools": []}}'
)
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  model_start_date = EXCLUDED.model_start_date, inflation_rate = EXCLUDED.inflation_rate,
  base_management_fee = EXCLUDED.base_management_fee, incentive_management_fee = EXCLUDED.incentive_management_fee,
  staff_salary = EXCLUDED.staff_salary, travel_cost_per_client = EXCLUDED.travel_cost_per_client,
  it_license_per_client = EXCLUDED.it_license_per_client, marketing_rate = EXCLUDED.marketing_rate,
  misc_ops_rate = EXCLUDED.misc_ops_rate, office_lease_start = EXCLUDED.office_lease_start,
  professional_services_start = EXCLUDED.professional_services_start, tech_infra_start = EXCLUDED.tech_infra_start,
  business_insurance_start = EXCLUDED.business_insurance_start, standard_acq_package = EXCLUDED.standard_acq_package,
  debt_assumptions = EXCLUDED.debt_assumptions, commission_rate = EXCLUDED.commission_rate,
  fixed_cost_escalation_rate = EXCLUDED.fixed_cost_escalation_rate,
  safe_tranche1_amount = EXCLUDED.safe_tranche1_amount, safe_tranche1_date = EXCLUDED.safe_tranche1_date,
  safe_tranche2_amount = EXCLUDED.safe_tranche2_amount, safe_tranche2_date = EXCLUDED.safe_tranche2_date,
  safe_valuation_cap = EXCLUDED.safe_valuation_cap, safe_discount_rate = EXCLUDED.safe_discount_rate,
  company_tax_rate = EXCLUDED.company_tax_rate, company_ops_start_date = EXCLUDED.company_ops_start_date,
  fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
  partner_comp_year1 = EXCLUDED.partner_comp_year1, partner_comp_year2 = EXCLUDED.partner_comp_year2,
  partner_comp_year3 = EXCLUDED.partner_comp_year3, partner_comp_year4 = EXCLUDED.partner_comp_year4,
  partner_comp_year5 = EXCLUDED.partner_comp_year5, partner_comp_year6 = EXCLUDED.partner_comp_year6,
  partner_comp_year7 = EXCLUDED.partner_comp_year7, partner_comp_year8 = EXCLUDED.partner_comp_year8,
  partner_comp_year9 = EXCLUDED.partner_comp_year9, partner_comp_year10 = EXCLUDED.partner_comp_year10,
  partner_count_year1 = EXCLUDED.partner_count_year1, partner_count_year2 = EXCLUDED.partner_count_year2,
  partner_count_year3 = EXCLUDED.partner_count_year3, partner_count_year4 = EXCLUDED.partner_count_year4,
  partner_count_year5 = EXCLUDED.partner_count_year5, partner_count_year6 = EXCLUDED.partner_count_year6,
  partner_count_year7 = EXCLUDED.partner_count_year7, partner_count_year8 = EXCLUDED.partner_count_year8,
  partner_count_year9 = EXCLUDED.partner_count_year9, partner_count_year10 = EXCLUDED.partner_count_year10,
  company_name = EXCLUDED.company_name, funding_source_label = EXCLUDED.funding_source_label,
  exit_cap_rate = EXCLUDED.exit_cap_rate, sales_commission_rate = EXCLUDED.sales_commission_rate,
  event_expense_rate = EXCLUDED.event_expense_rate, other_expense_rate = EXCLUDED.other_expense_rate,
  utilities_variable_split = EXCLUDED.utilities_variable_split, preferred_llm = EXCLUDED.preferred_llm,
  asset_definition = EXCLUDED.asset_definition, projection_years = EXCLUDED.projection_years,
  staff_tier1_max_properties = EXCLUDED.staff_tier1_max_properties, staff_tier1_fte = EXCLUDED.staff_tier1_fte,
  staff_tier2_max_properties = EXCLUDED.staff_tier2_max_properties, staff_tier2_fte = EXCLUDED.staff_tier2_fte,
  staff_tier3_fte = EXCLUDED.staff_tier3_fte, property_label = EXCLUDED.property_label,
  show_company_calculation_details = EXCLUDED.show_company_calculation_details,
  show_property_calculation_details = EXCLUDED.show_property_calculation_details,
  sidebar_property_finder = EXCLUDED.sidebar_property_finder, sidebar_sensitivity = EXCLUDED.sidebar_sensitivity,
  sidebar_financing = EXCLUDED.sidebar_financing, sidebar_compare = EXCLUDED.sidebar_compare,
  sidebar_timeline = EXCLUDED.sidebar_timeline, sidebar_map_view = EXCLUDED.sidebar_map_view,
  sidebar_executive_summary = EXCLUDED.sidebar_executive_summary, sidebar_scenarios = EXCLUDED.sidebar_scenarios,
  sidebar_user_manual = EXCLUDED.sidebar_user_manual, show_ai_assistant = EXCLUDED.show_ai_assistant,
  company_phone = EXCLUDED.company_phone, company_email = EXCLUDED.company_email,
  company_website = EXCLUDED.company_website, company_ein = EXCLUDED.company_ein,
  company_founding_year = EXCLUDED.company_founding_year,
  company_street_address = EXCLUDED.company_street_address, company_city = EXCLUDED.company_city,
  company_state_province = EXCLUDED.company_state_province, company_country = EXCLUDED.company_country,
  company_zip_postal_code = EXCLUDED.company_zip_postal_code,
  icp_config = EXCLUDED.icp_config, research_config = EXCLUDED.research_config;

-- =============================================================================
-- PROPERTIES (all 6, sorted by acquisition date)
-- =============================================================================

-- 1. Jano Grande Ranch (Jun 2026) — Medellín, Colombia — Full Equity + Refi
INSERT INTO properties (
  id, name, location, market, image_url, status,
  acquisition_date, operations_start_date,
  purchase_price, building_improvements, pre_opening_costs, operating_reserve,
  room_count, start_adr, adr_growth_rate, start_occupancy, max_occupancy,
  occupancy_ramp_months, occupancy_growth_step, stabilization_months, type,
  acquisition_ltv, acquisition_interest_rate, acquisition_term_years, acquisition_closing_cost_rate,
  will_refinance, refinance_date, refinance_ltv, refinance_interest_rate, refinance_term_years, refinance_closing_cost_rate,
  cost_rate_rooms, cost_rate_fb, cost_rate_admin, cost_rate_marketing, cost_rate_property_ops,
  cost_rate_utilities, cost_rate_insurance, cost_rate_taxes, cost_rate_it, cost_rate_ffe, cost_rate_other,
  rev_share_events, rev_share_fb, rev_share_other,
  catering_boost_percent, exit_cap_rate, tax_rate, land_value_percent, disposition_commission,
  base_management_fee_rate, incentive_management_fee_rate,
  street_address, city, state_province, zip_postal_code, country,
  research_values, user_id, refinance_years_after_acquisition
) OVERRIDING SYSTEM VALUE VALUES (
  35, 'Jano Grande Ranch', 'Antioquia, Medellín', 'Latin America', '/images/property-medellin.png', 'Planned',
  '2026-06-01', '2026-12-01',
  1200000, 400000, 150000, 300000,
  20, 250, 0.035, 0.4, 0.72,
  9, 0.05, 36, 'Full Equity',
  0.6, 0.095, 25, 0.03,
  'Yes', '2029-12-01', 0.75, 0.09, 25, 0.03,
  0.17, 0.1, 0.06, 0.015, 0.05,
  0.04, 0.018, 0.016, 0.005, 0.04, 0.05,
  0.3, 0.25, 0.08,
  0.25, 0.1, 0.09, 0.35, 0.05,
  0.085, 0.12,
  'Vereda El Salado', 'Medellín', 'Antioquia', '050001', 'Colombia',
  '{"adr": {"mid": 180, "source": "seed", "display": "$120–$260"}, "costFB": {"mid": 9, "source": "seed", "display": "7%–12%"}, "costIT": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "capRate": {"mid": 10.5, "source": "seed", "display": "9%–12%"}, "costFFE": {"mid": 4, "source": "seed", "display": "3%–5%"}, "catering": {"mid": 30, "source": "seed", "display": "25%–35%"}, "svcFeeIT": {"mid": 0.5, "source": "seed", "display": "0.3%–0.8%"}, "costAdmin": {"mid": 4, "source": "seed", "display": "3%–6%"}, "costOther": {"mid": 5, "source": "seed", "display": "3%–6%"}, "incomeTax": {"mid": 35, "source": "seed", "display": "30%–38%"}, "landValue": {"mid": 15, "source": "seed", "display": "10%–20%"}, "occupancy": {"mid": 62, "source": "seed", "display": "55%–70%"}, "rampMonths": {"mid": 18, "source": "seed", "display": "12–24 mo"}, "incentiveFee": {"mid": 10, "source": "seed", "display": "8%–12%"}, "costInsurance": {"mid": 0.3, "source": "seed", "display": "0.2%–0.5%"}, "costMarketing": {"mid": 2, "source": "seed", "display": "1%–3%"}, "costUtilities": {"mid": 2.5, "source": "seed", "display": "2%–3.5%"}, "startOccupancy": {"mid": 40, "source": "seed", "display": "30%–45%"}, "costPropertyOps": {"mid": 3, "source": "seed", "display": "2%–4%"}, "svcFeeMarketing": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "costHousekeeping": {"mid": 14, "source": "seed", "display": "10%–18%"}, "svcFeeAccounting": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "costPropertyTaxes": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "svcFeeGeneralMgmt": {"mid": 1, "source": "seed", "display": "0.7%–1.2%"}, "svcFeeReservations": {"mid": 1.5, "source": "seed", "display": "1%–2%"}}',
  1, 3
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location, market = EXCLUDED.market, image_url = EXCLUDED.image_url,
  status = EXCLUDED.status, acquisition_date = EXCLUDED.acquisition_date, operations_start_date = EXCLUDED.operations_start_date,
  purchase_price = EXCLUDED.purchase_price, building_improvements = EXCLUDED.building_improvements,
  pre_opening_costs = EXCLUDED.pre_opening_costs, operating_reserve = EXCLUDED.operating_reserve,
  room_count = EXCLUDED.room_count, start_adr = EXCLUDED.start_adr, adr_growth_rate = EXCLUDED.adr_growth_rate,
  start_occupancy = EXCLUDED.start_occupancy, max_occupancy = EXCLUDED.max_occupancy,
  occupancy_ramp_months = EXCLUDED.occupancy_ramp_months, occupancy_growth_step = EXCLUDED.occupancy_growth_step,
  stabilization_months = EXCLUDED.stabilization_months, type = EXCLUDED.type,
  acquisition_ltv = EXCLUDED.acquisition_ltv, acquisition_interest_rate = EXCLUDED.acquisition_interest_rate,
  acquisition_term_years = EXCLUDED.acquisition_term_years, acquisition_closing_cost_rate = EXCLUDED.acquisition_closing_cost_rate,
  will_refinance = EXCLUDED.will_refinance, refinance_date = EXCLUDED.refinance_date,
  refinance_ltv = EXCLUDED.refinance_ltv, refinance_interest_rate = EXCLUDED.refinance_interest_rate,
  refinance_term_years = EXCLUDED.refinance_term_years, refinance_closing_cost_rate = EXCLUDED.refinance_closing_cost_rate,
  cost_rate_rooms = EXCLUDED.cost_rate_rooms, cost_rate_fb = EXCLUDED.cost_rate_fb,
  cost_rate_admin = EXCLUDED.cost_rate_admin, cost_rate_marketing = EXCLUDED.cost_rate_marketing,
  cost_rate_property_ops = EXCLUDED.cost_rate_property_ops, cost_rate_utilities = EXCLUDED.cost_rate_utilities,
  cost_rate_insurance = EXCLUDED.cost_rate_insurance, cost_rate_taxes = EXCLUDED.cost_rate_taxes,
  cost_rate_it = EXCLUDED.cost_rate_it, cost_rate_ffe = EXCLUDED.cost_rate_ffe, cost_rate_other = EXCLUDED.cost_rate_other,
  rev_share_events = EXCLUDED.rev_share_events, rev_share_fb = EXCLUDED.rev_share_fb, rev_share_other = EXCLUDED.rev_share_other,
  catering_boost_percent = EXCLUDED.catering_boost_percent, exit_cap_rate = EXCLUDED.exit_cap_rate,
  tax_rate = EXCLUDED.tax_rate, land_value_percent = EXCLUDED.land_value_percent,
  disposition_commission = EXCLUDED.disposition_commission,
  base_management_fee_rate = EXCLUDED.base_management_fee_rate, incentive_management_fee_rate = EXCLUDED.incentive_management_fee_rate,
  street_address = EXCLUDED.street_address, city = EXCLUDED.city, state_province = EXCLUDED.state_province,
  zip_postal_code = EXCLUDED.zip_postal_code, country = EXCLUDED.country,
  research_values = EXCLUDED.research_values, user_id = EXCLUDED.user_id,
  refinance_years_after_acquisition = EXCLUDED.refinance_years_after_acquisition;

-- 2. Loch Sheldrake (Nov 2026) — Sullivan County, NY — Full Equity + Refi
INSERT INTO properties (
  id, name, location, market, image_url, status,
  acquisition_date, operations_start_date,
  purchase_price, building_improvements, pre_opening_costs, operating_reserve,
  room_count, start_adr, adr_growth_rate, start_occupancy, max_occupancy,
  occupancy_ramp_months, occupancy_growth_step, stabilization_months, type,
  acquisition_ltv, acquisition_interest_rate, acquisition_term_years, acquisition_closing_cost_rate,
  will_refinance, refinance_date, refinance_ltv, refinance_interest_rate, refinance_term_years, refinance_closing_cost_rate,
  cost_rate_rooms, cost_rate_fb, cost_rate_admin, cost_rate_marketing, cost_rate_property_ops,
  cost_rate_utilities, cost_rate_insurance, cost_rate_taxes, cost_rate_it, cost_rate_ffe, cost_rate_other,
  rev_share_events, rev_share_fb, rev_share_other,
  catering_boost_percent, exit_cap_rate, tax_rate, land_value_percent, disposition_commission,
  base_management_fee_rate, incentive_management_fee_rate,
  street_address, city, state_province, zip_postal_code, country,
  research_values, user_id, refinance_years_after_acquisition
) OVERRIDING SYSTEM VALUE VALUES (
  43, 'Loch Sheldrake', 'Sullivan County, New York', 'North America', '/images/property-loch-sheldrake.png', 'Planned',
  '2026-11-01', '2027-05-01',
  3000000, 1000000, 150000, 400000,
  20, 280, 0.035, 0.5, 0.68,
  4, 0.05, 18, 'Full Equity',
  0.65, 0.075, 25, 0.025,
  'Yes', '2030-05-01', 0.75, 0.09, 25, 0.03,
  0.19, 0.09, 0.07, 0.02, 0.055,
  0.055, 0.028, 0.035, 0.005, 0.04, 0.04,
  0.35, 0.25, 0.08,
  0.22, 0.09, 0.25, 0.3, 0.05,
  0.085, 0.12,
  '59 Hazelnis Drive', 'Loch Sheldrake', 'New York', '12759', 'United States',
  '{"adr": {"mid": 310, "source": "seed", "display": "$240–$380"}, "costFB": {"mid": 9, "source": "seed", "display": "7%–12%"}, "costIT": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "capRate": {"mid": 8.5, "source": "seed", "display": "7.5%–9.5%"}, "costFFE": {"mid": 4, "source": "seed", "display": "3%–5%"}, "catering": {"mid": 28, "source": "seed", "display": "22%–35%"}, "svcFeeIT": {"mid": 0.5, "source": "seed", "display": "0.3%–0.8%"}, "costAdmin": {"mid": 5.5, "source": "seed", "display": "4%–7%"}, "costOther": {"mid": 5, "source": "seed", "display": "3%–6%"}, "incomeTax": {"mid": 30, "source": "seed", "display": "28%–33%"}, "landValue": {"mid": 30, "source": "seed", "display": "25%–35%"}, "occupancy": {"mid": 68, "source": "seed", "display": "60%–75%"}, "rampMonths": {"mid": 15, "source": "seed", "display": "12–18 mo"}, "incentiveFee": {"mid": 10, "source": "seed", "display": "8%–12%"}, "costInsurance": {"mid": 0.5, "source": "seed", "display": "0.3%–0.7%"}, "costMarketing": {"mid": 2, "source": "seed", "display": "1%–3%"}, "costUtilities": {"mid": 4.5, "source": "seed", "display": "3.5%–5.5%"}, "startOccupancy": {"mid": 45, "source": "seed", "display": "35%–50%"}, "costPropertyOps": {"mid": 4, "source": "seed", "display": "3%–5%"}, "svcFeeMarketing": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "costHousekeeping": {"mid": 18, "source": "seed", "display": "14%–22%"}, "svcFeeAccounting": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "costPropertyTaxes": {"mid": 2.2, "source": "seed", "display": "1.8%–2.8%"}, "svcFeeGeneralMgmt": {"mid": 1, "source": "seed", "display": "0.7%–1.2%"}, "svcFeeReservations": {"mid": 1.5, "source": "seed", "display": "1%–2%"}}',
  1, 3
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location, market = EXCLUDED.market, image_url = EXCLUDED.image_url,
  status = EXCLUDED.status, acquisition_date = EXCLUDED.acquisition_date, operations_start_date = EXCLUDED.operations_start_date,
  purchase_price = EXCLUDED.purchase_price, building_improvements = EXCLUDED.building_improvements,
  pre_opening_costs = EXCLUDED.pre_opening_costs, operating_reserve = EXCLUDED.operating_reserve,
  room_count = EXCLUDED.room_count, start_adr = EXCLUDED.start_adr, adr_growth_rate = EXCLUDED.adr_growth_rate,
  start_occupancy = EXCLUDED.start_occupancy, max_occupancy = EXCLUDED.max_occupancy,
  occupancy_ramp_months = EXCLUDED.occupancy_ramp_months, occupancy_growth_step = EXCLUDED.occupancy_growth_step,
  stabilization_months = EXCLUDED.stabilization_months, type = EXCLUDED.type,
  acquisition_ltv = EXCLUDED.acquisition_ltv, acquisition_interest_rate = EXCLUDED.acquisition_interest_rate,
  acquisition_term_years = EXCLUDED.acquisition_term_years, acquisition_closing_cost_rate = EXCLUDED.acquisition_closing_cost_rate,
  will_refinance = EXCLUDED.will_refinance, refinance_date = EXCLUDED.refinance_date,
  refinance_ltv = EXCLUDED.refinance_ltv, refinance_interest_rate = EXCLUDED.refinance_interest_rate,
  refinance_term_years = EXCLUDED.refinance_term_years, refinance_closing_cost_rate = EXCLUDED.refinance_closing_cost_rate,
  cost_rate_rooms = EXCLUDED.cost_rate_rooms, cost_rate_fb = EXCLUDED.cost_rate_fb,
  cost_rate_admin = EXCLUDED.cost_rate_admin, cost_rate_marketing = EXCLUDED.cost_rate_marketing,
  cost_rate_property_ops = EXCLUDED.cost_rate_property_ops, cost_rate_utilities = EXCLUDED.cost_rate_utilities,
  cost_rate_insurance = EXCLUDED.cost_rate_insurance, cost_rate_taxes = EXCLUDED.cost_rate_taxes,
  cost_rate_it = EXCLUDED.cost_rate_it, cost_rate_ffe = EXCLUDED.cost_rate_ffe, cost_rate_other = EXCLUDED.cost_rate_other,
  rev_share_events = EXCLUDED.rev_share_events, rev_share_fb = EXCLUDED.rev_share_fb, rev_share_other = EXCLUDED.rev_share_other,
  catering_boost_percent = EXCLUDED.catering_boost_percent, exit_cap_rate = EXCLUDED.exit_cap_rate,
  tax_rate = EXCLUDED.tax_rate, land_value_percent = EXCLUDED.land_value_percent,
  disposition_commission = EXCLUDED.disposition_commission,
  base_management_fee_rate = EXCLUDED.base_management_fee_rate, incentive_management_fee_rate = EXCLUDED.incentive_management_fee_rate,
  street_address = EXCLUDED.street_address, city = EXCLUDED.city, state_province = EXCLUDED.state_province,
  zip_postal_code = EXCLUDED.zip_postal_code, country = EXCLUDED.country,
  research_values = EXCLUDED.research_values, user_id = EXCLUDED.user_id,
  refinance_years_after_acquisition = EXCLUDED.refinance_years_after_acquisition;

-- 3. Belleayre Mountain (Mar 2027) — Western Catskills, NY — Full Equity + Refi
INSERT INTO properties (
  id, name, location, market, image_url, status,
  acquisition_date, operations_start_date,
  purchase_price, building_improvements, pre_opening_costs, operating_reserve,
  room_count, start_adr, adr_growth_rate, start_occupancy, max_occupancy,
  occupancy_ramp_months, occupancy_growth_step, stabilization_months, type,
  acquisition_ltv, acquisition_interest_rate, acquisition_term_years, acquisition_closing_cost_rate,
  will_refinance, refinance_date, refinance_ltv, refinance_interest_rate, refinance_term_years, refinance_closing_cost_rate,
  cost_rate_rooms, cost_rate_fb, cost_rate_admin, cost_rate_marketing, cost_rate_property_ops,
  cost_rate_utilities, cost_rate_insurance, cost_rate_taxes, cost_rate_it, cost_rate_ffe, cost_rate_other,
  rev_share_events, rev_share_fb, rev_share_other,
  catering_boost_percent, exit_cap_rate, tax_rate, land_value_percent, disposition_commission,
  base_management_fee_rate, incentive_management_fee_rate,
  street_address, city, state_province, zip_postal_code, country,
  research_values, user_id, refinance_years_after_acquisition
) OVERRIDING SYSTEM VALUE VALUES (
  32, 'Belleayre Mountain', 'Western Catskills, New York', 'North America', '/images/property-belleayre.png', 'Planned',
  '2027-03-01', '2027-09-01',
  3500000, 800000, 250000, 500000,
  20, 320, 0.035, 0.4, 0.68,
  12, 0.05, 36, 'Full Equity',
  0.65, 0.075, 25, 0.025,
  'Yes', '2030-09-01', 0.75, 0.09, 25, 0.03,
  0.2, 0.09, 0.08, 0.02, 0.06,
  0.055, 0.03, 0.035, 0.005, 0.04, 0.04,
  0.3, 0.28, 0.07,
  0.2, 0.085, 0.25, 0.4, 0.05,
  0.085, 0.12,
  'Upper Delaware River Valley', 'Highmount', 'New York', '12441', 'United States',
  '{"adr": {"mid": 350, "source": "seed", "display": "$280–$450"}, "costFB": {"mid": 9, "source": "seed", "display": "7%–12%"}, "costIT": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "capRate": {"mid": 7.5, "source": "seed", "display": "6.5%–8.5%"}, "costFFE": {"mid": 4, "source": "seed", "display": "3%–5%"}, "catering": {"mid": 30, "source": "seed", "display": "25%–35%"}, "svcFeeIT": {"mid": 0.5, "source": "seed", "display": "0.3%–0.8%"}, "costAdmin": {"mid": 5, "source": "seed", "display": "4%–7%"}, "costOther": {"mid": 5, "source": "seed", "display": "3%–6%"}, "incomeTax": {"mid": 31, "source": "seed", "display": "29%–34%"}, "landValue": {"mid": 40, "source": "seed", "display": "30%–50%"}, "occupancy": {"mid": 76, "source": "seed", "display": "70%–82%"}, "rampMonths": {"mid": 18, "source": "seed", "display": "12–24 mo"}, "incentiveFee": {"mid": 10, "source": "seed", "display": "8%–12%"}, "costInsurance": {"mid": 0.6, "source": "seed", "display": "0.4%–0.8%"}, "costMarketing": {"mid": 2, "source": "seed", "display": "1%–3%"}, "costUtilities": {"mid": 4.2, "source": "seed", "display": "3.5%–5%"}, "startOccupancy": {"mid": 40, "source": "seed", "display": "30%–45%"}, "costPropertyOps": {"mid": 4, "source": "seed", "display": "3%–5%"}, "svcFeeMarketing": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "costHousekeeping": {"mid": 20, "source": "seed", "display": "15%–22%"}, "svcFeeAccounting": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "costPropertyTaxes": {"mid": 2.5, "source": "seed", "display": "1.8%–3.5%"}, "svcFeeGeneralMgmt": {"mid": 1, "source": "seed", "display": "0.7%–1.2%"}, "svcFeeReservations": {"mid": 1.5, "source": "seed", "display": "1%–2%"}}',
  1, 3
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location, market = EXCLUDED.market, image_url = EXCLUDED.image_url,
  status = EXCLUDED.status, acquisition_date = EXCLUDED.acquisition_date, operations_start_date = EXCLUDED.operations_start_date,
  purchase_price = EXCLUDED.purchase_price, building_improvements = EXCLUDED.building_improvements,
  pre_opening_costs = EXCLUDED.pre_opening_costs, operating_reserve = EXCLUDED.operating_reserve,
  room_count = EXCLUDED.room_count, start_adr = EXCLUDED.start_adr, adr_growth_rate = EXCLUDED.adr_growth_rate,
  start_occupancy = EXCLUDED.start_occupancy, max_occupancy = EXCLUDED.max_occupancy,
  occupancy_ramp_months = EXCLUDED.occupancy_ramp_months, occupancy_growth_step = EXCLUDED.occupancy_growth_step,
  stabilization_months = EXCLUDED.stabilization_months, type = EXCLUDED.type,
  acquisition_ltv = EXCLUDED.acquisition_ltv, acquisition_interest_rate = EXCLUDED.acquisition_interest_rate,
  acquisition_term_years = EXCLUDED.acquisition_term_years, acquisition_closing_cost_rate = EXCLUDED.acquisition_closing_cost_rate,
  will_refinance = EXCLUDED.will_refinance, refinance_date = EXCLUDED.refinance_date,
  refinance_ltv = EXCLUDED.refinance_ltv, refinance_interest_rate = EXCLUDED.refinance_interest_rate,
  refinance_term_years = EXCLUDED.refinance_term_years, refinance_closing_cost_rate = EXCLUDED.refinance_closing_cost_rate,
  cost_rate_rooms = EXCLUDED.cost_rate_rooms, cost_rate_fb = EXCLUDED.cost_rate_fb,
  cost_rate_admin = EXCLUDED.cost_rate_admin, cost_rate_marketing = EXCLUDED.cost_rate_marketing,
  cost_rate_property_ops = EXCLUDED.cost_rate_property_ops, cost_rate_utilities = EXCLUDED.cost_rate_utilities,
  cost_rate_insurance = EXCLUDED.cost_rate_insurance, cost_rate_taxes = EXCLUDED.cost_rate_taxes,
  cost_rate_it = EXCLUDED.cost_rate_it, cost_rate_ffe = EXCLUDED.cost_rate_ffe, cost_rate_other = EXCLUDED.cost_rate_other,
  rev_share_events = EXCLUDED.rev_share_events, rev_share_fb = EXCLUDED.rev_share_fb, rev_share_other = EXCLUDED.rev_share_other,
  catering_boost_percent = EXCLUDED.catering_boost_percent, exit_cap_rate = EXCLUDED.exit_cap_rate,
  tax_rate = EXCLUDED.tax_rate, land_value_percent = EXCLUDED.land_value_percent,
  disposition_commission = EXCLUDED.disposition_commission,
  base_management_fee_rate = EXCLUDED.base_management_fee_rate, incentive_management_fee_rate = EXCLUDED.incentive_management_fee_rate,
  street_address = EXCLUDED.street_address, city = EXCLUDED.city, state_province = EXCLUDED.state_province,
  zip_postal_code = EXCLUDED.zip_postal_code, country = EXCLUDED.country,
  research_values = EXCLUDED.research_values, user_id = EXCLUDED.user_id,
  refinance_years_after_acquisition = EXCLUDED.refinance_years_after_acquisition;

-- 4. Scott's House (Aug 2027) — Ogden Valley, Utah — Financed (no refi)
INSERT INTO properties (
  id, name, location, market, image_url, status,
  acquisition_date, operations_start_date,
  purchase_price, building_improvements, pre_opening_costs, operating_reserve,
  room_count, start_adr, adr_growth_rate, start_occupancy, max_occupancy,
  occupancy_ramp_months, occupancy_growth_step, stabilization_months, type,
  acquisition_ltv, acquisition_interest_rate, acquisition_term_years, acquisition_closing_cost_rate,
  will_refinance, refinance_date, refinance_ltv, refinance_interest_rate, refinance_term_years, refinance_closing_cost_rate,
  cost_rate_rooms, cost_rate_fb, cost_rate_admin, cost_rate_marketing, cost_rate_property_ops,
  cost_rate_utilities, cost_rate_insurance, cost_rate_taxes, cost_rate_it, cost_rate_ffe, cost_rate_other,
  rev_share_events, rev_share_fb, rev_share_other,
  catering_boost_percent, exit_cap_rate, tax_rate, land_value_percent, disposition_commission,
  base_management_fee_rate, incentive_management_fee_rate,
  street_address, city, state_province, zip_postal_code, country,
  research_values, user_id, refinance_years_after_acquisition
) OVERRIDING SYSTEM VALUE VALUES (
  39, 'Scott''s House', 'Ogden Valley, Utah', 'North America', '/images/property-eden.png', 'Planned',
  '2027-08-01', '2028-02-01',
  3200000, 800000, 200000, 400000,
  20, 350, 0.03, 0.45, 0.65,
  6, 0.05, 24, 'Financed',
  0.6, 0.07, 25, 0.025,
  NULL, NULL, NULL, NULL, NULL, NULL,
  0.2, 0.08, 0.07, 0.02, 0.05,
  0.05, 0.025, 0.02, 0.005, 0.04, 0.04,
  0.3, 0.2, 0.08,
  0.2, 0.085, 0.22, 0.3, 0.05,
  0.085, 0.12,
  'Eden', 'Eden', 'Utah', '84310', 'United States',
  '{"adr": {"mid": 380, "source": "seed", "display": "$300–$475"}, "costFB": {"mid": 8, "source": "seed", "display": "6%–10%"}, "costIT": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "capRate": {"mid": 8, "source": "seed", "display": "7%–9%"}, "costFFE": {"mid": 4, "source": "seed", "display": "3%–5%"}, "catering": {"mid": 32, "source": "seed", "display": "25%–40%"}, "svcFeeIT": {"mid": 0.5, "source": "seed", "display": "0.3%–0.8%"}, "costAdmin": {"mid": 5, "source": "seed", "display": "4%–7%"}, "costOther": {"mid": 5, "source": "seed", "display": "3%–6%"}, "incomeTax": {"mid": 25, "source": "seed", "display": "24%–26%"}, "landValue": {"mid": 30, "source": "seed", "display": "25%–35%"}, "occupancy": {"mid": 65, "source": "seed", "display": "58%–72%"}, "rampMonths": {"mid": 14, "source": "seed", "display": "10–18 mo"}, "incentiveFee": {"mid": 10, "source": "seed", "display": "8%–12%"}, "costInsurance": {"mid": 0.4, "source": "seed", "display": "0.3%–0.6%"}, "costMarketing": {"mid": 2, "source": "seed", "display": "1%–3%"}, "costUtilities": {"mid": 4.5, "source": "seed", "display": "3.5%–5.5%"}, "startOccupancy": {"mid": 42, "source": "seed", "display": "35%–50%"}, "costPropertyOps": {"mid": 4, "source": "seed", "display": "3%–5%"}, "svcFeeMarketing": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "costHousekeeping": {"mid": 19, "source": "seed", "display": "15%–22%"}, "svcFeeAccounting": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "costPropertyTaxes": {"mid": 0.9, "source": "seed", "display": "0.7%–1.2%"}, "svcFeeGeneralMgmt": {"mid": 1, "source": "seed", "display": "0.7%–1.2%"}, "svcFeeReservations": {"mid": 1.5, "source": "seed", "display": "1%–2%"}}',
  1, NULL
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location, market = EXCLUDED.market, image_url = EXCLUDED.image_url,
  status = EXCLUDED.status, acquisition_date = EXCLUDED.acquisition_date, operations_start_date = EXCLUDED.operations_start_date,
  purchase_price = EXCLUDED.purchase_price, building_improvements = EXCLUDED.building_improvements,
  pre_opening_costs = EXCLUDED.pre_opening_costs, operating_reserve = EXCLUDED.operating_reserve,
  room_count = EXCLUDED.room_count, start_adr = EXCLUDED.start_adr, adr_growth_rate = EXCLUDED.adr_growth_rate,
  start_occupancy = EXCLUDED.start_occupancy, max_occupancy = EXCLUDED.max_occupancy,
  occupancy_ramp_months = EXCLUDED.occupancy_ramp_months, occupancy_growth_step = EXCLUDED.occupancy_growth_step,
  stabilization_months = EXCLUDED.stabilization_months, type = EXCLUDED.type,
  acquisition_ltv = EXCLUDED.acquisition_ltv, acquisition_interest_rate = EXCLUDED.acquisition_interest_rate,
  acquisition_term_years = EXCLUDED.acquisition_term_years, acquisition_closing_cost_rate = EXCLUDED.acquisition_closing_cost_rate,
  will_refinance = EXCLUDED.will_refinance, refinance_date = EXCLUDED.refinance_date,
  refinance_ltv = EXCLUDED.refinance_ltv, refinance_interest_rate = EXCLUDED.refinance_interest_rate,
  refinance_term_years = EXCLUDED.refinance_term_years, refinance_closing_cost_rate = EXCLUDED.refinance_closing_cost_rate,
  cost_rate_rooms = EXCLUDED.cost_rate_rooms, cost_rate_fb = EXCLUDED.cost_rate_fb,
  cost_rate_admin = EXCLUDED.cost_rate_admin, cost_rate_marketing = EXCLUDED.cost_rate_marketing,
  cost_rate_property_ops = EXCLUDED.cost_rate_property_ops, cost_rate_utilities = EXCLUDED.cost_rate_utilities,
  cost_rate_insurance = EXCLUDED.cost_rate_insurance, cost_rate_taxes = EXCLUDED.cost_rate_taxes,
  cost_rate_it = EXCLUDED.cost_rate_it, cost_rate_ffe = EXCLUDED.cost_rate_ffe, cost_rate_other = EXCLUDED.cost_rate_other,
  rev_share_events = EXCLUDED.rev_share_events, rev_share_fb = EXCLUDED.rev_share_fb, rev_share_other = EXCLUDED.rev_share_other,
  catering_boost_percent = EXCLUDED.catering_boost_percent, exit_cap_rate = EXCLUDED.exit_cap_rate,
  tax_rate = EXCLUDED.tax_rate, land_value_percent = EXCLUDED.land_value_percent,
  disposition_commission = EXCLUDED.disposition_commission,
  base_management_fee_rate = EXCLUDED.base_management_fee_rate, incentive_management_fee_rate = EXCLUDED.incentive_management_fee_rate,
  street_address = EXCLUDED.street_address, city = EXCLUDED.city, state_province = EXCLUDED.state_province,
  zip_postal_code = EXCLUDED.zip_postal_code, country = EXCLUDED.country,
  research_values = EXCLUDED.research_values, user_id = EXCLUDED.user_id;

-- 5. Lakeview Haven Lodge (Dec 2027) — Ogden Valley, Utah — Financed (no refi)
INSERT INTO properties (
  id, name, location, market, image_url, status,
  acquisition_date, operations_start_date,
  purchase_price, building_improvements, pre_opening_costs, operating_reserve,
  room_count, start_adr, adr_growth_rate, start_occupancy, max_occupancy,
  occupancy_ramp_months, occupancy_growth_step, stabilization_months, type,
  acquisition_ltv, acquisition_interest_rate, acquisition_term_years, acquisition_closing_cost_rate,
  will_refinance, refinance_date, refinance_ltv, refinance_interest_rate, refinance_term_years, refinance_closing_cost_rate,
  cost_rate_rooms, cost_rate_fb, cost_rate_admin, cost_rate_marketing, cost_rate_property_ops,
  cost_rate_utilities, cost_rate_insurance, cost_rate_taxes, cost_rate_it, cost_rate_ffe, cost_rate_other,
  rev_share_events, rev_share_fb, rev_share_other,
  catering_boost_percent, exit_cap_rate, tax_rate, land_value_percent, disposition_commission,
  base_management_fee_rate, incentive_management_fee_rate,
  street_address, city, state_province, zip_postal_code, country,
  research_values, user_id, refinance_years_after_acquisition
) OVERRIDING SYSTEM VALUE VALUES (
  33, 'Lakeview Haven Lodge', 'Ogden Valley, Utah', 'North America', '/images/property-huntsville.png', 'Planned',
  '2027-12-01', '2028-06-01',
  3800000, 1200000, 250000, 500000,
  20, 320, 0.03, 0.5, 0.68,
  3, 0.05, 18, 'Financed',
  0.65, 0.07, 25, 0.025,
  NULL, NULL, 0.75, 0.09, 25, 0.03,
  0.2, 0.09, 0.07, 0.02, 0.055,
  0.05, 0.025, 0.02, 0.005, 0.04, 0.04,
  0.28, 0.22, 0.1,
  0.18, 0.08, 0.22, 0.35, 0.05,
  0.085, 0.12,
  'Pineview Reservoir', 'Huntsville', 'Utah', '84317', 'United States',
  '{"adr": {"mid": 370, "source": "seed", "display": "$280–$475"}, "costFB": {"mid": 9, "source": "seed", "display": "7%–12%"}, "costIT": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "capRate": {"mid": 8.5, "source": "seed", "display": "8%–9.5%"}, "costFFE": {"mid": 4, "source": "seed", "display": "3%–5%"}, "catering": {"mid": 36, "source": "seed", "display": "30%–42%"}, "svcFeeIT": {"mid": 0.5, "source": "seed", "display": "0.3%–0.8%"}, "costAdmin": {"mid": 5, "source": "seed", "display": "4%–7%"}, "costOther": {"mid": 5, "source": "seed", "display": "3%–6%"}, "incomeTax": {"mid": 25, "source": "seed", "display": "24%–26%"}, "landValue": {"mid": 20, "source": "seed", "display": "15%–25%"}, "occupancy": {"mid": 62, "source": "seed", "display": "55%–70%"}, "rampMonths": {"mid": 18, "source": "seed", "display": "12–24 mo"}, "incentiveFee": {"mid": 10, "source": "seed", "display": "8%–12%"}, "costInsurance": {"mid": 0.4, "source": "seed", "display": "0.3%–0.5%"}, "costMarketing": {"mid": 2, "source": "seed", "display": "1%–3%"}, "costUtilities": {"mid": 4.2, "source": "seed", "display": "3.5%–5%"}, "startOccupancy": {"mid": 40, "source": "seed", "display": "30%–45%"}, "costPropertyOps": {"mid": 4, "source": "seed", "display": "3%–5%"}, "svcFeeMarketing": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "costHousekeeping": {"mid": 20, "source": "seed", "display": "15%–22%"}, "svcFeeAccounting": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "costPropertyTaxes": {"mid": 0.8, "source": "seed", "display": "0.6%–1.2%"}, "svcFeeGeneralMgmt": {"mid": 1, "source": "seed", "display": "0.7%–1.2%"}, "svcFeeReservations": {"mid": 1.5, "source": "seed", "display": "1%–2%"}}',
  1, NULL
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location, market = EXCLUDED.market, image_url = EXCLUDED.image_url,
  status = EXCLUDED.status, acquisition_date = EXCLUDED.acquisition_date, operations_start_date = EXCLUDED.operations_start_date,
  purchase_price = EXCLUDED.purchase_price, building_improvements = EXCLUDED.building_improvements,
  pre_opening_costs = EXCLUDED.pre_opening_costs, operating_reserve = EXCLUDED.operating_reserve,
  room_count = EXCLUDED.room_count, start_adr = EXCLUDED.start_adr, adr_growth_rate = EXCLUDED.adr_growth_rate,
  start_occupancy = EXCLUDED.start_occupancy, max_occupancy = EXCLUDED.max_occupancy,
  occupancy_ramp_months = EXCLUDED.occupancy_ramp_months, occupancy_growth_step = EXCLUDED.occupancy_growth_step,
  stabilization_months = EXCLUDED.stabilization_months, type = EXCLUDED.type,
  acquisition_ltv = EXCLUDED.acquisition_ltv, acquisition_interest_rate = EXCLUDED.acquisition_interest_rate,
  acquisition_term_years = EXCLUDED.acquisition_term_years, acquisition_closing_cost_rate = EXCLUDED.acquisition_closing_cost_rate,
  will_refinance = EXCLUDED.will_refinance, refinance_date = EXCLUDED.refinance_date,
  refinance_ltv = EXCLUDED.refinance_ltv, refinance_interest_rate = EXCLUDED.refinance_interest_rate,
  refinance_term_years = EXCLUDED.refinance_term_years, refinance_closing_cost_rate = EXCLUDED.refinance_closing_cost_rate,
  cost_rate_rooms = EXCLUDED.cost_rate_rooms, cost_rate_fb = EXCLUDED.cost_rate_fb,
  cost_rate_admin = EXCLUDED.cost_rate_admin, cost_rate_marketing = EXCLUDED.cost_rate_marketing,
  cost_rate_property_ops = EXCLUDED.cost_rate_property_ops, cost_rate_utilities = EXCLUDED.cost_rate_utilities,
  cost_rate_insurance = EXCLUDED.cost_rate_insurance, cost_rate_taxes = EXCLUDED.cost_rate_taxes,
  cost_rate_it = EXCLUDED.cost_rate_it, cost_rate_ffe = EXCLUDED.cost_rate_ffe, cost_rate_other = EXCLUDED.cost_rate_other,
  rev_share_events = EXCLUDED.rev_share_events, rev_share_fb = EXCLUDED.rev_share_fb, rev_share_other = EXCLUDED.rev_share_other,
  catering_boost_percent = EXCLUDED.catering_boost_percent, exit_cap_rate = EXCLUDED.exit_cap_rate,
  tax_rate = EXCLUDED.tax_rate, land_value_percent = EXCLUDED.land_value_percent,
  disposition_commission = EXCLUDED.disposition_commission,
  base_management_fee_rate = EXCLUDED.base_management_fee_rate, incentive_management_fee_rate = EXCLUDED.incentive_management_fee_rate,
  street_address = EXCLUDED.street_address, city = EXCLUDED.city, state_province = EXCLUDED.state_province,
  zip_postal_code = EXCLUDED.zip_postal_code, country = EXCLUDED.country,
  research_values = EXCLUDED.research_values, user_id = EXCLUDED.user_id;

-- 6. San Diego (Apr 2028) — Cartagena, Colombia — Financed (no refi)
INSERT INTO properties (
  id, name, location, market, image_url, status,
  acquisition_date, operations_start_date,
  purchase_price, building_improvements, pre_opening_costs, operating_reserve,
  room_count, start_adr, adr_growth_rate, start_occupancy, max_occupancy,
  occupancy_ramp_months, occupancy_growth_step, stabilization_months, type,
  acquisition_ltv, acquisition_interest_rate, acquisition_term_years, acquisition_closing_cost_rate,
  will_refinance, refinance_date, refinance_ltv, refinance_interest_rate, refinance_term_years, refinance_closing_cost_rate,
  cost_rate_rooms, cost_rate_fb, cost_rate_admin, cost_rate_marketing, cost_rate_property_ops,
  cost_rate_utilities, cost_rate_insurance, cost_rate_taxes, cost_rate_it, cost_rate_ffe, cost_rate_other,
  rev_share_events, rev_share_fb, rev_share_other,
  catering_boost_percent, exit_cap_rate, tax_rate, land_value_percent, disposition_commission,
  base_management_fee_rate, incentive_management_fee_rate,
  street_address, city, state_province, zip_postal_code, country,
  research_values, user_id, refinance_years_after_acquisition
) OVERRIDING SYSTEM VALUE VALUES (
  41, 'San Diego', 'Cartagena, Colombia', 'Latin America', '/images/property-cartagena.png', 'Planned',
  '2028-04-01', '2028-10-01',
  2000000, 1000000, 250000, 500000,
  20, 240, 0.035, 0.42, 0.72,
  10, 0.05, 36, 'Financed',
  0.6, 0.095, 25, 0.02,
  NULL, NULL, NULL, NULL, NULL, NULL,
  0.17, 0.09, 0.07, 0.015, 0.035,
  0.04, 0.025, 0.025, 0.005, 0.04, 0.04,
  0.3, 0.24, 0.06,
  0.2, 0.09, 0.35, 0.3, 0.05,
  0.085, 0.12,
  'Cochera del Hobo, Barrio San Diego', 'Cartagena', 'Bolívar', '130001', 'Colombia',
  '{"adr": {"mid": 220, "source": "seed", "display": "$160–$280"}, "costFB": {"mid": 9, "source": "seed", "display": "7%–12%"}, "costIT": {"mid": 0.8, "source": "seed", "display": "0.5%–1.2%"}, "capRate": {"mid": 9.5, "source": "seed", "display": "8.5%–11%"}, "costFFE": {"mid": 4, "source": "seed", "display": "3%–5%"}, "catering": {"mid": 28, "source": "seed", "display": "22%–35%"}, "svcFeeIT": {"mid": 0.5, "source": "seed", "display": "0.3%–0.8%"}, "costAdmin": {"mid": 5, "source": "seed", "display": "3%–6%"}, "costOther": {"mid": 4, "source": "seed", "display": "3%–5%"}, "incomeTax": {"mid": 35, "source": "seed", "display": "33%–38%"}, "landValue": {"mid": 30, "source": "seed", "display": "25%–35%"}, "occupancy": {"mid": 70, "source": "seed", "display": "62%–78%"}, "rampMonths": {"mid": 18, "source": "seed", "display": "14–24 mo"}, "incentiveFee": {"mid": 10, "source": "seed", "display": "8%–12%"}, "costInsurance": {"mid": 0.4, "source": "seed", "display": "0.3%–0.6%"}, "costMarketing": {"mid": 2, "source": "seed", "display": "1%–3%"}, "costUtilities": {"mid": 3, "source": "seed", "display": "2%–4%"}, "startOccupancy": {"mid": 38, "source": "seed", "display": "30%–45%"}, "costPropertyOps": {"mid": 3.5, "source": "seed", "display": "2.5%–4.5%"}, "svcFeeMarketing": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "costHousekeeping": {"mid": 15, "source": "seed", "display": "11%–18%"}, "svcFeeAccounting": {"mid": 1, "source": "seed", "display": "0.5%–1.5%"}, "costPropertyTaxes": {"mid": 1.5, "source": "seed", "display": "1%–2%"}, "svcFeeGeneralMgmt": {"mid": 1, "source": "seed", "display": "0.7%–1.2%"}, "svcFeeReservations": {"mid": 1.5, "source": "seed", "display": "1%–2%"}}',
  1, NULL
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location, market = EXCLUDED.market, image_url = EXCLUDED.image_url,
  status = EXCLUDED.status, acquisition_date = EXCLUDED.acquisition_date, operations_start_date = EXCLUDED.operations_start_date,
  purchase_price = EXCLUDED.purchase_price, building_improvements = EXCLUDED.building_improvements,
  pre_opening_costs = EXCLUDED.pre_opening_costs, operating_reserve = EXCLUDED.operating_reserve,
  room_count = EXCLUDED.room_count, start_adr = EXCLUDED.start_adr, adr_growth_rate = EXCLUDED.adr_growth_rate,
  start_occupancy = EXCLUDED.start_occupancy, max_occupancy = EXCLUDED.max_occupancy,
  occupancy_ramp_months = EXCLUDED.occupancy_ramp_months, occupancy_growth_step = EXCLUDED.occupancy_growth_step,
  stabilization_months = EXCLUDED.stabilization_months, type = EXCLUDED.type,
  acquisition_ltv = EXCLUDED.acquisition_ltv, acquisition_interest_rate = EXCLUDED.acquisition_interest_rate,
  acquisition_term_years = EXCLUDED.acquisition_term_years, acquisition_closing_cost_rate = EXCLUDED.acquisition_closing_cost_rate,
  will_refinance = EXCLUDED.will_refinance, refinance_date = EXCLUDED.refinance_date,
  refinance_ltv = EXCLUDED.refinance_ltv, refinance_interest_rate = EXCLUDED.refinance_interest_rate,
  refinance_term_years = EXCLUDED.refinance_term_years, refinance_closing_cost_rate = EXCLUDED.refinance_closing_cost_rate,
  cost_rate_rooms = EXCLUDED.cost_rate_rooms, cost_rate_fb = EXCLUDED.cost_rate_fb,
  cost_rate_admin = EXCLUDED.cost_rate_admin, cost_rate_marketing = EXCLUDED.cost_rate_marketing,
  cost_rate_property_ops = EXCLUDED.cost_rate_property_ops, cost_rate_utilities = EXCLUDED.cost_rate_utilities,
  cost_rate_insurance = EXCLUDED.cost_rate_insurance, cost_rate_taxes = EXCLUDED.cost_rate_taxes,
  cost_rate_it = EXCLUDED.cost_rate_it, cost_rate_ffe = EXCLUDED.cost_rate_ffe, cost_rate_other = EXCLUDED.cost_rate_other,
  rev_share_events = EXCLUDED.rev_share_events, rev_share_fb = EXCLUDED.rev_share_fb, rev_share_other = EXCLUDED.rev_share_other,
  catering_boost_percent = EXCLUDED.catering_boost_percent, exit_cap_rate = EXCLUDED.exit_cap_rate,
  tax_rate = EXCLUDED.tax_rate, land_value_percent = EXCLUDED.land_value_percent,
  disposition_commission = EXCLUDED.disposition_commission,
  base_management_fee_rate = EXCLUDED.base_management_fee_rate, incentive_management_fee_rate = EXCLUDED.incentive_management_fee_rate,
  street_address = EXCLUDED.street_address, city = EXCLUDED.city, state_province = EXCLUDED.state_province,
  zip_postal_code = EXCLUDED.zip_postal_code, country = EXCLUDED.country,
  research_values = EXCLUDED.research_values, user_id = EXCLUDED.user_id;

-- =============================================================================
-- USER GROUP PROPERTIES (link Norfolk AI Group to all 6 properties)
-- =============================================================================
DELETE FROM user_group_properties WHERE user_group_id = 2;
INSERT INTO user_group_properties (user_group_id, property_id) VALUES
  (2, 32), (2, 33), (2, 35), (2, 39), (2, 41), (2, 43)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- PROPERTY DESCRIPTIONS
-- =============================================================================
UPDATE properties SET description = 'A luxury hacienda retreat set in the lush hills of Antioquia, offering curated cultural experiences and farm-to-table dining amid Colombia''s coffee country.' WHERE id = 35 AND description IS NULL;
UPDATE properties SET description = 'A 10-acre lakeside estate featuring an iconic octagonal main house, three private bodies of water, a private island with gazebo, and income-generating apartment. Set in Sullivan County''s Catskill region with event venue potential for weddings, retreats, and luxury Airbnb experiences.' WHERE id = 43 AND description IS NULL;
UPDATE properties SET description = 'An alpine lodge nestled in the Western Catskills, offering four-season mountain recreation with ski-in access and panoramic ridge-line views.' WHERE id = 32 AND description IS NULL;
UPDATE properties SET description = 'A modern mountain retreat in Utah''s Ogden Valley, combining contemporary design with dramatic Wasatch Range views and year-round outdoor adventure.' WHERE id = 39 AND description IS NULL;
UPDATE properties SET description = 'A lakefront lodge overlooking Pineview Reservoir in Ogden Valley, offering tranquil waterfront living with mountain-backed sunsets and kayaking.' WHERE id = 33 AND description IS NULL;
UPDATE properties SET description = 'A colonial boutique hotel in Cartagena''s historic walled city, blending 17th-century architecture with Caribbean luxury, rooftop dining, and old-world charm.' WHERE id = 41 AND description IS NULL;

-- =============================================================================
-- PROPERTY FEE CATEGORIES (8 categories matching service templates)
-- Delete all and reinsert to ensure clean state
-- =============================================================================
DELETE FROM property_fee_categories;

INSERT INTO property_fee_categories (id, property_id, name, rate, is_active, sort_order) OVERRIDING SYSTEM VALUE VALUES
  (21, 32, 'Marketing', 0.02, TRUE, 1),
  (22, 32, 'IT', 0.01, TRUE, 2),
  (23, 32, 'Accounting', 0.015, TRUE, 3),
  (24, 32, 'Reservations', 0.02, TRUE, 4),
  (25, 32, 'General Management', 0.02, TRUE, 5),
  (50, 32, 'Insurance', 0.01, TRUE, 6),
  (51, 32, 'Property Operations', 0.01, TRUE, 7),
  (52, 32, 'Other Services', 0.01, TRUE, 8),
  (1, 33, 'Marketing', 0.02, TRUE, 1),
  (2, 33, 'IT', 0.01, TRUE, 2),
  (3, 33, 'Accounting', 0.015, TRUE, 3),
  (4, 33, 'Reservations', 0.02, TRUE, 4),
  (5, 33, 'General Management', 0.02, TRUE, 5),
  (53, 33, 'Insurance', 0.01, TRUE, 6),
  (54, 33, 'Property Operations', 0.01, TRUE, 7),
  (55, 33, 'Other Services', 0.01, TRUE, 8),
  (16, 35, 'Marketing', 0.02, TRUE, 1),
  (17, 35, 'IT', 0.01, TRUE, 2),
  (18, 35, 'Accounting', 0.015, TRUE, 3),
  (19, 35, 'Reservations', 0.02, TRUE, 4),
  (20, 35, 'General Management', 0.02, TRUE, 5),
  (56, 35, 'Insurance', 0.01, TRUE, 6),
  (57, 35, 'Property Operations', 0.01, TRUE, 7),
  (58, 35, 'Other Services', 0.01, TRUE, 8),
  (26, 39, 'Marketing', 0.02, TRUE, 1),
  (27, 39, 'IT', 0.01, TRUE, 2),
  (28, 39, 'Accounting', 0.015, TRUE, 3),
  (29, 39, 'Reservations', 0.02, TRUE, 4),
  (30, 39, 'General Management', 0.02, TRUE, 5),
  (59, 39, 'Insurance', 0.01, TRUE, 6),
  (60, 39, 'Property Operations', 0.01, TRUE, 7),
  (61, 39, 'Other Services', 0.01, TRUE, 8),
  (31, 41, 'Marketing', 0.02, TRUE, 1),
  (32, 41, 'IT', 0.01, TRUE, 2),
  (33, 41, 'Accounting', 0.015, TRUE, 3),
  (34, 41, 'Reservations', 0.02, TRUE, 4),
  (35, 41, 'General Management', 0.02, TRUE, 5),
  (62, 41, 'Insurance', 0.01, TRUE, 6),
  (63, 41, 'Property Operations', 0.01, TRUE, 7),
  (64, 41, 'Other Services', 0.01, TRUE, 8),
  (36, 43, 'Marketing', 0.02, TRUE, 1),
  (37, 43, 'IT', 0.01, TRUE, 2),
  (38, 43, 'Accounting', 0.015, TRUE, 3),
  (39, 43, 'Reservations', 0.02, TRUE, 4),
  (40, 43, 'General Management', 0.02, TRUE, 5),
  (65, 43, 'Insurance', 0.01, TRUE, 6),
  (66, 43, 'Property Operations', 0.01, TRUE, 7),
  (67, 43, 'Other Services', 0.01, TRUE, 8);

-- =============================================================================
-- MARKET RESEARCH
-- Update titles for existing reports, keep content intact
-- =============================================================================
UPDATE market_research SET title = 'Market Research: Belleayre Mountain' WHERE id = 24 AND property_id = 32;
UPDATE market_research SET title = 'Market Research: Lakeview Haven Lodge' WHERE id = 25 AND property_id = 33;
UPDATE market_research SET title = 'Market Research: Jano Grande Ranch' WHERE id = 27 AND property_id = 35;

-- =============================================================================
-- RESEARCH QUESTIONS
-- =============================================================================
INSERT INTO research_questions (id, question, sort_order) OVERRIDING SYSTEM VALUE VALUES
  (1, 'What is the average wellness retreat pricing in Costa Rica?', 0)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- SAVED SEARCHES
-- =============================================================================
INSERT INTO saved_searches (id, user_id, name, location, price_min, price_max, beds_min, lot_size_min, property_type) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, 'One', 'Austin', 1000000, 5000000, 4, 1, NULL)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- RESET SEQUENCES to max(id) + 1
-- =============================================================================
SELECT setval('companies_id_seq', COALESCE((SELECT MAX(id) FROM companies), 0) + 1, false);
SELECT setval('logos_id_seq', COALESCE((SELECT MAX(id) FROM logos), 0) + 1, false);
SELECT setval('user_groups_id_seq', COALESCE((SELECT MAX(id) FROM user_groups), 0) + 1, false);
SELECT setval('design_themes_id_seq', COALESCE((SELECT MAX(id) FROM design_themes), 0) + 1, false);
SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 0) + 1, false);
SELECT setval('global_assumptions_id_seq', COALESCE((SELECT MAX(id) FROM global_assumptions), 0) + 1, false);
SELECT setval('properties_id_seq', COALESCE((SELECT MAX(id) FROM properties), 0) + 1, false);
SELECT setval('property_fee_categories_id_seq', COALESCE((SELECT MAX(id) FROM property_fee_categories), 0) + 1, false);
SELECT setval('market_research_id_seq', COALESCE((SELECT MAX(id) FROM market_research), 0) + 1, false);
SELECT setval('research_questions_id_seq', COALESCE((SELECT MAX(id) FROM research_questions), 0) + 1, false);
SELECT setval('saved_searches_id_seq', COALESCE((SELECT MAX(id) FROM saved_searches), 0) + 1, false);
SELECT setval('asset_descriptions_id_seq', COALESCE((SELECT MAX(id) FROM asset_descriptions), 0) + 1, false);
SELECT setval('scenarios_id_seq', COALESCE((SELECT MAX(id) FROM scenarios), 0) + 1, false);

COMMIT;

-- =============================================================================
-- END OF PRODUCTION SYNC SCRIPT
-- =============================================================================
