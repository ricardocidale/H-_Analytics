import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "schema-probe";

/**
 * Known columns we expect to exist on the dev/prod database, paired with the
 * idempotent `ADD COLUMN IF NOT EXISTS` heal SQL we will apply if a probe
 * SELECT comes back with `column does not exist`.
 *
 * Add an entry here whenever a runtime seed/migration introduces a column
 * that the Drizzle schema treats as required. The boot probe will then
 * auto-heal it on dev DBs that missed the seed (instead of silently
 * blocking login or other queries).
 */
type ColumnHeal = {
  table: string;
  column: string;
  healSql: string;
};

const KNOWN_COLUMN_HEALS: readonly ColumnHeal[] = [
  {
    table: "users",
    column: "rebecca_rail_open",
    healSql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS rebecca_rail_open boolean NOT NULL DEFAULT false`,
  },
];

/**
 * Required column probes — one SELECT per critical table. We list the column
 * names explicitly so a missing column produces a Postgres
 * `column "..." does not exist` error rather than a silent success.
 */
const REQUIRED_COLUMN_PROBES: ReadonlyArray<{
  table: string;
  columns: readonly string[];
}> = [
  {
    table: "users",
    columns: [
      "id",
      "email",
      "password_hash",
      "role",
      "rebecca_opt_out",
      "rebecca_rail_open",
    ],
  },
];

function isMissingColumnError(err: unknown): { column: string } | null {
  const msg = err instanceof Error ? err.message : String(err);
  // Postgres: column "foo" of relation "bar" does not exist
  // Postgres: column foo.bar does not exist
  const m = msg.match(/column "?([a-zA-Z0-9_.]+)"? (?:of relation "?[a-zA-Z0-9_]+"? )?does not exist/i);
  if (!m) return null;
  // strip optional table-qualified prefix (users.rebecca_rail_open → rebecca_rail_open)
  const raw = m[1];
  const dot = raw.lastIndexOf(".");
  return { column: dot >= 0 ? raw.slice(dot + 1) : raw };
}

async function probeOnce(table: string, columns: readonly string[]): Promise<void> {
  // Identifiers are hard-coded above (not user input), so direct interpolation
  // into the SQL string is safe here.
  const colList = columns.join(", ");
  await db.execute(sql.raw(`SELECT ${colList} FROM ${table} LIMIT 1`));
}

/**
 * Verify the database has every column the application's runtime queries
 * depend on. If a known column is missing, attempt a one-shot auto-heal
 * (idempotent `ADD COLUMN IF NOT EXISTS`). If the probe still fails after
 * healing, abort boot loudly so the developer sees the drift in the workflow
 * log instead of hitting cryptic 500s on the first login attempt.
 */
export async function runSchemaProbe(): Promise<void> {
  for (const probe of REQUIRED_COLUMN_PROBES) {
    try {
      await probeOnce(probe.table, probe.columns);
    } catch (err: unknown) {
      const missing = isMissingColumnError(err);
      if (!missing) {
        logger.error(
          `[${TAG}] probe of ${probe.table} failed with non-missing-column error: ${
            err instanceof Error ? err.message : String(err)
          }`,
          TAG,
        );
        throw err;
      }

      const heal = KNOWN_COLUMN_HEALS.find(
        (h) => h.table === probe.table && h.column === missing.column,
      );

      if (!heal) {
        logger.error(
          `[${TAG}] FATAL: ${probe.table}.${missing.column} is missing and no auto-heal is registered. ` +
            `Add an entry to KNOWN_COLUMN_HEALS in artifacts/api-server/src/migrations/schema-probe.ts ` +
            `or apply the matching Drizzle migration manually before restarting.`,
          TAG,
        );
        process.exit(1);
      }

      logger.warn(
        `[${TAG}] ${probe.table}.${missing.column} missing on dev DB — applying auto-heal`,
        TAG,
      );
      try {
        await db.execute(sql.raw(heal.healSql));
      } catch (healErr: unknown) {
        logger.error(
          `[${TAG}] FATAL: auto-heal for ${probe.table}.${missing.column} failed: ${
            healErr instanceof Error ? healErr.message : String(healErr)
          }`,
          TAG,
        );
        process.exit(1);
      }

      // Re-probe — if it still fails, we cannot recover.
      try {
        await probeOnce(probe.table, probe.columns);
        logger.info(
          `[${TAG}] auto-heal succeeded — ${probe.table}.${missing.column} now present`,
          TAG,
        );
      } catch (retryErr: unknown) {
        logger.error(
          `[${TAG}] FATAL: ${probe.table} probe still failing after auto-heal: ${
            retryErr instanceof Error ? retryErr.message : String(retryErr)
          }`,
          TAG,
        );
        process.exit(1);
      }
    }
  }
}
