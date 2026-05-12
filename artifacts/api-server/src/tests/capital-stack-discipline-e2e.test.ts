/**
 * Task #1498 — End-to-end guard: admin Capital Stack Discipline edits change
 * the Funding Specialist's verdict input and prompt.
 *
 * Covers the full chain:
 *   resolveDefault (mocked) → withFundingDefaults → applyFundingDefaultsOverlay
 *     → FundingPromptInputContext → buildFundingPromptInput (dimension input pack)
 *       → buildFundingUserPrompt (prompt Opus reads)
 *
 * Runs the chain twice with different admin-default values and asserts the
 * overlaid row, dimension input pack, and prompt all change accordingly.
 * The NULL-on-row path (all four GA columns NULL) is the primary test case
 * because it is the only case where a broken overlay path produces a silent
 * wrong value downstream.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyFundingDefaultsOverlay,
  FUNDING_DEFAULT_COLUMNS,
} from "../finance/apply-funding-defaults";
import { buildFundingUserPrompt } from "../ai/specialists/mgmt-co-funding-prompt";
import {
  buildFundingPromptInput,
  type FundingPromptInputContext,
} from "../ai/specialists/mgmt-co-funding-prompt-input-builder";
import type { AnalystWatchdogBenchmarks } from "@workspace/db";
import type { IcpModelProfile } from "@shared/constants-benchmarks";

// ── Hoisted mock state ────────────────────────────────────────────────────────

const { mockResolveDefault } = vi.hoisted(() => ({
  mockResolveDefault: vi.fn<(key: string) => Promise<number | undefined>>(),
}));

vi.mock("../defaults", () => ({
  resolveDefault: mockResolveDefault,
}));

// ── Stubs ─────────────────────────────────────────────────────────────────────

const NULL_GA = {
  runwayBufferMonths:    null as null | number,
  sizingOvershootPct:    null as null | number,
  revenueRampDelayMonths: null as null | number,
  burnFlexDownPct:       null as null | number,
  capitalRaise1Date:     null,
  capitalRaise2Date:     null,
  trancheGapMonths:      null as null | number,
};

const STUB_BENCHMARKS: AnalystWatchdogBenchmarks = {
  id: 1, userId: 1,
  runwayBufferMonthsLow: 12, runwayBufferMonthsMid: 18, runwayBufferMonthsHigh: 24,
  sizingOvershootPctLow: 0.1, sizingOvershootPctMid: 0.2, sizingOvershootPctHigh: 0.3,
  trancheGapMonthsLow: 6, trancheGapMonthsMid: 9, trancheGapMonthsHigh: 12,
  revenueRampDelayMonthsLow: 3, revenueRampDelayMonthsMid: 6, revenueRampDelayMonthsHigh: 9,
  burnFlexDownPctLow: 0.1, burnFlexDownPctMid: 0.15, burnFlexDownPctHigh: 0.25,
  lastRefreshedAt: null, refreshedBy: "stub", sourceCount: 0, tokensUsed: 0,
  nPlusOneEvidence: null, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
};

const STUB_ICP: IcpModelProfile = {
  tier: "B", label: "Highline",
  tagline: "6–12 boutique properties", story: "Stub.",
  propertyCount: { min: 6, typical: 9, max: 12 },
  rampMonths: 18, monthlyBurnUsd: 55_000, partnerCount: 3, partnerCompMonthlyUsd: 8_000,
  portfolioRevenueUsd: { min: 3_000_000, typical: 5_000_000, max: 7_000_000 },
  managementCoRevenueUsd: { min: 300_000, typical: 500_000, max: 700_000 },
  targetRaiseUsd: { min: 2_000_000, typical: 3_500_000, max: 5_000_000 },
  typicalTrancheCount: 2, trancheGapMonths: 9,
  runwayBufferMonths: 18, sizingOvershootPct: 0.25,
  revenueRampDelayMonths: 12, burnFlexDownPct: 0.20,
  simulatedProperties: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type AdminDefaults = {
  runwayBufferMonths: number;
  sizingOvershootPct: number;
  revenueRampDelayMonths: number;
  burnFlexDownPct: number;
};

function setAdminDefaults(values: AdminDefaults): void {
  const keyMap: Record<string, number> = {};
  for (const { column, defaultKey } of FUNDING_DEFAULT_COLUMNS) {
    keyMap[defaultKey] = values[column as keyof AdminDefaults];
  }
  mockResolveDefault.mockImplementation(async (key: string) => keyMap[key]);
}

function buildCtx(overlaid: typeof NULL_GA): FundingPromptInputContext {
  return {
    inputs: {
      runwayBufferMonths:    overlaid.runwayBufferMonths,
      sizingOvershootPct:    overlaid.sizingOvershootPct,
      trancheGapMonths:      9,
      revenueRampDelayMonths: overlaid.revenueRampDelayMonths,
      burnFlexDownPct:       overlaid.burnFlexDownPct,
    },
    portfolio: { propertyCount: 3, totalRaiseNeedUsd: 3_000_000, runwayNeedMonths: 24 },
    persona: { verticalSlug: "boutique-luxury", marketTier: "L+B", locale: "US" },
    icpModel: STUB_ICP,
    priorVerdicts: [],
  };
}

// ── withFundingDefaults (async DB-boundary layer) ─────────────────────────────

describe("Capital Stack Discipline e2e — withFundingDefaults layer", () => {
  beforeEach(() => { mockResolveDefault.mockReset(); });

  it("changing admin defaults produces a different overlaid row, dimension input pack, and prompt", async () => {
    const { withFundingDefaults } = await import("../finance/apply-funding-defaults");

    setAdminDefaults({ runwayBufferMonths: 14, sizingOvershootPct: 0.18, revenueRampDelayMonths: 7, burnFlexDownPct: 0.12 });
    const overlaidV1 = await withFundingDefaults(NULL_GA);

    expect(overlaidV1.runwayBufferMonths).toBe(14);
    expect(overlaidV1.sizingOvershootPct).toBe(0.18);
    expect(overlaidV1.revenueRampDelayMonths).toBe(7);
    expect(overlaidV1.burnFlexDownPct).toBe(0.12);

    const packV1 = buildFundingPromptInput(buildCtx(overlaidV1));
    expect(packV1.currentValues.runwayBufferMonths).toBe(14);
    expect(packV1.currentValues.sizingOvershootPct).toBe(0.18);
    expect(packV1.currentValues.revenueRampDelayMonths).toBe(7);
    expect(packV1.currentValues.burnFlexDownPct).toBe(0.12);

    const promptV1 = buildFundingUserPrompt(buildCtx(overlaidV1), STUB_BENCHMARKS, []);

    setAdminDefaults({ runwayBufferMonths: 22, sizingOvershootPct: 0.30, revenueRampDelayMonths: 4, burnFlexDownPct: 0.25 });
    const overlaidV2 = await withFundingDefaults(NULL_GA);

    expect(overlaidV2.runwayBufferMonths).toBe(22);
    expect(overlaidV2.sizingOvershootPct).toBe(0.30);
    expect(overlaidV2.revenueRampDelayMonths).toBe(4);
    expect(overlaidV2.burnFlexDownPct).toBe(0.25);

    const packV2 = buildFundingPromptInput(buildCtx(overlaidV2));
    expect(packV2.currentValues.runwayBufferMonths).toBe(22);
    expect(packV2.currentValues.sizingOvershootPct).toBe(0.30);
    expect(packV2.currentValues.revenueRampDelayMonths).toBe(4);
    expect(packV2.currentValues.burnFlexDownPct).toBe(0.25);

    const promptV2 = buildFundingUserPrompt(buildCtx(overlaidV2), STUB_BENCHMARKS, []);

    // Prompts must differ — cache/overlay regression makes them equal.
    expect(promptV1).not.toEqual(promptV2);

    expect(promptV1).toMatch(/runwayBufferMonths:\s*14mo/);
    expect(promptV1).toMatch(/sizingOvershootPct:\s*18\.0%/);
    expect(promptV1).toMatch(/revenueRampDelayMonths:\s*7mo/);
    expect(promptV1).toMatch(/burnFlexDownPct:\s*12\.0%/);

    expect(promptV2).toMatch(/runwayBufferMonths:\s*22mo/);
    expect(promptV2).toMatch(/sizingOvershootPct:\s*30\.0%/);
    expect(promptV2).toMatch(/revenueRampDelayMonths:\s*4mo/);
    expect(promptV2).toMatch(/burnFlexDownPct:\s*25\.0%/);

    // Cross-contamination guard.
    expect(promptV1).not.toMatch(/runwayBufferMonths:\s*22mo/);
    expect(promptV2).not.toMatch(/runwayBufferMonths:\s*14mo/);
  });

  it("withFundingDefaults calls resolveDefault once per FUNDING_DEFAULT_COLUMNS entry", async () => {
    const { withFundingDefaults } = await import("../finance/apply-funding-defaults");
    mockResolveDefault.mockResolvedValue(10);
    await withFundingDefaults(NULL_GA);
    expect(mockResolveDefault).toHaveBeenCalledTimes(FUNDING_DEFAULT_COLUMNS.length);
    for (const { defaultKey } of FUNDING_DEFAULT_COLUMNS) {
      expect(mockResolveDefault).toHaveBeenCalledWith(defaultKey);
    }
  });

  it("columns stay NULL when resolveDefault returns undefined (no admin default row)", async () => {
    const { withFundingDefaults } = await import("../finance/apply-funding-defaults");
    mockResolveDefault.mockResolvedValue(undefined);
    const overlaid = await withFundingDefaults(NULL_GA);
    expect(overlaid.runwayBufferMonths).toBeNull();
    expect(overlaid.sizingOvershootPct).toBeNull();
    expect(overlaid.revenueRampDelayMonths).toBeNull();
    expect(overlaid.burnFlexDownPct).toBeNull();
  });
});

// ── applyFundingDefaultsOverlay property-level guards (pure, no DB) ───────────

describe("Capital Stack Discipline — applyFundingDefaultsOverlay (pure layer)", () => {
  function makeMap(values: AdminDefaults): ReadonlyMap<string, unknown> {
    const map = new Map<string, unknown>();
    for (const { column, defaultKey } of FUNDING_DEFAULT_COLUMNS) {
      map.set(defaultKey, values[column as keyof AdminDefaults]);
    }
    return map;
  }

  it("existing non-NULL field values are NOT overwritten by admin defaults", () => {
    const ga = { ...NULL_GA, runwayBufferMonths: 20 as number | null };
    const overlaid = applyFundingDefaultsOverlay(
      ga,
      makeMap({ runwayBufferMonths: 12, sizingOvershootPct: 0.18, revenueRampDelayMonths: 6, burnFlexDownPct: 0.15 }),
    );
    expect(overlaid.runwayBufferMonths).toBe(20);
    expect(overlaid.sizingOvershootPct).toBe(0.18);
    expect(overlaid.revenueRampDelayMonths).toBe(6);
    expect(overlaid.burnFlexDownPct).toBe(0.15);
  });

  it("NULL columns remain NULL when the admin defaults map is empty", () => {
    const overlaid = applyFundingDefaultsOverlay(NULL_GA, new Map());
    expect(overlaid.runwayBufferMonths).toBeNull();
    expect(overlaid.sizingOvershootPct).toBeNull();
    expect(overlaid.revenueRampDelayMonths).toBeNull();
    expect(overlaid.burnFlexDownPct).toBeNull();
  });

  it("FUNDING_DEFAULT_COLUMNS has a mc.funding.* defaultKey for every entry", () => {
    expect(FUNDING_DEFAULT_COLUMNS.length).toBeGreaterThan(0);
    for (const entry of FUNDING_DEFAULT_COLUMNS) {
      expect(entry.column).toBeTruthy();
      expect(entry.defaultKey.startsWith("mc.funding.")).toBe(true);
    }
  });

  it("buildFundingUserPrompt renders all four Capital Stack Discipline keys from overlaid values", () => {
    const overlaid = applyFundingDefaultsOverlay(
      NULL_GA,
      makeMap({ runwayBufferMonths: 18, sizingOvershootPct: 0.20, revenueRampDelayMonths: 6, burnFlexDownPct: 0.15 }),
    );
    const prompt = buildFundingUserPrompt(buildCtx(overlaid as typeof NULL_GA), STUB_BENCHMARKS, []);
    expect(prompt).toContain("User's currently-saved Funding-tab values");
    expect(prompt).toMatch(/runwayBufferMonths/);
    expect(prompt).toMatch(/sizingOvershootPct/);
    expect(prompt).toMatch(/revenueRampDelayMonths/);
    expect(prompt).toMatch(/burnFlexDownPct/);
  });
});
