/**
 * Task #468 — locks the contract of the one-shot
 * `properties.financials_computed_at` backfill.
 *
 * The backfill exists so the `all-properties-financials-computed`
 * Specialist prerequisite (engine/analyst/registry/prerequisite-registry.ts)
 * doesn't false-positive every existing property as stale on first deploy.
 * The migration is so small that the only way it can drift is by someone
 * "tidying" the SQL and accidentally:
 *   - dropping the `WHERE financials_computed_at IS NULL` filter (would
 *     clobber a freshly-stamped timestamp from a real recompute), or
 *   - swapping `updated_at` for `now()` (would synthesize a "fresh"
 *     timestamp for never-computed properties, defeating the gate), or
 *   - touching some other table.
 *
 * These tests pin the SQL contract so that regression is loud.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { executeSpy } = vi.hoisted(() => ({
  executeSpy: vi.fn(async (_sql: unknown) => ({ rowCount: 0 })),
}));

vi.mock("../../server/db", () => ({
  db: { execute: executeSpy },
}));

vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import { runFinancialsComputedAtBackfill001 } from "../../server/migrations/financials-computed-at-backfill-001";

function getRenderedSql(call: unknown): string {
  // drizzle's `sql` template returns an object with a `queryChunks` array.
  // We stringify by joining the static fragments — that's enough to assert
  // on the table, target column, source column, and WHERE clause without
  // depending on drizzle internals.
  const node = call as { queryChunks?: Array<{ value?: string[] }> };
  const chunks = node.queryChunks ?? [];
  return chunks
    .map((c) => (Array.isArray(c.value) ? c.value.join("") : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("financials-computed-at-backfill-001 migration (Task #468)", () => {
  beforeEach(() => {
    executeSpy.mockReset();
    executeSpy.mockResolvedValue({ rowCount: 0 } as never);
  });

  it("runs exactly one statement against the properties table", async () => {
    await runFinancialsComputedAtBackfill001();
    expect(executeSpy).toHaveBeenCalledTimes(1);
    const rendered = getRenderedSql(executeSpy.mock.calls[0][0]);
    expect(rendered).toMatch(/UPDATE properties/i);
  });

  it("backfills financials_computed_at from updated_at (the safe per-row 'last touched' fallback)", async () => {
    await runFinancialsComputedAtBackfill001();
    const rendered = getRenderedSql(executeSpy.mock.calls[0][0]);
    expect(rendered).toMatch(/SET financials_computed_at = updated_at/i);
    // Explicitly forbid the "synthesize a fresh timestamp" failure mode
    // that would mark every never-computed property as freshly computed
    // and silently open the Specialist gate.
    expect(rendered).not.toMatch(/now\(\)/i);
    expect(rendered).not.toMatch(/CURRENT_TIMESTAMP/i);
  });

  it("only touches rows where financials_computed_at IS NULL (idempotent — never clobbers a real stamp)", async () => {
    await runFinancialsComputedAtBackfill001();
    const rendered = getRenderedSql(executeSpy.mock.calls[0][0]);
    expect(rendered).toMatch(/WHERE financials_computed_at IS NULL/i);
  });

  it("propagates DB failures (no silent swallow — startup must fail loud if the backfill cannot run)", async () => {
    executeSpy.mockRejectedValueOnce(new Error("db down"));
    await expect(runFinancialsComputedAtBackfill001()).rejects.toThrow(
      "db down",
    );
  });
});
