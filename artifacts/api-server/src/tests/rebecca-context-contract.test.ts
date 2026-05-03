import { describe, it, expect } from 'vitest';
import { buildContextContract } from '../ai/rebecca-context-contract';
import { collectChatSourcesFromManifest } from '../routes/chat-sources';
import { RetrievalManifestEntry } from '../ai/rebecca-context-contract';

describe('Rebecca Context Contract', () => {
  const mockManifest: RetrievalManifestEntry[] = [
    {
      sourceKey: 'documents',
      namespace: 'documents',
      title: 'Doc A',
      score: 0.9,
      retrievalMode: 'semantic',
    },
  ];

  const mockSettings = {
    documents: { enabled: true, weight: 80 },
    knowledgeBase: { enabled: true, weight: 60 },
    research: { enabled: true, weight: 100 },
    uploadedFiles: { enabled: true, weight: 40 },
  };

  it('buildContextContract should return correct shape', () => {
    const input = {
      conversationId: 123,
      messageId: 456,
      userId: 1,
      requestContext: {
        contextType: 'property',
        contextKey: 'prop-1',
      },
      manifest: mockManifest,
      promptBlocksIncluded: ['block-a'],
    };

    const contract = buildContextContract(input);

    expect(contract.conversationId).toBe(123);
    expect(contract.messageId).toBe(456);
    expect(contract.userId).toBe(1);
    expect(contract.requestContext.contextType).toBe('property');
    expect(contract.manifest).toBe(mockManifest);
    expect(contract.promptBlocksIncluded).toEqual(['block-a']);
    expect(new Date(contract.generatedAt).toISOString()).toBe(contract.generatedAt);
  });

  it('manifest in contract equals input manifest (no mutation)', () => {
    const manifest = [...mockManifest];
    const contract = buildContextContract({
      userId: 1,
      requestContext: { contextType: 'test', contextKey: null },
      manifest,
      promptBlocksIncluded: [],
    });
    
    expect(contract.manifest).toBe(manifest);
  });

  it('collectChatSourcesFromManifest output namespaces are a subset of manifest entry namespaces', () => {
    const manifest: RetrievalManifestEntry[] = [
      { sourceKey: 'documents', namespace: 'ns1', retrievalMode: 'semantic' },
      { sourceKey: 'knowledgeBase', namespace: 'ns2', retrievalMode: 'semantic' },
    ];
    
    const sources = collectChatSourcesFromManifest(manifest, mockSettings);
    const sourceNamespaces = new Set(sources.map(s => s.namespace));
    const manifestNamespaces = new Set(manifest.map(m => m.namespace));
    
    for (const ns of sourceNamespaces) {
      expect(manifestNamespaces.has(ns)).toBe(true);
    }
  });
});
