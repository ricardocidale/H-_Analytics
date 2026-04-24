/**
 * server/ai/icp-intelligence.ts — ICP (Ideal Customer/Property Profile)
 * generation orchestrator (shell).
 *
 * The ICP has 130+ fields. No user will fill them manually. Instead:
 *   Phase 1: Portfolio Reverse-Engineering (deterministic — instant, no AI cost)
 *     Scans all properties → computes min/max/median for every numeric dimension
 *     Ranks amenities by frequency → must/major/nice/no
 *   Phase 2: AI Enhancement (one LLM call — fills qualitative gaps)
 *     Takes portfolio analysis + company description → generates narratives
 *   Phase 3: Financial Derivation (deterministic — from global assumptions + portfolio)
 *     Derives target IRR, fee ranges, hold period from existing financial models
 *
 * The generated ICP then feeds ALL research prompts as rich context.
 *
 * Audit #319 R5 Phase 6 split this module into:
 *   - `shared/icp-types.ts` — portable narrative types (Priority,
 *     GeneratedIcpConfig, GeneratedIcpDescriptive, PortfolioAnalysis,
 *     IcpGenerationResult, IcpGenerateOptions).
 *   - `server/ai/icp/helpers.ts` — numeric aggregation + formatters.
 *   - `server/ai/icp/portfolio-analysis.ts` — `analyzePortfolio` (Phase 1).
 *   - `server/ai/icp/config-builder.ts` — `buildIcpConfigFromPortfolio` and
 *     the FALLBACK defaults (Phase 2 deterministic).
 *   - `server/ai/icp/prompt.ts` — `buildIcpGenerationPrompt` LLM template.
 *   - `server/ai/icp/fallback-descriptive.ts` — deterministic descriptive
 *     fallbacks used when the LLM call is skipped or fails.
 *   - `server/ai/icp/orchestrator.ts` — `generateIcp` end-to-end pipeline.
 *   - `server/ai/icp/narrative.ts` — `buildFullIcpNarrative` for research
 *     prompt injection.
 *
 * This file re-exports the public types from `@shared/icp-types` (so legacy
 * `import … from "./icp-intelligence"` callers keep working) and exposes the
 * top-level functions consumed by the route layer and the context-pack
 * builder.
 */

// ─── Public re-exports ──────────────────────────────────────────────────────
// Keep legacy importers working: any caller that did
//   import { GeneratedIcpConfig, PortfolioAnalysis, … } from "./icp-intelligence"
// continues to resolve without touching call sites.

export type {
  Priority,
  GeneratedIcpConfig,
  GeneratedIcpDescriptive,
  PortfolioAnalysis,
  IcpGenerationResult,
  IcpGenerateOptions,
  NumericAggregate,
  RevenueShareAggregate,
} from "@shared/icp-types";

export { analyzePortfolio } from "./icp/portfolio-analysis";
export { buildIcpConfigFromPortfolio } from "./icp/config-builder";
export { buildIcpGenerationPrompt } from "./icp/prompt";
export { generateIcp } from "./icp/orchestrator";
export { buildFullIcpNarrative } from "./icp/narrative";
