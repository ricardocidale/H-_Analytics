/**
 * Admin Minion Self-Test routes (Task #1392, extended in Task #1396).
 *
 *   POST /api/admin/minions/:id/self-test
 *
 * Runs the in-process self-test for a single minion (see
 * `slides/minions/self-tests.ts`) and returns a structured pass/fail result.
 * The roster page hits this endpoint when an admin clicks the Analyst
 * button on a minion row.
 *
 * Self-tests are deterministic, side-effect-free, and fast (under a few
 * seconds in the worst case). They never write to the DB or to R2 and do
 * not call out to LLMs or external HTTP — safe to run on demand.
 *
 *   GET /api/admin/minions/self-test-history
 *
 * Returns the last MINION_SELF_TEST_HISTORY_STRIP rows per minion so the
 * roster can render a compact pass/fail dot strip alongside the last-run
 * timestamp (Task #1396). Each POST result above is persisted via
 * `recordMinionSelfTestRun` so this endpoint reads from a real append-only
 * table — admins can spot intermittent failures over time, not just the
 * most recent click.
 */

import type { Express } from "express";
import { requireAdmin } from "../../auth";
import { logAndSendError } from "../helpers";
import { runMinionSelfTest, MINION_SELF_TESTS } from "../../slides/minions/self-tests";
import { storage } from "../../storage";
import { MINION_SELF_TEST_HISTORY_STRIP } from "@workspace/db";

export function registerMinionSelfTestRoutes(app: Express) {
  app.post("/api/admin/minions/:id/self-test", requireAdmin, async (req, res) => {
    const id = String(req.params.id ?? "").toLowerCase();
    try {
      // `runMinionSelfTest` returns a structured `{ status: "fail", ... }`
      // for unknown ids too, so we always reply 200 with the verdict body.
      // HTTP status is reserved for transport / unexpected errors so the UI
      // can distinguish "test ran and reported fail" from "request blew up".
      const result = await runMinionSelfTest(id);

      // Persist the verdict for trend visibility (Task #1396). Skip the
      // write for unknown minion ids — we don't want to fill the table with
      // typo'd rows from probes against ids that don't exist in the catalog.
      if (MINION_SELF_TESTS[id]) {
        try {
          await storage.recordMinionSelfTestRun({
            minionId: id,
            status: result.status,
            durationMs: result.durationMs,
            message: result.message,
          });
        } catch (persistErr) {
          // Best-effort: a failing write must not change the verdict the
          // admin clicked the button to see. Log and move on.
          req.log?.warn(
            { err: persistErr, minionId: id },
            "Failed to persist minion self-test result",
          );
        }
      }

      res.json(result);
    } catch (error: unknown) {
      logAndSendError(res, `Minion self-test crashed for "${id}"`, error, "MSELFTEST-001");
    }
  });

  app.get("/api/admin/minions/self-test-history", requireAdmin, async (_req, res) => {
    try {
      const rows = await storage.listMinionSelfTestHistory({
        limitPerMinion: MINION_SELF_TEST_HISTORY_STRIP,
      });
      // Bucket by minionId for cheap O(1) reads on the client.
      const history: Record<
        string,
        Array<{
          id: number;
          status: string;
          durationMs: number;
          message: string | null;
          ranAt: string;
        }>
      > = {};
      for (const row of rows) {
        const list = history[row.minionId] ?? [];
        list.push({
          id: row.id,
          status: row.status,
          durationMs: row.durationMs,
          message: row.message,
          ranAt: row.ranAt instanceof Date ? row.ranAt.toISOString() : String(row.ranAt),
        });
        history[row.minionId] = list;
      }
      res.json({
        history,
        limitPerMinion: MINION_SELF_TEST_HISTORY_STRIP,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to read minion self-test history", error, "MSELFTEST-002");
    }
  });
}
