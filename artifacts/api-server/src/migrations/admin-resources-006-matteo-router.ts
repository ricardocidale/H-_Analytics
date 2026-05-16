/**
 * admin-resources-006-matteo-router — Matteo model router seed.
 *
 * Provisions all admin_resources rows required for the Matteo model router
 * (T3-1). Adds:
 *
 *   - kind='model' rows for DeepSeek V4 Flash, DeepSeek V4, Mistral Large,
 *     Mistral Small, and Claude Haiku 4.5 (short slug alias).
 *   - kind='api' row for Mistral OCR 3 (HTTP-only, not a chat model).
 *   - kind='llm_slot' rows for new task types:
 *       pdf-ocr-extraction   → mistral-ocr-3
 *       structured-extraction→ gemini-2-5-flash
 *       bulk-text-synthesis  → deepseek-v4-flash
 *       costantino-orchestration (missing seed fix — resolver throws today)
 *
 * Idempotent — ON CONFLICT (kind, slug) DO NOTHING. Safe to re-run.
 *
 * Pricing sources:
 *   DeepSeek V4 Flash — https://platform.deepseek.com/docs/pricing (2026-05)
 *   Mistral OCR 3     — https://mistral.ai/en/news/mistral-ocr (2026-05)
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-006-matteo-router";

type ResourceKind =
  | "api"
  | "source"
  | "model"
  | "table"
  | "benchmark"
  | "llm_slot"
  | "parameter";

interface SeedRow {
  kind: ResourceKind;
  slug: string;
  displayName: string;
  description: string;
  config: Record<string, unknown>;
}

// ── DeepSeek model rows ────────────────────────────────────────────────────
// OpenAI-compatible API. Client factory uses explicit baseURL from config.endpoint
// to prevent OPENAI_BASE_URL env-var bleed (see integration-issues/openai-sdk-env-base-url-overrides-*).
// modelId uses the vendor-published identifier (with period); slug uses hyphens.
// Pricing: $0.27/$1.10 per million input/output tokens (DeepSeek V4 Flash, 2026-05).
const SEED_DEEPSEEK_V4_FLASH_INPUT_COST_PER_M = 0.27;
const SEED_DEEPSEEK_V4_FLASH_OUTPUT_COST_PER_M = 1.10;
const SEED_DEEPSEEK_V4_INPUT_COST_PER_M = 0.55;
const SEED_DEEPSEEK_V4_OUTPUT_COST_PER_M = 2.19;

// ── Mistral pricing ────────────────────────────────────────────────────────
// Mistral Large: $2/$6 per million input/output tokens (2026-05).
// Mistral Small: $0.20/$0.60 per million input/output tokens (2026-05).
// Mistral OCR 3: $2 per 1000 pages (flat rate) — stored in config.notes.
const SEED_MISTRAL_LARGE_INPUT_COST_PER_M = 2.0;
const SEED_MISTRAL_LARGE_OUTPUT_COST_PER_M = 6.0;
const SEED_MISTRAL_SMALL_INPUT_COST_PER_M = 0.20;
const SEED_MISTRAL_SMALL_OUTPUT_COST_PER_M = 0.60;

const MODEL_ROWS: SeedRow[] = [
  // DeepSeek V4 Flash — primary bulk-text/code model
  {
    kind: "model",
    slug: "deepseek-v4-flash",
    displayName: "DeepSeek V4 Flash",
    description:
      "DeepSeek V4 Flash — bulk text/code synthesis at ~10–20× lower cost than Sonnet. " +
      "OpenAI-compatible API. Routed via Matteo for bulk-text-synthesis slot.",
    config: {
      vendor: "deepseek",
      modelId: "deepseek-v4-flash",
      endpoint: "https://api.deepseek.com/v1",
      inputCostPerMillionTokens: SEED_DEEPSEEK_V4_FLASH_INPUT_COST_PER_M,
      outputCostPerMillionTokens: SEED_DEEPSEEK_V4_FLASH_OUTPUT_COST_PER_M,
      notes: "Source: https://platform.deepseek.com/docs/pricing (2026-05)",
    },
  },
  // DeepSeek V4 — higher-capability tier for when V4 Flash quality is insufficient
  {
    kind: "model",
    slug: "deepseek-v4",
    displayName: "DeepSeek V4",
    description:
      "DeepSeek V4 — higher-capability DeepSeek tier for complex synthesis tasks. " +
      "OpenAI-compatible API. Admin can re-route any slot to this tier.",
    config: {
      vendor: "deepseek",
      modelId: "deepseek-v4",
      endpoint: "https://api.deepseek.com/v1",
      inputCostPerMillionTokens: SEED_DEEPSEEK_V4_INPUT_COST_PER_M,
      outputCostPerMillionTokens: SEED_DEEPSEEK_V4_OUTPUT_COST_PER_M,
      notes: "Source: https://platform.deepseek.com/docs/pricing (2026-05)",
    },
  },
  // Mistral Large — high-quality Mistral chat model
  {
    kind: "model",
    slug: "mistral-large-latest",
    displayName: "Mistral Large (latest)",
    description:
      "Mistral Large — Mistral's strongest chat model. Suitable for reasoning-intensive tasks. " +
      "Admin can assign to any slot via the LLM Workflows page.",
    config: {
      vendor: "mistral",
      modelId: "mistral-large-latest",
      endpoint: "https://api.mistral.ai",
      inputCostPerMillionTokens: SEED_MISTRAL_LARGE_INPUT_COST_PER_M,
      outputCostPerMillionTokens: SEED_MISTRAL_LARGE_OUTPUT_COST_PER_M,
      notes: "Source: https://mistral.ai/technology/#pricing (2026-05)",
    },
  },
  // Mistral Small — cost-efficient Mistral chat model
  {
    kind: "model",
    slug: "mistral-small-latest",
    displayName: "Mistral Small (latest)",
    description:
      "Mistral Small — cost-efficient Mistral chat model for classification and extraction tasks. " +
      "Admin can assign to any slot via the LLM Workflows page.",
    config: {
      vendor: "mistral",
      modelId: "mistral-small-latest",
      endpoint: "https://api.mistral.ai",
      inputCostPerMillionTokens: SEED_MISTRAL_SMALL_INPUT_COST_PER_M,
      outputCostPerMillionTokens: SEED_MISTRAL_SMALL_OUTPUT_COST_PER_M,
      notes: "Source: https://mistral.ai/technology/#pricing (2026-05)",
    },
  },
  // Claude Haiku 4.5 (short slug alias) — referenced by Bianca and other lightweight slots
  {
    kind: "model",
    slug: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    description:
      "Anthropic Claude Haiku 4.5 — fast, vision-capable, low cost. " +
      "Short-slug alias for claude-haiku-4-5-20251001 for slot compatibility.",
    config: {
      vendor: "anthropic",
      modelId: "claude-haiku-4-5-20251001",
    },
  },
];

// ── Mistral OCR API row ────────────────────────────────────────────────────
// Mistral OCR 3 is an HTTP-only API (not a chat model). It uses kind='api',
// not kind='model'. The client wraps fetch against config.endpoint.
// Rate: $2 per 1000 pages (flat-rate OCR, 2026-05).
const API_ROWS: SeedRow[] = [
  {
    kind: "api",
    slug: "mistral-ocr-3",
    displayName: "Mistral OCR 3",
    description:
      "Mistral OCR 3 — purpose-built PDF/document OCR API. ~$2/1K pages. " +
      "HTTP-only (not a chat model). Used by the pdf-ocr-extraction slot. " +
      "Client wraps fetch against config.endpoint.",
    config: {
      vendor: "mistral",
      apiKeyRef: "MISTRAL_API_KEY",
      endpoint: "https://api.mistral.ai/v1/ocr",
      pricingNotes:
        "~$2 per 1000 pages (flat rate). Source: https://mistral.ai/en/news/mistral-ocr (2026-05)",
      healthProbe: {
        kind: "http",
        method: "GET",
        path: "/v1/models",
        expectedStatus: 200,
      },
    },
  },
];

// ── New LLM slot rows ──────────────────────────────────────────────────────
const LLM_SLOT_ROWS: SeedRow[] = [
  // PDF / OCR text extraction — routes to Mistral OCR 3 (kind='api')
  // Resolver treats this differently: vendor='mistral-ocr', kind='api'.
  {
    kind: "llm_slot",
    slug: "pdf-ocr-extraction",
    displayName: "PDF / OCR Extraction",
    description:
      "Slot for PDF text extraction and OCR workloads. Defaults to Mistral OCR 3 (~$2/1K pages). " +
      "Admin can re-route to any OCR-capable model.",
    config: {
      modelSlug: "mistral-ocr-3",
      notes: "Mistral OCR 3 uses kind=api; client wraps fetch, not chat completions.",
    },
  },
  // Bulk structured extraction — routes to Gemini 2.5 Flash
  {
    kind: "llm_slot",
    slug: "structured-extraction",
    displayName: "Structured Extraction",
    description:
      "Slot for bulk structured data extraction (JSON schemas from documents, tables, records). " +
      "Defaults to Gemini 2.5 Flash for cost-efficient structured output.",
    config: { modelSlug: "gemini-2-5-flash" },
  },
  // Bulk text / code synthesis — routes to DeepSeek V4 Flash
  {
    kind: "llm_slot",
    slug: "bulk-text-synthesis",
    displayName: "Bulk Text / Code Synthesis",
    description:
      "Slot for high-volume text or code synthesis tasks where quality matches Sonnet at 10–20× lower cost. " +
      "Defaults to DeepSeek V4 Flash. Admin can promote to DeepSeek V4 or Sonnet if quality monitoring shows gaps.",
    config: { modelSlug: "deepseek-v4-flash" },
  },
  // Costantino orchestration — missing seed fix.
  // Code paths reference this slug; resolveLlmFor throws at runtime today.
  {
    kind: "llm_slot",
    slug: "costantino-orchestration",
    displayName: "Costantino Orchestration",
    description:
      "LLM slot for Costantino (data custodian) periodic health-audit orchestration runs. " +
      "Defaults to Claude Haiku 4.5 for cost-efficient scheduled checks.",
    config: { modelSlug: "claude-haiku-4-5" },
  },
];

async function batchInsert(rows: SeedRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values = sql.join(
    rows.map(
      (r) =>
        sql`(${r.kind}, ${r.slug}, ${r.displayName}, ${r.description}, ${JSON.stringify(r.config)}::jsonb)`,
    ),
    sql`, `,
  );
  const result = await db.execute(sql`
    INSERT INTO admin_resources (kind, slug, display_name, description, config)
    VALUES ${values}
    ON CONFLICT (kind, slug) DO NOTHING
    RETURNING id
  `);
  return Array.isArray(result.rows) ? result.rows.length : 0;
}

export async function runAdminResources006MatteoRouter(): Promise<void> {
  const modelsSeeded = await batchInsert(MODEL_ROWS);
  logger.info(
    `${TAG} model rows: ${modelsSeeded} seeded (${MODEL_ROWS.length - modelsSeeded} already existed)`,
  );

  const apisSeeded = await batchInsert(API_ROWS);
  logger.info(
    `${TAG} api rows: ${apisSeeded} seeded (${API_ROWS.length - apisSeeded} already existed)`,
  );

  const slotsSeeded = await batchInsert(LLM_SLOT_ROWS);
  logger.info(
    `${TAG} llm_slot rows: ${slotsSeeded} seeded (${LLM_SLOT_ROWS.length - slotsSeeded} already existed)`,
  );

  logger.info(
    `${TAG} complete — Matteo model router seed applied`,
  );
}
