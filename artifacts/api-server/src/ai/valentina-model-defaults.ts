/**
 * Valentina — Model Defaults Research Specialist.
 *
 * Pure function — no DB imports, no storage imports (ADR-007). The route
 * layer fetches the relevant model_defaults rows, calls runValentinaResearch(),
 * and writes the returned proposals to proposed_* columns.
 *
 * Responsibilities:
 *   - Batch-research current industry benchmarks for eligible model_defaults rows.
 *   - Return structured ValentinaProposal[] to the caller.
 *   - Skip rows that cannot be proposed via scalar proposals (JSON-blob rows,
 *     funding sub_tab, non-benchmarkable keys).
 *   - Log LLM API cost after each call.
 *
 * Conviction mapping (string → real 0..1):
 *   "high"     → 0.9
 *   "moderate" → 0.6
 *   "low"      → 0.3
 */
import { getAnthropicClient, getOpenAIClient } from "./clients";
import { resolveLlmFor } from "./llm-config-resolver";
import { logApiCost, estimateCost } from "../middleware/cost-logger";

export const VALENTINA_LLM_SLOT = "valentina-model-defaults-research";
export const VALENTINA_ENABLED_PARAM = "valentina-enabled";

// Max tokens for the batch research response — structured JSON for N rows.
const VALENTINA_MAX_TOKENS = 4096;
// Low temperature for deterministic structured JSON output.
const VALENTINA_TEMPERATURE = 0.2;

export interface ValentinaInputRow {
  id: number;
  defaultKey: string;
  label: string | null;
  unit: string | null;
  value: unknown;
  category: string;
  subTab: string;
}

export interface ValentinaProposal {
  id: number;
  skipped: boolean;
  skipReason?: string;
  proposedValue?: number;
  proposedRangeLow?: number | null;
  proposedRangeHigh?: number | null;
  proposedAuthority?: string | null;
  proposedReferenceUrl?: string | null;
  proposedConviction?: number;
}

interface LlmProposal {
  defaultKey: string;
  proposedValue: number;
  rangeLow: number | null;
  rangeHigh: number | null;
  authority: string | null;
  referenceUrl: string | null;
  conviction: "high" | "moderate" | "low";
  reasoning: string;
  deviationFlag: boolean;
}

// Conviction → real 0..1 mapping for the proposed_conviction column.
// Calibrated: high ≥3 sources in tight agreement, moderate 2 sources or wider spread,
// low single-source or high divergence.
const CONVICTION_HIGH = 0.9;  // algorithm calibration — not a financial value
const CONVICTION_MODERATE = 0.6;
const CONVICTION_LOW = 0.3;

const CONVICTION_MAP: Record<string, number> = {
  high: CONVICTION_HIGH,
  moderate: CONVICTION_MODERATE,
  low: CONVICTION_LOW,
};

// Rows that cannot be proposed with a scalar value or where LLM research
// would produce unreliable results.
const SKIP_SUBTABS = new Set(["funding"]);
const SKIP_KEY_PATTERNS = [
  "adrByTier",  // JSON-blob tier map — requires manual research per plan
];

function isSkippable(row: ValentinaInputRow): { skip: boolean; reason?: string } {
  if (SKIP_SUBTABS.has(row.subTab)) {
    return { skip: true, reason: "funding-subtab-admin-preference" };
  }
  for (const pat of SKIP_KEY_PATTERNS) {
    if (row.defaultKey.includes(pat)) {
      return { skip: true, reason: "json-blob-row-requires-manual-research" };
    }
  }
  return { skip: false };
}

const SYSTEM_PROMPT = `You are Valentina, a hospitality-sector financial analyst.
Your task is to research current industry benchmarks for property financial assumptions used in hotel investment analysis.

For each key provided, return a structured JSON proposal with:
  - proposedValue: your best estimate of the current industry benchmark (numeric)
  - rangeLow / rangeHigh: plausible range (or null if unknown)
  - authority: primary source name (e.g., "HVS 2025 Hotel Valuation Index", "STR Host Survey Q1 2025")
  - referenceUrl: URL to the source document (or null)
  - conviction: "high" (three or more independent sources in close agreement),
                "moderate" (two sources or sources diverge moderately),
                "low" (single source, proxy data, or high divergence)
  - reasoning: one or two sentences explaining the proposed value and sources
  - deviationFlag: true if proposedValue deviates more than twenty percent from the current seed value

Constraint:
  - Return ONLY valid JSON with schema { "proposals": [...] }
  - No markdown, no preamble
  - proposedValue must be in the same unit as the input (percentage as decimal fraction if the unit contains "%" or "rate")
  - For occupancy/rate values: use decimal form (fraction, not percentage integer)
  - For growth rates: use decimal form (e.g., write three percent as the decimal fraction)
  - Cite at least two independent sources for "high" conviction
  - If research is inconclusive, return a "low" conviction proposal with your best estimate`;

export async function runValentinaResearch(
  rows: ValentinaInputRow[],
): Promise<ValentinaProposal[]> {
  const results: ValentinaProposal[] = [];

  // Partition rows into eligible and skipped.
  const eligible: ValentinaInputRow[] = [];
  for (const row of rows) {
    const { skip, reason } = isSkippable(row);
    if (skip) {
      results.push({ id: row.id, skipped: true, skipReason: reason });
    } else {
      eligible.push(row);
    }
  }

  if (eligible.length === 0) return results;

  // Build a single batched prompt for all eligible rows to reduce API cost.
  const rowDescriptions = eligible
    .map(
      (r) =>
        `- defaultKey: "${r.defaultKey}" | label: "${r.label ?? r.defaultKey}" | currentSeedValue: ${JSON.stringify(r.value)} | unit: "${r.unit ?? "raw"}"`,
    )
    .join("\n");

  const userPrompt = `Research current industry benchmarks for the following hospitality financial assumptions.
Return a JSON object with schema { "proposals": [ { "defaultKey": "...", "proposedValue": ..., "rangeLow": ..., "rangeHigh": ..., "authority": "...", "referenceUrl": ..., "conviction": "high"|"moderate"|"low", "reasoning": "...", "deviationFlag": true|false } ] }.

KEYS TO RESEARCH:
${rowDescriptions}

Return one proposal object per key in the "proposals" array. Maintain the exact defaultKey string from the input.`;

  let resolvedLlm: { vendor: string; modelId: string; modelSlug: string };
  try {
    resolvedLlm = await resolveLlmFor(VALENTINA_LLM_SLOT);
  } catch (err: unknown) {
    const reason = `llm-slot-unavailable: ${String(err)}`;
    for (const row of eligible) {
      results.push({ id: row.id, skipped: true, skipReason: reason });
    }
    return results;
  }

  let rawJson = "";
  let inputTokens = 0;
  let outputTokens = 0;
  const startMs = Date.now();

  try {
    if (resolvedLlm.vendor === "anthropic") {
      const client = getAnthropicClient();
      const response = await client.messages.create({
        model: resolvedLlm.modelId,
        max_tokens: VALENTINA_MAX_TOKENS,
        temperature: VALENTINA_TEMPERATURE,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userPrompt }],
      });
      const block = response.content.find((b) => b.type === "text");
      rawJson = block && block.type === "text" ? block.text : "{}";
      inputTokens = response.usage?.input_tokens ?? 0;
      outputTokens = response.usage?.output_tokens ?? 0;
    } else {
      // Fallback to OpenAI-compatible interface (Google/OpenAI vendors).
      const client = getOpenAIClient();
      const response = await client.chat.completions.create({
        model: resolvedLlm.modelId,
        max_tokens: VALENTINA_MAX_TOKENS,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: VALENTINA_TEMPERATURE,
      });
      rawJson = response.choices[0]?.message?.content ?? "{}";
      inputTokens = response.usage?.prompt_tokens ?? 0;
      outputTokens = response.usage?.completion_tokens ?? 0;
    }
  } catch (err: unknown) {
    const reason = `llm-call-failed: ${String(err)}`;
    for (const row of eligible) {
      results.push({ id: row.id, skipped: true, skipReason: reason });
    }
    return results;
  }

  logApiCost({
    timestamp: new Date().toISOString(),
    service: resolvedLlm.vendor,
    model: resolvedLlm.modelId,
    operation: VALENTINA_LLM_SLOT,
    inputTokens,
    outputTokens,
    estimatedCostUsd: estimateCost(resolvedLlm.vendor, resolvedLlm.modelId, inputTokens, outputTokens),
    durationMs: Date.now() - startMs,
    route: "/api/admin/model-defaults/research",
  });

  let parsed: { proposals?: unknown[] };
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    for (const row of eligible) {
      results.push({ id: row.id, skipped: true, skipReason: "parse-error" });
    }
    return results;
  }

  const proposalList = Array.isArray(parsed.proposals) ? parsed.proposals : [];

  // Index eligible rows by defaultKey for O(1) lookup.
  const eligibleByKey = new Map(eligible.map((r) => [r.defaultKey, r]));

  const resolvedKeys = new Set<string>();
  for (const p of proposalList) {
    if (!p || typeof p !== "object") continue;
    const proposal = p as Record<string, unknown>;
    const key = String(proposal["defaultKey"] ?? "");
    const row = eligibleByKey.get(key);
    if (!row) continue;

    resolvedKeys.add(key);

    const proposedValue = typeof proposal["proposedValue"] === "number" ? proposal["proposedValue"] : null;
    if (proposedValue === null) {
      results.push({ id: row.id, skipped: true, skipReason: "parse-error" });
      continue;
    }

    const convictionStr = String(proposal["conviction"] ?? "low");
    const conviction = CONVICTION_MAP[convictionStr] ?? CONVICTION_MAP["low"];

    results.push({
      id: row.id,
      skipped: false,
      proposedValue,
      proposedRangeLow: typeof proposal["rangeLow"] === "number" ? proposal["rangeLow"] : null,
      proposedRangeHigh: typeof proposal["rangeHigh"] === "number" ? proposal["rangeHigh"] : null,
      proposedAuthority: proposal["authority"] ? String(proposal["authority"]) : null,
      proposedReferenceUrl: proposal["referenceUrl"] ? String(proposal["referenceUrl"]) : null,
      proposedConviction: conviction,
    });
  }

  // Any eligible row not present in the LLM response → parse-error skip.
  for (const row of eligible) {
    if (!resolvedKeys.has(row.defaultKey)) {
      results.push({ id: row.id, skipped: true, skipReason: "missing-from-llm-response" });
    }
  }

  return results;
}
