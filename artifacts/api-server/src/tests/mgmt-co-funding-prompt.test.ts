/**
 * Funding Specialist prompt tests — guards that engine analysis is correctly
 * serialized into (or absent from) the user prompt, and that the system prompt
 * instructs Opus to treat engine data as primary grounding when available.
 */
import { describe, it, expect } from "vitest";
import {
  buildFundingSystemPrompt,
  buildFundingUserPrompt,
} from "../ai/specialists/mgmt-co-funding-prompt";
import type { FundingPromptInputContext } from "../ai/specialists/mgmt-co-funding-prompt-input-builder";
import type { AnalystWatchdogBenchmarks } from "@workspace/db";
import type { ComparableRow } from "../ai/specialists/mgmt-co-funding-orchestrator-adapter";

// ────────────────────────────────────────────────────────────────────────────
// Minimal stubs

const STUB_CTX: FundingPromptInputContext = {
  inputs: {
    runwayBufferMonths: 18,
    sizingOvershootPct: 0.2,
    trancheGapMonths: 9,
    revenueRampDelayMonths: 6,
    burnFlexDownPct: 0.15,
  },
  portfolio: { propertyCount: 2, totalRaiseNeedUsd: 5_000_000, runwayNeedMonths: 24 },
  persona: { verticalSlug: "boutique-luxury", marketTier: "L+B", locale: "US" },
};

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

const STUB_COMPARABLES: readonly ComparableRow[] = [
  {
    operator: "Boutique Group A",
    vintage: 2023,
    vertical: "boutique-luxury",
    propertyCount: 3,
    raiseUsd: 4_000_000,
    runwayBufferMonths: 18,
    sizingOvershootPct: 0.2,
    trancheGapMonths: 9,
    source: "internal",
    asOf: "2023-06-01",
  },
];

const STUB_ENGINE_ANALYSIS = {
  totalRaiseNeeded: 4_200_000,
  monthlyBurnRate: 85_000,
  breakevenMonth: 22,
  monthsOfRunway: 30,
  fundingGap: -300_000,
  peakCashDeficit: 1_800_000,
  tranches: [
    { amountUsd: 2_500_000, monthIndex: 0 },
    { amountUsd: 1_700_000, monthIndex: 9 },
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// Tests

describe("buildFundingUserPrompt", () => {
  it("includes engine analysis block when engineAnalysis is provided", () => {
    const ctx: FundingPromptInputContext = { ...STUB_CTX, engineAnalysis: STUB_ENGINE_ANALYSIS };
    const prompt = buildFundingUserPrompt(ctx, STUB_BENCHMARKS, STUB_COMPARABLES);

    expect(prompt).toContain("Engine-computed funding analysis");
    expect(prompt).toContain("4.20M"); // totalRaiseNeeded
    expect(prompt).toContain("85K/mo"); // monthlyBurnRate
    expect(prompt).toContain("month 22"); // breakevenMonth
    expect(prompt).toContain("30"); // monthsOfRunway
    expect(prompt).toContain("2.50M at month 0"); // tranche 1
    expect(prompt).toContain("1.70M at month 9"); // tranche 2
  });

  it("omits engine analysis block when engineAnalysis is absent", () => {
    const prompt = buildFundingUserPrompt(STUB_CTX, STUB_BENCHMARKS, STUB_COMPARABLES);

    expect(prompt).not.toContain("Engine-computed funding analysis");
    expect(prompt).not.toContain("primary grounding");
  });

  it("renders 'not reached' when breakevenMonth is null", () => {
    const ctx: FundingPromptInputContext = {
      ...STUB_CTX,
      engineAnalysis: { ...STUB_ENGINE_ANALYSIS, breakevenMonth: null },
    };
    const prompt = buildFundingUserPrompt(ctx, STUB_BENCHMARKS, STUB_COMPARABLES);

    expect(prompt).toContain("not reached within projection window");
  });
});

describe("buildFundingSystemPrompt", () => {
  it("instructs Opus to use engine data as primary grounding when section is present", () => {
    const prompt = buildFundingSystemPrompt();

    expect(prompt).toContain("Engine-computed funding analysis");
    expect(prompt).toContain("primary grounding");
    expect(prompt).toContain("totalRaiseNeeded");
    expect(prompt).toContain("monthlyBurnRate");
    expect(prompt).toContain("Cash Flow Statement redirect is the honest answer when the engine section is absent");
  });

  it("contains Seed, Launch, and Scale tranche archetype labels", () => {
    const prompt = buildFundingSystemPrompt();

    expect(prompt).toContain("Seed");
    expect(prompt).toContain("Launch");
    expect(prompt).toContain("Scale");
  });
});

describe("buildFundingUserPrompt — tranche comparison", () => {
  const THREE_TRANCHE_ENGINE = {
    ...STUB_ENGINE_ANALYSIS,
    tranches: [
      { amountUsd: 2_000_000, monthIndex: 0 },
      { amountUsd: 1_500_000, monthIndex: 9 },
      { amountUsd: 700_000, monthIndex: 18 },
    ],
  };

  it("shows mismatch when engine recommends 3 tranches but user configured only 2", () => {
    const ctx: FundingPromptInputContext = {
      ...STUB_CTX,
      engineAnalysis: THREE_TRANCHE_ENGINE,
      userTranches: [
        { amountUsd: 2_000_000, dateLabel: "2026-01-01" },
        { amountUsd: 1_500_000, dateLabel: "2026-10-01" },
        { amountUsd: null, dateLabel: null },
      ],
    };
    const prompt = buildFundingUserPrompt(ctx, STUB_BENCHMARKS, STUB_COMPARABLES);

    expect(prompt).toContain("(not configured)");
    expect(prompt).toContain("User-configured vs engine-recommended");
  });

  it("shows comparison block when engine and user both have 3 tranches", () => {
    const ctx: FundingPromptInputContext = {
      ...STUB_CTX,
      engineAnalysis: THREE_TRANCHE_ENGINE,
      userTranches: [
        { amountUsd: 2_000_000, dateLabel: "2026-01-01" },
        { amountUsd: 1_500_000, dateLabel: "2026-10-01" },
        { amountUsd: 700_000, dateLabel: "2027-07-01" },
      ],
    };
    const prompt = buildFundingUserPrompt(ctx, STUB_BENCHMARKS, STUB_COMPARABLES);

    expect(prompt).toContain("User-configured vs engine-recommended");
    expect(prompt).toContain("T1:");
    expect(prompt).toContain("T2:");
    expect(prompt).toContain("T3:");
  });

  it("shows single-tranche framing when engine recommends 1 tranche", () => {
    const ctx: FundingPromptInputContext = {
      ...STUB_CTX,
      engineAnalysis: { ...STUB_ENGINE_ANALYSIS, tranches: [{ amountUsd: 800_000, monthIndex: 0 }] },
      userTranches: [
        { amountUsd: 800_000, dateLabel: "2026-01-01" },
        { amountUsd: null, dateLabel: null },
        { amountUsd: null, dateLabel: null },
      ],
    };
    const prompt = buildFundingUserPrompt(ctx, STUB_BENCHMARKS, STUB_COMPARABLES);

    expect(prompt).toContain("Engine-computed funding analysis");
    expect(prompt).toContain("0.80M");
  });
});
