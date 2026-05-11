/**
 * Factory v2 U3 — runtime guard contract test for slide-factory-runs-v2-columns.
 *
 * The repo's migration tests are unit tests, not live-DB integration tests
 * (no in-repo migration test reaches Neon). This test mocks `db.execute` and
 * asserts that the guard emits the correct SQL fragments — covering:
 *   - All three column adds are ADD COLUMN IF NOT EXISTS.
 *   - wish_list_log is jsonb NOT NULL DEFAULT '[]'::jsonb.
 *   - The slide4_property_id FK is dropped (IF EXISTS) and re-added with
 *     ON DELETE set null so the pair is re-runnable.
 *   - The status CHECK is dropped and re-added with all twelve Factory v2
 *     statuses including 'substituting', 'converting_pdf', and 'rebuilding'.
 *   - The guard logs success when every statement resolves.
 *
 * Integration verification (that the SQL runs cleanly on a live DB) is covered
 * by the runtime guard executing on every boot — boot failure is loud, so the
 * Drizzle journal-state drift learning's "guarded" status keeps the contract.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock state ───────────────────────────────────────────────────────
const { mockExecute, mockInfo, mockError } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockInfo: vi.fn(),
  mockError: vi.fn(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("../../db", () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

vi.mock("../../logger", () => ({
  logger: {
    info: (...args: unknown[]) => mockInfo(...args),
    error: (...args: unknown[]) => mockError(...args),
    warn: vi.fn(),
  },
  loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// ── Imports (after mocks are set up) ─────────────────────────────────────────
import { runSlideFactoryRunsV2Columns } from "../../migrations/slide-factory-runs-v2-columns";

// ── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Drizzle's sql tagged template builds a SQL object; extract a readable string
 * by joining the raw SQL chunks. Strips whitespace for assertion robustness.
 */
function extractSql(call: unknown[]): string {
  const arg = call[0] as { queryChunks?: Array<{ value?: string[] }> };
  if (arg && Array.isArray(arg.queryChunks)) {
    return arg.queryChunks
      .map((c) => (c && Array.isArray(c.value) ? c.value.join("") : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  // Fallback: stringify the whole arg for substring matching.
  return JSON.stringify(arg).replace(/\s+/g, " ").trim();
}

function allExecutedSql(): string {
  return mockExecute.mock.calls.map((c) => extractSql(c)).join(" || ");
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("runSlideFactoryRunsV2Columns", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockInfo.mockReset();
    mockError.mockReset();
    mockExecute.mockResolvedValue(undefined);
  });

  it("runs the expected set of DDL statements (6 + the two FK pair statements)", async () => {
    await runSlideFactoryRunsV2Columns();

    // 3 column adds + FK drop + FK add + CHECK drop + CHECK add = 7 statements
    expect(mockExecute).toHaveBeenCalledTimes(7);
  });

  it("adds slide4_property_id, wish_list_log, and pptx_r2_key with IF NOT EXISTS", async () => {
    await runSlideFactoryRunsV2Columns();
    const allSql = allExecutedSql();

    expect(allSql).toMatch(/ADD COLUMN IF NOT EXISTS "slide4_property_id" integer/);
    expect(allSql).toMatch(
      /ADD COLUMN IF NOT EXISTS "wish_list_log" jsonb NOT NULL DEFAULT '\[\]'::jsonb/,
    );
    expect(allSql).toMatch(/ADD COLUMN IF NOT EXISTS "pptx_r2_key" text/);
  });

  it("DROP+ADDs the slide4 FK with ON DELETE set null so the pair is re-runnable", async () => {
    await runSlideFactoryRunsV2Columns();
    const allSql = allExecutedSql();

    expect(allSql).toMatch(
      /DROP CONSTRAINT IF EXISTS "slide_factory_runs_slide4_property_id_properties_id_fk"/,
    );
    expect(allSql).toMatch(
      /ADD CONSTRAINT "slide_factory_runs_slide4_property_id_properties_id_fk".*FOREIGN KEY \("slide4_property_id"\) REFERENCES "properties"\("id"\) ON DELETE set null/,
    );
  });

  it("DROP+ADDs the status CHECK including all twelve Factory v2 statuses", async () => {
    await runSlideFactoryRunsV2Columns();
    const allSql = allExecutedSql();

    expect(allSql).toMatch(
      /DROP CONSTRAINT IF EXISTS "slide_factory_runs_status_check"/,
    );
    expect(allSql).toMatch(
      /ADD CONSTRAINT "slide_factory_runs_status_check"\s+CHECK \(status IN \(/,
    );
    // New Factory v2 statuses must be in the CHECK.
    expect(allSql).toMatch(/'substituting'/);
    expect(allSql).toMatch(/'converting_pdf'/);
    // Latent drift heal: 'rebuilding' was in TS but not in the original DB CHECK.
    expect(allSql).toMatch(/'rebuilding'/);
    // Original 9 statuses still present (smoke check on the canonical set).
    for (const s of [
      "new",
      "brief_ready",
      "ingesting",
      "ingested",
      "drafting",
      "draft_review",
      "building",
      "complete",
      "error",
    ]) {
      expect(allSql).toContain(`'${s}'`);
    }
  });

  it("logs a success message when every statement resolves", async () => {
    await runSlideFactoryRunsV2Columns();

    expect(mockInfo).toHaveBeenCalledTimes(1);
    const [msg] = mockInfo.mock.calls[0];
    expect(String(msg)).toMatch(/slide_factory_runs Factory v2 columns/);
    expect(mockError).not.toHaveBeenCalled();
  });

  it("rethrows when db.execute fails and logs the error", async () => {
    const boom = new Error("relation \"slide_factory_runs\" does not exist");
    mockExecute.mockRejectedValueOnce(boom);

    await expect(runSlideFactoryRunsV2Columns()).rejects.toThrow(
      /relation "slide_factory_runs" does not exist/,
    );
    expect(mockError).toHaveBeenCalledTimes(1);
  });
});
