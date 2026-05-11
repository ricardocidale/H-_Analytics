/**
 * Admin Minion Self-Test routes (Task #1392).
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
 */

import type { Express } from "express";
import { requireAdmin } from "../../auth";
import { logAndSendError } from "../helpers";
import { runMinionSelfTest, MINION_SELF_TESTS } from "../../slides/minions/self-tests";

export function registerMinionSelfTestRoutes(app: Express) {
  app.post("/api/admin/minions/:id/self-test", requireAdmin, async (req, res) => {
    const id = String(req.params.id ?? "").toLowerCase();
    try {
      // `runMinionSelfTest` returns a structured `{ status: "fail", ... }`
      // for unknown ids too, so we always reply 200 with the verdict body.
      // HTTP status is reserved for transport / unexpected errors so the UI
      // can distinguish "test ran and reported fail" from "request blew up".
      const result = await runMinionSelfTest(id);
      res.json(result);
    } catch (error: unknown) {
      logAndSendError(res, `Minion self-test crashed for "${id}"`, error, "MSELFTEST-001");
    }
  });
}
