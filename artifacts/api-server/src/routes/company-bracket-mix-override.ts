/**
 * Company bracket-mix override routes — Phase B U6 (R7, R8, R9)
 *
 *   POST   /api/companies/:id/bracket-mix/override
 *     → run Tiago against the supplied comp set (or the existing one
 *       stored on the company) and install the result as an override.
 *       Body: { compSetSlugs?: string[] }. If omitted, derive from
 *       the row's comp set storage. Returns the override run id.
 *
 *   DELETE /api/companies/:id/bracket-mix/override
 *     → clear the override and re-mirror the latest global_default mix
 *       back onto globalAssumptions.bracket_mix.
 *
 * Plan: docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md
 */
import type { Express } from "express";
import { z } from "zod";

import { logAndSendError, logActivity } from "./helpers";
import { requireAuth } from "../auth";
import { csrfTokenGuard } from "../middleware/csrf";
import { runForCompanyOverride } from "../ai/ambient/specialists/tiago";
import {
  writeEffectiveBracketMix,
  clearBracketMixOverride,
} from "../services/bracketMix/effective";
import {
  HTTP_400_BAD_REQUEST,
  HTTP_404_NOT_FOUND,
  HTTP_422_UNPROCESSABLE_ENTITY,
  HTTP_500_INTERNAL_SERVER_ERROR,
} from "../constants";

const companyIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const overrideSetBodySchema = z.object({
  compSetSlugs: z.array(z.string().min(1)).optional(),
});

export function registerCompanyBracketMixOverrideRoutes(app: Express): void {
  // POST /api/companies/:id/bracket-mix/override
  app.post(
    "/api/companies/:id/bracket-mix/override",
    requireAuth,
    csrfTokenGuard,
    async (req, res) => {
      const params = companyIdParamsSchema.safeParse(req.params);
      if (!params.success) {
        return res
          .status(HTTP_422_UNPROCESSABLE_ENTITY)
          .json({ error: "Invalid company id", details: params.error.flatten() });
      }
      const body = overrideSetBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        return res
          .status(HTTP_422_UNPROCESSABLE_ENTITY)
          .json({ error: "Invalid request body", details: body.error.flatten() });
      }

      const companyId = params.data.id;
      const compSetSlugs = body.data.compSetSlugs ?? [];

      try {
        if (compSetSlugs.length === 0) {
          // The per-company comp set storage is split across icpConfig and
          // bracket assignments. Forcing an explicit slug list keeps this
          // endpoint deterministic until that storage lands behind a single
          // shape in Phase C teardown.
          return res
            .status(HTTP_400_BAD_REQUEST)
            .json({ error: "compSetSlugs is required for company override" });
        }

        const tiagoResult = await runForCompanyOverride(companyId, compSetSlugs);
        if (!tiagoResult.ok) {
          return res
            .status(HTTP_500_INTERNAL_SERVER_ERROR)
            .json({ error: tiagoResult.errors.join("; ") });
        }

        // Install as an override (R7, R9): mirror mix to
        // globalAssumptions.bracket_mix AND set
        // bracket_mix_override_run_id. writeEffectiveBracketMix is the
        // single chokepoint that all bracket_mix writers route through.
        await writeEffectiveBracketMix({
          companyId,
          mix: tiagoResult.output.mix,
          kind: "override-set",
          overrideRunId: tiagoResult.runId,
          evidenceLabel: `Tiago company-override [${compSetSlugs.join(", ")}]`,
        });

        logActivity(req, "company-bracket-mix-override-set", "global_assumptions", companyId, null, {
          runId: tiagoResult.runId,
          compSetSlugs,
        });

        res.json({
          success: true,
          companyId,
          runId: tiagoResult.runId,
          source: "override",
        });
      } catch (err) {
        logAndSendError(res, "Failed to set bracket-mix override", err);
      }
    },
  );

  // DELETE /api/companies/:id/bracket-mix/override
  app.delete(
    "/api/companies/:id/bracket-mix/override",
    requireAuth,
    csrfTokenGuard,
    async (req, res) => {
      const params = companyIdParamsSchema.safeParse(req.params);
      if (!params.success) {
        return res
          .status(HTTP_422_UNPROCESSABLE_ENTITY)
          .json({ error: "Invalid company id", details: params.error.flatten() });
      }
      const companyId = params.data.id;

      try {
        const result = await clearBracketMixOverride(companyId);
        if (!result.wasActive) {
          // Idempotent — clearing a non-overridden row is not an error.
          return res.json({
            success: true,
            companyId,
            cleared: false,
            note: "No override was active",
          });
        }
        logActivity(req, "company-bracket-mix-override-clear", "global_assumptions", companyId, null, {
          mirroredFromRunId: result.mirroredFromRunId,
        });
        res.json({
          success: true,
          companyId,
          cleared: true,
          mirroredFromRunId: result.mirroredFromRunId,
        });
      } catch (err: unknown) {
        if (err instanceof Error && /not found/i.test(err.message)) {
          return res.status(HTTP_404_NOT_FOUND).json({ error: err.message });
        }
        logAndSendError(res, "Failed to clear bracket-mix override", err);
      }
    },
  );
}
