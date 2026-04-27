/**
 * S6 prompt review gate — live Opus call with real Anthropic key.
 * Invokes runFundingSpecialist directly (no DB, no HTTP server needed).
 * Run: npx tsx script/test-funding-v1-live.ts
 */
import { runFundingSpecialist } from "../server/ai/specialists/mgmt-co-funding-runner";
import type { FundingPromptInputContext } from "../server/ai/specialists/mgmt-co-funding-prompt-input-builder";
import type { AnalystWatchdogBenchmarks } from "@shared/schema";
import { getCannedLpComparables } from "../server/ai/specialists/mgmt-co-funding-orchestrator-adapter";

// ── Sample context — boutique-luxury hotel, Medellín Colombia ──────────────
const ctx: FundingPromptInputContext = {
  persona: {
    verticalSlug: "boutique-luxury",
    marketTier: "L+B",
    locale: "CO",
  },
  inputs: {
    runwayBufferMonths: 8,       // below typical 12-18 range → should flag advisory
    sizingOvershootPct: 0.18,    // 18% overshoot — upper edge
    trancheGapMonths: 10,        // moderate
    revenueRampDelayMonths: 6,   // 6 months to ramp
    burnFlexDownPct: 0.25,       // 25% flex down
  },
  portfolio: {
    propertyCount: 2,
    totalRaiseNeedUsd: 4_200_000,
    runwayNeedMonths: 18,
  },
  priorVerdicts: [],
};

// ── Minimal benchmark row ──────────────────────────────────────────────────
const benchmarks = {
  id: 1,
  runwayBufferMonthsLow: 10,
  runwayBufferMonthsMid: 14,
  runwayBufferMonthsHigh: 20,
  sizingOvershootPctLow: 0.10,
  sizingOvershootPctMid: 0.15,
  sizingOvershootPctHigh: 0.25,
  trancheGapMonthsLow: 6,
  trancheGapMonthsMid: 12,
  trancheGapMonthsHigh: 18,
  revenueRampDelayMonthsLow: 4,
  revenueRampDelayMonthsMid: 8,
  revenueRampDelayMonthsHigh: 14,
  burnFlexDownPctLow: 0.15,
  burnFlexDownPctMid: 0.20,
  burnFlexDownPctHigh: 0.35,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as AnalystWatchdogBenchmarks;

// Use the same canned LP comparables the production route uses.
const comparables = getCannedLpComparables();

async function main() {
  console.log("=== Funding v1 S6 live review ===");
  console.log("Persona: boutique-luxury / L+B / CO");
  console.log("Runway buffer: 8mo (BELOW typical 10-20)");
  console.log("Timeout: 120s\n");

  const start = Date.now();
  try {
    const verdict = await runFundingSpecialist(ctx, benchmarks, comparables);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`✅ Verdict received in ${elapsed}s`);
    console.log(`\n── Surface voice ──────────────────────────────`);
    console.log(`Headline: ${String(verdict.voice.headline)}`);
    if (verdict.voice.detail) console.log(`Detail:   ${String(verdict.voice.detail)}`);

    console.log(`\n── Dimensions ──────────────────────────────────`);
    for (const dim of verdict.dimensions) {
      console.log(`\n[${dim.field}] severity=${dim.severity} score=${dim.qualityScore}`);
      console.log(`  Headline: ${String(dim.voice.headline)}`);
      if (dim.voice.detail) console.log(`  Detail:   ${String(dim.voice.detail)}`);
      if (dim.range) {
        console.log(`  Range: ${dim.range.low}–${dim.range.high} ${dim.range.unit} (mid=${dim.range.mid})`);
      }
      console.log(`  Evidence: ${dim.evidence.length} items`);
    }

    console.log(`\n── Meta ────────────────────────────────────────`);
    console.log(`tier=${verdict.meta.tier}`);
    console.log(`cognitiveRunId=${verdict.meta.cognitiveRunId}`);
    console.log(`cacheState=${verdict.meta.cacheState}`);
    console.log(`overallSeverity=${verdict.overallSeverity}`);
    console.log(`overallQualityScore=${verdict.overallQualityScore}`);

    console.log("\n=== Review ===");
    console.log("Does the headline read like a Goldman Sachs research note?");
    console.log("Does the detail explain WHY with market context, not generic text?");
    console.log("Is the range specific to Colombia boutique-luxury, not a global average?");
    console.log("Is runwayBuffer flagged as advisory (8mo < 10mo floor)?");
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`❌ Failed after ${elapsed}s: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
