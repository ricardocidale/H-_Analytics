import type { Table } from "drizzle-orm";

export function stripAutoFields<T extends Record<string, unknown>>(data: T): Omit<T, "id" | "createdAt" | "updatedAt"> {
  const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = data as Record<string, unknown>;
  return rest as Omit<T, "id" | "createdAt" | "updatedAt">;
}

/**
 * Strip unknown keys from a snapshot-derived object so only actual DB columns
 * (minus auto-managed ones like id/createdAt/updatedAt) survive.
 *
 * Use this whenever you're inserting/updating from a `Record<string, unknown>`
 * that came from a JSON blob (scenario snapshots, sync payloads, etc.).
 *
 * @example
 *   const safe = stripToColumns(properties, snapshotData);
 *   await db.insert(properties).values(safe);
 */
export function stripToColumns<T extends Table>(
  table: T,
  data: Record<string, unknown>,
): Record<string, unknown> {
  // Drizzle pgTable objects expose column definitions as enumerable properties
  // whose values are Column instances (they have a `name` getter).
  // We build a Set of the JS-side camelCase keys.
  const columnKeys = new Set<string>();
  for (const [key, col] of Object.entries(table)) {
    // Column objects in Drizzle have a `columnType` property
    if (col && typeof col === "object" && "columnType" in col) {
      columnKeys.add(key);
    }
  }

  // Auto fields managed by the DB or ORM — never include in inserts/updates
  const AUTO_FIELDS = new Set(["id", "createdAt", "updatedAt"]);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (columnKeys.has(key) && !AUTO_FIELDS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}
