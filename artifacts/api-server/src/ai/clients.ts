/**
 * server/ai/clients.ts — Singleton AI SDK clients
 *
 * Centralized lazy-singleton factories for OpenAI, Anthropic, Gemini,
 * Perplexity, Exa, DeepSeek, and Mistral. Each client is created once on
 * first use and reused for all subsequent calls. This prevents per-request
 * instantiation overhead (TCP connections, token refresh) and provides a
 * single place to configure base URLs, API versions, etc.
 *
 * All factories share the same missing-key error shape via `requireApiKey`,
 * so downstream callers can rely on a consistent message format. The module
 * itself never reads `process.env` at import time — keys are only inspected
 * inside the factory call. That guarantees that loading this module with no
 * env vars set is safe (cold starts won't crash before the missing-secret
 * error has a chance to surface).
 *
 * Usage:
 *   import { getOpenAIClient, getAnthropicClient, getGeminiClient, getExaClient } from "../ai/clients";
 *   import { getDeepSeekClient, getMistralClient, getMistralOcrClient } from "../ai/clients";
 */
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { Perplexity } from "@perplexity-ai/perplexity_ai";
import Exa from "exa-js";
import { Mistral } from "@mistralai/mistralai";
import { logger } from "../logger";

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

const DEPRECATED_MODEL_MAP: Record<string, string> = {
  "claude-3-5-sonnet-20241022": "claude-sonnet-4-5",
  "claude-3-5-sonnet": "claude-sonnet-4-5",
  "claude-3-opus-20240229": "claude-sonnet-4-5",
  "claude-opus-4-7": "claude-sonnet-4-5",
};

export function normalizeModelId(model: string): string {
  return DEPRECATED_MODEL_MAP[model] || model;
}

// ── Perplexity (used by web-research.ts and GroundedResearchService) ────────

let _perplexity: Perplexity | null = null;

export function getPerplexityClient(): Perplexity {
  if (_perplexity) return _perplexity;
  const apiKey = requireApiKey("Perplexity", ["PERPLEXITY_API_KEY"]);
  _perplexity = new Perplexity({ apiKey });
  return _perplexity;
}

// ── Exa ─────────────────────────────────────────────────

let _exa: Exa | null = null;

export function getExaClient(): Exa {
  if (_exa) return _exa;
  const apiKey = requireApiKey("Exa", ["EXA_API_KEY"]);
  _exa = new Exa(apiKey);
  return _exa;
}

// ── DeepSeek ─────────────────────────────────────────────
//
// Uses the OpenAI-compatible SDK with an explicit baseURL to prevent
// OPENAI_BASE_URL env-var bleed (see integration-issues/openai-sdk-env-base-url-overrides-*).
// baseURL is read from DEEPSEEK_API_BASE_URL env var (if set) or resolved once
// from the deepseek-v4-flash model row's config.endpoint on first call.

let _deepseek: OpenAI | null = null;
let _deepseekInitPromise: Promise<OpenAI> | null = null;

async function resolveDeepSeekBaseUrl(): Promise<string> {
  if (process.env.DEEPSEEK_API_BASE_URL) return process.env.DEEPSEEK_API_BASE_URL;
  // Resolve from admin_resources model row to avoid hardcoding the URL here.
  const { storage } = await import("../storage");
  const row = await storage.getAdminResourceBySlug?.("model", "deepseek-v4-flash");
  const endpoint = row?.config?.endpoint as string | undefined;
  if (!endpoint) {
    throw new Error(
      "[matteo:deepseek:init] deepseek-v4-flash model row missing config.endpoint — set DEEPSEEK_API_BASE_URL or re-run admin-resources-006-matteo-router migration",
    );
  }
  return endpoint;
}

export function getDeepSeekClient(): Promise<OpenAI> {
  if (_deepseek) return Promise.resolve(_deepseek);
  if (_deepseekInitPromise) return _deepseekInitPromise;
  _deepseekInitPromise = (async () => {
    const apiKey = requireApiKey("DeepSeek", ["DEEPSEEK_API_KEY"]);
    const baseURL = await resolveDeepSeekBaseUrl();
    // Explicit baseURL prevents OPENAI_BASE_URL env var from bleeding into DeepSeek calls.
    _deepseek = new OpenAI({ apiKey, baseURL });
    logger.info(`[matteo:deepseek:init] baseURL=${baseURL}`, "clients");
    return _deepseek;
  })();
  return _deepseekInitPromise;
}

// ── Mistral chat ──────────────────────────────────────────
//
// Uses the @mistralai/mistralai first-party SDK with explicit client
// construction (serverURL from env var or model row) for clean initialization.

let _mistral: Mistral | null = null;

export function getMistralClient(): Mistral {
  if (_mistral) return _mistral;
  const apiKey = requireApiKey("Mistral", ["MISTRAL_API_KEY"]);
  _mistral = new Mistral({ apiKey });
  logger.info("[matteo:mistral:init] client initialized", "clients");
  return _mistral;
}

// ── Mistral OCR (HTTP-only) ───────────────────────────────
//
// Mistral OCR 3 is an HTTP-only API, not a chat model. This thin wrapper
// exposes a single `extractText(pdfBase64, mimeType)` method backed by
// a fetch call against the endpoint stored in the admin_resources api row.

export interface MistralOcrClient {
  extractText(params: {
    pdfBase64: string;
    documentName?: string;
  }): Promise<{ pages: Array<{ index: number; markdown: string }> }>;
}

const MISTRAL_OCR_MODEL_FALLBACK = "mistral-ocr-latest";

async function getMistralOcrConfig(): Promise<{ endpoint: string; model: string }> {
  if (process.env.MISTRAL_OCR_ENDPOINT) {
    return { endpoint: process.env.MISTRAL_OCR_ENDPOINT, model: MISTRAL_OCR_MODEL_FALLBACK };
  }
  const { storage } = await import("../storage");
  const row = await storage.getAdminResourceBySlug?.("api", "mistral-ocr-3");
  const endpoint = row?.config?.endpoint as string | undefined;
  if (!endpoint) {
    throw new Error(
      "[matteo:mistral-ocr:init] mistral-ocr-3 api row missing config.endpoint — set MISTRAL_OCR_ENDPOINT or re-run admin-resources-006-matteo-router migration",
    );
  }
  const model = (row?.config?.model as string | undefined) ?? MISTRAL_OCR_MODEL_FALLBACK;
  return { endpoint, model };
}

export async function getMistralOcrClient(): Promise<MistralOcrClient> {
  const apiKey = requireApiKey("Mistral OCR", ["MISTRAL_API_KEY"]);
  const { endpoint, model } = await getMistralOcrConfig();
  logger.info(`[matteo:mistral-ocr:init] endpoint=${endpoint}`, "clients");
  return {
    async extractText({ pdfBase64, documentName }) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          document: {
            type: "document_url",
            ...(documentName ? { document_name: documentName } : {}),
            document_url: `data:application/pdf;base64,${pdfBase64}`,
          },
          include_image_base64: false,
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "(no body)");
        throw new Error(`Mistral OCR API error ${response.status}: ${body}`);
      }
      return response.json() as Promise<{
        pages: Array<{ index: number; markdown: string }>;
      }>;
    },
  };
}
