import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] engine-suggested-lines-001";

export async function runEngineSuggestedLines001(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS engine_suggested_lines (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      statement_type text NOT NULL,
      category text NOT NULL,
      line_name text NOT NULL,
      description text,
      justification text,
      suggested_by_run_id integer REFERENCES research_runs(id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'pending',
      reviewed_by integer REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at timestamp,
      rejection_reason text,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS engine_suggested_lines_status_idx ON engine_suggested_lines (status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS engine_suggested_lines_statement_idx ON engine_suggested_lines (statement_type)`);

  logger.info(`${TAG} Engine suggested lines migration complete`);
}
