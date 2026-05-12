/**
 * Unit tests for the shared LLM dispatch helper (src/ai/dispatch.ts).
 *
 * All three vendor clients are mocked so tests run without live API keys.
 * Covered surfaces:
 *   - dispatchService: vendor → DispatchService tag mapping
 *   - generateText: text extraction, token counts, system-prompt routing, service tag
 *   - streamText: delta emission for each vendor's stream shape
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports of the mocked modules.
// vi.mock() calls are hoisted by Vitest.
// ---------------------------------------------------------------------------

const mockAnthropicMessagesCreate = vi.fn();
const mockAnthropicMessagesStream = vi.fn();

const mockOpenAIChatCompletionsCreate = vi.fn();

const mockGeminiModelsGenerateContent = vi.fn();
const mockGeminiModelsGenerateContentStream = vi.fn();

vi.mock("../../ai/clients", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: mockAnthropicMessagesCreate,
      stream: mockAnthropicMessagesStream,
    },
  }),
  getOpenAIClient: () => ({
    chat: {
      completions: {
        create: mockOpenAIChatCompletionsCreate,
      },
    },
  }),
  getGeminiClient: () => ({
    models: {
      generateContent: mockGeminiModelsGenerateContent,
      generateContentStream: mockGeminiModelsGenerateContentStream,
    },
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { dispatchService, generateText, streamText } from "../../ai/dispatch";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function collectStream(iterable: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks;
}

async function* makeAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

const BASE_INPUT = {
  prompt: "Hello world",
  maxTokens: 512,
};

// ---------------------------------------------------------------------------
// dispatchService
// ---------------------------------------------------------------------------

describe("dispatchService — vendor → service tag mapping", () => {
  it('maps "anthropic" → "anthropic"', () => {
    expect(dispatchService("anthropic")).toBe("anthropic");
  });

  it('maps "google" → "gemini"', () => {
    expect(dispatchService("google")).toBe("gemini");
  });

  it('maps "openai" → "openai"', () => {
    expect(dispatchService("openai")).toBe("openai");
  });

  it('maps unknown vendor → "openai" (catch-all)', () => {
    expect(dispatchService("azure")).toBe("openai");
    expect(dispatchService("perplexity")).toBe("openai");
    expect(dispatchService("")).toBe("openai");
  });
});

// ---------------------------------------------------------------------------
// generateText — Anthropic
// ---------------------------------------------------------------------------

describe("generateText — Anthropic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts text from the first text content block", async () => {
    mockAnthropicMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "Hello from Claude" }],
      usage: { input_tokens: 10, output_tokens: 4 },
    });

    const result = await generateText({
      llm: { vendor: "anthropic", model: "claude-3-haiku" },
      ...BASE_INPUT,
    });

    expect(result.text).toBe("Hello from Claude");
    expect(result.service).toBe("anthropic");
  });

  it("returns empty string when no text block is present", async () => {
    mockAnthropicMessagesCreate.mockResolvedValue({
      content: [{ type: "tool_use", id: "tu-1", name: "lookup", input: {} }],
      usage: { input_tokens: 5, output_tokens: 0 },
    });

    const result = await generateText({
      llm: { vendor: "anthropic", model: "claude-3-haiku" },
      ...BASE_INPUT,
    });

    expect(result.text).toBe("");
  });

  it("uses reported usage token counts when present", async () => {
    mockAnthropicMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 20, output_tokens: 5 },
    });

    const result = await generateText({
      llm: { vendor: "anthropic", model: "claude-3-haiku" },
      ...BASE_INPUT,
    });

    expect(result.inputTokens).toBe(20);
    expect(result.outputTokens).toBe(5);
  });

  it("falls back to length/4 for input tokens when usage is missing", async () => {
    const prompt = "A".repeat(40); // 40 chars → 10 approx tokens
    mockAnthropicMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "response" }],
      usage: undefined,
    });

    const result = await generateText({
      llm: { vendor: "anthropic", model: "claude-3-haiku" },
      prompt,
      maxTokens: 100,
    });

    expect(result.inputTokens).toBe(Math.round(prompt.length / 4));
  });

  it("falls back to length/4 for output tokens when usage is missing", async () => {
    const responseText = "B".repeat(80); // 80 chars → 20 approx tokens
    mockAnthropicMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: responseText }],
      usage: undefined,
    });

    const result = await generateText({
      llm: { vendor: "anthropic", model: "claude-3-haiku" },
      ...BASE_INPUT,
    });

    expect(result.outputTokens).toBe(Math.round(responseText.length / 4));
  });

  it("passes system prompt via native Anthropic system field", async () => {
    mockAnthropicMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await generateText({
      llm: { vendor: "anthropic", model: "claude-3-haiku" },
      prompt: "user message",
      system: "You are a helpful assistant.",
      maxTokens: 100,
    });

    const callArgs = mockAnthropicMessagesCreate.mock.calls[0][0];
    expect(callArgs.system).toBe("You are a helpful assistant.");
    expect(callArgs.messages).toEqual([{ role: "user", content: "user message" }]);
  });

  it("omits system field entirely when no system prompt provided", async () => {
    mockAnthropicMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await generateText({
      llm: { vendor: "anthropic", model: "claude-3-haiku" },
      prompt: "user message",
      maxTokens: 100,
    });

    const callArgs = mockAnthropicMessagesCreate.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty("system");
  });

  it("service tag is anthropic", async () => {
    mockAnthropicMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "x" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const result = await generateText({
      llm: { vendor: "anthropic", model: "claude-3-haiku" },
      ...BASE_INPUT,
    });

    expect(result.service).toBe("anthropic");
  });
});

// ---------------------------------------------------------------------------
// generateText — OpenAI
// ---------------------------------------------------------------------------

describe("generateText — OpenAI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts text from choices[0].message.content", async () => {
    mockOpenAIChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: "Hello from GPT" } }],
      usage: { prompt_tokens: 8, completion_tokens: 3 },
    });

    const result = await generateText({
      llm: { vendor: "openai", model: "gpt-4o" },
      ...BASE_INPUT,
    });

    expect(result.text).toBe("Hello from GPT");
    expect(result.service).toBe("openai");
  });

  it("returns empty string when choices is empty", async () => {
    mockOpenAIChatCompletionsCreate.mockResolvedValue({
      choices: [],
      usage: { prompt_tokens: 3, completion_tokens: 0 },
    });

    const result = await generateText({
      llm: { vendor: "openai", model: "gpt-4o" },
      ...BASE_INPUT,
    });

    expect(result.text).toBe("");
  });

  it("uses reported usage token counts when present", async () => {
    mockOpenAIChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 15, completion_tokens: 7 },
    });

    const result = await generateText({
      llm: { vendor: "openai", model: "gpt-4o" },
      ...BASE_INPUT,
    });

    expect(result.inputTokens).toBe(15);
    expect(result.outputTokens).toBe(7);
  });

  it("falls back to length/4 when usage is absent", async () => {
    const prompt = "C".repeat(60);
    const responseText = "D".repeat(20);
    mockOpenAIChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: responseText } }],
      usage: undefined,
    });

    const result = await generateText({
      llm: { vendor: "openai", model: "gpt-4o" },
      prompt,
      maxTokens: 100,
    });

    expect(result.inputTokens).toBe(Math.round(prompt.length / 4));
    expect(result.outputTokens).toBe(Math.round(responseText.length / 4));
  });

  it("injects system prompt as a system message before the user message", async () => {
    mockOpenAIChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

    await generateText({
      llm: { vendor: "openai", model: "gpt-4o" },
      prompt: "user question",
      system: "You are a concise assistant.",
      maxTokens: 100,
    });

    const { messages } = mockOpenAIChatCompletionsCreate.mock.calls[0][0];
    expect(messages).toEqual([
      { role: "system", content: "You are a concise assistant." },
      { role: "user", content: "user question" },
    ]);
  });

  it("sends only the user message when no system prompt provided", async () => {
    mockOpenAIChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

    await generateText({
      llm: { vendor: "openai", model: "gpt-4o" },
      prompt: "user question",
      maxTokens: 100,
    });

    const { messages } = mockOpenAIChatCompletionsCreate.mock.calls[0][0];
    expect(messages).toEqual([{ role: "user", content: "user question" }]);
  });

  it("service tag is openai", async () => {
    mockOpenAIChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: "x" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

    const result = await generateText({
      llm: { vendor: "openai", model: "gpt-4o" },
      ...BASE_INPUT,
    });

    expect(result.service).toBe("openai");
  });

  it("unknown vendor falls through to openai branch", async () => {
    mockOpenAIChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: "azure response" } }],
      usage: { prompt_tokens: 2, completion_tokens: 2 },
    });

    const result = await generateText({
      llm: { vendor: "azure", model: "gpt-4o" },
      ...BASE_INPUT,
    });

    expect(result.service).toBe("openai");
    expect(mockOpenAIChatCompletionsCreate).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// generateText — Gemini
// ---------------------------------------------------------------------------

describe("generateText — Gemini", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts text from response.text", async () => {
    mockGeminiModelsGenerateContent.mockResolvedValue({
      text: "Hello from Gemini",
      usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 4 },
    });

    const result = await generateText({
      llm: { vendor: "google", model: "gemini-1.5-pro" },
      ...BASE_INPUT,
    });

    expect(result.text).toBe("Hello from Gemini");
    expect(result.service).toBe("gemini");
  });

  it("returns empty string when response.text is nullish", async () => {
    mockGeminiModelsGenerateContent.mockResolvedValue({
      text: undefined,
      usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 0 },
    });

    const result = await generateText({
      llm: { vendor: "google", model: "gemini-1.5-pro" },
      ...BASE_INPUT,
    });

    expect(result.text).toBe("");
  });

  it("uses usageMetadata token counts when present", async () => {
    mockGeminiModelsGenerateContent.mockResolvedValue({
      text: "response",
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 },
    });

    const result = await generateText({
      llm: { vendor: "google", model: "gemini-1.5-pro" },
      ...BASE_INPUT,
    });

    expect(result.inputTokens).toBe(12);
    expect(result.outputTokens).toBe(8);
  });

  it("falls back to length/4 when usageMetadata is absent", async () => {
    const prompt = "E".repeat(48);
    const responseText = "F".repeat(32);
    mockGeminiModelsGenerateContent.mockResolvedValue({
      text: responseText,
      usageMetadata: undefined,
    });

    const result = await generateText({
      llm: { vendor: "google", model: "gemini-1.5-pro" },
      prompt,
      maxTokens: 100,
    });

    expect(result.inputTokens).toBe(Math.round(prompt.length / 4));
    expect(result.outputTokens).toBe(Math.round(responseText.length / 4));
  });

  it("prepends system prompt to user content (no native system role)", async () => {
    mockGeminiModelsGenerateContent.mockResolvedValue({
      text: "ok",
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });

    await generateText({
      llm: { vendor: "google", model: "gemini-1.5-pro" },
      prompt: "Tell me a joke",
      system: "You are a comedian.",
      maxTokens: 100,
    });

    const callArgs = mockGeminiModelsGenerateContent.mock.calls[0][0];
    const sentText = callArgs.contents[0].parts[0].text;
    expect(sentText).toBe("You are a comedian.\n\nTell me a joke");
  });

  it("sends prompt as-is when no system prompt provided", async () => {
    mockGeminiModelsGenerateContent.mockResolvedValue({
      text: "ok",
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });

    await generateText({
      llm: { vendor: "google", model: "gemini-1.5-pro" },
      prompt: "Just the prompt",
      maxTokens: 100,
    });

    const callArgs = mockGeminiModelsGenerateContent.mock.calls[0][0];
    const sentText = callArgs.contents[0].parts[0].text;
    expect(sentText).toBe("Just the prompt");
  });

  it("service tag is gemini", async () => {
    mockGeminiModelsGenerateContent.mockResolvedValue({
      text: "x",
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });

    const result = await generateText({
      llm: { vendor: "google", model: "gemini-1.5-pro" },
      ...BASE_INPUT,
    });

    expect(result.service).toBe("gemini");
  });
});

// ---------------------------------------------------------------------------
// streamText — Anthropic
// ---------------------------------------------------------------------------

describe("streamText — Anthropic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("yields text_delta fragments from content_block_delta events", async () => {
    const events = [
      { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
      { type: "content_block_delta", delta: { type: "text_delta", text: " world" } },
      { type: "message_stop" },
    ];
    mockAnthropicMessagesStream.mockReturnValue(makeAsyncIterable(events));

    const chunks = await collectStream(
      streamText({ llm: { vendor: "anthropic", model: "claude-3-haiku" }, ...BASE_INPUT }),
    );

    expect(chunks).toEqual(["Hello", " world"]);
  });

  it("skips non-text-delta events", async () => {
    const events = [
      { type: "message_start" },
      { type: "content_block_start", index: 0 },
      { type: "content_block_delta", delta: { type: "text_delta", text: "chunk" } },
      { type: "content_block_stop" },
      { type: "message_stop" },
    ];
    mockAnthropicMessagesStream.mockReturnValue(makeAsyncIterable(events));

    const chunks = await collectStream(
      streamText({ llm: { vendor: "anthropic", model: "claude-3-haiku" }, ...BASE_INPUT }),
    );

    expect(chunks).toEqual(["chunk"]);
  });

  it("passes system prompt via native system field in stream call", async () => {
    mockAnthropicMessagesStream.mockReturnValue(makeAsyncIterable([]));

    await collectStream(
      streamText({
        llm: { vendor: "anthropic", model: "claude-3-haiku" },
        prompt: "stream me",
        system: "You are streaming.",
        maxTokens: 50,
      }),
    );

    const callArgs = mockAnthropicMessagesStream.mock.calls[0][0];
    expect(callArgs.system).toBe("You are streaming.");
    expect(callArgs.messages).toEqual([{ role: "user", content: "stream me" }]);
  });

  it("yields nothing for empty stream", async () => {
    mockAnthropicMessagesStream.mockReturnValue(makeAsyncIterable([]));

    const chunks = await collectStream(
      streamText({ llm: { vendor: "anthropic", model: "claude-3-haiku" }, ...BASE_INPUT }),
    );

    expect(chunks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// streamText — OpenAI
// ---------------------------------------------------------------------------

describe("streamText — OpenAI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("yields content deltas from stream chunks", async () => {
    const streamChunks = [
      { choices: [{ delta: { content: "Hello" } }] },
      { choices: [{ delta: { content: " there" } }] },
      { choices: [{ delta: {} }] }, // empty delta, should be skipped
    ];
    mockOpenAIChatCompletionsCreate.mockResolvedValue(makeAsyncIterable(streamChunks));

    const chunks = await collectStream(
      streamText({ llm: { vendor: "openai", model: "gpt-4o" }, ...BASE_INPUT }),
    );

    expect(chunks).toEqual(["Hello", " there"]);
  });

  it("skips chunks with falsy content", async () => {
    const streamChunks = [
      { choices: [{ delta: { content: null } }] },
      { choices: [{ delta: { content: "" } }] },
      { choices: [{ delta: { content: "real" } }] },
    ];
    mockOpenAIChatCompletionsCreate.mockResolvedValue(makeAsyncIterable(streamChunks));

    const chunks = await collectStream(
      streamText({ llm: { vendor: "openai", model: "gpt-4o" }, ...BASE_INPUT }),
    );

    expect(chunks).toEqual(["real"]);
  });

  it("injects system message before user message in stream call", async () => {
    mockOpenAIChatCompletionsCreate.mockResolvedValue(makeAsyncIterable([]));

    await collectStream(
      streamText({
        llm: { vendor: "openai", model: "gpt-4o" },
        prompt: "stream prompt",
        system: "You are an assistant.",
        maxTokens: 50,
      }),
    );

    const { messages, stream } = mockOpenAIChatCompletionsCreate.mock.calls[0][0];
    expect(stream).toBe(true);
    expect(messages).toEqual([
      { role: "system", content: "You are an assistant." },
      { role: "user", content: "stream prompt" },
    ]);
  });

  it("yields nothing for empty stream", async () => {
    mockOpenAIChatCompletionsCreate.mockResolvedValue(makeAsyncIterable([]));

    const chunks = await collectStream(
      streamText({ llm: { vendor: "openai", model: "gpt-4o" }, ...BASE_INPUT }),
    );

    expect(chunks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// streamText — Gemini
// ---------------------------------------------------------------------------

describe("streamText — Gemini", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("yields text from each stream chunk", async () => {
    const streamChunks = [{ text: "Gem" }, { text: "ini" }, { text: " stream" }];
    mockGeminiModelsGenerateContentStream.mockResolvedValue(makeAsyncIterable(streamChunks));

    const chunks = await collectStream(
      streamText({ llm: { vendor: "google", model: "gemini-1.5-pro" }, ...BASE_INPUT }),
    );

    expect(chunks).toEqual(["Gem", "ini", " stream"]);
  });

  it("skips chunks with falsy text", async () => {
    const streamChunks = [{ text: "" }, { text: null }, { text: "only this" }];
    mockGeminiModelsGenerateContentStream.mockResolvedValue(makeAsyncIterable(streamChunks));

    const chunks = await collectStream(
      streamText({ llm: { vendor: "google", model: "gemini-1.5-pro" }, ...BASE_INPUT }),
    );

    expect(chunks).toEqual(["only this"]);
  });

  it("prepends system prompt to user content in stream call", async () => {
    mockGeminiModelsGenerateContentStream.mockResolvedValue(makeAsyncIterable([]));

    await collectStream(
      streamText({
        llm: { vendor: "google", model: "gemini-1.5-pro" },
        prompt: "stream me",
        system: "System instruction.",
        maxTokens: 50,
      }),
    );

    const callArgs = mockGeminiModelsGenerateContentStream.mock.calls[0][0];
    const sentText = callArgs.contents[0].parts[0].text;
    expect(sentText).toBe("System instruction.\n\nstream me");
  });

  it("sends prompt as-is when no system provided in stream call", async () => {
    mockGeminiModelsGenerateContentStream.mockResolvedValue(makeAsyncIterable([]));

    await collectStream(
      streamText({
        llm: { vendor: "google", model: "gemini-1.5-pro" },
        prompt: "raw prompt",
        maxTokens: 50,
      }),
    );

    const callArgs = mockGeminiModelsGenerateContentStream.mock.calls[0][0];
    const sentText = callArgs.contents[0].parts[0].text;
    expect(sentText).toBe("raw prompt");
  });

  it("yields nothing for empty stream", async () => {
    mockGeminiModelsGenerateContentStream.mockResolvedValue(makeAsyncIterable([]));

    const chunks = await collectStream(
      streamText({ llm: { vendor: "google", model: "gemini-1.5-pro" }, ...BASE_INPUT }),
    );

    expect(chunks).toEqual([]);
  });
});
