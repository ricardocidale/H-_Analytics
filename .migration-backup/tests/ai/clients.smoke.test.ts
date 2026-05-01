/**
 * tests/ai/clients.smoke.test.ts
 *
 * Cold-start guarantee for `server/ai/clients.ts`: importing the module
 * with no provider env vars set must succeed. Only calling a factory should
 * throw, and every factory must throw with the same uniform error shape.
 *
 * This guards against regressions where a new provider client reads
 * `process.env` at module top level — that would crash the worker before
 * the missing-secret error has any chance to surface.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

const KEYS = [
  "AI_INTEGRATIONS_OPENAI_API_KEY",
  "AI_INTEGRATIONS_OPENAI_BASE_URL",
  "ANTHROPIC_API_KEY",
  "AI_INTEGRATIONS_ANTHROPIC_API_KEY",
  "AI_INTEGRATIONS_ANTHROPIC_BASE_URL",
  "AI_INTEGRATIONS_GEMINI_API_KEY",
  "AI_INTEGRATIONS_GEMINI_BASE_URL",
  "PERPLEXITY_API_KEY",
] as const;

const saved: Record<string, string | undefined> = {};

// Snapshot original env values exactly once so subsequent `beforeEach`
// deletions can't overwrite the originals with undefined and leak
// missing keys to other test files in the same worker.
beforeAll(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
  }
});

beforeEach(() => {
  for (const k of KEYS) {
    delete process.env[k];
  }
  // Force a fresh module load so cached singletons from earlier tests
  // (or earlier cases in this file) don't shadow the missing-key throw.
  vi.resetModules();
});

afterAll(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("server/ai/clients module load", () => {
  it("loads without any provider env vars set", async () => {
    const mod = await import("../../server/ai/clients");
    expect(typeof mod.getOpenAIClient).toBe("function");
    expect(typeof mod.getAnthropicClient).toBe("function");
    expect(typeof mod.getGeminiClient).toBe("function");
    expect(typeof mod.getPerplexityClient).toBe("function");
    expect(typeof mod.normalizeModelId).toBe("function");
  });

  it.each([
    ["getOpenAIClient", "OpenAI", "AI_INTEGRATIONS_OPENAI_API_KEY"],
    ["getAnthropicClient", "Anthropic", "ANTHROPIC_API_KEY"],
    ["getGeminiClient", "Gemini", "AI_INTEGRATIONS_GEMINI_API_KEY"],
    ["getPerplexityClient", "Perplexity", "PERPLEXITY_API_KEY"],
  ] as const)(
    "%s throws a uniform missing-key error",
    async (factoryName, provider, envVar) => {
      const mod = await import("../../server/ai/clients");
      const factory = mod[factoryName] as () => unknown;
      expect(() => factory()).toThrow(
        `${provider} API key not configured (set ${envVar})`,
      );
    },
  );
});
