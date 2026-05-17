/**
 * intelligence-entities.ts — class-aware probe route for orchestrators and agents.
 *
 * Plan: docs/plans/2026-05-17-005-agent-taxonomy-registry.md (Phase 2)
 *
 *   POST /api/admin/intelligence/:entityCode/probe
 *
 * This route handles probe requests for non-specialist entity classes:
 *   • Orchestrators (orch.gustavo) — in-process availability check
 *   • Agents (agent.rebecca, agent.iris) — registration confirmation
 *
 * Specialists use their dedicated /api/admin/specialists/:id/probe endpoint.
 * Minions use /api/admin/minions/:id/self-test.
 *
 * All responses carry the entity's class in the body so callers never need
 * to infer it from the route path or an ID string.
 */

import type { Express } from "express";
import { z } from "zod";
import { requireAdmin } from "../../auth";
import { logAndSendError } from "../helpers";
import { ENTITY_CODE_MAP } from "./intelligence-entity-codes";

const entityCodeParamSchema = z.object({
  entityCode: z.string().min(1),
});

export function registerIntelligenceEntityRoutes(app: Express): void {
  app.post(
    "/api/admin/intelligence/:entityCode/probe",
    requireAdmin,
    async (req, res) => {
      try {
        const parsed = entityCodeParamSchema.safeParse(req.params);
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid entity code" });
        }
        const { entityCode } = parsed.data;

        const entity = ENTITY_CODE_MAP.get(entityCode);
        if (!entity) {
          return res.status(404).json({
            error: `Intelligence entity not found: ${entityCode}`,
            hint: "Specialists use /api/admin/specialists/:id/probe. Minions use /api/admin/minions/:id/self-test.",
          });
        }

        const ranAt = new Date().toISOString();

        if (entity.class === "orchestrator") {
          return res.json({
            entityCode,
            class: "orchestrator",
            humanName: entity.humanName,
            ranAt,
            status: "pass",
            steps: [
              {
                name: "Orchestrator availability",
                description: `${entity.humanName} (Analyst Orchestrator) is an in-process router.`,
                status: "pass",
                message: "Orchestrator is reachable.",
              },
            ],
          });
        }

        if (entity.class === "agent") {
          return res.json({
            entityCode,
            class: "agent",
            humanName: entity.humanName,
            ranAt,
            status: "pass",
            steps: [
              {
                name: "Agent registration",
                description: `${entity.humanName} is registered in the system.`,
                status: "pass",
                message: "Agent entry confirmed. Live endpoint probes run client-side.",
              },
            ],
          });
        }

        return res.status(400).json({ error: `Unhandled entity class for probe: ${entity.class}` });
      } catch (error: unknown) {
        logAndSendError(res, "Failed to probe intelligence entity", error, "IENT-001");
      }
    },
  );
}
