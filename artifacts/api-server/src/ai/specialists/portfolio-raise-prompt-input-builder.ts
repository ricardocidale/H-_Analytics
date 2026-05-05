/**
 * portfolio-raise-prompt-input-builder.ts — pure input adapters for the
 * Portfolio Capital Raise Specialist (analysis-first v1).
 *
 * ADR-007 §1 compliance:
 *   - Zero DB, LLM, HTTP imports. Importable from edge runtimes.
 *   - The route layer maps engine output to PortfolioRaiseAnalysisSummary;
 *     this builder receives only that slim type.
 *
 * The 5 portfolio dimensions are engine-derived (not user-saved), so there are
 * no CapitalRaiseInputs or DimensionInput mappings here. The builder's role is
 * to wrap context for the prompt builder and provide dimension metadata.
 */

import type { FundingPersonaContext, PriorVerdictRef } from "./mgmt-co-funding-prompt-input-builder";
import {
  PORTFOLIO_RAISE_FIRST_CLOSE_FRACTION,
  PORTFOLIO_RAISE_FIRST_CLOSE_BENCHMARK_MID,
  PORTFOLIO_RAISE_FIRST_CLOSE_BENCHMARK_HIGH,
  PORTFOLIO_RAISE_DSCR_BENCHMARK_LOW,
  PORTFOLIO_RAISE_DSCR_BENCHMARK_MID,
  PORTFOLIO_RAISE_DSCR_BENCHMARK_HIGH,
  PORTFOLIO_RAISE_RAMP_BUFFER_MONTHS_LOW,
  PORTFOLIO_RAISE_RAMP_BUFFER_MONTHS_MID,
  PORTFOLIO_RAISE_RAMP_BUFFER_MONTHS_HIGH,
  PORTFOLIO_RAISE_IRR_BENCHMARK_LOW,
  PORTFOLIO_RAISE_IRR_BENCHMARK_MID,
  PORTFOLIO_RAISE_IRR_BENCHMARK_HIGH,
} from "@shared/constants-funding";

// ────────────────────────────────────────────────────────────────────────────
// Dimension taxonomy

export const PORTFOLIO_RAISE_DIMENSION_KEYS = [
  "totalEquityRequired",
  "firstCloseMinimum",
  "portfolioDscr",
  "rampCapitalBuffer",
  "achievableIrr",
] as const;

export type PortfolioRaiseDimensionKey = (typeof PORTFOLIO_RAISE_DIMENSION_KEYS)[number];

export interface PortfolioRaiseDimensionDescriptor {
  key: PortfolioRaiseDimensionKey;
  label: string;
  unit: "usd" | "ratio" | "mo" | "pct";
  /** LP benchmark anchors for each dimension (from PE/hospitality fund norms). */
  benchmarks: { low: number; mid: number; high: number };
  evidenceCues: readonly string[];
}

export const PORTFOLIO_RAISE_DIMENSIONS: readonly PortfolioRaiseDimensionDescriptor[] = [
  {
    key: "totalEquityRequired",
    label: "Total equity required",
    unit: "usd",
    benchmarks: { low: 2_000_000, mid: 8_000_000, high: 25_000_000 },
    evidenceCues: [
      "per-property equity computed from purchase price, LTV, improvements, and pre-opening costs",
      "concentration limit: no single asset should exceed 20–25% of total fund equity",
      "institutional LP minimum commitment sizes for boutique luxury fund vehicles",
    ],
  },
  {
    key: "firstCloseMinimum",
    label: "First close minimum",
    unit: "usd",
    benchmarks: { low: PORTFOLIO_RAISE_FIRST_CLOSE_FRACTION, mid: PORTFOLIO_RAISE_FIRST_CLOSE_BENCHMARK_MID, high: PORTFOLIO_RAISE_FIRST_CLOSE_BENCHMARK_HIGH },
    evidenceCues: [
      "PE norm: first close at 30–50% of total fund; must cover at least Property 1 equity",
      "LP sequencing expectations for a boutique portfolio fund with phased acquisitions",
      "comparable boutique fund first-close sizing from canned LP dataset",
    ],
  },
  {
    key: "portfolioDscr",
    label: "Portfolio DSCR (blended)",
    unit: "ratio",
    benchmarks: { low: PORTFOLIO_RAISE_DSCR_BENCHMARK_LOW, mid: PORTFOLIO_RAISE_DSCR_BENCHMARK_MID, high: PORTFOLIO_RAISE_DSCR_BENCHMARK_HIGH },
    evidenceCues: [
      "lender covenant floor: 1.25× at base-case NOI; stress break: 1.0× (covenant breach risk)",
      "blended DSCR across stabilized properties weighted by loan balance",
      "NOI sourced from engine-computed pro-forma at stabilization month per property",
    ],
  },
  {
    key: "rampCapitalBuffer",
    label: "Ramp capital buffer",
    unit: "mo",
    benchmarks: { low: PORTFOLIO_RAISE_RAMP_BUFFER_MONTHS_LOW, mid: PORTFOLIO_RAISE_RAMP_BUFFER_MONTHS_MID, high: PORTFOLIO_RAISE_RAMP_BUFFER_MONTHS_HIGH },
    evidenceCues: [
      "months of working capital that cover concurrent pre-stabilization cash burn",
      "ramp overlap windows: months where 2+ properties are simultaneously in occupancy ramp",
      "LP expectation: buffer must cover the longest overlap window plus 3 months minimum",
    ],
  },
  {
    key: "achievableIrr",
    label: "Achievable levered IRR",
    unit: "pct",
    benchmarks: { low: PORTFOLIO_RAISE_IRR_BENCHMARK_LOW, mid: PORTFOLIO_RAISE_IRR_BENCHMARK_MID, high: PORTFOLIO_RAISE_IRR_BENCHMARK_HIGH },
    evidenceCues: [
      "boutique luxury value-add levered IRR target: 12–18%; equity multiple 1.8–2.2x",
      "engine-computed implied IRR (advisory floor — excludes refi proceeds per MAJOR-2)",
      "LP preferred return: 8% non-compounded; GP carry 20%; European waterfall default",
    ],
  },
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Slim type — route layer maps PortfolioCapitalRaiseAnalysis to this

export interface PortfolioPropertyEquityRow {
  propertyIndex: number;
  propertyLabel: string;
  equityRequired: number;
  deploymentMonth: number;
  ltv: number;
  estimatedDscr: number | null;
}

export interface PortfolioRaiseAnalysisSummary {
  totalEquityRequired: number;
  firstCloseMinimum: number;
  portfolioDscrBlended: number | null;
  rampOverlapWindowCount: number;
  peakConcurrentRampCount: number;
  impliedIrr: number | null;
  rampCarryUnderstated: boolean;
  perPropertyEquity: PortfolioPropertyEquityRow[];
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt input context

export interface PortfolioRaisePromptInputContext {
  analysisSummary: PortfolioRaiseAnalysisSummary;
  persona: FundingPersonaContext;
  icpModel?: null;
  priorVerdicts?: readonly PriorVerdictRef[];
}

// ────────────────────────────────────────────────────────────────────────────
// Assembled prompt input pack

export interface PortfolioRaisePromptInput {
  specialistId: "portfolio.capitalRaise";
  requiredFields: readonly PortfolioRaiseDimensionDescriptor[];
  analysisSummary: PortfolioRaiseAnalysisSummary;
  persona: FundingPersonaContext;
  priorVerdicts: readonly PriorVerdictRef[];
  intent: string;
}

const PORTFOLIO_RAISE_INTENT =
  "Portfolio capital raise strategy: can this portfolio of investment properties support a fundable LP capital raise? Analyze total equity requirement, first-close sizing, DSCR sustainability, ramp capital exposure, and achievable IRR — all grounded in engine-computed per-property financials and LP industry benchmarks.";

export function buildPortfolioRaisePromptInput(
  ctx: PortfolioRaisePromptInputContext,
): PortfolioRaisePromptInput {
  return {
    specialistId: "portfolio.capitalRaise",
    requiredFields: PORTFOLIO_RAISE_DIMENSIONS,
    analysisSummary: ctx.analysisSummary,
    persona: ctx.persona,
    priorVerdicts: ctx.priorVerdicts ?? [],
    intent: PORTFOLIO_RAISE_INTENT,
  };
}
