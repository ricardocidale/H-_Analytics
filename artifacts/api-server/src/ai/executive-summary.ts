/**
 * server/ai/executive-summary.ts — Executive Summary Generator (Phase 11.3)
 *
 * Generates investor-grade 1-page executive summaries per property and per
 * portfolio. Two layers:
 *   1. Deterministic — key metrics computed from property assumptions
 *      (always available; see ./executive-summary/finance-helpers.ts).
 *   2. LLM-enhanced — qualitative sections (investment thesis, market
 *      position, etc.). Gracefully degrades to template-based text if
 *      the LLM is unavailable (see ./executive-summary/llm-sections.ts
 *      and ./executive-summary/templates.ts).
 *
 * Designed to be embedded as page 1 of any PDF/PPTX export.
 *
 * This file is a thin orchestrator: it only re-exports the public surface
 * so existing callers (`server/routes/executive-summary.ts`, exports,
 * etc.) keep working. Implementation lives in the ./executive-summary
 * subdirectory, broken up by responsibility.
 */

export type {
  PropertyExecutiveSummary,
  PortfolioExecutiveSummary,
  ExecutiveSummaryOptions,
} from "./executive-summary/types";

export {
  generatePropertyExecutiveSummary,
  generatePortfolioExecutiveSummary,
} from "./executive-summary/generators";

export {
  formatPropertySummaryAsText,
  formatPortfolioSummaryAsText,
} from "./executive-summary/formatters";
