import { createHash } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { pool } from "../db";
import {
  isMigrationApplied,
  markMigrationApplied,
} from "../migrations/consolidated-schema";
import { logger } from "../logger";

const TAG = "seed:production-sql";

const CANDIDATE_PATHS = [
  path.join(process.cwd(), "dist", "seed-production.sql"),
  path.join(process.cwd(), "script", "seed-production.sql"),
];

async function loadSql(): Promise<{ sql: string; sourcePath: string } | null> {
  for (const candidate of CANDIDATE_PATHS) {
    try {
      const sql = await readFile(candidate, "utf-8");
      return { sql, sourcePath: candidate };
    } catch {
      continue;
    }
  }
  return null;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export async function seedProductionSql(): Promise<
  | { status: "skipped-already-applied"; tag: string }
  | { status: "skipped-not-found" }
  | { status: "applied"; tag: string; sourcePath: string }
> {
  const loaded = await loadSql();
  if (!loaded) {
    logger.warn(
      `seed-production.sql not found in any of: ${CANDIDATE_PATHS.join(", ")}`,
      TAG,
    );
    return { status: "skipped-not-found" };
  }

  const { sql, sourcePath } = loaded;
  const tag = `seed_production_sql_${hashContent(sql)}`;

  if (await isMigrationApplied(tag)) {
    logger.info(
      `Production SQL seed already applied (tag=${tag}); skipping.`,
      TAG,
    );
    return { status: "skipped-already-applied", tag };
  }

  logger.info(
    `Applying production SQL seed from ${sourcePath} (tag=${tag})...`,
    TAG,
  );

  // The script is a single transaction with BEGIN/COMMIT inside, so we run
  // the whole text as one multi-statement query. node-postgres' simple query
  // protocol handles this when no parameters are bound.
  const client = await pool.connect();
  try {
    await client.query(sql);
  } finally {
    client.release();
  }

  await markMigrationApplied(tag);
  logger.info(`Production SQL seed applied successfully (tag=${tag}).`, TAG);
  return { status: "applied", tag, sourcePath };
}
