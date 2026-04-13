export const DEFAULT_RESEARCH_TIME_HORIZON = "10-year";

export const RESEARCH_SOURCES = [
  // ── Industry Benchmarks ────────────────────────────────────────────────
  { name: "STR", description: "Smith Travel Research — hotel performance benchmarks (ADR, occupancy, RevPAR) by chain scale and market", url: "https://str.com", category: "benchmarks", dataTypes: ["adr", "occupancy", "revpar", "supply"] },
  { name: "CBRE Hotels", description: "CBRE cap rate surveys, hotel transaction data, and US hotel investment forecasts", url: "https://www.cbre.com/insights/figures/us-cap-rate-survey", category: "transactions", dataTypes: ["cap_rates", "transactions", "forecasts"] },
  { name: "HVS", description: "Hotel valuations, feasibility studies, management fee benchmarks, and market analysis", url: "https://www.hvs.com", category: "valuations", dataTypes: ["valuations", "feasibility", "market_analysis", "management_fees"] },
  { name: "PKF", description: "Hospitality Research — Trends in the Hotel Industry annual report with operating cost benchmarks", url: "https://www.pkf.com/hospitality-research", category: "benchmarks", dataTypes: ["operating_costs", "revenue_metrics", "staffing"] },
  { name: "HotStats", description: "Full P&L benchmarking for hotels worldwide — granular department-level profitability", url: "https://www.hotstats.com", category: "benchmarks", dataTypes: ["operating_costs", "profitability", "labor_costs", "departmental_pnl"] },
  { name: "Horwath HTL", description: "Global hotel industry benchmarks, tourism forecasts, and market studies across 60+ countries", url: "https://horwathhtl.com", category: "benchmarks", dataTypes: ["global_benchmarks", "tourism_forecasts", "market_studies"] },
  { name: "JLL Hotels", description: "Hotel investment outlook, cap rates, transaction volumes, and investor sentiment surveys", url: "https://www.jll.com/en/trends-and-insights/investor/hotel-investment-outlook", category: "transactions", dataTypes: ["cap_rates", "transactions", "investment_outlook"] },

  // ── Macro Economic ─────────────────────────────────────────────────────
  { name: "FRED", description: "Federal Reserve Economic Data — interest rates (SOFR, Treasuries), CPI, unemployment, hotel-specific CPI", url: "https://fred.stlouisfed.org", category: "macro", dataTypes: ["interest_rates", "inflation", "employment", "hotel_cpi"] },
  { name: "BLS", description: "Bureau of Labor Statistics — hospitality employment, wages, CPI components for food and lodging", url: "https://www.bls.gov", category: "labor", dataTypes: ["wages", "employment", "cpi_components"] },
  { name: "World Bank", description: "Country-level economic indicators — GDP growth, inflation, tourism arrivals, unemployment by country", url: "https://data.worldbank.org", category: "macro", dataTypes: ["gdp_growth", "inflation", "tourism_arrivals", "unemployment"] },

  // ── Finance & Valuation ────────────────────────────────────────────────
  { name: "Damodaran", description: "Aswath Damodaran (NYU Stern) — country risk premiums, equity risk premium, hospitality cost of capital, industry betas", url: "https://pages.stern.nyu.edu/~adamodar", category: "finance", dataTypes: ["country_risk", "cost_of_capital", "betas", "erp"] },

  // ── Accounting Standards ───────────────────────────────────────────────
  { name: "USALI 12th Edition", description: "Uniform System of Accounts for the Lodging Industry — standard chart of accounts and department definitions", url: "https://www.ahla.com/usali", category: "standards", dataTypes: ["accounting_standards", "expense_categories", "department_definitions"] },
  { name: "Withum USALI Guide", description: "Practical interpretation of USALI 12th edition changes for hotel accounting alignment", url: "https://www.withum.com/resources/usali-12th-edition-aligning-hotel-accounting-with-modern-hospitality/", category: "standards", dataTypes: ["accounting_guidance"] },

  // ── Industry Organizations ─────────────────────────────────────────────
  { name: "AHLA", description: "American Hotel & Lodging Association — industry advocacy, workforce data, and policy research", url: "https://www.ahla.com", category: "industry", dataTypes: ["workforce", "policy", "industry_trends"] },
  { name: "AAHOA", description: "Asian American Hotel Owners Association — owner-operator benchmarks, insurance, and operational data", url: "https://www.aahoa.com", category: "industry", dataTypes: ["owner_benchmarks", "insurance", "operations"] },
  { name: "ISHC", description: "International Society of Hospitality Consultants — FF&E reserves, CapEx benchmarks, consulting standards", url: "https://www.ishc.com", category: "industry", dataTypes: ["ffe_reserves", "capex", "consulting_standards"] },

  // ── Hospitality Data Providers ─────────────────────────────────────────
  { name: "Xotels", description: "Hotel revenue management and market intelligence — boutique hotel consulting and benchmarks", url: "https://www.xotels.com", category: "benchmarks", dataTypes: ["boutique_benchmarks", "revenue_management"] },

  // ── Wellness & Vertical Markets ────────────────────────────────────────
  { name: "Global Wellness Institute", description: "Wellness tourism market size, growth trends, and wellness economy research", url: "https://globalwellnessinstitute.org/industry-research/", category: "verticals", dataTypes: ["wellness_tourism", "market_size", "growth_trends"] },

  // ── Definitions & Glossaries ───────────────────────────────────────────
  { name: "Chatlyn Glossary", description: "Hospitality glossary with AGOP, GOP, RevPAR, and other key metric definitions", url: "https://chatlyn.com/en/glossary/adjusted-gross-operating-profit-agop/", category: "definitions", dataTypes: ["glossary"] },
  { name: "Canary Technologies", description: "Hotel technology glossary with operational metric definitions", url: "https://www.canarytechnologies.com/hotel-terminology/adjusted-gross-operating-profit", category: "definitions", dataTypes: ["glossary"] },
] as const;

export const DEFAULT_RESEARCH_REFRESH_INTERVAL_DAYS = 30;

export const DEFAULT_RESEARCH_EVENT_CONFIG = {
  enabled: true,
  focusAreas: [] as string[],
  regions: [] as string[],
  timeHorizon: DEFAULT_RESEARCH_TIME_HORIZON,
  customInstructions: "",
  customQuestions: "",
  enabledTools: [] as string[],
  refreshIntervalDays: DEFAULT_RESEARCH_REFRESH_INTERVAL_DAYS,
};

export const RESEARCH_TAX_RATE_30_PCT = 0.30;

export const RESEARCH_MAKE_VS_BUY_MARGINAL_THRESHOLD = 0.10;
export const RESEARCH_MAKE_VS_BUY_DEFAULT_DISCOUNT_RATE = 0.08;
export const RESEARCH_MAKE_VS_BUY_DEFAULT_ESCALATION_RATE = 0.03;

export const DEFAULT_CAPITAL_GAINS_RATE = 0.20;
export const DEFAULT_DEP_RECAPTURE_RATE = 0.25;
export const HOLD_VS_SELL_INDIFFERENCE_PCT = 0.02;

export const DEFAULT_GP_CATCH_UP_TARGET_PCT = 0.20;

export const STRESS_TEST_MIN_DSCR = 1.25;
export const STRESS_SEVERITY_MODERATE_PCT = -5;
export const STRESS_SEVERITY_SEVERE_PCT = -15;
export const STRESS_SEVERITY_CRITICAL_PCT = -30;

export const RGI_OUTPERFORMING_THRESHOLD = 1.05;
export const RGI_UNDERPERFORMING_THRESHOLD = 0.95;

export const RESEARCH_CAP_RATE_VALUATION_MAX_MULTIPLIER = 3.0;
export const RESEARCH_CAP_RATE_VALUATION_MIN_MULTIPLIER = 0.3;
