import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import { extractMethodologyContent, extractVerificationManualContent, extractPlatformGuide } from "../ai/kb-content";

const TAG = "[migration] rebecca-kb-001";

export async function runRebeccaKB001(): Promise<void> {
  const existing = await db.execute(sql`SELECT COUNT(*)::int AS count FROM rebecca_knowledge_base`);
  const row = existing.rows?.[0] as { count: number } | undefined;
  const count = row?.count ?? 0;

  if (count === 0) {
    const allChunks = [
      ...extractMethodologyContent(),
      ...extractVerificationManualContent(),
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
