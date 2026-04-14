import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { logger } from "../logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function run(db: NodePgDatabase<any>) {
  const TAG = "[migration] drop-company-fk-001";

  const hasColumn = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'company_id'
  `);

  if (hasColumn.rows.length === 0) {
    logger.info(`${TAG} company_id column already removed — skipping`, "migration");
    return;
  }

  logger.info(`${TAG} Backfilling users.company from companies table...`, "migration");

  await db.execute(sql`
    UPDATE users u
    SET company = c.name
    FROM companies c
    WHERE u.company_id = c.id
      AND (u.company IS NULL OR u.company = '')
  `);

  const backfilled = await db.execute(sql`
    SELECT count(*) as cnt FROM users WHERE company IS NOT NULL AND company != ''
  `);
  logger.info(`${TAG} ${backfilled.rows[0]?.cnt ?? 0} users now have company text set`, "migration");

  await db.execute(sql`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_company_id_companies_id_fk
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS users_company_id_idx
  `);
  await db.execute(sql`
    ALTER TABLE users DROP COLUMN IF EXISTS company_id
  `);

  logger.info(`${TAG} Dropped company_id column from users table`, "migration");
}
