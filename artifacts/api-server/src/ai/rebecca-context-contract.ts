export type RebeccaSourceKey = "knowledgeBase" | "research" | "documents" | "uploadedFiles" | "portfolio" | "field-context" | "guardrails";

export type RetrievalManifestEntry = {
  sourceKey: RebeccaSourceKey;
  namespace: string;                   // vector_chunks namespace or "portfolio"|"field-context"|"guardrails"
  itemId?: string;                     // chunk id or entity id
  title?: string;                      // human label for sourcesUsed panel
  score?: number;                      // similarity score (0–1), absent for non-vector sources
  weight?: number;                     // admin-configured weight (0–100)
  retrievalMode: "exact" | "semantic" | "hybrid" | "injected"; // injected = non-vector (portfolio, guardrails)
  metadata?: Record<string, unknown>;  // portable — no table column names, just semantic keys
};

export type RebeccaContextContract = {
  conversationId?: number;
  messageId?: number;
  userId: number;
  requestContext: {
    contextType: string;
    contextKey: string | null;
    currentPage?: string;
    entityType?: string;
    entityId?: number;
  };
  manifest: RetrievalManifestEntry[];
  promptBlocksIncluded: string[];      // from computeBlocksIncluded()
  generatedAt: string;                 // ISO timestamp
};

export function buildContextContract(input: {
  conversationId?: number;
  messageId?: number;
  userId: number;
  requestContext: RebeccaContextContract["requestContext"];
  manifest: RetrievalManifestEntry[];
  promptBlocksIncluded: string[];
}): RebeccaContextContract {
  return {
    conversationId: input.conversationId,
    messageId: input.messageId,
    userId: input.userId,
    requestContext: input.requestContext,
    manifest: input.manifest,
    promptBlocksIncluded: input.promptBlocksIncluded,
    generatedAt: new Date().toISOString(),
  };
}
