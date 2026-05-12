/**
 * Task #1457 — Verify the Funding Specialist correctly reads the four
 * Capital Stack Discipline thresholds from globalAssumptions (now sourced
 * exclusively from the admin Capital Stack Discipline tab, having been
 * removed from the front-of-app Company Assumptions Funding card in
 * task #1400).
 *
 * The four fields under test:
 *   - runwayBufferMonths
 *   - sizingOvershootPct
 *   - revenueRampDelayMonths
 *   - burnFlexDownPct
 *
 * This is an integration-style guard at two layers:
 *
 *   1. The runner-adapter source (`analyst-admin-runners-mgmt.ts`) maps
 *      each field directly from the (overlay-resolved) globalAssumptions
 *      row into the `CapitalRaiseInputs` it hands to the prompt builder.
 *      We assert the wiring is unchanged so a future refactor cannot
 *      silently drop one of the four reads.
 *
 *   2. The prompt builder (`buildFundingUserPrompt`) surfaces each field
 *      value into the "User's currently-saved Funding-tab values" block
 *      Opus reads. A regression that drops a key from
 *      `FUNDING_DIMENSION_KEYS` would break this assertion.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildFundingPromptInput,
  type FundingPromptInputContext,
} from "../ai/specialists/mgmt-co-funding-prompt-input-builder";
import { buildFundingUserPrompt } from "../ai/specialists/mgmt-co-funding-prompt";
import type { AnalystWatchdogBenchmarks } from "@workspace/db";

const STUB_BENCHMARKS: AnalystWatchdogBenchmarks = {
  id: 1,
  userId: 1,
  runwayBufferMonthsLow: 12,
  runwayBufferMonthsMid: 18,
  runwayBufferMonthsHigh: 24,
  sizingOvershootPctLow: 0.1,
  sizingOvershootPctMid: 0.2,
  sizingOvershootPctHigh: 0.3,
  trancheGapMonthsLow: 6,
  trancheGapMonthsMid: 9,
  trancheGapMonthsHigh: 12,
  revenueRampDelayMonthsLow: 3,
  revenueRampDelayMonthsMid: 6,
  revenueRampDelayMonthsHigh: 9,
  burnFlexDownPctLow: 0.1,
  burnFlexDownPctMid: 0.15,
  burnFlexDownPctHigh: 0.25,
  lastRefreshedAt: null,
  refreshedBy: "stub",
  sourceCount: 0,
  tokensUsed: 0,
  nPlusOneEvidence: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("Funding Specialist reads Capital Stack Discipline from globalAssumptions", () => {
  it("buildFundingPromptInput surfaces all four fields under currentValues", () => {
    // Mirrors what runFundingV1Path constructs from the overlay-resolved
    // globalAssumptions row before handing to the prompt layer.
    const ctx: FundingPromptInputContext = {
      inputs: {
        runwayBufferMonths: 14,
        sizingOvershootPct: 0.22,
        trancheGapMonths: 9,
        revenueRampDelayMonths: 7,
        burnFlexDownPct: 0.18,
      },
      portfolio: {
        propertyCount: 2,
        totalRaiseNeedUsd: 5_000_000,
        runwayNeedMonths: 24,
      },
      persona: { verticalSlug: "boutique-luxury", marketTier: "L+B", locale: "US" },
    };

    const promptInput = buildFundingPromptInput(ctx);

    expect(promptInput.currentValues.runwayBufferMonths).toBe(14);
    expect(promptInput.currentValues.sizingOvershootPct).toBe(0.22);
    expect(promptInput.currentValues.revenueRampDelayMonths).toBe(7);
    expect(promptInput.currentValues.burnFlexDownPct).toBe(0.18);
  });

  it("buildFundingUserPrompt renders each field value in the saved-values block", () => {
    const ctx: FundingPromptInputContext = {
      inputs: {
        runwayBufferMonths: 14,
        sizingOvershootPct: 0.22,
        trancheGapMonths: 9,
        revenueRampDelayMonths: 7,
        burnFlexDownPct: 0.18,
      },
      portfolio: {
        propertyCount: 2,
        totalRaiseNeedUsd: 5_000_000,
        runwayNeedMonths: 24,
      },
      persona: { verticalSlug: "boutique-luxury", marketTier: "L+B", locale: "US" },
    };

    const prompt = buildFundingUserPrompt(ctx, STUB_BENCHMARKS, []);

    // The block must list every Capital Stack Discipline key by name AND
    // surface its formatted value so Opus reasons against the user's
    // admin-tab inputs rather than a generic default.
    expect(prompt).toContain("User's currently-saved Funding-tab values");
    expect(prompt).toMatch(/runwayBufferMonths:\s*14mo/);
    expect(prompt).toMatch(/sizingOvershootPct:\s*22\.0%/);
    expect(prompt).toMatch(/revenueRampDelayMonths:\s*7mo/);
    expect(prompt).toMatch(/burnFlexDownPct:\s*18\.0%/);
  });

  it("runFundingV1Path source maps each field directly from globalAssumptions", () => {
    // Source-level guard so a refactor of runFundingV1Path that drops one
    // of the four reads (or starts pulling them from a different source)
    // is caught even if no integration suite covers it. The runner uses
    // `overlaidGa` (admin-overlay-resolved global assumptions) as the one
    // and only source for these four fields.
    const path = resolve(
      __dirname,
      "../routes/analyst-admin-runners-mgmt.ts",
    );
    const source = readFileSync(path, "utf8");

    expect(source).toMatch(/runwayBufferMonths:\s*overlaidGa\.runwayBufferMonths/);
    expect(source).toMatch(/sizingOvershootPct:\s*overlaidGa\.sizingOvershootPct/);
    expect(source).toMatch(/revenueRampDelayMonths:\s*overlaidGa\.revenueRampDelayMonths/);
    expect(source).toMatch(/burnFlexDownPct:\s*overlaidGa\.burnFlexDownPct/);
  });
});
