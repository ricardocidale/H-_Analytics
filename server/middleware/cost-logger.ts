/**
 * server/middleware/cost-logger.ts — Lightweight API cost logging.
 *
 * Appends one JSON line per external API call to logs/api-costs.jsonl.
 * Fire-and-forget — never blocks the request, never throws.
 *
 * Usage in route handlers:
 *   import { logApiCost, estimateCost } from "../middleware/cost-logger";
 *   logApiCost({ service: "anthropic", model: "claude-sonnet-4-20250514", ... });
 */

import fs from "node:fs";
import path from "node:path";
import pricingConfig from "../config/llm-pricing.json";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CostEntry {
  timestamp: string;
  service:
    | "anthropic"
    | "openai"
    | "gemini"
    | "replicate"
    | "resend"
    | "document-ai"
    | "google-maps"
    | "perplexity"
    | "tavily";
  model?: string;
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd: number;
  durationMs?: number;
  userId?: number;
  route: string;
}

// ── Pricing loaded from server/config/llm-pricing.json ───────────────────────

const TOKEN_PRICING: Record<string, { input: number; output: number }> =
  pricingConfig.tokenPricing;

const UNIT_PRICING: Record<string, number> =
  pricingConfig.unitPricing;

// ── Cost Estimation ──────────────────────────────────────────────────────────

export function estimateCost(
  service: string,
  model: string | undefined,
  inputTokens: number,
  outputTokens: number,
): number {
  // Try token-based pricing first
  if (model && TOKEN_PRICING[model]) {
    const p = TOKEN_PRICING[model];
    return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  }

  const serviceDefaults: Record<string, { input: number; output: number }> =
    pricingConfig.serviceDefaults;

  if (serviceDefaults[service]) {
    const p = serviceDefaults[service];
    return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  }

  return 0;
}

/** Look up flat per-unit cost */
export function unitCost(key: string): number {
  return UNIT_PRICING[key] ?? 0;
}

// ── Log Writer ───────────────────────────────────────────────────────────────

const LOG_DIR = path.resolve(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "api-costs.jsonl");

let dirChecked = false;

function ensureDir(): void {
  if (dirChecked) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // ignore — may already exist
  }
  dirChecked = true;
}

/**
 * Append a cost entry to the log. Fire-and-forget — never throws.
 */
export function logApiCost(entry: CostEntry): void {
  try {
    ensureDir();
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // Silent — logging must never break a request
  }
}
