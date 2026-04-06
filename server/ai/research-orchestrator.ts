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
 *     Reads both panels + API validation + similar past research from Pinecone.
 *     Produces final reconciled output. Model disagreement becomes the confidence band.
 *     Streams directly to client — this is what the user sees building on screen.
 *
 * The stream yields SSE-compatible events: { type, data }
 * Phase events keep the client alive during the parallel wait.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, getGeminiClient, getOpenAIClient } from "./clients";
import { generateResearchWithTools } from "./aiResearch";
import {
  AnthropicResearchClient,
  GeminiResearchClient,
  createResearchClient,
} from "./research-client";
import { buildUserPrompt, type ResearchParams } from "./research-prompt-builders";
import { loadSkill } from "./research-resources";
import { retrieveSimilarResearch, indexResearchResult, isPineconeAvailable } from "./pinecone-service";
import type { MarketIntelligence } from "../../shared/market-intelligence";
import { logger } from "../logger";

// ── Model constants ───────────────────────────────────────────────────────────

const ANALYST_A_MODEL  = "gemini-2.5-flash";
const ANALYST_B_MODEL  = "claude-sonnet-4-5";
const SYNTHESIS_MODEL  = "claude-opus-4-6";
const SYNTHESIS_TOKENS = 12_000;

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
    const output = await generateResearchWithTools(analystParams, client, model, undefined, analystV2Prompt);

    return { model, role, output, durationMs: Date.now() - start };
  } catch (err) {
    logger.warn(`Analyst panel failed (${model}): ${err instanceof Error ? err.message : err}`, "orchestrator");
    return {
      model, role,
      output: {},
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── API validation ────────────────────────────────────────────────────────────

function extractMid(obj: Record<string, any>, key: string): number | undefined {
  const v = obj?.[key];
  if (typeof v === "number") return v;
  if (typeof v?.mid === "number") return v.mid;
  if (typeof v?.value === "number") return v.value;
  if (typeof v?.recommendedRate === "string") {
    const m = v.recommendedRate.match(/([\d.]+)/);
    if (m) { const n = parseFloat(m[1]); return n > 1 ? n / 100 : n; }
  }
  if (typeof v?.recommendedRange === "string") {
    const nums = v.recommendedRange.replace(/[^0-9.,\-–]/g, " ").split(/[\s–\-]+/).map((x: string) => parseFloat(x.replace(/,/g, ""))).filter((n: number) => !isNaN(n));
    if (nums.length >= 2) return (nums[0] + nums[1]) / 2;
    if (nums.length === 1) return nums[0];
  }
  return undefined;
}

function parseStringRate(s: string): number | undefined {
  const bps = s.match(/([\d.]+)\s*(?:bps|basis\s*points?)/i);
  if (bps) return parseFloat(bps[1]) / 10000;
  const pct = s.match(/([\d.]+)\s*%/);
  if (pct) {
    const v = parseFloat(pct[1]);
    return v > 1 ? v / 100 : v;
  }
  const rangeMatch = s.match(/([\d.]+)\s*[-–]\s*([\d.]+)\s*%/);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1]);
    const high = parseFloat(rangeMatch[2]);
    const mid = (low + high) / 2;
    return mid > 1 ? mid / 100 : mid;
  }
  const dollarMatch = s.match(/\$\s*([\d,.]+)/);
  if (dollarMatch) return parseFloat(dollarMatch[1].replace(/,/g, ""));
  const plain = parseFloat(s);
  return isNaN(plain) ? undefined : plain;
}

function extractDeep(obj: Record<string, any>, dotPath: string): number | undefined {
  let cur: any = obj;
  for (const part of dotPath.split(".")) {
    if (cur && typeof cur === "object") cur = cur[part];
    else return undefined;
  }
  if (typeof cur === "number") return cur;
  if (typeof cur === "string") return parseStringRate(cur);
  if (cur && typeof cur === "object") return extractMid(cur, "mid") ?? extractMid(cur, "value");
  return undefined;
}

function divergencePct(a: number, b: number): number {
  const avg = (Math.abs(a) + Math.abs(b)) / 2;
  if (avg === 0) return 0;
  return Math.abs(a - b) / avg;
}

function compareMetric(
  name: string,
  aVal?: number,
  bVal?: number,
  apiVal?: number,
  apiSource?: string,
): MetricComparison {
  const hasA = aVal !== undefined;
  const hasB = bVal !== undefined;
  const hasBoth = hasA && hasB;
  const divPct  = hasBoth ? divergencePct(aVal!, bVal!) : undefined;
  const agree   = hasBoth && divPct !== undefined && divPct < 0.15;

  let status: MetricComparison["status"] = hasBoth
    ? (agree ? "agree" : "diverge")
    : (hasA || hasB) ? "agree" : "agree";

  const singleSided = (hasA || hasB) && !hasBoth;

  if (apiVal !== undefined) {
    const ref = hasBoth ? (aVal! + bVal!) / 2 : hasA ? aVal! : hasB ? bVal! : undefined;
    if (ref !== undefined) {
      const vsRef = divergencePct(ref, apiVal);
      if (vsRef < 0.10) status = "api-confirms";
      else if (vsRef > 0.25) status = "api-contradicts";
    }
  }

  return { metric: name, analystA: aVal, analystB: bVal, apiValue: apiVal, apiSource, status, divergencePct: divPct, singleSided };
}

export function buildApiValidation(
  panelA: AnalystPanel,
  panelB: AnalystPanel,
  mi?: MarketIntelligence,
): ApiValidationResult {
  const comparisons: MetricComparison[] = [];
  const a = panelA.output;
  const b = panelB.output;

  comparisons.push(compareMetric(
    "adr",
    extractMid(a, "adr") ?? extractDeep(a, "adrAnalysis.mid"),
    extractMid(b, "adr") ?? extractDeep(b, "adrAnalysis.mid"),
    mi?.xotelo?.adrBenchmark?.value ?? mi?.benchmarks?.adr?.value ?? mi?.costar?.adr?.value,
    mi?.xotelo ? "Xotelo OTA" : mi?.costar ? "CoStar" : mi?.benchmarks ? "CoStar/STR" : undefined,
  ));

  comparisons.push(compareMetric(
    "occupancy",
    extractMid(a, "occupancy") ?? extractDeep(a, "occupancyAnalysis.mid"),
    extractMid(b, "occupancy") ?? extractDeep(b, "occupancyAnalysis.mid"),
    mi?.benchmarks?.occupancy?.value ?? mi?.costar?.occupancyRate?.value,
    mi?.costar ? "CoStar" : mi?.benchmarks ? "CoStar/STR" : undefined,
  ));

  comparisons.push(compareMetric(
    "capRate",
    extractMid(a, "capRate") ?? extractDeep(a, "capRateAnalysis.mid"),
    extractMid(b, "capRate") ?? extractDeep(b, "capRateAnalysis.mid"),
    mi?.benchmarks?.capRate?.value ?? mi?.costar?.submarketCapRate?.value,
    mi?.costar ? "CoStar" : mi?.benchmarks ? "STR/CoStar" : undefined,
  ));

  comparisons.push(compareMetric(
    "revpar",
    extractMid(a, "revpar") ?? extractDeep(a, "revparAnalysis.mid"),
    extractMid(b, "revpar") ?? extractDeep(b, "revparAnalysis.mid"),
    mi?.benchmarks?.revpar?.value ?? mi?.costar?.revpar?.value,
    mi?.costar ? "CoStar" : mi?.benchmarks ? "CoStar/STR" : undefined,
  ));

  comparisons.push(compareMetric(
    "adrGrowth",
    extractDeep(a, "adrAnalysis.recommendedGrowthRate") ?? extractDeep(a, "adrAnalysis.annualGrowthRate"),
    extractDeep(b, "adrAnalysis.recommendedGrowthRate") ?? extractDeep(b, "adrAnalysis.annualGrowthRate"),
    mi?.costar?.rentGrowthYoY?.value ? mi.costar.rentGrowthYoY.value / 100 : undefined,
    mi?.costar?.rentGrowthYoY ? "CoStar YoY" : undefined,
  ));

  const fredInflation = mi?.rates?.cpi?.current?.value;
  comparisons.push(compareMetric(
    "inflationRate",
    extractDeep(a, "localEconomics.inflationRate") ?? extractMid(a, "inflationRate"),
    extractDeep(b, "localEconomics.inflationRate") ?? extractMid(b, "inflationRate"),
    fredInflation ? fredInflation / 100 : undefined,
    fredInflation ? "FRED CPI" : undefined,
  ));

  const fredSofr = mi?.rates?.sofr?.current?.value;
  comparisons.push(compareMetric(
    "interestRate",
    extractDeep(a, "localEconomics.interestRate") ?? extractMid(a, "interestRate"),
    extractDeep(b, "localEconomics.interestRate") ?? extractMid(b, "interestRate"),
    fredSofr ? fredSofr / 100 : undefined,
    fredSofr ? "FRED SOFR" : undefined,
  ));

  comparisons.push(compareMetric(
    "costRooms",
    extractDeep(a, "operatingCostAnalysis.roomRevenueBased.housekeeping.mid"),
    extractDeep(b, "operatingCostAnalysis.roomRevenueBased.housekeeping.mid"),
  ));

  comparisons.push(compareMetric(
    "costFB",
    extractDeep(a, "operatingCostAnalysis.roomRevenueBased.fbCostOfSales.mid"),
    extractDeep(b, "operatingCostAnalysis.roomRevenueBased.fbCostOfSales.mid"),
  ));

  comparisons.push(compareMetric(
    "costAdmin",
    extractDeep(a, "operatingCostAnalysis.totalRevenueBased.adminGeneral.mid"),
    extractDeep(b, "operatingCostAnalysis.totalRevenueBased.adminGeneral.mid"),
  ));

  comparisons.push(compareMetric(
    "costFFE",
    extractDeep(a, "operatingCostAnalysis.totalRevenueBased.ffeReserve.mid"),
    extractDeep(b, "operatingCostAnalysis.totalRevenueBased.ffeReserve.mid"),
  ));

  comparisons.push(compareMetric(
    "baseMgmtFee",
    extractDeep(a, "managementServiceFeeAnalysis.baseFee.mid") ?? extractDeep(a, "baseMgmtFee"),
    extractDeep(b, "managementServiceFeeAnalysis.baseFee.mid") ?? extractDeep(b, "baseMgmtFee"),
  ));

  const withValues = comparisons.filter(c => c.analystA !== undefined || c.analystB !== undefined);
  const dualSided = withValues.filter(c => !c.singleSided);
  const agreed = dualSided.filter(c => c.status === "agree" || c.status === "api-confirms").length;
  const consensusRatio = dualSided.length > 0 ? agreed / dualSided.length : 0;

  return { comparisons: withValues, consensusRatio };
}

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

function buildSynthesisUserPrompt(
  params: ResearchParams,
  panelA: AnalystPanel,
  panelB: AnalystPanel,
  validation: ApiValidationResult,
  priorResearch: Awaited<ReturnType<typeof retrieveSimilarResearch>>,
  v2Prompt?: string,
): string {
  const base = v2Prompt ?? buildUserPrompt(params);

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

### Similar Prior Research (from Pinecone research-history)
${formatPriorResearch(priorResearch)}

---

Now synthesize the above into a single authoritative research report JSON.`;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function* orchestrateResearch(
  params: ResearchParams,
  v2Prompt?: string,
  relaxationContext?: { researchRunId: number; userId: number; contextPack: import("./context-pack/types").PropertyContextPack },
): AsyncGenerator<OrchestratorEvent> {
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
    } catch (err) {
      yield { type: "phase", data: `Relaxation skipped: ${err instanceof Error ? err.message : "unknown error"}` };
    }
  }

  // ── Phase 1: Parallel analyst panels ──

  yield { type: "phase", data: "Launching parallel research panels…" };
  yield { type: "phase", data: `Analyst A (${ANALYST_A_MODEL}): quantitative market analysis` };
  yield { type: "phase", data: `Analyst B (${ANALYST_B_MODEL}): market strategy analysis` };

  const [panelA, panelB, priorResearch] = await Promise.all([
    runAnalystPanel(params, ANALYST_A_MODEL, "quantitative", v2Prompt),
    runAnalystPanel(params, ANALYST_B_MODEL, "market-strategy", v2Prompt),
    isPineconeAvailable()
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
  const userPrompt   = buildSynthesisUserPrompt(params, panelA, panelB, validation, priorResearch, v2Prompt);

  const anthropic = getAnthropicClient();

  const stream = anthropic.messages.stream({
    model:      SYNTHESIS_MODEL,
    max_tokens: SYNTHESIS_TOKENS,
    system:     systemPrompt,
    messages:   [{ role: "user", content: userPrompt }],
  });

  let fullContent = "";

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "content", data: event.delta.text };
      fullContent += event.delta.text;
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
  if (isPineconeAvailable() && fullContent.length > 100) {
    const summary = fullContent.slice(0, 1_500);
    indexResearchResult({
      propertyId:   params.propertyId,
      location,
      propertyType: propType,
      type:         params.type,
      summary,
      completedAt:  new Date().toISOString(),
    }).catch(err => logger.warn(`Failed to index research to Pinecone: ${err}`, "orchestrator"));
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
