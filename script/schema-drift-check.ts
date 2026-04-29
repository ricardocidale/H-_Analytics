/**
 * Schema Drift Check — compares Drizzle table declarations against the live
 * Postgres database and reports any column that the schema declares but the
 * DB is missing (or where type / nullability disagree).
 *
 * Background:
 *   Task #488 happened because `shared/schema/specialist.ts` declared two
 *   columns (`field_requirements`, `prerequisite_toggles`) for which no
 *   migration was ever written. The mismatch only surfaced the first time
 *   a runtime query touched those columns and the user-facing Specialist
 *   page 500ed. There was no early-warning signal between the schema edit
 *   and the production blow-up.
 *
 *   This script provides that signal: for every Drizzle-declared table it
 *   asserts the live DB columns are a superset of what the schema declares
 *   (name + type + nullability). Wired into `verify:summary` so a missing
 *   migration is caught before it reaches users.
 *
 * Usage:
 *   POSTGRES_URL=... npx tsx script/schema-drift-check.ts
 *
 * Exit codes:
 *   0 — schema matches DB (or DB is a strict superset)
 *   1 — drift detected (missing column, type mismatch, or nullability flip)
 *   2 — could not connect / tooling failure
 *
 * Scope:
 *   Only tables re-exported from `@shared/schema` (i.e. excludes the
 *   `dev_internal.replit_*` billing telemetry tables, which intentionally
 *   live in a separate Postgres schema and are not part of the app
 *   contract).
 */
import { is, sql } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@shared/schema";
import { db } from "../server/db";
import { pool } from "../server/db";

export interface ColumnExpectation {
  exportName: string;
  tableName: string;
  columnName: string;
  sqlType: string;
  notNull: boolean;
}

export interface DriftFinding {
  kind: "missing-table" | "missing-column" | "type-mismatch" | "nullability-mismatch";
  exportName: string;
  tableName: string;
  columnName?: string;
  expected?: string;
  actual?: string;
  message: string;
  /** True if this finding is in the baseline allow-list (pre-existing). */
  baselined?: boolean;
}

/**
 * Pre-existing drift the day this check went live (Task #490). Each entry
 * is the canonical "table.column" key (or just "table" for missing-table).
 * The baseline is intentionally narrow: only kinds that pre-date this check
 * and that no one has prioritized fixing. The dangerous class — declared
 * but missing-from-DB columns (the actual #488 bug) — is NEVER baselined.
 *
 * Workflow when this list grows:
 *   1. Prefer fixing the drift (write a migration or change the schema).
 *   2. If a fix is genuinely out-of-scope right now, append the key here
 *      with a comment explaining why and link the follow-up task.
 *
 * Stale entries are caught by the "no stale baseline" assertion in
 * `tests/proof/schema-drift.test.ts`.
 */
export const BASELINE_DRIFT: ReadonlyArray<{ kind: DriftFinding["kind"]; key: string; reason: string }> = [
  {
    kind: "type-mismatch",
    key: "assumption_change_log.created_at",
    reason: "DB column was created as timestamptz; Drizzle declares plain timestamp. Pre-existing as of Task #490 — fix requires a migration that converts the column type.",
  },
  {
    kind: "type-mismatch",
    key: "properties.last_validated_at",
    reason: "DB column was created as timestamptz; Drizzle declares plain timestamp. Pre-existing as of Task #490 — fix requires a migration that converts the column type.",
  },
  {
    kind: "nullability-mismatch",
    key: "users.password_hash",
    reason: "DB enforces NOT NULL but Drizzle types it as nullable to support OAuth-only users. Pre-existing as of Task #490 — fix requires aligning either the DB constraint or the Drizzle column.",
  },
  {
    kind: "missing-column",
    key: "pipeline_policies.analyst_a_model_resource_id",
    reason: "P6e — global N+1 model defaults adapter. Migration pipeline_n1_global_models_001 adds this column on next server startup.",
  },
  {
    kind: "missing-column",
    key: "pipeline_policies.analyst_b_model_resource_id",
    reason: "P6e — global N+1 model defaults adapter. Migration pipeline_n1_global_models_001 adds this column on next server startup.",
  },
  {
    kind: "missing-column",
    key: "pipeline_policies.synthesis_model_resource_id",
    reason: "P6e — global N+1 model defaults adapter. Migration pipeline_n1_global_models_001 adds this column on next server startup.",
  },
  {
    kind: "missing-column",
    key: "pipeline_policies.fallback_model_resource_id",
    reason: "P6e — global N+1 model defaults adapter. Migration pipeline_n1_global_models_001 adds this column on next server startup.",
  },
];

export function findingKey(f: DriftFinding): string {
  if (f.kind === "missing-table") return f.tableName;
  return `${f.tableName}.${f.columnName ?? ""}`;
}

export function isBaselined(f: DriftFinding): boolean {
  const key = findingKey(f);
  return BASELINE_DRIFT.some((b) => b.kind === f.kind && b.key === key);
}

/**
 * Collect every column declared by Drizzle across `@shared/schema`. The
 * resulting list is the contract the live DB must satisfy.
 */
export function collectExpectedColumns(): ColumnExpectation[] {
  const out: ColumnExpectation[] = [];
  for (const [exportName, value] of Object.entries(schema)) {
    if (!is(value as object, PgTable)) continue;
    const cfg = getTableConfig(value as PgTable);
    // Skip non-public schema tables (replit-billing lives in dev_internal,
    // and is not re-exported from @shared/schema, but defensive guard here).
    if (cfg.schema && cfg.schema !== "public") continue;
    for (const col of cfg.columns) {
      out.push({
        exportName,
        tableName: cfg.name,
        columnName: col.name,
        sqlType: col.getSQLType(),
        notNull: col.notNull,
      });
    }
  }
  return out;
}

interface LiveColumn {
  data_type: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
}

type LiveSchemaMap = Map<string, Map<string, LiveColumn>>;

/**
 * Snapshot the live DB's `public` schema columns into a nested map keyed
 * by table → column. One round-trip per process.
 */
export async function snapshotLiveSchema(): Promise<LiveSchemaMap> {
  const rows = await db.execute<{
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: "YES" | "NO";
    character_maximum_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
  }>(sql`
    SELECT table_name, column_name, data_type, udt_name, is_nullable,
           character_maximum_length, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const out: LiveSchemaMap = new Map();
  // node-postgres returns { rows }, drizzle's execute returns the same shape.
  const list = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows ?? rows;
  for (const r of list as Array<{
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: "YES" | "NO";
    character_maximum_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
  }>) {
    let cols = out.get(r.table_name);
    if (!cols) {
      cols = new Map();
      out.set(r.table_name, cols);
    }
    cols.set(r.column_name, {
      data_type: r.data_type,
      udt_name: r.udt_name,
      is_nullable: r.is_nullable,
      character_maximum_length: r.character_maximum_length,
      numeric_precision: r.numeric_precision,
      numeric_scale: r.numeric_scale,
    });
  }
  return out;
}

/**
 * Normalize a Drizzle `getSQLType()` string into a canonical form that
 * survives small differences (length specifiers, alias spellings) so it
 * can be compared against the normalized PG side.
 */
function normalizeDrizzleType(raw: string): string {
  let s = raw.trim().toLowerCase();
  // Strip length / precision modifiers: `varchar(255)` → `varchar`.
  s = s.replace(/\s*\(\s*\d+\s*(,\s*\d+\s*)?\)/g, "");
  // Common aliases.
  s = s.replace(/^character varying$/, "varchar");
  s = s.replace(/^bool$/, "boolean");
  s = s.replace(/^int$/, "integer");
  s = s.replace(/^int4$/, "integer");
  s = s.replace(/^int8$/, "bigint");
  s = s.replace(/^int2$/, "smallint");
  s = s.replace(/^float8$/, "double precision");
  s = s.replace(/^float4$/, "real");
  // Drizzle's `serial` materializes as integer with a sequence default. The
  // information_schema reports `data_type = integer` for it.
  s = s.replace(/^serial$/, "integer");
  s = s.replace(/^bigserial$/, "bigint");
  s = s.replace(/^smallserial$/, "smallint");
  // Drizzle emits `timestamp with time zone` and `timestamp` already in
  // PG-canonical form; nothing to do.
  // Collapse repeated whitespace.
  s = s.replace(/\s+/g, " ");
  return s;
}

/**
 * Normalize a row from `information_schema.columns` into the same canonical
 * form as `normalizeDrizzleType`. Arrays show up as `data_type = "ARRAY"`
 * with the element type stored in `udt_name` (prefixed with `_`).
 */
function normalizeLiveType(c: LiveColumn): string {
  let s = c.data_type.toLowerCase();
  if (s === "array") {
    // udt_name is `_text`, `_int4`, `_jsonb`, etc.
    const elem = c.udt_name.replace(/^_/, "");
    return `${normalizeDrizzleType(elem)}[]`;
  }
  if (s === "user-defined") {
    // Enum / domain — fall back to the udt_name.
    s = c.udt_name.toLowerCase();
  }
  s = s.replace(/^character varying$/, "varchar");
  // PG sometimes emits `timestamp without time zone`; Drizzle emits
  // `timestamp` for the same thing.
  s = s.replace(/^timestamp without time zone$/, "timestamp");
  s = s.replace(/^time without time zone$/, "time");
  return s.replace(/\s+/g, " ");
}

/**
 * Compare schema vs live DB and return all drift findings. An empty array
 * means the live DB is a valid superset of the Drizzle declarations.
 */
export function diffSchema(
  expected: ColumnExpectation[],
  live: LiveSchemaMap,
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const seenTables = new Set<string>();
  for (const exp of expected) {
    const liveCols = live.get(exp.tableName);
    if (!liveCols) {
      if (!seenTables.has(exp.tableName)) {
        seenTables.add(exp.tableName);
        findings.push({
          kind: "missing-table",
          exportName: exp.exportName,
          tableName: exp.tableName,
          message: `Table "${exp.tableName}" (export "${exp.exportName}") declared in schema but not present in DB`,
        });
      }
      continue;
    }
    const liveCol = liveCols.get(exp.columnName);
    if (!liveCol) {
      findings.push({
        kind: "missing-column",
        exportName: exp.exportName,
        tableName: exp.tableName,
        columnName: exp.columnName,
        expected: `${exp.sqlType}${exp.notNull ? " NOT NULL" : ""}`,
        message: `Column "${exp.tableName}.${exp.columnName}" declared in schema (${exp.sqlType}${exp.notNull ? " NOT NULL" : ""}) but missing from DB`,
      });
      continue;
    }
    const want = normalizeDrizzleType(exp.sqlType);
    const got = normalizeLiveType(liveCol);
    if (want !== got) {
      findings.push({
        kind: "type-mismatch",
        exportName: exp.exportName,
        tableName: exp.tableName,
        columnName: exp.columnName,
        expected: want,
        actual: got,
        message: `Column "${exp.tableName}.${exp.columnName}" type drift: schema says "${want}", DB has "${got}"`,
      });
    }
    const wantNotNull = exp.notNull;
    const gotNotNull = liveCol.is_nullable === "NO";
    if (wantNotNull !== gotNotNull) {
      findings.push({
        kind: "nullability-mismatch",
        exportName: exp.exportName,
        tableName: exp.tableName,
        columnName: exp.columnName,
        expected: wantNotNull ? "NOT NULL" : "NULL",
        actual: gotNotNull ? "NOT NULL" : "NULL",
        message: `Column "${exp.tableName}.${exp.columnName}" nullability drift: schema says ${wantNotNull ? "NOT NULL" : "NULL"}, DB has ${gotNotNull ? "NOT NULL" : "NULL"}`,
      });
    }
  }
  return findings;
}

export async function runSchemaDriftCheck(): Promise<DriftFinding[]> {
  const expected = collectExpectedColumns();
  const live = await snapshotLiveSchema();
  return diffSchema(expected, live);
}

async function main(): Promise<void> {
  let allFindings: DriftFinding[];
  try {
    allFindings = await runSchemaDriftCheck();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`schema-drift-check: failed to query DB — ${msg}`);
    await pool.end().catch(() => {});
    process.exit(2);
  }
  for (const f of allFindings) f.baselined = isBaselined(f);
  const findings = allFindings.filter((f) => !f.baselined);
  const baselinedCount = allFindings.length - findings.length;
  if (findings.length === 0) {
    console.log(
      `schema-drift-check: OK — every Drizzle column exists in DB with matching type and nullability${baselinedCount ? ` (${baselinedCount} baselined finding(s) ignored)` : ""}.`,
    );
    await pool.end().catch(() => {});
    process.exit(0);
  }
  console.error(`schema-drift-check: FAIL — ${findings.length} drift finding(s):`);
  // Group by kind for easier triage.
  const byKind = new Map<DriftFinding["kind"], DriftFinding[]>();
  for (const f of findings) {
    const list = byKind.get(f.kind) ?? [];
    list.push(f);
    byKind.set(f.kind, list);
  }
  for (const [kind, list] of byKind) {
    console.error(`\n  [${kind}] ${list.length}`);
    for (const f of list) console.error(`    - ${f.message}`);
  }
  console.error(
    "\nNext steps: write a Drizzle migration that adds the missing column(s)/table(s),",
    "\nor remove the stale declaration from `shared/schema/**`.",
  );
  await pool.end().catch(() => {});
  process.exit(1);
}

// Only run main when invoked directly, not when imported by the proof test.
const invokedDirectly = process.argv[1]?.endsWith("schema-drift-check.ts")
  || process.argv[1]?.endsWith("schema-drift-check.js");
if (invokedDirectly) {
  void main();
}
