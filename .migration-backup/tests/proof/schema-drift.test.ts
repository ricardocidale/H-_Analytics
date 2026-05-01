/**
 * Schema Drift — proof test enforcing Drizzle ↔ live-DB parity.
 *
 * Background:
 *   Task #488 was caused by columns declared in `shared/schema/specialist.ts`
 *   (`field_requirements`, `prerequisite_toggles`) that no migration ever
 *   created. The Specialist page only failed because someone tried to read
 *   the column at runtime — there was no early-warning signal.
 *
 *   This test (and its sibling CLI `script/schema-drift-check.ts`) closes
 *   that loop. For every Drizzle-declared table, the live `public` schema
 *   must be a superset of what the schema declares (column name + type +
 *   nullability). Anything new is failed loud here, before reaching users.
 *
 * Pre-existing drift is allow-listed via `BASELINE_DRIFT` in the script;
 * the second assertion below catches stale baseline entries (drift that
 * was fixed but its allow-list line was forgotten).
 *
 * Owner: Task #490 — "Stop schema drift between Drizzle code and the database".
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runSchemaDriftCheck,
  isBaselined,
  findingKey,
  BASELINE_DRIFT,
  type DriftFinding,
} from "../../script/schema-drift-check";
import { pool } from "../../server/db";

describe("Schema Drift — Drizzle vs live Postgres", () => {
  let allFindings: DriftFinding[] | null = null;
  let runError: unknown = null;

  beforeAll(async () => {
    try {
      allFindings = await runSchemaDriftCheck();
    } catch (err) {
      runError = err;
    }
  }, 30_000);

  afterAll(async () => {
    // Release pool so vitest doesn't hang on dangling connections when this
    // file runs in isolation. (verify-summary shares the pool across phases,
    // so end() during shared runs is a no-op for already-ended pools.)
    await pool.end().catch(() => {});
  });

  it("DB query succeeded", () => {
    if (runError) {
      throw new Error(
        `schema-drift-check could not query the live DB: ${
          runError instanceof Error ? runError.message : String(runError)
        }. Is POSTGRES_URL/DATABASE_URL set?`,
      );
    }
    expect(allFindings).not.toBeNull();
  });

  it("no NEW drift beyond the documented baseline", () => {
    expect(allFindings).not.toBeNull();
    const findings = (allFindings ?? []).filter((f) => !isBaselined(f));
    const summary = findings.map((f) => `[${f.kind}] ${f.message}`).join("\n  ");
    expect(
      findings,
      findings.length === 0
        ? ""
        : `Found ${findings.length} new schema drift finding(s). ` +
            `Either write a Drizzle migration to align the DB, fix the ` +
            `schema declaration, or — if the drift is intentional and ` +
            `out-of-scope — add an entry to BASELINE_DRIFT in ` +
            `script/schema-drift-check.ts with a justification.\n\n  ${summary}`,
    ).toEqual([]);
  });

  it("baseline contains no stale entries (each listed key is still drifting)", () => {
    expect(allFindings).not.toBeNull();

    // CI uses a fresh drizzle-generated DB (created by `pnpm run db:push
    // --force`) which has zero drift — the schema IS the DB. In that case
    // allFindings is empty and every BASELINE_DRIFT entry would appear
    // "stale" even though the drift genuinely exists in production.
    //
    // Skipping on an empty findings set is safe: the "no NEW drift" test
    // above already asserts correctness, and baseline-staleness only makes
    // sense when evaluated against a DB that carries documented historical
    // drift (local dev, staging, or prod).
    if ((allFindings ?? []).length === 0) {
      console.log(
        "[schema-drift] baseline-staleness check skipped — fresh DB has no " +
          "drift; run against a production-shaped DB to validate BASELINE_DRIFT.",
      );
      return;
    }

    const liveKeys = new Set(
      (allFindings ?? []).map((f) => `${f.kind}::${findingKey(f)}`),
    );
    const stale = BASELINE_DRIFT.filter(
      (b) => !liveKeys.has(`${b.kind}::${b.key}`),
    );
    expect(
      stale,
      stale.length === 0
        ? ""
        : `The following BASELINE_DRIFT entries no longer match any live ` +
            `drift finding — remove them from script/schema-drift-check.ts:\n  ` +
            stale.map((b) => `[${b.kind}] ${b.key}`).join("\n  "),
    ).toEqual([]);
  });
});
