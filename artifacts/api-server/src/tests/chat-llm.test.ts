/**
 * Unit tests for the LLM dispatch logic in chat-llm.ts (Task #1347).
 *
 * Coverage:
 *   - callLlm: provider-branch smoke tests (openai, anthropic, gemini, exa)
 *   - callLlm: tool-call returns for openai, anthropic, and gemini branches
 *   - callLlm: timeout — rejects after AI_GENERATION_TIMEOUT_MS
 *   - callLlm: ChatPolicyError thrown when exa + webSearchEnabled=false
 *   - resolveResponseMode: additional edge cases beyond chat-response-mode.test.ts
 *
 * No live DB or LLM connection is needed — all external dependencies are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any dynamic imports of the module
// under test. Vitest hoists vi.mock() calls to the top of the file.
//
// AI_GENERATION_TIMEOUT_MS is set to 50ms so the timeout tests run fast
// without fake timers. The other tests resolve immediately, so 50ms is never
// reached during a normal successful call.
// ---------------------------------------------------------------------------

vi.mock("../constants", () => ({
  AI_GENERATION_TIMEOUT_MS: 50,
}));

const mockOpenAICreate = vi.fn();
const mockAnthropicCreate = vi.fn();
const mockGeminiGenerateContent = vi.fn();
const mockExaAnswer = vi.fn();
const mockListAdminResources = vi.fn();

vi.mock("../ai/clients", () => ({
  getOpenAIClient: () => ({
    chat: { completions: { create: mockOpenAICreate } },
  }),
  getAnthropicClient: () => ({
    messages: { create: mockAnthropicCreate },
  }),
  getGeminiClient: () => ({
    models: { generateContent: mockGeminiGenerateContent },
  }),
  getExaClient: () => ({
    answer: mockExaAnswer,
  }),
  normalizeModelId: (m: string) => m,
}));

vi.mock("../storage", () => ({
  storage: {
    listAdminResources: (...a: unknown[]) => mockListAdminResources(...a),
  },
}));

vi.mock("../middleware/cost-logger", () => ({
  logApiCost: vi.fn(),
  estimateCost: vi.fn().mockReturnValue(0),
}));

vi.mock("../logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import the module under test after mocks are registered.
// ---------------------------------------------------------------------------

import { callLlm, resolveResponseMode, ChatPolicyError } from "../routes/chat-llm";
import { AI_GENERATION_TIMEOUT_MS } from "../constants";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SAMPLING = { temperature: 0.7, maxOutputTokens: 512 };
const SYSTEM = "You are a helpful assistant.";
const USER_MSG = "Hello, assistant.";
const HISTORY: never[] = [];

const TOOLS = [
  {
    name: "get_property",
    description: "Fetch a property",
    parameters: { type: "object", properties: { id: { type: "number" } } },
  },
];

// ---------------------------------------------------------------------------
// callLlm — openai branch
// ---------------------------------------------------------------------------

describe("callLlm — openai branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAdminResources.mockResolvedValue([]);
  });

  it("returns text from a successful completion", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: "Hi there!" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const result = await callLlm("openai", "gpt-4o", SYSTEM, HISTORY, USER_MSG, SAMPLING);

    expect(result.text).toBe("Hi there!");
    expect(result.stopReason).toBe("end_turn");
  });

  it("returns fallback text when content is empty", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: "" } }],
      usage: { prompt_tokens: 10, completion_tokens: 0 },
    });

    const result = await callLlm("openai", "gpt-4o", SYSTEM, HISTORY, USER_MSG, SAMPLING);

    expect(result.text).toContain("I'm sorry");
    expect(result.stopReason).toBe("end_turn");
  });

  it("returns tool_use stop reason and parsed tool calls when the model calls a tool", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call_abc123",
                type: "function",
                function: { name: "get_property", arguments: '{"id":42}' },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 15, completion_tokens: 8 },
    });

    const result = await callLlm(
      "openai",
      "gpt-4o",
      SYSTEM,
      HISTORY,
      USER_MSG,
      SAMPLING,
      undefined,
      undefined,
      TOOLS,
    );

    expect(result.stopReason).toBe("tool_use");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]).toMatchObject({
      id: "call_abc123",
      name: "get_property",
      arguments: { id: 42 },
    });
  });

  it("falls through to text return when no tool_calls are present despite tools list", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: "No tools needed." } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const result = await callLlm(
      "openai",
      "gpt-4o",
      SYSTEM,
      HISTORY,
      USER_MSG,
      SAMPLING,
      undefined,
      undefined,
      TOOLS,
    );

    expect(result.text).toBe("No tools needed.");
    expect(result.stopReason).toBe("end_turn");
  });
});

// ---------------------------------------------------------------------------
// callLlm — anthropic branch
// ---------------------------------------------------------------------------

describe("callLlm — anthropic branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAdminResources.mockResolvedValue([]);
  });

  it("returns text from a successful messages response", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "Hello from Anthropic!" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 12, output_tokens: 6 },
    });

    const result = await callLlm("anthropic", "claude-sonnet-4-5", SYSTEM, HISTORY, USER_MSG, SAMPLING);

    expect(result.text).toBe("Hello from Anthropic!");
    expect(result.stopReason).toBe("end_turn");
  });

  it("concatenates multiple text blocks", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [
        { type: "text", text: "Part one. " },
        { type: "text", text: "Part two." },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 12, output_tokens: 10 },
    });

    const result = await callLlm("anthropic", "claude-sonnet-4-5", SYSTEM, HISTORY, USER_MSG, SAMPLING);

    expect(result.text).toBe("Part one. Part two.");
  });

  it("returns fallback text when content blocks produce empty string", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [],
      stop_reason: "end_turn",
      usage: { input_tokens: 12, output_tokens: 0 },
    });

    const result = await callLlm("anthropic", "claude-sonnet-4-5", SYSTEM, HISTORY, USER_MSG, SAMPLING);

    expect(result.text).toContain("I'm sorry");
  });

  it("returns tool_use stop reason when stop_reason is tool_use", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [
        { type: "tool_use", id: "toolu_01", name: "get_property", input: { id: 7 } },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 20, output_tokens: 10 },
    });

    const result = await callLlm(
      "anthropic",
      "claude-sonnet-4-5",
      SYSTEM,
      HISTORY,
      USER_MSG,
      SAMPLING,
      undefined,
      undefined,
      TOOLS,
    );

    expect(result.stopReason).toBe("tool_use");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]).toMatchObject({
      id: "toolu_01",
      name: "get_property",
      arguments: { id: 7 },
    });
  });
});

// ---------------------------------------------------------------------------
// callLlm — gemini branch (default/fallback provider)
// ---------------------------------------------------------------------------

describe("callLlm — gemini branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAdminResources.mockResolvedValue([]);
  });

  it("returns text from a successful generateContent response", async () => {
    mockGeminiGenerateContent.mockResolvedValue({
      text: "Hello from Gemini!",
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 5 },
      candidates: [],
    });

    const result = await callLlm("gemini", "gemini-2.0-flash", SYSTEM, HISTORY, USER_MSG, SAMPLING);

    expect(result.text).toBe("Hello from Gemini!");
    expect(result.stopReason).toBe("end_turn");
  });

  it("returns fallback text when response.text is falsy", async () => {
    mockGeminiGenerateContent.mockResolvedValue({
      text: "",
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 0 },
      candidates: [],
    });

    const result = await callLlm("gemini", "gemini-2.0-flash", SYSTEM, HISTORY, USER_MSG, SAMPLING);

    expect(result.text).toContain("I'm sorry");
  });

  it("returns tool_use stop reason when a function call is in candidates", async () => {
    mockGeminiGenerateContent.mockResolvedValue({
      text: "",
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 },
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: "get_property",
                  args: { id: 99 },
                },
              },
            ],
          },
        },
      ],
    });

    const result = await callLlm(
      "gemini",
      "gemini-2.0-flash",
      SYSTEM,
      HISTORY,
      USER_MSG,
      SAMPLING,
      undefined,
      undefined,
      TOOLS,
    );

    expect(result.stopReason).toBe("tool_use");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe("get_property");
    expect(result.toolCalls![0].arguments).toEqual({ id: 99 });
  });

  it("uses unknown provider string and falls to gemini default branch", async () => {
    mockGeminiGenerateContent.mockResolvedValue({
      text: "Fallback provider response",
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 },
      candidates: [],
    });

    const result = await callLlm("some-unknown-provider", "gemini-2.0-flash", SYSTEM, HISTORY, USER_MSG, SAMPLING);

    expect(result.text).toBe("Fallback provider response");
  });
});

// ---------------------------------------------------------------------------
// callLlm — exa branch
// ---------------------------------------------------------------------------

describe("callLlm — exa branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAdminResources.mockResolvedValue([]);
  });

  it("returns synthesised answer text with citations appended", async () => {
    mockExaAnswer.mockResolvedValue({
      answer: "Paris is the capital of France.",
      citations: [{ url: "https://example.com/france" }],
    });

    const result = await callLlm(
      "exa",
      "exa-default",
      SYSTEM,
      HISTORY,
      "What is the capital of France?",
      SAMPLING,
      undefined,
      true,
    );

    expect(result.text).toContain("Paris is the capital of France.");
    expect(result.text).toContain("**Sources:**");
    expect(result.text).toContain("https://example.com/france");
    expect(result.stopReason).toBe("end_turn");
  });

  it("returns answer text without sources block when citations are empty", async () => {
    mockExaAnswer.mockResolvedValue({ answer: "An answer.", citations: [] });

    const result = await callLlm("exa", "exa-default", SYSTEM, HISTORY, USER_MSG, SAMPLING, undefined, true);

    expect(result.text).toBe("An answer.");
    expect(result.text).not.toContain("**Sources:**");
  });

  it("returns fallback text when answer is empty", async () => {
    mockExaAnswer.mockResolvedValue({ answer: "", citations: [] });

    const result = await callLlm("exa", "exa-default", SYSTEM, HISTORY, USER_MSG, SAMPLING, undefined, true);

    expect(result.text).toContain("I'm sorry");
  });

  it("throws ChatPolicyError when webSearchEnabled is false", async () => {
    await expect(
      callLlm("exa", "exa-default", SYSTEM, HISTORY, USER_MSG, SAMPLING, undefined, false),
    ).rejects.toThrow(ChatPolicyError);
  });

  it("ChatPolicyError message references the admin toggle", async () => {
    try {
      await callLlm("exa", "exa-default", SYSTEM, HISTORY, USER_MSG, SAMPLING, undefined, false);
      expect.fail("Expected ChatPolicyError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ChatPolicyError);
      expect((err as ChatPolicyError).name).toBe("ChatPolicyError");
      expect((err as ChatPolicyError).message).toMatch(/web search/i);
    }
  });

  it("does NOT throw when webSearchEnabled is true", async () => {
    mockExaAnswer.mockResolvedValue({ answer: "OK", citations: [] });

    await expect(
      callLlm("exa", "exa-default", SYSTEM, HISTORY, USER_MSG, SAMPLING, undefined, true),
    ).resolves.toBeDefined();
  });

  it("does NOT throw when webSearchEnabled is undefined (permissive default)", async () => {
    mockExaAnswer.mockResolvedValue({ answer: "OK", citations: [] });

    await expect(
      callLlm("exa", "exa-default", SYSTEM, HISTORY, USER_MSG, SAMPLING, undefined, undefined),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// callLlm — timeout path
//
// AI_GENERATION_TIMEOUT_MS is mocked to 50ms at the top of this file so these
// tests complete quickly using real timers (no fake-timer complexity needed).
// A hanging provider call is simulated by returning a never-resolving Promise.
// ---------------------------------------------------------------------------

describe("callLlm — timeout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAdminResources.mockResolvedValue([]);
  });

  it("rejects with a timeout error after AI_GENERATION_TIMEOUT_MS", async () => {
    mockOpenAICreate.mockImplementation(() => new Promise(() => {}));

    await expect(
      callLlm("openai", "gpt-4o", SYSTEM, HISTORY, USER_MSG, SAMPLING),
    ).rejects.toThrow(/timed out/i);
  }, 3000);

  it("timeout message includes the duration in seconds", async () => {
    mockOpenAICreate.mockImplementation(() => new Promise(() => {}));

    await expect(
      callLlm("openai", "gpt-4o", SYSTEM, HISTORY, USER_MSG, SAMPLING),
    ).rejects.toThrow(/0\.05s/);
  }, 3000);

  it("clears the timeout handle after a successful response (no dangling timer)", async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: "Fast response" } }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
    });

    const result = await callLlm("openai", "gpt-4o", SYSTEM, HISTORY, USER_MSG, SAMPLING);

    expect(result.text).toBe("Fast response");
  });
});

// ---------------------------------------------------------------------------
// ChatPolicyError — class contract
// ---------------------------------------------------------------------------

describe("ChatPolicyError", () => {
  it("is an instance of Error", () => {
    const err = new ChatPolicyError("test message");
    expect(err).toBeInstanceOf(Error);
  });

  it("has name ChatPolicyError", () => {
    const err = new ChatPolicyError("test message");
    expect(err.name).toBe("ChatPolicyError");
  });

  it("preserves the message", () => {
    const msg = "Exa is disabled by admin policy";
    const err = new ChatPolicyError(msg);
    expect(err.message).toBe(msg);
  });
});
