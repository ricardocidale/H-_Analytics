/**
 * Task #551 — Regression catch for the /api/chat "Sources used" panel.
 *
 * `server/routes/chat.ts` runs four independent retrieval branches and
 * the preview UI renders whichever chunks ended up in `sourcesUsed`. A
 * future contributor adding a new RAG branch (e.g. "web search" or
 * "portfolio embeddings") could silently regress that panel by forgetting
 * to register their chunks. These tests pin down the contract:
 *
 *   1. Every populated retrieval slot contributes an entry with a
 *      non-empty title, the right namespace, and score > 0.
 *   2. Sort order is driven by weighted score (= score × weight ÷ 100),
 *      so weight=0 sources reliably sink below weight>0 ones even when
 *      raw similarity scores are identical.
 *   3. When all sources are disabled, the result is an empty array
 *      (never undefined).
 *
 * The tests target the extracted `collectChatSources` helper rather than
 * spinning up the whole /api/chat handler — the handler funnels every
 * branch through this same call, so the contract holds end-to-end.
 */
import { describe, it, expect } from "vitest";
import {
  collectChatSources,
  documentTitle,
  knowledgeBaseTitle,
  assetTitle,
  type ChatRetrievalInputs,
} from "../../server/routes/chat-sources";

const ALL_NAMESPACES = ["documents", "knowledge-base", "research-history", "assumption-guidance", "uploaded-files"] as const;

/**
 * One representative hit per retrieval branch, with all sources enabled
 * and equal raw similarity scores. The tests below tweak weights or
 * `enabled` flags on top of this baseline.
 */
function baselineInputs(): ChatRetrievalInputs {
  return {
    documents: {
      enabled: true,
      weight: 50,
      results: [
        { propertyName: "Hotel Aurora", documentType: "PSA", score: 0.82 },
      ],
    },
    knowledgeBase: {
      enabled: true,
      weight: 70,
      chunks: [
        { title: "Cap rate fundamentals", source: "training-doc-1", score: 0.71 },
      ],
    },
    research: {
      enabled: true,
      weight: 60,
      matches: [
        {
          id: "research:42",
          title: "Mexico City boutique hotel research",
          namespace: "research-history",
          score: 0.66,
        },
        {
          id: "guidance:adr",
          title: "adr guidance (Mexico City)",
          namespace: "assumption-guidance",
          score: 0.61,
        },
      ],
    },
    uploadedFiles: {
      enabled: true,
      weight: 50,
      assets: [
        {
          id: 7,
          type: "photo",
          caption: "Lobby fireplace at dusk",
          propertyName: "Hotel Aurora",
          score: 0.55,
        },
      ],
    },
  };
}

describe("collectChatSources — every retrieval branch registers itself", () => {
  it("surfaces a documents entry with non-empty title, namespace='documents', score>0", () => {
    const out = collectChatSources(baselineInputs());
    const entry = out.find(s => s.namespace === "documents");
    expect(entry).toBeDefined();
    expect(entry!.title).toBe("Hotel Aurora — PSA");
    expect(entry!.title.length).toBeGreaterThan(0);
    expect(entry!.score).toBeGreaterThan(0);
    expect(entry!.weight).toBe(50);
  });

  it("surfaces a knowledge-base entry with non-empty title, namespace='knowledge-base', score>0", () => {
    const out = collectChatSources(baselineInputs());
    const entry = out.find(s => s.namespace === "knowledge-base");
    expect(entry).toBeDefined();
    expect(entry!.title).toBe("Cap rate fundamentals");
    expect(entry!.title.length).toBeGreaterThan(0);
    expect(entry!.score).toBeGreaterThan(0);
    expect(entry!.weight).toBe(70);
  });

  it("surfaces both research namespaces (research-history + assumption-guidance) with non-empty titles and score>0", () => {
    const out = collectChatSources(baselineInputs());
    const history = out.find(s => s.namespace === "research-history");
    const guidance = out.find(s => s.namespace === "assumption-guidance");
    expect(history).toBeDefined();
    expect(guidance).toBeDefined();
    for (const entry of [history!, guidance!]) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.score).toBeGreaterThan(0);
      expect(entry.weight).toBe(60);
    }
  });

  it("surfaces an uploaded-files entry with non-empty title, namespace='uploaded-files', score>0", () => {
    const out = collectChatSources(baselineInputs());
    const entry = out.find(s => s.namespace === "uploaded-files");
    expect(entry).toBeDefined();
    expect(entry!.title).toBe("Hotel Aurora — Lobby fireplace at dusk");
    expect(entry!.title.length).toBeGreaterThan(0);
    expect(entry!.score).toBeGreaterThan(0);
    expect(entry!.weight).toBe(50);
  });

  it("registers ALL four retrieval branches when each returns at least one match (regression net for new branches)", () => {
    // This is the key "future contributor" guard: when every branch has
    // populated its slot, every namespace must appear in the output. A
    // future branch added without wiring up `collectChatSources` will
    // ship with no test coverage AND will fail this test once a sibling
    // branch starts populating the new slot.
    const out = collectChatSources(baselineInputs());
    const seenNamespaces = new Set(out.map(s => s.namespace));
    for (const ns of ALL_NAMESPACES) {
      expect(
        seenNamespaces.has(ns),
        `Expected sourcesUsed to contain a "${ns}" entry but it did not. ` +
          `If a new retrieval branch was added without wiring it into ` +
          `collectChatSources, the "Sources used" panel will silently regress.`,
      ).toBe(true);
    }
  });
});

describe("collectChatSources — weighted-score ordering is stable across slider settings", () => {
  it("documents (weight=100) sort above knowledge-base (weight=0) at equal raw scores", () => {
    const inputs: ChatRetrievalInputs = {
      documents: {
        enabled: true,
        weight: 100,
        results: [
          { propertyName: "Hotel Aurora", documentType: "PSA", score: 0.8 },
          { propertyName: "Hotel Beacon", documentType: "OM", score: 0.8 },
        ],
      },
      knowledgeBase: {
        enabled: true,
        weight: 0,
        chunks: [
          { title: "KB Alpha", source: "training", score: 0.8 },
          { title: "KB Bravo", source: "training", score: 0.8 },
        ],
      },
      research: { enabled: false, weight: 0, matches: [] },
      uploadedFiles: { enabled: false, weight: 0, assets: [] },
    };

    const out = collectChatSources(inputs);
    const namespaces = out.map(s => s.namespace);
    const firstKbIndex = namespaces.indexOf("knowledge-base");
    const lastDocIndex = namespaces.lastIndexOf("documents");
    expect(firstKbIndex).toBeGreaterThan(-1);
    expect(lastDocIndex).toBeGreaterThan(-1);
    // Every documents entry must come before every knowledge-base entry.
    expect(lastDocIndex).toBeLessThan(firstKbIndex);
    // And the absolute ordering is documents-first regardless of insertion
    // order in the input arrays.
    expect(namespaces.slice(0, 2)).toEqual(["documents", "documents"]);
    expect(namespaces.slice(2)).toEqual(["knowledge-base", "knowledge-base"]);
  });

  it("documents (weight=100, score=0.5) still sort above knowledge-base (weight=10, score=0.9) — sliders dominate raw score within reason", () => {
    // Sanity check that the weighted score is the actual sort key, not a
    // tiebreaker. doc weighted = 0.5, kb weighted = 0.09.
    const inputs: ChatRetrievalInputs = {
      documents: {
        enabled: true,
        weight: 100,
        results: [{ propertyName: "Hotel Aurora", documentType: "PSA", score: 0.5 }],
      },
      knowledgeBase: {
        enabled: true,
        weight: 10,
        chunks: [{ title: "KB high raw score", source: "training", score: 0.9 }],
      },
      research: { enabled: false, weight: 0, matches: [] },
      uploadedFiles: { enabled: false, weight: 0, assets: [] },
    };
    const out = collectChatSources(inputs);
    expect(out[0].namespace).toBe("documents");
    expect(out[1].namespace).toBe("knowledge-base");
  });
});

describe("collectChatSources — disabled sources and empty inputs", () => {
  it("returns an empty array (never undefined) when every source is disabled", () => {
    const inputs: ChatRetrievalInputs = {
      documents: {
        enabled: false,
        weight: 50,
        results: [{ propertyName: "Hotel Aurora", documentType: "PSA", score: 0.9 }],
      },
      knowledgeBase: {
        enabled: false,
        weight: 70,
        chunks: [{ title: "Cap rate fundamentals", source: "training", score: 0.9 }],
      },
      research: {
        enabled: false,
        weight: 60,
        matches: [
          {
            id: "research:1",
            title: "Some research",
            namespace: "research-history",
            score: 0.9,
          },
        ],
      },
      uploadedFiles: {
        enabled: false,
        weight: 50,
        assets: [
          { id: 1, type: "photo", caption: "Hero shot", propertyName: "Hotel Aurora", score: 0.9 },
        ],
      },
    };
    const out = collectChatSources(inputs);
    expect(Array.isArray(out)).toBe(true);
    expect(out).toEqual([]);
  });

  it("returns an empty array when every source is enabled but produced zero matches", () => {
    const inputs: ChatRetrievalInputs = {
      documents: { enabled: true, weight: 50, results: [] },
      knowledgeBase: { enabled: true, weight: 70, chunks: [] },
      research: { enabled: true, weight: 60, matches: [] },
      uploadedFiles: { enabled: true, weight: 50, assets: [] },
    };
    const out = collectChatSources(inputs);
    expect(out).toEqual([]);
  });

  it("a single disabled source drops only that source's matches; the rest still surface", () => {
    const inputs = baselineInputs();
    inputs.documents.enabled = false;
    const out = collectChatSources(inputs);
    expect(out.find(s => s.namespace === "documents")).toBeUndefined();
    expect(out.find(s => s.namespace === "knowledge-base")).toBeDefined();
    expect(out.find(s => s.namespace === "research-history")).toBeDefined();
    expect(out.find(s => s.namespace === "assumption-guidance")).toBeDefined();
    expect(out.find(s => s.namespace === "uploaded-files")).toBeDefined();
  });
});

describe("collectChatSources — dedupe + title fallbacks", () => {
  it("collapses duplicate (namespace, title) entries to the highest-scoring representative", () => {
    const inputs: ChatRetrievalInputs = {
      documents: { enabled: true, weight: 50, results: [] },
      knowledgeBase: {
        enabled: true,
        weight: 70,
        chunks: [
          { title: "Cap rate fundamentals", source: "training", score: 0.55 },
          { title: "Cap rate fundamentals", source: "training", score: 0.78 },
          { title: "Cap rate fundamentals", source: "training", score: 0.62 },
        ],
      },
      research: { enabled: false, weight: 60, matches: [] },
      uploadedFiles: { enabled: false, weight: 50, assets: [] },
    };
    const out = collectChatSources(inputs);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Cap rate fundamentals");
    expect(out[0].score).toBeCloseTo(0.78, 6);
  });

  it("falls back to source / generated id when titles are missing", () => {
    expect(knowledgeBaseTitle({ title: "", source: "training-doc-1", score: 0.5 })).toBe("training-doc-1");
    expect(knowledgeBaseTitle({ title: null, source: null, score: 0.5 })).toBe("Knowledge entry");
    expect(documentTitle({ propertyName: "Hotel Aurora", documentType: "PSA", score: 0.5 })).toBe("Hotel Aurora — PSA");
    expect(assetTitle({ id: 9, type: "logo", caption: "", propertyName: null, score: 0.4 })).toBe("Logo #9");
    expect(assetTitle({ id: 9, type: "photo", caption: "  ", propertyName: "Hotel Aurora", score: 0.4 })).toBe("Hotel Aurora — Photo #9");
  });
});
