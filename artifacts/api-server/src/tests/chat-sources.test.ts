import { describe, it, expect } from 'vitest';
import { collectChatSourcesFromManifest, ChatSourceUsed } from '../routes/chat-sources';
import { RetrievalManifestEntry } from '../ai/rebecca-context-contract';

describe('collectChatSourcesFromManifest', () => {
  const mockSettings = {
    documents: { enabled: true, weight: 80 },
    knowledgeBase: { enabled: true, weight: 60 },
    research: { enabled: true, weight: 100 },
    uploadedFiles: { enabled: true, weight: 40 },
  };

  it('should map manifest entries to ChatSourceUsed', () => {
    const manifest: RetrievalManifestEntry[] = [
      {
        sourceKey: 'documents',
        namespace: 'documents',
        title: 'Doc A',
        score: 0.9,
        retrievalMode: 'semantic',
      },
    ];

    const result = collectChatSourcesFromManifest(manifest, mockSettings);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      title: 'Doc A',
      namespace: 'documents',
      score: 0.9,
      weight: 80,
    });
  });

  it('should drop entries from disabled sources', () => {
    const manifest: RetrievalManifestEntry[] = [
      {
        sourceKey: 'documents',
        namespace: 'documents',
        title: 'Doc A',
        score: 0.9,
        retrievalMode: 'semantic',
      },
    ];
    const settings = {
      ...mockSettings,
      documents: { enabled: false, weight: 80 },
    };

    const result = collectChatSourcesFromManifest(manifest, settings);
    expect(result).toHaveLength(0);
  });

  it('should handle weight=0 correctly', () => {
    const manifest: RetrievalManifestEntry[] = [
      {
        sourceKey: 'documents',
        namespace: 'documents',
        title: 'Doc A',
        score: 0.9,
        retrievalMode: 'semantic',
      },
      {
        sourceKey: 'research',
        namespace: 'research-history',
        title: 'Research B',
        score: 0.5,
        retrievalMode: 'semantic',
      },
    ];
    const settings = {
      ...mockSettings,
      documents: { enabled: true, weight: 0 },
      research: { enabled: true, weight: 100 },
    };

    const result = collectChatSourcesFromManifest(manifest, settings);
    expect(result).toHaveLength(2);
    // Research B should be first because Doc A has 0 weight
    expect(result[0].title).toBe('Research B');
    expect(result[1].title).toBe('Doc A');
    expect(result[1].weight).toBe(0);
  });

  it('should deduplicate identical namespace and title entries', () => {
    const manifest: RetrievalManifestEntry[] = [
      {
        sourceKey: 'knowledgeBase',
        namespace: 'kb',
        title: 'Same Title',
        score: 0.5,
        retrievalMode: 'semantic',
      },
      {
        sourceKey: 'knowledgeBase',
        namespace: 'kb',
        title: 'Same Title',
        score: 0.8,
        retrievalMode: 'semantic',
      },
    ];

    const result = collectChatSourcesFromManifest(manifest, mockSettings);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(0.8);
  });

  it('should use default weight for sources not in settings', () => {
    const manifest: RetrievalManifestEntry[] = [
      {
        sourceKey: 'portfolio' as any,
        namespace: 'portfolio',
        title: 'Portfolio Context',
        retrievalMode: 'injected',
      },
    ];

    const result = collectChatSourcesFromManifest(manifest, mockSettings);
    expect(result).toHaveLength(1);
    expect(result[0].weight).toBe(100);
  });
});
