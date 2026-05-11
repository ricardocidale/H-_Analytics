/**
 * Task #1396 — Minion self-test history.
 *
 * Task #1392 added a fast pass/fail self-test per minion exposed via
 *   POST /api/admin/minions/:id/self-test
 * but each click was fire-and-forget. If a minion (e.g. Aldo's pdftotext
 * path) starts flaking intermittently, admins had no way to see the trend —
 * they only ever saw the most recent click.
 *
 * `minion_self_test_runs` is an append-only short history: ONE row per
 * self-test invocation, never overwritten. We trim to the last
 * `MINION_SELF_TEST_HISTORY_KEEP` rows per `minionId` from inside the same
 * write so the table stays bounded (≈30 rows × ~5 minions ≪ 1k rows total).
 * The Minions roster row reads the most recent
 * `MINION_SELF_TEST_HISTORY_STRIP` rows per minion to render a compact
 * pass/fail dot strip alongside the last-run timestamp.
 */
import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

/** Hard cap on rows kept per minion — older rows get trimmed. */
export const MINION_SELF_TEST_HISTORY_KEEP = 30;
/** How many of those rows the roster strip displays. */
export const MINION_SELF_TEST_HISTORY_STRIP = 10;

export const MINION_SELF_TEST_STATUSES = ["pass", "fail", "skipped"] as const;
export type MinionSelfTestStatus = (typeof MINION_SELF_TEST_STATUSES)[number];

export const minionSelfTestRuns = pgTable(
  "minion_self_test_runs",
  {
    id: serial("id").primaryKey(),
    minionId: text("minion_id").notNull(),
    status: text("status").notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    message: text("message"),
    ranAt: timestamp("ran_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Roster reads the latest N per minion — keep that lookup cheap.
    minionRanAtIdx: index("minion_self_test_runs_minion_ran_at_idx").on(
      table.minionId,
      table.ranAt,
    ),
  }),
);

export type MinionSelfTestRunRow = typeof minionSelfTestRuns.$inferSelect;
export type NewMinionSelfTestRun = typeof minionSelfTestRuns.$inferInsert;
