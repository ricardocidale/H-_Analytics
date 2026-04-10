import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "documents-001";

export async function runDocuments001(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS document_extractions (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        file_content_type TEXT NOT NULL,
        object_path TEXT NOT NULL,
        document_type TEXT NOT NULL DEFAULT 'general',
        status TEXT NOT NULL DEFAULT 'pending',
        raw_extraction_data JSONB,
        error_message TEXT,
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS doc_extractions_property_id_idx ON document_extractions(property_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS doc_extractions_user_id_idx ON document_extractions(user_id)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS extraction_fields (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        extraction_id INTEGER NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,
        field_name TEXT NOT NULL,
        field_label TEXT NOT NULL,
        extracted_value TEXT NOT NULL,
        mapped_property_field TEXT,
        confidence REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        current_value TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS extraction_fields_extraction_id_idx ON extraction_fields(extraction_id)`);

    await db.execute(sql`DROP TABLE IF EXISTS docusign_envelopes CASCADE`);

    logger.info("Migration complete", TAG);
  } catch (error: unknown) {
    logger.error(`Migration failed: ${error}`, TAG);
  }
}
