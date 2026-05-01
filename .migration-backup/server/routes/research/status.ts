import type { Express } from "express";
import { storage } from "../../storage";
import { requireAuth, getAuthUser } from "../../auth";
import { logAndSendError } from "../helpers";
import type { ResearchConfig } from "@shared/schema";
import {
  DEFAULT_RESEARCH_REFRESH_INTERVAL_DAYS,
  isAdminRole,
} from "../../../shared/constants";
import { detectStaleness } from "../../ai/staleness-detector";

export function registerResearchStatusRoutes(app: Express) {
  app.get("/api/research/status", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const allResearch = await storage.getAllMarketResearch(user.id);
      const allProperties = isAdminRole(user.role)
        ? await storage.getAllProperties()
        : await storage.getAllProperties(user.id);

      const ga = await storage.getGlobalAssumptions(getAuthUser(req).id);
      const researchConfig = (ga?.researchConfig as ResearchConfig) ?? {};

      const getStatus = (
        updatedAt: Date | null | undefined,
        type: "property" | "company" | "global",
      ): "fresh" | "stale" | "missing" => {
        if (!updatedAt) return "missing";
        const intervalDays =
          researchConfig[type]?.refreshIntervalDays ??
          DEFAULT_RESEARCH_REFRESH_INTERVAL_DAYS;
        const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
        return Date.now() - new Date(updatedAt).getTime() < intervalMs
          ? "fresh"
          : "stale";
      };

      const propertyResearchMap = new Map<
        number,
        { updatedAt: Date | null; llmModel: string | null }
      >();
      for (const r of allResearch) {
        if (r.type === "property" && r.propertyId) {
          const existing = propertyResearchMap.get(r.propertyId);
          if (
            !existing ||
            (r.updatedAt &&
              (!existing.updatedAt || r.updatedAt > existing.updatedAt))
          ) {
            propertyResearchMap.set(r.propertyId, {
              updatedAt: r.updatedAt,
              llmModel: r.llmModel,
            });
          }
        }
      }

      const propertyStatuses = allProperties.map((p) => {
        const r = propertyResearchMap.get(p.id);
        return {
          propertyId: p.id,
          name: p.name,
          location: p.location,
          imageUrl: p.imageUrl,
          status: getStatus(r?.updatedAt, "property"),
          updatedAt: r?.updatedAt?.toISOString() || null,
          llmModel: r?.llmModel || null,
        };
      });

      const companyResearch = allResearch.find((r) => r.type === "company");
      const globalResearch = allResearch.find((r) => r.type === "global");

      res.json({
        properties: propertyStatuses,
        company: {
          status: getStatus(companyResearch?.updatedAt, "company"),
          updatedAt: companyResearch?.updatedAt?.toISOString() || null,
        },
        global: {
          status: getStatus(globalResearch?.updatedAt, "global"),
          updatedAt: globalResearch?.updatedAt?.toISOString() || null,
        },
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch research status", error);
    }
  });

  app.get("/api/research/staleness", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const rawDays = req.query.thresholdDays
        ? Number(req.query.thresholdDays)
        : undefined;
      const thresholdDays =
        rawDays && Number.isFinite(rawDays) && rawDays > 0
          ? Math.min(rawDays, 365)
          : undefined;
      const report = await detectStaleness(user.id, thresholdDays);
      res.json(report);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to compute staleness report", error);
    }
  });
}
