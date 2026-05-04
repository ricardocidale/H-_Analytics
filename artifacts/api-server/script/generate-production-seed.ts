/**
 * generate-production-seed.ts
 *
 * Regenerates seed-production.sql from the current live database state.
 * Run from the api-server directory:
 *
 *   pnpm exec tsx script/generate-production-seed.ts > script/seed-production.sql
 *
 * The output is also written to seed/seed-production.sql (the path production-sql.ts
 * checks at bundle time). Both files are committed together.
 */

import pg from "pg";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

const DB_URL =
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL ??
  (() => {
    throw new Error("Neither POSTGRES_URL nor DATABASE_URL is set");
  })();

const pool = new Pool({ connectionString: DB_URL });

// ── SQL helpers ────────────────────────────────────────────────────────────

function esc(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return `'${v.toISOString().slice(0, 10)}'`;
  // pg returns jsonb/json columns as parsed JS objects — serialize them back
  if (typeof v === "object") {
    const s = JSON.stringify(v).replace(/'/g, "''");
    return `'${s}'`;
  }
  // Strings: escape single quotes by doubling them
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

function row(cols: unknown[]): string {
  return `(${cols.map(esc).join(", ")})`;
}

function header(title: string): string {
  const line = "=".repeat(78);
  return `\n-- ${line}\n-- ${title}\n-- ${line}\n`;
}

// ── Queries ────────────────────────────────────────────────────────────────

async function getCanonicalPropertyIds(): Promise<number[]> {
  const { rows } = await pool.query<{ id: number }>(
    "SELECT id FROM properties ORDER BY id",
  );
  return rows.map((r) => r.id);
}

async function getProperties(ids: number[]) {
  const { rows } = await pool.query(
    `SELECT
      id, name, location, market, image_url, status,
      acquisition_date, operations_start_date,
      purchase_price, building_improvements, pre_opening_costs, operating_reserve,
      room_count, start_adr, adr_growth_rate, start_occupancy, max_occupancy,
      occupancy_ramp_months, occupancy_growth_step, stabilization_months, type,
      acquisition_ltv, acquisition_interest_rate, acquisition_term_years,
      acquisition_closing_cost_rate, will_refinance, refinance_date,
      refinance_ltv, refinance_interest_rate, refinance_term_years,
      refinance_closing_cost_rate,
      cost_rate_rooms, cost_rate_fb, cost_rate_admin, cost_rate_marketing,
      cost_rate_property_ops, cost_rate_utilities, cost_rate_insurance,
      cost_rate_taxes, cost_rate_it, cost_rate_ffe, cost_rate_other,
      rev_share_events, rev_share_fb, rev_share_other,
      catering_boost_percent, exit_cap_rate, tax_rate, land_value_percent,
      disposition_commission, base_management_fee_rate,
      incentive_management_fee_rate, street_address, city, state_province,
      zip_postal_code, country, research_values, user_id,
      refinance_years_after_acquisition, description
    FROM properties
    WHERE id = ANY($1)
    ORDER BY acquisition_date NULLS LAST, id`,
    [ids],
  );
  return rows;
}

async function getFeeCategories(propertyIds: number[]) {
  const { rows } = await pool.query(
    `SELECT id, property_id, name, rate, is_active, sort_order
     FROM property_fee_categories
     WHERE property_id = ANY($1)
     ORDER BY property_id, sort_order, id`,
    [propertyIds],
  );
  return rows;
}

async function getCompanies() {
  const { rows } = await pool.query(
    "SELECT id, name, type, description, logo_id, is_active, theme_id FROM companies ORDER BY id",
  );
  return rows;
}

async function getLogos() {
  const { rows } = await pool.query(
    "SELECT id, name, url, is_default, company_name FROM logos ORDER BY id",
  );
  return rows;
}

async function getDesignThemes() {
  const { rows } = await pool.query(
    "SELECT id, name, description, is_default, colors FROM design_themes ORDER BY id",
  );
  return rows;
}

async function getCanonicalUsers() {
  // Canonical = accounts that should exist on every environment
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, role, first_name, last_name, company,
            title, selected_theme_id
     FROM users
     WHERE id IN (1, 2, 4, 6, 8, 9, 10, 11)
     ORDER BY id`,
  );
  return rows;
}

async function getGlobalAssumptions() {
  const { rows } = await pool.query(
    `SELECT
      id, user_id, model_start_date, inflation_rate, base_management_fee,
      incentive_management_fee, staff_salary, travel_cost_per_client,
      it_license_per_client, marketing_rate, misc_ops_rate, office_lease_start,
      professional_services_start, tech_infra_start, business_insurance_start,
      standard_acq_package, debt_assumptions, commission_rate,
      fixed_cost_escalation_rate, capital_raise_1_amount, capital_raise_1_date,
      capital_raise_2_amount, capital_raise_2_date, capital_raise_valuation_cap,
      capital_raise_discount_rate, company_tax_rate, company_ops_start_date,
      fiscal_year_start_month, partner_comp_year1, partner_comp_year2,
      partner_comp_year3, partner_comp_year4, partner_comp_year5,
      partner_comp_year6, partner_comp_year7, partner_comp_year8,
      partner_comp_year9, partner_comp_year10, partner_count_year1,
      partner_count_year2, partner_count_year3, partner_count_year4,
      partner_count_year5, partner_count_year6, partner_count_year7,
      partner_count_year8, partner_count_year9, partner_count_year10,
      company_name, funding_source_label, exit_cap_rate, sales_commission_rate,
      event_expense_rate, other_expense_rate, utilities_variable_split,
      preferred_llm, asset_definition, projection_years,
      staff_tier1_max_properties, staff_tier1_fte, staff_tier2_max_properties,
      staff_tier2_fte, staff_tier3_fte, property_label,
      show_company_calculation_details, show_property_calculation_details,
      sidebar_property_finder, sidebar_sensitivity, sidebar_financing,
      sidebar_compare, sidebar_timeline, sidebar_map_view,
      sidebar_executive_summary, sidebar_scenarios, sidebar_user_manual,
      show_ai_assistant, company_phone, company_email, company_website,
      company_ein, company_founding_year, company_street_address, company_city,
      company_state_province, company_country, company_zip_postal_code,
      icp_config, research_config
    FROM global_assumptions
    ORDER BY id
    LIMIT 1`,
  );
  return rows;
}

async function getMarketResearch(propertyIds: number[]) {
  const { rows } = await pool.query(
    `SELECT id, property_id, title
     FROM market_research
     WHERE type = 'property' AND property_id = ANY($1)
     ORDER BY id`,
    [propertyIds],
  );
  return rows;
}

// ── SQL generation ─────────────────────────────────────────────────────────

function genProperties(ids: number[], rows: Record<string, unknown>[]): string {
  const idList = ids.join(", ");

  const inserts = rows
    .map((p) => {
      const cols = [
        p.id,
        p.name,
        p.location,
        p.market,
        p.image_url,
        p.status,
        p.acquisition_date,
        p.operations_start_date,
        p.purchase_price,
        p.building_improvements,
        p.pre_opening_costs,
        p.operating_reserve,
        p.room_count,
        p.start_adr,
        p.adr_growth_rate,
        p.start_occupancy,
        p.max_occupancy,
        p.occupancy_ramp_months,
        p.occupancy_growth_step,
        p.stabilization_months,
        p.type,
        p.acquisition_ltv,
        p.acquisition_interest_rate,
        p.acquisition_term_years,
        p.acquisition_closing_cost_rate,
        p.will_refinance,
        p.refinance_date,
        p.refinance_ltv,
        p.refinance_interest_rate,
        p.refinance_term_years,
        p.refinance_closing_cost_rate,
        p.cost_rate_rooms,
        p.cost_rate_fb,
        p.cost_rate_admin,
        p.cost_rate_marketing,
        p.cost_rate_property_ops,
        p.cost_rate_utilities,
        p.cost_rate_insurance,
        p.cost_rate_taxes,
        p.cost_rate_it,
        p.cost_rate_ffe,
        p.cost_rate_other,
        p.rev_share_events,
        p.rev_share_fb,
        p.rev_share_other,
        p.catering_boost_percent,
        p.exit_cap_rate,
        p.tax_rate,
        p.land_value_percent,
        p.disposition_commission,
        p.base_management_fee_rate,
        p.incentive_management_fee_rate,
        p.street_address,
        p.city,
        p.state_province,
        p.zip_postal_code,
        p.country,
        p.research_values,
        p.user_id,
        p.refinance_years_after_acquisition,
        p.description,
      ];

      return `-- ${p.id}. ${p.name}
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
  ${row(cols)}
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
`;
    })
    .join("\n");

  return `${header("CLEANUP: Remove non-canonical properties (FK order: dependents first)")}
DELETE FROM property_fee_categories WHERE property_id NOT IN (${idList});
DELETE FROM market_research WHERE type = 'property' AND property_id NOT IN (${idList});
DELETE FROM properties WHERE id NOT IN (${idList});

${header(`PROPERTIES (${rows.length} canonical, sorted by acquisition_date)`)}
${inserts}`;
}

function genCompanies(rows: Record<string, unknown>[]): string {
  const vals = rows
    .map((c) =>
      row([c.id, c.name, c.type, c.description, c.logo_id, c.is_active, c.theme_id]),
    )
    .join(",\n  ");
  return `${header("COMPANIES")}
INSERT INTO companies (id, name, type, description, logo_id, is_active, theme_id) OVERRIDING SYSTEM VALUE VALUES
  ${vals}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, description = EXCLUDED.description,
  logo_id = EXCLUDED.logo_id, is_active = EXCLUDED.is_active, theme_id = EXCLUDED.theme_id;
`;
}

function genLogos(rows: Record<string, unknown>[]): string {
  const vals = rows
    .map((l) => row([l.id, l.name, l.url, l.is_default, l.company_name]))
    .join(",\n  ");
  return `${header("LOGOS")}
INSERT INTO logos (id, name, url, is_default, company_name) OVERRIDING SYSTEM VALUE VALUES
  ${vals}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, url = EXCLUDED.url, is_default = EXCLUDED.is_default,
  company_name = EXCLUDED.company_name;
`;
}

function genDesignThemes(rows: Record<string, unknown>[]): string {
  const inserts = rows
    .map((t) => {
      const vals = row([t.id, t.name, t.description, t.is_default, t.colors]);
      return `INSERT INTO design_themes (id, name, description, is_default, colors) OVERRIDING SYSTEM VALUE VALUES
  ${vals}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  is_default = EXCLUDED.is_default, colors = EXCLUDED.colors;`;
    })
    .join("\n\n");
  return `${header("DESIGN THEMES")}\n${inserts}\n`;
}

function genUsers(rows: Record<string, unknown>[]): string {
  const vals = rows
    .map((u) =>
      row([
        u.id, u.email, u.password_hash, u.role, u.first_name, u.last_name,
        u.company, u.title, u.selected_theme_id,
      ]),
    )
    .join(",\n  ");
  return `${header("USERS (password hashes from live database)\n-- NOTE: Production passwords are overridden by env vars on startup via seedAdminUser()")}
INSERT INTO users (id, email, password_hash, role, first_name, last_name, company, title, selected_theme_id) OVERRIDING SYSTEM VALUE VALUES
  ${vals}
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, role = EXCLUDED.role, first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name, company = EXCLUDED.company, title = EXCLUDED.title;
`;
}

function genGlobalAssumptions(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "-- global_assumptions: no rows found\n";
  const g = rows[0];
  const cols = [
    g.id, g.user_id, g.model_start_date, g.inflation_rate, g.base_management_fee,
    g.incentive_management_fee, g.staff_salary, g.travel_cost_per_client,
    g.it_license_per_client, g.marketing_rate, g.misc_ops_rate,
    g.office_lease_start, g.professional_services_start, g.tech_infra_start,
    g.business_insurance_start, g.standard_acq_package, g.debt_assumptions,
    g.commission_rate, g.fixed_cost_escalation_rate,
    g.capital_raise_1_amount, g.capital_raise_1_date,
    g.capital_raise_2_amount, g.capital_raise_2_date,
    g.capital_raise_valuation_cap, g.capital_raise_discount_rate,
    g.company_tax_rate, g.company_ops_start_date, g.fiscal_year_start_month,
    g.partner_comp_year1, g.partner_comp_year2, g.partner_comp_year3,
    g.partner_comp_year4, g.partner_comp_year5, g.partner_comp_year6,
    g.partner_comp_year7, g.partner_comp_year8, g.partner_comp_year9,
    g.partner_comp_year10, g.partner_count_year1, g.partner_count_year2,
    g.partner_count_year3, g.partner_count_year4, g.partner_count_year5,
    g.partner_count_year6, g.partner_count_year7, g.partner_count_year8,
    g.partner_count_year9, g.partner_count_year10,
    g.company_name, g.funding_source_label, g.exit_cap_rate, g.sales_commission_rate,
    g.event_expense_rate, g.other_expense_rate, g.utilities_variable_split,
    g.preferred_llm, g.asset_definition, g.projection_years,
    g.staff_tier1_max_properties, g.staff_tier1_fte,
    g.staff_tier2_max_properties, g.staff_tier2_fte, g.staff_tier3_fte,
    g.property_label, g.show_company_calculation_details, g.show_property_calculation_details,
    g.sidebar_property_finder, g.sidebar_sensitivity, g.sidebar_financing,
    g.sidebar_compare, g.sidebar_timeline, g.sidebar_map_view,
    g.sidebar_executive_summary, g.sidebar_scenarios, g.sidebar_user_manual,
    g.show_ai_assistant, g.company_phone, g.company_email, g.company_website,
    g.company_ein, g.company_founding_year, g.company_street_address,
    g.company_city, g.company_state_province, g.company_country,
    g.company_zip_postal_code, g.icp_config, g.research_config,
  ];
  return `${header("GLOBAL ASSUMPTIONS")}
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
  ${cols.map(esc).join(",\n  ")}
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
`;
}

function genFeeCategories(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "-- property_fee_categories: no rows\n";
  const vals = rows
    .map((f) => `  ${row([f.id, f.property_id, f.name, f.rate, f.is_active, f.sort_order])}`)
    .join(",\n");
  return `${header("PROPERTY FEE CATEGORIES")}
DELETE FROM property_fee_categories;

INSERT INTO property_fee_categories (id, property_id, name, rate, is_active, sort_order) OVERRIDING SYSTEM VALUE VALUES
${vals}
ON CONFLICT (id) DO UPDATE SET
  property_id = EXCLUDED.property_id, name = EXCLUDED.name, rate = EXCLUDED.rate,
  is_active = EXCLUDED.is_active, sort_order = EXCLUDED.sort_order;
`;
}

function genMarketResearch(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "-- market_research: no property-scoped rows to update\n";
  const updates = rows
    .map((r) => `UPDATE market_research SET title = ${esc(r.title)} WHERE id = ${r.id} AND property_id = ${r.property_id};`)
    .join("\n");
  return `${header("MARKET RESEARCH\n-- Update titles only — content is AI-generated and kept intact")}
${updates}
`;
}

function genSequenceResets(ids: number[]): string {
  return `${header("RESET SEQUENCES to max(id) + 1")}
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
`;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const now = new Date().toISOString().slice(0, 10);

  const propertyIds = await getCanonicalPropertyIds();
  const [properties, companies, logos, designThemes, users, globalAssumptions, feeCategories, marketResearch] =
    await Promise.all([
      getProperties(propertyIds),
      getCompanies(),
      getLogos(),
      getDesignThemes(),
      getCanonicalUsers(),
      getGlobalAssumptions(),
      getFeeCategories(propertyIds),
      getMarketResearch(propertyIds),
    ]);

  const sql = [
    `-- ${"=".repeat(78)}`,
    `-- Production Database Sync Script`,
    `-- Generated: ${now}`,
    `-- Property IDs: ${propertyIds.join(", ")}`,
    `-- Properties: ${properties.length} | Fee categories: ${feeCategories.length}`,
    `-- Safe to run multiple times (fully idempotent).`,
    `-- Transient tables (sessions, activity_logs, login_logs, verification_runs,`,
    `-- conversations, messages) are intentionally skipped.`,
    `-- ${"=".repeat(78)}`,
    "",
    "BEGIN;",
    genCompanies(companies as Record<string, unknown>[]),
    genLogos(logos as Record<string, unknown>[]),
    genDesignThemes(designThemes as Record<string, unknown>[]),
    genUsers(users as Record<string, unknown>[]),
    genGlobalAssumptions(globalAssumptions as Record<string, unknown>[]),
    genProperties(propertyIds, properties as Record<string, unknown>[]),
    genFeeCategories(feeCategories as Record<string, unknown>[]),
    genMarketResearch(marketResearch as Record<string, unknown>[]),
    genSequenceResets(propertyIds),
    "COMMIT;",
    "",
    `-- ${"=".repeat(78)}`,
    `-- END OF PRODUCTION SYNC SCRIPT`,
    `-- ${"=".repeat(78)}`,
    "",
  ].join("\n");

  // Write to stdout (for piping) and to both seed file locations
  process.stdout.write(sql);

  const dir = path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.resolve(dir, "seed-production.sql");
  const seedPath = path.resolve(dir, "../seed/seed-production.sql");

  fs.writeFileSync(scriptPath, sql, "utf-8");
  fs.writeFileSync(seedPath, sql, "utf-8");

  process.stderr.write(
    `\n✓ Written to:\n  ${scriptPath}\n  ${seedPath}\n`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
