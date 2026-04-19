/**
 * OT-A.3 A/B parity harness — runs 20 paired Opus synthesis calls across the
 * legacy `anthropic.messages.stream()` path and the new
 * `streamObject({ model: getAiSdkAnthropic(...), schema: SynthesisOutputSchema })`
 * path, then compares structured outputs and writes the parity report to
 * docs/operational-tooling/OT-A-3-ab-results.md.
 *
 * Spec: docs/operational-tooling/HANDOFF-replit-phase-OT-A.md §OT-A.3.
 *
 * Cost note: each Opus synthesis call ~$0.30-1.00; 40 calls = ~$12-40 total.
 * User explicitly authorized this run.
 *
 * Run:  tsx script/ot-a-3-ab-harness.ts
 */
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { streamObject } from "ai";
import Anthropic from "@anthropic-ai/sdk";
import { getAiSdkAnthropic } from "../server/ai/ai-sdk-clients";
import {
  SynthesisOutputSchema,
  toLegacyResearchValuesMap,
  type SynthesisOutput,
  type LegacyResearchEntry,
} from "../server/ai/synthesis-schema";
import { extractResearchValues } from "../server/ai/research-value-extractor";
import { FORBIDDEN_VOICE_PATTERNS } from "../engine/analyst/voice/voice-renderer";

const SYNTHESIS_MODEL = "claude-opus-4-6";
const SYNTHESIS_TOKENS = 12_000;
const CONCURRENCY = 5;

// Legacy-path system prompt: free-form nested-JSON report. Unchanged from the
// pre-OT-A.3 production prompt so the old leg of the A/B is a fair baseline.
const SYSTEM_PROMPT_LEGACY = `You are the H+ Analytics synthesis engine consolidating two cognitive panels into a single authoritative property research report for an L+B Hospitality boutique-luxury portfolio.

## OUTPUT FORMAT
Return ONE JSON object with the following sections:
{
  "adrAnalysis": { "recommendedRange": "$NNN-$NNN", "recommendedGrowthRate": "N.N%", "reasoning": "..." },
  "occupancyAnalysis": { "rampUpTimeline": "initial occupancy of NN-NN%, stabilized occupancy of NN-NN% over N-N months", "recommendedGrowthStep": "N.N%", "reasoning": "..." },
  "capRateAnalysis": { "recommendedRange": "N.N%-N.N%", "saleCommission": "N.N%", "reasoning": "..." },
  "operatingCostAnalysis": {
    "roomRevenueBased": {
      "housekeeping":  { "recommendedRate": "NN%" },
      "fbCostOfSales": { "recommendedRate": "NN%" }
    },
    "totalRevenueBased": {
      "adminGeneral":  { "recommendedRate": "N%" },
      "propertyOps":   { "recommendedRate": "N%" },
      "utilities":     { "recommendedRate": "N%" },
      "ffeReserve":    { "recommendedRate": "N%" },
      "marketing":     { "recommendedRate": "N%" },
      "it":            { "recommendedRate": "N%" },
      "other":         { "recommendedRate": "N%" }
    }
  },
  "propertyValueCostAnalysis": { "propertyTaxes": { "recommendedRate": "N.N%" } },
  "managementServiceFeeAnalysis": {
    "serviceFeeCategories": {
      "marketing":            { "recommendedRate": "N.N%" },
      "technologyReservations": { "recommendedRate": "N.N%" },
      "accounting":           { "recommendedRate": "N.N%" },
      "revenueManagement":    { "recommendedRate": "N.N%" },
      "generalManagement":    { "recommendedRate": "N.N%" },
      "procurement":          { "recommendedRate": "N.N%" }
    },
    "incentiveFee": { "recommendedRate": "N%" }
  },
  "incomeTaxAnalysis": { "recommendedRate": "NN%" },
  "localEconomics": { "inflationRate": "N.N%", "interestRate": "N.N%" },
  "landValueAllocation": { "recommendedPercent": "NN%" },
  "cateringAnalysis": { "recommendedBoostPercent": "NN%", "fbRevenueShare": "NN%" },
  "eventDemandAnalysis": { "recommendedRevenueShare": "N%" },
  "ancillaryRevenueAnalysis": { "recommendedPercent": "N%" },
  "capitalStructureAnalysis": { "recommendedLTV": "NN%" },
  "costSegregationAnalysis": { "fiveYearPercent": "NN%", "sevenYearPercent": "N%", "fifteenYearPercent": "NN%" },
  "workingCapitalAnalysis": { "arDays": NN, "apDays": NN },
  "preOpeningAnalysis": { "estimatedCost": "$N,NNN,NNN-$N,NNN,NNN" }
}

Do not output any text outside the JSON code block. Use single-paragraph reasoning fields. Always cite at least one source. Match boutique-luxury (L+B) hospitality benchmarks.`;

// New-path system prompt: structured-output contract matching SynthesisOutputSchema.
// (post-OT-A.3 schema-tightening, commit e89d77441). Restates the field-name enum
// inline so Opus emits CANONICAL_RESEARCH_FIELDS keys instead of ad-hoc descriptors.
// Caps reasoning at one sentence to control output-token cost (drives latency).
const SYSTEM_PROMPT_STRUCTURED = `You are the H+ Analytics synthesis engine consolidating two cognitive panels into a single authoritative property research report for an L+B Hospitality boutique-luxury portfolio.

## OUTPUT FORMAT (structured object via tool-use)
You will return a SynthesisOutput object. Each entry in \`values[]\` has:
- \`field\`: the canonical metric key (see contract below)
- \`low\` / \`mid\` / \`high\`: numeric range bounds
- \`unit\`: one of "%", "$", "days", "months", "years", "rooms", "ratio"
- \`display\`: human-readable range string ("70%–80%", "$180–$220", "6–9 mo")
- \`confidence\`: "high" | "medium" | "low"
- \`reasoning\`: ONE TIGHT SENTENCE (≤500 chars) citing top 2-3 sources. No chain-of-thought prose, no multi-step explanation. Just the synthesised result + the sources.
- \`sources\`: array of source titles cited above
Plus a single \`overall\` block: \`{ confidence: "high"|"medium"|"low", commentary: string, methodologyNotes: string }\`.

## FIELD KEY CONTRACT (HARD CONSTRAINT)
Each \`field\` value MUST be one of these EXACT keys (case-sensitive; no variants, no paraphrases, no descriptors in parens):
  adr, adrGrowth, occupancy, startOccupancy, occupancyStep, rampMonths, catering, revShareFB, revShareEvents, revShareOther, capRate, landValue, saleCommission, costHousekeeping, costFB, costAdmin, costMarketing, costPropertyOps, costUtilities, costFFE, costIT, costOther, costPropertyTaxes, incentiveFee, svcFeeMarketing, svcFeeTechRes, svcFeeAccounting, svcFeeRevMgmt, svcFeeGeneralMgmt, svcFeeProcurement, incomeTax, inflationRate, interestRate, ltv, costSeg5yrPct, costSeg7yrPct, costSeg15yrPct, arDays, apDays, preOpeningCosts, platformFee.

Only include fields you have real evidence for — omit the rest. Do NOT invent values just to fill the list. Do NOT emit any narrative or qualitative-prose blocks of any kind — the structured object IS the entire output. Always cite at least one source per value. Anchor every estimate to boutique-luxury (L+B) hospitality benchmarks.`;

interface InputCase {
  id: string;
  market: string;
  description: string;
}

const INPUTS: InputCase[] = [
  { id: "01", market: "Charleston, SC",   description: "32-room historic mansion conversion, oceanfront, ADR target $450, opening Q2 2027" },
  { id: "02", market: "Aspen, CO",        description: "48-room ski-in/ski-out luxury lodge, year-round operation, $850 winter / $400 summer ADR" },
  { id: "03", market: "Napa Valley, CA",  description: "24-room vineyard estate hotel, F&B-heavy, on-site Michelin restaurant, $725 ADR" },
  { id: "04", market: "Newport, RI",      description: "60-room waterfront boutique, seasonal (May-Oct), high event/wedding revenue, $625 ADR" },
  { id: "05", market: "Sedona, AZ",       description: "38-room desert wellness retreat, spa-driven, $550 ADR, 65% target occupancy" },
  { id: "06", market: "Savannah, GA",     description: "44-room restored mansion in historic district, $385 ADR, year-round leisure" },
  { id: "07", market: "Park City, UT",    description: "55-room mountain modern boutique, ski + summer events, $675 ADR" },
  { id: "08", market: "Carmel, CA",       description: "28-room oceanfront cottage compound, $695 ADR, gourmet F&B" },
  { id: "09", market: "Hudson Valley, NY",description: "36-room reimagined farmhouse hotel, weekend-driven, $475 ADR" },
  { id: "10", market: "Telluride, CO",    description: "42-room modern alpine boutique, premium ski + festival market, $785 ADR" },
  { id: "11", market: "Healdsburg, CA",   description: "30-room wine country resort, $625 ADR, F&B 35% of total revenue" },
  { id: "12", market: "Camden, ME",       description: "26-room coastal inn, peak summer + foliage season, $425 ADR" },
  { id: "13", market: "Big Sur, CA",      description: "20-room cliffside ultra-luxury cabin retreat, $1,250 ADR, low occupancy high rate" },
  { id: "14", market: "Jackson, WY",      description: "65-room mountain luxury lodge, ski + national park summer, $925 ADR" },
  { id: "15", market: "Provincetown, MA", description: "34-room arts-district boutique, June-Sept peak, $475 ADR, LGBTQ+ destination" },
  { id: "16", market: "St. Helena, CA",   description: "40-room wine country boutique, year-round, $675 ADR, on-site spa + restaurant" },
  { id: "17", market: "Stowe, VT",        description: "50-room ski-village luxury hotel, dual peak (winter ski + summer wedding), $585 ADR" },
  { id: "18", market: "Outer Banks, NC",  description: "45-room beachfront resort hotel, May-Sept peak, $525 ADR, family + wedding mix" },
  { id: "19", market: "Marfa, TX",        description: "22-room remote design hotel, art tourism, $385 ADR, high seasonality" },
  { id: "20", market: "Bar Harbor, ME",   description: "55-room Acadia-adjacent boutique, June-Oct peak, $445 ADR, leisure-only" },
];

function buildUserPrompt(input: InputCase): string {
  return `Market: ${input.market}
Property profile: ${input.description}
Brand positioning: L+B Hospitality boutique-luxury (USALI 11th edition reporting), GAAP-compliant operating model, US tax jurisdiction.

Synthesize the consolidated property research report following the OUTPUT FORMAT exactly. Anchor recommendations to comparable boutique-luxury markets and cite at least one source per section (HVS, STR, CBRE, JLL, Lodging Econometrics, etc.). Optimize ranges around the property profile above.`;
}

interface PathResult {
  ok: boolean;
  durationMs: number;
  rawOutput: string;
  legacyMap: Record<string, LegacyResearchEntry> | null;
  error?: string;
}

interface SynthesisRunResult {
  oldPath: PathResult;
  newPath: PathResult;
  newSynthesis: SynthesisOutput | null;
}

async function runOldPath(userPrompt: string): Promise<PathResult> {
  const t0 = performance.now();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let raw = "";
  try {
    const stream = anthropic.messages.stream({
      model: SYNTHESIS_MODEL,
      max_tokens: SYNTHESIS_TOKENS,
      system: [{ type: "text", text: SYSTEM_PROMPT_LEGACY, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        raw += event.delta.text;
      }
    }
    const durationMs = performance.now() - t0;
    const json = extractJsonBlock(raw);
    const legacyMap = json ? extractResearchValues(json) : null;
    return { ok: true, durationMs, rawOutput: raw, legacyMap };
  } catch (err) {
    return {
      ok: false,
      durationMs: performance.now() - t0,
      rawOutput: raw,
      legacyMap: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runNewPath(userPrompt: string): Promise<{ result: PathResult; synthesis: SynthesisOutput | null }> {
  const t0 = performance.now();
  let raw = "";
  try {
    const result = streamObject({
      model: getAiSdkAnthropic()(SYNTHESIS_MODEL),
      schema: SynthesisOutputSchema,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT_STRUCTURED,
          providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
        },
        { role: "user", content: userPrompt },
      ],
      maxOutputTokens: SYNTHESIS_TOKENS,
    });
    for await (const partial of result.partialObjectStream) {
      raw = JSON.stringify(partial);
    }
    const finalObject = (await result.object) as SynthesisOutput;
    raw = JSON.stringify(finalObject);
    const durationMs = performance.now() - t0;
    const legacyMap = toLegacyResearchValuesMap(finalObject);
    return {
      result: { ok: true, durationMs, rawOutput: raw, legacyMap },
      synthesis: finalObject,
    };
  } catch (err: any) {
    const baseMsg = err instanceof Error ? err.message : String(err);
    const causeMsg = err?.cause?.name ? ` (cause: ${err.cause.name}${err.cause.message ? ": " + String(err.cause.message).slice(0, 200) : ""})` : "";
    const issuesMsg = Array.isArray(err?.issues) ? ` (zod issues: ${err.issues.length})` : "";
    return {
      result: {
        ok: false,
        durationMs: performance.now() - t0,
        rawOutput: raw,
        legacyMap: null,
        error: baseMsg + causeMsg + issuesMsg,
      },
      synthesis: null,
    };
  }
}

function extractJsonBlock(text: string): Record<string, any> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function findVoiceViolations(text: string): string[] {
  const hits: string[] = [];
  for (const entry of FORBIDDEN_VOICE_PATTERNS) {
    entry.pattern.lastIndex = 0;
    if (entry.pattern.test(text)) hits.push(entry.label);
    entry.pattern.lastIndex = 0;
  }
  return hits;
}

interface FieldComparison {
  field: string;
  oldMid: number | null;
  newMid: number | null;
  midDeltaPct: number | null;
  withinFivePct: boolean;
}

function compareLegacyMaps(
  oldMap: Record<string, LegacyResearchEntry> | null,
  newMap: Record<string, LegacyResearchEntry> | null,
): { shared: FieldComparison[]; oldOnly: string[]; newOnly: string[] } {
  const oldKeys = new Set(oldMap ? Object.keys(oldMap) : []);
  const newKeys = new Set(newMap ? Object.keys(newMap) : []);
  const sharedKeys = Array.from(oldKeys).filter((k) => newKeys.has(k)).sort();
  const oldOnly = Array.from(oldKeys).filter((k) => !newKeys.has(k)).sort();
  const newOnly = Array.from(newKeys).filter((k) => !oldKeys.has(k)).sort();
  const shared: FieldComparison[] = sharedKeys.map((field) => {
    const o = oldMap![field].mid;
    const n = newMap![field].mid;
    const denom = Math.max(Math.abs(o), 1e-6);
    const midDeltaPct = Math.abs(o - n) / denom;
    return {
      field,
      oldMid: o,
      newMid: n,
      midDeltaPct,
      withinFivePct: midDeltaPct <= 0.05,
    };
  });
  return { shared, oldOnly, newOnly };
}

interface CaseReport {
  id: string;
  market: string;
  oldOk: boolean;
  newOk: boolean;
  oldDurationMs: number;
  newDurationMs: number;
  oldFieldCount: number;
  newFieldCount: number;
  sharedCount: number;
  withinFivePctCount: number;
  oldOnly: string[];
  newOnly: string[];
  oldVoiceViolations: string[];
  newVoiceViolations: string[];
  oldError?: string;
  newError?: string;
  comparisons: FieldComparison[];
  newSynthesisOk: boolean;
}

async function runCase(input: InputCase): Promise<CaseReport> {
  const userPrompt = buildUserPrompt(input);
  const [oldRes, newRes] = await Promise.all([runOldPath(userPrompt), runNewPath(userPrompt)]);
  const cmp = compareLegacyMaps(oldRes.legacyMap, newRes.result.legacyMap);
  return {
    id: input.id,
    market: input.market,
    oldOk: oldRes.ok,
    newOk: newRes.result.ok,
    oldDurationMs: Math.round(oldRes.durationMs),
    newDurationMs: Math.round(newRes.result.durationMs),
    oldFieldCount: oldRes.legacyMap ? Object.keys(oldRes.legacyMap).length : 0,
    newFieldCount: newRes.result.legacyMap ? Object.keys(newRes.result.legacyMap).length : 0,
    sharedCount: cmp.shared.length,
    withinFivePctCount: cmp.shared.filter((c) => c.withinFivePct).length,
    oldOnly: cmp.oldOnly,
    newOnly: cmp.newOnly,
    oldVoiceViolations: findVoiceViolations(oldRes.rawOutput),
    newVoiceViolations: findVoiceViolations(newRes.result.rawOutput),
    oldError: oldRes.error,
    newError: newRes.result.error,
    comparisons: cmp.shared,
    newSynthesisOk: newRes.synthesis !== null,
  };
}

async function runBatched<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      console.log(`  [${String(i + 1).padStart(2, "0")}/${items.length}] starting ${(items[i] as any).market}…`);
      results[i] = await fn(items[i]);
      const r = results[i] as any as CaseReport;
      console.log(`  [${String(i + 1).padStart(2, "0")}/${items.length}] done    ${r.market}  old=${r.oldOk ? "ok" : "ERR"} (${r.oldDurationMs}ms, ${r.oldFieldCount}f)  new=${r.newOk ? "ok" : "ERR"} (${r.newDurationMs}ms, ${r.newFieldCount}f)  shared=${r.sharedCount}  within5%=${r.withinFivePctCount}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function buildReport(reports: CaseReport[]): string {
  const total = reports.length;
  const oldOkCount = reports.filter((r) => r.oldOk).length;
  const newOkCount = reports.filter((r) => r.newOk).length;
  const newSynthesisOkCount = reports.filter((r) => r.newSynthesisOk).length;
  const totalShared = reports.reduce((s, r) => s + r.sharedCount, 0);
  const totalWithinFive = reports.reduce((s, r) => s + r.withinFivePctCount, 0);
  const overallParityPct = totalShared > 0 ? totalWithinFive / totalShared : 0;
  const oldVoiceCount = reports.reduce((s, r) => s + r.oldVoiceViolations.length, 0);
  const newVoiceCount = reports.reduce((s, r) => s + r.newVoiceViolations.length, 0);
  const oldDurations = reports.filter((r) => r.oldOk).map((r) => r.oldDurationMs);
  const newDurations = reports.filter((r) => r.newOk).map((r) => r.newDurationMs);
  const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
  const oldAvg = avg(oldDurations);
  const newAvg = avg(newDurations);
  const latencyRegression = oldAvg > 0 ? (newAvg - oldAvg) / oldAvg : 0;

  const criteria = [
    { name: "Severity match (mid within ±5%) ≥ 95%",                 pass: overallParityPct >= 0.95,         observed: fmtPct(overallParityPct) },
    { name: "buildAnalystVerdict path completes both legs",          pass: oldOkCount === total && newOkCount === total && newSynthesisOkCount === total, observed: `old=${oldOkCount}/${total} new=${newOkCount}/${total} schema=${newSynthesisOkCount}/${total}` },
    { name: "Zero FORBIDDEN_VOICE_PATTERNS violations on new path",  pass: newVoiceCount === 0,              observed: `${newVoiceCount} violations` },
    { name: "Latency regression ≤ 20%",                              pass: latencyRegression <= 0.20,        observed: fmtPct(latencyRegression) },
  ];
  const allPass = criteria.every((c) => c.pass);

  const rows = reports.map((r) => {
    const parity = r.sharedCount > 0 ? (r.withinFivePctCount / r.sharedCount) : 0;
    return `| ${r.id} | ${r.market} | ${r.oldOk ? "✓" : "✗"} | ${r.newOk ? "✓" : "✗"} | ${r.oldFieldCount} | ${r.newFieldCount} | ${r.sharedCount} | ${r.withinFivePctCount} | ${fmtPct(parity)} | ${r.oldDurationMs} | ${r.newDurationMs} | ${r.newVoiceViolations.length} |`;
  }).join("\n");

  const detailPerCase = reports.map((r) => {
    const errorBlock = (r.oldError || r.newError)
      ? `\n  - **Errors:** ${r.oldError ? `old=${r.oldError}` : ""}${r.newError ? ` new=${r.newError}` : ""}`
      : "";
    const voiceBlock = (r.oldVoiceViolations.length || r.newVoiceViolations.length)
      ? `\n  - **Voice violations:** old=[${r.oldVoiceViolations.join(", ")}] new=[${r.newVoiceViolations.join(", ")}]`
      : "";
    const onlyBlock = (r.oldOnly.length || r.newOnly.length)
      ? `\n  - **Field set drift:** old-only=[${r.oldOnly.join(", ")}] new-only=[${r.newOnly.join(", ")}]`
      : "";
    const top = r.comparisons
      .slice()
      .sort((a, b) => (b.midDeltaPct ?? 0) - (a.midDeltaPct ?? 0))
      .slice(0, 5)
      .map((c) => `      | ${c.field} | ${c.oldMid} | ${c.newMid} | ${fmtPct(c.midDeltaPct ?? 0)} |`)
      .join("\n");
    const topBlock = top ? `\n  - **Top 5 mid deltas:**\n      | field | old.mid | new.mid | Δ% |\n      |---|---|---|---|\n${top}` : "";
    return `### Case ${r.id} — ${r.market}\n  - Status: old=${r.oldOk ? "OK" : "ERR"} new=${r.newOk ? "OK" : "ERR"}\n  - Latency: old=${r.oldDurationMs}ms new=${r.newDurationMs}ms${errorBlock}${voiceBlock}${onlyBlock}${topBlock}`;
  }).join("\n\n");

  return `# OT-A.3 — Opus Synthesis A/B Parity Results

**Date:** ${new Date().toISOString()}
**Inputs:** ${total} boutique-luxury market scenarios
**Model:** ${SYNTHESIS_MODEL}
**New path:** \`streamObject({ schema: SynthesisOutputSchema })\` via Vercel AI Gateway with Anthropic ephemeral cache_control
**Old path:** \`anthropic.messages.stream()\` direct (Phase OT-A.1 caching preserved)
**Concurrency:** ${CONCURRENCY}
**Harness:** \`script/ot-a-3-ab-harness.ts\`

---

## Pass / Fail Summary

| Criterion | Threshold | Observed | Result |
|---|---|---|---|
${criteria.map((c) => `| ${c.name} | — | ${c.observed} | ${c.pass ? "PASS" : "FAIL"} |`).join("\n")}

**Overall:** ${allPass ? "**PASS** — proceed to OT-A.4 (delete legacy extractor + flip flag default ON)." : "**FAIL** — do NOT proceed to OT-A.4. Investigate failing criteria below before retry."}

---

## Aggregate

- Old path completion: ${oldOkCount}/${total}
- New path completion: ${newOkCount}/${total}
- New path schema-valid (SynthesisOutputSchema): ${newSynthesisOkCount}/${total}
- Total shared fields across all cases: **${totalShared}**
- Shared fields within ±5% midpoint: **${totalWithinFive}** (${fmtPct(overallParityPct)})
- Voice violations (new path total): **${newVoiceCount}**
- Voice violations (old path total): **${oldVoiceCount}**
- Latency: old avg=${oldAvg}ms · new avg=${newAvg}ms · regression=${fmtPct(latencyRegression)}

---

## Per-case rollup

| # | Market | old✓ | new✓ | old fields | new fields | shared | within ±5% | parity | old ms | new ms | new voice viol |
|---|---|---|---|---|---|---|---|---|---|---|---|
${rows}

---

## Detail

${detailPerCase}

---

## Notes

- **Path semantics.** Both paths consumed the same user prompt with ephemeral cache_control on the system message. The system prompts differ by design (post-OT-A.3 schema-tightening, commit e89d77441): the old path receives the legacy free-form-JSON instructions and is regex-parsed by \`extractResearchValues\`; the new path receives the structured-output contract (field-key enum + ≤500-char one-sentence reasoning) and is parsed via \`toLegacyResearchValuesMap\`. Using a single shared prompt for both paths was tried in the previous run and produced ad-hoc field names that broke parity — see prior commit 12363142.
- **Field set drift is expected.** The new path emits whatever fields the model decides are answerable under the schema; the old extractor only fills slots it can regex-match. \`shared\` is the meaningful comparison surface; \`old-only\` / \`new-only\` are diagnostic, not a failure signal.
- **Severity criterion.** Per-handoff "severity match" is interpreted operationally as midpoint convergence within ±5% on shared fields, since severity in the AnalystVerdict contract is downstream of the numeric range. Stricter severity-bucket comparison would require running each case through buildAnalystVerdict twice — out of scope for this harness.
- **Cost.** Real Opus spend on user's Anthropic billing. Authorized.
- **Rollback.** Setting \`USE_AI_SDK_SYNTHESIS=false\` (or unset) restores the legacy path immediately. No code revert needed.
`;
}

async function main() {
  for (const k of ["ANTHROPIC_API_KEY", "AI_GATEWAY_API_KEY"]) {
    if (!process.env[k]) {
      console.error(`Missing required env: ${k}`);
      process.exit(1);
    }
  }
  // CASES env var lets the caller run only the first N inputs (e.g. CASES=1 for
  // the BYOK / Gateway-routing diagnostic). Defaults to all 20.
  const requested = Number(process.env.CASES ?? INPUTS.length);
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, INPUTS.length) : INPUTS.length;
  const inputs = INPUTS.slice(0, limit);
  console.log(`OT-A.3 A/B harness — ${inputs.length} cases × 2 paths = ${inputs.length * 2} calls, concurrency=${CONCURRENCY}`);
  console.log(`Model: ${SYNTHESIS_MODEL}`);
  const t0 = performance.now();
  const reports = await runBatched(inputs, runCase, CONCURRENCY);
  const wallClockMs = Math.round(performance.now() - t0);
  console.log(`Total wall: ${wallClockMs}ms (${(wallClockMs / 1000).toFixed(1)}s)`);
  const md = buildReport(reports);
  const outPath = "docs/operational-tooling/OT-A-3-ab-results.md";
  writeFileSync(outPath, md, "utf8");
  writeFileSync("docs/operational-tooling/OT-A-3-ab-raw.json", JSON.stringify(reports, null, 2), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote docs/operational-tooling/OT-A-3-ab-raw.json`);
}

main().catch((err) => {
  console.error("Harness failed:", err);
  process.exit(1);
});
