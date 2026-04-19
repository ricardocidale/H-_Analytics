/**
 * Research Orchestrator — N+1 parallel research synthesis.
 *
 * Architecture:
 *
 *   Phase 1 — Two analyst models run independently in parallel:
 *     Analyst A  (Gemini 2.5 Flash)   Quantitative lens: numbers, ranges, benchmarks
 *     Analyst B  (Claude Sonnet)       Market lens: narrative, risk, positioning
 *
 *   Phase 2 — API Validation:
 *     Compare analyst outputs against live market data (Xotelo, CoStar, FRED).
 *     Detect agreements, divergences, and contradictions with real data.
 *
 *   Phase 3 — Synthesis (+1, Claude Opus):
 *     Reads both panels + API validation + similar past research from Vector store.
 *     Produces final reconciled output. Model disagreement becomes the confidence band.
 *     Streams directly to client — this is what the user sees building on screen.
 *
 * The stream yields SSE-compatible events: { type, data }
 * Phase events keep the client alive during the parallel wait.
 */

import { getAnthropicClient, getGeminiClient, getOpenAIClient } from "./clients";
import { getAiSdkAnthropic } from "./ai-sdk-clients";
import { SynthesisOutputSchema } from "./synthesis-schema";
import { streamObject } from "ai";
import { generateResearchWithTools } from "./aiResearch";
import {
  createResearchClient,
} from "./research-client";
import { buildUserPrompt, type ResearchParams } from "./research-prompt-builders";
import { loadSkill } from "./research-resources";
import { retrieveSimilarResearch, indexResearchResult, isVectorStoreAvailable } from "./vector-store-service";

import { logger } from "../logger";
import { AI_GENERATION_TIMEOUT_MS } from "../constants";

// ── Model defaults (used when caller does not supply resolved overrides) ──────

const DEFAULT_ANALYST_A_MODEL  = "gemini-2.5-flash";
const DEFAULT_ANALYST_B_MODEL  = "claude-sonnet-4-5";
const DEFAULT_SYNTHESIS_MODEL  = "claude-opus-4-6";
const SYNTHESIS_TOKENS = 12_000;

export interface OrchestratorModelOverrides {
  analystAModel?: string;
  analystBModel?: string;
  synthesisModel?: string;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnalystPanel {
  model: string;
  role: "quantitative" | "market-strategy";
  output: Record<string, any>;
  durationMs: number;
  error?: string;
}

export interface MetricComparison {
  metric: string;
  analystA?: number;
  analystB?: number;
  apiValue?: number;
  apiSource?: string;
  status: "agree" | "diverge" | "api-confirms" | "api-contradicts";
  singleSided?: boolean;
  divergencePct?: number;
}

export interface ApiValidationResult {
  comparisons: MetricComparison[];
  consensusRatio: number; // 0–1: fraction of metrics where both analysts agreed
}

export type OrchestratorEvent =
  | { type: "phase";   data: string }
  | { type: "content"; data: string }
  | { type: "done";    data: string }
  | { type: "error";   data: string };

// ── Analyst panel runner ──────────────────────────────────────────────────────

function makeAnalystParams(params: ResearchParams, role: "quantitative" | "market-strategy"): ResearchParams {
  const roleInstruction =
    role === "quantitative"
      ? "\n\n[ANALYST ROLE: You are a QUANTITATIVE analyst. Focus on numbers, data ranges, benchmarks, and statistical evidence. Provide precise numeric estimates with clear ranges.]"
      : "\n\n[ANALYST ROLE: You are a MARKET STRATEGY analyst. Focus on positioning, competitive dynamics, risk factors, demand drivers, and narrative market context. Anchor your numeric estimates in comparable transactions and cited reports.]";

  return {
    ...params,
    eventConfig: {
      ...params.eventConfig,
      customInstructions: (params.eventConfig?.customInstructions ?? "") + roleInstruction,
    },
  };
}

async function runAnalystPanel(
  params: ResearchParams,
  model: string,
  role: "quantitative" | "market-strategy",
  v2Prompt?: string,
): Promise<AnalystPanel> {
  const start = Date.now();
  try {
    const vendor = model.startsWith("gemini") ? "google" : model.startsWith("gpt-") || model.startsWith("o") ? "openai" : "anthropic";
    const client = createResearchClient(vendor as ("openai" | "anthropic" | "google"), {
      anthropic: vendor === "anthropic" ? getAnthropicClient() : undefined,
      openai:    vendor === "openai"    ? getOpenAIClient()    : undefined,
      gemini:    vendor === "google"    ? getGeminiClient()    : undefined,
    });

    const analystParams = makeAnalystParams(params, role);
    const roleInstruction =
      role === "quantitative"
        ? "\n\n[ANALYST ROLE: You are a QUANTITATIVE analyst. Focus on numbers, data ranges, benchmarks, and statistical evidence.]"
        : "\n\n[ANALYST ROLE: You are a MARKET STRATEGY analyst. Focus on positioning, competitive dynamics, risk factors, demand drivers.]";
    const analystV2Prompt = v2Prompt ? v2Prompt + roleInstruction : undefined;

    const output = await Promise.race([
      generateResearchWithTools(analystParams, client, model, undefined, analystV2Prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Analyst panel timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`)), AI_GENERATION_TIMEOUT_MS),
      ),
    ]);

    return { model, role, output, durationMs: Date.now() - start };
  } catch (err: unknown) {
    logger.warn(`Analyst panel failed (${model}): ${err instanceof Error ? err.message : err}`, "orchestrator");
    return {
      model, role,
      output: {},
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── API validation (extracted to research-validation.ts) ─────────────────────
import { buildApiValidation } from "./research-validation";
export { buildApiValidation } from "./research-validation";

// ── Synthesis prompt ──────────────────────────────────────────────────────────

function formatPanelForSynthesis(panel: AnalystPanel): string {
  if (panel.error) return `[Panel failed: ${panel.error}]`;
  return JSON.stringify(panel.output, null, 2).slice(0, 12_000);
}

function formatValidationTable(v: ApiValidationResult): string {
  if (!v.comparisons.length) return "No API validation data available.";

  const rows = v.comparisons.map(c => {
    const aStr   = c.analystA !== undefined ? c.analystA.toFixed(2) : "—";
    const bStr   = c.analystB !== undefined ? c.analystB.toFixed(2) : "—";
    const apiStr = c.apiValue !== undefined ? `${c.apiValue.toFixed(2)} (${c.apiSource})` : "—";
    const pct    = c.divergencePct !== undefined ? `${(c.divergencePct * 100).toFixed(0)}% gap` : "";
    return `${c.metric}: A=${aStr} | B=${bStr} | API=${apiStr} | ${c.status.toUpperCase()} ${pct}`;
  });

  return rows.join("\n");
}

function temporalDecay(completedAt: string | undefined): number {
  if (!completedAt) return 0.5;
  const ageMs = Date.now() - new Date(completedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 30) return 1.0;
  if (ageDays <= 90) return 0.85;
  if (ageDays <= 180) return 0.65;
  if (ageDays <= 365) return 0.4;
  return 0.2;
}

function formatPriorResearch(matches: Awaited<ReturnType<typeof retrieveSimilarResearch>>): string {
  if (!matches.length) return "No similar prior research found.";
  const scored = matches
    .filter(m => m.score > 0.65)
    .map(m => {
      const decay = temporalDecay(m.metadata.completedAt as string | undefined);
      const adjustedScore = m.score * decay;
      return { ...m, adjustedScore };
    })
    .sort((a, b) => b.adjustedScore - a.adjustedScore)
    .slice(0, 5);
  if (!scored.length) return "No sufficiently relevant prior research found.";
  return scored
    .map(m => {
      const age = m.metadata.completedAt ? `completed ${m.metadata.completedAt}` : "date unknown";
      return `[Relevance: ${m.adjustedScore.toFixed(2)}, vector: ${m.score.toFixed(2)}, recency: ${temporalDecay(m.metadata.completedAt as string | undefined).toFixed(2)}] ${m.metadata.location} (${m.metadata.propertyType}, ${age}):\n${String(m.metadata.summary ?? "").slice(0, 600)}`;
    })
    .join("\n\n");
}

function buildSynthesisSystemPrompt(params: ResearchParams, singlePanelMode: boolean): string {
  const panelGuidance = singlePanelMode
    ? `You are synthesizing a SINGLE surviving analyst panel (the other panel failed). Since you have only one perspective:
- Weight API validation data more heavily to compensate for missing cross-validation.
- Default to MEDIUM confidence for metrics without API anchoring (you lack the second opinion).
- Explicitly note the single-panel limitation in your reasoning for each metric.
- Where API data is available, use it as your primary anchor and the panel as directional guidance.`
    : `You are synthesizing TWO independent analyst panels into a single authoritative research report.

Your synthesis must:
1. Where analysts AGREE (< 15% divergence): use the consensus value — assign "high" confidence.
2. Where analysts DIVERGE (≥ 15% divergence): widen the range to span both estimates — assign "low" or "medium" confidence and note the divergence explicitly.
3. Where API data CONFIRMS a value: increase confidence one level, cite the live data source.
4. Where API data CONTRADICTS analyst estimates: defer to API for real-time anchor metrics (ADR, occupancy rates, cap rates from CoStar/STR). Explain why estimates may have diverged from market data.
5. Incorporate relevant findings from similar prior research as supporting evidence — weight recent research (< 90 days) higher than older research.`;

  return loadSkill(params.type) + `

## SYNTHESIS ROLE

${panelGuidance}

## REASONING CHAIN (follow this order for EVERY metric)
1. **Anchor**: State the API/benchmark value if available — this is ground truth.
2. **Panel Evidence**: Summarize what each analyst estimated and why.
3. **Divergence Assessment**: Quantify the gap between panels (or panel vs API).
4. **Resolution**: State your synthesized value and which evidence you weighted most.
5. **Confidence Assignment**: Assign "high", "medium", or "low" based on evidence quality.

## CONFIDENCE DEFINITIONS (use these labels exactly)
- **"high"**: Multiple sources agree (<15% divergence) OR API-confirmed with strong comps.
- **"medium"**: Single reliable source, moderate comp coverage, or 15–25% divergence.
- **"low"**: Sparse data, >25% divergence, no API anchor, or stale comparables (>6 months old).

## OUTPUT FORMAT
Output the EXACT same JSON format as a standard research report — your output IS the final research.
Every numeric field must include a "display" range string, a "mid" point estimate, and a "confidence" field ("high" | "medium" | "low").
The "reasoning" field for each section must show your chain-of-thought (anchor → evidence → resolution).
Do not output any text outside the JSON code block.`;
}

async function buildSynthesisUserPrompt(
  params: ResearchParams,
  panelA: AnalystPanel,
  panelB: AnalystPanel,
  validation: ApiValidationResult,
  priorResearch: Awaited<ReturnType<typeof retrieveSimilarResearch>>,
  v2Prompt?: string,
): Promise<string> {
  const base = v2Prompt ?? await buildUserPrompt(params);

  return `${base}

---

## SYNTHESIS INPUTS

### Analyst A — Quantitative Panel (${panelA.model}, ${(panelA.durationMs / 1000).toFixed(1)}s)
${formatPanelForSynthesis(panelA)}

### Analyst B — Market Strategy Panel (${panelB.model}, ${(panelB.durationMs / 1000).toFixed(1)}s)
${formatPanelForSynthesis(panelB)}

### API Validation Results (live market data cross-check)
Consensus ratio: ${(validation.consensusRatio * 100).toFixed(0)}% of key metrics agree across models

${formatValidationTable(validation)}

### Similar Prior Research (from Vector store research-history)
${formatPriorResearch(priorResearch)}

---

Now synthesize the above into a single authoritative research report JSON.`;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function* orchestrateResearch(
  params: ResearchParams,
  v2Prompt?: string,
  relaxationContext?: { researchRunId: number; userId: number; contextPack: import("./context-pack/types").PropertyContextPack },
  modelOverrides?: OrchestratorModelOverrides,
): AsyncGenerator<OrchestratorEvent> {
  const ANALYST_A_MODEL  = modelOverrides?.analystAModel  ?? DEFAULT_ANALYST_A_MODEL;
  const ANALYST_B_MODEL  = modelOverrides?.analystBModel  ?? DEFAULT_ANALYST_B_MODEL;
  const SYNTHESIS_MODEL  = modelOverrides?.synthesisModel  ?? DEFAULT_SYNTHESIS_MODEL;

  const location    = params.propertyContext?.location ?? params.propertyContext?.market ?? "unknown";
  const propType    = params.propertyContext?.type ?? "boutique hotel";
  const mi          = params.marketIntelligence;

  // ── Phase 0: Progressive relaxation (comparable set) ──

  let compsBlock = "";
  if (relaxationContext) {
    yield { type: "phase", data: "Running progressive relaxation for comparable set…" };
    try {
      const { progressiveRelax, formatCompsForPrompt } = await import("./comparables/relaxation-engine");
      const relaxResult = await progressiveRelax({
        contextPack: relaxationContext.contextPack,
        researchRunId: relaxationContext.researchRunId,
        userId: relaxationContext.userId,
      });
      compsBlock = formatCompsForPrompt(relaxResult);
      yield { type: "phase", data: `Relaxation complete — L${relaxResult.selectedLevel}, ${relaxResult.comps.length} comparables (evidence: ${relaxResult.evidenceScore.toFixed(2)})` };

      if (v2Prompt) {
        v2Prompt = v2Prompt.replace(
          /## RESEARCH INSTRUCTIONS/,
          `${compsBlock}\n\n## RESEARCH INSTRUCTIONS`
        );
      }
    } catch (err: unknown) {
      yield { type: "phase", data: `Relaxation skipped: ${err instanceof Error ? err.message : "unknown error"}` };
    }
  }

  // ── Phase 1: Parallel analyst panels ──

  yield { type: "phase", data: "Launching parallel research panels…" };
  yield { type: "phase", data: `Analyst A (${ANALYST_A_MODEL}): quantitative market analysis` };
  yield { type: "phase", data: `Analyst B (${ANALYST_B_MODEL}): market strategy analysis` };

  let propertyUrlContext = "";
  if (params.propertyId && isVectorStoreAvailable()) {
    try {
      const { queryChunks } = await import("./vector-store-service");
      const urlChunks = await queryChunks("properties", `prop-url:${params.propertyId} property reference links ${params.propertyContext?.name || ""} ${location}`, 10)
        .then(chunks => chunks.filter(c => c.id.startsWith(`prop-url:${params.propertyId}:`)));
      if (urlChunks.length > 0) {
        propertyUrlContext = "\n\n### Property Reference URLs (validated & relevant)\n" +
          urlChunks.map(c => `- ${c.metadata?.url || ""} ${c.metadata?.title ? `(${c.metadata.title})` : ""} [relevance: ${c.score.toFixed(2)}]`).join("\n");
        yield { type: "phase", data: `Retrieved ${urlChunks.length} validated property URLs from knowledge base` };
      }
    } catch (e: unknown) {
      logger.warn(`Failed to retrieve property URLs from Vector store: ${(e instanceof Error ? e.message : String(e))}`, "research-orchestrator");
    }
  }

  const [panelA, panelB, priorResearch] = await Promise.all([
    runAnalystPanel(params, ANALYST_A_MODEL, "quantitative", v2Prompt),
    runAnalystPanel(params, ANALYST_B_MODEL, "market-strategy", v2Prompt),
    isVectorStoreAvailable()
      ? retrieveSimilarResearch(location, propType, params.type).catch(() => [])
      : Promise.resolve([]),
  ]);

  const bothFailed = !!panelA.error && !!panelB.error;
  if (bothFailed) {
    yield { type: "error", data: "ORCHESTRATOR_BOTH_FAILED: Both analyst panels failed — falling back to single-model research." };
    return;
  }

  const singlePanelMode = !!panelA.error || !!panelB.error;
  if (singlePanelMode) {
    const surviving = panelA.error ? "B" : "A";
    const failed = panelA.error ? "A" : "B";
    yield { type: "phase", data: `Panel ${failed} failed (${panelA.error || panelB.error}) — proceeding with single-panel synthesis from Panel ${surviving}` };
  }

  yield { type: "phase", data: `Panels complete — A: ${panelA.error ? "FAILED" : `${(panelA.durationMs / 1000).toFixed(1)}s`} | B: ${panelB.error ? "FAILED" : `${(panelB.durationMs / 1000).toFixed(1)}s`}` };

  // ── Phase 2: API validation ──

  yield { type: "phase", data: "Validating analyst estimates against live market data…" };

  const validation = buildApiValidation(panelA, panelB, mi);

  yield {
    type: "phase",
    data: `Validation complete — consensus on ${(validation.consensusRatio * 100).toFixed(0)}% of key metrics | ${validation.comparisons.filter(c => c.status === "api-contradicts").length} API contradictions flagged`,
  };

  if (priorResearch.length > 0) {
    yield { type: "phase", data: `Retrieved ${priorResearch.filter(m => m.score > 0.7).length} similar prior research results from memory` };
  }

  // ── Phase 3: Claude Opus synthesis ──

  yield { type: "phase", data: `Synthesizing with ${SYNTHESIS_MODEL}…` };

  const systemPrompt = buildSynthesisSystemPrompt(params, singlePanelMode);
  const baseUserPrompt = await buildSynthesisUserPrompt(params, panelA, panelB, validation, priorResearch, v2Prompt);
  const userPrompt = propertyUrlContext ? baseUserPrompt + propertyUrlContext : baseUserPrompt;

  // OT-A.3 — Synthesis path is gated by USE_AI_SDK_SYNTHESIS. Default OFF so
  // production keeps using the proven anthropic.messages.stream() path. Flip
  // ON in dev to A/B-test the Vercel-AI-SDK + AI-Gateway streamObject() path
  // that returns Zod-validated structured output (SynthesisOutputSchema).
  // Both paths preserve the OT-A.1 ephemeral cache_control on the system
  // prompt. Both yield SSE events of shape { type: "content", data: string }.
  // Both populate `fullContent` so the downstream vector-store indexing block
  // is path-agnostic. OT-A.4 will retire the legacy `else` branch once the
  // A/B parity criteria in docs/operational-tooling/OT-A-3-ab-results.md
  // are met.

  let fullContent = "";

  if (process.env.USE_AI_SDK_SYNTHESIS === "true") {
    // New path: Vercel AI SDK streamObject via AI Gateway. Returns Zod-
    // validated SynthesisOutput. We stringify each partial snapshot from
    // partialObjectStream onto the existing `content` SSE channel — the
    // shape stays compatible; OT-A.4 migrates the client to consume the
    // structured object directly.
    const result = streamObject({
      model: getAiSdkAnthropic()(SYNTHESIS_MODEL),
      schema: SynthesisOutputSchema,
      messages: [
        {
          role: "system",
          content: systemPrompt,
          providerOptions: {
            anthropic: { cacheControl: { type: "ephemeral" } },
          },
        },
        { role: "user", content: userPrompt },
      ],
      maxOutputTokens: SYNTHESIS_TOKENS,
    });

    for await (const partial of result.partialObjectStream) {
      yield { type: "content", data: JSON.stringify(partial) };
    }
    const finalObject = await result.object;
    fullContent = JSON.stringify(finalObject);

    if (process.env.DEBUG_AI_CACHING === "1") {
      try {
        const usage = await result.usage;
        const provider = (await result.providerMetadata)?.anthropic as
          | {
              cacheCreationInputTokens?: number;
              cacheReadInputTokens?: number;
            }
          | undefined;
        logger.info(
          `[cache] synthesis usage (ai-sdk): input=${usage?.inputTokens ?? 0} output=${usage?.outputTokens ?? 0} cache_create=${provider?.cacheCreationInputTokens ?? 0} cache_read=${provider?.cacheReadInputTokens ?? 0}`,
          "orchestrator",
        );
      } catch (err) {
        logger.warn(`[cache] failed to read synthesis usage (ai-sdk): ${err instanceof Error ? err.message : err}`, "orchestrator");
      }
    }
  } else {
    // Legacy path (unchanged): direct anthropic.messages.stream(). Preserves
    // OT-A.1's ephemeral cache_control on the system prompt.
    const anthropic = getAnthropicClient();
    const stream = anthropic.messages.stream({
      model:      SYNTHESIS_MODEL,
      max_tokens: SYNTHESIS_TOKENS,
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      messages:   [{ role: "user", content: userPrompt }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "content", data: event.delta.text };
        fullContent += event.delta.text;
      }
    }

    if (process.env.DEBUG_AI_CACHING === "1") {
      try {
        const finalMessage = await stream.finalMessage();
        const usage = finalMessage.usage as {
          input_tokens?: number;
          output_tokens?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        };
        logger.info(
          `[cache] synthesis usage: input=${usage.input_tokens ?? 0} output=${usage.output_tokens ?? 0} cache_create=${usage.cache_creation_input_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0}`,
          "orchestrator",
        );
      } catch (err) {
        logger.warn(`[cache] failed to read synthesis usage: ${err instanceof Error ? err.message : err}`, "orchestrator");
      }
    }
  }

  const knowledgeContributions = priorResearch
    .filter(m => m.score > 0.65)
    .map(m => {
      const decay = temporalDecay(m.metadata?.completedAt as string | undefined);
      return {
        vectorId: m.id,
        score: Math.round(m.score * 100) / 100,
        adjustedScore: Math.round(m.score * decay * 100) / 100,
        recencyWeight: Math.round(decay * 100) / 100,
        source: (m.metadata?.type as string) || "unknown",
        location: (m.metadata?.location as string) || "",
        completedAt: (m.metadata?.completedAt as string) || "",
      };
    })
    .sort((a, b) => b.adjustedScore - a.adjustedScore);

  yield {
    type: "phase",
    data: JSON.stringify({
      _orchestrator: {
        analystA:       { model: ANALYST_A_MODEL, durationMs: panelA.durationMs, error: panelA.error },
        analystB:       { model: ANALYST_B_MODEL, durationMs: panelB.durationMs, error: panelB.error },
        synthesisModel: SYNTHESIS_MODEL,
        singlePanelMode,
        consensusRatio: validation.consensusRatio,
        metricsValidated: validation.comparisons.length,
        apiContradictions: validation.comparisons.filter(c => c.status === "api-contradicts").length,
        apiValidation:  validation.comparisons,
        priorResearch:  priorResearch.length,
        knowledgeContributions,
      }
    }),
  };

  // Index synthesis result for future retrieval
  if (isVectorStoreAvailable() && fullContent.length > 100) {
    const summary = fullContent.slice(0, 1_500);
    indexResearchResult({
      propertyId:   params.propertyId,
      location,
      propertyType: propType,
      businessModel: relaxationContext?.contextPack?.classification?.businessModel,
      type:         params.type,
      summary,
      completedAt:  new Date().toISOString(),
    }).catch(err => logger.warn(`Failed to index research to Vector store: ${err}`, "orchestrator"));
  }

  yield { type: "done", data: "" };
}

/**
 * Convenience check — returns true if the N+1 orchestrator should be used.
 * Requires: Anthropic key (for Opus synthesis) + either Gemini or another Anthropic key.
 */
export function isOrchestratorAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
