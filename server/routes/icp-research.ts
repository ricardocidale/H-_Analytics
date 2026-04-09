import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, isApiRateLimited , getAuthUser } from "../auth";
import { logActivity, logAndSendError, icpGenerateSchema, icpExportSchema } from "./helpers";
import { fromZodError } from "zod-validation-error";
import { getAnthropicClient, normalizeModelId } from "../ai/clients";
import { DEFAULT_RESEARCH_MODEL } from "../ai/resolve-llm";
import { logApiCost, estimateCost } from "../middleware/cost-logger";
import { logger } from "../logger";
import {
  type IcpResearchReport,
  type PromptBuilderConfig,
  buildIcpResearchPrompt,
  buildMarkdownFromReport,
  parseResearchResponse,
  buildReportFromParsed,
  buildFinancialSummary,
  exportReportPdf,
  exportReportDocx,
} from "./icp-research-helpers";

export function register(app: Express) {
  app.post("/api/research/icp/generate", requireAuth, async (req, res) => {
    try {
      if (isApiRateLimited(getAuthUser(req).id, "icp-research", 3)) {
        return res.status(429).json({ error: "Rate limit exceeded. Please wait a minute." });
      }

      const bodyValidation = icpGenerateSchema.safeParse(req.body);
      if (!bodyValidation.success) return res.status(400).json({ error: fromZodError(bodyValidation.error).message });

      const ga = await storage.getGlobalAssumptions(getAuthUser(req).id);
      if (!ga) return res.status(404).json({ error: "No global assumptions found" });

      const icpConfig = ga.icpConfig || {};
      const assetDescription = ga.assetDescription || "";
      const propertyLabel = ga.propertyLabel || "Hotel";
      const researchCfg = (ga.researchConfig as import("@shared/schema").ResearchConfig) ?? {};
      const model = normalizeModelId(researchCfg.companyLlm?.primaryLlm || researchCfg.preferredLlm || ga.preferredLlm || DEFAULT_RESEARCH_MODEL);
      const secondaryModel = researchCfg.companyLlm?.llmMode === "dual" && researchCfg.companyLlm.secondaryLlm ? normalizeModelId(researchCfg.companyLlm.secondaryLlm) : undefined;

      const promptBuilder = (bodyValidation.data.promptBuilder || icpConfig._promptBuilder || {}) as PromptBuilderConfig;

      const anthropic = getAnthropicClient();

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      res.write(`data: ${JSON.stringify({ type: "status", message: "Starting ICP market research..." })}\n\n`);

      let financialSummary: string | undefined;
      if (promptBuilder.context?.financialResults) {
        try {
          const companies = await storage.getAllCompanies();
          const mgmtCompany = companies.find((c: any) => c.type === "management");
          const icpUser = getAuthUser(req);
          const props = icpUser.role === "admin"
            ? await storage.getAllProperties()
            : await storage.getAllProperties(icpUser.id);
          const managedProps = mgmtCompany
            ? props.filter((p: any) => p.companyId === mgmtCompany.id)
            : props;

          financialSummary = buildFinancialSummary(ga, mgmtCompany, managedProps);
        } catch (err) {
          logger.warn(`Failed to gather financial context: ${err instanceof Error ? err.message : err}`, "icp-research");
          res.write(`data: ${JSON.stringify({ type: "status", message: "Warning: Could not load financial data — continuing without financial context." })}\n\n`);
        }
      }

      const prompt = buildIcpResearchPrompt(icpConfig, assetDescription, propertyLabel, promptBuilder, financialSummary, researchCfg.companySources);

      let fullContent = "";

      const startTime = Date.now();
      const stream = await anthropic.messages.stream({
        model,
        max_tokens: 12000,
        messages: [{ role: "user", content: prompt }],
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullContent += event.delta.text;
          res.write(`data: ${JSON.stringify({ type: "content", data: event.delta.text })}\n\n`);
        }
      }

      const parsed = parseResearchResponse(fullContent);
      if (parsed.rawResponse) {
        logger.warn("ICP research JSON parse failed, using raw response", "icp-research");
      }

      const report = buildReportFromParsed(parsed, model);
      const markdown = buildMarkdownFromReport(report, propertyLabel);

      const updatedIcpConfig = { ...icpConfig, _research: report, _researchMarkdown: markdown };
      await storage.patchGlobalAssumptions(ga.id, { icpConfig: updatedIcpConfig });
      logActivity(req, "generate", "icp_research", ga.id, "ICP Research Report");

      const inTok = Math.round(prompt.length / 4);
      const outTok = Math.round(fullContent.length / 4);
      try { logApiCost({ timestamp: new Date().toISOString(), service: "anthropic", model, operation: "icp-research", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("anthropic", model, inTok, outTok), durationMs: Date.now() - startTime, userId: req.user?.id, route: "/api/research/icp/generate" }); } catch (e) { logger.warn(`Failed to log API cost: ${(e as Error).message}`, "cost-logger"); }

      res.write(`data: ${JSON.stringify({ type: "done", report, markdown })}\n\n`);
      res.end();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`ICP research generation error: ${msg}`, "icp-research");
      res.write(`data: ${JSON.stringify({ type: "error", message: msg || "Generation failed" })}\n\n`);
      res.end();
    }
  });

  app.get("/api/research/icp", requireAuth, async (req, res) => {
    try {
      const ga = await storage.getGlobalAssumptions(getAuthUser(req).id);
      if (!ga) return res.status(404).json({ error: "No global assumptions found" });
      const icpConfig = ga.icpConfig || {};
      res.json(icpConfig._research || null);
    } catch (error) {
      logAndSendError(res, "Failed to fetch ICP research", error);
    }
  });

  app.post("/api/research/icp/export", requireAuth, async (req, res) => {
    try {
      const bodyValidation = icpExportSchema.safeParse(req.body);
      if (!bodyValidation.success) return res.status(400).json({ error: fromZodError(bodyValidation.error).message });
      const { format, orientation } = bodyValidation.data;

      const ga = await storage.getGlobalAssumptions(getAuthUser(req).id);
      if (!ga) return res.status(404).json({ error: "No global assumptions found" });

      const icpConfig = ga.icpConfig || {};
      const report = icpConfig._research as IcpResearchReport | undefined;
      if (!report) return res.status(404).json({ error: "No ICP research report found. Generate one first." });

      const propertyLabel = ga.propertyLabel || "Hotel";
      const isLandscape = orientation === "landscape";

      if (format === "pdf") {
        const buffer = await exportReportPdf(report, propertyLabel, isLandscape);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="icp-research-report.pdf"`);
        res.send(buffer);
      } else {
        const buffer = await exportReportDocx(report, propertyLabel, isLandscape);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="icp-research-report.docx"`);
        res.send(buffer);
      }
    } catch (error: unknown) {
      logger.error(`ICP research export error: ${error instanceof Error ? error.message : String(error)}`, "icp-research");
      logAndSendError(res, "Failed to export ICP research", error);
    }
  });
}
