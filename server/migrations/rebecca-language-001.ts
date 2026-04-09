import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

export async function runRebeccaLanguage001(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE rebecca_conversations
    ADD COLUMN IF NOT EXISTS language text DEFAULT 'en'
  `);
  logger.info("[migration] rebecca-language-001: Added language column to rebecca_conversations");
}
