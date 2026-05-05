/**
 * runPortfolioRaiseSpecialist — single-shot Opus verdict for the Portfolio
 * Capital Raise specialist (portfolio.capitalRaise v1).
 *
 * v1 architecture (G1.5c — simpler than the N+1 mgmt-co pipeline):
 *   1. Single Opus call: system prompt (LP fund analysis norms) + user prompt
 *      (engine-computed portfolio financials) → PortfolioRaiseSpecialistOutput
 *   2. Schema validation via Zod (5 dimensions + optional overallNarrative)
 *   3. Map each dimension to RawVerdictDimension → buildAnalystVerdict()
 *
 * v1 intentional limitations (noted in spec ADR §7):
 *   - No N+1 quant/market panels (G6-P3 upgrade path deferred)
 *   - No verdict cache (G6-P3c deferred)
 *   - Comparables are canned (no DB query — live LP dataset deferred)
 *   - rampCarryUnderstated and MAJOR-2 caveats are surfaced in prompts
 *
 * Errors throw `Tier1UnavailableError`; caller degrades to Tier-0 with
 * `meta.fallbackReason: "tier1_temporarily_unavailable"`.
 */

import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { resolveLlmFor } from "../llm-config-resolver";
import { AI_GENERATION_TIMEOUT_MS } from "../../constants";
import {
  buildPortfolioRaiseSystemPrompt,
  buildPortfolioRaiseUserPrompt,
} from "./portfolio-raise-prompt";
import {
  PortfolioRaiseSpecialistOutputSchema,
  type PortfolioRaiseSpecialistOutput,
} from "./portfolio-raise-output-schema";
import {
  PORTFOLIO_RAISE_DIMENSIONS,
  type PortfolioRaisePromptInputContext,
  type PortfolioRaiseDimensionKey,
} from "./portfolio-raise-prompt-input-builder";
import {
  buildAnalystVerdict,
  type AnalystVerdict,
  type RawVerdictDimension,
  type VerdictRange,
  type Evidence,
} from "@engine/analyst/contracts/verdict";
import {
  PORTFOLIO_RAISE_QUALITY_SCORE_HIGH,
  PORTFOLIO_RAISE_QUALITY_SCORE_MODERATE,
  PORTFOLIO_RAISE_QUALITY_SCORE_DEVELOPING,
} from "@shared/constants-funding";
import { createVoiceRenderer } from "@engine/analyst/voice/voice-renderer";

// ── LP deal comparable type (canned dataset for v1) ──────────────────────────

/** One canned LP property-fund deal, used as evidence grounding for Opus. */
export interface LpDealComparable {
  operator: string;
  vintage: number;
  vertical: string;
  propertyCount: number;
  totalEquityUsd: number;
  firstClosePct: number;
  dscrAtStabilization: number | null;
  leveredIrr: number | null;
  source: string;
  asOf: string;
}

// ── Error class ───────────────────────────────────────────────────────────────

export class Tier1UnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "Tier1UnavailableError";
  }
}

// ── Token budget ──────────────────────────────────────────────────────────────

const MAX_OUTPUT_TOKENS = 3_000;

// ── Unit mapping ──────────────────────────────────────────────────────────────

function unitForDimension(key: PortfolioRaiseDimensionKey): VerdictRange["unit"] {
  const descriptor = PORTFOLIO_RAISE_DIMENSIONS.find((d) => d.key === key);
  switch (descriptor?.unit) {
    case "usd":   return "USD";
    case "ratio": return "ratio";
    case "mo":    return "months";
    case "pct":   return "pct";
    default:      return "pct";
  }
}

// ── Comparable → Evidence ─────────────────────────────────────────────────────

function lpDealToEvidence(row: LpDealComparable): Evidence {
  const equityM = (row.totalEquityUsd / 1_000_000).toFixed(0);
  return {
    source: `LP deal: ${row.operator} (${row.vintage} ${row.vertical}, ${row.propertyCount} props, $${equityM}M equity)`,
    tier: "db_table",
    asOf: row.asOf,
    personaFit: 0.85,
  };
}

// ── Dimension mapping ─────────────────────────────────────────────────────────

/** Conviction enum → 0–100 quality score (mirrors funding runner scale). */
function convictionToQualityScore(conviction: "high" | "moderate" | "developing"): number {
  if (conviction === "high")     return PORTFOLIO_RAISE_QUALITY_SCORE_HIGH;
  if (conviction === "moderate") return PORTFOLIO_RAISE_QUALITY_SCORE_MODERATE;
  return PORTFOLIO_RAISE_QUALITY_SCORE_DEVELOPING;
}

/** User value vs range → severity. */
function deriveSeverity(
  userValue: number | null,
  range: VerdictRange,
): "ok" | "advisory" | "warning" | "block" {
  if (userValue === null) return "ok";
  if (userValue < range.low) return "warning";
  if (userValue < range.mid) return "advisory";
  return "ok";
}

function buildEvidenceForDimension(
  evidenceRefs: readonly number[],
  comparables: readonly LpDealComparable[],
): Evidence[] {
  return evidenceRefs
    .filter((idx) => idx >= 0 && idx < comparables.length)
    .map((idx) => lpDealToEvidence(comparables[idx]!));
}

function llmDimensionToRaw(
  llmDim: PortfolioRaiseSpecialistOutput["dimensions"][number],
  analysisSummary: PortfolioRaisePromptInputContext["analysisSummary"],
  comparables: readonly LpDealComparable[],
): RawVerdictDimension {
  const range: VerdictRange = {
    low: llmDim.low,
    mid: llmDim.mid,
    high: llmDim.high,
    unit: unitForDimension(llmDim.key),
  };

  // Map dimension key to a user-observable engine value for severity derivation
  let userValue: number | null = null;
  switch (llmDim.key) {
    case "totalEquityRequired": userValue = analysisSummary.totalEquityRequired; break;
    case "firstCloseMinimum":   userValue = analysisSummary.firstCloseMinimum; break;
    case "portfolioDscr":       userValue = analysisSummary.portfolioDscrBlended; break;
    case "rampCapitalBuffer":   userValue = analysisSummary.peakConcurrentRampCount; break;
    case "achievableIrr":       userValue = analysisSummary.impliedIrr; break;
  }

  return {
    field: llmDim.key,
    isNumericField: true,
    severity: deriveSeverity(userValue, range),
    range,
    qualityScore: convictionToQualityScore(llmDim.conviction),
    evidence: buildEvidenceForDimension(llmDim.evidenceRefs, comparables),
    intent: userValue === null ? "missing-data" : (userValue < range.mid ? "below-range" : "within-range"),
    actions: [],
  };
}

// ── Deps interface (for testing) ──────────────────────────────────────────────

export interface PortfolioRaiseRunnerDeps {
  now?: Date;
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Run the portfolio capital raise specialist (single-shot Opus, v1).
 *
 * Returns a complete AnalystVerdict. Throws Tier1UnavailableError on any
 * failure so the route handler can degrade to Tier-0 gracefully.
 */
export async function runPortfolioRaiseSpecialist(
  ctx: PortfolioRaisePromptInputContext,
  comparables: readonly LpDealComparable[],
  deps: PortfolioRaiseRunnerDeps = {},
): Promise<AnalystVerdict> {
  const startMs = Date.now();

  const { modelId } = await resolveLlmFor("specialist-primary");
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = buildPortfolioRaiseSystemPrompt();
  const userPrompt = buildPortfolioRaiseUserPrompt(ctx, comparables);

  let output: PortfolioRaiseSpecialistOutput;

  try {
    const result = await Promise.race([
      generateObject({
        model: anthropic(modelId),
        schema: PortfolioRaiseSpecialistOutputSchema,
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Portfolio raise specialist timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`)),
          AI_GENERATION_TIMEOUT_MS,
        ),
      ),
    ]);
    output = result.object;
  } catch (err) {
    throw new Tier1UnavailableError(
      `Portfolio raise specialist Opus call failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  const parsed = PortfolioRaiseSpecialistOutputSchema.safeParse(output);
  if (!parsed.success) {
    throw new Tier1UnavailableError(
      `Portfolio raise specialist schema validation failed: ${parsed.error.message}`,
    );
  }

  const durationMs = Date.now() - startMs;
  const voiceRenderer = createVoiceRenderer();

  const persona = {
    segment: ctx.persona.verticalSlug,
    tier: ctx.persona.marketTier,
    market: ctx.persona.locale,
  };

  const dimensions = parsed.data.dimensions.map((llmDim) => {
    const raw = llmDimensionToRaw(llmDim, ctx.analysisSummary, comparables);
    const voice = voiceRenderer.renderDimension({
      field: raw.field,
      severity: raw.severity,
      range: raw.range,
      qualityScore: raw.qualityScore,
      evidence: raw.evidence,
      intent: raw.intent,
      personaContext: persona,
      llmReasoning: llmDim.reasoning,
    });
    return {
      field: raw.field,
      isNumericField: raw.isNumericField,
      severity: raw.severity,
      range: raw.range,
      qualityScore: raw.qualityScore,
      evidence: raw.evidence,
      voice,
      actions: raw.actions,
    };
  });

  const surfaceVoice = voiceRenderer.renderSurface(dimensions);
  const cognitiveRunId = `portfolio-raise-v1-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return buildAnalystVerdict({
    specialistId: "portfolio.capital-raise",
    dimensions,
    surfaceVoice,
    meta: {
      tier: 1,
      durationMs,
      cognitiveRunId,
      vendorsUsed: ["anthropic"],
      cacheState: "miss",
    },
    generatedAt: deps.now ? deps.now.toISOString() : undefined,
  });
}
