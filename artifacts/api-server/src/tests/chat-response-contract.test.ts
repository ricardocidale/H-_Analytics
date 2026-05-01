/**
 * Task #686 — Chat response shape contract
 *
 * Pins the contract between the chat route's retrieval step and the
 * `sourcesUsed` field in the response JSON. The chat route calls
 * `collectChatSourcesFromManifest(manifest, settings)` and passes the result
 * directly to `res.json({ sourcesUsed: ... })`. These tests verify that:
 *   1. `sourcesUsed` is ALWAYS an array — never undefined, never null.
 *   2. Every entry has the expected shape { title, namespace, score, weight }.
 *   3. Empty manifest → `[]`, not undefined (the panel must receive a stable type).
 *
 * Coverage gap note: testing that `collectChatSourcesFromManifest` is actually
 * CALLED from the route handler (vs accidentally deleted) requires an HTTP-level
 * integration test with supertest + mocked DB/LLM. That infrastructure does not
 * yet exist in this repo; this test pins the shape contract of the helper itself.
 */
import { describe, it, expect } from 'vitest';
import { collectChatSourcesFromManifest } from '../routes/chat-sources';
import type { RetrievalManifestEntry } from '../ai/rebecca-context-contract';

const MOCK_SETTINGS = {
  documents:     { enabled: true,  weight: 80 },
  knowledgeBase: { enabled: true,  weight: 60 },
  research:      { enabled: true,  weight: 100 },
  uploadedFiles: { enabled: true,  weight: 40 },
};

function makeEntry(overrides: Partial<RetrievalManifestEntry> = {}): RetrievalManifestEntry {
  return {
    sourceKey: 'documents',
    namespace: 'documents',
    title: 'Test Doc',
    score: 0.75,
    retrievalMode: 'semantic',
    ...overrides,
  };
}

describe('chat response contract — sourcesUsed', () => {
  it('returns [] (not undefined) when manifest is empty', () => {
    const result = collectChatSourcesFromManifest([], MOCK_SETTINGS);
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns an array with all enabled entries', () => {
    const result = collectChatSourcesFromManifest(
      [makeEntry(), makeEntry({ sourceKey: 'knowledgeBase', namespace: 'knowledge-base' })],
      MOCK_SETTINGS,
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('every entry has the required shape { title, namespace, score, weight }', () => {
    const result = collectChatSourcesFromManifest(
      [
        makeEntry({ title: 'Doc A', score: 0.9 }),
        makeEntry({ sourceKey: 'research', namespace: 'research-history', title: 'Market A', score: 0.7 }),
      ],
      MOCK_SETTINGS,
    );
    for (const entry of result) {
      expect(typeof entry.title).toBe('string');
      expect(typeof entry.namespace).toBe('string');
      expect(typeof entry.score).toBe('number');
      expect(typeof entry.weight).toBe('number');
    }
  });

  it('weight reflects the admin-configured slider value for the source', () => {
    const result = collectChatSourcesFromManifest(
      [makeEntry({ sourceKey: 'documents', namespace: 'documents', score: 0.8 })],
      MOCK_SETTINGS,
    );
    expect(result[0]?.weight).toBe(MOCK_SETTINGS.documents.weight);
  });

  it('disabled sources produce no entries even if manifest has them', () => {
    const settingsWithDocumentsOff = {
      ...MOCK_SETTINGS,
      documents: { enabled: false, weight: 80 },
    };
    const result = collectChatSourcesFromManifest(
      [makeEntry({ sourceKey: 'documents', namespace: 'documents', score: 0.9 })],
      settingsWithDocumentsOff,
    );
    expect(result).toHaveLength(0);
  });

  it('result is stable — calling twice with same input gives same output length', () => {
    const entries = [makeEntry({ score: 0.9 }), makeEntry({ score: 0.5, title: 'Doc B' })];
    const r1 = collectChatSourcesFromManifest(entries, MOCK_SETTINGS);
    const r2 = collectChatSourcesFromManifest(entries, MOCK_SETTINGS);
    expect(r1).toHaveLength(r2.length);
  });
});
