import type { Express } from "express";
import { storage } from "../../storage";
import {
  requireAuth,
  getAuthUser,
  checkPropertyAccess,
  isApiRateLimited,
} from "../../auth";
import { logActivity, logAndSendError } from "../helpers";
import {
  conductWebResearch,
  isWebResearchAvailable,
  type WebResearchRequest,
} from "../../ai/web-research";
import { HTTP_503_SERVICE_UNAVAILABLE } from "../../constants";

export function registerResearchWebSearchRoutes(app: Express) {
  // ────────────────────────────────────────────────────────────
  // STANDALONE WEB RESEARCH — quick targeted lookups via
  // Perplexity + Tavily without running the full LLM pipeline
  // ────────────────────────────────────────────────────────────
  app.post("/api/research/web-search", requireAuth, async (req, res) => {
    try {
      const { propertyId, researchType, focusField } = req.body ?? {};

      if (!propertyId || !researchType) {
        return res
          .status(400)
          .json({ error: "propertyId and researchType are required", code: "RWBS-002" });
      }

      const validTypes = [
        "market_adr",
        "market_occupancy",
        "cap_rates",
        "operating_costs",
        "comparable_properties",
        "regulatory",
        "market_trends",
      ];
      if (!validTypes.includes(researchType)) {
        return res.status(400).json({
          error: `Invalid researchType. Must be one of: ${validTypes.join(", ")}`,
        code: "RWBS-005" });
      }

      if (!(await checkPropertyAccess(getAuthUser(req), Number(propertyId)))) {
        return res.status(403).json({ error: "Access denied", code: "RWBS-003" });
      }

      // Rate limit: 10 req/min/user
      if (isApiRateLimited(getAuthUser(req).id, "web-search", 10)) {
        return res.status(429).json({
          error: "Rate limit exceeded (10 requests per minute). Please wait.",
        code: "RWBS-006" });
      }

      if (!isWebResearchAvailable()) {
        return res.status(HTTP_503_SERVICE_UNAVAILABLE).json({
          error:
            "No web research providers configured (set PERPLEXITY_API_KEY or TAVILY_API_KEY)",
        code: "RWBS-007" });
      }

      const property = await storage.getProperty(Number(propertyId));
      if (!property) {
        return res.status(404).json({ error: "Property not found", code: "RWBS-004" });
      }

      const webRequest: WebResearchRequest = {
        propertyContext: {
          name: property.name || "Property",
          location: property.location || "",
          qualityTier: property.qualityTier ?? undefined,
          roomCount: property.roomCount ?? undefined,
          businessModel: property.businessModel ?? undefined,
        },
        researchType,
        country: property.country ?? undefined,
        focusField: focusField ?? undefined,
      };

      const results = await conductWebResearch(webRequest);

      logActivity(
        req,
        "web-search",
        "market_research",
        Number(propertyId),
        property.name,
        {
          researchType,
          focusField: focusField ?? null,
          sources: results.map((r) => r.source),
        },
      );

      res.json(
        results.map((wr) => ({
          source: wr.source,
          query: wr.query,
          summary: wr.summary,
          citations: wr.citations,
          retrievedAt: wr.retrievedAt.toISOString(),
          tokenCost: wr.tokenCost ?? null,
        })),
      );
    } catch (error: unknown) {
      logAndSendError(res, "Web research failed", error, "RWBS-001");
    }
  });
}
