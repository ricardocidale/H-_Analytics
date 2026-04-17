/**
 * Backfill the pgvector store from existing relational rows.
 *
 * Re-indexes the seven namespaces idempotently (upsert by deterministic ID):
 *   - knowledge-base       ← rebecca_knowledge_base (active entries)
 *   - properties           ← properties (non-archived)
 *   - scenarios            ← scenarios (all)
 *   - research-history     ← market_research (all)
 *   - comparables          ← benchmark_snapshots (all)
 *   - documents            ← document_extractions (all)
 *
 * Safe to re-run; failures are logged per-row and do not abort the job.
 *
 * Usage:
 *   npx tsx server/scripts/backfill-vector-store.ts
 *   npx tsx server/scripts/backfill-vector-store.ts --only=properties,scenarios
 */

import { storage } from "../storage";
import {
  checkVectorStoreReady,
  isEmbeddingAvailable,
  indexBenchmarkSnapshot,
  indexPropertyProfile,
  indexScenarioSummary,
  indexResearchResult,
  indexDocumentExtraction,
  indexToKnowledgeBase,
} from "../ai/pinecone-service";

function mapCategoryToKpis(
  category: string,
  value: number | null,
): { adr?: number | null; occupancy?: number | null; revpar?: number | null; capRate?: number | null } {
  const c = category.toLowerCase();
  if (c.includes("adr")) return { adr: value };
  if (c.includes("occup")) return { occupancy: value };
  if (c.includes("revpar")) return { revpar: value };
  if (c.includes("cap")) return { capRate: value };
  return {};
}
import { logger } from "../logger";

type Source =
  | "knowledge-base"
  | "properties"
  | "scenarios"
  | "research-history"
  | "comparables"
  | "documents";

const ALL_SOURCES: Source[] = [
  "knowledge-base",
  "properties",
  "scenarios",
  "research-history",
  "comparables",
  "documents",
];

function parseOnly(): Source[] {
  const arg = process.argv.find((a) => a.startsWith("--only="));
  if (!arg) return ALL_SOURCES;
  const wanted = arg.slice("--only=".length).split(",").map((s) => s.trim());
  const valid = wanted.filter((s): s is Source => (ALL_SOURCES as string[]).includes(s));
  if (valid.length === 0) {
    logger.error(`[backfill] --only=${wanted.join(",")} matched no known sources`);
    process.exit(1);
  }
  return valid;
}

async function safeRun<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err: unknown) {
    logger.warn(`[backfill] ${label} failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function backfillKnowledgeBase(): Promise<{ ok: number; fail: number }> {
  const entries = await storage.getActiveRebeccaKBEntries();
  logger.info(`[backfill] knowledge-base: ${entries.length} active entries`);
  let ok = 0, fail = 0;
  for (const e of entries) {
    const r = await safeRun(`KB ${e.id}`, () =>
      indexToKnowledgeBase(`rebecca:${e.id}`, `${e.title}\n\n${e.content ?? ""}`, {
        kbId: e.id,
        title: (e.title ?? "").slice(0, 200),
        category: e.category ?? "",
        priority: e.priority ?? 0,
      }),
    );
    if (r === null) fail++; else ok++;
  }
  return { ok, fail };
}

async function backfillProperties(): Promise<{ ok: number; fail: number }> {
  const props = await storage.getAllPropertiesAdmin(false);
  logger.info(`[backfill] properties: ${props.length} active properties`);
  let ok = 0, fail = 0;
  for (const p of props) {
    const r = await safeRun(`property ${p.id}`, () =>
      indexPropertyProfile({
        propertyId:    p.id,
        name:          p.name,
        location:      [p.city, p.stateProvince, p.country].filter(Boolean).join(", ") || p.name,
        propertyType:  (p as { propertyType?: string }).propertyType ?? "hotel",
        roomCount:     (p as { roomCount?: number | null }).roomCount ?? null,
        starRating:    (p as { starRating?: number | null }).starRating ?? null,
        status:        (p as { status?: string }).status ?? "active",
        purchasePrice: (p as { purchasePrice?: number | null }).purchasePrice ?? null,
        market:        (p as { market?: string }).market ?? "",
        description:   (p as { description?: string | null }).description ?? null,
        streetAddress: (p as { streetAddress?: string | null }).streetAddress ?? null,
      }),
    );
    if (r === null) fail++; else ok++;
  }
  return { ok, fail };
}

async function backfillScenarios(): Promise<{ ok: number; fail: number }> {
  const scenarios = await storage.getAllScenarios();
  logger.info(`[backfill] scenarios: ${scenarios.length} scenarios`);
  let ok = 0, fail = 0;
  for (const s of scenarios) {
    const meta = (s as { metadata?: Record<string, unknown> }).metadata ?? {};
    const num = (k: string) => {
      const v = meta[k];
      return typeof v === "number" ? v : null;
    };
    const r = await safeRun(`scenario ${s.id}`, () =>
      indexScenarioSummary({
        scenarioId:    s.id,
        scenarioName:  s.name ?? `Scenario ${s.id}`,
        propertyId:    (s as { propertyId?: number }).propertyId ?? 0,
        propertyName:  String(meta.propertyName ?? ""),
        userId:        (s as { userId?: number }).userId ?? 0,
        location:      String(meta.location ?? ""),
        propertyType:  String(meta.propertyType ?? "hotel"),
        totalRevenue:  num("totalRevenue"),
        totalExpenses: num("totalExpenses"),
        noi:           num("noi"),
        adr:           num("adr"),
        occupancy:     num("occupancy"),
        revpar:        num("revpar"),
        years:         num("years") ?? undefined,
        createdBy:     String(meta.createdBy ?? (s as { ownerEmail?: string }).ownerEmail ?? ""),
      }),
    );
    if (r === null) fail++; else ok++;
  }
  return { ok, fail };
}

async function backfillResearchHistory(): Promise<{ ok: number; fail: number }> {
  const reports = await storage.getAllMarketResearch(undefined, 10_000);
  logger.info(`[backfill] research-history: ${reports.length} reports`);
  let ok = 0, fail = 0;
  for (const r of reports) {
    const rawContent = (r as { content?: unknown }).content;
    const summary = (typeof rawContent === "string"
      ? rawContent
      : rawContent != null
        ? JSON.stringify(rawContent)
        : ""
    ).slice(0, 8_000);
    if (!summary) { fail++; continue; }
    const result = await safeRun(`research ${r.id}`, () =>
      indexResearchResult({
        propertyId: (r as { propertyId?: number | null }).propertyId ?? undefined,
        userId:     (r as { userId?: number | null }).userId ?? undefined,
        location:   String((r as { title?: string }).title ?? `report-${r.id}`),
        propertyType: "hotel",
        type:       (((r as { type?: string }).type ?? "global") as "property" | "company" | "global"),
        summary,
        completedAt: ((r as { updatedAt?: Date }).updatedAt ?? new Date()).toISOString(),
      }),
    );
    if (result === null) fail++; else ok++;
  }
  return { ok, fail };
}

async function backfillBenchmarks(): Promise<{ ok: number; fail: number }> {
  const snapshots = await storage.getBenchmarkSnapshots();
  logger.info(`[backfill] comparables: ${snapshots.length} benchmark snapshots`);
  let ok = 0, fail = 0;
  for (const s of snapshots) {
    const r = await safeRun(`benchmark ${s.snapshotKey}`, async () => {
      const kpis = mapCategoryToKpis(s.category, s.value);
      await indexBenchmarkSnapshot({
        market:       s.snapshotKey,
        propertyType: s.category,
        ...kpis,
        source:       s.source ?? "unknown",
        snapshotDate: s.fetchedAt.toISOString(),
      });
    });
    if (r === null) fail++; else ok++;
  }
  return { ok, fail };
}

async function backfillDocuments(): Promise<{ ok: number; fail: number }> {
  const props = await storage.getAllPropertiesAdmin(false);
  let total = 0, ok = 0, fail = 0;
  for (const p of props) {
    const docs = await safeRun(`list docs for property ${p.id}`, () =>
      storage.getPropertyExtractions(p.id),
    );
    if (!docs) continue;
    total += docs.length;
    for (const d of docs) {
      const r = await safeRun(`document ${d.id}`, () =>
        indexDocumentExtraction({
          extractionId: d.id,
          propertyId:   p.id,
          propertyName: p.name,
          documentType: (d as { documentType?: string }).documentType ?? "unknown",
          extractedText: String((d as { extractedText?: string }).extractedText ?? ""),
          location:      [p.city, p.stateProvince, p.country].filter(Boolean).join(", ") || p.name,
        }),
      );
      if (r === null) fail++; else ok++;
    }
  }
  logger.info(`[backfill] documents: ${total} extractions across ${props.length} properties`);
  return { ok, fail };
}

const RUNNERS: Record<Source, () => Promise<{ ok: number; fail: number }>> = {
  "knowledge-base":    backfillKnowledgeBase,
  "properties":        backfillProperties,
  "scenarios":         backfillScenarios,
  "research-history":  backfillResearchHistory,
  "comparables":       backfillBenchmarks,
  "documents":         backfillDocuments,
};

async function main() {
  const ready = await checkVectorStoreReady();
  if (!ready) {
    logger.error("[backfill] Vector store not ready — run db:push --force first.");
    process.exit(1);
  }
  if (!isEmbeddingAvailable()) {
    logger.error("[backfill] Embedding API unavailable — set OPENAI_EMBEDDING_KEY or OPENAI_API_KEY.");
    process.exit(1);
  }

  const sources = parseOnly();
  logger.info(`[backfill] Running for: ${sources.join(", ")}`);

  const totals: Record<string, { ok: number; fail: number }> = {};
  for (const src of sources) {
    logger.info(`[backfill] ── ${src} ──`);
    totals[src] = await RUNNERS[src]();
    logger.info(`[backfill] ${src}: ok=${totals[src].ok} fail=${totals[src].fail}`);
  }

  logger.info("[backfill] Summary:");
  for (const [src, t] of Object.entries(totals)) {
    logger.info(`  ${src.padEnd(20)} ok=${t.ok} fail=${t.fail}`);
  }
  process.exit(0);
}

main().catch((err) => {
  logger.error(`[backfill] Fatal: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
