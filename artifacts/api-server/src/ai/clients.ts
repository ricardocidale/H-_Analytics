/**
 * server/ai/clients.ts — Singleton AI SDK clients
 *
 * Centralized lazy-singleton factories for OpenAI, Anthropic, Gemini, and
 * Perplexity. Each client is created once on first use and reused for all
 * subsequent calls. This prevents per-request instantiation overhead (TCP
 * connections, token refresh) and provides a single place to configure base
 * URLs, API versions, etc.
 *
 * All factories share the same missing-key error shape via `requireApiKey`,
 * so downstream callers can rely on a consistent message format. The module
 * itself never reads `process.env` at import time — keys are only inspected
 * inside the factory call. That guarantees that loading this module with no
 * env vars set is safe (cold starts won't crash before the missing-secret
 * error has a chance to surface).
 *
 * Usage:
 *   import { getOpenAIClient, getAnthropicClient, getGeminiClient, getPerplexityClient } from "../ai/clients";
 */
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { Perplexity } from "@perplexity-ai/perplexity_ai";

// ── Shared key check ────────────────────────────────────

/**
 * Resolve the first non-empty value from the given env var names and return it.
 * Throws a uniformly-shaped error referencing the provider name and the
 * primary env var if none are set. Centralizing this means every factory
 * fails the same way, which makes downstream error handling and log scraping
 * predictable.
 */
function requireApiKey(provider: string, envVars: [string, ...string[]]): string {
  for (const name of envVars) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`${provider} API key not configured (set ${envVars[0]})`);
}

// ── OpenAI ──────────────────────────────────────────────

let _openai: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (_openai) return _openai;
  const apiKey = requireApiKey("OpenAI", ["AI_INTEGRATIONS_OPENAI_API_KEY"]);
  _openai = new OpenAI({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
  });
  return _openai;
}

// ── Anthropic ────────────────────────────────────────────

let _anthropic: Anthropic | null = null;

/**
 * Returns a shared Anthropic client. Uses ANTHROPIC_API_KEY by default,
 * falling back to AI_INTEGRATIONS_ANTHROPIC_API_KEY (Replit connector alias).
 * Optional baseURL override via AI_INTEGRATIONS_ANTHROPIC_BASE_URL.
 */
export function getAnthropicClient(): Anthropic {
  if (_anthropic) return _anthropic;
  const apiKey = requireApiKey("Anthropic", ["ANTHROPIC_API_KEY", "AI_INTEGRATIONS_ANTHROPIC_API_KEY"]);
  _anthropic = new Anthropic({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined,
  });
  return _anthropic;
}

// ── Google Gemini ────────────────────────────────────────

let _gemini: GoogleGenAI | null = null;

/**
 * Returns a shared Google Gemini client.
 * Optional base URL override via AI_INTEGRATIONS_GEMINI_BASE_URL.
 */
export function getGeminiClient(): GoogleGenAI {
  if (_gemini) return _gemini;
  const apiKey = requireApiKey("Gemini", ["AI_INTEGRATIONS_GEMINI_API_KEY"]);
  _gemini = new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: "",
      baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
    },
  });
  return _gemini;
}

// ── Model normalization ─────────────────────────────────
// Source of truth: lib/shared/src/llm-models.ts
// This file re-exports the shared normalizer under its legacy name so
// existing call sites continue to work without churn.

export {
  normalizeClaudeModelId as normalizeModelId,
  DEPRECATED_CLAUDE_MODEL_MAP as DEPRECATED_MODEL_MAP,
} from "@shared/llm-models";

// ── Perplexity ──────────────────────────────────────────

let _perplexity: Perplexity | null = null;

export function getPerplexityClient(): Perplexity {
  if (_perplexity) return _perplexity;
  const apiKey = requireApiKey("Perplexity", ["PERPLEXITY_API_KEY"]);
  _perplexity = new Perplexity({ apiKey });
  return _perplexity;
}
