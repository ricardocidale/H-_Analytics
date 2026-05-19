/**
 * End-to-end unit tests for runValentinaResearch.
 *
 * All external dependencies are mocked — no live DB, no live LLM.
 *
 * Coverage:
 *   - Skip logic: funding subTab rows, adrByTier key pattern rows
 *   - LLM slot unavailable → all eligible rows skipped with reason prefix
 *   - Anthropic vendor path: happy path + call-failed path
 *   - OpenAI vendor path: happy path
 *   - Parse error (malformed JSON, non-numeric proposedValue)
 *   - No proposals key in response
 *   - Rows missing from LLM response → missing-from-llm-response skip
 *   - Conviction mapping: high → 0.9, moderate → 0.6, low → 0.3, unknown → 0.3
 *   - All rows skipped → no LLM call made
 *   - Null range / authority fields accepted
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ── Module mocks ─────────────────────────────────────────────────────────────
// Factories use inline vi.fn() — external variable refs in vi.mock factories
// are in TDZ when the hoisted factory executes.

vi.mock("../ai/clients", () => ({
  getAnthropicClient: vi.fn(),
  getOpenAIClient: vi.fn(),
}));

vi.mock("../ai/llm-config-resolver", () => ({
  resolveLlmFor: vi.fn(),
}));

vi.mock("../middleware/cost-logger", () => ({
  logApiCost: vi.fn(),
  estimateCost: vi.fn().mockReturnValue(0),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { runValentinaResearch } from "../ai/valentina-model-defaults";
import type { ValentinaInputRow } from "../ai/valentina-model-defaults";
import { getAnthropicClient, getOpenAIClient } from "../ai/clients";
import { resolveLlmFor } from "../ai/llm-config-resolver";

const mockResolveLlmFor = vi.mocked(resolveLlmFor);
const mockGetAnthropicClient = vi.mocked(getAnthropicClient);
const mockGetOpenAIClient = vi.mocked(getOpenAIClient);

// ── LLM stub shapes ────────────────────────────────────────────────────────────

const mockAnthropicCreate = vi.fn();
const mockOpenAICreate = vi.fn();

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<ValentinaInputRow> = {}): ValentinaInputRow {
  return {
    id: 1,
    defaultKey: "occupancyRate",
    label: "Occupancy Rate",
    unit: "rate",
    value: 0.65,
    category: "operations",
    subTab: "revenue",
    ...overrides,
  };
}

function anthropicResponse(proposals: object[]): object {
  return {
    content: [{ type: "text", text: JSON.stringify({ proposals }) }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

function openaiResponse(proposals: object[]): object {
  return {
    choices: [{ message: { content: JSON.stringify({ proposals }) } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
}

function happyProposal(defaultKey: string, overrides: Record<string, unknown> = {}): object {
  return {
    defaultKey,
    proposedValue: 0.7,
    rangeLow: 0.6,
    rangeHigh: 0.8,
    authority: "STR Host Survey 2025",
    referenceUrl: "https://example.com/str",
    conviction: "high",
    reasoning: "Three independent sources in tight agreement.",
    deviationFlag: false,
    ...overrides,
  };
}

const ANTHROPIC_LLM = { vendor: "anthropic", modelId: "claude-3-5-sonnet-20241022", modelSlug: "claude-3-5-sonnet" };
const OPENAI_LLM = { vendor: "openai", modelId: "gpt-4o", modelSlug: "gpt-4o" };

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("runValentinaResearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAnthropicClient.mockReturnValue({ messages: { create: mockAnthropicCreate } } as never);
    mockGetOpenAIClient.mockReturnValue({ chat: { completions: { create: mockOpenAICreate } } } as never);
  });

  // ── Skip logic ────────────────────────────────────────────────────────────

  describe("skip logic", () => {
    it("skips rows with subTab=funding", async () => {
      const row = makeRow({ id: 10, subTab: "funding" });
      const results = await runValentinaResearch([row]);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ id: 10, skipped: true, skipReason: "funding-subtab-admin-preference" });
      expect(mockResolveLlmFor).not.toHaveBeenCalled();
    });

    it("skips rows whose defaultKey includes 'adrByTier'", async () => {
      const row = makeRow({ id: 11, defaultKey: "adrByTierUpscale" });
      const results = await runValentinaResearch([row]);
      expect(results[0]).toMatchObject({ id: 11, skipped: true, skipReason: "json-blob-row-requires-manual-research" });
      expect(mockResolveLlmFor).not.toHaveBeenCalled();
    });

    it("returns empty array for empty input", async () => {
      const results = await runValentinaResearch([]);
      expect(results).toHaveLength(0);
      expect(mockResolveLlmFor).not.toHaveBeenCalled();
    });

    it("returns without calling LLM when all rows are ineligible", async () => {
      const rows = [
        makeRow({ id: 1, subTab: "funding" }),
        makeRow({ id: 2, defaultKey: "adrByTierLuxury" }),
      ];
      const results = await runValentinaResearch(rows);
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.skipped)).toBe(true);
      expect(mockResolveLlmFor).not.toHaveBeenCalled();
    });

    it("processes eligible rows alongside skipped rows in the same batch", async () => {
      mockResolveLlmFor.mockResolvedValue(ANTHROPIC_LLM);
      const eligibleRow = makeRow({ id: 20, defaultKey: "revParTarget" });
      const skippedRow = makeRow({ id: 21, subTab: "funding" });
      mockAnthropicCreate.mockResolvedValue(
        anthropicResponse([happyProposal("revParTarget")]),
      );
      const results = await runValentinaResearch([eligibleRow, skippedRow]);
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));
      expect(byId[20]?.skipped).toBe(false);
      expect(byId[21]).toMatchObject({ skipped: true, skipReason: "funding-subtab-admin-preference" });
    });
  });

  // ── LLM slot unavailable ──────────────────────────────────────────────────

  describe("LLM slot unavailable", () => {
    it("marks all eligible rows skipped when resolveLlmFor throws", async () => {
      mockResolveLlmFor.mockRejectedValue(new Error("slot not configured"));
      const rows = [makeRow({ id: 30 }), makeRow({ id: 31, defaultKey: "exitCapRate" })];
      const results = await runValentinaResearch(rows);
      expect(results).toHaveLength(2);
      for (const r of results) {
        expect(r.skipped).toBe(true);
        expect(r.skipReason).toMatch(/^llm-slot-unavailable/);
      }
      expect(mockAnthropicCreate).not.toHaveBeenCalled();
    });
  });

  // ── Anthropic vendor path ──────────────────────────────────────────────────

  describe("Anthropic vendor path", () => {
    it("happy path: returns proposal for eligible row", async () => {
      mockResolveLlmFor.mockResolvedValue(ANTHROPIC_LLM);
      const row = makeRow({ id: 40, defaultKey: "occupancyRate", value: 0.65 });
      mockAnthropicCreate.mockResolvedValue(
        anthropicResponse([happyProposal("occupancyRate", { proposedValue: 0.72, conviction: "high" })]),
      );
      const results = await runValentinaResearch([row]);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: 40,
        skipped: false,
        proposedValue: 0.72,
        proposedRangeLow: 0.6,
        proposedRangeHigh: 0.8,
        proposedConviction: 0.9,
        proposedAuthority: "STR Host Survey 2025",
      });
    });

    it("makes a single batched call for multiple eligible rows", async () => {
      mockResolveLlmFor.mockResolvedValue(ANTHROPIC_LLM);
      const rows = [
        makeRow({ id: 50, defaultKey: "occupancyRate" }),
        makeRow({ id: 51, defaultKey: "exitCapRate" }),
      ];
      mockAnthropicCreate.mockResolvedValue(
        anthropicResponse([happyProposal("occupancyRate"), happyProposal("exitCapRate")]),
      );
      await runValentinaResearch(rows);
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    });

    it("marks all eligible rows skipped when Anthropic call throws", async () => {
      mockResolveLlmFor.mockResolvedValue(ANTHROPIC_LLM);
      mockAnthropicCreate.mockRejectedValue(new Error("network error"));
      const rows = [makeRow({ id: 60 }), makeRow({ id: 61, defaultKey: "exitCapRate" })];
      const results = await runValentinaResearch(rows);
      for (const r of results) {
        expect(r.skipped).toBe(true);
        expect(r.skipReason).toMatch(/^llm-call-failed/);
      }
    });
  });

  // ── OpenAI vendor path ────────────────────────────────────────────────────

  describe("OpenAI vendor path", () => {
    it("happy path via OpenAI: returns proposal with correct conviction", async () => {
      mockResolveLlmFor.mockResolvedValue(OPENAI_LLM);
      const row = makeRow({ id: 70, defaultKey: "revParTarget" });
      mockOpenAICreate.mockResolvedValue(
        openaiResponse([happyProposal("revParTarget", { proposedValue: 0.55, conviction: "moderate" })]),
      );
      const results = await runValentinaResearch([row]);
      expect(results[0]).toMatchObject({
        id: 70,
        skipped: false,
        proposedValue: 0.55,
        proposedConviction: 0.6,
      });
    });
  });

  // ── Parse error handling ──────────────────────────────────────────────────

  describe("parse error handling", () => {
    it("skips all eligible rows when LLM returns malformed JSON", async () => {
      mockResolveLlmFor.mockResolvedValue(ANTHROPIC_LLM);
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: "text", text: "not valid json {{" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
      const results = await runValentinaResearch([makeRow({ id: 80 })]);
      expect(results[0]).toMatchObject({ id: 80, skipped: true, skipReason: "parse-error" });
    });

    it("skips eligible row when proposedValue is non-numeric", async () => {
      mockResolveLlmFor.mockResolvedValue(ANTHROPIC_LLM);
      mockAnthropicCreate.mockResolvedValue(
        anthropicResponse([{ ...happyProposal("occupancyRate"), proposedValue: "not-a-number" }]),
      );
      const results = await runValentinaResearch([makeRow({ id: 81, defaultKey: "occupancyRate" })]);
      expect(results[0]).toMatchObject({ id: 81, skipped: true, skipReason: "parse-error" });
    });

    it("marks row skipped when LLM returns empty proposals array", async () => {
      mockResolveLlmFor.mockResolvedValue(ANTHROPIC_LLM);
      mockAnthropicCreate.mockResolvedValue(anthropicResponse([]));
      const results = await runValentinaResearch([makeRow({ id: 82 })]);
      expect(results[0]).toMatchObject({ id: 82, skipped: true, skipReason: "missing-from-llm-response" });
    });

    it("marks row skipped when response JSON has no proposals key", async () => {
      mockResolveLlmFor.mockResolvedValue(ANTHROPIC_LLM);
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ other: "data" }) }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
      const results = await runValentinaResearch([makeRow({ id: 83 })]);
      expect(results[0]).toMatchObject({ id: 83, skipped: true, skipReason: "missing-from-llm-response" });
    });
  });

  // ── Missing from LLM response ─────────────────────────────────────────────

  describe("missing-from-llm-response", () => {
    it("marks row skipped when its defaultKey is absent from LLM proposals", async () => {
      mockResolveLlmFor.mockResolvedValue(ANTHROPIC_LLM);
      const rows = [
        makeRow({ id: 90, defaultKey: "occupancyRate" }),
        makeRow({ id: 91, defaultKey: "exitCapRate" }),
      ];
      mockAnthropicCreate.mockResolvedValue(
        anthropicResponse([happyProposal("occupancyRate")]),
      );
      const results = await runValentinaResearch(rows);
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));
      expect(byId[90]?.skipped).toBe(false);
      expect(byId[91]).toMatchObject({ skipped: true, skipReason: "missing-from-llm-response" });
    });
  });

  // ── Conviction mapping ────────────────────────────────────────────────────

  describe("conviction mapping", () => {
    const cases: Array<[string, number]> = [
      ["high", 0.9],
      ["moderate", 0.6],
      ["low", 0.3],
    ];

    for (const [level, expected] of cases) {
      it(`maps conviction "${level}" → ${expected}`, async () => {
        mockResolveLlmFor.mockResolvedValue(ANTHROPIC_LLM);
        mockAnthropicCreate.mockResolvedValue(
          anthropicResponse([happyProposal("occupancyRate", { conviction: level })]),
        );
        const results = await runValentinaResearch([makeRow({ id: 100, defaultKey: "occupancyRate" })]);
        expect(results[0]?.proposedConviction).toBe(expected);
      });
    }

    it("maps unknown conviction string → 0.3 (low fallback)", async () => {
      mockResolveLlmFor.mockResolvedValue(ANTHROPIC_LLM);
      mockAnthropicCreate.mockResolvedValue(
        anthropicResponse([happyProposal("occupancyRate", { conviction: "very-certain" })]),
      );
      const results = await runValentinaResearch([makeRow({ id: 101, defaultKey: "occupancyRate" })]);
      expect(results[0]?.proposedConviction).toBe(0.3);
    });
  });

  // ── Null optional fields ──────────────────────────────────────────────────

  describe("optional fields", () => {
    it("accepts null rangeLow/rangeHigh and null authority/referenceUrl", async () => {
      mockResolveLlmFor.mockResolvedValue(ANTHROPIC_LLM);
      mockAnthropicCreate.mockResolvedValue(
        anthropicResponse([{
          defaultKey: "occupancyRate",
          proposedValue: 0.68,
          rangeLow: null,
          rangeHigh: null,
          authority: null,
          referenceUrl: null,
          conviction: "low",
          reasoning: "Single source.",
          deviationFlag: false,
        }]),
      );
      const results = await runValentinaResearch([makeRow({ id: 110, defaultKey: "occupancyRate" })]);
      expect(results[0]).toMatchObject({
        id: 110,
        skipped: false,
        proposedValue: 0.68,
        proposedRangeLow: null,
        proposedRangeHigh: null,
        proposedAuthority: null,
        proposedReferenceUrl: null,
        proposedConviction: 0.3,
      });
    });
  });
});
