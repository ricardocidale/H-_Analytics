import { z } from "zod/v4";

export const rebeccaContextContractSchema = z.object({
  conversationId: z.number().optional(),
  messageId: z.number().optional(),
  userId: z.number(),
  requestContext: z.object({
    contextType: z.string(),
    contextKey: z.string().nullable(),
    currentPage: z.string().optional(),
    entityType: z.string().optional(),
    entityId: z.number().optional(),
  }),
  manifest: z.array(z.object({
    sourceKey: z.string(),
    namespace: z.string(),
    itemId: z.string().optional(),
    title: z.string().optional(),
    score: z.number().optional(),
    weight: z.number().optional(),
    retrievalMode: z.string(),
    metadata: z.record(z.string(), z.any()).optional(),
  })),
  promptBlocksIncluded: z.array(z.string()),
  generatedAt: z.string(),
});
