import type Anthropic from "@anthropic-ai/sdk";
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
const BATCH_ID_PREFIX = "BATCH:";

function extractBatchId(lastRunError: string | null | undefined): string | null {
  if (!lastRunError?.startsWith(BATCH_ID_PREFIX)) return null;
  return lastRunError.slice(BATCH_ID_PREFIX.length);
}

function buildSchedulerSystemPrompt(): string {
  return `You are a senior financial analyst specializing in US hospitality real estate.
You produce concise, data-driven intelligence reports with specific numbers, dates, and source citations.
Always structure your output with clear sections, bullet points, and highlight actionable insights.
Include a "Key Takeaways" section at the end with 3-5 bullet points.
Today's date: ${new Date().toISOString().split("T")[0]}`;
}

function buildWorkflowUserPrompt(workflow: ScheduledResearchWorkflow, benchmarkContext: string): string {
  return `# Scheduled Research: ${workflow.name}

${workflow.description || ""}

## Research Instructions
${workflow.promptInstructions || "Provide a comprehensive update on this topic."}
${benchmarkContext}

Please provide a thorough, current intelligence report. Include specific data points, trends, and cite sources where possible. Format as professional HTML with headers, bullet points, and data tables where appropriate.`;
}

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

    const response = await researchClient.createMessage({
      model,
      maxTokens: 6144,
      system: buildSchedulerSystemPrompt(),
      messages: [{ role: "user", content: buildWorkflowUserPrompt(workflow, benchmarkContext) }],
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
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, content: "", durationMs, error };
  }
}

async function submitWorkflowBatch(
  workflows: ScheduledResearchWorkflow[],
  benchmarkContext: string,
  model: string,
): Promise<string> {
  const anthropic = getAnthropicClient();
  const systemPrompt = buildSchedulerSystemPrompt();

  const requests = workflows.map(workflow => ({
    custom_id: workflow.workflowKey,
    params: {
      model,
      max_tokens: 6144,
      system: systemPrompt,
      messages: [{ role: "user" as const, content: buildWorkflowUserPrompt(workflow, benchmarkContext) }],
    },
  }));

  const batch = await anthropic.messages.batches.create({ requests });
  return batch.id;
}

async function processPendingBatches(): Promise<void> {
  const allWorkflows = await storage.getScheduledResearchWorkflows();
  const batchingWorkflows = allWorkflows.filter(w => w.lastRunStatus === "batching");
  if (batchingWorkflows.length === 0) return;

  const batchGroups = new Map<string, ScheduledResearchWorkflow[]>();
  for (const workflow of batchingWorkflows) {
    const batchId = extractBatchId(workflow.lastRunError);
    if (!batchId) {
      await storage.updateScheduledWorkflowRun(workflow.id, {
        lastRunAt: workflow.lastRunAt ?? new Date(),
        nextRunAt: new Date(Date.now() + workflow.frequencyHours * 60 * 60 * 1000),
        lastRunStatus: "pending",
        lastRunError: "Batch ID missing — reset by scheduler",
      });
      continue;
    }
    if (!batchGroups.has(batchId)) batchGroups.set(batchId, []);
    batchGroups.get(batchId)!.push(workflow);
  }

  if (batchGroups.size === 0) return;

  let anthropic: ReturnType<typeof getAnthropicClient>;
  try { anthropic = getAnthropicClient(); } catch { return; }

  const users = await storage.getAllUsers();
  const adminUser = users.find(u => u.role === "admin") ?? users[0];
  if (!adminUser) return;

  for (const [batchId, workflows] of Array.from(batchGroups)) {
    try {
      const batch = await anthropic.messages.batches.retrieve(batchId);

      if (batch.processing_status !== "ended") {
        logger.info(
          `Batch ${batchId}: ${batch.request_counts.processing} pending, ${batch.request_counts.succeeded} succeeded`,
          "research-scheduler",
        );
        continue;
      }

      const decoder = await anthropic.messages.batches.results(batchId);
      for await (const result of decoder) {
        const workflow = workflows.find(w => w.workflowKey === result.custom_id);
        if (!workflow) continue;

        const now = new Date();
        const nextRunAt = new Date(now.getTime() + workflow.frequencyHours * 60 * 60 * 1000);

        if (result.result.type === "succeeded") {
          const content = result.result.message.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map(b => b.text)
            .join("");

          await storage.upsertMarketResearch({
            userId: adminUser.id,
            type: "global",
            title: `Scheduled: ${workflow.name}`,
            content: {
              html: content,
              scheduledWorkflow: workflow.workflowKey,
              workflowName: workflow.name,
              generatedAt: now.toISOString(),
            } as any,
            llmModel: "batch/anthropic",
            propertyId: null,
            promptConditions: { scheduledWorkflow: workflow.workflowKey, batchId } as any,
          });

          await storage.updateScheduledWorkflowRun(workflow.id, {
            lastRunAt: workflow.lastRunAt ?? now,
            nextRunAt,
            lastRunStatus: "completed",
            lastRunError: null,
          });

          logger.info(`Batch result "${workflow.name}" completed successfully`, "research-scheduler");
        } else {
          await storage.updateScheduledWorkflowRun(workflow.id, {
            lastRunAt: workflow.lastRunAt ?? now,
            nextRunAt,
            lastRunStatus: "failed",
            lastRunError: `Batch result: ${result.result.type}`,
          });
          logger.error(`Batch result "${workflow.name}" failed: ${result.result.type}`, "research-scheduler");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Error processing batch ${batchId}: ${msg}`, "research-scheduler");
      for (const workflow of workflows) {
        await storage.updateScheduledWorkflowRun(workflow.id, {
          lastRunAt: workflow.lastRunAt ?? new Date(),
          nextRunAt: new Date(Date.now() + workflow.frequencyHours * 60 * 60 * 1000),
          lastRunStatus: "pending",
          lastRunError: `Batch retrieval failed: ${msg}`,
        });
      }
    }
  }
}

async function runScheduledCheckCycle(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    // Phase 1: check any in-flight batches for results
    await processPendingBatches();

    // Phase 2: find workflows due to run (skip ones already batching or running)
    const dueWorkflows = await storage.getDueScheduledWorkflows();
    const actionable = dueWorkflows.filter(
      w => w.lastRunStatus !== "running" && w.lastRunStatus !== "batching",
    );

    if (actionable.length === 0) return;

    logger.info(
      `Found ${actionable.length} due scheduled research workflow(s): ${actionable.map(w => w.workflowKey).join(", ")}`,
      "research-scheduler",
    );

    const users = await storage.getAllUsers();
    const adminUser = users.find(u => u.role === "admin") ?? users[0];
    if (!adminUser) return;

    const ga = await storage.getGlobalAssumptions(adminUser.id);
    const researchConfig = (ga?.researchConfig as ResearchConfig) ?? {};
    const contextLlm = researchConfig["marketLlm" as keyof ResearchConfig] as any;
    const model = normalizeModelId(
      contextLlm?.primaryLlm || researchConfig.preferredLlm || ga?.preferredLlm || DEFAULT_RESEARCH_MODEL,
    );
    const configuredVendor = (contextLlm?.llmVendor || "anthropic") as LlmVendor;
    const vendorKey = (["openai", "anthropic", "google"].includes(configuredVendor)
      ? configuredVendor
      : resolveVendorFromModel(model)) as "openai" | "anthropic" | "google";

    let benchmarkContext = "";
    try {
      const benchmarks = await storage.getBenchmarkSnapshots();
      if (benchmarks.length > 0) {
        benchmarkContext = "\n\n## Current Benchmark Data\n" + benchmarks.map(b =>
          `- ${b.snapshotKey} (${b.category}): ${b.value}${b.source ? ` [${b.source}]` : ""}`,
        ).join("\n");
      }
    } catch { /* non-blocking */ }

    if (vendorKey === "anthropic") {
      // Batch path: submit all workflows in one request at 50% cost
      const now = new Date();
      try {
        const batchId = await submitWorkflowBatch(actionable, benchmarkContext, model);
        logger.info(
          `Submitted batch ${batchId} for ${actionable.length} workflow(s)`,
          "research-scheduler",
        );
        for (const workflow of actionable) {
          await storage.updateScheduledWorkflowRun(workflow.id, {
            lastRunAt: now,
            nextRunAt: new Date(now.getTime() + workflow.frequencyHours * 60 * 60 * 1000),
            lastRunStatus: "batching",
            lastRunError: BATCH_ID_PREFIX + batchId,
          });
        }
      } catch (err: unknown) {
        logger.error(
          `Batch submission failed, falling back to sync: ${err instanceof Error ? err.message : err}`,
          "research-scheduler",
        );
        // Fall back to sync execution if batch submission fails
        for (const workflow of actionable) {
          await runWorkflowSync(workflow);
        }
      }
    } else {
      // Sync path for non-Anthropic vendors
      for (const workflow of actionable) {
        await runWorkflowSync(workflow);
      }
    }
  } catch (err: unknown) {
    logger.error(
      `Research scheduler cycle failed: ${err instanceof Error ? err.message : err}`,
      "research-scheduler",
    );
  } finally {
    isRunning = false;
  }
}

async function runWorkflowSync(workflow: ScheduledResearchWorkflow): Promise<void> {
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
      logger.info(`Completed "${workflow.name}" in ${(result.durationMs / 1000).toFixed(1)}s`, "research-scheduler");
    } else {
      logger.error(`Failed "${workflow.name}": ${result.error}`, "research-scheduler");
    }
  } catch (err: unknown) {
    await storage.updateScheduledWorkflowRun(workflow.id, {
      lastRunAt: new Date(),
      nextRunAt: new Date(Date.now() + workflow.frequencyHours * 60 * 60 * 1000),
      lastRunStatus: "failed",
      lastRunError: err instanceof Error ? err.message : String(err),
    });
    logger.error(`"${workflow.name}" threw: ${err instanceof Error ? err.message : err}`, "research-scheduler");
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
    } catch (err: unknown) {
      logger.error(`Initial check failed: ${err instanceof Error ? err.message : String(err)}`, "research-scheduler");
    }

    schedulerInterval = setInterval(async () => {
      try {
        await runScheduledCheckCycle();
      } catch (err: unknown) {
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
