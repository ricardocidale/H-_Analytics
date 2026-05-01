import { customType, index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * `vector` column type for pgvector. We store embeddings as `number[]` in JS
 * and let pgvector serialise them to its compact binary form. The custom type
 * keeps Drizzle out of the way for vector-specific operators (we use raw SQL
 * via `pool.query` for similarity search).
 */
export const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    if (Array.isArray(value)) return value as unknown as number[];
    if (typeof value !== "string") return [];
    const trimmed = value.replace(/^\[|\]$/g, "");
    if (!trimmed) return [];
    return trimmed.split(",").map((v) => Number(v));
  },
});

export const vectorChunks = pgTable(
  "vector_chunks",
  {
    namespace: text("namespace").notNull(),
    id: text("id").notNull(),
    text: text("text").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.namespace, t.id], name: "vector_chunks_pk" }),
    namespaceIdx: index("vector_chunks_namespace_idx").on(t.namespace),
  }),
);

export type VectorChunkRow = typeof vectorChunks.$inferSelect;
export type InsertVectorChunk = typeof vectorChunks.$inferInsert;
