/**
 * Round-trip integration tests for the high-level vector store indexers in
 * `server/ai/vector-indexing.ts`.
 *
 * For each `index*` / `retrieve*` pair we:
 *   1. Write through the real indexer (which calls `upsertChunks` against the
 *      real namespace).
 *   2. Read back through the matching retriever (which calls `queryChunks`
 *      with a constructed query string and applies its own score / metadata
 *      filters).
 *   3. Assert the row we just wrote is returned with the metadata shape and
 *      namespace placement downstream consumers expect.
 *
 * Why this exists: the lower-level `pgvector-integration.test.ts` only covers
 * `vector-store-service` (`upsertChunks`, `queryChunks`, …). A regression in an
 * indexer's id scheme, namespace choice, metadata key names, or score
 * threshold would currently slip past CI because every existing indexer test
 * mocks the underlying service. This suite plugs that gap by running each
 * indexer end-to-end against a live pgvector database.
 *
 * Embedding strategy: openai is mocked with a tag-aware deterministic
 * embedder. Each test picks a unique tag (e.g. `__pgvtest_research_a1b2__`)
 * and threads it through indexer inputs so both the stored chunk text and
 * the retriever's reconstructed query embed to the same unit vector.
 * Cosine similarity between our row and our query is therefore ≈ 1.0,
 * trivially clearing the 0.4 / 0.5 / 0.6 thresholds even though we are
 * sharing the real namespaces with any pre-existing data.
 *
 * Skips itself gracefully when DATABASE_URL is unset or pgvector cannot be
 * created — same harness as `pgvector-integration.test.ts`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Tag-aware deterministic embeddings ───────────────────────────────────────

const EMBED_DIMS = 1536;

/**
 * Tags registered at test time. Each tag gets a unique slot so the inserted
 * chunk and the matching retriever query embed to the same unit vector.
 * Untagged inputs fall back to a hash-derived slot so they remain orthogonal
 * to tagged rows (and to any other untagged chunk that happens to live in the
 * shared namespace).
 */
const tagSlots = new Map<string, number>();
let nextTagSlot = 1;

function registerTag(tag: string): string {
  if (!tagSlots.has(tag)) {
    tagSlots.set(tag, nextTagSlot++);
  }
  return tag;
}

/**
 * Numeric ids are randomized per test run so we never collide with — or
 * silently overwrite — legitimate rows in shared databases. The 9xxxxxxxx
 * range is intentionally far away from realistic primary-key ranges.
 */
function randomId(): number {
  return 900_000_000 + Math.floor(Math.random() * 99_000_000);
}

function unitVec(slot: number): number[] {
  const v = new Array<number>(EMBED_DIMS).fill(0);
  v[slot % EMBED_DIMS] = 1;
  return v;
}

function embeddingFor(text: string): number[] {
  for (const [tag, slot] of tagSlots) {
    if (text.includes(tag)) return unitVec(slot);
  }
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return unitVec(1000 + (h % 500));
}

vi.mock("openai", () => ({
  default: class FakeOpenAI {
    embeddings = {
      create: async ({ input }: { input: string | string[] }) => {
        const items = Array.isArray(input) ? input : [input];
        return { data: items.map((t) => ({ embedding: embeddingFor(t) })) };
      },
    };
  },
}));

// ── Live DB plumbing ─────────────────────────────────────────────────────────

const HAS_DB = !!process.env.DATABASE_URL;
process.env.OPENAI_API_KEY ||= "sk-test";

let pgvectorAvailable = false;
let svc: typeof import("../../server/ai/vector-store-service");
let idx: typeof import("../../server/ai/vector-indexing");
let pool: import("../../server/storage/vector-store")["vectorStorePool"];

async function applyMigration(): Promise<void> {
  const file = path.resolve(__dirname, "../../migrations/0012_pgvector_store.sql");
  const sql = fs.readFileSync(file, "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
}

/**
 * Track every row we write so we can guarantee cleanup, even on failure. We
 * always write into the real namespaces (the indexers hard-code them) so we
 * cannot rely on a namespace-prefix sweep — id-based cleanup is the only
 * safe option.
 */
const insertedIds = new Set<string>();
const insertedIdLikes = new Set<string>();

function track(id: string): string {
  insertedIds.add(id);
  return id;
}

function trackLike(prefix: string): void {
  insertedIdLikes.add(prefix);
}

async function cleanupInserted(): Promise<void> {
  if (insertedIds.size > 0) {
    await pool.query(`DELETE FROM vector_chunks WHERE id = ANY($1::text[])`, [
      [...insertedIds],
    ]);
    insertedIds.clear();
  }
  for (const like of insertedIdLikes) {
    await pool.query(`DELETE FROM vector_chunks WHERE id LIKE $1`, [like]);
  }
  insertedIdLikes.clear();
}

const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("pgvector indexer round-trips — vector-indexing.ts", () => {
  beforeAll(async () => {
    svc = await import("../../server/ai/vector-store-service");
    idx = await import("../../server/ai/vector-indexing");
    ({ vectorStorePool: pool } = await import("../../server/storage/vector-store"));

    try {
      await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
      const { rows } = await pool.query<{ has_ext: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector') AS has_ext`,
      );
      pgvectorAvailable = !!rows[0]?.has_ext;
    } catch {
      pgvectorAvailable = false;
    }

    if (!pgvectorAvailable) return;

    await applyMigration();
    svc.__resetVectorStoreAvailabilityCache();
    const ready = await svc.checkVectorStoreReady();
    if (!ready) pgvectorAvailable = false;
  }, 30_000);

  afterEach(async () => {
    if (!pgvectorAvailable) return;
    await cleanupInserted();
  });

  afterAll(async () => {
    if (!pgvectorAvailable) return;
    await cleanupInserted();
  });

  const itPg = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (!pgvectorAvailable) {
        // eslint-disable-next-line no-console
        console.warn(`[indexer-roundtrip] skipping "${name}": pgvector not available`);
        return;
      }
      await fn();
    });

  // Look up the row we just wrote in a namespace by id (cleanup helper +
  // sanity assertion that the indexer used the namespace we expect).
  async function findRow(namespace: string, idLike: string) {
    const { rows } = await pool.query<{
      id: string;
      namespace: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT id, namespace, metadata FROM vector_chunks
        WHERE namespace = $1 AND id LIKE $2
        ORDER BY id`,
      [namespace, idLike],
    );
    return rows;
  }

  // ── 1. research ────────────────────────────────────────────────────────────

  itPg("indexResearchResult ↔ retrieveSimilarResearch", async () => {
    const tag = registerTag("__pgvtest_research_a1b2c3__");
    const location = `City ${tag}`;
    const propertyType = "boutique-hotel";
    const completedAt = new Date("2025-01-15T00:00:00Z").toISOString();
    const propertyId = randomId();
    const userId = randomId();

    trackLike(`research:property:%${tag.toLowerCase()}%`);

    await idx.indexResearchResult({
      propertyId,
      userId,
      location,
      propertyType,
      businessModel: "hotel",
      type: "property",
      summary: `Long form summary referencing ${tag}`,
      keyMetrics: { adr: 250, occupancy: 0.72 },
      completedAt,
      qualityTier: "luxury",
      pricingModel: "per_room",
      country: "US",
      marketTier: "tier1",
      locationType: "urban",
    });

    const dbRows = await findRow("research-history", `research:property:%`);
    const ours = dbRows.find((r) => r.id.includes(tag.toLowerCase()));
    expect(ours, "indexer wrote a row into research-history with the expected id scheme").toBeDefined();
    expect(ours!.metadata.propertyId).toBe(propertyId);
    expect(ours!.metadata.userId).toBe(userId);
    expect(ours!.metadata.location).toBe(location);
    expect(ours!.metadata.businessModel).toBe("hotel");
    expect(ours!.metadata.qualityTier).toBe("luxury");
    expect(ours!.metadata.country).toBe("US");
    expect(ours!.metadata.type).toBe("property");
    expect(ours!.metadata.completedAt).toBe(completedAt);
    expect(typeof ours!.metadata.summary).toBe("string");
    expect(ours!.metadata.metric_adr).toBe(250);
    expect(ours!.metadata.metric_occupancy).toBe(0.72);

    const matches = await idx.retrieveSimilarResearch(location, propertyType, "property", 5);
    const found = matches.find((m) => m.id === ours!.id);
    expect(found, "retrieveSimilarResearch returns the row we just wrote").toBeDefined();
    expect(found!.score).toBeGreaterThan(0.9);
    expect(found!.metadata.location).toBe(location);
  });

  // ── 2. assumption guidance ─────────────────────────────────────────────────

  itPg("indexAssumptionGuidance ↔ retrieveSimilarGuidance", async () => {
    const tag = registerTag("__pgvtest_guidance_d4e5f6__");
    const location = `Town ${tag}`;
    const propertyType = "select-service-hotel";
    const businessModel = "hotel";
    const assumptionKey = "adr";
    const entityId = randomId();
    const userId = randomId();

    const id = `guidance:global:property:${entityId}:${assumptionKey}`;
    track(id);

    await idx.indexAssumptionGuidance({
      entityType: "property",
      entityId,
      userId,
      location,
      propertyType,
      businessModel,
      assumptionKey,
      valueLow: 180,
      valueMid: 220,
      valueHigh: 260,
      confidence: 0.85,
      reasoning: `Reasoning text referencing ${tag}`,
    });

    const rows = await findRow("assumption-guidance", id);
    expect(rows.length).toBe(1);
    expect(rows[0].metadata.entityType).toBe("property");
    expect(rows[0].metadata.entityId).toBe(entityId);
    expect(rows[0].metadata.assumptionKey).toBe(assumptionKey);
    expect(rows[0].metadata.businessModel).toBe(businessModel);
    expect(rows[0].metadata.valueLow).toBe(180);
    expect(rows[0].metadata.valueMid).toBe(220);
    expect(rows[0].metadata.valueHigh).toBe(260);
    expect(rows[0].metadata.confidence).toBe(0.85);

    const matches = await idx.retrieveSimilarGuidance({
      location,
      propertyType,
      businessModel,
      assumptionKeys: [assumptionKey],
      topK: 10,
    });
    const found = matches.find((m) => m.location === location);
    expect(found, "retrieveSimilarGuidance returns the row we wrote and unwraps metadata").toBeDefined();
    expect(found!.assumptionKey).toBe(assumptionKey);
    expect(found!.valueLow).toBe(180);
    expect(found!.valueMid).toBe(220);
    expect(found!.valueHigh).toBe(260);
    expect(found!.confidence).toBe(0.85);
    expect(found!.businessModel).toBe(businessModel);
    expect(found!.reasoning).toContain(tag);
    expect(found!.score).toBeGreaterThan(0.9);

    // assumptionKeys filter should drop unrelated keys.
    const filteredOut = await idx.retrieveSimilarGuidance({
      location,
      propertyType,
      businessModel,
      assumptionKeys: ["unrelated-key"],
      topK: 10,
    });
    expect(filteredOut.find((m) => m.location === location)).toBeUndefined();
  });

  // ── 3. benchmark snapshot (no dedicated retriever; round-trip via queryChunks) ─

  itPg("indexBenchmarkSnapshot writes into comparables with the documented metadata shape", async () => {
    const tag = registerTag("__pgvtest_benchmark_g7h8i9__");
    const market = `Market ${tag}`;
    const propertyType = "luxury-hotel";
    const source = "test-source";
    const id = `benchmark:${market.toLowerCase().replace(/\s+/g, "-")}:${propertyType}:${source}`;
    track(id);

    await idx.indexBenchmarkSnapshot({
      market,
      propertyType,
      adr: 320,
      occupancy: 0.78,
      capRate: 0.065,
      revpar: 249.6,
      source,
      snapshotDate: "2025-03-01",
    });

    const rows = await findRow("comparables", id);
    expect(rows.length).toBe(1);
    expect(rows[0].metadata.market).toBe(market);
    expect(rows[0].metadata.propertyType).toBe(propertyType);
    expect(rows[0].metadata.adr).toBe(320);
    expect(rows[0].metadata.occupancy).toBe(0.78);
    expect(rows[0].metadata.capRate).toBe(0.065);
    expect(rows[0].metadata.revpar).toBe(249.6);
    expect(rows[0].metadata.source).toBe(source);
    expect(rows[0].metadata.snapshotDate).toBe("2025-03-01");
    expect(rows[0].metadata.isBenchmark).toBe(true);

    // Round-trip: a query string carrying the tag must surface our row
    // ahead of any unrelated comparables already in the namespace.
    const matches = await svc.queryChunks(
      "comparables",
      `${market} ${propertyType} hospitality benchmark`,
      5,
    );
    const found = matches.find((m) => m.id === id);
    expect(found, "queryChunks surfaces the indexed benchmark snapshot").toBeDefined();
    expect(found!.score).toBeGreaterThan(0.9);
  });

  // ── 4. document extraction ─────────────────────────────────────────────────

  itPg("indexDocumentExtraction ↔ retrieveDocumentContext", async () => {
    const tag = registerTag("__pgvtest_doc_j0k1l2__");
    const extractionId = randomId();
    const propertyId = randomId();
    const propertyName = `Hotel ${tag}`;
    const documentType = "operating-statement";
    const location = `Doc City ${tag}`;
    const extractedText = `${tag} extracted text body that should round-trip back through retrieval`;

    trackLike(`doc:${extractionId}:%`);

    await idx.indexDocumentExtraction({
      extractionId,
      propertyId,
      propertyName,
      documentType,
      extractedText,
      location,
    });

    const rows = await findRow("documents", `doc:${extractionId}:%`);
    expect(rows.length).toBeGreaterThan(0);
    const first = rows[0];
    expect(first.metadata.extractionId).toBe(extractionId);
    expect(first.metadata.propertyId).toBe(propertyId);
    expect(first.metadata.propertyName).toBe(propertyName);
    expect(first.metadata.documentType).toBe(documentType);
    expect(first.metadata.location).toBe(location);
    expect(typeof first.metadata.content).toBe("string");
    expect(first.metadata.chunkIndex).toBe(0);

    const matches = await idx.retrieveDocumentContext({
      query: `${tag} extracted text`,
      propertyId,
      topK: 5,
    });
    const found = matches.find((m) => m.extractionId === extractionId);
    expect(found, "retrieveDocumentContext returns the row we wrote and applies propertyId filter").toBeDefined();
    expect(found!.propertyId).toBe(propertyId);
    expect(found!.propertyName).toBe(propertyName);
    expect(found!.documentType).toBe(documentType);
    expect(found!.content).toContain(tag);
    expect(found!.score).toBeGreaterThan(0.9);

    // Different propertyId filter must exclude our row.
    const otherProperty = await idx.retrieveDocumentContext({
      query: `${tag} extracted text`,
      propertyId: propertyId + 1,
      topK: 5,
    });
    expect(otherProperty.find((m) => m.extractionId === extractionId)).toBeUndefined();
  });

  // ── 5. scenario summary ────────────────────────────────────────────────────

  itPg("indexScenarioSummary ↔ retrieveScenarioContext", async () => {
    const tag = registerTag("__pgvtest_scenario_m3n4o5__");
    const scenarioId = randomId();
    const propertyId = randomId();
    const scenarioName = `Scenario ${tag}`;
    const propertyName = `Property ${tag}`;
    const location = `Scenario City ${tag}`;
    const propertyType = "resort-hotel";
    track(`scenario:${scenarioId}`);

    await idx.indexScenarioSummary({
      scenarioId,
      scenarioName,
      propertyId,
      propertyName,
      userId: 5,
      location,
      propertyType,
      totalRevenue: 5_000_000,
      totalExpenses: 3_000_000,
      noi: 2_000_000,
      adr: 300,
      occupancy: 0.7,
      revpar: 210,
      years: 10,
      createdBy: "tester",
    });

    const rows = await findRow("scenarios", `scenario:${scenarioId}`);
    expect(rows.length).toBe(1);
    expect(rows[0].metadata.scenarioId).toBe(scenarioId);
    expect(rows[0].metadata.scenarioName).toBe(scenarioName);
    expect(rows[0].metadata.propertyId).toBe(propertyId);
    expect(rows[0].metadata.propertyName).toBe(propertyName);
    expect(rows[0].metadata.location).toBe(location);
    expect(rows[0].metadata.totalRevenue).toBe(5_000_000);
    expect(rows[0].metadata.noi).toBe(2_000_000);
    expect(rows[0].metadata.adr).toBe(300);
    expect(rows[0].metadata.occupancy).toBe(0.7);
    expect(rows[0].metadata.years).toBe(10);
    expect(rows[0].metadata.createdBy).toBe("tester");

    const matches = await idx.retrieveScenarioContext({
      query: `${tag} scenario projection`,
      propertyId,
      topK: 5,
    });
    const found = matches.find((m) => m.scenarioId === scenarioId);
    expect(found, "retrieveScenarioContext returns the row we wrote").toBeDefined();
    expect(found!.scenarioName).toBe(scenarioName);
    expect(found!.propertyName).toBe(propertyName);
    expect(found!.location).toBe(location);
    expect(found!.noi).toBe(2_000_000);
    expect(found!.adr).toBe(300);
    expect(found!.occupancy).toBe(0.7);
    expect(found!.score).toBeGreaterThan(0.9);

    const otherProperty = await idx.retrieveScenarioContext({
      query: `${tag} scenario projection`,
      propertyId: propertyId + 1,
      topK: 5,
    });
    expect(otherProperty.find((m) => m.scenarioId === scenarioId)).toBeUndefined();
  });

  // ── 6. property profile ────────────────────────────────────────────────────

  itPg("indexPropertyProfile ↔ retrievePropertyContext", async () => {
    const tag = registerTag("__pgvtest_property_p6q7r8__");
    const propertyId = randomId();
    const name = `Hotel ${tag}`;
    const location = `Profile City ${tag}`;
    const propertyType = "boutique-hotel";
    track(`property:${propertyId}`);

    await idx.indexPropertyProfile({
      propertyId,
      name,
      location,
      propertyType,
      roomCount: 120,
      starRating: 4,
      status: "active",
      purchasePrice: 25_000_000,
      market: "Test Market",
      description: `A property used by ${tag} round-trip test`,
      streetAddress: "123 Test Street",
    });

    const rows = await findRow("properties", `property:${propertyId}`);
    expect(rows.length).toBe(1);
    expect(rows[0].metadata.propertyId).toBe(propertyId);
    expect(rows[0].metadata.name).toBe(name);
    expect(rows[0].metadata.location).toBe(location);
    expect(rows[0].metadata.propertyType).toBe(propertyType);
    expect(rows[0].metadata.roomCount).toBe(120);
    expect(rows[0].metadata.starRating).toBe(4);
    expect(rows[0].metadata.status).toBe("active");
    expect(rows[0].metadata.purchasePrice).toBe(25_000_000);
    expect(rows[0].metadata.market).toBe("Test Market");
    expect(rows[0].metadata.streetAddress).toBe("123 Test Street");

    const matches = await idx.retrievePropertyContext({
      query: `${tag} hotel property`,
      topK: 5,
    });
    const found = matches.find((m) => m.propertyId === propertyId);
    expect(found, "retrievePropertyContext returns the row we wrote").toBeDefined();
    expect(found!.name).toBe(name);
    expect(found!.location).toBe(location);
    expect(found!.propertyType).toBe(propertyType);
    expect(found!.roomCount).toBe(120);
    expect(found!.score).toBeGreaterThan(0.9);
  });
});
