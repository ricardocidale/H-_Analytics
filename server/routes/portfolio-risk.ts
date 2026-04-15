/**
 * server/routes/portfolio-risk.ts — Portfolio Risk Score API
 *
 * GET /api/portfolio/risk-score       — risk score for the authenticated user's portfolio
 * GET /api/scenarios/:id/risk-score   — risk score for properties in a specific scenario
 *
 * Works with live DB data — no engine run required.
 */

import type { Express, Request, Response } from "express";
import { requireAuth, getAuthUser } from "../auth";
import { storage } from "../storage";
import { computePortfolioRiskScore } from "../ai/portfolio-risk-scorer";
import { checkScenarioAccess } from "./scenario-helpers";
import { logger } from "../logger";
import { logActivity, parseRouteId } from "./helpers";
import { isAdminRole } from "@shared/constants";

export function register(app: Express): void {
  // ── Portfolio-wide risk score ──────────────────────────────────────────────
  app.get("/api/portfolio/risk-score", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const allProperties = isAdminRole(user.role)
        ? await storage.getAllProperties()
        : await storage.getAllProperties(user.id);

      const active = allProperties.filter((p: any) => p.isActive !== false);

      if (active.length === 0) {
        return res.status(422).json({ error: "No active properties in portfolio." });
      }

      const report = computePortfolioRiskScore(active);
      logActivity(req, "generate-portfolio-risk", "portfolio", null, `${active.length} properties`, { propertyCount: active.length, overallScore: (report as any).overallScore });
      return res.json(report);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Portfolio risk score computation failed";
      logger.error(`Portfolio risk score error: ${message}`, "portfolio-risk");
      return res.status(500).json({
        error: process.env.NODE_ENV === "production"
          ? "Portfolio risk score computation failed"
          : message,
      });
    }
  });

  // ── Scenario-specific risk score ───────────────────────────────────────────
  app.get("/api/scenarios/:id/risk-score", requireAuth, async (req: Request, res: Response) => {
    try {
      const scenarioId = parseRouteId(req.params.id);
      if (!scenarioId) {
        return res.status(400).json({ error: "Invalid scenario ID." });
      }

      const user = getAuthUser(req);

      // Fetch scenario to verify it exists and the user has access
      const scenario = await storage.getScenario(scenarioId);
      if (!scenario) {
        return res.status(404).json({ error: "Scenario not found." });
      }

      // Check access: admin sees all, otherwise scenario must belong to user or be shared
      if (!isAdminRole(user.role) && scenario.userId !== user.id) {
        const hasAccess = await checkScenarioAccess(scenarioId, user.id, scenario);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied to this scenario." });
        }
      }

      // Load properties associated with the user who owns the scenario
      const scenarioUserId = scenario.userId;
      const allProperties = scenarioUserId
        ? await storage.getAllProperties(scenarioUserId)
        : await storage.getAllProperties();

      const active = allProperties.filter((p: any) => p.isActive !== false);

      if (active.length === 0) {
        return res.status(422).json({ error: "No active properties found for this scenario." });
      }

      const report = computePortfolioRiskScore(active);
      logActivity(req, "generate-scenario-risk", "scenario", scenarioId, scenario.name, { propertyCount: active.length });
      return res.json({ scenarioId, ...report });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Scenario risk score computation failed";
      logger.error(`Scenario risk score error: ${message}`, "portfolio-risk");
      return res.status(500).json({
        error: process.env.NODE_ENV === "production"
          ? "Scenario risk score computation failed"
          : message,
      });
    }
  });
}
