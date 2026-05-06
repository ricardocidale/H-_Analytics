import * as fs from "fs";
import * as path from "path";
import { logger } from "../logger";
import {
  KB_MIN_PARAGRAPH_LENGTH,
  KB_MAX_TITLE_LENGTH,
  KB_EMBEDDING_MAX_LENGTH,
  KB_WORDS_PER_CHUNK_ESTIMATE,
  KB_EMBEDDING_BATCH_SIZE,
  MAX_RAG_CONTEXT_CHARS,
  KB_MIN_CONFIDENCE,
} from "../constants";
import { extractMethodologyContent, extractVerificationManualContent, extractPlatformGuide, buildReferenceBrandsKbDoc } from "./kb-content";
import { storage } from "../storage";
import { isVectorStoreAvailable, upsertChunks, queryChunks, vectorCount, embed, embedBatch } from "./vector-store-service";
import { readIrisContext } from "./iris/workspace";

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const TOP_K = 8;

export function splitIntoChunks(text: string, title: string, source: string, category: string): { title: string; content: string; source: string; category: string }[] {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > KB_MIN_PARAGRAPH_LENGTH);
  const chunks: { title: string; content: string; source: string; category: string }[] = [];
  let current = "";
  let currentTitle = title;

  for (const para of paragraphs) {
    const headerMatch = para.match(/^#{1,4}\s+(.+)/);
    if (headerMatch) {
      currentTitle = `${title} > ${headerMatch[1].trim()}`;
    }

    if ((current + "\n\n" + para).length > CHUNK_SIZE && current.length > 0) {
      chunks.push({ title: currentTitle, content: current.trim(), source, category });
      const words = current.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(CHUNK_OVERLAP / KB_WORDS_PER_CHUNK_ESTIMATE));
      current = overlapWords.join(" ") + "\n\n" + para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }

  if (current.trim().length > KB_MIN_PARAGRAPH_LENGTH) {
    chunks.push({ title: currentTitle, content: current.trim(), source, category });
  }

  return chunks;
}

async function loadAttachedAssets(): Promise<{ title: string; content: string; source: string; category: string }[]> {
  const assetsDir = path.resolve("attached_assets");
  const chunks: { title: string; content: string; source: string; category: string }[] = [];

  if (!fs.existsSync(assetsDir)) return chunks;

  const files = fs.readdirSync(assetsDir).filter(f => f.endsWith(".md") || f.endsWith(".txt"));

  for (const file of files) {
    if (file.includes("Design_Style_Guide") || file.includes("Graphical")) continue;

    try {
      const content = fs.readFileSync(path.join(assetsDir, file), "utf-8");
      if (content.length < 100) continue;

      let title = file
        .replace(/_\d+\.(?:md|txt)$/, "")
        .replace(/[-_]/g, " ")
        .replace(/Pasted\s+/i, "")
        .trim();

      if (title.length > KB_MAX_TITLE_LENGTH) title = title.slice(0, KB_MAX_TITLE_LENGTH);

      const category = file.includes("Business_Model") || file.includes("Market_Research")
        ? "specification"
        : "reference";

      const fileChunks = splitIntoChunks(content, title, `attached_assets/${file}`, category);
      chunks.push(...fileChunks);
    } catch {
      continue;
    }
  }

  return chunks;
}

async function generateEmbedding(text: string): Promise<number[]> {
  return embed(text.slice(0, KB_EMBEDDING_MAX_LENGTH));
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const truncated = texts.map(t => t.slice(0, KB_EMBEDDING_MAX_LENGTH));
  return embedBatch(truncated);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

let knowledgeCache: { title: string; content: string; source: string; category: string; embedding: number[] }[] = [];
let indexedAt: Date | null = null;
let indexingPromise: Promise<{ chunksIndexed: number; timeMs: number }> | null = null;

export async function indexKnowledgeBase(): Promise<{ chunksIndexed: number; timeMs: number }> {
  if (indexingPromise) {
    return indexingPromise;
  }

  indexingPromise = (async () => {
    const start = Date.now();

    // If Vector store is available and already indexed, skip re-embedding this session.
    // Load the in-memory cache from Vector store metadata instead.
    if (isVectorStoreAvailable()) {
      const existing = await vectorCount("knowledge-base").catch(() => 0);
      if (existing > 0) {
        logger.info(`Vector store knowledge-base has ${existing} vectors — skipping re-index`, "knowledge-base");
        // Mark as indexed with a placeholder so retrieveRelevantChunks uses Vector store path
        indexedAt = new Date();
        return { chunksIndexed: existing, timeMs: Date.now() - start };
      }
    }

    logger.info("Starting indexing...", "knowledge-base");

    const allChunks: { title: string; content: string; source: string; category: string }[] = [];

    allChunks.push(...extractMethodologyContent());
    allChunks.push(...extractVerificationManualContent());
    allChunks.push(...extractPlatformGuide());

    const assetChunks = await loadAttachedAssets();
    allChunks.push(...assetChunks);

    // iris/context.md — Iris backstage agent status context. Loaded alongside
    // attached_assets so Rebecca can answer questions about Iris state via RAG.
    // Gracefully skipped if the file does not exist (returns "").
    try {
      const irisContext = await readIrisContext();
      if (irisContext) {
        const irisChunks = splitIntoChunks(irisContext, "iris/context.md", "iris/context.md", "iris-status");
        allChunks.push(...irisChunks);
        logger.info(`KB: added ${irisChunks.length} iris context chunk(s)`, "knowledge-base");
      }
    } catch (err: unknown) {
      logger.warn(`KB: iris context load failed — skipping (${String(err)})`, "knowledge-base");
    }

    // reference_brands — curated boutique brand comp-set data indexed so
    // Rebecca can surface brand benchmarks via semantic search. Fetched from
    // storage here (not in kb-content.ts) to keep the formatter pure.
    try {
      const refBrands = await storage.getReferenceBrands();
      if (refBrands.length > 0) {
        allChunks.push(...buildReferenceBrandsKbDoc(refBrands));
        logger.info(`KB: added ${refBrands.length} reference brand chunks`, "knowledge-base");
      }
    } catch (err: unknown) {
      logger.warn(`KB: reference brands fetch failed — skipping (${String(err)})`, "knowledge-base");
    }

    logger.info(`${allChunks.length} chunks extracted, generating embeddings...`, "knowledge-base");

    const texts = allChunks.map(c => `${c.title}\n\n${c.content}`);
    const embeddings = await generateEmbeddings(texts);

    knowledgeCache = allChunks.map((chunk, i) => ({
      ...chunk,
      embedding: embeddings[i],
    }));

    // Persist to Vector store so future restarts skip re-embedding
    if (isVectorStoreAvailable()) {
      const vectorStoreChunks = allChunks.map((chunk, i) => ({
        id: `kb:${chunk.source}:${i}`,
        text: `${chunk.title}\n\n${chunk.content}`,
        metadata: {
          title:    chunk.title,
          content:  chunk.content.slice(0, 3_000),
          source:   chunk.source,
          category: chunk.category,
        },
      }));
      try {
        await upsertChunks("knowledge-base", vectorStoreChunks);
        logger.info(`Vector store: uploaded ${vectorStoreChunks.length} KB chunks`, "knowledge-base");
      } catch (err: unknown) {
        logger.warn(`Vector store KB upload failed (in-memory cache still valid): ${err}`, "knowledge-base");
      }
    }

    indexedAt = new Date();
    const timeMs = Date.now() - start;
    logger.info(`Indexed ${knowledgeCache.length} chunks in ${timeMs}ms`, "knowledge-base");

    return { chunksIndexed: knowledgeCache.length, timeMs };
  })().finally(() => {
    indexingPromise = null;
  });

  return indexingPromise;
}

export async function retrieveRelevantChunks(query: string, topK: number = TOP_K): Promise<{ title: string; content: string; source: string; category: string; score: number }[]> {
  // Vector store path: persistent, no in-memory dependency
  if (isVectorStoreAvailable()) {
    try {
      const matches = await queryChunks("knowledge-base", query, topK);
      return matches
        .filter(m => m.score > KB_MIN_CONFIDENCE)
        .map(m => ({
          title:    String(m.metadata.title ?? ""),
          content:  String(m.metadata.content ?? ""),
          source:   String(m.metadata.source ?? ""),
          category: String(m.metadata.category ?? "reference"),
          score:    m.score,
        }));
    } catch (err: unknown) {
      logger.warn(`Vector store KB query failed, falling back to in-memory: ${err}`, "knowledge-base");
    }
  }

  // In-memory fallback
  if (knowledgeCache.length === 0) {
    if (indexingPromise) {
      await indexingPromise;
    } else {
      indexKnowledgeBase().catch(e => logger.error(`Background indexing failed: ${e instanceof Error ? e.message : String(e)}`, "knowledge-base"));
      return [];
    }
  }

  if (knowledgeCache.length === 0) return [];

  const queryEmbedding = await generateEmbedding(query);

  const scored = knowledgeCache.map(chunk => ({
    title: chunk.title,
    content: chunk.content,
    source: chunk.source,
    category: chunk.category,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).filter(c => c.score > KB_MIN_CONFIDENCE);
}

export function buildRAGContext(chunks: { title: string; content: string; source: string; score: number }[]): string {
  if (chunks.length === 0) return "";

  let totalChars = 0;
  const parts = ["\n\n## Relevant Knowledge Base Context"];
  for (const chunk of chunks) {
    const section = `\n### ${chunk.title} (${chunk.source})\n${chunk.content}`;
    if (totalChars + section.length > MAX_RAG_CONTEXT_CHARS) break;
    parts.push(section);
    totalChars += section.length;
  }
  return parts.length > 1 ? parts.join("\n") : "";
}

export function getKnowledgeBaseStatus(): { indexed: boolean; chunkCount: number; indexedAt: string | null } {
  return {
    indexed: knowledgeCache.length > 0,
    chunkCount: knowledgeCache.length,
    indexedAt: indexedAt?.toISOString() || null,
  };
}

export function log(message: string, source = "kb") {
  logger.info(message, source);
}
