/**
 * Admin bracket-mix routes — Phase B U6
 *
 * Two POST endpoints under /api/admin/icp:
 *
 *   POST /api/admin/icp/peers/:id/refresh
 *     → re-run Tiago for one peer; persists a `bracket_mix_runs` row +
 *       updates peer.last_research_run_id.
 *
 *   POST /api/admin/icp/bracket-mix/global/regenerate
 *     → fire the Phase B + legacy dual-run recompute orchestrator (U5);
 *       writes runs, diff log, and (if flag is on + no override) updates
 *       every globalAssumptions.bracket_mix.
 *
 * Plan: docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md
 */
import type { Express } from "express";
import { z } from "zod";

import { logAndSendError, logActivity } from "../helpers";
import { requireAdmin } from "../../auth";
import { csrfTokenGuard } from "../../middleware/csrf";
import { runForPeer } from "../../ai/ambient/specialists/tiago";
import { recomputeGlobalDefault } from "../../services/bracketMix/recomputeGlobalDefault";
import { db } from "../../db";
import { icpPeerCompanies } from "@workspace/db";
import { asc } from "drizzle-orm";
import {
  HTTP_404_NOT_FOUND,
  HTTP_422_UNPROCESSABLE_ENTITY,
  HTTP_500_INTERNAL_SERVER_ERROR,
} from "../../constants";

const refreshPeerParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export function registerAdminBracketMixRoutes(app: Express): void {
  // GET /api/admin/icp/peers — list all peers with their Specialist columns
  app.get("/api/admin/icp/peers", requireAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select({
          id: icpPeerCompanies.id,
          name: icpPeerCompanies.name,
          nicheTags: icpPeerCompanies.nicheTags,
          isActive: icpPeerCompanies.isActive,
          sourceUrl: icpPeerCompanies.sourceUrl,
          lastResearchedAt: icpPeerCompanies.lastResearchedAt,
          rosterSizeEstimate: icpPeerCompanies.rosterSizeEstimate,
          brandArchetypeSplit: icpPeerCompanies.brandArchetypeSplit,
          splitEvidence: icpPeerCompanies.splitEvidence,
          lastResearchRunId: icpPeerCompanies.lastResearchRunId,
          costantinoConfig: icpPeerCompanies.costantinoConfig,
        })
        .from(icpPeerCompanies)
        .orderBy(asc(icpPeerCompanies.name));
      res.json({ peers: rows });
    } catch (err) {
      logAndSendError(res, "Failed to list ICP peer companies", err);
    }
  });

  // POST /api/admin/icp/peers/:id/refresh — per-peer Analyst refresh (R16)
  app.post(
    "/api/admin/icp/peers/:id/refresh",
    requireAdmin,
    csrfTokenGuard,
    async (req, res) => {
      const parsed = refreshPeerParamsSchema.safeParse(req.params);
      if (!parsed.success) {
        return res
          .status(HTTP_422_UNPROCESSABLE_ENTITY)
          .json({ error: "Invalid peer id", details: parsed.error.flatten() });
      }
      const peerId = parsed.data.id;

      try {
        const result = await runForPeer(peerId);
        if (!result.ok) {
          // Tiago surfaces a structured failure (e.g. peer not found, Tavily
          // unavailable, LLM output malformed). Convert to a 4xx/5xx based
          // on the specific message; default 500 if ambiguous.
          const looksLikeNotFound = result.errors.some((e) => /not found/i.test(e));
          const status = looksLikeNotFound ? HTTP_404_NOT_FOUND : HTTP_500_INTERNAL_SERVER_ERROR;
          return res.status(status).json({ error: result.errors.join("; ") });
        }
        logActivity(req, "admin-icp-peer-refresh", "icp_peer_companies", peerId, null, {
          runId: result.runId,
        });
        res.json({
          success: true,
          peerId,
          runId: result.runId,
          rosterSizeEstimate: result.output.rosterSizeEstimate,
          model: result.output.model,
        });
      } catch (err) {
        logAndSendError(res, "Failed to refresh peer bracket-mix", err);
      }
    },
  );

  // POST /api/admin/icp/bracket-mix/global/regenerate — global default recompute
  app.post(
    "/api/admin/icp/bracket-mix/global/regenerate",
    requireAdmin,
    csrfTokenGuard,
    async (req, res) => {
      try {
        const summary = await recomputeGlobalDefault();
        logActivity(req, "admin-icp-bracket-mix-global-regenerate", "global_assumptions", undefined, null, {
          phaseBRunId: summary.phaseBRunId,
          diffRowId: summary.diffRowId,
          phaseBProvisional: summary.phaseBProvisional,
          phaseBFlagEnabled: summary.phaseBFlagEnabled,
          updatedRows: summary.globalAssumptionsUpdated,
          skippedOverrides: summary.skippedOverrides,
        });
        res.json({
          success: true,
          phaseBRunId: summary.phaseBRunId,
          diffRowId: summary.diffRowId,
          phaseBProvisional: summary.phaseBProvisional,
          phaseBFlagEnabled: summary.phaseBFlagEnabled,
          globalAssumptionsUpdated: summary.globalAssumptionsUpdated,
          skippedOverrides: summary.skippedOverrides,
        });
      } catch (err) {
        logAndSendError(res, "Failed to regenerate global bracket-mix", err);
      }
    },
  );
}
