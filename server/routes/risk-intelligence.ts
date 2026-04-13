import { Router } from "express";
import { requireAuth, isApiRateLimited, getAuthUser } from "../auth";
import {
  generatePortfolioRiskBrief,
  generatePropertyRiskBrief,
} from "../ai/risk-intelligence";
import { fetchMacroRates } from "../ai/ambient/fetchers";
import { storage } from "../storage";
import { logger } from "../logger";
import type { Property } from "@shared/schema";

export const riskIntelligenceRoutes = Router();

riskIntelligenceRoutes.get(
  "/api/risk/portfolio-brief",
  requireAuth,
  async (req, res) => {
    const userId = getAuthUser(req).id;
    if (isApiRateLimited(userId, "risk-portfolio", 5)) {
      return res.status(429).json({ error: "Rate limited — 5 requests per minute" });
    }

    try {
      const includeLLM = req.query.includeLLM === "true";
      const userProperties: Property[] = await storage.getAllProperties(userId);

      if (userProperties.length === 0) {
        return res.json({
          overallNarrative: "No properties in portfolio.",
          propertyBriefs: [],
          macroContext: null,
          topRisks: [],
          topStrengths: [],
        });
      }

      const brief = await generatePortfolioRiskBrief(
        userProperties,
        { includeLLM },
      );
      res.json(brief);
    } catch (error: unknown) {
      logger.error(`Portfolio risk brief failed: ${error}`, "risk-intelligence");
      res.status(500).json({ error: "Failed to generate risk brief" });
    }
  },
);

riskIntelligenceRoutes.get(
  "/api/risk/property/:propertyId/brief",
  requireAuth,
  async (req, res) => {
    const userId = getAuthUser(req).id;
    if (isApiRateLimited(userId, "risk-property", 10)) {
      return res.status(429).json({ error: "Rate limited — 10 requests per minute" });
    }

    try {
      const propertyId = parseInt(String(req.params.propertyId), 10);
      if (isNaN(propertyId)) {
        return res.status(400).json({ error: "Invalid property ID" });
      }

      const property = await storage.getProperty(propertyId);

      if (!property || property.userId !== userId) {
        return res.status(404).json({ error: "Property not found" });
      }

      const allUserProperties: Property[] = await storage.getAllProperties(userId);

      const includeLLM = req.query.includeLLM === "true";
      const brief = await generatePropertyRiskBrief(
        property,
        allUserProperties,
        { includeLLM },
      );
      res.json(brief);
    } catch (error: unknown) {
      logger.error(`Property risk brief failed: ${error}`, "risk-intelligence");
      res.status(500).json({ error: "Failed to generate risk brief" });
    }
  },
);

riskIntelligenceRoutes.get(
  "/api/risk/macro-context",
  requireAuth,
  async (_req, res) => {
    try {
      const result = await fetchMacroRates();
      const snapshots = result.snapshots;

      const find = (label: string) =>
        snapshots.find((s) => s.snapshotKey?.toLowerCase().includes(label));

      const fedRate = find("fed funds");
      const mortgageRate = find("mortgage");
      const cpi = find("cpi");

      const narrative = [
        fedRate ? `Fed funds rate at ${fedRate.value}%` : null,
        mortgageRate ? `30-year mortgage at ${mortgageRate.value}%` : null,
        cpi ? `CPI at ${cpi.value}%` : null,
      ]
        .filter(Boolean)
        .join(". ");

      res.json({
        fedFundsRate: fedRate?.value?.toString() ?? "N/A",
        mortgageRate: mortgageRate?.value?.toString() ?? "N/A",
        inflationRate: cpi?.value?.toString() ?? "N/A",
        narrative: narrative || "Macro data unavailable",
        snapshotCount: snapshots.length,
        errors: result.errors,
      });
    } catch (error: unknown) {
      logger.error(`Macro context failed: ${error}`, "risk-intelligence");
      res.status(500).json({ error: "Failed to fetch macro context" });
    }
  },
);
