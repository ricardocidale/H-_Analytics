import type { Response } from "express";
import { callLlm, callLlmStream, type MessageEntry } from "./chat-llm";
import { sseWrite, appendToolResults, executeTool, type ToolContext } from "./chat-sse";
import type { ToolParam } from "../chat/tool-types";
import type { DataChangedEntry } from "../chat/rebecca-tool-types";

// Maximum number of tool-call/result round-trips before forcing a final text turn.
export const MAX_TOOL_DEPTH = 4;

export interface AgenticLoopParams {
  provider: string;
  model: string;
  fullSystemPrompt: string;
  effectiveHistory: MessageEntry[];
  message: string;
  sampling: { temperature: number; maxOutputTokens: number; topP?: number };
  tools: ToolParam[];
  toolCtx: ToolContext;
  useStream: boolean;
  webSearchEnabled: boolean;
  res: Response;
  /** Mutated by push() — entries are appended when tools fire data-change events. */
  dataChanged: DataChangedEntry[];
  /** Called the first time a tool is executed during the primary loop so the
   *  caller can guard against re-running after partial side effects. */
  onToolExecuted: () => void;
  userId: number | undefined;
}

export async function runAgenticLoop(params: AgenticLoopParams): Promise<string> {
  const {
    provider,
    model,
    fullSystemPrompt,
    effectiveHistory,
    message,
    sampling,
    tools,
    toolCtx,
    useStream,
    webSearchEnabled,
    res,
    dataChanged,
    onToolExecuted,
    userId,
  } = params;

  let toolHistory: MessageEntry[] = [...effectiveHistory];
  let loopFinalText = "";

  for (let depth = 0; depth < MAX_TOOL_DEPTH; depth++) {
    const isLastDepth = depth === MAX_TOOL_DEPTH - 1;
    // On the last depth, pass no tools so the LLM is forced to produce a text response.
    const activeTools = isLastDepth ? [] : tools;

    const result =
      depth === 0 && useStream
        ? await callLlmStream(
            provider,
            model,
            fullSystemPrompt,
            toolHistory,
            message,
            sampling,
            (token) => sseWrite(res, "delta", { token }),
            userId,
            webSearchEnabled,
            activeTools.length > 0 ? activeTools : undefined,
          )
        : await callLlm(
            provider,
            model,
            fullSystemPrompt,
            toolHistory,
            depth === 0 ? message : "",
            sampling,
            userId,
            webSearchEnabled,
            activeTools.length > 0 ? activeTools : undefined,
          );

    if (!result.toolCalls?.length || result.stopReason === "end_turn") {
      loopFinalText = result.text;
      // On continuation turns with streaming, emit the final text as a single delta.
      if (useStream && depth > 0 && result.text) {
        sseWrite(res, "delta", { token: result.text });
      }
      break;
    }

    // Emit tool_start events before execution so the client can show
    // per-tool dispatching animations immediately.
    if (useStream) {
      for (const tc of result.toolCalls) {
        sseWrite(res, "tool_start", { id: tc.id, name: tc.name });
      }
    }

    // Execute all tool calls in parallel.
    const toolResults = await Promise.all(
      result.toolCalls.map(async (tc) => {
        onToolExecuted();
        const toolStartMs = Date.now();
        try {
          const { result: r, dataChanged: dc } = await executeTool(
            tc.name,
            tc.arguments,
            toolCtx,
          );
          const elapsedMs = Date.now() - toolStartMs;
          if (dc) dataChanged.push(dc);
          if (useStream) {
            const runId =
              r && typeof r === "object"
                ? ((r as Record<string, unknown>).runId ??
                  (r as Record<string, unknown>).id)
                : undefined;
            sseWrite(res, "tool_done", {
              id: tc.id,
              name: tc.name,
              success: true,
              elapsedMs,
              ...(typeof runId === "number" ? { runId } : {}),
            });
          }
          return { id: tc.id, name: tc.name, result: r };
        } catch (toolErr) {
          const elapsedMs = Date.now() - toolStartMs;
          if (useStream)
            sseWrite(res, "tool_done", {
              id: tc.id,
              name: tc.name,
              success: false,
              elapsedMs,
            });
          throw toolErr;
        }
      }),
    );

    // On the first tool round, record the user's original message in history
    // before the assistant tool turns so continuation calls have the full
    // context (user question → assistant tool call → tool result → ...).
    if (depth === 0) {
      // Mirror the <user_message> wrapper that callLlm/callLlmStream apply
      // so continuation turns see the same prompt form as the initial call.
      toolHistory.push({
        role: "user",
        content: `<user_message>${message}</user_message>`,
      });
    }
    toolHistory = appendToolResults(toolHistory, provider, result.toolCalls, toolResults);
  }

  return loopFinalText;
}
