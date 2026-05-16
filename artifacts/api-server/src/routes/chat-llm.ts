import { getGeminiClient, getExaClient, getOpenAIClient, getAnthropicClient, normalizeModelId, getDeepSeekClient, getMistralClient } from "../ai/clients";
import { storage } from "../storage";
import { AI_GENERATION_TIMEOUT_MS } from "../constants";
import { logApiCost, estimateCost } from "../middleware/cost-logger";
import { logger } from "../logger";
import { z } from "zod";
import type { ToolParam, LlmResult, ToolCall } from "../chat/tool-types";

// Vendor → provider-id mapping (mirrors llm-providers.ts VENDOR_MAP).
const VENDOR_TO_PROVIDER_ID: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "gemini",
};

// Simple in-process cache: provider-id → first available modelId. TTL 5 min.
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
const _modelCache = new Map<string, { value: string; expiresAt: number }>();

// Flexible history entry type that can carry either simple text turns or
// provider-native tool call/result turns (which have non-string content).
export type MessageEntry = { role: string; content: unknown; [key: string]: unknown };

export async function resolveDefaultModel(providerId: string): Promise<string> {
  const now = Date.now();
  const cached = _modelCache.get(providerId);
  if (cached && cached.expiresAt > now) return cached.value;

  const rows = await storage.listAdminResources("model");
  const targetVendor = Object.entries(VENDOR_TO_PROVIDER_ID).find(([, id]) => id === providerId)?.[0];
  const match = rows.find(r => (r.config as Record<string, unknown>).vendor === targetVendor);
  const modelId = match
    ? String((match.config as Record<string, unknown>).modelId ?? providerId)
    : providerId;

  _modelCache.set(providerId, { value: modelId, expiresAt: now + MODEL_CACHE_TTL_MS });
  return modelId;
}

export const VALID_RESPONSE_MODES = ["concise", "standard", "detailed"] as const;
export type ResponseMode = typeof VALID_RESPONSE_MODES[number];
export const responseModeSchema = z.enum(["concise", "standard", "detailed"]).optional();

export function resolveResponseMode(
  bodyMode: ResponseMode | undefined,
  userDbMode: string | null | undefined,
): ResponseMode {
  if (bodyMode) return bodyMode;
  if (userDbMode && (VALID_RESPONSE_MODES as readonly string[]).includes(userDbMode)) {
    return userDbMode as ResponseMode;
  }
  return "standard";
}

/**
 * Marker error class for admin-policy refusals from inside callLlm
 * (e.g. Exa blocked by sources.webSearch.enabled=false). The outer
 * /api/chat handler catches it and surfaces the message to the client at
 * 422 instead of swallowing it as a generic 500.
 */
export class ChatPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatPolicyError";
  }
}

// Task #499 — unified LLM dispatch across providers. Each branch returns the
// final assistant text and (best-effort) logs cost.
//
// Exported (Task #559) so the scheduled fixture-replay runner
// (server/ai/rebecca-preview-runner.ts) can dispatch through the exact
// same provider matrix the live preview uses, instead of duplicating the
// switch statement and silently drifting from the real chat behavior.
export async function callLlm(
  provider: string,
  model: string,
  systemPrompt: string,
  history: MessageEntry[],
  userMessage: string,
  sampling: { temperature: number; maxOutputTokens: number; topP?: number },
  userId?: number,
  webSearchEnabled?: boolean,
  tools?: ToolParam[],
): Promise<LlmResult> {
  const wrappedUser = `<user_message>\n${userMessage}\n</user_message>`;
  const startTime = Date.now();
  // Keep a handle so we can clearTimeout() in finally — otherwise the timer
  // keeps the event loop alive for AI_GENERATION_TIMEOUT_MS after the LLM
  // returns. More critically: if any code path below throws SYNCHRONOUSLY
  // before reaching its Promise.race (e.g. getAnthropicClient() blowing up
  // on a missing/invalid key), timeoutP is left dangling with no handlers
  // and the eventual rejection becomes an unhandled rejection that crashes
  // Node 20 — observed on Railway PR-preview where the Anthropic key was
  // invalid and the container crash-looped, which Railway reports as a
  // failed deploy. The no-op .catch() defensively marks the rejection as
  // handled even if try/finally cleanup is somehow skipped.
  let timeoutHandle: NodeJS.Timeout | null = null;
  const timeoutP = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`Chat LLM timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`)),
      AI_GENERATION_TIMEOUT_MS,
    );
  });
  timeoutP.catch(() => { /* prevent unhandled rejection if no Promise.race attached */ });
  const clearLlmTimeout = (): void => {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  };

  try {
  if (provider === "exa") {
    // Exa is a web-grounded provider — every response is an AI-synthesised
    // answer over live web results with a "**Sources:**" block appended below.
    // The admin-facing toggle in RebeccaConfig under Knowledge & Sources →
    // Web Search controls this behavior. Throw a typed error so the outer
    // try/catch falls back to the configured non-grounded provider.
    if (webSearchEnabled === false) {
      throw new ChatPolicyError(
        "Exa (web-grounded) is disabled by Knowledge & Sources → Web Search. Enable the toggle in Rebecca Configuration, or select a non-Exa provider.",
      );
    }
    const client = getExaClient();
    // Use the latest user message as the search query; fall back to the last
    // history entry for continuation turns where userMessage is empty.
    const query = userMessage || (history[history.length - 1]?.content as string | undefined) || "";
    const response = await Promise.race([
      client.answer(query, { text: true }),
      timeoutP,
    ]);
    let text = (typeof response.answer === "string" ? response.answer : "") || "I'm sorry, I couldn't generate a response. Please try again.";
    const citations = response.citations ?? [];
    if (citations.length > 0) {
      text += "\n\n**Sources:**\n" + citations.map((c, i) => `[${i + 1}] ${c.url}`).join("\n");
    }
    const inTok = Math.round(query.length / 4);
    const outTok = Math.round(text.length / 4);
    try { logApiCost({ timestamp: new Date().toISOString(), service: "exa", model, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("exa", model, inTok, outTok), durationMs: Date.now() - startTime, userId, route: "/api/chat" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
    return { text, stopReason: "end_turn" };
  }

  if (provider === "openai") {
    const client = getOpenAIClient();
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((m) => m as any),
      // Skip appending a user turn when userMessage is empty — continuation
      // turns pass "" because history already ends with a tool_result user turn.
      ...(userMessage ? [{ role: "user" as const, content: wrappedUser }] : []),
    ];
    const hasTools = tools && tools.length > 0;
    const completion = await Promise.race([
      client.chat.completions.create({
        model,
        messages,
        max_tokens: sampling.maxOutputTokens,
        temperature: sampling.temperature,
        ...(sampling.topP !== undefined ? { top_p: sampling.topP } : {}),
        ...(hasTools ? {
          tools: tools.map(t => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } })),
          tool_choice: "auto" as const,
        } : {}),
      } as any),
      timeoutP,
    ]) as any;
    const inTok = completion.usage?.prompt_tokens ?? Math.round(userMessage.length / 4);
    if (hasTools) {
      const rawToolCalls = completion.choices?.[0]?.message?.tool_calls;
      if (rawToolCalls && rawToolCalls.length > 0) {
        const toolCallResults: ToolCall[] = rawToolCalls
          .filter((tc: any) => tc.type === "function")
          .map((tc: any) => {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch { args = {}; }
            return { id: tc.id, name: tc.function?.name ?? "", arguments: args };
          });
        const outTok = completion.usage?.completion_tokens ?? 0;
        try { logApiCost({ timestamp: new Date().toISOString(), service: "openai", model, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("openai", model, inTok, outTok), durationMs: Date.now() - startTime, userId, route: "/api/chat" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
        return { text: "", toolCalls: toolCallResults, stopReason: "tool_use" };
      }
    }
    const text = completion.choices?.[0]?.message?.content?.toString() || "I'm sorry, I couldn't generate a response. Please try again.";
    const outTok = completion.usage?.completion_tokens ?? Math.round(text.length / 4);
    try { logApiCost({ timestamp: new Date().toISOString(), service: "openai", model, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("openai", model, inTok, outTok), durationMs: Date.now() - startTime, userId, route: "/api/chat" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
    return { text, stopReason: "end_turn" };
  }

  if (provider === "anthropic") {
    const client = getAnthropicClient();
    const normalized = normalizeModelId(model);
    const hasTools = tools && tools.length > 0;
    const result = await Promise.race([
      client.messages.create({
        model: normalized,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        max_tokens: sampling.maxOutputTokens,
        temperature: sampling.temperature,
        ...(sampling.topP !== undefined ? { top_p: sampling.topP } : {}),
        messages: [
          ...history.map((m) => m as any),
          // Skip appending a user turn when userMessage is empty — continuation
          // turns pass "" because history already ends with a tool_result user turn.
          ...(userMessage ? [{ role: "user" as const, content: wrappedUser }] : []),
        ],
        ...(hasTools ? {
          tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters as any })),
        } : {}),
      } as any),
      timeoutP,
    ]) as any;
    const inTok = result.usage?.input_tokens ?? Math.round(userMessage.length / 4);
    if (hasTools && result.stop_reason === "tool_use") {
      const toolCalls: ToolCall[] = result.content
        .filter((b: any) => b.type === "tool_use")
        .map((b: any) => ({ id: b.id, name: b.name, arguments: b.input ?? {} }));
      const outTok = result.usage?.output_tokens ?? 0;
      try { logApiCost({ timestamp: new Date().toISOString(), service: "anthropic", model: normalized, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("anthropic", normalized, inTok, outTok), durationMs: Date.now() - startTime, userId, route: "/api/chat" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
      return { text: "", toolCalls, stopReason: "tool_use" };
    }
    const blocks = result.content;
    const text = (Array.isArray(blocks) ? blocks.map((b: any) => (b.type === "text" ? b.text : "")).join("") : "") || "I'm sorry, I couldn't generate a response. Please try again.";
    const outTok = result.usage?.output_tokens ?? Math.round(text.length / 4);
    try { logApiCost({ timestamp: new Date().toISOString(), service: "anthropic", model: normalized, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("anthropic", normalized, inTok, outTok), durationMs: Date.now() - startTime, userId, route: "/api/chat" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
    return { text, stopReason: "end_turn" };
  }

  if (provider === "deepseek") {
    // Conditional spread for temperature/topP prevents 400s from vendor APIs
    // that reject unsupported sampling params. See:
    // docs/solutions/integration-issues/iris-llm-temperature-top-p-conflict-2026-05-08.md
    const client = await getDeepSeekClient();
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((m) => m as any),
      ...(userMessage ? [{ role: "user" as const, content: wrappedUser }] : []),
    ];
    const completion = await Promise.race([
      client.chat.completions.create({
        model,
        messages,
        max_tokens: sampling.maxOutputTokens,
        ...(sampling.temperature !== undefined ? { temperature: sampling.temperature } : {}),
        ...(sampling.topP !== undefined ? { top_p: sampling.topP } : {}),
      } as any),
      timeoutP,
    ]) as any;
    const text = completion.choices?.[0]?.message?.content?.toString() || "I'm sorry, I couldn't generate a response. Please try again.";
    const inTok = completion.usage?.prompt_tokens ?? Math.round(userMessage.length / 4);
    const outTok = completion.usage?.completion_tokens ?? Math.round(text.length / 4);
    try { logApiCost({ timestamp: new Date().toISOString(), service: "deepseek", model, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("deepseek", model, inTok, outTok), durationMs: Date.now() - startTime, userId, route: "/api/chat" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
    return { text, stopReason: "end_turn" };
  }

  if (provider === "mistral") {
    // Conditional spread for temperature/topP — see Iris LLM bug learning above.
    const client = getMistralClient();
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((m) => m as any),
      ...(userMessage ? [{ role: "user" as const, content: wrappedUser }] : []),
    ];
    const completion = await Promise.race([
      client.chat.complete({
        model,
        messages,
        maxTokens: sampling.maxOutputTokens,
        ...(sampling.temperature !== undefined ? { temperature: sampling.temperature } : {}),
        ...(sampling.topP !== undefined ? { topP: sampling.topP } : {}),
      } as any),
      timeoutP,
    ]) as any;
    const rawContent = completion.choices?.[0]?.message?.content;
    const text = (typeof rawContent === "string" ? rawContent : "") || "I'm sorry, I couldn't generate a response. Please try again.";
    const inTok = completion.usage?.promptTokens ?? Math.round(userMessage.length / 4);
    const outTok = completion.usage?.completionTokens ?? Math.round(text.length / 4);
    try { logApiCost({ timestamp: new Date().toISOString(), service: "mistral", model, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("mistral", model, inTok, outTok), durationMs: Date.now() - startTime, userId, route: "/api/chat" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
    return { text, stopReason: "end_turn" };
  }

  // gemini default
  const gemini = getGeminiClient();
  // Entries that already have `parts` (tool call/result turns appended by
  // appendToolResults) are passed through as-is. Simple text entries are
  // wrapped in the standard Gemini parts format.
  const contents = [
    { role: "user" as const, parts: [{ text: systemPrompt }] },
    { role: "model" as const, parts: [{ text: "Understood. I have the portfolio data and will answer questions based on it." }] },
    ...history.map((m) => {
      if ("parts" in m && Array.isArray((m as any).parts)) {
        return m as any;
      }
      return {
        role: (m.role === "user" ? "user" : "model") as "user" | "model",
        parts: [{ text: m.content as string }],
      };
    }),
    // Skip appending a user turn when userMessage is empty — continuation
    // turns pass "" because history already ends with a tool_result user turn.
    ...(userMessage ? [{ role: "user" as const, parts: [{ text: wrappedUser }] }] : []),
  ];
  const hasGeminiTools = tools && tools.length > 0;
  const response = await Promise.race([
    gemini.models.generateContent({
      model,
      contents,
      config: {
        maxOutputTokens: sampling.maxOutputTokens,
        temperature: sampling.temperature,
        ...(sampling.topP !== undefined ? { topP: sampling.topP } : {}),
        ...(hasGeminiTools ? {
          tools: [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
        } : {}),
      } as any,
    }),
    timeoutP,
  ]);
  const inTok = response.usageMetadata?.promptTokenCount ?? Math.round(userMessage.length / 4);
  if (hasGeminiTools) {
    const fnParts = (response.candidates?.[0]?.content?.parts ?? []).filter((p: any) => p.functionCall);
    if (fnParts.length > 0) {
      const toolCalls: ToolCall[] = fnParts.map((p: any) => ({
        id: p.functionCall.name + "_" + Date.now(),
        name: p.functionCall.name,
        arguments: p.functionCall.args ?? {},
      }));
      const outTok = response.usageMetadata?.candidatesTokenCount ?? 0;
      try { logApiCost({ timestamp: new Date().toISOString(), service: "gemini", model, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("gemini", model, inTok, outTok), durationMs: Date.now() - startTime, userId, route: "/api/chat" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
      return { text: "", toolCalls, stopReason: "tool_use" };
    }
  }
  const text = response.text || "I'm sorry, I couldn't generate a response. Please try again.";
  const outTok = response.usageMetadata?.candidatesTokenCount ?? Math.round(text.length / 4);
  try { logApiCost({ timestamp: new Date().toISOString(), service: "gemini", model, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("gemini", model, inTok, outTok), durationMs: Date.now() - startTime, userId, route: "/api/chat" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
  return { text, stopReason: "end_turn" };
  } finally {
    clearLlmTimeout();
  }
}

export async function callLlmStream(
  provider: string,
  model: string,
  systemPrompt: string,
  history: MessageEntry[],
  userMessage: string,
  sampling: { temperature: number; maxOutputTokens: number; topP?: number },
  onToken: (token: string) => void,
  userId?: number,
  webSearchEnabled?: boolean,
  tools?: ToolParam[],
): Promise<LlmResult> {
  const wrappedUser = `<user_message>\n${userMessage}\n</user_message>`;
  const startTime = Date.now();

  // When tools are provided, delegate to the non-streaming callLlm.
  // Streaming tool-call deltas are complex; the agentic loop (U2) handles
  // re-invocation, and the final text-generation turn re-enters this function
  // without tools so streaming resumes normally.
  if (tools && tools.length > 0) {
    const result = await callLlm(provider, model, systemPrompt, history, userMessage, sampling, userId, webSearchEnabled, tools);
    if (result.text) onToken(result.text);
    return result;
  }

  if (provider === "exa") {
    // No streaming API — batch and emit full text as single token
    const result = await callLlm(provider, model, systemPrompt, history, userMessage, sampling, userId, webSearchEnabled, tools);
    onToken(result.text);
    return result;
  }

  if (provider === "openai") {
    const client = getOpenAIClient();
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((m) => m as any),
      { role: "user" as const, content: wrappedUser },
    ];
    const stream = await client.chat.completions.create({
      model,
      messages,
      max_tokens: sampling.maxOutputTokens,
      temperature: sampling.temperature,
      ...(sampling.topP !== undefined ? { top_p: sampling.topP } : {}),
      stream: true,
    });
    let text = "";
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? "";
      if (token) { text += token; onToken(token); }
    }
    if (!text) text = "I'm sorry, I couldn't generate a response. Please try again.";
    const inTok = Math.round(userMessage.length / 4);
    const outTok = Math.round(text.length / 4);
    try { logApiCost({ timestamp: new Date().toISOString(), service: "openai", model, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("openai", model, inTok, outTok), durationMs: Date.now() - startTime, userId, route: "/api/chat" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
    return { text, stopReason: "end_turn" };
  }

  if (provider === "anthropic") {
    const client = getAnthropicClient();
    const normalized = normalizeModelId(model);
    const stream = await client.messages.create({
      model: normalized,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      max_tokens: sampling.maxOutputTokens,
      temperature: sampling.temperature,
      ...(sampling.topP !== undefined ? { top_p: sampling.topP } : {}),
      messages: [
        ...history.map((m) => m as any),
        { role: "user" as const, content: wrappedUser },
      ],
      stream: true,
    });
    let text = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        onToken(event.delta.text);
      }
    }
    if (!text) text = "I'm sorry, I couldn't generate a response. Please try again.";
    const inTok = Math.round(userMessage.length / 4);
    const outTok = Math.round(text.length / 4);
    try { logApiCost({ timestamp: new Date().toISOString(), service: "anthropic", model: normalized, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("anthropic", normalized, inTok, outTok), durationMs: Date.now() - startTime, userId, route: "/api/chat" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
    return { text, stopReason: "end_turn" };
  }

  if (provider === "deepseek") {
    // Conditional spread for temperature/topP — see Iris LLM bug learning above.
    const client = await getDeepSeekClient();
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((m) => m as any),
      { role: "user" as const, content: wrappedUser },
    ];
    const stream = client.chat.completions.stream({
      model,
      messages,
      max_tokens: sampling.maxOutputTokens,
      ...(sampling.temperature !== undefined ? { temperature: sampling.temperature } : {}),
      ...(sampling.topP !== undefined ? { top_p: sampling.topP } : {}),
    } as any);
    let text = "";
    for await (const chunk of stream) {
      const token = chunk.choices?.[0]?.delta?.content ?? "";
      if (token) { text += token; onToken(token); }
    }
    if (!text) text = "I'm sorry, I couldn't generate a response. Please try again.";
    const inTok = Math.round(userMessage.length / 4);
    const outTok = Math.round(text.length / 4);
    try { logApiCost({ timestamp: new Date().toISOString(), service: "deepseek", model, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("deepseek", model, inTok, outTok), durationMs: Date.now() - startTime, userId, route: "/api/chat" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
    return { text, stopReason: "end_turn" };
  }

  if (provider === "mistral") {
    // Conditional spread for temperature/topP — see Iris LLM bug learning above.
    const client = getMistralClient();
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((m) => m as any),
      { role: "user" as const, content: wrappedUser },
    ];
    const stream = await client.chat.stream({
      model,
      messages,
      maxTokens: sampling.maxOutputTokens,
      ...(sampling.temperature !== undefined ? { temperature: sampling.temperature } : {}),
      ...(sampling.topP !== undefined ? { topP: sampling.topP } : {}),
    } as any);
    let text = "";
    for await (const event of stream) {
      const rawContent = (event as any).data?.choices?.[0]?.delta?.content;
      const token = typeof rawContent === "string" ? rawContent : "";
      if (token) { text += token; onToken(token); }
    }
    if (!text) text = "I'm sorry, I couldn't generate a response. Please try again.";
    const inTok = Math.round(userMessage.length / 4);
    const outTok = Math.round(text.length / 4);
    try { logApiCost({ timestamp: new Date().toISOString(), service: "mistral", model, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("mistral", model, inTok, outTok), durationMs: Date.now() - startTime, userId, route: "/api/chat" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
    return { text, stopReason: "end_turn" };
  }

  // gemini — use generateContentStream
  const gemini = getGeminiClient();
  const contents = [
    { role: "user" as const, parts: [{ text: systemPrompt }] },
    { role: "model" as const, parts: [{ text: "Understood. I have the portfolio data and will answer questions based on it." }] },
    ...history.map((m) => {
      if ("parts" in m && Array.isArray((m as any).parts)) {
        return m as any;
      }
      return {
        role: (m.role === "user" ? "user" : "model") as "user" | "model",
        parts: [{ text: m.content as string }],
      };
    }),
    // Skip appending a user turn when userMessage is empty — continuation
    // turns pass "" because history already ends with a tool_result user turn.
    ...(userMessage ? [{ role: "user" as const, parts: [{ text: wrappedUser }] }] : []),
  ];
  const genStream = await gemini.models.generateContentStream({
    model,
    contents,
    config: {
      maxOutputTokens: sampling.maxOutputTokens,
      temperature: sampling.temperature,
      ...(sampling.topP !== undefined ? { topP: sampling.topP } : {}),
    },
  });
  let text = "";
  for await (const chunk of genStream) {
    const token = chunk.text ?? "";
    if (token) { text += token; onToken(token); }
  }
  if (!text) text = "I'm sorry, I couldn't generate a response. Please try again.";
  const inTok = Math.round(userMessage.length / 4);
  const outTok = Math.round(text.length / 4);
  try { logApiCost({ timestamp: new Date().toISOString(), service: "gemini", model, operation: "chat", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateCost("gemini", model, inTok, outTok), durationMs: Date.now() - startTime, userId, route: "/api/chat" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
  return { text, stopReason: "end_turn" };
}
