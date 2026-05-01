import type { Express } from "express";
import { storage } from "../../storage";
import {
  requireAuth,
  isApiRateLimited,
  checkPropertyAccess,
  getAuthUser,
} from "../../auth";
import { researchGenerateSchema } from "../helpers";
import { fromZodError } from "zod-validation-error/v3";
import { generateResearchWithToolsStream } from "../../ai/aiResearch";
import {
  orchestrateResearch,
  isOrchestratorAvailable,
  type OrchestratorModelOverrides,
} from "../../ai/research-orchestrator";
import { logger } from "../../logger";
import { runPreflightGates } from "./generate-gates";
import { resolveLlmConfig } from "./generate-llm-config";
import { gatherIntelligence } from "./generate-intelligence";
import { assembleResearchV2Prompt } from "./generate-prompt";
import { persistResearchOutput } from "./generate-persist";

export function registerResearchGenerateRoutes(app: Express) {
  // ────────────────────────────────────────────────────────────
  // MARKET RESEARCH
  // AI-powered research generation using Claude/GPT/Gemini. Streams responses
  // via Server-Sent Events (SSE) and persists results to the database.
  // ────────────────────────────────────────────────────────────
  app.post("/api/research/generate", requireAuth, async (req, res) => {
    // Hoisted so the outer catch can finalize the early `research_runs` row
    // (releasing the per-Specialist concurrency slot) on dispatch failure.
    let earlyRunId: number | undefined;
    let earlyRunFinalized = false;
    let startTime = Date.now();
    try {
      const validation = researchGenerateSchema.safeParse(req.body);
      if (!validation.success) {
        return res
          .status(400)
          .json({ error: fromZodError(validation.error as any).message });
      }

      const {
        type,
        propertyId,
        propertyContext,
        assetDefinition,
        researchVariables,
        specialistId,
      } = validation.data;

      if (
        propertyId &&
        !(await checkPropertyAccess(getAuthUser(req), propertyId))
      ) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (isApiRateLimited(getAuthUser(req).id, "market-research", 5)) {
        return res
          .status(429)
          .json({ error: "Rate limit exceeded. Please wait a minute." });
      }

      const ga = await storage.getGlobalAssumptions(getAuthUser(req).id);

      // ── Minimum-info + locked-hard required-fields + Specialist budget gates ──
      const gateResult = await runPreflightGates({
        req,
        res,
        type,
        propertyId: propertyId || undefined,
        ga,
        specialistId,
      });
      if (!gateResult.ok) return;
      const companyProperties = gateResult.companyProperties;

      // Resolve admin-configured event config + LLM/vendor for this research type
      const { model, secondaryModel, vendorKey, researchClient, eventConfig } =
        resolveLlmConfig(ga, type);

      // If admin disabled this research type, block the request
      if (!eventConfig.enabled) {
        return res.status(403).json({
          error: `Research type "${type}" is disabled by admin configuration.`,
        });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const adWithGlobal = {
        ...assetDefinition,
        description:
          assetDefinition?.description || ga?.assetDescription || undefined,
      };

      const {
        marketIntelligence,
        webResearchResults,
        smartRouterInjection,
      } = await gatherIntelligence({
        type,
        propertyId: propertyId || undefined,
        propertyContext,
        assetDefinition,
      });

      const params: import("../../ai/research-prompt-builders").ResearchParams = {
        type,
        propertyId: propertyId || undefined,
        propertyContext:
          propertyContext as import("../../ai/research-prompt-builders").ResearchParams["propertyContext"],
        assetDefinition:
          adWithGlobal as import("../../ai/research-prompt-builders").ResearchParams["assetDefinition"],
        researchVariables,
        propertyLabel: ga?.propertyLabel,
        eventConfig,
        marketIntelligence,
      };

      startTime = Date.now();

      const { v2Prompt, propertyContextPack } = await assembleResearchV2Prompt({
        req,
        type,
        propertyId: propertyId || undefined,
        ga,
        params,
        smartRouterInjection,
        companyProperties,
      });

      // Per-Specialist override resolution (Task #495). When the Specialist
      // disables N+1 multi-model synthesis, force the legacy single-shot
      // path and use the Specialist's configured fallback/primary model.
      let specialistOverrides: OrchestratorModelOverrides | undefined;
      if (specialistId) {
        try {
          const { resolveSpecialistOrchestratorOverrides } = await import(
            "../../ai/specialist-llm-resolver"
          );
          specialistOverrides =
            await resolveSpecialistOrchestratorOverrides(specialistId);
        } catch {
          specialistOverrides = undefined;
        }
      }
      const multiModelDisabled = specialistOverrides?.multiModelEnabled === false;
      const useOrchestrator =
        type === "property" && isOrchestratorAvailable() && !multiModelDisabled;
      // Persist a `running` row up-front for every dispatch the per-Specialist
      // concurrency gate needs to see in flight (Task #501): orchestrator AND
      // single-model paths, property AND company scopes. Without this the gate
      // would always read `running = 0` and never block. The row is finalized
      // either by the persist step (success) or the outer catch (failure).
      const ownerUserId = getAuthUser(req).id;
      const shouldRegisterEarlyRun = Boolean(
        specialistId ||
          (useOrchestrator && propertyContextPack && propertyId),
      );
      if (shouldRegisterEarlyRun) {
        const isPropertyScoped = type === "property" && propertyId;
        const earlyRun = await storage.createResearchRun({
          userId: ownerUserId,
          entityType: isPropertyScoped ? "property" : "company",
          entityId: isPropertyScoped ? propertyId! : ownerUserId,
          scenarioId: null,
          tier: 1,
          status: "running",
          completedAt: null,
          durationMs: null,
          modelPrimary: model,
          modelSecondary: secondaryModel ?? null,
          tokensUsed: null,
          estimatedCost: null,
          error: null,
          metadata: specialistId ? { specialistId } : null,
        });
        earlyRunId = earlyRun.id;
      }
      const relaxCtx =
        useOrchestrator && propertyContextPack && propertyId && earlyRunId
          ? {
              researchRunId: earlyRunId,
              userId: getAuthUser(req).id,
              contextPack: propertyContextPack,
              specialistId,
            }
          : undefined;
      // Per-Specialist model resolution chain (Task #495):
      //   • Analyst A/B: request `model`/`secondaryModel` only when the
      //     caller actually passed values; otherwise leave undefined so
      //     the orchestrator's specialist→default resolver wins. This
      //     stops a default request `model` from masking the Specialist's
      //     persisted Analyst-A override.
      //   • Primary single-shot model: specialist override → request model.
      //   • Fallback (N+2): specialist override → primary fallback chain.
      const orchestratorModels: OrchestratorModelOverrides | undefined =
        useOrchestrator
          ? {
              analystAModel: specialistOverrides?.analystAModel ? undefined : model,
              analystBModel: specialistOverrides?.analystBModel
                ? undefined
                : secondaryModel || undefined,
            }
          : undefined;
      const primaryModel = specialistOverrides?.primaryModel ?? model;
      const fallbackModel = specialistOverrides?.fallbackModel ?? primaryModel;
      const stream = useOrchestrator
        ? orchestrateResearch(
            params,
            v2Prompt,
            relaxCtx,
            orchestratorModels,
            specialistId,
          )
        : generateResearchWithToolsStream(
            params,
            researchClient,
            primaryModel,
            secondaryModel,
            v2Prompt,
          );

      // ── Stream loop — accumulate content, forward events to client ──
      let fullContent = "";

      for await (const chunk of stream) {
        // Orchestrator hard failure — fall back to single-model
        if (
          chunk.type === "error" &&
          chunk.data.startsWith("ORCHESTRATOR_BOTH_FAILED")
        ) {
          res.write(
            `data: ${JSON.stringify({
              type: "phase",
              data: "Falling back to single-model research…",
            })}\n\n`,
          );
          const fallback = generateResearchWithToolsStream(
            params,
            researchClient,
            fallbackModel,
            secondaryModel,
            v2Prompt,
          );
          for await (const fb of fallback) {
            res.write(`data: ${JSON.stringify(fb)}\n\n`);
            if (fb.type === "content") fullContent += fb.data;
          }
          break;
        }
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (chunk.type === "content") fullContent += chunk.data;
      }

      // ── Post-processing — runs after both orchestrator and fallback paths ──
      const persistResult = await persistResearchOutput({
        req,
        type,
        propertyId: propertyId || undefined,
        ga,
        fullContent,
        marketIntelligence,
        webResearchResults,
        model,
        secondaryModel,
        vendorKey,
        params,
        startTime,
        earlyRunId,
        specialistId,
      });
      earlyRunFinalized = persistResult.earlyRunFinalized;

      if (earlyRunId && !earlyRunFinalized) {
        try {
          await storage.updateResearchRun(earlyRunId, {
            status: fullContent ? "completed" : "failed",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            tokensUsed: Math.round(
              (JSON.stringify(params).length + (fullContent || "").length) / 4,
            ),
            error: fullContent ? null : "No content generated",
            metadata: specialistId ? { specialistId } : undefined,
          });
          earlyRunFinalized = true;
        } catch (e: unknown) {
          logger.warn(
            `Failed to finalize early research run ${earlyRunId}: ${e instanceof Error ? e.message : String(e)}`,
            "research",
          );
        }
      }

      res.end();
    } catch (error: unknown) {
      logger.error(
        `Research generation error: ${error instanceof Error ? error.message : error}`,
        "research",
      );
      // Release the per-Specialist concurrency slot on dispatch failure so a
      // crashed run doesn't permanently consume a slot (Task #501).
      if (earlyRunId && !earlyRunFinalized) {
        try {
          await storage.updateResearchRun(earlyRunId, {
            status: "failed",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
          });
        } catch (e: unknown) {
          logger.warn(
            `Failed to finalize early research run ${earlyRunId} after error: ${e instanceof Error ? e.message : String(e)}`,
            "research",
          );
        }
      }
      res.write(
        `data: ${JSON.stringify({ type: "error", message: "Generation failed" })}\n\n`,
      );
      res.end();
    }
  });
}
