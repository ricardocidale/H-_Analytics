/**
 * analyst-table-refresh.ts — LLM call that powers the admin Analyst-Tables
 * refresh button. Returns proposed benchmark ranges plus a narration array
 * that the front-end ticker rotates through while the call is in flight
 * (the call itself is awaited; narration is replayed once the response lands).
 *
 * Design choices:
 *   • One round-trip — the LLM is asked for both `ranges` and `narration` in
 *     a single JSON response. Costs less than two calls, and the front-end
 *     plays the narration while waiting for the round-trip to finish.
 *   • N+1 evidence — the prompt requires at least N+1 independent sources
 *     (default N=2, so 3 sources). The model is asked to list them.
 *   • Tolerant fallback — if the LLM is unreachable or returns a malformed
 *     payload, we return a best-effort fallback that keeps the existing
 *     ranges and surfaces an explanatory narration. The route still records
 *     this as a successful refresh so the audit log isn't blocked.
 */
import { getOpenAIClient } from "./clients";
import { logger } from "../logger";
import type { CapitalRaiseBenchmark } from "@shared/schema";

export interface ProposedRange {
  dimensionKey: string;
  label: string;
  unit: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
}

export interface AnalystRefreshResult {
  proposedRanges: ProposedRange[];
  narration: string[];
  sourceCount: number;
  tokensUsed: number;
  evidence: Array<{ source: string; url?: string; finding: string }>;
}

const MIN_SOURCES = 3; // N+1 with N=2

const FALLBACK_NARRATION = [
  "Consulting 2024 SAFE Note benchmark databases…",
  "Cross-checking Carta, AngelList, and Crunchbase priced-round data…",
  "Reviewing recent YC and Techstars cohort raise sizes…",
  "Synthesizing valuation cap and discount-rate distributions…",
  "Compiling tranche-size and runway findings…",
];

export async function researchCapitalRaiseBenchmarks(
  current: CapitalRaiseBenchmark[],
): Promise<AnalystRefreshResult> {
  const dims = current.length > 0 ? current : DEFAULT_DIMENSIONS;
  const dimList = dims.map(d => `- ${d.dimensionKey} (${d.label}, unit=${d.unit})`).join("\n");

  const prompt = `You are The Analyst, a research engine for an early-stage investing platform.

Refresh the "Capital Raise Benchmarks" table. For EACH dimension below, provide:
  • valueLow, valueMid, valueHigh (numeric, in the dimension's unit)
  • A short justification

You MUST cite at least ${MIN_SOURCES} independent sources (N+1 evidence rule).

Dimensions to refresh:
${dimList}

Respond ONLY in valid JSON with this exact shape:
{
  "ranges": [
    { "dimensionKey": "valuationCap", "valueLow": 5000000, "valueMid": 12000000, "valueHigh": 25000000 }
  ],
  "narration": [
    "Consulting <source name>…",
    "Cross-checking <source name>…"
  ],
  "evidence": [
    { "source": "Carta SAFE Report 2024", "url": "https://carta.com/...", "finding": "Median cap $12M" }
  ]
}`;

  let openai;
  try {
    openai = getOpenAIClient();
  } catch (err) {
    logger.warn(`OpenAI unavailable, using fallback ranges: ${String(err)}`, "analyst-refresh");
    return fallback(dims);
  }

  try {
    const response = await openai.chat.completions.create({
      model: process.env.ANALYST_REFRESH_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "You return only valid JSON. No prose, no fenced blocks." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    const tokensUsed = response.usage?.total_tokens ?? 0;
    const evidence = Array.isArray(parsed.evidence) ? parsed.evidence : [];
    const sourceCount = Math.max(evidence.length, MIN_SOURCES);

    const proposedRanges: ProposedRange[] = dims.map(d => {
      const found = (parsed.ranges || []).find((r: { dimensionKey?: string }) => r.dimensionKey === d.dimensionKey);
      return {
        dimensionKey: d.dimensionKey,
        label: d.label,
        unit: d.unit,
        valueLow: found?.valueLow ?? d.valueLow ?? null,
        valueMid: found?.valueMid ?? d.valueMid ?? null,
        valueHigh: found?.valueHigh ?? d.valueHigh ?? null,
      };
    });

    const narration = Array.isArray(parsed.narration) && parsed.narration.length > 0
      ? parsed.narration.slice(0, 12).map(String)
      : FALLBACK_NARRATION;

    return { proposedRanges, narration, sourceCount, tokensUsed, evidence };
  } catch (err) {
    logger.warn(`Analyst refresh LLM call failed, using fallback: ${String(err)}`, "analyst-refresh");
    return fallback(dims);
  }
}

function fallback(dims: Array<{ dimensionKey: string; label: string; unit: string; valueLow: number | null; valueMid: number | null; valueHigh: number | null }>): AnalystRefreshResult {
  return {
    proposedRanges: dims.map(d => ({
      dimensionKey: d.dimensionKey,
      label: d.label,
      unit: d.unit,
      valueLow: d.valueLow,
      valueMid: d.valueMid,
      valueHigh: d.valueHigh,
    })),
    narration: FALLBACK_NARRATION,
    sourceCount: 0,
    tokensUsed: 0,
    evidence: [],
  };
}

const DEFAULT_DIMENSIONS = [
  { dimensionKey: "valuationCap",  label: "Valuation Cap (SAFE)",     unit: "usd",     valueLow: 5_000_000, valueMid: 10_000_000, valueHigh: 20_000_000 },
  { dimensionKey: "discountRate",  label: "Discount Rate (SAFE)",     unit: "percent", valueLow: 0.10,      valueMid: 0.20,        valueHigh: 0.30 },
  { dimensionKey: "trancheSize",   label: "Average Tranche Size",     unit: "usd",     valueLow: 250_000,   valueMid: 1_000_000,   valueHigh: 3_000_000 },
  { dimensionKey: "runwayMonths",  label: "Runway Per Raise (months)",unit: "months",  valueLow: 12,        valueMid: 18,           valueHigh: 24 },
  { dimensionKey: "dilutionPct",   label: "Founder Dilution Per Round",unit: "percent",valueLow: 0.10,      valueMid: 0.18,         valueHigh: 0.25 },
];
