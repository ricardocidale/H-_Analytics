/**
 * Iris LLM agent executor.
 *
 * Reads workspace state, calls the LLM with Iris's tools in an agentic loop,
 * and returns a structured IrisRunResult.
 */

import { randomUUID } from "crypto";
import { callLlm } from "../../routes/chat";
import { getIrisTools, dispatchIrisTool } from "./tools";
import {
  readIrisGaps,
  readIrisHealth,
  appendRunHistory,
  clearIrisGaps,
} from "./workspace";
import type { ToolCall } from "../../chat/tool-types";
import { resolveLlmFor } from "../llm-config-resolver";

// ---------------------------------------------------------------------------
// Named constants (Category 2 — DEFAULT VARIABLE, admin-controlled starting values)
// ---------------------------------------------------------------------------

const IRIS_PROVIDER = "anthropic" as const;

/** Maximum number of tool-call/result round-trips before forcing a final text turn. */
const IRIS_MAX_TOOL_DEPTH = 5;

/** Sampling temperature — low for deterministic maintenance runs. */
const IRIS_TEMPERATURE = 0.2;

/** Maximum output tokens per LLM call. */
const IRIS_MAX_OUTPUT_TOKENS = 2000;

/** Max characters of the prior health report included in the kickoff context. */
const IRIS_PRIOR_HEALTH_SUMMARY_MAX_CHARS = 1_000;


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IrisTrigger = "manual" | "scheduled-health" | "scheduled-reindex" | "gap-signal";

export interface IrisRunResult {
  runId: string;
  trigger: IrisTrigger;
  model: string;
  toolsInvoked: string[];
  chunksIndexed: number;
  errorsEncountered: number;
  /** Individual error messages collected during the run. */
  errors: string[];
  durationMs: number;
  summary: string;
}

// Flexible history entry type matching the one used in chat.ts.
type MessageEntry = { role: string; content: unknown; [key: string]: unknown };

// ---------------------------------------------------------------------------
// Iris system prompt
// ---------------------------------------------------------------------------

const IRIS_SYSTEM_PROMPT = `You are Iris, a backstage maintenance agent for the H+ Analysis platform.
Your role: keep Rebecca's knowledge base, vector store, and API connections healthy.

You have these tools:
- ingest_document: Index a document from a URL or file path into the knowledge base
- prune_stale_entries: Remove orphaned vectors from the vector store
- test_api_connection: Check if an API source is reachable and measure latency
- evaluate_retrieval_quality: Run a test query and check if results meet threshold
- sync_data_source: Refresh an external data source and re-index its content
- write_health_report: Write your final health report (ALWAYS call this last)

Instructions:
- First: Review the gaps and prior health context provided
- Then: Run appropriate health checks and fixes based on the trigger type
- Always: End by calling write_health_report with a summary of what you did
- Be efficient — for health-check runs, focus on testing; for reindex runs, focus on ingestion`;

// ---------------------------------------------------------------------------
// Internal: Anthropic-format tool result appender
// (appendToolResults in chat.ts is not exported; replicate the Anthropic branch
// since Iris always uses the Anthropic provider)
// ---------------------------------------------------------------------------

function appendIrisToolResults(
  history: MessageEntry[],
  toolCalls: ToolCall[],
  results: Array<{ id: string; name: string; result: unknown }>,
): MessageEntry[] {
  return [
    ...history,
    {
      role: "assistant",
      content: toolCalls.map((tc) => ({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: tc.arguments,
      })),
    },
    {
      role: "user",
      content: results.map((r) => ({
        type: "tool_result",
        tool_use_id: r.id,
        content: JSON.stringify(r.result),
      })),
    },
  ];
}

// ---------------------------------------------------------------------------
// Internal: accumulate metrics from a tool result
// ---------------------------------------------------------------------------

function accumulateToolMetrics(
  toolName: string,
  toolResult: unknown,
  metricsRef: { chunksIndexed: number; errorsEncountered: number; errors: string[] },
): void {
  if (typeof toolResult !== "object" || toolResult === null) {
    return;
  }
  const r = toolResult as Record<string, unknown>;

  if (typeof r.chunksIndexed === "number") {
    metricsRef.chunksIndexed += r.chunksIndexed;
  }

  // Collect individual error message if any error indicator is present
  const errorMessage =
    typeof r.error === "string"
      ? r.error
      : typeof r.errorMessage === "string"
      ? r.errorMessage
      : r.success === false
      ? `${toolName}: operation failed`
      : r.reachable === false
      ? `${toolName}: target unreachable`
      : r.written === false
      ? `${toolName}: write failed`
      : null;

  if (errorMessage !== null) {
    metricsRef.errorsEncountered += 1;
    metricsRef.errors.push(errorMessage);
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runIrisAgent(trigger: IrisTrigger): Promise<IrisRunResult> {
  const startTime = Date.now();
  const runId = randomUUID();

  // Select model based on trigger (resolved from admin_resources at runtime)
  const { modelId: model } = await resolveLlmFor(
    trigger === "scheduled-health" ? "iris-health-check" : "iris-reindex",
  );

  const sampling = {
    temperature: IRIS_TEMPERATURE,
    maxOutputTokens: IRIS_MAX_OUTPUT_TOKENS,
  };

  // Step 1: Read workspace state
  const gaps = await readIrisGaps();
  const priorHealth = await readIrisHealth();

  // Step 2: Build context string for the user kickoff message
  const gapLines =
    gaps.length > 0
      ? `Knowledge gaps detected (${gaps.length}):\n${gaps.map((g) => `- ${g}`).join("\n")}`
      : "No knowledge gaps recorded.";

  const healthSummary = priorHealth
    ? `Prior health report:\n${priorHealth.slice(0, IRIS_PRIOR_HEALTH_SUMMARY_MAX_CHARS)}`
    : "No prior health report available.";

  const userKickoff = `Trigger: ${trigger}\n\n${gapLines}\n\n${healthSummary}`;

  // Step 3: Agentic loop — gaps are cleared AFTER a successful run so that
  // data is not permanently lost if the loop throws before completing.
  const tools = getIrisTools();
  const toolsInvoked: string[] = [];
  const metrics = { chunksIndexed: 0, errorsEncountered: 0, errors: [] as string[] };

  // Build initial message history — user message contains the context kickoff
  let history: MessageEntry[] = [{ role: "user", content: userKickoff }];
  let finalText = "";
  let runError: unknown = undefined;

  try {
    for (let depth = 0; depth < IRIS_MAX_TOOL_DEPTH; depth++) {
      const isLastDepth = depth === IRIS_MAX_TOOL_DEPTH - 1;
      // On last depth pass no tools so LLM is forced to produce a text response
      const activeTools = isLastDepth ? [] : tools;

      const result = await callLlm(
        IRIS_PROVIDER,
        model,
        IRIS_SYSTEM_PROMPT,
        // On depth 0 the user kickoff is already in history; on subsequent turns
        // history already includes the user kickoff + assistant tool turns.
        // Passing "" as userMessage on depth > 0 signals callLlm to skip
        // appending an extra user turn (tool_result is already the last user
        // turn in history — adding another would produce consecutive user-role
        // messages that Anthropic/Gemini reject).
        depth === 0 ? [] : history,
        depth === 0 ? userKickoff : "",
        sampling,
        undefined, // no userId for backstage
        undefined, // no webSearch
        activeTools.length > 0 ? activeTools : undefined,
      );

      if (!result.toolCalls?.length || result.stopReason === "end_turn") {
        finalText = result.text;
        break;
      }

      // Before first tool round, record the user kickoff in history so
      // continuation calls have full context (mirrors chat.ts runAgenticLoop)
      if (depth === 0) {
        history = [{ role: "user", content: userKickoff }];
      }

      // Dispatch tool calls sequentially (Iris is a backstage agent, no parallelism needed)
      const toolResults: Array<{ id: string; name: string; result: unknown }> = [];
      for (const tc of result.toolCalls) {
        toolsInvoked.push(tc.name);
        const toolResult = await dispatchIrisTool(tc.name, tc.arguments ?? {});
        accumulateToolMetrics(tc.name, toolResult, metrics);
        toolResults.push({ id: tc.id, name: tc.name, result: toolResult });
      }

      history = appendIrisToolResults(history, result.toolCalls, toolResults);
    }

    // Clear gaps only after the loop completes without throwing — this
    // prevents permanent data loss on provider outages or tool failures.
    if (trigger === "gap-signal") {
      await clearIrisGaps();
    }
  } catch (err: unknown) {
    runError = err;
    const catchMsg = err instanceof Error ? `Run failed: ${err.message}` : "Run failed with unexpected error";
    metrics.errorsEncountered += 1;
    metrics.errors.push(catchMsg);
    if (!finalText) {
      finalText = catchMsg;
    }
  }

  const durationMs = Date.now() - startTime;

  // Step 4: Record run in history — always, even on failure, for audit completeness.
  const today = new Date().toISOString().split("T")[0];
  const historyEntry = [
    `## Iris Run — ${runId}`,
    ``,
    `- **Trigger**: ${trigger}`,
    `- **Model**: ${model}`,
    `- **Duration**: ${durationMs}ms`,
    `- **Tools invoked**: ${toolsInvoked.length > 0 ? toolsInvoked.join(", ") : "none"}`,
    `- **Chunks indexed**: ${metrics.chunksIndexed}`,
    `- **Errors**: ${metrics.errorsEncountered}`,
    ``,
    finalText ? `### Summary\n\n${finalText}` : "",
    ``,
  ]
    .join("\n")
    .trim();

  await appendRunHistory(today, historyEntry);

  // Re-throw so callers (scheduler, manual-trigger route) can record the failure.
  if (runError !== undefined) {
    throw runError;
  }

  return {
    runId,
    trigger,
    model,
    toolsInvoked,
    chunksIndexed: metrics.chunksIndexed,
    errorsEncountered: metrics.errorsEncountered,
    errors: metrics.errors,
    durationMs,
    summary: finalText,
  };
}
