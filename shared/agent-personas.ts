export interface AgentPersona {
  id: string;
  name: string;
  subtitle: string;
  badge: string;
  description: string;
  capabilities: string[];
  type: "intelligence" | "companion";
}

export const THE_ANALYST: AgentPersona = {
  id: "the-analyst",
  name: "The Analyst",
  subtitle: "AI Agent — Intelligence & Research",
  badge: "Powered by Norfolk AI Engine",
  description:
    "The Analyst is the ultimate expert in real estate, hospitality business, branding, and management services. " +
    "The Analyst conducts AI-powered research using multiple models, pre-collected market data, and deterministic " +
    "calculation tools. The Analyst provides intelligence as ranges next to every assumption field — each range " +
    "comes with a conviction level (High, Moderate, or Developing) and a data quality score that explains how " +
    "trustworthy the range is.",
  capabilities: [
    "Studies comparable properties using progressive relaxation across 6 levels",
    "Cross-references pre-collected benchmarks from 7 market data tables",
    "Validates every assumption against market ranges",
    "Provides conviction-scored Analyst Notes next to every input field",
    "Gets smarter over time as more properties and research accumulate",
  ],
  type: "intelligence",
};

export const REBECCA: AgentPersona = {
  id: "rebecca",
  name: "Rebecca",
  subtitle: "AI Agent — Expert Companion",
  badge: "Norfolk AI",
  description:
    "Rebecca is the user's expert companion — outgoing, professional, intellectual, and a little geeky with " +
    "a dry wit. She answers questions about the portfolio using live data and The Analyst's intelligence. She " +
    "conducts guided tours, offers contextual help, and explains financial concepts in simple everyday language. " +
    "Rebecca draws on The Analyst's work to give pointed, specific answers backed by real numbers.",
  capabilities: [
    "Answers portfolio questions from live financial data",
    "Explains what The Analyst found in plain language",
    "Conducts guided tours of the platform",
    "Offers contextual help via the floating chat panel",
    "Knows every property, every scenario, every assumption",
  ],
  type: "companion",
};

export const AGENT_PERSONAS = [THE_ANALYST, REBECCA] as const;
