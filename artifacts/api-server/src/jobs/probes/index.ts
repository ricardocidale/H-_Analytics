/**
 * Probe profiles for the Resources health subsystem (P3).
 *
 * Each probe MUST be:
 *   - Idempotent (calling it twice has no observable side effect)
 *   - Side-effect-free (no writes outside the health-check log itself)
 *   - Cost-guarded (verified non-billing — see comments per probe)
 *   - Bounded latency (we time-box each probe to 5s)
 *
 * Probes never trigger real model inference, real third-party billable
 * calls, or any DB writes outside the caller-managed history row.
 *
 * The probe contract (`runProbe`) returns a structured result; the caller
 * (storage.recordProbeResult / scheduler) is responsible for persistence.
 */
import { db } from "../../db";
import { sql } from "drizzle-orm";
import type { AdminResourceRow, ResourceKind, ProbeStatus } from "@workspace/db";

export interface ProbeOutcome {
  status: ProbeStatus;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
}

const PROBE_TIMEOUT_MS = 5_000;

async function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS),
    ),
  ]);
}

/**
 * Verify a project secret is present without revealing its value. Reads
 * `process.env[secretRef]` — secretRef is itself a key-name into the
 * project's environment-secret store.
 */
function secretPresent(secretRef: string | null): boolean {
  if (!secretRef) return true; // No secret declared = vacuously satisfied.
  const value = process.env[secretRef];
  return typeof value === "string" && value.length > 0;
}

// ────────────────────────────────────────────────────────────────────────────
// api / source — secret + baseUrl present. We deliberately do NOT fire a real
// HTTP request here: many third-party sources (FRED, STR, etc.) would charge
// or rate-limit. The ambient-fetcher already exercises live calls on a
// schedule; the health probe just confirms the resource is wireable.
// ────────────────────────────────────────────────────────────────────────────

async function probeApiOrSource(row: AdminResourceRow): Promise<ProbeOutcome> {
  const t0 = Date.now();
  const config = (row.config ?? {}) as Record<string, unknown>;
  if (!secretPresent(row.secretRef)) {
    // Never include row.secretRef in errorMessage: it identifies a secret key
    // by name, which we keep behind hasSecret in API responses.
    return { status: "fail", latencyMs: Date.now() - t0, errorCode: "SECRET_MISSING", errorMessage: "Required secret is not present in the environment" };
  }
  if (typeof config.baseUrl !== "string" || config.baseUrl.length === 0) {
    return { status: "fail", latencyMs: Date.now() - t0, errorCode: "CONFIG_INCOMPLETE", errorMessage: "config.baseUrl missing" };
  }
  return { status: "ok", latencyMs: Date.now() - t0 };
}

// ────────────────────────────────────────────────────────────────────────────
// model — secret + provider known. We do NOT call models.list or send a token
// here; that would either bill (OpenAI/Anthropic) or be unsupported on the
// vendor proxy (Gemini). The llm-probe scheduler already validates registries
// every 6h.
// ────────────────────────────────────────────────────────────────────────────

const KNOWN_MODEL_PROVIDERS = new Set(["openai", "anthropic", "gemini", "openrouter", "replit"]);

async function probeModel(row: AdminResourceRow): Promise<ProbeOutcome> {
  const t0 = Date.now();
  const config = (row.config ?? {}) as Record<string, unknown>;
  if (!secretPresent(row.secretRef)) {
    // See note in probeApiOrSource — never echo secretRef in messages.
    return { status: "fail", latencyMs: Date.now() - t0, errorCode: "SECRET_MISSING", errorMessage: "Required secret is not present in the environment" };
  }
  const provider = typeof config.provider === "string" ? config.provider.toLowerCase() : "";
  if (!provider || !KNOWN_MODEL_PROVIDERS.has(provider)) {
    return { status: "fail", latencyMs: Date.now() - t0, errorCode: "PROVIDER_UNKNOWN", errorMessage: `Unknown provider: ${provider || "<unset>"}` };
  }
  return { status: "ok", latencyMs: Date.now() - t0 };
}

// ────────────────────────────────────────────────────────────────────────────
// table — verify the named table exists. Uses information_schema (read-only,
// always free).
// ────────────────────────────────────────────────────────────────────────────

async function probeTable(row: AdminResourceRow): Promise<ProbeOutcome> {
  const t0 = Date.now();
  const config = (row.config ?? {}) as Record<string, unknown>;
  const tableName = typeof config.tableName === "string" ? config.tableName : "";
  if (!tableName) {
    return { status: "fail", latencyMs: Date.now() - t0, errorCode: "CONFIG_INCOMPLETE", errorMessage: "config.tableName missing" };
  }
  try {
    const result = await withTimeout(
      db.execute(sql`SELECT 1 FROM information_schema.tables WHERE table_name = ${tableName} LIMIT 1`),
      `probe table ${tableName}`,
    );
    const rows = (result as unknown as { rows?: unknown[] }).rows ?? (result as unknown as unknown[]);
    const found = Array.isArray(rows) && rows.length > 0;
    if (!found) return { status: "fail", latencyMs: Date.now() - t0, errorCode: "TABLE_MISSING", errorMessage: "Table not found in schema" };
    return { status: "ok", latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    return { status: "fail", latencyMs: Date.now() - t0, errorCode: "DB_ERROR", errorMessage: err instanceof Error ? err.message : String(err) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// benchmark — verify the benchmark slug has at least one snapshot in the DB.
// Read-only SELECT; always free.
// ────────────────────────────────────────────────────────────────────────────

async function probeBenchmark(row: AdminResourceRow): Promise<ProbeOutcome> {
  const t0 = Date.now();
  try {
    const result = await withTimeout(
      db.execute(sql`SELECT 1 FROM market_benchmarks WHERE benchmark_slug = ${row.slug} LIMIT 1`),
      `probe benchmark ${row.slug}`,
    );
    const rows = (result as unknown as { rows?: unknown[] }).rows ?? (result as unknown as unknown[]);
    const found = Array.isArray(rows) && rows.length > 0;
    if (!found) return { status: "fail", latencyMs: Date.now() - t0, errorCode: "BENCHMARK_NOT_INGESTED", errorMessage: `No market_benchmarks rows for slug ${row.slug}` };
    return { status: "ok", latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    // market_benchmarks table may not exist in some envs — degrade to skipped.
    return { status: "skipped", latencyMs: Date.now() - t0, errorCode: "DB_ERROR", errorMessage: err instanceof Error ? err.message : String(err) };
  }
}

// LLM slot rows are pure configuration — no external service to probe.
async function probeLlmSlot(_row: AdminResourceRow): Promise<ProbeOutcome> {
  return { status: "ok", latencyMs: 0 };
}

// Research prompt rows must have a non-empty config.template to be usable.
async function probeResearchCatalog(row: AdminResourceRow): Promise<ProbeOutcome> {
  const t0 = Date.now();
  const config = (row.config ?? {}) as Record<string, unknown>;
  if (!config.template || typeof config.template !== "string" || config.template.trim().length === 0) {
    return { status: "fail", latencyMs: Date.now() - t0, errorCode: "CONFIG_INCOMPLETE", errorMessage: "config.template missing or empty" };
  }
  return { status: "ok", latencyMs: Date.now() - t0 };
}

const PROBES: Record<ResourceKind, (row: AdminResourceRow) => Promise<ProbeOutcome>> = {
  api: probeApiOrSource,
  source: probeApiOrSource,
  model: probeModel,
  table: probeTable,
  benchmark: probeBenchmark,
  llm_slot: probeLlmSlot,
  // Pietro external sources: MCPs and research URLs use the same secret+baseUrl check.
  mcp: probeApiOrSource,
  search_url: probeApiOrSource,
  // Research prompts are static — no network check needed.
  research_prompt: probeResearchCatalog,
};

export async function runProbe(row: AdminResourceRow): Promise<ProbeOutcome> {
  const probe = PROBES[row.kind as ResourceKind];
  if (!probe) {
    return { status: "skipped", latencyMs: 0, errorCode: "UNKNOWN_KIND", errorMessage: `No probe registered for kind=${row.kind}` };
  }
  try {
    return await probe(row);
  } catch (err: unknown) {
    return {
      status: "fail",
      latencyMs: 0,
      errorCode: "PROBE_THREW",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
