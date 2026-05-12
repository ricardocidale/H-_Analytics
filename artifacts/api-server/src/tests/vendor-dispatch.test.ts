/**
 * Unit tests for vendor dispatch branching in the four modules refactored by
 * Task #1522: llm-sections.ts (both executive-summary slots),
 * regenerate-constants.ts, regenerate-market-data.ts, and llm-brief.ts.
 *
 * Each module contains an if/else chain that routes to a different AI client
 * based on the vendor value returned by `resolveLlmFor`. These tests confirm
 * that:
 *   - When vendor === "anthropic", getAnthropicClient() is called (and only it)
 *   - When vendor === "openai",    getOpenAIClient()   is called (and only it)
 *   - When vendor === "google",    getGeminiClient()   is called (and only it)
 *
 * No live DB, LLM, or network connections are used — all external dependencies
 * are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared client mocks — declared before any dynamic imports so that
// vi.mock() hoisting applies them before the modules under test are loaded.
// ---------------------------------------------------------------------------

const mockAnthropicCreate = vi.fn();
const mockOpenAICreate = vi.fn();
const mockGeminiGenerateContent = vi.fn();

vi.mock("../ai/clients", () => ({
  getAnthropicClient: () => ({
    messages: { create: mockAnthropicCreate },
  }),
  getOpenAIClient: () => ({
    chat: { completions: { create: mockOpenAICreate } },
  }),
  getGeminiClient: () => ({
    models: { generateContent: mockGeminiGenerateContent },
  }),
  normalizeModelId: (m: string) => m,
}));

// ---------------------------------------------------------------------------
// resolveLlmFor mock — each describe block overrides this per vendor.
// ---------------------------------------------------------------------------

const mockResolveLlmFor = vi.fn();

vi.mock("../ai/llm-config-resolver", () => ({
  resolveLlmFor: (...a: unknown[]) => mockResolveLlmFor(...a),
}));

// ---------------------------------------------------------------------------
// Logger mock — suppress log noise during tests.
// ---------------------------------------------------------------------------

vi.mock("../logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Storage mock — used by regenerate-constants and regenerate-market-data.
// ---------------------------------------------------------------------------

const mockCreateResearchRun = vi.fn();
const mockUpdateResearchRun = vi.fn();
const mockGetTaxBulletinCache = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    createResearchRun: (...a: unknown[]) => mockCreateResearchRun(...a),
    updateResearchRun: (...a: unknown[]) => mockUpdateResearchRun(...a),
    getTaxBulletinCache: (...a: unknown[]) => mockGetTaxBulletinCache(...a),
    getAdminResourceBySlug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// GroundedResearchService mock — always reports unavailable so the search
// branch is skipped and the test focuses on the LLM dispatch only.
// ---------------------------------------------------------------------------

vi.mock("../services/GroundedResearchService", () => ({
  GroundedResearchService: vi.fn().mockImplementation(() => ({
    isAvailable: () => false,
    search: vi.fn().mockResolvedValue([]),
  })),
}));

// ---------------------------------------------------------------------------
// Finance-helpers mock (used by llm-sections.ts).
// ---------------------------------------------------------------------------

vi.mock("../ai/executive-summary/finance-helpers", () => ({
  pct: (v: number) => `${(v * 100).toFixed(0)}%`,
  dollars: (v: number) => `$${v.toLocaleString()}`,
  getRegulatoryHighlights: () => "US domestic investment",
}));

// ---------------------------------------------------------------------------
// Constants mocks — spread the real module and override only the token limits
// that affect test execution. This ensures constants consumed by transitive
// imports (e.g. benchmarks.ts uses BENCHMARK_FB_COST_RATE) are still present.
// ---------------------------------------------------------------------------

vi.mock("../constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../constants")>();
  return {
    ...actual,
    AI_EXEC_SUMMARY_FULL_MAX_TOKENS: 500,
    AI_EXEC_SUMMARY_SECTION_MAX_TOKENS: 300,
    AI_REGEN_CONSTANTS_MAX_TOKENS: 400,
  };
});

// ---------------------------------------------------------------------------
// Model-constants-registry mock (used by regenerate-constants.ts).
// ---------------------------------------------------------------------------

vi.mock("@shared/model-constants-registry", () => ({
  MODEL_CONSTANTS_REGISTRY: {
    testConstant: {
      label: "Test Constant",
      locality: "universal",
      meta: {
        helperText: "A test constant",
        authority: "Test Authority",
        referenceUrl: "https://example.com",
      },
    },
  },
  getFactoryValue: (_key: string, _country: unknown, _sub: unknown) => 39,
}));

// ---------------------------------------------------------------------------
// getEffectiveConstant mock.
// ---------------------------------------------------------------------------

vi.mock("@shared/get-effective-constant", () => ({
  getEffectiveConstant: () => ({ value: 39 }),
}));

// ---------------------------------------------------------------------------
// Specialist catalog mock — returns a non-Helena specialist so the
// tax-bulletin-diff deterministic path is bypassed immediately.
// ---------------------------------------------------------------------------

vi.mock("@engine/analyst/registry/specialist-catalog", () => ({
  getSpecialistForConstant: () => ({ id: "mock-specialist-Z", letter: "Z" }),
}));

// ---------------------------------------------------------------------------
// Tax-bulletin-diff tool mock — ensures tryTaxBulletinDiff returns null.
// The owner specialist ID is set to a value that the mock specialist above
// will never match, so the function exits before any DB calls.
// ---------------------------------------------------------------------------

vi.mock("../ai/tools/tax-bulletin-diff", () => ({
  runTaxBulletinDiff: vi.fn(),
  isJurisdictionSupported: () => false,
  MIN_PARSE_CONFIDENCE_FOR_TRUST: 0.8,
  TAX_BULLETIN_DIFF_TOOL_ID: "tax-bulletin-diff",
  TAX_BULLETIN_DIFF_OWNER_SPECIALIST_ID: "constants.tax-research",
}));

// ---------------------------------------------------------------------------
// Import modules under test AFTER all mocks are registered.
// ---------------------------------------------------------------------------

import {
  generateLLMPropertySections,
  generateLLMPortfolioSections,
} from "../ai/executive-summary/llm-sections";
import { proposeConstantRegeneration } from "../ai/regenerate-constants";
import { refreshMarketDataTable } from "../ai/regenerate-market-data";
import { generateLLMRiskBrief } from "../ai/risk/llm-brief";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_PROPERTY = {
  id: 1,
  name: "Test Inn",
  city: "Hudson",
  stateProvince: "NY",
  country: "US",
  qualityTier: "upscale",
  businessModel: "hotel",
  pricingModel: "per_room",
  roomCount: 12,
  startAdr: 350,
  nightlyPropertyRate: null,
  maxOccupancy: 0.72,
  revShareFB: 0.1,
  revShareEvents: 0.05,
  revShareOther: 0.0,
  exitCapRate: 0.07,
  acquisitionLTV: 0.6,
} as unknown as import("@workspace/db").Property;

const MOCK_METRICS = {
  totalInvestment: 2_000_000,
  projectedIRR: 0.18,
  equityMultiple: 2.4,
  stabilizedNOI: 280_000,
  exitValue: 4_000_000,
  dscr: 1.45,
  cashOnCash: 0.09,
  paybackYears: 4.5,
} as unknown as import("../ai/executive-summary/types").PropertyExecutiveSummary["keyMetrics"];

const VALID_SECTIONS_JSON = JSON.stringify({
  investmentThesis: "Strong thesis.",
  marketPosition: "Good market.",
  revenueStrategy: "Rooms + F&B.",
  riskFactors: "Macro risk.",
  mitigants: "Insurance.",
  exitStrategy: "Sale in year 5.",
});

const VALID_PORTFOLIO_JSON = JSON.stringify({
  portfolioThesis: "Diversified portfolio.",
  brandStrategy: "Boutique brand.",
  diversificationAnalysis: "Three markets.",
  growthPlan: "Add 2 properties.",
  managementCompanyValue: "Operational excellence.",
});

const VALID_CONSTANT_JSON = JSON.stringify({
  value: 39,
  authority: "IRS Publication 946",
  referenceUrl: "https://irs.gov/pub946",
  reasoning: "Standard useful life per IRS.",
});

const VALID_MARKET_DATA_JSON = "[]";

const VALID_RISK_BRIEF_JSON = JSON.stringify({
  overallNarrative: "Portfolio looks stable.",
  propertyEnhancements: [],
});

const MOCK_INSIGHTS: import("@shared/risk-types").RiskInsight[] = [];
const MOCK_BRIEFS: import("@shared/risk-types").PropertyRiskBrief[] = [];
const MOCK_MACRO: import("@shared/risk-types").MacroContext = {
  fedFundsRate: "5.25%",
  mortgageRate: "7.1%",
  inflationRate: "3.2%",
  narrative: "Stable environment.",
};

// ---------------------------------------------------------------------------
// Helpers: configure resolveLlmFor and client mock for each vendor
// ---------------------------------------------------------------------------

function setupVendor(vendor: "anthropic" | "openai" | "google") {
  mockResolveLlmFor.mockResolvedValue({ vendor, modelId: `test-model-${vendor}`, modelSlug: `slot-${vendor}` });
}

function setupAnthropicResponse(text: string) {
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 20 },
  });
}

function setupOpenAIResponse(text: string) {
  mockOpenAICreate.mockResolvedValue({
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  });
}

function setupGeminiResponse(text: string) {
  mockGeminiGenerateContent.mockResolvedValue({
    text,
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    candidates: [],
  });
}

// ============================================================================
// 1. llm-sections.ts — generateLLMPropertySections
//    Slot: "executive-summary-property"
// ============================================================================

describe("llm-sections.ts — generateLLMPropertySections vendor dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the Anthropic client when vendor=anthropic and returns sections", async () => {
    setupVendor("anthropic");
    setupAnthropicResponse(VALID_SECTIONS_JSON);

    const result = await generateLLMPropertySections(
      MOCK_PROPERTY, MOCK_METRICS, "Stress OK", "High confidence", "Good market",
    );

    expect(mockAnthropicCreate).toHaveBeenCalledOnce();
    expect(mockOpenAICreate).not.toHaveBeenCalled();
    expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.investmentThesis).toBe("Strong thesis.");
  });

  it("calls the OpenAI client when vendor=openai and returns sections", async () => {
    setupVendor("openai");
    setupOpenAIResponse(VALID_SECTIONS_JSON);

    const result = await generateLLMPropertySections(
      MOCK_PROPERTY, MOCK_METRICS, "Stress OK", "High confidence", "Good market",
    );

    expect(mockOpenAICreate).toHaveBeenCalledOnce();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.marketPosition).toBe("Good market.");
  });

  it("calls the Gemini client when vendor=google and returns sections", async () => {
    setupVendor("google");
    setupGeminiResponse(VALID_SECTIONS_JSON);

    const result = await generateLLMPropertySections(
      MOCK_PROPERTY, MOCK_METRICS, "Stress OK", "High confidence", "Good market",
    );

    expect(mockGeminiGenerateContent).toHaveBeenCalledOnce();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockOpenAICreate).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.exitStrategy).toBe("Sale in year 5.");
  });

  it("passes the resolved modelId to the Anthropic client", async () => {
    setupVendor("anthropic");
    setupAnthropicResponse(VALID_SECTIONS_JSON);

    await generateLLMPropertySections(
      MOCK_PROPERTY, MOCK_METRICS, "Stress OK", "High confidence", "Good market",
    );

    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model-anthropic" }),
    );
  });

  it("passes the resolved modelId to the OpenAI client", async () => {
    setupVendor("openai");
    setupOpenAIResponse(VALID_SECTIONS_JSON);

    await generateLLMPropertySections(
      MOCK_PROPERTY, MOCK_METRICS, "Stress OK", "High confidence", "Good market",
    );

    expect(mockOpenAICreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model-openai" }),
    );
  });

  it("passes the resolved modelId to the Gemini client", async () => {
    setupVendor("google");
    setupGeminiResponse(VALID_SECTIONS_JSON);

    await generateLLMPropertySections(
      MOCK_PROPERTY, MOCK_METRICS, "Stress OK", "High confidence", "Good market",
    );

    expect(mockGeminiGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model-google" }),
    );
  });

  it("resolves the slot name 'executive-summary-property' for all vendors", async () => {
    setupVendor("anthropic");
    setupAnthropicResponse(VALID_SECTIONS_JSON);

    await generateLLMPropertySections(
      MOCK_PROPERTY, MOCK_METRICS, "Stress OK", "High confidence", "Good market",
    );

    expect(mockResolveLlmFor).toHaveBeenCalledWith("executive-summary-property");
  });

  it("gracefully returns null when the LLM call fails", async () => {
    setupVendor("anthropic");
    mockAnthropicCreate.mockRejectedValue(new Error("Network error"));

    const result = await generateLLMPropertySections(
      MOCK_PROPERTY, MOCK_METRICS, "Stress OK", "High confidence", "Good market",
    );

    expect(result).toBeNull();
  });
});

// ============================================================================
// 2. llm-sections.ts — generateLLMPortfolioSections
//    Slot: "executive-summary-portfolio"
// ============================================================================

describe("llm-sections.ts — generateLLMPortfolioSections vendor dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the Anthropic client when vendor=anthropic and returns portfolio sections", async () => {
    setupVendor("anthropic");
    setupAnthropicResponse(VALID_PORTFOLIO_JSON);

    const result = await generateLLMPortfolioSections(
      [MOCK_PROPERTY],
      [{ name: "Test Inn", irr: 0.18, riskGrade: "B", oneLiner: "Good deal" }],
      2_000_000, 0.18, "B", "Northeast US",
    );

    expect(mockAnthropicCreate).toHaveBeenCalledOnce();
    expect(mockOpenAICreate).not.toHaveBeenCalled();
    expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.portfolioThesis).toBe("Diversified portfolio.");
  });

  it("calls the OpenAI client when vendor=openai and returns portfolio sections", async () => {
    setupVendor("openai");
    setupOpenAIResponse(VALID_PORTFOLIO_JSON);

    const result = await generateLLMPortfolioSections(
      [MOCK_PROPERTY],
      [{ name: "Test Inn", irr: 0.18, riskGrade: "B", oneLiner: "Good deal" }],
      2_000_000, 0.18, "B", "Northeast US",
    );

    expect(mockOpenAICreate).toHaveBeenCalledOnce();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.brandStrategy).toBe("Boutique brand.");
  });

  it("calls the Gemini client when vendor=google and returns portfolio sections", async () => {
    setupVendor("google");
    setupGeminiResponse(VALID_PORTFOLIO_JSON);

    const result = await generateLLMPortfolioSections(
      [MOCK_PROPERTY],
      [{ name: "Test Inn", irr: 0.18, riskGrade: "B", oneLiner: "Good deal" }],
      2_000_000, 0.18, "B", "Northeast US",
    );

    expect(mockGeminiGenerateContent).toHaveBeenCalledOnce();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockOpenAICreate).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.diversificationAnalysis).toBe("Three markets.");
  });

  it("resolves the slot name 'executive-summary-portfolio' for all vendors", async () => {
    setupVendor("openai");
    setupOpenAIResponse(VALID_PORTFOLIO_JSON);

    await generateLLMPortfolioSections(
      [MOCK_PROPERTY],
      [{ name: "Test Inn", irr: 0.18, riskGrade: "B", oneLiner: "Good deal" }],
      2_000_000, 0.18, "B", "Northeast US",
    );

    expect(mockResolveLlmFor).toHaveBeenCalledWith("executive-summary-portfolio");
  });
});

// ============================================================================
// 3. regenerate-constants.ts — proposeConstantRegeneration
//    Slot: "regen-constants"
// ============================================================================

describe("regenerate-constants.ts — proposeConstantRegeneration vendor dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateResearchRun.mockResolvedValue({ id: 1 });
    mockUpdateResearchRun.mockResolvedValue(undefined);
  });

  const ARGS = {
    key: "testConstant",
    country: null,
    subdivision: null,
    overrides: [],
  };

  it("calls the Anthropic client when vendor=anthropic", async () => {
    setupVendor("anthropic");
    setupAnthropicResponse(VALID_CONSTANT_JSON);

    const result = await proposeConstantRegeneration(ARGS);

    expect(mockAnthropicCreate).toHaveBeenCalledOnce();
    expect(mockOpenAICreate).not.toHaveBeenCalled();
    expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
    expect(result.value).toBe(39);
    expect(result.authority).toBe("IRS Publication 946");
  });

  it("calls the OpenAI client when vendor=openai", async () => {
    setupVendor("openai");
    setupOpenAIResponse(VALID_CONSTANT_JSON);

    const result = await proposeConstantRegeneration(ARGS);

    expect(mockOpenAICreate).toHaveBeenCalledOnce();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
    expect(result.value).toBe(39);
  });

  it("calls the Gemini client when vendor=google", async () => {
    setupVendor("google");
    setupGeminiResponse(VALID_CONSTANT_JSON);

    const result = await proposeConstantRegeneration(ARGS);

    expect(mockGeminiGenerateContent).toHaveBeenCalledOnce();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockOpenAICreate).not.toHaveBeenCalled();
    expect(result.reasoning).toBe("Standard useful life per IRS.");
  });

  it("resolves the slot name 'regen-constants' for all vendors", async () => {
    setupVendor("anthropic");
    setupAnthropicResponse(VALID_CONSTANT_JSON);

    await proposeConstantRegeneration(ARGS);

    expect(mockResolveLlmFor).toHaveBeenCalledWith("regen-constants");
  });

  it("passes the resolved modelId to the Anthropic client", async () => {
    setupVendor("anthropic");
    setupAnthropicResponse(VALID_CONSTANT_JSON);

    await proposeConstantRegeneration(ARGS);

    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model-anthropic" }),
    );
  });

  it("passes the resolved modelId to the OpenAI client", async () => {
    setupVendor("openai");
    setupOpenAIResponse(VALID_CONSTANT_JSON);

    await proposeConstantRegeneration(ARGS);

    expect(mockOpenAICreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model-openai" }),
    );
  });

  it("passes the resolved modelId to the Gemini client", async () => {
    setupVendor("google");
    setupGeminiResponse(VALID_CONSTANT_JSON);

    await proposeConstantRegeneration(ARGS);

    expect(mockGeminiGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model-google" }),
    );
  });

  it("attaches the specialist ID and key to the persisted research run", async () => {
    setupVendor("anthropic");
    setupAnthropicResponse(VALID_CONSTANT_JSON);

    await proposeConstantRegeneration(ARGS);

    expect(mockCreateResearchRun).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          specialistId: "mock-specialist-Z",
          constant: expect.objectContaining({ key: "testConstant" }),
        }),
      }),
    );
  });
});

// ============================================================================
// 4. regenerate-market-data.ts — refreshMarketDataTable (callLlm)
//    Slot: "regen-constants"
// ============================================================================

describe("regenerate-market-data.ts — refreshMarketDataTable vendor dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateResearchRun.mockResolvedValue({ id: 42 });
    mockUpdateResearchRun.mockResolvedValue(undefined);
  });

  it("calls the Anthropic client when vendor=anthropic", async () => {
    setupVendor("anthropic");
    setupAnthropicResponse(VALID_MARKET_DATA_JSON);

    const result = await refreshMarketDataTable("hospitality-benchmarks", null);

    expect(mockAnthropicCreate).toHaveBeenCalledOnce();
    expect(mockOpenAICreate).not.toHaveBeenCalled();
    expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
    expect(result.table).toBe("hospitality-benchmarks");
    expect(result.rowsUpserted).toBe(0);
  });

  it("calls the OpenAI client when vendor=openai", async () => {
    setupVendor("openai");
    setupOpenAIResponse(VALID_MARKET_DATA_JSON);

    const result = await refreshMarketDataTable("market-adr-index", "Miami");

    expect(mockOpenAICreate).toHaveBeenCalledOnce();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
    expect(result.table).toBe("market-adr-index");
  });

  it("calls the Gemini client when vendor=google", async () => {
    setupVendor("google");
    setupGeminiResponse(VALID_MARKET_DATA_JSON);

    const result = await refreshMarketDataTable("labor-rates", null);

    expect(mockGeminiGenerateContent).toHaveBeenCalledOnce();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockOpenAICreate).not.toHaveBeenCalled();
    expect(result.table).toBe("labor-rates");
  });

  it("resolves the slot name 'regen-constants' for all vendors", async () => {
    setupVendor("openai");
    setupOpenAIResponse(VALID_MARKET_DATA_JSON);

    await refreshMarketDataTable("fb-benchmarks", null);

    expect(mockResolveLlmFor).toHaveBeenCalledWith("regen-constants");
  });

  it("passes the resolved modelId to the Anthropic client", async () => {
    setupVendor("anthropic");
    setupAnthropicResponse(VALID_MARKET_DATA_JSON);

    await refreshMarketDataTable("seasonal-calendars", null);

    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model-anthropic" }),
    );
  });

  it("passes the resolved modelId to the OpenAI client", async () => {
    setupVendor("openai");
    setupOpenAIResponse(VALID_MARKET_DATA_JSON);

    await refreshMarketDataTable("hospitality-benchmarks", null);

    expect(mockOpenAICreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model-openai" }),
    );
  });

  it("passes the resolved modelId to the Gemini client", async () => {
    setupVendor("google");
    setupGeminiResponse(VALID_MARKET_DATA_JSON);

    await refreshMarketDataTable("market-adr-index", null);

    expect(mockGeminiGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model-google" }),
    );
  });

  it("records the research run id in the returned result", async () => {
    setupVendor("anthropic");
    setupAnthropicResponse(VALID_MARKET_DATA_JSON);

    const result = await refreshMarketDataTable("hospitality-benchmarks", null);

    expect(result.researchRunId).toBe(42);
  });
});

// ============================================================================
// 5. llm-brief.ts — generateLLMRiskBrief
//    Slot: "risk-brief"
// ============================================================================

describe("llm-brief.ts — generateLLMRiskBrief vendor dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the Anthropic client when vendor=anthropic and returns brief", async () => {
    setupVendor("anthropic");
    setupAnthropicResponse(VALID_RISK_BRIEF_JSON);

    const result = await generateLLMRiskBrief(MOCK_INSIGHTS, MOCK_BRIEFS, MOCK_MACRO);

    expect(mockAnthropicCreate).toHaveBeenCalledOnce();
    expect(mockOpenAICreate).not.toHaveBeenCalled();
    expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.overallNarrative).toBe("Portfolio looks stable.");
  });

  it("calls the OpenAI client when vendor=openai and returns brief", async () => {
    setupVendor("openai");
    setupOpenAIResponse(VALID_RISK_BRIEF_JSON);

    const result = await generateLLMRiskBrief(MOCK_INSIGHTS, MOCK_BRIEFS, MOCK_MACRO);

    expect(mockOpenAICreate).toHaveBeenCalledOnce();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.enhancedBriefs).toEqual([]);
  });

  it("calls the Gemini client when vendor=google and returns brief", async () => {
    setupVendor("google");
    setupGeminiResponse(VALID_RISK_BRIEF_JSON);

    const result = await generateLLMRiskBrief(MOCK_INSIGHTS, MOCK_BRIEFS, MOCK_MACRO);

    expect(mockGeminiGenerateContent).toHaveBeenCalledOnce();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockOpenAICreate).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.overallNarrative).toBe("Portfolio looks stable.");
  });

  it("resolves the slot name 'risk-brief' for all vendors", async () => {
    setupVendor("anthropic");
    setupAnthropicResponse(VALID_RISK_BRIEF_JSON);

    await generateLLMRiskBrief(MOCK_INSIGHTS, MOCK_BRIEFS, MOCK_MACRO);

    expect(mockResolveLlmFor).toHaveBeenCalledWith("risk-brief");
  });

  it("passes the resolved modelId to the Anthropic client", async () => {
    setupVendor("anthropic");
    setupAnthropicResponse(VALID_RISK_BRIEF_JSON);

    await generateLLMRiskBrief(MOCK_INSIGHTS, MOCK_BRIEFS, MOCK_MACRO);

    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model-anthropic" }),
    );
  });

  it("passes the resolved modelId to the OpenAI client", async () => {
    setupVendor("openai");
    setupOpenAIResponse(VALID_RISK_BRIEF_JSON);

    await generateLLMRiskBrief(MOCK_INSIGHTS, MOCK_BRIEFS, MOCK_MACRO);

    expect(mockOpenAICreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model-openai" }),
    );
  });

  it("passes the resolved modelId to the Gemini client", async () => {
    setupVendor("google");
    setupGeminiResponse(VALID_RISK_BRIEF_JSON);

    await generateLLMRiskBrief(MOCK_INSIGHTS, MOCK_BRIEFS, MOCK_MACRO);

    expect(mockGeminiGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model-google" }),
    );
  });

  it("gracefully returns null when the LLM call fails", async () => {
    setupVendor("openai");
    mockOpenAICreate.mockRejectedValue(new Error("Rate limit"));

    const result = await generateLLMRiskBrief(MOCK_INSIGHTS, MOCK_BRIEFS, MOCK_MACRO);

    expect(result).toBeNull();
  });

  it("gracefully returns null when the LLM returns invalid JSON", async () => {
    setupVendor("anthropic");
    setupAnthropicResponse("not-valid-json{{{{");

    const result = await generateLLMRiskBrief(MOCK_INSIGHTS, MOCK_BRIEFS, MOCK_MACRO);

    expect(result).toBeNull();
  });
});
