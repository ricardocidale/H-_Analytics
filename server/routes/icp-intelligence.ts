/**
 * icp-intelligence.ts — API routes for ICP auto-generation.
 *
 * POST /api/icp/generate         — Full ICP generation (portfolio + AI)
 * POST /api/icp/generate-quick   — Portfolio-only (no AI, instant)
 * GET  /api/icp/portfolio-analysis — Returns raw portfolio analysis
 */

import type { Express } from "express";
import { requireAuth, getAuthUser } from "../auth";
import { storage } from "../storage";
import {
  analyzePortfolio,
  generateIcp,
  buildFullIcpNarrative,
} from "../ai/icp-intelligence";
import { logger } from "../logger";
import { getAnthropicClient } from "../ai/clients";

export function register(app: Express) {

  /**
   * GET /api/icp/portfolio-analysis
   * Returns the deterministic portfolio analysis (no AI, instant).
   */
  app.get("/api/icp/portfolio-analysis", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const properties = user.role === "admin"
        ? await storage.getAllProperties()
        : await storage.getAllProperties(user.id);
      const analysis = analyzePortfolio(properties);
      res.json(analysis);
    } catch (error: unknown) {
      logger.error(`ICP portfolio analysis failed: ${error instanceof Error ? error.message : error}`, "icp");
      res.status(500).json({ error: "Failed to analyze portfolio" });
    }
  });

  /**
   * POST /api/icp/generate-quick
   * Instant ICP generation from portfolio only (no AI call, no cost).
   * Saves result to global_assumptions.icpConfig.
   */
  app.post("/api/icp/generate-quick", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const properties = user.role === "admin"
        ? await storage.getAllProperties()
        : await storage.getAllProperties(user.id);
      const ga = await storage.getGlobalAssumptions(user.id);

      if (properties.length === 0) {
        return res.status(400).json({
          error: "No properties in portfolio. Add at least one property before generating the ICP.",
        });
      }

      const result = await generateIcp(properties, ga ?? null);

      // Save to global_assumptions.icpConfig
      const existingIcpConfig = ga?.icpConfig ?? {};
      const updatedIcpConfig = {
        ...existingIcpConfig,
        ...result.config,
        _generated: true,
        _generatedAt: result.generatedAt,
        _source: result.source,
        _portfolioAnalysis: result.portfolioAnalysis,
      };

      // Save descriptive to icpDescriptive (JSONB field managed via patch)
      const gaRecord = ga as Record<string, unknown> | null;
      const existingDescriptive = (gaRecord?.icpDescriptive as Record<string, unknown>) ?? {};
      const updatedDescriptive = {
        ...existingDescriptive,
        ...result.descriptive,
      };

      if (ga) {
        await storage.patchGlobalAssumptions(ga.id, {
          icpConfig: updatedIcpConfig,
          icpDescriptive: updatedDescriptive,
        });
      }

      logger.info(`ICP quick-generated for user ${user.id}: ${result.fieldsFromPortfolio} from portfolio, ${result.fieldsFromDefaults} from defaults`, "icp");

      res.json({
        ...result,
        saved: true,
      });
    } catch (error: unknown) {
      logger.error(`ICP quick generation failed: ${error instanceof Error ? error.message : error}`, "icp");
      res.status(500).json({ error: "Failed to generate ICP" });
    }
  });

  /**
   * POST /api/icp/generate
   * Full ICP generation with AI enhancement (portfolio analysis + LLM for qualitative sections).
   * This is the "smart" generation that writes investor-ready prose.
   */
  app.post("/api/icp/generate", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const properties = user.role === "admin"
        ? await storage.getAllProperties()
        : await storage.getAllProperties(user.id);
      const ga = await storage.getGlobalAssumptions(user.id);

      if (properties.length === 0) {
        return res.status(400).json({
          error: "No properties in portfolio. Add at least one property before generating the ICP.",
        });
      }

      // LLM callback using the configured Anthropic client
      const llmCallback = async (prompt: string): Promise<string> => {
        const anthropic = getAnthropicClient();
        if (!anthropic) throw new Error("Anthropic client not available");
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        });
        const textBlock = response.content.find((b) => b.type === "text");
        return textBlock && "text" in textBlock ? textBlock.text : "";
      };

      const result = await generateIcp(properties, ga ?? null, { llmCallback });

      // Save to global_assumptions
      const existingIcpConfig = ga?.icpConfig ?? {};
      const updatedIcpConfig: Record<string, unknown> = {
        ...existingIcpConfig,
        ...result.config,
        _generated: true,
        _generatedAt: result.generatedAt,
        _source: result.source,
        _portfolioAnalysis: result.portfolioAnalysis,
      };

      // If AI generated an essay, save it as _definition
      const descriptiveRecord = result.descriptive as unknown as Record<string, unknown>;
      const aiEssay = descriptiveRecord._icpEssay as string | undefined;
      if (aiEssay) {
        updatedIcpConfig._definition = aiEssay;
      }

      const gaRecord2 = ga as Record<string, unknown> | null;
      const existingDescriptive = (gaRecord2?.icpDescriptive as Record<string, unknown>) ?? {};
      const updatedDescriptive: Record<string, unknown> = {
        ...existingDescriptive,
        ...result.descriptive,
      };
      // Clean internal field
      delete updatedDescriptive._icpEssay;

      if (ga) {
        await storage.patchGlobalAssumptions(ga.id, {
          icpConfig: updatedIcpConfig,
          icpDescriptive: updatedDescriptive,
        });
      }

      logger.info(`ICP AI-generated for user ${user.id}: ${result.fieldsFromPortfolio} from portfolio, ${result.fieldsFromAi} from AI`, "icp");

      res.json({
        ...result,
        saved: true,
        icpEssay: aiEssay || null,
      });
    } catch (error: unknown) {
      logger.error(`ICP generation failed: ${error instanceof Error ? error.message : error}`, "icp");
      res.status(500).json({ error: "Failed to generate ICP" });
    }
  });

  /**
   * GET /api/icp/narrative
   * Returns the full ICP narrative formatted for research prompt injection.
   */
  app.get("/api/icp/narrative", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const ga = await storage.getGlobalAssumptions(user.id);
      if (!ga) return res.status(404).json({ error: "No global assumptions found" });

      const icpConfig = ga.icpConfig ?? {};
      const gaRecord3 = ga as Record<string, unknown>;
      const icpDescriptive = (gaRecord3.icpDescriptive as Record<string, unknown>) ?? {};
      const companyName = ga.companyName || "Management Company";

      const narrative = buildFullIcpNarrative(icpConfig, icpDescriptive, companyName);
      res.json({ narrative, generatedAt: icpConfig._generatedAt || null });
    } catch (error: unknown) {
      logger.error(`ICP narrative failed: ${error instanceof Error ? error.message : error}`, "icp");
      res.status(500).json({ error: "Failed to build ICP narrative" });
    }
  });
}
