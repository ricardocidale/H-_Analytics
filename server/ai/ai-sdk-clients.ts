/**
 * server/ai/ai-sdk-clients.ts — Vercel AI SDK clients routed through AI Gateway
 *
 * OT-A.2 plumbing. Mirrors the singleton pattern in `clients.ts` but uses the
 * Vercel AI SDK Gateway provider so every model call flows through Vercel's
 * AI Gateway (https://ai-gateway.vercel.sh). Benefits: unified observability,
 * automatic provider failover, and Anthropic native prompt-caching support
 * via the SDK's structured-output APIs (streamObject / generateObject).
 *
 * BYOK: Gateway forwards to the underlying provider with your existing keys
 * (configured in your Vercel Gateway dashboard). Zero markup on provider bills.
 *
 * Each factory returns a callable `(modelId) => LanguageModel` so call sites
 * can write `getAiSdkAnthropic()("claude-opus-4-6")` mirroring the per-provider
 * shape the legacy `clients.ts` consumers expect.
 *
 * Usage (consumed in OT-A.3):
 *   import { getAiSdkAnthropic } from "./ai-sdk-clients";
 *   import { streamObject } from "ai";
 *   const result = streamObject({
 *     model: getAiSdkAnthropic()("claude-opus-4-6"),
 *     schema: SynthesisOutputSchema,
 *     ...
 *   });
 *
 * Status of existing call sites: NONE migrated by OT-A.2 — the legacy
 * singletons in `clients.ts` keep working. Both paths coexist until OT-A.4.
 */
import { createGateway } from "ai";
import type { LanguageModel } from "ai";

type Gateway = ReturnType<typeof createGateway>;
let _gateway: Gateway | null = null;

function getGateway(): Gateway {
  if (_gateway) return _gateway;
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI_GATEWAY_API_KEY not configured. Add the Vercel AI Gateway key to Replit Secrets " +
      "before using server/ai/ai-sdk-clients.ts. Legacy clients in server/ai/clients.ts still work.",
    );
  }
  _gateway = createGateway({ apiKey });
  return _gateway;
}

/** Anthropic models routed through Gateway. Use Gateway-style ids ("claude-opus-4-6"). */
export function getAiSdkAnthropic(): (modelId: string) => LanguageModel {
  const gw = getGateway();
  return (modelId: string) => gw.languageModel(`anthropic/${modelId}`);
}

/** Google Gemini models routed through Gateway. */
export function getAiSdkGoogle(): (modelId: string) => LanguageModel {
  const gw = getGateway();
  return (modelId: string) => gw.languageModel(`google/${modelId}`);
}

/** OpenAI models routed through Gateway. */
export function getAiSdkOpenAI(): (modelId: string) => LanguageModel {
  const gw = getGateway();
  return (modelId: string) => gw.languageModel(`openai/${modelId}`);
}

// ── Test seam ──────────────────────────────────────────────
// Exposed so tests can reset the singleton between runs.
export function _resetAiSdkClientsForTesting(): void {
  _gateway = null;
}
