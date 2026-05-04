-- ==============================================================================
-- Production Database Sync Script
-- Generated: 2026-05-04
-- Property IDs: 50, 51, 52, 53, 54, 55, 58, 63
-- Properties: 8 | Fee categories: 90
-- Safe to run multiple times (fully idempotent).
-- Transient tables (sessions, activity_logs, login_logs, verification_runs,
-- conversations, messages) are intentionally skipped.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- COMPANIES
-- ==============================================================================

INSERT INTO companies (id, name, type, description, logo_id, is_active, theme_id) OVERRIDING SYSTEM VALUE VALUES
  (4, 'The Mountain Company LLC', 'spv', 'SPV for mountain resort property acquisition', 2931, TRUE, 14),
  (5, 'The Coastal House LLC', 'spv', 'SPV for coastal boutique hotel property', 17, TRUE, 14),
  (6, 'The Forest Lodge LLC', 'spv', 'SPV for forest lodge retreat property', 18, TRUE, 14),
  (7, 'The Desert Bloom LLC', 'spv', 'SPV for desert wellness resort property', 19, TRUE, 14),
  (8, 'The Urban Loft LLC', 'spv', 'SPV for urban boutique hotel property', 20, TRUE, 14),
  (9, 'Hospitality Business Group', 'management', 'Management company overseeing all hotel SPVs', 2931, TRUE, 14),
  (10, 'Norfolk AI', 'management', 'AI-powered hospitality technology group', 2917, TRUE, 14),
  (11, 'KIT Capital', 'management', 'Investment and capital management firm', 24, TRUE, 14),
  (12, 'Numeratti Endeavors', 'management', 'Strategic investment ventures', 2931, TRUE, 14),
  (18, 'General', 'spv', 'Default catch-all company', 2931, TRUE, 14),
  (29, 'Numeratti', 'spv', NULL, 2916, TRUE, 14)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, description = EXCLUDED.description,
  logo_id = EXCLUDED.logo_id, is_active = EXCLUDED.is_active, theme_id = EXCLUDED.theme_id;


-- ==============================================================================
-- LOGOS
-- ==============================================================================

INSERT INTO logos (id, name, url, is_default, company_name) OVERRIDING SYSTEM VALUE VALUES
  (17, 'Coastal House Logo', '/api/media/logo-17.png', FALSE, 'The Coastal House'),
  (18, 'Forest Lodge Logo', '/api/media/logo-18.png', FALSE, 'The Forest Lodge'),
  (19, 'Desert Bloom Logo', '/api/media/logo-19.png', FALSE, 'The Desert Bloom'),
  (20, 'Urban Loft Logo', '/api/media/logo-20.png', FALSE, 'The Urban Loft'),
  (24, 'KIT Capital Spherical Logo', '/api/media/logo-24.png', FALSE, 'KIT Capital Partners'),
  (2916, 'Numeratti Logo', '/api/media/logo-2916.png', FALSE, 'Numeratti '),
  (2917, 'Norfolk AI Logo', '/api/media/norfolk-ai-blue.png', FALSE, 'Norfolk AI'),
  (2931, 'H+ Analytics', '/api/media/h-logo-glass.png', TRUE, 'H+ Analytics'),
  (18030, 'new logo', '/api/media/new-logo.png', TRUE, '__task526_test_1777383545205_with_sibling'),
  (22715, 'L+B Logo', '/api/media/lb-logo.jpeg', FALSE, 'L+B')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, url = EXCLUDED.url, is_default = EXCLUDED.is_default,
  company_name = EXCLUDED.company_name;


-- ==============================================================================
-- DESIGN THEMES
-- ==============================================================================

INSERT INTO design_themes (id, name, description, is_default, colors) OVERRIDING SYSTEM VALUE VALUES
  (14, 'Studio Noir', 'Crisp black and white with precise gray layers. Inspired by ElevenLabs — minimal, authoritative, and razor-sharp. Green accent cuts through the monochrome with surgical clarity.', TRUE, '[{"name":"Carbon","rank":1,"hexCode":"#18181B","description":"PALETTE: Primary — buttons, active nav, focus rings"},{"name":"Graphite","rank":2,"hexCode":"#3F3F46","description":"PALETTE: Secondary — contrast badges, secondary elements"},{"name":"White","rank":3,"hexCode":"#FFFFFF","description":"PALETTE: Background — page canvas, card surfaces"},{"name":"Ink","rank":4,"hexCode":"#09090B","description":"PALETTE: Foreground — primary text, headings"},{"name":"Smoke","rank":5,"hexCode":"#F4F4F5","description":"PALETTE: Muted — secondary cards, table alternates"},{"name":"Silver","rank":6,"hexCode":"#E4E4E7","description":"PALETTE: Border — input outlines, dividers"},{"name":"Emerald","rank":7,"hexCode":"#10B981","description":"PALETTE: Accent — IRR circles, key KPIs, success"},{"name":"Charcoal","rank":1,"hexCode":"#27272A","description":"CHART: Chart 1 — revenue, primary metrics"},{"name":"Slate","rank":2,"hexCode":"#52525B","description":"CHART: Chart 2 — net income, profitability"},{"name":"Zinc","rank":3,"hexCode":"#71717A","description":"CHART: Chart 3 — cash flow, operational"},{"name":"Stone","rank":4,"hexCode":"#A1A1AA","description":"CHART: Chart 4 — expenses, budget"},{"name":"Ash","rank":5,"hexCode":"#D4D4D8","description":"CHART: Chart 5 — background, comparison"},{"name":"Amber","rank":2,"hexCode":"#F59E0B","description":"LINE: Line 2 — income trend"},{"name":"Rose","rank":3,"hexCode":"#F43F5E","description":"LINE: Line 3 — expense trend"},{"name":"Sky","rank":4,"hexCode":"#0EA5E9","description":"LINE: Line 4 — cash flow trend"},{"name":"Violet","rank":5,"hexCode":"#8B5CF6","description":"LINE: Line 5 — projection overlay"},{"name":"Formula Line","rank":1,"hexCode":"#18181B","description":"EXPORT: Formula Line"}]')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  is_default = EXCLUDED.is_default, colors = EXCLUDED.colors;

INSERT INTO design_themes (id, name, description, is_default, colors) OVERRIDING SYSTEM VALUE VALUES
  (15, 'Tuscan Olive Grove', 'Sun-dappled olive and warm earth tones. Inspired by Mediterranean hillsides, blending natural elegance with grounded sophistication.', FALSE, '[{"name":"Olive Sage","rank":1,"hexCode":"#8A9A7B","description":"PALETTE: Primary brand color. Muted olive-green for buttons, active nav, focus rings."},{"name":"Deep Moss","rank":2,"hexCode":"#4A5D3F","description":"PALETTE: Secondary accent. Deep forest moss for contrast badges and secondary elements."},{"name":"Warm Sand","rank":3,"hexCode":"#FAF6F1","description":"PALETTE: Background and card surfaces. Warm sandy cream for an inviting canvas."},{"name":"Bark Brown","rank":4,"hexCode":"#3B3832","description":"PALETTE: Foreground text. Deep brown-charcoal for readable, warm type."},{"name":"Stone","rank":5,"hexCode":"#EDEBE7","description":"PALETTE: Muted surfaces. Warm stone for secondary cards and table alternates."},{"name":"Clay Border","rank":6,"hexCode":"#D8D3CC","description":"PALETTE: Borders and input outlines. Subtle warm clay tone."},{"name":"Tuscan Gold","rank":1,"hexCode":"#C4A35A","description":"ACCENT: Standout highlight for IRR circles, key KPIs, and achievement badges."},{"name":"Sage","rank":1,"hexCode":"#8A9A7B","description":"CHART: Primary series — revenue and key metrics."},{"name":"Moss","rank":2,"hexCode":"#4A5D3F","description":"CHART: Secondary series — net income and profitability."},{"name":"Terracotta","rank":3,"hexCode":"#C17853","description":"CHART: Tertiary series — warm contrast for cash flow data."},{"name":"Wheat","rank":4,"hexCode":"#C4A35A","description":"CHART: Quaternary series — expenses and budget metrics."},{"name":"Dusty Rose","rank":5,"hexCode":"#B07070","description":"CHART: Quinary series — alerts and negative variance."},{"name":"Forest","rank":1,"hexCode":"#2D6A4F","description":"LINE: Primary line — revenue trend."},{"name":"Terracotta","rank":2,"hexCode":"#C17853","description":"LINE: Secondary line — income trend."},{"name":"Plum","rank":3,"hexCode":"#7E3F8E","description":"LINE: Tertiary line — expense trend."},{"name":"Gold","rank":4,"hexCode":"#B8860B","description":"LINE: Quaternary line — cash flow trend."},{"name":"Clay","rank":5,"hexCode":"#A0522D","description":"LINE: Quinary line — projection overlay."},{"name":"Formula Line","rank":1,"hexCode":"#8A9A7B","description":"EXPORT: Formula Line"}]')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  is_default = EXCLUDED.is_default, colors = EXCLUDED.colors;

INSERT INTO design_themes (id, name, description, is_default, colors) OVERRIDING SYSTEM VALUE VALUES
  (16, 'Starlit Harbor', 'Deep navy twilight over calm waters. A commanding palette that conveys trust, authority, and the quiet confidence of a harbor at dusk.', FALSE, '[{"name":"Navy","rank":1,"hexCode":"#2C3E6B","description":"PALETTE: Primary brand color. Deep navy for buttons, active elements, and focus rings."},{"name":"Royal Blue","rank":2,"hexCode":"#1A2B5E","description":"PALETTE: Secondary accent. Darker indigo for badges and contrast elements."},{"name":"Cool White","rank":3,"hexCode":"#F8F9FC","description":"PALETTE: Background and card surfaces. Crisp cool-toned white."},{"name":"Ink","rank":4,"hexCode":"#1E293B","description":"PALETTE: Foreground text. Deep slate-ink for sharp, professional type."},{"name":"Ice Gray","rank":5,"hexCode":"#EFF1F5","description":"PALETTE: Muted surfaces. Cool ice gray for secondary cards and rows."},{"name":"Steel Border","rank":6,"hexCode":"#D1D5E0","description":"PALETTE: Borders and input outlines. Subtle cool-toned steel."},{"name":"Harbor Gold","rank":1,"hexCode":"#F59E0B","description":"ACCENT: Standout highlight for IRR circles, key KPIs, and achievement badges."},{"name":"Navy","rank":1,"hexCode":"#2C3E6B","description":"CHART: Primary series — revenue and key metrics."},{"name":"Cobalt","rank":2,"hexCode":"#3B82F6","description":"CHART: Secondary series — growth and income metrics."},{"name":"Violet","rank":3,"hexCode":"#7C3AED","description":"CHART: Tertiary series — cash flow and EBITDA."},{"name":"Teal","rank":4,"hexCode":"#0D9488","description":"CHART: Quaternary series — operations and costs."},{"name":"Coral","rank":5,"hexCode":"#F43F5E","description":"CHART: Quinary series — alerts and shortfalls."},{"name":"Azure","rank":1,"hexCode":"#2563EB","description":"LINE: Primary line — revenue trend."},{"name":"Amber","rank":2,"hexCode":"#D97706","description":"LINE: Secondary line — income trend."},{"name":"Emerald","rank":3,"hexCode":"#059669","description":"LINE: Tertiary line — expense trend."},{"name":"Rose","rank":4,"hexCode":"#E11D48","description":"LINE: Quaternary line — cash flow trend."},{"name":"Violet","rank":5,"hexCode":"#7C3AED","description":"LINE: Quinary line — projection overlay."},{"name":"Formula Line","rank":1,"hexCode":"#2C3E6B","description":"EXPORT: Formula Line"}]')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  is_default = EXCLUDED.is_default, colors = EXCLUDED.colors;

INSERT INTO design_themes (id, name, description, is_default, colors) OVERRIDING SYSTEM VALUE VALUES
  (17, 'Coastal Breeze', 'Rich teal and sea glass tones. Inspired by ocean horizons and coastal luxury — fresh, vibrant, and unmistakably modern.', FALSE, '[{"name":"Teal","rank":1,"hexCode":"#0D7377","description":"PALETTE: Primary brand color. Rich teal for buttons, active states, focus rings."},{"name":"Deep Ocean","rank":2,"hexCode":"#065F5F","description":"PALETTE: Secondary accent. Deep ocean green for contrast and emphasis."},{"name":"Seafoam White","rank":3,"hexCode":"#F7FBFA","description":"PALETTE: Background and card surfaces. Clean white with a cool aqua hint."},{"name":"Dark Slate","rank":4,"hexCode":"#1A2F2F","description":"PALETTE: Foreground text. Dark teal-slate for cohesive type."},{"name":"Mist","rank":5,"hexCode":"#EEF4F3","description":"PALETTE: Muted surfaces. Cool mist for secondary cards and rows."},{"name":"Sea Glass","rank":6,"hexCode":"#CADBD8","description":"PALETTE: Borders and input outlines. Subtle sea glass tone."},{"name":"Coral Sunset","rank":1,"hexCode":"#F97316","description":"ACCENT: Standout highlight for IRR circles, key KPIs, and achievement badges."},{"name":"Teal","rank":1,"hexCode":"#0D7377","description":"CHART: Primary series — revenue and key metrics."},{"name":"Deep Ocean","rank":2,"hexCode":"#065F5F","description":"CHART: Secondary series — profitability and margins."},{"name":"Coral","rank":3,"hexCode":"#F97316","description":"CHART: Tertiary series — warm contrast for cash flow."},{"name":"Cyan","rank":4,"hexCode":"#06B6D4","description":"CHART: Quaternary series — operations and costs."},{"name":"Rose","rank":5,"hexCode":"#E11D48","description":"CHART: Quinary series — alerts and shortfalls."},{"name":"Teal","rank":1,"hexCode":"#0F766E","description":"LINE: Primary line — revenue trend."},{"name":"Orange","rank":2,"hexCode":"#EA580C","description":"LINE: Secondary line — income trend."},{"name":"Indigo","rank":3,"hexCode":"#4F46E5","description":"LINE: Tertiary line — expense trend."},{"name":"Pink","rank":4,"hexCode":"#DB2777","description":"LINE: Quaternary line — cash flow trend."},{"name":"Lime","rank":5,"hexCode":"#65A30D","description":"LINE: Quinary line — projection overlay."},{"name":"Formula Line","rank":1,"hexCode":"#0D7377","description":"EXPORT: Formula Line"}]')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  is_default = EXCLUDED.is_default, colors = EXCLUDED.colors;

INSERT INTO design_themes (id, name, description, is_default, colors) OVERRIDING SYSTEM VALUE VALUES
  (18, 'Electric Twilight', 'Warm violet and deep indigo under a lavender sky. Creative energy meets professional clarity — bold, imaginative, and forward-thinking.', FALSE, '[{"name":"Violet","rank":1,"hexCode":"#7C5CFC","description":"PALETTE: Primary brand color. Warm violet-purple for buttons, active nav, focus rings."},{"name":"Deep Indigo","rank":2,"hexCode":"#5B3FD6","description":"PALETTE: Secondary accent. Deep indigo for contrast badges and emphasis."},{"name":"Lavender White","rank":3,"hexCode":"#FAF9FE","description":"PALETTE: Background and card surfaces. Soft lavender-tinted white."},{"name":"Dark Plum","rank":4,"hexCode":"#1E1B2E","description":"PALETTE: Foreground text. Deep plum-charcoal for sharp, readable type."},{"name":"Mist Lilac","rank":5,"hexCode":"#F0EEF6","description":"PALETTE: Muted surfaces. Soft lilac-gray for secondary cards and table alternates."},{"name":"Heather","rank":6,"hexCode":"#D5D1E1","description":"PALETTE: Borders and input outlines. Subtle heather-purple border tone."},{"name":"Electric Amber","rank":1,"hexCode":"#F59E0B","description":"ACCENT: Standout highlight for IRR circles, key KPIs, and achievement badges."},{"name":"Violet","rank":1,"hexCode":"#7C5CFC","description":"CHART: Primary series — revenue and key metrics."},{"name":"Indigo","rank":2,"hexCode":"#5B3FD6","description":"CHART: Secondary series — net income and profitability."},{"name":"Amber","rank":3,"hexCode":"#F59E0B","description":"CHART: Tertiary series — warm contrast for cash flow data."},{"name":"Teal","rank":4,"hexCode":"#14B8A6","description":"CHART: Quaternary series — operations and cost metrics."},{"name":"Rose","rank":5,"hexCode":"#F43F5E","description":"CHART: Quinary series — alerts and negative variance."},{"name":"Purple","rank":1,"hexCode":"#7C3AED","description":"LINE: Primary line — revenue trend."},{"name":"Cyan","rank":2,"hexCode":"#06B6D4","description":"LINE: Secondary line — income trend."},{"name":"Amber","rank":3,"hexCode":"#D97706","description":"LINE: Tertiary line — expense trend."},{"name":"Rose","rank":4,"hexCode":"#F43F5E","description":"LINE: Quaternary line — cash flow trend."},{"name":"Emerald","rank":5,"hexCode":"#10B981","description":"LINE: Quinary line — projection overlay."},{"name":"Formula Line","rank":1,"hexCode":"#7C5CFC","description":"EXPORT: Formula Line"}]')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  is_default = EXCLUDED.is_default, colors = EXCLUDED.colors;

INSERT INTO design_themes (id, name, description, is_default, colors) OVERRIDING SYSTEM VALUE VALUES
  (19, 'Claude', 'Warm terracotta and cream inspired by Anthropic''s Claude interface. Earthy, approachable, and quietly confident.', FALSE, '[{"name":"Terracotta","rank":1,"hexCode":"#D97757","description":"PALETTE: Primary brand color. Warm terracotta for buttons, active nav, focus rings."},{"name":"Warm Umber","rank":2,"hexCode":"#8B6F5E","description":"PALETTE: Secondary accent. Muted warm brown for contrast badges and secondary elements."},{"name":"Cream","rank":3,"hexCode":"#FAF7F4","description":"PALETTE: Background and card surfaces. Warm off-white cream canvas."},{"name":"Charcoal","rank":4,"hexCode":"#2D2B28","description":"PALETTE: Foreground text. Near-black warm charcoal for readable type."},{"name":"Linen","rank":5,"hexCode":"#F0EBE5","description":"PALETTE: Muted surfaces. Light warm beige for secondary cards and table alternates."},{"name":"Sand Border","rank":6,"hexCode":"#E5DED6","description":"PALETTE: Borders and input outlines. Subtle warm gray border tone."},{"name":"Teal","rank":1,"hexCode":"#0D9488","description":"ACCENT: Standout highlight for IRR circles, key KPIs, and success badges."},{"name":"Warm Amber","rank":2,"hexCode":"#D4A76A","description":"ACCENT: Secondary emphasis for charts, infographics, and comparative metrics."},{"name":"Teal","rank":1,"hexCode":"#0D9488","description":"CHART: Primary series — revenue and key metrics."},{"name":"Terracotta","rank":2,"hexCode":"#D97757","description":"CHART: Secondary series — net income and profitability."},{"name":"Slate Blue","rank":3,"hexCode":"#6B7FA3","description":"CHART: Tertiary series — cash flow and operational metrics."},{"name":"Amber","rank":4,"hexCode":"#D4A76A","description":"CHART: Quaternary series — expenses and budget."},{"name":"Muted Plum","rank":5,"hexCode":"#9B7A94","description":"CHART: Quinary series — background and comparison."},{"name":"Teal","rank":1,"hexCode":"#0D9488","description":"LINE: Primary line — revenue trend."},{"name":"Terracotta","rank":2,"hexCode":"#D97757","description":"LINE: Secondary line — income trend."},{"name":"Slate Blue","rank":3,"hexCode":"#6B7FA3","description":"LINE: Tertiary line — expense trend."},{"name":"Amber","rank":4,"hexCode":"#D4A76A","description":"LINE: Quaternary line — cash flow trend."},{"name":"Muted Plum","rank":5,"hexCode":"#9B7A94","description":"LINE: Quinary line — projection overlay."}]')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  is_default = EXCLUDED.is_default, colors = EXCLUDED.colors;


-- ==============================================================================
-- USERS (password hashes from live database)
-- NOTE: Production passwords are overridden by env vars on startup via seedAdminUser()
-- ==============================================================================

INSERT INTO users (id, email, password_hash, role, first_name, last_name, company, title, selected_theme_id) OVERRIDING SYSTEM VALUE VALUES
  (1, 'admin', '$2b$12$g7eRPZCci5Ncks.NZLvYtOJFaOnjRpiSRwJoCy3Cmdo.vz9br.y2u', 'admin', 'Ricardo', 'Cidale', 'The Norfolk AI Group', 'Partner', NULL),
  (2, 'rosario@kitcapital.com', '$2b$12$K/QkCgR3Nwb2PZTOqNk5nenwvsEHPzzjbOUhwdduTUwz8XXNHaV0y', 'user', 'Rosario', 'David', 'KIT Capital', 'COO', NULL),
  (4, 'kit@kitcapital.com', '$2b$12$3FlrckM6onE6sWv77DKu/ecz5xlPNKhITd13C7jM/NMRvu81PIGrK', 'admin', 'Dov', 'Tuzman', 'KIT Capital', 'Principal', NULL),
  (6, 'checker@norfolkgroup.io', '$2b$12$z4arI53blTCTtuCOx68OS.Ws42IxUfD.O.XJVppob4tKPS6HRjJzi', 'user', 'Alexandra', 'Morgan', 'Norfolk AI', 'Research Analyst', NULL),
  (8, 'reynaldo.fagundes@norfolk.ai', '$2b$12$IZFabpaWP4poVNDBpP8Rju/X5hWCMLR3hFpc74dlhPkSDerUOOUGe', 'user', 'Reynaldo', 'Fagundes', 'Norfolk AI', 'CTO', NULL),
  (9, 'lemazniku@icloud.com', '$2b$12$kZ3vTGwlxOxqcHK7euYpkumPayhkrMJYZqm2r81R58nIdb.KM7mtK', 'user', 'Lea', 'Mazniku', 'KIT Capital', 'Partner', NULL),
  (10, 'leslie@cidale.com', '$2b$12$OyxL3C0OkDViXqxi/5WzW.vtAVmyGn/0we6k2KSfTZwQEUtz28T1O', 'user', 'Leslie', 'Cidale', 'Numeratti Endeavors', 'Senior Partner', NULL),
  (11, 'wlaruffa@gmail.com', '$2b$12$oaNlfL/pDKwmIJVhROEDC.Kj/0Vd5EdqXq9Uk.ccC0FV3fdCJVSy6', 'user', 'William', 'Laruffa', 'Independent', 'Partner', NULL)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, role = EXCLUDED.role, first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name, company = EXCLUDED.company, title = EXCLUDED.title;


-- ==============================================================================
-- GLOBAL ASSUMPTIONS
-- ==============================================================================

INSERT INTO global_assumptions (
  id, user_id, model_start_date, inflation_rate, base_management_fee, incentive_management_fee,
  staff_salary, travel_cost_per_client, it_license_per_client, marketing_rate, misc_ops_rate,
  office_lease_start, professional_services_start, tech_infra_start, business_insurance_start,
  standard_acq_package, debt_assumptions, commission_rate, fixed_cost_escalation_rate,
  capital_raise_1_amount, capital_raise_1_date, capital_raise_2_amount, capital_raise_2_date,
  capital_raise_valuation_cap, capital_raise_discount_rate, company_tax_rate, company_ops_start_date,
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
  12,
  NULL,
  '2026-04-01',
  0.03,
  0.085,
  0.12,
  75000,
  12000,
  3000,
  0.05,
  0.03,
  36000,
  24000,
  18000,
  12000,
  '{"monthsToOps":6,"purchasePrice":3800000,"preOpeningCosts":200000,"operatingReserve":250000,"buildingImprovements":1200000}',
  '{"acqLTV":0.75,"refiLTV":0.75,"interestRate":0.09,"amortizationYears":25,"acqClosingCostRate":0.02,"refiClosingCostRate":0.03}',
  0.05,
  0.03,
  1000000,
  '2026-06-01',
  1000000,
  '2027-04-01',
  2500000,
  0.2,
  0.3,
  '2026-06-01',
  1,
  540000,
  540000,
  540000,
  600000,
  600000,
  700000,
  700000,
  800000,
  800000,
  900000,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  'L+B Hospitality Co',
  'Funding Vehicle',
  0.062,
  0.05,
  0.65,
  0.6,
  0.6,
  'claude-sonnet-4-5',
  '{"hasFB":true,"level":"luxury","maxAdr":600,"minAdr":150,"acreage":10,"maxRooms":80,"minRooms":10,"hasEvents":true,"description":"Luxury boutique hotels on private estates of 10+ acres, catering to 100+ person exotic, unique, and corporate events in exclusive, secluded settings with full-service F&B, wellness programming, and curated guest experiences.","hasWellness":true,"privacyLevel":"high","parkingSpaces":50,"eventLocations":2,"maxEventCapacity":150}',
  10,
  3,
  2.5,
  6,
  4.5,
  7,
  'Boutique Hotel',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  FALSE,
  '',
  '',
  '',
  '',
  NULL,
  '3718 N Wolf Creek Drive',
  'Eden',
  'Utah',
  'United States',
  '84310',
  '{"gym":"nice","spa":"must","barn":"major","pool":"major","sauna":"must","adrMax":380,"adrMin":210,"chapel":"nice","garden":"nice","hotTub":"nice","tennis":"nice","_source":"portfolio","casitas":"nice","firePit":"major","library":"no","_sources":{"urls":[{"id":"default-str","url":"https://str.com","label":"STR","addedAt":"2026-03-14T19:49:02.382Z"},{"id":"default-cbre","url":"https://www.cbre.com/industries/hotels","label":"CBRE Hotels","addedAt":"2026-03-14T19:49:02.382Z"},{"id":"default-hvs","url":"https://hvs.com","label":"HVS","addedAt":"2026-03-14T19:49:02.382Z"},{"id":"default-jll","url":"https://www.jll.com/en/industries/hotels-and-hospitality","label":"JLL Hotels","addedAt":"2026-03-14T19:49:02.382Z"},{"id":"default-hnn","url":"https://hotelnewsnow.com","label":"Hotel News Now","addedAt":"2026-03-14T19:49:02.382Z"},{"id":"default-hnet","url":"https://www.hospitalitynet.org","label":"Hospitality Net","addedAt":"2026-03-14T19:49:02.382Z"},{"id":"default-pkf","url":"https://www.pkfhotels.com","label":"PKF","addedAt":"2026-03-14T19:49:02.382Z"},{"id":"default-fred","url":"https://fred.stlouisfed.org","label":"FRED","addedAt":"2026-03-14T19:49:02.382Z"},{"id":"default-ahla","url":"https://www.ahla.com","label":"AHLA","addedAt":"2026-03-14T19:49:02.382Z"},{"id":"default-lodging","url":"https://lodgingmagazine.com","label":"Lodging Magazine","addedAt":"2026-03-14T19:49:02.382Z"}],"files":[]},"fbRating":1,"gameRoom":"nice","glamping":"nice","poolSqFt":400,"roomsMax":22,"roomsMin":2,"vineyard":"nice","_research":{"model":"claude-sonnet-4-6","sections":[{"title":"General Market Overview","content":"The boutique hotel segment continues to outperform broader lodging categories globally, driven by experiential travel demand, millennial and Gen Z traveler preferences, and the sustained post-pandemic rebound in both leisure and bleisure segments. According to STR and CoStar data, boutique and lifestyle hotels in secondary and tertiary markets have posted ADR growth of 6–9% year-over-year through 2023–2024, outpacing branded chain hotels in many regions. Independent operators and third-party management companies are increasingly positioned as preferred partners for asset owners seeking revenue optimization without franchise fee burdens.\n\nIn the Americas specifically, the convergence of nearshore tourism in Latin America and the resurgence of domestic drive-to leisure markets in the United States presents a compelling dual-market opportunity for a hotel management company with cross-border expertise. Colombia has emerged as one of Latin America''s fastest-growing inbound tourism destinations, while rural New York continues to absorb overflow demand from New York City metropolitan travelers seeking short-stay escapes. Both corridors are underserved by sophisticated, brand-agnostic management platforms capable of delivering institutional-quality operations at the boutique scale.\n\nInvestment fundamentals remain attractive across both geographies, with cap rates for boutique hospitality assets ranging from 7% to 10% depending on location maturity and asset quality. The fragmented ownership landscape — characterized by individual entrepreneurs, family offices, and small REITs — creates significant white space for a professional management company to consolidate operational oversight, implement revenue management systems, and drive NOI improvements of 15–25% within 18–36 months of engagement."},{"title":"Market Analysis: Medellín & Cartagena","content":"Medellín has undergone one of the most dramatic urban transformations in Latin American history, evolving from a city associated with insecurity into a globally recognized hub for innovation, design tourism, and medical travel. Boutique hotel inventory in El Poblado, Laureles, and the emerging Envigado corridor is growing rapidly, yet quality management infrastructure lags behind asset development. Average daily rates for upper-boutique properties range from $180–$240 USD, with occupancy levels stabilizing at 62–68% post-pandemic. Demand drivers include the city''s robust digital nomad ecosystem, international conference activity at Plaza Mayor, and year-round temperate climate — factors that contribute to lower seasonality risk compared to coastal destinations.\n\nCartagena operates as Colombia''s premier luxury coastal destination, with the Walled City (Ciudad Amurallada) and Getsemaní neighborhoods commanding premium boutique rates of $250–$380 USD ADR during high season (December–April and July). The UNESCO World Heritage designation provides a durable demand moat, attracting high-net-worth travelers from North America, Europe, and increasingly the Middle East. However, the market faces meaningful seasonality compression — low season occupancy can dip to 48–55% — and infrastructure constraints including water management and energy reliability create above-average operational complexity requiring experienced on-the-ground management.\n\nFor a hotel management company, Colombia presents a first-mover advantage opportunity. The peso''s depreciation against the USD since 2021 has made Colombian assets highly attractive to dollar-denominated investors, accelerating foreign ownership of boutique properties and creating demand for English-fluent, internationally benchmarked management partners. Regulatory frameworks under Colombia''s tourism promotion law (Law 300 and subsequent modifications) offer tax incentives for hotel operators in designated tourism development zones, further improving investment economics.","locationKey":"Colombia > Antioquia & Bolívar"},{"title":"Market Analysis: Catskills Region (Highmount, Loch Sheldrake, Eden, Huntsville)","content":"The Catskills region of upstate New York has experienced a structural demand renaissance since 2020, propelled by remote work migration, NYC metropolitan overflow, and a wave of boutique property conversions from legacy bungalow colonies and defunct Borscht Belt resorts. Towns including Highmount (Ulster County), Loch Sheldrake (Sullivan County), Eden, and Huntsville represent the emerging frontier of this revival — offering lower land acquisition costs and less saturated competitive sets compared to the already-gentrified Woodstock or Hudson corridors. Drive times of 2.5–3.5 hours from Midtown Manhattan position these micro-markets squarely within the weekend escape radius that defines Catskills demand.\n\nBoutique properties in this subregion are achieving ADR of $280–$420 USD on weekends, with blended weekly ADRs of $220–$310 USD, depending on amenity programming and brand positioning. Occupancy rates average 58–72% annually, with pronounced weekend and seasonal peaks (summer and fall foliage). The key value creation lever in these markets is programming — properties that successfully integrate farm-to-table dining, wellness and spa offerings, or arts-and-culture experiences consistently command 30–45% ADR premiums over commodity competitors. Operational sophistication, including dynamic pricing and OTA channel optimization, remains underdeveloped among the largely owner-operated boutique stock.\n\nFrom a management company perspective, the Catskills subregion offers high receptivity among asset owners who acquired or converted properties during the 2020–2022 boom but lack the operational bandwidth to optimize revenue or manage staffing challenges in rural labor markets. Cap rates for stabilized boutique assets in Sullivan and Ulster counties range from 7–9%, with value-add opportunities available in the 9–11% range pre-stabilization. The region''s growing short-term rental regulatory pressure at the county level is also pushing some formerly Airbnb-dependent operators toward professional hotel management structures, creating an additional inbound pipeline.","locationKey":"United States > New York"},{"title":"Conclusion & Strategic Recommendations","content":"The target markets across Colombia and the Catskills share a defining characteristic: they are experiencing demand inflection points that have materially outpaced the development of professional management infrastructure. In both geographies, boutique asset owners face the dual challenge of capitalizing on elevated traveler interest while managing operational complexity — precisely the gap a specialized hotel management company is positioned to fill. The ideal client profile (ICP) in these markets is an asset owner with 10–50 keys, annual revenues of $1M–$8M, limited in-house revenue management capability, and a strong desire to preserve the independent character of their property while accessing institutional-quality operations.\n\nStrategically, the management company should prioritize Cartagena and the Catskills core (Highmount, Loch Sheldrake) as initial entry markets given their more developed inbound tourism infrastructure and higher concentration of target-profile assets. Medellín represents a medium-term growth market where early relationship-building with local developers and family office owners will yield a strong pipeline as the city''s boutique supply continues to expand through 2026–2028. Eden and Huntsville offer longer-horizon opportunities as the Catskills demand wave continues its westward and southward progression through Sullivan County.\n\nKey recommendations include developing a bilingual (English/Spanish) management platform capable of serving both geographies under a unified operating model, investing in a proprietary revenue management and distribution technology stack to demonstrate measurable RevPAR lift within the first 90 days of management engagement, and structuring fee agreements that align incentives through base-plus-incentive models tied to NOI growth. Building a visible thought leadership presence in Colombia''s COTELCO hospitality association and the US-based AAHOA and Small Luxury Hotels networks will accelerate business development across all six target locations."}],"generatedAt":"2026-03-13T15:35:32.656Z","extractedMetrics":{"avgCapRate":{"unit":"%","value":8.2,"description":"Weighted average capitalization rate across stabilized boutique hotel assets in the target markets, with Colombian markets contributing higher cap rate premiums reflecting emerging market risk profiles."},"nationalAvgAdr":{"unit":"USD","value":315,"description":"Blended national average ADR for boutique hotel properties across both the Colombian and US target markets, weighted by market maturity and asset quality benchmarks as of 2024."},"locationMetrics":[{"avgAdr":{"unit":"USD","value":210},"capRate":{"unit":"%","value":9.5},"location":"Medellín","avgRevPAR":{"unit":"USD","value":137},"avgOccupancy":{"unit":"%","value":65},"demandGrowthRate":{"unit":"%","value":9},"investmentRating":"A","avgLandCostPerAcre":{"unit":"USD","value":45000},"competitiveIntensity":"medium"},{"avgAdr":{"unit":"USD","value":310},"capRate":{"unit":"%","value":9},"location":"Cartagena","avgRevPAR":{"unit":"USD","value":189},"avgOccupancy":{"unit":"%","value":61},"demandGrowthRate":{"unit":"%","value":7},"investmentRating":"A-","avgLandCostPerAcre":{"unit":"USD","value":120000},"competitiveIntensity":"high"},{"avgAdr":{"unit":"USD","value":295},"capRate":{"unit":"%","value":8},"location":"Highmount","avgRevPAR":{"unit":"USD","value":189},"avgOccupancy":{"unit":"%","value":64},"demandGrowthRate":{"unit":"%","value":6},"investmentRating":"B+","avgLandCostPerAcre":{"unit":"USD","value":85000},"competitiveIntensity":"medium"},{"avgAdr":{"unit":"USD","value":265},"capRate":{"unit":"%","value":8.5},"location":"Loch Sheldrake","avgRevPAR":{"unit":"USD","value":164},"avgOccupancy":{"unit":"%","value":62},"demandGrowthRate":{"unit":"%","value":7},"investmentRating":"B+","avgLandCostPerAcre":{"unit":"USD","value":65000},"competitiveIntensity":"low"},{"avgAdr":{"unit":"USD","value":240},"capRate":{"unit":"%","value":9},"location":"Eden","avgRevPAR":{"unit":"USD","value":139},"avgOccupancy":{"unit":"%","value":58},"demandGrowthRate":{"unit":"%","value":8},"investmentRating":"B","avgLandCostPerAcre":{"unit":"USD","value":52000},"competitiveIntensity":"low"},{"avgAdr":{"unit":"USD","value":235},"capRate":{"unit":"%","value":9.2},"location":"Huntsville","avgRevPAR":{"unit":"USD","value":134},"avgOccupancy":{"unit":"%","value":57},"demandGrowthRate":{"unit":"%","value":8},"investmentRating":"B","avgLandCostPerAcre":{"unit":"USD","value":48000},"competitiveIntensity":"low"}],"nationalAvgRevPAR":{"unit":"USD","value":205,"description":"Blended RevPAR calculated from weighted ADR and occupancy averages across Colombian and US boutique market segments in the identified target locations."},"nationalAvgOccupancy":{"unit":"%","value":65,"description":"Blended average annual occupancy rate across all six target locations, reflecting seasonal demand patterns in the Catskills and lower-season compression in Cartagena."}}},"halfBaths":2,"revParMax":259,"revParMin":123,"steamRoom":"major","targetIrr":18,"_generated":true,"_locations":[{"id":"loc-1773415573507-0","notes":"","cities":[{"name":"Medellín","radius":50},{"name":"Cartagena","radius":50}],"states":["ANT","BOL"],"country":"Colombia","countryCode":"CO"},{"id":"loc-1773415573508-1","notes":"","cities":[{"name":"Highmount","radius":50},{"name":"Loch Sheldrake","radius":50},{"name":"Eden","radius":50},{"name":"Huntsville","radius":50}],"states":["NY","UT"],"country":"United States","countryCode":"US"}],"basketball":"no","coldPlunge":"must","fbShareMax":31,"fbShareMin":11,"garageBays":4,"greenhouse":"nice","gymSqFtMax":1200,"gymSqFtMin":400,"maxRoofAge":15,"parkingMax":66,"parkingMin":10,"pickleball":"nice","secondPool":"no","wineCellar":"no","yogaStudio":"must","_definition":"The ideal acquisition target for Boutique Hotel is a luxury boutique hotel, estate hotel, hacienda, lodge, manor, or large private estate suitable for conversion into a full-service hospitality operation. The property should offer between 10 and 50 guest rooms or suites, with a sweet spot of 20 to 30 rooms. At minimum, the property must include 2 master suites of at least 400 sq ft (37 m²) each, with a total of 15 to 55 bedrooms and 15 to 55 bathrooms across the property. The land should span 5 acres (2 ha) to 100 acres (40.5 ha), with 8,000 sq ft (743 m²) to 40,000 sq ft (3,716 m²) of usable interior space.\n\nFood and beverage operations are rated at 4 out of 5, reflecting full-service restaurant with bar and lounge program. The dining area should seat 30 to 60 guests. F&B revenue is targeted at 35% to 60% of room revenue, with events contributing 25% to 50%, spa and wellness at 8% to 15%, and other ancillary services at 5% to 12%. Total ancillary revenue should reach 40% to 70% of room revenue.\n\nThe property must accommodate indoor events for 50 to 150 guests and outdoor events for 80 to 200 guests, with 30 to 80 parking spaces on site. Operational facilities include a commercial kitchen of at least 1,000 sq ft (93 m²), maintenance and storage space of 1,000 sq ft (93 m²), and staff quarters for 4 to 8 key personnel.\n\nRequired amenities include swimming pool. Preferred amenities include spa, gym, tennis, pickleball, hiking trails, equestrian facilities, vineyard or orchard, casitas.\n\nThe property must be in good to excellent structural condition with a roof no older than 15 years and electrical service of at least 200 amps. Total renovation budget must remain under $3.0M. A minimum setback of 200 ft (61 m) from public roads is required for privacy.\n\nThe property should be within 60 minutes of a regional airport (preferably 30 minutes) and within 120 minutes of an international airport (preferably 60 minutes). Access to a hospital or urgent care within 30 minutes is required.\n\nFrom a financial perspective, the acquisition price range is $2.0M to $8.0M, with a target sweet spot of $3.0M to $5.0M. Total investment including renovation and FF&E ranges from $3.0M to $12.0M. The target ADR is $200 to $500 per night, with stabilized occupancy of 55% to 75% after a 15-month ramp-up. The management fee structure includes a base fee of 8% to 10% of total revenue and an incentive fee of 10% to 15% of GOP. The investment targets a minimum IRR of 15%, an equity multiple of 2x to 3x, over a 7 to 10-year hold period, with an exit cap rate of 8% to 10%.\n\nKey exclusions: properties requiring more than $3m in structural renovation; urban high-rise or mid-rise buildings; properties in flood zones, wildfire extreme zones, or with unresolved environmental issues; locations more than 2 hours from a commercial airport; properties below 5 rooms or above 80 rooms.","bedroomsMax":26,"bedroomsMin":2,"horseStalls":4,"kitchenSqFt":900,"livingAreas":2,"spaShareMax":15,"spaShareMin":5,"_generatedAt":"2026-04-16T17:18:00.376Z","bathroomsMax":24,"bathroomsMin":2,"builtSqFtMax":25000,"builtSqFtMin":5000,"casitasCount":3,"hikingTrails":"nice","holdYearsMax":10,"holdYearsMin":7,"landAcresMax":50,"landAcresMin":2,"minSetbackFt":150,"occupancyMax":65,"occupancyMin":36,"pastureAcres":5,"tennisCourts":1,"ffePerRoomMax":30000,"ffePerRoomMin":12000,"maxAirportMin":120,"minDrivewayFt":300,"otherShareMax":10,"otherShareMin":3,"renovationMax":2200000,"renovationMin":50000,"_promptBuilder":{"context":{"location":true,"questions":true,"propertyProfile":true,"financialResults":false,"propertyDescription":true,"additionalInstructions":true},"questions":[{"id":"default-mkt","question":"What are the Industry Benchmark Ranges (min–max %) for Marketing fees charged by hotel management companies as a percentage of Total Revenue? The app default is 2.0% of Total Revenue for Marketing. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the fee is calculated within the USALI waterfall, identify factors that influence where a specific property falls within the range (property size, market tier, brand strength, service model), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).","sortOrder":0},{"id":"default-it","question":"What are the Industry Benchmark Ranges (min–max %) for IT fees charged by hotel management companies as a percentage of Total Revenue? The app default is 1.0% of Total Revenue for IT. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the fee is calculated within the USALI waterfall, identify factors that influence where a specific property falls within the range (property size, market tier, brand strength, service model), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).","sortOrder":1},{"id":"default-acct","question":"What are the Industry Benchmark Ranges (min–max %) for Accounting fees charged by hotel management companies as a percentage of Total Revenue? The app default is 1.5% of Total Revenue for Accounting. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the fee is calculated within the USALI waterfall, identify factors that influence where a specific property falls within the range (property size, market tier, brand strength, service model), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).","sortOrder":2},{"id":"default-res","question":"What are the Industry Benchmark Ranges (min–max %) for Reservations fees charged by hotel management companies as a percentage of Total Revenue? The app default is 2.0% of Total Revenue for Reservations. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the fee is calculated within the USALI waterfall, identify factors that influence where a specific property falls within the range (property size, market tier, brand strength, service model), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).","sortOrder":3},{"id":"default-gm","question":"What are the Industry Benchmark Ranges (min–max %) for General Management fees charged by hotel management companies as a percentage of Total Revenue? The app default is 2.0% of Total Revenue for General Management. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the fee is calculated within the USALI waterfall, identify factors that influence where a specific property falls within the range (property size, market tier, brand strength, service model), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).","sortOrder":4},{"id":"default-ins","question":"What are the Industry Benchmark Ranges (min–max %) for Insurance fees charged by hotel management companies as a percentage of Total Revenue? The app default is 1.0% of Total Revenue for Insurance. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the fee is calculated within the USALI waterfall, identify factors that influence where a specific property falls within the range (property size, market tier, brand strength, group purchasing leverage), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).","sortOrder":5},{"id":"default-propops","question":"What are the Industry Benchmark Ranges (min–max %) for Property Operations fees charged by hotel management companies as a percentage of Total Revenue? The app default is 1.0% of Total Revenue for Property Operations. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the fee is calculated within the USALI waterfall, identify factors that influence where a specific property falls within the range (property age, complexity, market tier, service model), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).","sortOrder":6},{"id":"default-other","question":"What are the Industry Benchmark Ranges (min–max %) for Other Services fees charged by hotel management companies as a percentage of Total Revenue? The app default is 1.0% of Total Revenue for Other Services. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the fee is calculated within the USALI waterfall, identify factors that influence where a specific property falls within the range (service scope, property needs, market tier), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).","sortOrder":7},{"id":"default-basefee","question":"What are the Industry Benchmark Ranges (min–max %) for the overall Base Management Fee charged by hotel management companies as a percentage of Total Revenue? The app default is 8.5% of Total Revenue. This fee represents the aggregate compensation for day-to-day hotel operations and is the sum of all service category fees. Please provide the benchmark range (low–high %), explain what revenue base this percentage is applied to, describe how the base management fee is calculated in the USALI waterfall, identify factors that influence where a specific property or management company falls within the range (property size, market tier, brand strength, full-service vs. limited-service, chain scale), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).","sortOrder":8},{"id":"default-incentive","question":"What are the Industry Benchmark Ranges (min–max %) for the Incentive Management Fee charged by hotel management companies as a percentage of Gross Operating Profit (GOP)? The app default is 12% of GOP. Please explain how GOP is calculated (Total Revenue minus Total Operating Expenses per USALI), describe the typical GOP hurdle or owner''s priority return that must be met before the incentive fee is triggered, provide the benchmark range (low–high %), identify factors that influence where a specific property or company falls within the range (property performance, owner negotiation leverage, management company track record, market conditions), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).","sortOrder":9},{"id":"default-markup","question":"What are the Industry Benchmark Ranges (min–max %) for the centralized service markup (cost-plus pass-through) applied by hotel management companies on services they procure on behalf of properties? The app default is a 20% markup. Please explain the cost-plus pass-through model (management company procures a service externally and passes the cost through to the property with a markup), provide the benchmark range (low–high %), identify factors that influence where a specific markup falls within the range (volume discounts, service type, management company scale, competitive landscape), and cite sources (HVS Fee Survey, CBRE, STR, JLL, AHLA).","sortOrder":10}],"additionalInstructions":""},"acquisitionMax":4400000,"acquisitionMin":200000,"baseMgmtFeeMax":10,"baseMgmtFeeMin":7,"eventsShareMax":39,"eventsShareMin":9,"exitCapRateMax":10,"exitCapRateMin":7,"indoorEventMax":100,"indoorEventMin":30,"maxHospitalMin":30,"outdoorKitchen":"major","prefAirportMin":45,"horseFacilities":"nice","incentiveFeeMax":14,"incentiveFeeMin":10,"maintenanceSqFt":600,"masterSuiteSqFt":350,"masterSuitesMin":1,"outdoorEventMax":150,"outdoorEventMin":50,"prefHospitalMin":15,"pickleballCourts":1,"staffQuartersMax":6,"staffQuartersMin":2,"diningCapacityMax":60,"diningCapacityMin":20,"equityMultipleMax":3,"equityMultipleMin":2,"maxIntlAirportMin":180,"minElectricalAmps":200,"roomsSweetSpotMax":23,"roomsSweetSpotMin":17,"spaTreatmentRooms":4,"staffHousingUnits":2,"totalAncillaryMax":85,"totalAncillaryMin":25,"_portfolioAnalysis":{"adr":{"max":350,"min":240,"mean":301,"median":320},"hasFB":true,"rooms":{"max":20,"min":4,"mean":18,"median":20},"acreage":null,"fbSeats":null,"regions":["Bolívar","Cartagena","Utah","Huntsville","New York","Highmount","Antioquia","Medellín","Loch Sheldrake","Eden"],"fbRating":1,"fbVenues":null,"countries":["Colombia","United States"],"hasEvents":true,"locations":[{"city":"Cartagena","state":"Bolívar","country":"Colombia"},{"city":"Huntsville","state":"Utah","country":"United States"},{"city":"Highmount","state":"New York","country":"United States"},{"city":"Medellín","state":"Antioquia","country":"Colombia"},{"city":"Loch Sheldrake","state":"New York","country":"United States"},{"city":"Eden","state":"Utah","country":"United States"},{"city":"Medellín","state":"Antioquia","country":"Colombia"}],"occupancy":{"max":0.62,"min":0.4,"mean":0,"median":0},"revShareFB":{"max":0.28,"min":0.12,"mean":0.22285714285714286},"buildingSqft":null,"maxOccupancy":{"max":0.82,"min":0.65,"mean":1,"median":1},"qualityTiers":{"upscale":7},"propertyCount":7,"purchasePrice":{"max":3800000,"min":800000,"mean":2500000,"median":3000000},"businessModels":{"hotel":7},"eventSpaceSqft":null,"revShareEvents":{"max":0.35,"min":0.1,"mean":0.27571428571428575},"isInternational":true,"dominantQualityTier":"upscale","dominantBusinessModel":"hotel"},"prefIntlAirportMin":90,"totalInvestmentMax":6600000,"totalInvestmentMin":250000,"maxRenovationBudget":2200000,"occupancyRampMonths":18,"acquisitionTargetMax":3600000,"acquisitionTargetMin":2400000}',
  '{"llmMode":"primary-only","llmVendor":"anthropic","marketLlm":{"llmMode":"dual","llmVendor":"google","primaryLlm":"gemini-2.5-flash","secondaryLlm":"gemini-2.0-flash","secondaryLlmVendor":"google"},"chatbotLlm":{"llmMode":"primary-only","llmVendor":"google","primaryLlm":"gemini-2.5-flash"},"companyLlm":{"llmMode":"primary-only","llmVendor":"google","primaryLlm":"gemini-3-flash-preview","secondaryLlm":""},"primaryLlm":"claude-sonnet-4-5","graphicsLlm":{"llmMode":"primary-only","llmVendor":"google","primaryLlm":"gemini-3.1-pro-preview"},"propertyLlm":{"llmMode":"dual","llmVendor":"google","primaryLlm":"gemini-2.5-flash","secondaryLlm":"gemini-2.0-flash","secondaryLlmVendor":"google"},"tabDefaults":{"exports":{"llmVendor":"google","primaryLlm":"gemini-3.1-pro-preview"},"research":{"llmVendor":"google","primaryLlm":"gemini-2.5-flash"},"assistants":{"llmVendor":"google","primaryLlm":"gemini-3-flash-preview"},"operations":{"llmVendor":"google","primaryLlm":"gemini-2.5-pro"}},"aiUtilityLlm":{"llmMode":"primary-only","llmVendor":"google","primaryLlm":"gemini-2.5-flash"},"cachedModels":[],"preferredLlm":"claude-sonnet-4-5","cachedModelsAt":"2026-05-04T08:05:33.470Z","premiumExportLlm":{"llmMode":"primary-only","llmVendor":"google","primaryLlm":"gemini-2.5-flash"}}'
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
  capital_raise_1_amount = EXCLUDED.capital_raise_1_amount, capital_raise_1_date = EXCLUDED.capital_raise_1_date,
  capital_raise_2_amount = EXCLUDED.capital_raise_2_amount, capital_raise_2_date = EXCLUDED.capital_raise_2_date,
  capital_raise_valuation_cap = EXCLUDED.capital_raise_valuation_cap,
  capital_raise_discount_rate = EXCLUDED.capital_raise_discount_rate,
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


-- ==============================================================================
-- CLEANUP: Remove non-canonical properties (FK order: dependents first)
-- ==============================================================================

DELETE FROM property_fee_categories WHERE property_id NOT IN (50, 51, 52, 53, 54, 55, 58, 63);
DELETE FROM market_research WHERE type = 'property' AND property_id NOT IN (50, 51, 52, 53, 54, 55, 58, 63);
DELETE FROM properties WHERE id NOT IN (50, 51, 52, 53, 54, 55, 58, 63);


-- ==============================================================================
-- PROPERTIES (8 canonical, sorted by acquisition_date)
-- ==============================================================================

-- 58. Medellin Duplex
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
  research_values, user_id, refinance_years_after_acquisition, description
) OVERRIDING SYSTEM VALUE VALUES
  (58, 'Medellin Duplex', 'El Poblado, Medellín, Antioquia, Colombia', 'Latin America', '/api/media/photo-23.png', 'Acquired', '2025-03-01', '2025-09-01', 800000, 150000, 15000, 60000, 1, 1200, 0.04, 0.3, 0.5, 4, 0.04, 12, 'Full Equity', NULL, NULL, NULL, NULL, 'No', NULL, NULL, NULL, NULL, NULL, 0.06, 0, 0, 0, 0.04, 0.04, 0.025, 0.018, 0, 0.03, 0, 0, 0, 0, 0, 0.095, 0.35, 0.25, 0.05, 0.1, 0, 'Cra. 34 #16a Sur-185', 'Medellín', 'Antioquia', '050021', 'Colombia', NULL, NULL, NULL, 'A stunning two-story luxury duplex apartment in El Poblado, Medellín''s most exclusive residential zone. Contemporary open-concept design with double-height ceilings, floating staircase, Calacatta marble kitchen island, and panoramic city and Andes mountain views from floor-to-ceiling windows across 350 square meters on two floors.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location, market = EXCLUDED.market,
  image_url = EXCLUDED.image_url, status = EXCLUDED.status,
  acquisition_date = EXCLUDED.acquisition_date, operations_start_date = EXCLUDED.operations_start_date,
  purchase_price = EXCLUDED.purchase_price, building_improvements = EXCLUDED.building_improvements,
  pre_opening_costs = EXCLUDED.pre_opening_costs, operating_reserve = EXCLUDED.operating_reserve,
  room_count = EXCLUDED.room_count, start_adr = EXCLUDED.start_adr,
  adr_growth_rate = EXCLUDED.adr_growth_rate, start_occupancy = EXCLUDED.start_occupancy,
  max_occupancy = EXCLUDED.max_occupancy, occupancy_ramp_months = EXCLUDED.occupancy_ramp_months,
  occupancy_growth_step = EXCLUDED.occupancy_growth_step, stabilization_months = EXCLUDED.stabilization_months,
  type = EXCLUDED.type, acquisition_ltv = EXCLUDED.acquisition_ltv,
  acquisition_interest_rate = EXCLUDED.acquisition_interest_rate,
  acquisition_term_years = EXCLUDED.acquisition_term_years,
  acquisition_closing_cost_rate = EXCLUDED.acquisition_closing_cost_rate,
  will_refinance = EXCLUDED.will_refinance, refinance_date = EXCLUDED.refinance_date,
  refinance_ltv = EXCLUDED.refinance_ltv, refinance_interest_rate = EXCLUDED.refinance_interest_rate,
  refinance_term_years = EXCLUDED.refinance_term_years,
  refinance_closing_cost_rate = EXCLUDED.refinance_closing_cost_rate,
  cost_rate_rooms = EXCLUDED.cost_rate_rooms, cost_rate_fb = EXCLUDED.cost_rate_fb,
  cost_rate_admin = EXCLUDED.cost_rate_admin, cost_rate_marketing = EXCLUDED.cost_rate_marketing,
  cost_rate_property_ops = EXCLUDED.cost_rate_property_ops,
  cost_rate_utilities = EXCLUDED.cost_rate_utilities, cost_rate_insurance = EXCLUDED.cost_rate_insurance,
  cost_rate_taxes = EXCLUDED.cost_rate_taxes, cost_rate_it = EXCLUDED.cost_rate_it,
  cost_rate_ffe = EXCLUDED.cost_rate_ffe, cost_rate_other = EXCLUDED.cost_rate_other,
  rev_share_events = EXCLUDED.rev_share_events, rev_share_fb = EXCLUDED.rev_share_fb,
  rev_share_other = EXCLUDED.rev_share_other,
  catering_boost_percent = EXCLUDED.catering_boost_percent, exit_cap_rate = EXCLUDED.exit_cap_rate,
  tax_rate = EXCLUDED.tax_rate, land_value_percent = EXCLUDED.land_value_percent,
  disposition_commission = EXCLUDED.disposition_commission,
  base_management_fee_rate = EXCLUDED.base_management_fee_rate,
  incentive_management_fee_rate = EXCLUDED.incentive_management_fee_rate,
  street_address = EXCLUDED.street_address, city = EXCLUDED.city,
  state_province = EXCLUDED.state_province, zip_postal_code = EXCLUDED.zip_postal_code,
  country = EXCLUDED.country, research_values = EXCLUDED.research_values,
  user_id = EXCLUDED.user_id,
  refinance_years_after_acquisition = EXCLUDED.refinance_years_after_acquisition,
  description = EXCLUDED.description;

-- 50. Jano Grande Ranch
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
  research_values, user_id, refinance_years_after_acquisition, description
) OVERRIDING SYSTEM VALUE VALUES
  (50, 'Jano Grande Ranch', 'Antioquia, Medellín', 'Latin America', '/api/media/photo-7.png', 'Planned', '2026-06-01', '2026-12-01', 1200000, 400000, 150000, 300000, 20, 250, 0.035, 0.4, 0.72, 9, 0.05, 36, 'Full Equity', NULL, NULL, NULL, NULL, 'Yes', '2029-12-01', 0.75, 0.09, 25, 0.03, 0.17, 0.1, 0.06, 0.015, 0.05, 0.04, 0.018, 0.016, 0.005, 0.04, 0.05, 0.3, 0.25, 0.08, 0.25, 0.1, 0.35, 0.35, 0.05, 0.085, 0.12, 'Vereda El Salado', 'Medellín', 'Antioquia', '050001', 'Colombia', '{"adr":{"mid":230,"source":"ai","display":"$220 - $240"},"costFB":{"mid":34,"source":"ai","display":"34%"},"costIT":{"mid":2.5,"source":"ai","display":"2.5%"},"costFFE":{"mid":4,"source":"ai","display":"4%"},"catering":{"mid":35,"source":"ai","display":"35%"},"svcFeeIT":{"mid":1.2,"source":"ai","display":"1.2%"},"costAdmin":{"mid":9,"source":"ai","display":"9%"},"costOther":{"mid":5,"source":"ai","display":"5%"},"incomeTax":{"mid":35,"source":"ai","display":"35%"},"landValue":{"mid":18,"source":"ai","display":"18%"},"incentiveFee":{"mid":15,"source":"ai","display":"15%"},"costInsurance":{"mid":0.22,"source":"ai","display":"0.22%"},"costMarketing":{"mid":5,"source":"ai","display":"5%"},"costUtilities":{"mid":6,"source":"ai","display":"6%"},"costPropertyOps":{"mid":4,"source":"ai","display":"4%"},"svcFeeMarketing":{"mid":1.8,"source":"ai","display":"1.8%"},"costHousekeeping":{"mid":38,"source":"ai","display":"38%"},"svcFeeAccounting":{"mid":1.5,"source":"ai","display":"1.5%"},"costPropertyTaxes":{"mid":0.85,"source":"ai","display":"0.85%"},"svcFeeGeneralMgmt":{"mid":2,"source":"ai","display":"2.0%"},"svcFeeReservations":{"mid":1,"source":"ai","display":"1.0%"}}', NULL, 3, 'A sprawling country estate in Antioquia''s prestigious Llanogrande corridor, just minutes from José María Córdova International Airport. Set amid lush green hillsides at a cool 2,100 meters elevation, the ranch blends traditional Colombian finca architecture with modern luxury — offering manicured gardens, outdoor terraces, and panoramic views of the Andes foothills. Ideally positioned for eco-tourism retreats, destination weddings, and upscale agritourism experiences in one of Medellín''s most exclusive rural enclaves.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location, market = EXCLUDED.market,
  image_url = EXCLUDED.image_url, status = EXCLUDED.status,
  acquisition_date = EXCLUDED.acquisition_date, operations_start_date = EXCLUDED.operations_start_date,
  purchase_price = EXCLUDED.purchase_price, building_improvements = EXCLUDED.building_improvements,
  pre_opening_costs = EXCLUDED.pre_opening_costs, operating_reserve = EXCLUDED.operating_reserve,
  room_count = EXCLUDED.room_count, start_adr = EXCLUDED.start_adr,
  adr_growth_rate = EXCLUDED.adr_growth_rate, start_occupancy = EXCLUDED.start_occupancy,
  max_occupancy = EXCLUDED.max_occupancy, occupancy_ramp_months = EXCLUDED.occupancy_ramp_months,
  occupancy_growth_step = EXCLUDED.occupancy_growth_step, stabilization_months = EXCLUDED.stabilization_months,
  type = EXCLUDED.type, acquisition_ltv = EXCLUDED.acquisition_ltv,
  acquisition_interest_rate = EXCLUDED.acquisition_interest_rate,
  acquisition_term_years = EXCLUDED.acquisition_term_years,
  acquisition_closing_cost_rate = EXCLUDED.acquisition_closing_cost_rate,
  will_refinance = EXCLUDED.will_refinance, refinance_date = EXCLUDED.refinance_date,
  refinance_ltv = EXCLUDED.refinance_ltv, refinance_interest_rate = EXCLUDED.refinance_interest_rate,
  refinance_term_years = EXCLUDED.refinance_term_years,
  refinance_closing_cost_rate = EXCLUDED.refinance_closing_cost_rate,
  cost_rate_rooms = EXCLUDED.cost_rate_rooms, cost_rate_fb = EXCLUDED.cost_rate_fb,
  cost_rate_admin = EXCLUDED.cost_rate_admin, cost_rate_marketing = EXCLUDED.cost_rate_marketing,
  cost_rate_property_ops = EXCLUDED.cost_rate_property_ops,
  cost_rate_utilities = EXCLUDED.cost_rate_utilities, cost_rate_insurance = EXCLUDED.cost_rate_insurance,
  cost_rate_taxes = EXCLUDED.cost_rate_taxes, cost_rate_it = EXCLUDED.cost_rate_it,
  cost_rate_ffe = EXCLUDED.cost_rate_ffe, cost_rate_other = EXCLUDED.cost_rate_other,
  rev_share_events = EXCLUDED.rev_share_events, rev_share_fb = EXCLUDED.rev_share_fb,
  rev_share_other = EXCLUDED.rev_share_other,
  catering_boost_percent = EXCLUDED.catering_boost_percent, exit_cap_rate = EXCLUDED.exit_cap_rate,
  tax_rate = EXCLUDED.tax_rate, land_value_percent = EXCLUDED.land_value_percent,
  disposition_commission = EXCLUDED.disposition_commission,
  base_management_fee_rate = EXCLUDED.base_management_fee_rate,
  incentive_management_fee_rate = EXCLUDED.incentive_management_fee_rate,
  street_address = EXCLUDED.street_address, city = EXCLUDED.city,
  state_province = EXCLUDED.state_province, zip_postal_code = EXCLUDED.zip_postal_code,
  country = EXCLUDED.country, research_values = EXCLUDED.research_values,
  user_id = EXCLUDED.user_id,
  refinance_years_after_acquisition = EXCLUDED.refinance_years_after_acquisition,
  description = EXCLUDED.description;

-- 51. Loch Sheldrake
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
  research_values, user_id, refinance_years_after_acquisition, description
) OVERRIDING SYSTEM VALUE VALUES
  (51, 'Loch Sheldrake', 'Sullivan County, New York', 'North America', '/api/media/photo-2.png', 'Planned', '2026-11-01', '2027-05-01', 3000000, 1000000, 150000, 400000, 20, 280, 0.035, 0.5, 0.68, 4, 0.05, 18, 'Full Equity', NULL, NULL, NULL, NULL, 'Yes', '2030-05-01', 0.75, 0.09, 25, 0.03, 0.19, 0.09, 0.07, 0.02, 0.055, 0.055, 0.028, 0.035, 0.005, 0.04, 0.04, 0.35, 0.25, 0.08, 0.22, 0.09, 0.25, 0.3, 0.05, 0.085, 0.12, '59 Hazelnis Drive', 'Loch Sheldrake', 'New York', '12759', 'United States', '{"adr":{"mid":310,"source":"seed","display":"$240–$380"},"costFB":{"mid":9,"source":"seed","display":"7%–12%"},"costIT":{"mid":1,"source":"seed","display":"0.5%–1.5%"},"capRate":{"mid":8.5,"source":"seed","display":"7.5%–9.5%"},"costFFE":{"mid":4,"source":"seed","display":"3%–5%"},"catering":{"mid":28,"source":"seed","display":"22%–35%"},"svcFeeIT":{"mid":0.5,"source":"seed","display":"0.3%–0.8%"},"costAdmin":{"mid":5.5,"source":"seed","display":"4%–7%"},"costOther":{"mid":5,"source":"seed","display":"3%–6%"},"incomeTax":{"mid":30,"source":"seed","display":"28%–33%"},"landValue":{"mid":30,"source":"seed","display":"25%–35%"},"occupancy":{"mid":68,"source":"seed","display":"60%–75%"},"rampMonths":{"mid":15,"source":"seed","display":"12–18 mo"},"incentiveFee":{"mid":10,"source":"seed","display":"8%–12%"},"costInsurance":{"mid":0.5,"source":"seed","display":"0.3%–0.7%"},"costMarketing":{"mid":2,"source":"seed","display":"1%–3%"},"costUtilities":{"mid":4.5,"source":"seed","display":"3.5%–5.5%"},"startOccupancy":{"mid":45,"source":"seed","display":"35%–50%"},"costPropertyOps":{"mid":4,"source":"seed","display":"3%–5%"},"svcFeeMarketing":{"mid":1,"source":"seed","display":"0.5%–1.5%"},"costHousekeeping":{"mid":18,"source":"seed","display":"14%–22%"},"svcFeeAccounting":{"mid":1,"source":"seed","display":"0.5%–1.5%"},"costPropertyTaxes":{"mid":2.2,"source":"seed","display":"1.8%–2.8%"},"svcFeeGeneralMgmt":{"mid":1,"source":"seed","display":"0.7%–1.2%"},"svcFeeReservations":{"mid":1.5,"source":"seed","display":"1%–2%"}}', NULL, 3, 'A 10-acre lakeside estate featuring an iconic octagonal main house, three private bodies of water, a private island with gazebo, and income-generating apartment. Set in Sullivan County''s Catskill region with event venue potential for weddings, retreats, and luxury Airbnb experiences.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location, market = EXCLUDED.market,
  image_url = EXCLUDED.image_url, status = EXCLUDED.status,
  acquisition_date = EXCLUDED.acquisition_date, operations_start_date = EXCLUDED.operations_start_date,
  purchase_price = EXCLUDED.purchase_price, building_improvements = EXCLUDED.building_improvements,
  pre_opening_costs = EXCLUDED.pre_opening_costs, operating_reserve = EXCLUDED.operating_reserve,
  room_count = EXCLUDED.room_count, start_adr = EXCLUDED.start_adr,
  adr_growth_rate = EXCLUDED.adr_growth_rate, start_occupancy = EXCLUDED.start_occupancy,
  max_occupancy = EXCLUDED.max_occupancy, occupancy_ramp_months = EXCLUDED.occupancy_ramp_months,
  occupancy_growth_step = EXCLUDED.occupancy_growth_step, stabilization_months = EXCLUDED.stabilization_months,
  type = EXCLUDED.type, acquisition_ltv = EXCLUDED.acquisition_ltv,
  acquisition_interest_rate = EXCLUDED.acquisition_interest_rate,
  acquisition_term_years = EXCLUDED.acquisition_term_years,
  acquisition_closing_cost_rate = EXCLUDED.acquisition_closing_cost_rate,
  will_refinance = EXCLUDED.will_refinance, refinance_date = EXCLUDED.refinance_date,
  refinance_ltv = EXCLUDED.refinance_ltv, refinance_interest_rate = EXCLUDED.refinance_interest_rate,
  refinance_term_years = EXCLUDED.refinance_term_years,
  refinance_closing_cost_rate = EXCLUDED.refinance_closing_cost_rate,
  cost_rate_rooms = EXCLUDED.cost_rate_rooms, cost_rate_fb = EXCLUDED.cost_rate_fb,
  cost_rate_admin = EXCLUDED.cost_rate_admin, cost_rate_marketing = EXCLUDED.cost_rate_marketing,
  cost_rate_property_ops = EXCLUDED.cost_rate_property_ops,
  cost_rate_utilities = EXCLUDED.cost_rate_utilities, cost_rate_insurance = EXCLUDED.cost_rate_insurance,
  cost_rate_taxes = EXCLUDED.cost_rate_taxes, cost_rate_it = EXCLUDED.cost_rate_it,
  cost_rate_ffe = EXCLUDED.cost_rate_ffe, cost_rate_other = EXCLUDED.cost_rate_other,
  rev_share_events = EXCLUDED.rev_share_events, rev_share_fb = EXCLUDED.rev_share_fb,
  rev_share_other = EXCLUDED.rev_share_other,
  catering_boost_percent = EXCLUDED.catering_boost_percent, exit_cap_rate = EXCLUDED.exit_cap_rate,
  tax_rate = EXCLUDED.tax_rate, land_value_percent = EXCLUDED.land_value_percent,
  disposition_commission = EXCLUDED.disposition_commission,
  base_management_fee_rate = EXCLUDED.base_management_fee_rate,
  incentive_management_fee_rate = EXCLUDED.incentive_management_fee_rate,
  street_address = EXCLUDED.street_address, city = EXCLUDED.city,
  state_province = EXCLUDED.state_province, zip_postal_code = EXCLUDED.zip_postal_code,
  country = EXCLUDED.country, research_values = EXCLUDED.research_values,
  user_id = EXCLUDED.user_id,
  refinance_years_after_acquisition = EXCLUDED.refinance_years_after_acquisition,
  description = EXCLUDED.description;

-- 63. E2E Photo Test Property
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
  research_values, user_id, refinance_years_after_acquisition, description
) OVERRIDING SYSTEM VALUE VALUES
  (63, 'E2E Photo Test Property', 'Test Location', 'North America', 'https://placehold.co/300', 'Planned', '2027-01-01', '2027-06-01', 1000000, 100000, 50000, 50000, 5, 200, 0.03, 0.5, 0.7, 6, 0.05, 36, 'Hotel', 0.75, 0.09, 25, 0.02, NULL, NULL, 0.75, 0.09, 25, 0.03, 0.2, 0.09, 0.08, 0.04, 0.04, 0.05, 0.015, 0.012, 0.005, 0.04, 0.05, 0.18, 0.3, 0.03, 0, 0.062, 0.25, 0.25, 0.05, 0.085, 0.12, '123 Test St', 'Test City', 'TX', '00000', 'United States', '{}', NULL, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location, market = EXCLUDED.market,
  image_url = EXCLUDED.image_url, status = EXCLUDED.status,
  acquisition_date = EXCLUDED.acquisition_date, operations_start_date = EXCLUDED.operations_start_date,
  purchase_price = EXCLUDED.purchase_price, building_improvements = EXCLUDED.building_improvements,
  pre_opening_costs = EXCLUDED.pre_opening_costs, operating_reserve = EXCLUDED.operating_reserve,
  room_count = EXCLUDED.room_count, start_adr = EXCLUDED.start_adr,
  adr_growth_rate = EXCLUDED.adr_growth_rate, start_occupancy = EXCLUDED.start_occupancy,
  max_occupancy = EXCLUDED.max_occupancy, occupancy_ramp_months = EXCLUDED.occupancy_ramp_months,
  occupancy_growth_step = EXCLUDED.occupancy_growth_step, stabilization_months = EXCLUDED.stabilization_months,
  type = EXCLUDED.type, acquisition_ltv = EXCLUDED.acquisition_ltv,
  acquisition_interest_rate = EXCLUDED.acquisition_interest_rate,
  acquisition_term_years = EXCLUDED.acquisition_term_years,
  acquisition_closing_cost_rate = EXCLUDED.acquisition_closing_cost_rate,
  will_refinance = EXCLUDED.will_refinance, refinance_date = EXCLUDED.refinance_date,
  refinance_ltv = EXCLUDED.refinance_ltv, refinance_interest_rate = EXCLUDED.refinance_interest_rate,
  refinance_term_years = EXCLUDED.refinance_term_years,
  refinance_closing_cost_rate = EXCLUDED.refinance_closing_cost_rate,
  cost_rate_rooms = EXCLUDED.cost_rate_rooms, cost_rate_fb = EXCLUDED.cost_rate_fb,
  cost_rate_admin = EXCLUDED.cost_rate_admin, cost_rate_marketing = EXCLUDED.cost_rate_marketing,
  cost_rate_property_ops = EXCLUDED.cost_rate_property_ops,
  cost_rate_utilities = EXCLUDED.cost_rate_utilities, cost_rate_insurance = EXCLUDED.cost_rate_insurance,
  cost_rate_taxes = EXCLUDED.cost_rate_taxes, cost_rate_it = EXCLUDED.cost_rate_it,
  cost_rate_ffe = EXCLUDED.cost_rate_ffe, cost_rate_other = EXCLUDED.cost_rate_other,
  rev_share_events = EXCLUDED.rev_share_events, rev_share_fb = EXCLUDED.rev_share_fb,
  rev_share_other = EXCLUDED.rev_share_other,
  catering_boost_percent = EXCLUDED.catering_boost_percent, exit_cap_rate = EXCLUDED.exit_cap_rate,
  tax_rate = EXCLUDED.tax_rate, land_value_percent = EXCLUDED.land_value_percent,
  disposition_commission = EXCLUDED.disposition_commission,
  base_management_fee_rate = EXCLUDED.base_management_fee_rate,
  incentive_management_fee_rate = EXCLUDED.incentive_management_fee_rate,
  street_address = EXCLUDED.street_address, city = EXCLUDED.city,
  state_province = EXCLUDED.state_province, zip_postal_code = EXCLUDED.zip_postal_code,
  country = EXCLUDED.country, research_values = EXCLUDED.research_values,
  user_id = EXCLUDED.user_id,
  refinance_years_after_acquisition = EXCLUDED.refinance_years_after_acquisition,
  description = EXCLUDED.description;

-- 52. Belleayre Mountain
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
  research_values, user_id, refinance_years_after_acquisition, description
) OVERRIDING SYSTEM VALUE VALUES
  (52, 'Belleayre Mountain', 'Western Catskills, New York', 'North America', '/api/media/photo-27.png', 'Planned', '2027-03-01', '2027-09-01', 3500000, 800000, 250000, 500000, 20, 320, 0.035, 0.4, 0.68, 12, 0.05, 36, 'Full Equity', NULL, NULL, NULL, NULL, 'Yes', '2030-09-01', 0.75, 0.09, 25, 0.03, 0.2, 0.09, 0.08, 0.02, 0.06, 0.055, 0.03, 0.035, 0.005, 0.04, 0.04, 0.3, 0.28, 0.07, 0.2, 0.085, 0.25, 0.4, 0.05, 0.085, 0.12, 'Upper Delaware River Valley', 'Highmount', 'New York', '12441', 'United States', '{"adr":{"mid":350,"source":"seed","display":"$280–$450"},"costFB":{"mid":9,"source":"seed","display":"7%–12%"},"costIT":{"mid":1,"source":"seed","display":"0.5%–1.5%"},"capRate":{"mid":7.5,"source":"seed","display":"6.5%–8.5%"},"costFFE":{"mid":4,"source":"seed","display":"3%–5%"},"catering":{"mid":30,"source":"seed","display":"25%–35%"},"svcFeeIT":{"mid":0.5,"source":"seed","display":"0.3%–0.8%"},"costAdmin":{"mid":5,"source":"seed","display":"4%–7%"},"costOther":{"mid":5,"source":"seed","display":"3%–6%"},"incomeTax":{"mid":31,"source":"seed","display":"29%–34%"},"landValue":{"mid":40,"source":"seed","display":"30%–50%"},"occupancy":{"mid":76,"source":"seed","display":"70%–82%"},"rampMonths":{"mid":18,"source":"seed","display":"12–24 mo"},"incentiveFee":{"mid":10,"source":"seed","display":"8%–12%"},"costInsurance":{"mid":0.6,"source":"seed","display":"0.4%–0.8%"},"costMarketing":{"mid":2,"source":"seed","display":"1%–3%"},"costUtilities":{"mid":4.2,"source":"seed","display":"3.5%–5%"},"startOccupancy":{"mid":40,"source":"seed","display":"30%–45%"},"costPropertyOps":{"mid":4,"source":"seed","display":"3%–5%"},"svcFeeMarketing":{"mid":1,"source":"seed","display":"0.5%–1.5%"},"costHousekeeping":{"mid":20,"source":"seed","display":"15%–22%"},"svcFeeAccounting":{"mid":1,"source":"seed","display":"0.5%–1.5%"},"costPropertyTaxes":{"mid":2.5,"source":"seed","display":"1.8%–3.5%"},"svcFeeGeneralMgmt":{"mid":1,"source":"seed","display":"0.7%–1.2%"},"svcFeeReservations":{"mid":1.5,"source":"seed","display":"1%–2%"}}', NULL, 3, 'A mountain lodge retreat in the heart of the Western Catskills, nestled between the charming hamlets of Pine Hill and Highmount at the base of Belleayre Mountain Ski Center. The property offers year-round appeal — world-class skiing and snowboarding in winter, with hiking, mountain biking, and fishing along the Esopus Creek in summer. Surrounded by 300,000 acres of Catskill Forest Preserve, the location draws a sophisticated NYC weekend crowd seeking authentic mountain hospitality just two hours from Manhattan.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location, market = EXCLUDED.market,
  image_url = EXCLUDED.image_url, status = EXCLUDED.status,
  acquisition_date = EXCLUDED.acquisition_date, operations_start_date = EXCLUDED.operations_start_date,
  purchase_price = EXCLUDED.purchase_price, building_improvements = EXCLUDED.building_improvements,
  pre_opening_costs = EXCLUDED.pre_opening_costs, operating_reserve = EXCLUDED.operating_reserve,
  room_count = EXCLUDED.room_count, start_adr = EXCLUDED.start_adr,
  adr_growth_rate = EXCLUDED.adr_growth_rate, start_occupancy = EXCLUDED.start_occupancy,
  max_occupancy = EXCLUDED.max_occupancy, occupancy_ramp_months = EXCLUDED.occupancy_ramp_months,
  occupancy_growth_step = EXCLUDED.occupancy_growth_step, stabilization_months = EXCLUDED.stabilization_months,
  type = EXCLUDED.type, acquisition_ltv = EXCLUDED.acquisition_ltv,
  acquisition_interest_rate = EXCLUDED.acquisition_interest_rate,
  acquisition_term_years = EXCLUDED.acquisition_term_years,
  acquisition_closing_cost_rate = EXCLUDED.acquisition_closing_cost_rate,
  will_refinance = EXCLUDED.will_refinance, refinance_date = EXCLUDED.refinance_date,
  refinance_ltv = EXCLUDED.refinance_ltv, refinance_interest_rate = EXCLUDED.refinance_interest_rate,
  refinance_term_years = EXCLUDED.refinance_term_years,
  refinance_closing_cost_rate = EXCLUDED.refinance_closing_cost_rate,
  cost_rate_rooms = EXCLUDED.cost_rate_rooms, cost_rate_fb = EXCLUDED.cost_rate_fb,
  cost_rate_admin = EXCLUDED.cost_rate_admin, cost_rate_marketing = EXCLUDED.cost_rate_marketing,
  cost_rate_property_ops = EXCLUDED.cost_rate_property_ops,
  cost_rate_utilities = EXCLUDED.cost_rate_utilities, cost_rate_insurance = EXCLUDED.cost_rate_insurance,
  cost_rate_taxes = EXCLUDED.cost_rate_taxes, cost_rate_it = EXCLUDED.cost_rate_it,
  cost_rate_ffe = EXCLUDED.cost_rate_ffe, cost_rate_other = EXCLUDED.cost_rate_other,
  rev_share_events = EXCLUDED.rev_share_events, rev_share_fb = EXCLUDED.rev_share_fb,
  rev_share_other = EXCLUDED.rev_share_other,
  catering_boost_percent = EXCLUDED.catering_boost_percent, exit_cap_rate = EXCLUDED.exit_cap_rate,
  tax_rate = EXCLUDED.tax_rate, land_value_percent = EXCLUDED.land_value_percent,
  disposition_commission = EXCLUDED.disposition_commission,
  base_management_fee_rate = EXCLUDED.base_management_fee_rate,
  incentive_management_fee_rate = EXCLUDED.incentive_management_fee_rate,
  street_address = EXCLUDED.street_address, city = EXCLUDED.city,
  state_province = EXCLUDED.state_province, zip_postal_code = EXCLUDED.zip_postal_code,
  country = EXCLUDED.country, research_values = EXCLUDED.research_values,
  user_id = EXCLUDED.user_id,
  refinance_years_after_acquisition = EXCLUDED.refinance_years_after_acquisition,
  description = EXCLUDED.description;

-- 53. Scott's House
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
  research_values, user_id, refinance_years_after_acquisition, description
) OVERRIDING SYSTEM VALUE VALUES
  (53, 'Scott''s House', 'Ogden Valley, Utah', 'North America', '/api/media/photo-4.png', 'Planned', '2027-08-01', '2028-02-01', 3200000, 800000, 200000, 400000, 20, 350, 0.03, 0.45, 0.65, 6, 0.05, 24, 'Financed', 0.6, 0.07, 25, 0.025, NULL, NULL, NULL, NULL, NULL, NULL, 0.2, 0.08, 0.07, 0.02, 0.05, 0.05, 0.025, 0.02, 0.005, 0.04, 0.04, 0.3, 0.2, 0.08, 0.2, 0.085, 0.22, 0.3, 0.05, 0.085, 0.12, 'Eden', 'Eden', 'Utah', '84310', 'United States', '{"adr":{"mid":380,"source":"seed","display":"$300–$475"},"costFB":{"mid":8,"source":"seed","display":"6%–10%"},"costIT":{"mid":1,"source":"seed","display":"0.5%–1.5%"},"capRate":{"mid":8,"source":"seed","display":"7%–9%"},"costFFE":{"mid":4,"source":"seed","display":"3%–5%"},"catering":{"mid":32,"source":"seed","display":"25%–40%"},"svcFeeIT":{"mid":0.5,"source":"seed","display":"0.3%–0.8%"},"costAdmin":{"mid":5,"source":"seed","display":"4%–7%"},"costOther":{"mid":5,"source":"seed","display":"3%–6%"},"incomeTax":{"mid":25,"source":"seed","display":"24%–26%"},"landValue":{"mid":30,"source":"seed","display":"25%–35%"},"occupancy":{"mid":65,"source":"seed","display":"58%–72%"},"rampMonths":{"mid":14,"source":"seed","display":"10–18 mo"},"incentiveFee":{"mid":10,"source":"seed","display":"8%–12%"},"costInsurance":{"mid":0.4,"source":"seed","display":"0.3%–0.6%"},"costMarketing":{"mid":2,"source":"seed","display":"1%–3%"},"costUtilities":{"mid":4.5,"source":"seed","display":"3.5%–5.5%"},"startOccupancy":{"mid":42,"source":"seed","display":"35%–50%"},"costPropertyOps":{"mid":4,"source":"seed","display":"3%–5%"},"svcFeeMarketing":{"mid":1,"source":"seed","display":"0.5%–1.5%"},"costHousekeeping":{"mid":19,"source":"seed","display":"15%–22%"},"svcFeeAccounting":{"mid":1,"source":"seed","display":"0.5%–1.5%"},"costPropertyTaxes":{"mid":0.9,"source":"seed","display":"0.7%–1.2%"},"svcFeeGeneralMgmt":{"mid":1,"source":"seed","display":"0.7%–1.2%"},"svcFeeReservations":{"mid":1.5,"source":"seed","display":"1%–2%"}}', NULL, NULL, 'A modern mountain retreat in Utah''s scenic Ogden Valley, positioned between the resort towns of Eden and Huntsville with easy access to Snowbasin and Powder Mountain ski resorts. The property offers sweeping views of the Wasatch Range and sits minutes from Pineview Reservoir, providing year-round recreational appeal — powder skiing in winter and watersports, hiking, and mountain biking through summer. Ogden Valley''s growing reputation as Utah''s next premier mountain destination, combined with its proximity to Salt Lake City, makes this an ideal short-term rental investment.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location, market = EXCLUDED.market,
  image_url = EXCLUDED.image_url, status = EXCLUDED.status,
  acquisition_date = EXCLUDED.acquisition_date, operations_start_date = EXCLUDED.operations_start_date,
  purchase_price = EXCLUDED.purchase_price, building_improvements = EXCLUDED.building_improvements,
  pre_opening_costs = EXCLUDED.pre_opening_costs, operating_reserve = EXCLUDED.operating_reserve,
  room_count = EXCLUDED.room_count, start_adr = EXCLUDED.start_adr,
  adr_growth_rate = EXCLUDED.adr_growth_rate, start_occupancy = EXCLUDED.start_occupancy,
  max_occupancy = EXCLUDED.max_occupancy, occupancy_ramp_months = EXCLUDED.occupancy_ramp_months,
  occupancy_growth_step = EXCLUDED.occupancy_growth_step, stabilization_months = EXCLUDED.stabilization_months,
  type = EXCLUDED.type, acquisition_ltv = EXCLUDED.acquisition_ltv,
  acquisition_interest_rate = EXCLUDED.acquisition_interest_rate,
  acquisition_term_years = EXCLUDED.acquisition_term_years,
  acquisition_closing_cost_rate = EXCLUDED.acquisition_closing_cost_rate,
  will_refinance = EXCLUDED.will_refinance, refinance_date = EXCLUDED.refinance_date,
  refinance_ltv = EXCLUDED.refinance_ltv, refinance_interest_rate = EXCLUDED.refinance_interest_rate,
  refinance_term_years = EXCLUDED.refinance_term_years,
  refinance_closing_cost_rate = EXCLUDED.refinance_closing_cost_rate,
  cost_rate_rooms = EXCLUDED.cost_rate_rooms, cost_rate_fb = EXCLUDED.cost_rate_fb,
  cost_rate_admin = EXCLUDED.cost_rate_admin, cost_rate_marketing = EXCLUDED.cost_rate_marketing,
  cost_rate_property_ops = EXCLUDED.cost_rate_property_ops,
  cost_rate_utilities = EXCLUDED.cost_rate_utilities, cost_rate_insurance = EXCLUDED.cost_rate_insurance,
  cost_rate_taxes = EXCLUDED.cost_rate_taxes, cost_rate_it = EXCLUDED.cost_rate_it,
  cost_rate_ffe = EXCLUDED.cost_rate_ffe, cost_rate_other = EXCLUDED.cost_rate_other,
  rev_share_events = EXCLUDED.rev_share_events, rev_share_fb = EXCLUDED.rev_share_fb,
  rev_share_other = EXCLUDED.rev_share_other,
  catering_boost_percent = EXCLUDED.catering_boost_percent, exit_cap_rate = EXCLUDED.exit_cap_rate,
  tax_rate = EXCLUDED.tax_rate, land_value_percent = EXCLUDED.land_value_percent,
  disposition_commission = EXCLUDED.disposition_commission,
  base_management_fee_rate = EXCLUDED.base_management_fee_rate,
  incentive_management_fee_rate = EXCLUDED.incentive_management_fee_rate,
  street_address = EXCLUDED.street_address, city = EXCLUDED.city,
  state_province = EXCLUDED.state_province, zip_postal_code = EXCLUDED.zip_postal_code,
  country = EXCLUDED.country, research_values = EXCLUDED.research_values,
  user_id = EXCLUDED.user_id,
  refinance_years_after_acquisition = EXCLUDED.refinance_years_after_acquisition,
  description = EXCLUDED.description;

-- 54. Lakeview Haven Lodge
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
  research_values, user_id, refinance_years_after_acquisition, description
) OVERRIDING SYSTEM VALUE VALUES
  (54, 'Lakeview Haven Lodge', 'Ogden Valley, Utah', 'North America', '/api/media/photo-5.png', 'Planned', '2027-12-01', '2028-06-01', 3800000, 1500000, 250000, 500000, 14, 450, 0.03, 0.5, 0.7, 3, 0.05, 18, 'Financed', 0.65, 0.07, 25, 0.025, NULL, NULL, NULL, NULL, NULL, NULL, 0.2, 0.09, 0.07, 0.02, 0.055, 0.05, 0.025, 0.02, 0.005, 0.04, 0.04, 0.15, 0.25, 0.05, 0.15, 0.08, 0.22, 0.35, 0.05, 0.085, 0.12, 'Pineview Reservoir', 'Huntsville', 'Utah', '84317', 'United States', '{"adr":{"mid":370,"source":"seed","display":"$280–$475"},"costFB":{"mid":9,"source":"seed","display":"7%–12%"},"costIT":{"mid":1,"source":"seed","display":"0.5%–1.5%"},"capRate":{"mid":8.5,"source":"seed","display":"8%–9.5%"},"costFFE":{"mid":4,"source":"seed","display":"3%–5%"},"catering":{"mid":36,"source":"seed","display":"30%–42%"},"svcFeeIT":{"mid":0.5,"source":"seed","display":"0.3%–0.8%"},"costAdmin":{"mid":5,"source":"seed","display":"4%–7%"},"costOther":{"mid":5,"source":"seed","display":"3%–6%"},"incomeTax":{"mid":25,"source":"seed","display":"24%–26%"},"landValue":{"mid":20,"source":"seed","display":"15%–25%"},"occupancy":{"mid":62,"source":"seed","display":"55%–70%"},"rampMonths":{"mid":18,"source":"seed","display":"12–24 mo"},"incentiveFee":{"mid":10,"source":"seed","display":"8%–12%"},"costInsurance":{"mid":0.4,"source":"seed","display":"0.3%–0.5%"},"costMarketing":{"mid":2,"source":"seed","display":"1%–3%"},"costUtilities":{"mid":4.2,"source":"seed","display":"3.5%–5%"},"startOccupancy":{"mid":40,"source":"seed","display":"30%–45%"},"costPropertyOps":{"mid":4,"source":"seed","display":"3%–5%"},"svcFeeMarketing":{"mid":1,"source":"seed","display":"0.5%–1.5%"},"costHousekeeping":{"mid":20,"source":"seed","display":"15%–22%"},"svcFeeAccounting":{"mid":1,"source":"seed","display":"0.5%–1.5%"},"costPropertyTaxes":{"mid":0.8,"source":"seed","display":"0.6%–1.2%"},"svcFeeGeneralMgmt":{"mid":1,"source":"seed","display":"0.7%–1.2%"},"svcFeeReservations":{"mid":1.5,"source":"seed","display":"1%–2%"}}', NULL, NULL, 'A premier all-season cabin nestled in Ogden Valley between Eden and Huntsville, with unobstructed views of Pineview Reservoir, the Wasatch Mountains, and surrounding forests. The lodge offers direct access to world-class skiing at Powder Mountain and Snowbasin — both future venues for the 2034 Winter Olympics — along with summer watersports, hiking, and mountain biking. The calm, wind-sheltered waters of Pineview Reservoir and the valley''s rapidly appreciating real estate market position this property at the intersection of outdoor lifestyle and strong rental yield.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location, market = EXCLUDED.market,
  image_url = EXCLUDED.image_url, status = EXCLUDED.status,
  acquisition_date = EXCLUDED.acquisition_date, operations_start_date = EXCLUDED.operations_start_date,
  purchase_price = EXCLUDED.purchase_price, building_improvements = EXCLUDED.building_improvements,
  pre_opening_costs = EXCLUDED.pre_opening_costs, operating_reserve = EXCLUDED.operating_reserve,
  room_count = EXCLUDED.room_count, start_adr = EXCLUDED.start_adr,
  adr_growth_rate = EXCLUDED.adr_growth_rate, start_occupancy = EXCLUDED.start_occupancy,
  max_occupancy = EXCLUDED.max_occupancy, occupancy_ramp_months = EXCLUDED.occupancy_ramp_months,
  occupancy_growth_step = EXCLUDED.occupancy_growth_step, stabilization_months = EXCLUDED.stabilization_months,
  type = EXCLUDED.type, acquisition_ltv = EXCLUDED.acquisition_ltv,
  acquisition_interest_rate = EXCLUDED.acquisition_interest_rate,
  acquisition_term_years = EXCLUDED.acquisition_term_years,
  acquisition_closing_cost_rate = EXCLUDED.acquisition_closing_cost_rate,
  will_refinance = EXCLUDED.will_refinance, refinance_date = EXCLUDED.refinance_date,
  refinance_ltv = EXCLUDED.refinance_ltv, refinance_interest_rate = EXCLUDED.refinance_interest_rate,
  refinance_term_years = EXCLUDED.refinance_term_years,
  refinance_closing_cost_rate = EXCLUDED.refinance_closing_cost_rate,
  cost_rate_rooms = EXCLUDED.cost_rate_rooms, cost_rate_fb = EXCLUDED.cost_rate_fb,
  cost_rate_admin = EXCLUDED.cost_rate_admin, cost_rate_marketing = EXCLUDED.cost_rate_marketing,
  cost_rate_property_ops = EXCLUDED.cost_rate_property_ops,
  cost_rate_utilities = EXCLUDED.cost_rate_utilities, cost_rate_insurance = EXCLUDED.cost_rate_insurance,
  cost_rate_taxes = EXCLUDED.cost_rate_taxes, cost_rate_it = EXCLUDED.cost_rate_it,
  cost_rate_ffe = EXCLUDED.cost_rate_ffe, cost_rate_other = EXCLUDED.cost_rate_other,
  rev_share_events = EXCLUDED.rev_share_events, rev_share_fb = EXCLUDED.rev_share_fb,
  rev_share_other = EXCLUDED.rev_share_other,
  catering_boost_percent = EXCLUDED.catering_boost_percent, exit_cap_rate = EXCLUDED.exit_cap_rate,
  tax_rate = EXCLUDED.tax_rate, land_value_percent = EXCLUDED.land_value_percent,
  disposition_commission = EXCLUDED.disposition_commission,
  base_management_fee_rate = EXCLUDED.base_management_fee_rate,
  incentive_management_fee_rate = EXCLUDED.incentive_management_fee_rate,
  street_address = EXCLUDED.street_address, city = EXCLUDED.city,
  state_province = EXCLUDED.state_province, zip_postal_code = EXCLUDED.zip_postal_code,
  country = EXCLUDED.country, research_values = EXCLUDED.research_values,
  user_id = EXCLUDED.user_id,
  refinance_years_after_acquisition = EXCLUDED.refinance_years_after_acquisition,
  description = EXCLUDED.description;

-- 55. San Diego
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
  research_values, user_id, refinance_years_after_acquisition, description
) OVERRIDING SYSTEM VALUE VALUES
  (55, 'San Diego', 'Cartagena, Colombia', 'Latin America', '/api/media/photo-6.png', 'Planned', '2028-04-01', '2028-10-01', 2000000, 1000000, 250000, 500000, 20, 240, 0.035, 0.42, 0.72, 10, 0.05, 36, 'Financed', 0.6, 0.095, 25, 0.02, NULL, NULL, NULL, NULL, NULL, NULL, 0.17, 0.09, 0.07, 0.015, 0.035, 0.04, 0.025, 0.025, 0.005, 0.04, 0.04, 0.3, 0.24, 0.06, 0.2, 0.09, 0.35, 0.3, 0.05, 0.085, 0.12, 'Cochera del Hobo, Barrio San Diego', 'Cartagena', 'Bolívar', '130001', 'Colombia', '{"adr":{"mid":220,"source":"seed","display":"$160–$280"},"costFB":{"mid":9,"source":"seed","display":"7%–12%"},"costIT":{"mid":0.8,"source":"seed","display":"0.5%–1.2%"},"capRate":{"mid":9.5,"source":"seed","display":"8.5%–11%"},"costFFE":{"mid":4,"source":"seed","display":"3%–5%"},"catering":{"mid":28,"source":"seed","display":"22%–35%"},"svcFeeIT":{"mid":0.5,"source":"seed","display":"0.3%–0.8%"},"costAdmin":{"mid":5,"source":"seed","display":"3%–6%"},"costOther":{"mid":4,"source":"seed","display":"3%–5%"},"incomeTax":{"mid":35,"source":"seed","display":"33%–38%"},"landValue":{"mid":30,"source":"seed","display":"25%–35%"},"occupancy":{"mid":70,"source":"seed","display":"62%–78%"},"rampMonths":{"mid":18,"source":"seed","display":"14–24 mo"},"incentiveFee":{"mid":10,"source":"seed","display":"8%–12%"},"costInsurance":{"mid":0.4,"source":"seed","display":"0.3%–0.6%"},"costMarketing":{"mid":2,"source":"seed","display":"1%–3%"},"costUtilities":{"mid":3,"source":"seed","display":"2%–4%"},"startOccupancy":{"mid":38,"source":"seed","display":"30%–45%"},"costPropertyOps":{"mid":3.5,"source":"seed","display":"2.5%–4.5%"},"svcFeeMarketing":{"mid":1,"source":"seed","display":"0.5%–1.5%"},"costHousekeeping":{"mid":15,"source":"seed","display":"11%–18%"},"svcFeeAccounting":{"mid":1,"source":"seed","display":"0.5%–1.5%"},"costPropertyTaxes":{"mid":1.5,"source":"seed","display":"1%–2%"},"svcFeeGeneralMgmt":{"mid":1,"source":"seed","display":"0.7%–1.2%"},"svcFeeReservations":{"mid":1.5,"source":"seed","display":"1%–2%"}}', NULL, NULL, 'A boutique hospitality property in Cartagena''s historic San Diego quarter, one of the most sought-after neighborhoods within the UNESCO World Heritage walled city. Cobblestone streets, colonial-era architecture, and vibrant plazas define the surrounding streetscape, while rooftop terraces offer views across the Caribbean Sea and the iconic domes of the Old City. San Diego''s position between the bustling Centro Histórico and the upscale Getsemaní arts district draws a steady flow of international travelers seeking authentic Colombian culture, fine dining, and walkable urban charm.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location, market = EXCLUDED.market,
  image_url = EXCLUDED.image_url, status = EXCLUDED.status,
  acquisition_date = EXCLUDED.acquisition_date, operations_start_date = EXCLUDED.operations_start_date,
  purchase_price = EXCLUDED.purchase_price, building_improvements = EXCLUDED.building_improvements,
  pre_opening_costs = EXCLUDED.pre_opening_costs, operating_reserve = EXCLUDED.operating_reserve,
  room_count = EXCLUDED.room_count, start_adr = EXCLUDED.start_adr,
  adr_growth_rate = EXCLUDED.adr_growth_rate, start_occupancy = EXCLUDED.start_occupancy,
  max_occupancy = EXCLUDED.max_occupancy, occupancy_ramp_months = EXCLUDED.occupancy_ramp_months,
  occupancy_growth_step = EXCLUDED.occupancy_growth_step, stabilization_months = EXCLUDED.stabilization_months,
  type = EXCLUDED.type, acquisition_ltv = EXCLUDED.acquisition_ltv,
  acquisition_interest_rate = EXCLUDED.acquisition_interest_rate,
  acquisition_term_years = EXCLUDED.acquisition_term_years,
  acquisition_closing_cost_rate = EXCLUDED.acquisition_closing_cost_rate,
  will_refinance = EXCLUDED.will_refinance, refinance_date = EXCLUDED.refinance_date,
  refinance_ltv = EXCLUDED.refinance_ltv, refinance_interest_rate = EXCLUDED.refinance_interest_rate,
  refinance_term_years = EXCLUDED.refinance_term_years,
  refinance_closing_cost_rate = EXCLUDED.refinance_closing_cost_rate,
  cost_rate_rooms = EXCLUDED.cost_rate_rooms, cost_rate_fb = EXCLUDED.cost_rate_fb,
  cost_rate_admin = EXCLUDED.cost_rate_admin, cost_rate_marketing = EXCLUDED.cost_rate_marketing,
  cost_rate_property_ops = EXCLUDED.cost_rate_property_ops,
  cost_rate_utilities = EXCLUDED.cost_rate_utilities, cost_rate_insurance = EXCLUDED.cost_rate_insurance,
  cost_rate_taxes = EXCLUDED.cost_rate_taxes, cost_rate_it = EXCLUDED.cost_rate_it,
  cost_rate_ffe = EXCLUDED.cost_rate_ffe, cost_rate_other = EXCLUDED.cost_rate_other,
  rev_share_events = EXCLUDED.rev_share_events, rev_share_fb = EXCLUDED.rev_share_fb,
  rev_share_other = EXCLUDED.rev_share_other,
  catering_boost_percent = EXCLUDED.catering_boost_percent, exit_cap_rate = EXCLUDED.exit_cap_rate,
  tax_rate = EXCLUDED.tax_rate, land_value_percent = EXCLUDED.land_value_percent,
  disposition_commission = EXCLUDED.disposition_commission,
  base_management_fee_rate = EXCLUDED.base_management_fee_rate,
  incentive_management_fee_rate = EXCLUDED.incentive_management_fee_rate,
  street_address = EXCLUDED.street_address, city = EXCLUDED.city,
  state_province = EXCLUDED.state_province, zip_postal_code = EXCLUDED.zip_postal_code,
  country = EXCLUDED.country, research_values = EXCLUDED.research_values,
  user_id = EXCLUDED.user_id,
  refinance_years_after_acquisition = EXCLUDED.refinance_years_after_acquisition,
  description = EXCLUDED.description;


-- ==============================================================================
-- PROPERTY FEE CATEGORIES
-- ==============================================================================

DELETE FROM property_fee_categories;

INSERT INTO property_fee_categories (id, property_id, name, rate, is_active, sort_order) OVERRIDING SYSTEM VALUE VALUES
  (71, 50, 'Marketing', 0.02, TRUE, 1),
  (167, 50, 'Marketing & Brand', 0.02, TRUE, 1),
  (72, 50, 'IT', 0.01, TRUE, 2),
  (119, 50, 'Technology & Reservations', 0.025, TRUE, 2),
  (73, 50, 'Accounting', 0.015, TRUE, 3),
  (74, 50, 'Reservations', 0.02, TRUE, 4),
  (120, 50, 'Revenue Management', 0.01, TRUE, 4),
  (75, 50, 'General Management', 0.015, TRUE, 5),
  (101, 50, 'Insurance', 0.01, TRUE, 6),
  (131, 50, 'Procurement', 0.01, TRUE, 6),
  (102, 50, 'Property Operations', 0.01, TRUE, 7),
  (103, 50, 'Other Services', 0.01, TRUE, 8),
  (76, 51, 'Marketing', 0.02, TRUE, 1),
  (171, 51, 'Marketing & Brand', 0.02, TRUE, 1),
  (77, 51, 'IT', 0.01, TRUE, 2),
  (121, 51, 'Technology & Reservations', 0.025, TRUE, 2),
  (78, 51, 'Accounting', 0.015, TRUE, 3),
  (79, 51, 'Reservations', 0.02, TRUE, 4),
  (122, 51, 'Revenue Management', 0.01, TRUE, 4),
  (80, 51, 'General Management', 0.015, TRUE, 5),
  (104, 51, 'Insurance', 0.01, TRUE, 6),
  (132, 51, 'Procurement', 0.01, TRUE, 6),
  (105, 51, 'Property Operations', 0.01, TRUE, 7),
  (106, 51, 'Other Services', 0.01, TRUE, 8),
  (81, 52, 'Marketing', 0.02, TRUE, 1),
  (172, 52, 'Marketing & Brand', 0.02, TRUE, 1),
  (82, 52, 'IT', 0.01, TRUE, 2),
  (123, 52, 'Technology & Reservations', 0.025, TRUE, 2),
  (83, 52, 'Accounting', 0.015, TRUE, 3),
  (84, 52, 'Reservations', 0.02, TRUE, 4),
  (124, 52, 'Revenue Management', 0.01, TRUE, 4),
  (85, 52, 'General Management', 0.015, TRUE, 5),
  (107, 52, 'Insurance', 0.01, TRUE, 6),
  (133, 52, 'Procurement', 0.01, TRUE, 6),
  (108, 52, 'Property Operations', 0.01, TRUE, 7),
  (109, 52, 'Other Services', 0.01, TRUE, 8),
  (86, 53, 'Marketing', 0.02, TRUE, 1),
  (170, 53, 'Marketing & Brand', 0.02, TRUE, 1),
  (87, 53, 'IT', 0.01, TRUE, 2),
  (125, 53, 'Technology & Reservations', 0.025, TRUE, 2),
  (88, 53, 'Accounting', 0.015, TRUE, 3),
  (89, 53, 'Reservations', 0.02, TRUE, 4),
  (126, 53, 'Revenue Management', 0.01, TRUE, 4),
  (90, 53, 'General Management', 0.015, TRUE, 5),
  (110, 53, 'Insurance', 0.01, TRUE, 6),
  (134, 53, 'Procurement', 0.01, TRUE, 6),
  (111, 53, 'Property Operations', 0.01, TRUE, 7),
  (112, 53, 'Other Services', 0.01, TRUE, 8),
  (91, 54, 'Marketing', 0.02, TRUE, 1),
  (168, 54, 'Marketing & Brand', 0.02, TRUE, 1),
  (92, 54, 'IT', 0.01, TRUE, 2),
  (127, 54, 'Technology & Reservations', 0.025, TRUE, 2),
  (93, 54, 'Accounting', 0.015, TRUE, 3),
  (94, 54, 'Reservations', 0.02, TRUE, 4),
  (128, 54, 'Revenue Management', 0.01, TRUE, 4),
  (95, 54, 'General Management', 0.015, TRUE, 5),
  (113, 54, 'Insurance', 0.01, TRUE, 6),
  (135, 54, 'Procurement', 0.01, TRUE, 6),
  (114, 54, 'Property Operations', 0.01, TRUE, 7),
  (115, 54, 'Other Services', 0.01, TRUE, 8),
  (96, 55, 'Marketing', 0.02, TRUE, 1),
  (173, 55, 'Marketing & Brand', 0.02, TRUE, 1),
  (97, 55, 'IT', 0.01, TRUE, 2),
  (129, 55, 'Technology & Reservations', 0.025, TRUE, 2),
  (98, 55, 'Accounting', 0.015, TRUE, 3),
  (99, 55, 'Reservations', 0.02, TRUE, 4),
  (130, 55, 'Revenue Management', 0.01, TRUE, 4),
  (100, 55, 'General Management', 0.015, TRUE, 5),
  (116, 55, 'Insurance', 0.01, TRUE, 6),
  (136, 55, 'Procurement', 0.01, TRUE, 6),
  (117, 55, 'Property Operations', 0.01, TRUE, 7),
  (118, 55, 'Other Services', 0.01, TRUE, 8),
  (153, 58, 'Marketing', 0.015, TRUE, 1),
  (169, 58, 'Marketing & Brand', 0.02, TRUE, 1),
  (154, 58, 'Technology & Reservations', 0.02, TRUE, 2),
  (155, 58, 'Accounting', 0.015, TRUE, 3),
  (156, 58, 'Revenue Management', 0.01, TRUE, 4),
  (157, 58, 'General Management', 0.015, TRUE, 5),
  (158, 58, 'Procurement', 0.01, TRUE, 6),
  (174, 63, 'Marketing', 0.02, TRUE, 1),
  (182, 63, 'Marketing & Brand', 0.02, TRUE, 1),
  (175, 63, 'IT', 0.01, TRUE, 2),
  (183, 63, 'Technology & Reservations', 0.025, TRUE, 2),
  (176, 63, 'Accounting', 0.015, TRUE, 3),
  (177, 63, 'Reservations', 0.02, TRUE, 4),
  (184, 63, 'Revenue Management', 0.01, TRUE, 4),
  (178, 63, 'General Management', 0.02, TRUE, 5),
  (179, 63, 'Insurance', 0.01, TRUE, 6),
  (180, 63, 'Property Operations', 0.01, TRUE, 7),
  (181, 63, 'Other Services', 0.01, TRUE, 8)
ON CONFLICT (id) DO UPDATE SET
  property_id = EXCLUDED.property_id, name = EXCLUDED.name, rate = EXCLUDED.rate,
  is_active = EXCLUDED.is_active, sort_order = EXCLUDED.sort_order;


-- ==============================================================================
-- MARKET RESEARCH
-- Update titles only — content is AI-generated and kept intact
-- ==============================================================================

UPDATE market_research SET title = 'Property Research' WHERE id = 1 AND property_id = 50;


-- ==============================================================================
-- RESET SEQUENCES to max(id) + 1
-- ==============================================================================

SELECT setval('companies_id_seq', COALESCE((SELECT MAX(id) FROM companies), 0) + 1, false);
SELECT setval('logos_id_seq', COALESCE((SELECT MAX(id) FROM logos), 0) + 1, false);
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

-- ==============================================================================
-- END OF PRODUCTION SYNC SCRIPT
-- ==============================================================================
