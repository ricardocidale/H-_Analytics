import type { Request, Response } from "express";
import type { ToolCall } from "../chat/tool-types";
import { dispatchRebeccaTool } from "../chat/rebecca-tools";
import type { DataChangedEntry } from "../chat/rebecca-tool-types";
import type { MessageEntry } from "./chat-llm";

export type ToolContext = { userId: number; req: Request };

export function sseWrite(res: Response, event: string, data: unknown): void {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Appends provider-native tool call and tool result turns to the message
 * history so the LLM can continue the conversation after tool execution.
 *
 * Each provider has a different wire format for these turns:
 *  - OpenAI:    assistant message with tool_calls array + individual tool messages
 *  - Anthropic: assistant message with content blocks + user message with tool_result blocks
 *  - Gemini:    model message with functionCall parts + user message with functionResponse parts
 *  - Exa: tools not supported — returns history unchanged
 */
export function appendToolResults(
  history: MessageEntry[],
  provider: string,
  toolCalls: ToolCall[],
  results: Array<{ id: string; name: string; result: unknown }>,
): MessageEntry[] {
  const next = [...history];

  if (provider === "openai") {
    next.push({
      role: "assistant",
      content: null,
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });
    for (const r of results) {
      next.push({ role: "tool", content: JSON.stringify(r.result), tool_call_id: r.id });
    }
  } else if (provider === "anthropic") {
    next.push({
      role: "assistant",
      content: toolCalls.map(tc => ({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments })),
    });
    next.push({
      role: "user",
      content: results.map(r => ({ type: "tool_result", tool_use_id: r.id, content: JSON.stringify(r.result) })),
    });
  } else if (provider === "gemini") {
    next.push({
      role: "model",
      content: null,
      parts: toolCalls.map(tc => ({ functionCall: { name: tc.name, args: tc.arguments } })),
    });
    next.push({
      role: "user",
      content: null,
      parts: results.map(r => ({ functionResponse: { name: r.name, response: { content: r.result } } })),
    });
  }
  // Exa: tools not supported — return history unchanged

  return next;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const outcome = await dispatchRebeccaTool(name, args, { userId: ctx.userId });
  return outcome as { result: unknown; dataChanged?: DataChangedEntry };
}
