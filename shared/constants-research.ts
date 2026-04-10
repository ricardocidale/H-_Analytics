export const DEFAULT_RESEARCH_TIME_HORIZON = "10-year";

export const RESEARCH_SOURCES = [
  { name: "STR", category: "Hospitality", url: "https://str.com" },
  { name: "CBRE Hotels", category: "Hospitality", url: "https://www.cbre.com/industries/hotels" },
  { name: "HVS", category: "Hospitality", url: "https://hvs.com" },
  { name: "PKF Trends", category: "Hospitality", url: "https://www.pkfhotels.com" },
  { name: "HotStats", category: "Hospitality", url: "https://www.hotstats.com" },
  { name: "Xotels", category: "Hospitality", url: "https://www.xotels.com" },
  { name: "FRED", category: "Economics", url: "https://fred.stlouisfed.org" },
  { name: "BLS", category: "Economics", url: "https://www.bls.gov" },
  { name: "USALI 12th Ed (HFTP)", category: "Accounting", url: "https://usali.hftp.org" },
  { name: "Withum USALI Guide", category: "Accounting", url: "https://www.withum.com/resources/usali-12th-edition-aligning-hotel-accounting-with-modern-hospitality/" },
  { name: "Chatlyn Glossary", category: "Definitions", url: "https://chatlyn.com/en/glossary/adjusted-gross-operating-profit-agop/" },
  { name: "Canary Technologies", category: "Definitions", url: "https://www.canarytechnologies.com/hotel-terminology/adjusted-gross-operating-profit" },
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
