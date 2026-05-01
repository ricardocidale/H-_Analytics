import { RetrievalManifestEntry } from "../ai/rebecca-context-contract";

/**
 * Task #551 — Single registration point for the "Sources used" panel.
 *
 * `server/routes/chat.ts` runs several independent retrieval branches
 * (documents, knowledge base, research history & assumption guidance,
 * uploaded files / assets) and surfaces a `sourcesUsed` array on the
 * /api/chat response so the preview UI can render which chunks Rebecca
 * actually saw. Without a single named place to register a chunk, future
 * RAG branches (e.g. a new "web search" or "portfolio embeddings"
 * branch) can silently regress that panel.
 *
 * To make registration impossible to miss, every retrieval branch must
 * fill its slot on `ChatRetrievalInputs` and the handler must call
 * `collectChatSources` exactly once. TypeScript catches a forgotten slot
 * at compile time; the unit tests in tests/server/chat-sources.test.ts
 * catch a forgotten *push* by asserting that every populated slot ends
 * up in the output.
 */

export type ChatSourceUsed = {
  title: string;
  namespace: string;
  score: number;
  weight: number;
};

/** Raw doc hit kept in chat.ts after vector-store + score filtering. */
export type DocumentHit = {
  propertyName: string;
  documentType: string;
  score: number;
};

/** Raw KB chunk kept in chat.ts after the 0.45 similarity floor. */
export type KnowledgeBaseHit = {
  title?: string | null;
  source?: string | null;
  score: number;
};

/** Raw research/guidance match kept in chat.ts (already title-prepared). */
export type ResearchHit = {
  id: string;
  title: string;
  namespace: "research-history" | "assumption-guidance";
  score: number;
};

/** Raw asset hit kept in chat.ts (photo / logo from the asset index). */
export type AssetHit = {
  id: number;
  type: "photo" | "logo";
  caption?: string | null;
  propertyName?: string | null;
  score: number;
};

/**
 * One slot per retrieval branch. `enabled` is the admin's
 * Knowledge & Sources toggle for that source; when false, the slot's
 * results are dropped (matching the prompt-assembly behavior).
 */
export type ChatRetrievalInputs = {
  documents: { enabled: boolean; weight: number; results: DocumentHit[] };
  knowledgeBase: { enabled: boolean; weight: number; chunks: KnowledgeBaseHit[] };
  research: { enabled: boolean; weight: number; matches: ResearchHit[] };
  uploadedFiles: { enabled: boolean; weight: number; assets: AssetHit[] };
};

/** Render the user-facing title for a document hit. */
export function documentTitle(d: DocumentHit): string {
  return `${d.propertyName} — ${d.documentType}`;
}

/** Render the user-facing title for a KB chunk. */
export function knowledgeBaseTitle(c: KnowledgeBaseHit): string {
  return c.title || c.source || "Knowledge entry";
}

/** Render the user-facing title for an asset hit. */
export function assetTitle(a: AssetHit): string {
  const baseTitle =
    a.caption?.trim() ||
    `${a.type[0].toUpperCase()}${a.type.slice(1)} #${a.id}`;
  return a.propertyName ? `${a.propertyName} — ${baseTitle}` : baseTitle;
}

/**
 * Dedupe identical (namespace, title) entries (multiple chunks from the
 * same KB doc collapse into the highest-scoring representative) and
 * sort by weighted score (= score × weight ÷ 100). The Knowledge &
 * Sources sliders therefore visibly affect the displayed list.
 *
 * Note: weight=0 zeros out a source's contribution so the entire group
 * sinks below any source with weight>0, even at equal raw scores. This
 * is the assertion the ordering test pins down.
 */
export function finalizeSourcesUsed(sourcesUsed: ChatSourceUsed[]): ChatSourceUsed[] {
  const sourcesByKey = new Map<string, ChatSourceUsed>();
  for (const s of sourcesUsed) {
    const key = `${s.namespace}::${s.title}`;
    const prev = sourcesByKey.get(key);
    if (!prev || s.score > prev.score) sourcesByKey.set(key, s);
  }
  return Array.from(sourcesByKey.values()).sort(
    (a, b) => b.score * (b.weight / 100) - a.score * (a.weight / 100),
  );
}

/**
 * Single registration point for the /api/chat sources panel.
 *
 * Always returns an array (never undefined) so the response shape is
 * stable even when every source is disabled.
 */
export function collectChatSources(inputs: ChatRetrievalInputs): ChatSourceUsed[] {
  const sourcesUsed: ChatSourceUsed[] = [];

  if (inputs.documents.enabled) {
    for (const d of inputs.documents.results) {
      sourcesUsed.push({
        title: documentTitle(d),
        namespace: "documents",
        score: d.score,
        weight: inputs.documents.weight,
      });
    }
  }

  if (inputs.knowledgeBase.enabled) {
    for (const c of inputs.knowledgeBase.chunks) {
      sourcesUsed.push({
        title: knowledgeBaseTitle(c),
        namespace: "knowledge-base",
        score: c.score,
        weight: inputs.knowledgeBase.weight,
      });
    }
  }

  if (inputs.research.enabled) {
    for (const m of inputs.research.matches) {
      sourcesUsed.push({
        title: m.title || String(m.id),
        namespace: m.namespace,
        score: m.score,
        weight: inputs.research.weight,
      });
    }
  }

  if (inputs.uploadedFiles.enabled) {
    for (const a of inputs.uploadedFiles.assets) {
      sourcesUsed.push({
        title: assetTitle(a),
        namespace: "uploaded-files",
        score: a.score,
        weight: inputs.uploadedFiles.weight,
      });
    }
  }

  return finalizeSourcesUsed(sourcesUsed);
}

/**
 * Maps RetrievalManifestEntry[] to ChatSourceUsed[] based on enabled sources and weights.
 * 
 * Takes RetrievalManifestEntry[] and the enabled/weight settings
 * Filters to enabled sources only
 * Maps entries to ChatSourceUsed shape
 * Calls finalizeSourcesUsed() to dedup+sort
 */
export function collectChatSourcesFromManifest(
  entries: RetrievalManifestEntry[],
  settings: { [K in keyof ChatRetrievalInputs]: { enabled: boolean; weight: number } }
): ChatSourceUsed[] {
  const sourcesUsed: ChatSourceUsed[] = [];

  for (const entry of entries) {
    const setting = settings[entry.sourceKey as keyof ChatRetrievalInputs];
    
    // If we have a setting for this sourceKey, check if it's enabled
    if (setting && !setting.enabled) {
      continue;
    }

    // Default weight to 100 if not found in settings (e.g. portfolio, field-context)
    const weight = setting ? setting.weight : 100;

    sourcesUsed.push({
      title: entry.title || entry.itemId || "Source",
      namespace: entry.namespace,
      score: entry.score ?? 0,
      weight: entry.weight ?? weight,
    });
  }

  return finalizeSourcesUsed(sourcesUsed);
}
