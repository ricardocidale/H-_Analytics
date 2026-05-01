import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import { extractMethodologyContent, extractCheckerManualContent, extractPlatformGuide } from "../ai/kb-content";

const TAG = "[migration] rebecca-kb-001";

export async function runRebeccaKB001(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rebecca_knowledge_base (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      title text NOT NULL,
      content text NOT NULL,
      category text NOT NULL DEFAULT 'custom',
      source text NOT NULL DEFAULT 'manual',
      tags text[] DEFAULT '{}',
      priority integer NOT NULL DEFAULT 50,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS rebecca_kb_category_idx ON rebecca_knowledge_base (category)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS rebecca_kb_active_idx ON rebecca_knowledge_base (is_active)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rebecca_knowledge_history (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      entry_id integer NOT NULL REFERENCES rebecca_knowledge_base(id) ON DELETE CASCADE,
      snapshot jsonb NOT NULL,
      changed_by text,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS rebecca_kb_history_entry_idx ON rebecca_knowledge_history (entry_id)
  `);

  const existing = await db.execute(sql`SELECT COUNT(*)::int AS count FROM rebecca_knowledge_base`);
  const row = existing.rows?.[0] as { count: number } | undefined;
  const count = row?.count ?? 0;

  if (count === 0) {
    const allChunks = [
      ...extractMethodologyContent(),
      ...extractCheckerManualContent(),
      ...extractPlatformGuide(),
    ];

    const categoryMap: Record<string, string> = {
      methodology: "methodology",
      manual: "methodology",
      guide: "hospitality",
      specification: "financial",
      reference: "custom",
    };

    let seeded = 0;
    for (const chunk of allChunks) {
      const cat = categoryMap[chunk.category] ?? "custom";
      const priority = cat === "methodology" ? 80 : cat === "financial" ? 70 : 50;
      await db.execute(sql`
        INSERT INTO rebecca_knowledge_base (title, content, category, source, tags, priority, is_active)
        VALUES (${chunk.title}, ${chunk.content}, ${cat}, ${"system"}, ${sql`ARRAY[]::text[]`}, ${priority}, true)
      `);
      seeded++;
    }
    logger.info(`${TAG} Seeded ${seeded} KB entries from kb-content.ts`);
  } else {
    logger.info(`${TAG} KB table already has ${count} entries, skipping seed`);
  }

  logger.info(`${TAG} Rebecca KB migration complete`);
}
