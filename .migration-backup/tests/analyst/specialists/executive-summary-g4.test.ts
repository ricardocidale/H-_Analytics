/**
 * G4 tests for Executive Summary specialist (Eloá / property.executive-summary).
 *
 * Coverage:
 *   G4-shape: output structure and section completeness
 *   - All 6 narrative sections present and non-empty on LLM success path
 *   - All 8 keyMetrics fields present and finite
 *   - generatedAt is a valid ISO string
 *   - sources array is defined
 *
 *   G4-fallback: template path when LLM fails
 *   - Template fallback produces valid PropertyExecutiveSummary shape
 *   - All 6 sections present even when getAnthropicClient throws
 *   - includeLLM:false skips LLM and produces template output
 *
 *   G4-model: model-tier assertion
 *   - generateLLMPropertySections calls PROPERTY_MODEL (Opus tier)
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the Anthropic client before importing the generator so the import
// chain resolves the mock path instead of the live SDK.
vi.mock("../../../server/ai/clients", () => ({
  getAnthropicClient: vi.fn(),
}));

import { getAnthropicClient } from "../../../server/ai/clients";
import { generatePropertyExecutiveSummary } from "../../../server/ai/executive-summary/generators";
import type { Property } from "@shared/schema";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STUB_PROPERTY: Property = {
  id: 42,
  userId: null,
  name: "Palácio das Flores",
  country: "Brazil",
  city: "São Paulo",
  stateProvince: "SP",
  market: "São Paulo Metro",
  hospitalityType: "boutique",
  qualityTier: "upscale",
  businessModel: "hotel",
  pricingModel: "per_room",
  roomCount: 40,
  startAdr: 280,
  maxOccupancy: 0.72,
  acquisitionPrice: 8_000_000,
  acquisitionLTV: 0.55,
  acquisitionInterestRate: 0.065,
  acquisitionTermYears: 10,
  renovationCost: 1_200_000,
  operationsStartDate: "2027-01-01",
  acquisitionDate: "2026-06-01",
  projectionYears: 10,
  exitCapRate: 0.07,
  revShareFB: 0.15,
  revShareEvents: 0.05,
  revShareOther: 0.02,
  nightlyPropertyRate: null,
  isActive: true,
} as unknown as Property;

/** Build a mock Anthropic client that returns valid JSON for sections. */
function buildMockAnthropicClient(overrideText?: string) {
  const sectionJson = overrideText ?? JSON.stringify({
    investmentThesis: "Palácio das Flores targets São Paulo's growing luxury segment with a 40-key boutique hotel conversion delivering 14.2% projected IRR.",
    marketPosition: "The São Paulo upscale boutique segment averages $260–$320 ADR with 68–74% stabilized occupancy; this property enters at $280 with room to grow.",
    revenueStrategy: "Rooms contribute 78% of revenue; F&B adds 15% via the ground-floor restaurant; events round out with 5% from corporate off-site bookings.",
    riskFactors: "Brazilian macroeconomic volatility — inflation above 4% or BRL depreciation — is the primary risk for USD-denominated LP returns.",
    mitigants: "55% LTC leverage preserves the equity cushion; BRL/USD hedging strategy and fixed-rate local debt mitigate currency risk.",
    exitStrategy: "A 10-year hold targets a 7.0% cap-rate exit at approximately $12.4M gross, generating a 2.1x equity multiple.",
  });
  const mockCreate = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: sectionJson }],
  });
  return { messages: { create: mockCreate } };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Executive Summary G4 — output shape (LLM success path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnthropicClient).mockReturnValue(buildMockAnthropicClient() as never);
  });

  it("returns all 6 qualitative sections as non-empty strings", async () => {
    const result = await generatePropertyExecutiveSummary(STUB_PROPERTY, []);

    expect(result.investmentThesis.length).toBeGreaterThan(10);
    expect(result.marketPosition.length).toBeGreaterThan(10);
    expect(result.revenueStrategy.length).toBeGreaterThan(10);
    expect(result.riskFactors.length).toBeGreaterThan(10);
    expect(result.mitigants.length).toBeGreaterThan(10);
    expect(result.exitStrategy.length).toBeGreaterThan(10);
  });

  it("returns all 8 keyMetrics fields as finite numbers or null for dscr", async () => {
    const result = await generatePropertyExecutiveSummary(STUB_PROPERTY, []);
    const m = result.keyMetrics;

    expect(Number.isFinite(m.totalInvestment)).toBe(true);
    expect(Number.isFinite(m.projectedIRR)).toBe(true);
    expect(Number.isFinite(m.equityMultiple)).toBe(true);
    expect(Number.isFinite(m.stabilizedNOI)).toBe(true);
    expect(Number.isFinite(m.exitValue)).toBe(true);
    expect(m.dscr === null || Number.isFinite(m.dscr)).toBe(true);
    expect(Number.isFinite(m.cashOnCash)).toBe(true);
    expect(Number.isFinite(m.paybackYears)).toBe(true);
  });

  it("returns propertyName and propertyId matching the input property", async () => {
    const result = await generatePropertyExecutiveSummary(STUB_PROPERTY, []);

    expect(result.propertyName).toBe("Palácio das Flores");
    expect(result.propertyId).toBe(42);
  });

  it("returns a valid ISO generatedAt timestamp", async () => {
    const result = await generatePropertyExecutiveSummary(STUB_PROPERTY, []);

    expect(() => new Date(result.generatedAt).toISOString()).not.toThrow();
    expect(Number.isNaN(new Date(result.generatedAt).getTime())).toBe(false);
  });

  it("returns a defined sources array", async () => {
    const result = await generatePropertyExecutiveSummary(STUB_PROPERTY, []);

    expect(Array.isArray(result.sources)).toBe(true);
  });
});

describe("Executive Summary G4 — template fallback path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to template when getAnthropicClient throws", async () => {
    vi.mocked(getAnthropicClient).mockImplementation(() => {
      throw new Error("Anthropic SDK not configured");
    });

    const result = await generatePropertyExecutiveSummary(STUB_PROPERTY, []);

    // Template produces non-empty sections — the generator never propagates
    // the LLM failure (graceful degradation per llm-sections.ts).
    expect(result.investmentThesis.length).toBeGreaterThan(0);
    expect(result.marketPosition.length).toBeGreaterThan(0);
    expect(result.riskFactors.length).toBeGreaterThan(0);
    expect(result.propertyId).toBe(42);
  });

  it("falls back to template when messages.create rejects", async () => {
    const mockClient = { messages: { create: vi.fn().mockRejectedValue(new Error("rate limited")) } };
    vi.mocked(getAnthropicClient).mockReturnValue(mockClient as never);

    const result = await generatePropertyExecutiveSummary(STUB_PROPERTY, []);

    expect(result.investmentThesis.length).toBeGreaterThan(0);
    expect(result.propertyId).toBe(42);
  });

  it("falls back to template when LLM returns malformed JSON", async () => {
    const badClient = { messages: { create: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "not valid json {{{" }],
    }) } };
    vi.mocked(getAnthropicClient).mockReturnValue(badClient as never);

    const result = await generatePropertyExecutiveSummary(STUB_PROPERTY, []);

    expect(result.investmentThesis.length).toBeGreaterThan(0);
    expect(result.propertyId).toBe(42);
  });

  it("skips LLM entirely when includeLLM:false and returns valid template output", async () => {
    vi.mocked(getAnthropicClient).mockReturnValue(buildMockAnthropicClient() as never);

    const result = await generatePropertyExecutiveSummary(STUB_PROPERTY, [], { includeLLM: false });

    // LLM was NOT called even though client was mocked
    expect(vi.mocked(getAnthropicClient)).not.toHaveBeenCalled();
    expect(result.investmentThesis.length).toBeGreaterThan(0);
    expect(result.propertyId).toBe(42);
  });
});

describe("Executive Summary G4 — model tier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnthropicClient).mockReturnValue(buildMockAnthropicClient() as never);
  });

  it("calls the Anthropic API with the Opus-tier model", async () => {
    const mockClient = buildMockAnthropicClient();
    vi.mocked(getAnthropicClient).mockReturnValue(mockClient as never);

    await generatePropertyExecutiveSummary(STUB_PROPERTY, []);

    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
    const callArgs = mockClient.messages.create.mock.calls[0][0] as { model: string };
    expect(callArgs.model).toBe("claude-opus-4-6");
  });
});
