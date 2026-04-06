import { storage } from "../../storage";
import { logger } from "../../logger";
import { createResearchClient, resolveVendorFromModel } from "../research-client";
import { getAnthropicClient, getOpenAIClient, getGeminiClient, normalizeModelId } from "../clients";
import { DEFAULT_RESEARCH_MODEL } from "../resolve-llm";
import type { ResearchConfig, LlmVendor, ScheduledResearchWorkflow } from "@shared/schema";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const STARTUP_DELAY_MS = 30 * 1000;

export async function executeScheduledWorkflow(
  workflow: ScheduledResearchWorkflow,
): Promise<{ success: boolean; content: string; durationMs: number; error?: string }> {
  const startTime = Date.now();

  try {
    const users = await storage.getAllUsers();
    const adminUser = users.find(u => u.role === "admin") ?? users[0];
    if (!adminUser) {
      throw new Error("No admin user found to run scheduled research");
    }

    const ga = await storage.getGlobalAssumptions(adminUser.id);
    const researchConfig = (ga?.researchConfig as ResearchConfig) ?? {};

    const contextKey = "marketLlm";
    const contextLlm = researchConfig[contextKey as keyof ResearchConfig] as any;
    const model = normalizeModelId(
      contextLlm?.primaryLlm || researchConfig.preferredLlm || ga?.preferredLlm || DEFAULT_RESEARCH_MODEL,
    );

    const configuredVendor = (contextLlm?.llmVendor || "anthropic") as LlmVendor;
    const vendorKey = (["openai", "anthropic", "google"].includes(configuredVendor)
      ? configuredVendor
      : resolveVendorFromModel(model)) as "openai" | "anthropic" | "google";

    const researchClient = createResearchClient(vendorKey, {
      anthropic: vendorKey === "anthropic" ? getAnthropicClient() : undefined,
      openai: vendorKey === "openai" ? getOpenAIClient() : undefined,
      gemini: vendorKey === "google" ? getGeminiClient() : undefined,
    });

    let benchmarkContext = "";
    try {
      const benchmarks = await storage.getBenchmarkSnapshots();
      if (benchmarks.length > 0) {
        benchmarkContext = "\n\n## Current Benchmark Data\n" + benchmarks.map(b =>
          `- ${b.snapshotKey} (${b.category}): ${b.value}${b.source ? ` [${b.source}]` : ""}`,
        ).join("\n");
      }
    } catch { /* non-blocking */ }

    const systemPrompt = `You are a senior financial analyst specializing in US hospitality real estate. 
You produce concise, data-driven intelligence reports with specific numbers, dates, and source citations.
Always structure your output with clear sections, bullet points, and highlight actionable insights.
Include a "Key Takeaways" section at the end with 3-5 bullet points.
Today's date: ${new Date().toISOString().split("T")[0]}`;

    const userPrompt = `# Scheduled Research: ${workflow.name}

${workflow.description || ""}

## Research Instructions
${workflow.promptInstructions || "Provide a comprehensive update on this topic."}
${benchmarkContext}

Please provide a thorough, current intelligence report. Include specific data points, trends, and cite sources where possible. Format as professional HTML with headers, bullet points, and data tables where appropriate.`;

    const response = await researchClient.createMessage({
      model,
      maxTokens: 6144,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const content = response.textBlocks.join("");
    const durationMs = Date.now() - startTime;

    await storage.upsertMarketResearch({
      userId: adminUser.id,
      type: "global",
      title: `Scheduled: ${workflow.name}`,
      content: {
        html: content,
        scheduledWorkflow: workflow.workflowKey,
        workflowName: workflow.name,
        generatedAt: new Date().toISOString(),
      } as any,
      llmModel: model,
      propertyId: null,
      promptConditions: {
        scheduledWorkflow: workflow.workflowKey,
        durationMs,
      } as any,
    });

    await storage.createResearchRun({
      userId: adminUser.id,
      entityType: "global",
      entityId: 0,
      scenarioId: null,
      tier: 0,
      status: "completed",
      completedAt: new Date(),
      durationMs,
      modelPrimary: model,
      modelSecondary: null,
      modelSynthesis: null,
      tokensUsed: null,
      estimatedCost: null,
      error: null,
      metadata: { scheduledWorkflow: workflow.workflowKey },
    });

    return { success: true, content, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, content: "", durationMs, error };
  }
}

async function runScheduledCheckCycle(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const dueWorkflows = await storage.getDueScheduledWorkflows();
    if (dueWorkflows.length === 0) {
      return;
    }

    logger.info(
      `Found ${dueWorkflows.length} due scheduled research workflow(s): ${dueWorkflows.map(w => w.workflowKey).join(", ")}`,
      "research-scheduler",
    );

    for (const workflow of dueWorkflows) {
      if (workflow.lastRunStatus === "running") {
        logger.warn(`Skipping ${workflow.workflowKey} — already running`, "research-scheduler");
        continue;
      }

      await storage.updateScheduledWorkflowRun(workflow.id, {
        lastRunAt: new Date(),
        nextRunAt: new Date(Date.now() + workflow.frequencyHours * 60 * 60 * 1000),
        lastRunStatus: "running",
      });

      try {
        const result = await executeScheduledWorkflow(workflow);

        await storage.updateScheduledWorkflowRun(workflow.id, {
          lastRunAt: new Date(),
          nextRunAt: new Date(Date.now() + workflow.frequencyHours * 60 * 60 * 1000),
          lastRunStatus: result.success ? "completed" : "failed",
          lastRunDurationMs: result.durationMs,
          lastRunError: result.error ?? null,
        });

        if (result.success) {
          logger.info(
            `Completed scheduled research "${workflow.name}" in ${(result.durationMs / 1000).toFixed(1)}s`,
            "research-scheduler",
          );
        } else {
          logger.error(
            `Failed scheduled research "${workflow.name}": ${result.error}`,
            "research-scheduler",
          );
        }
      } catch (err) {
        await storage.updateScheduledWorkflowRun(workflow.id, {
          lastRunAt: new Date(),
          nextRunAt: new Date(Date.now() + workflow.frequencyHours * 60 * 60 * 1000),
          lastRunStatus: "failed",
          lastRunError: err instanceof Error ? err.message : String(err),
        });
        logger.error(
          `Scheduled research "${workflow.name}" threw: ${err instanceof Error ? err.message : err}`,
          "research-scheduler",
        );
      }
    }
  } catch (err) {
    logger.error(
      `Research scheduler cycle failed: ${err instanceof Error ? err.message : err}`,
      "research-scheduler",
    );
  } finally {
    isRunning = false;
  }
}

export function startResearchScheduler(): void {
  logger.info(
    `Starting — initial check in ${STARTUP_DELAY_MS / 1000}s, then every ${CHECK_INTERVAL_MS / 60000} min`,
    "research-scheduler",
  );

  setTimeout(async () => {
    try {
      await runScheduledCheckCycle();
    } catch (err) {
      logger.error(`Initial check failed: ${err instanceof Error ? err.message : String(err)}`, "research-scheduler");
    }

    schedulerInterval = setInterval(async () => {
      try {
        await runScheduledCheckCycle();
      } catch (err) {
        logger.error(`Periodic check failed: ${err instanceof Error ? err.message : String(err)}`, "research-scheduler");
      }
    }, CHECK_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export function stopResearchScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info("Stopped", "research-scheduler");
  }
}
