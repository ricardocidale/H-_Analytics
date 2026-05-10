/**
 * Pietro LLM agent executor.
 *
 * Financial & Market Data Infrastructure Orchestrator. Assesses source health,
 * dispatches stale minions, and writes a health report. Mirrors Iris exactly —
 * same provider, same agentic loop, same workspace pattern.
 */
import { randomUUID } from "crypto";
import { callLlm } from "../../routes/chat";
import { getPietroTools, dispatchPietroTool } from "./tools";
import { readPietroHealth, appendRunHistory } from "./workspace";
import type { ToolCall } from "../../chat/tool-types";
import { resolveLlmFor } from "../llm-config-resolver";

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

const PIETRO_PROVIDER = "anthropic" as const;

/** Max tool-call rounds before forcing a final text turn. */
const PIETRO_MAX_TOOL_DEPTH = 8;

/** Low temperature — Pietro makes deterministic dispatch decisions. */
const PIETRO_TEMPERATURE = 0.1;

const PIETRO_MAX_OUTPUT_TOKENS = 2_000;

/** Max characters of prior health report included in kickoff context. */
const PIETRO_PRIOR_HEALTH_MAX_CHARS = 1_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PietroTrigger = "manual" | "scheduled-prefetch" | "health-check" | "source-added";

export interface PietroRunResult {
  runId: string;
  trigger: PietroTrigger;
  model: string;
  toolsInvoked: string[];
  sourcesChecked: number;
  sourcesRefreshed: number;
  errorsEncountered: number;
  errors: string[];
  durationMs: number;
  summary: string;
}

type MessageEntry = { role: string; content: unknown; [key: string]: unknown };

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const PIETRO_SYSTEM_PROMPT = `You are Pietro, the Financial & Market Data Infrastructure Orchestrator for H+ Analysis.
Your role: keep all external data sources healthy and their DB cache tables fresh.

You have these tools:
- list_data_sources: Discover which sources need attention (call this FIRST)
- assess_source_health: Probe a source to confirm secret + connectivity before dispatching
- dispatch_minion: Trigger a minion to fetch and cache data for a source slug
- write_health_report: Write your final report (ALWAYS call this last)

Instructions:
- First: Call list_data_sources to see what needs attention
- Then: For stale or failed sources, assess_source_health before dispatching
- Only dispatch_minion when the health check confirms the secret is present
- Skip sources with daily_request_budget = 0 (coding-session only, e.g. context7)
- Always: End by calling write_health_report summarising sources checked, minions dispatched, rows upserted
- Be efficient — health-check runs focus on probing; scheduled-prefetch runs focus on dispatching stale minions`;

// ---------------------------------------------------------------------------
// Helpers (mirrors Iris)
// ---------------------------------------------------------------------------

function appendPietroToolResults(
  history: MessageEntry[],
  toolCalls: ToolCall[],
  results: Array<{ id: string; name: string; result: unknown }>,
): MessageEntry[] {
  return [
    ...history,
    {
      role: "assistant",
      content: toolCalls.map(tc => ({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: tc.arguments,
      })),
    },
    {
      role: "user",
      content: results.map(r => ({
        type: "tool_result",
        tool_use_id: r.id,
        content: JSON.stringify(r.result),
      })),
    },
  ];
}

function accumulateMetrics(
  toolName: string,
  toolResult: unknown,
  metricsRef: { sourcesChecked: number; sourcesRefreshed: number; errorsEncountered: number; errors: string[] },
): void {
  if (typeof toolResult !== "object" || toolResult === null) return;
  const r = toolResult as Record<string, unknown>;

  if (toolName === "assess_source_health" && typeof r.status === "string") {
    metricsRef.sourcesChecked += 1;
  }
  if (toolName === "dispatch_minion" && typeof r.rowsUpserted === "number") {
    metricsRef.sourcesRefreshed += 1;
  }

  const errorMessage =
    typeof r.error === "string" ? r.error :
    r.status === "fail" ? `${toolName}: ${r.errorMessage ?? "probe failed"}` :
    null;

  if (errorMessage !== null) {
    metricsRef.errorsEncountered += 1;
    metricsRef.errors.push(errorMessage);
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runPietroAgent(trigger: PietroTrigger): Promise<PietroRunResult> {
  const startTime = Date.now();
  const runId = randomUUID();

  const { modelId: model } = await resolveLlmFor(
    trigger === "health-check" ? "pietro-health-check" : "pietro-orchestration",
  );
  const sampling = { temperature: PIETRO_TEMPERATURE, maxOutputTokens: PIETRO_MAX_OUTPUT_TOKENS };

  const priorHealth = await readPietroHealth();
  const healthSummary = priorHealth
    ? `Prior health report:\n${priorHealth.slice(0, PIETRO_PRIOR_HEALTH_MAX_CHARS)}`
    : "No prior health report available.";

  const userKickoff = `Trigger: ${trigger}\n\n${healthSummary}`;

  const tools = getPietroTools();
  const toolsInvoked: string[] = [];
  const metrics = { sourcesChecked: 0, sourcesRefreshed: 0, errorsEncountered: 0, errors: [] as string[] };

  let history: MessageEntry[] = [{ role: "user", content: userKickoff }];
  let finalText = "";
  let runError: unknown = undefined;

  try {
    for (let depth = 0; depth < PIETRO_MAX_TOOL_DEPTH; depth++) {
      const isLastDepth = depth === PIETRO_MAX_TOOL_DEPTH - 1;
      const activeTools = isLastDepth ? [] : tools;

      const result = await callLlm(
        PIETRO_PROVIDER,
        model,
        PIETRO_SYSTEM_PROMPT,
        depth === 0 ? [] : history,
        depth === 0 ? userKickoff : "",
        sampling,
        undefined,
        undefined,
        activeTools.length > 0 ? activeTools : undefined,
      );

      if (!result.toolCalls?.length || result.stopReason === "end_turn") {
        finalText = result.text;
        break;
      }

      if (depth === 0) {
        history = [{ role: "user", content: userKickoff }];
      }

      const toolResults: Array<{ id: string; name: string; result: unknown }> = [];
      for (const tc of result.toolCalls) {
        toolsInvoked.push(tc.name);
        const toolResult = await dispatchPietroTool(tc.name, tc.arguments ?? {});
        accumulateMetrics(tc.name, toolResult, metrics);
        toolResults.push({ id: tc.id, name: tc.name, result: toolResult });
      }

      history = appendPietroToolResults(history, result.toolCalls, toolResults);
    }
  } catch (err: unknown) {
    runError = err;
    const msg = err instanceof Error ? `Run failed: ${err.message}` : "Run failed with unexpected error";
    metrics.errorsEncountered += 1;
    metrics.errors.push(msg);
    if (!finalText) finalText = msg;
  }

  const durationMs = Date.now() - startTime;

  const today = new Date().toISOString().split("T")[0];
  const historyEntry = [
    `## Pietro Run — ${runId}`,
    ``,
    `- **Trigger**: ${trigger}`,
    `- **Model**: ${model}`,
    `- **Duration**: ${durationMs}ms`,
    `- **Tools invoked**: ${toolsInvoked.length > 0 ? toolsInvoked.join(", ") : "none"}`,
    `- **Sources checked**: ${metrics.sourcesChecked}`,
    `- **Sources refreshed**: ${metrics.sourcesRefreshed}`,
    `- **Errors**: ${metrics.errorsEncountered}`,
    ``,
    finalText ? `### Summary\n\n${finalText}` : "",
    ``,
  ].join("\n").trim();

  await appendRunHistory(today, historyEntry);

  if (runError !== undefined) throw runError;

  return {
    runId,
    trigger,
    model,
    toolsInvoked,
    sourcesChecked: metrics.sourcesChecked,
    sourcesRefreshed: metrics.sourcesRefreshed,
    errorsEncountered: metrics.errorsEncountered,
    errors: metrics.errors,
    durationMs,
    summary: finalText,
  };
}
