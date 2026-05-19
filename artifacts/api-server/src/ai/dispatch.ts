/**
 * Shared LLM dispatch helper.
 *
 * Centralizes the vendor branching for all six providers (anthropic, openai,
 * google, deepseek, mistral, perplexity) that route handlers use. Two surfaces:
 *
 *   - `generateText({ llm, prompt, system?, maxTokens, operation?, route?, userId? })`
 *       Single-shot completion. Automatically calls logApiCost on completion.
 *
 *   - `streamText({ llm, prompt, system?, maxTokens, operation?, route?, userId? })`
 *       Async iterable of text deltas. Calls logApiCost once the stream ends.
 *
 * Both accept the `{ vendor, model }` shape produced by `resolveLlmFor` (admin-resources
 * `llm_slot` rows). Vendor stays string-typed — no closed union — so new vendors added
 * to admin_resources automatically flow through the default-throw branch.
 */
import {
  getAnthropicClient,
  getDeepSeekClient,
  getGeminiClient,
  getMistralClient,
  getOpenAIClient,
} from "./clients";
import { logApiCost, estimateCost } from "../middleware/cost-logger";

export interface DispatchLlm {
  vendor: string;
  model: string;
}

export interface DispatchSampling {
  temperature?: number;
  topP?: number;
}

export interface DispatchInput {
  llm: DispatchLlm;
  prompt: string;
  system?: string;
  maxTokens: number;
  /** Slot slug or operation name logged to api-costs.jsonl for cost attribution. */
  operation?: string;
  route?: string;
  userId?: number;
  sampling?: DispatchSampling;
}

export interface GenerateTextResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** Vendor string as returned from dispatch — matches CostEntry.service for known vendors. */
  service: string;
}

/**
 * Map a vendor string to a cost-logger service tag. Special cases (e.g., google → gemini)
 * are mapped explicitly; all other vendors pass through unchanged.
 */
export function dispatchService(vendor: string): string {
  const map: Record<string, string> = {
    anthropic: "anthropic",
    openai: "openai",
    google: "gemini",
    deepseek: "deepseek",
    mistral: "mistral",
  };
  return map[vendor] ?? vendor;
}

/** Kept for backwards compatibility with existing call sites. */
export type DispatchService = string;

function approxTokens(s: string): number {
  return Math.round(s.length / 4);
}

function writeCostLog(
  vendor: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  startMs: number,
  input: DispatchInput,
): void {
  try {
    logApiCost({
      timestamp: new Date().toISOString(),
      service: dispatchService(vendor),
      model,
      operation: input.operation ?? "dispatch",
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCost(vendor, model, inputTokens, outputTokens),
      durationMs: Date.now() - startMs,
      userId: input.userId,
      route: input.route ?? "dispatch",
    });
  } catch {
    // Never break dispatch on a logging failure
  }
}

export async function generateText(input: DispatchInput): Promise<GenerateTextResult> {
  const { llm, prompt, system, maxTokens, sampling } = input;
  const startMs = Date.now();

  if (llm.vendor === "anthropic") {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: llm.model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      ...(sampling?.temperature !== undefined ? { temperature: sampling.temperature } : {}),
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    const inputTokens = response.usage?.input_tokens ?? approxTokens(prompt);
    const outputTokens = response.usage?.output_tokens ?? approxTokens(text);
    writeCostLog("anthropic", llm.model, inputTokens, outputTokens, startMs, input);
    return { text, inputTokens, outputTokens, service: "anthropic" };
  }

  if (llm.vendor === "openai") {
    const client = getOpenAIClient();
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const completion = await client.chat.completions.create({
      model: llm.model,
      max_tokens: maxTokens,
      ...(sampling?.temperature !== undefined ? { temperature: sampling.temperature } : {}),
      ...(sampling?.topP !== undefined ? { top_p: sampling.topP } : {}),
      messages,
    });
    const text = completion.choices[0]?.message?.content ?? "";
    const inputTokens = completion.usage?.prompt_tokens ?? approxTokens(prompt);
    const outputTokens = completion.usage?.completion_tokens ?? approxTokens(text);
    writeCostLog("openai", llm.model, inputTokens, outputTokens, startMs, input);
    return { text, inputTokens, outputTokens, service: "openai" };
  }

  if (llm.vendor === "google") {
    // No native system role in Gemini — prepend to user content.
    const gemini = getGeminiClient();
    const combined = system ? `${system}\n\n${prompt}` : prompt;
    const response = await gemini.models.generateContent({
      model: llm.model,
      contents: [{ role: "user", parts: [{ text: combined }] }],
      config: {
        maxOutputTokens: maxTokens,
        ...(sampling?.temperature !== undefined ? { temperature: sampling.temperature } : {}),
        ...(sampling?.topP !== undefined ? { topP: sampling.topP } : {}),
      },
    });
    const text = response.text ?? "";
    const inputTokens = response.usageMetadata?.promptTokenCount ?? approxTokens(prompt);
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? approxTokens(text);
    writeCostLog("gemini", llm.model, inputTokens, outputTokens, startMs, input);
    return { text, inputTokens, outputTokens, service: "gemini" };
  }

  if (llm.vendor === "deepseek") {
    const client = await getDeepSeekClient();
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const completion = await client.chat.completions.create({
      model: llm.model,
      max_tokens: maxTokens,
      ...(sampling?.temperature !== undefined ? { temperature: sampling.temperature } : {}),
      ...(sampling?.topP !== undefined ? { top_p: sampling.topP } : {}),
      messages,
    });
    const text = completion.choices[0]?.message?.content ?? "";
    const inputTokens = completion.usage?.prompt_tokens ?? approxTokens(prompt);
    const outputTokens = completion.usage?.completion_tokens ?? approxTokens(text);
    writeCostLog("deepseek", llm.model, inputTokens, outputTokens, startMs, input);
    return { text, inputTokens, outputTokens, service: "deepseek" };
  }

  if (llm.vendor === "mistral") {
    const client = getMistralClient();
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const completion = await client.chat.complete({
      model: llm.model,
      maxTokens: maxTokens,
      ...(sampling?.temperature !== undefined ? { temperature: sampling.temperature } : {}),
      ...(sampling?.topP !== undefined ? { topP: sampling.topP } : {}),
      messages,
    });
    const choice = completion.choices?.[0];
    const content = choice?.message?.content;
    const text = typeof content === "string" ? content : "";
    const inputTokens = completion.usage?.promptTokens ?? approxTokens(prompt);
    const outputTokens = completion.usage?.completionTokens ?? approxTokens(text);
    writeCostLog("mistral", llm.model, inputTokens, outputTokens, startMs, input);
    return { text, inputTokens, outputTokens, service: "mistral" };
  }

  throw new Error(`Unsupported LLM vendor: ${llm.vendor}`);
}

/**
 * Yields text deltas as they arrive from the vendor stream.
 * Calls logApiCost once the stream ends (or is interrupted).
 */
export async function* streamText(input: DispatchInput): AsyncIterable<string> {
  const { llm, prompt, system, maxTokens, sampling } = input;
  const startMs = Date.now();
  let inputTokens = approxTokens(prompt);
  let outputTokens = 0;
  let accumulated = "";

  if (llm.vendor === "anthropic") {
    const client = getAnthropicClient();
    const stream = client.messages.stream({
      model: llm.model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      ...(sampling?.temperature !== undefined ? { temperature: sampling.temperature } : {}),
      messages: [{ role: "user", content: prompt }],
    });
    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          accumulated += event.delta.text;
          yield event.delta.text;
        } else if (event.type === "message_start") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const usage = (event as any).message?.usage;
          if (usage?.input_tokens) inputTokens = usage.input_tokens;
        } else if (event.type === "message_delta") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const usage = (event as any).usage;
          if (usage?.output_tokens) outputTokens = usage.output_tokens;
        }
      }
    } finally {
      if (outputTokens === 0) outputTokens = approxTokens(accumulated);
      writeCostLog("anthropic", llm.model, inputTokens, outputTokens, startMs, input);
    }
    return;
  }

  if (llm.vendor === "openai") {
    const client = getOpenAIClient();
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const stream = await client.chat.completions.create({
      model: llm.model,
      stream: true,
      max_tokens: maxTokens,
      ...(sampling?.temperature !== undefined ? { temperature: sampling.temperature } : {}),
      ...(sampling?.topP !== undefined ? { top_p: sampling.topP } : {}),
      messages,
    });
    try {
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          accumulated += content;
          yield content;
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
          outputTokens = chunk.usage.completion_tokens ?? approxTokens(accumulated);
        }
      }
    } finally {
      if (outputTokens === 0) outputTokens = approxTokens(accumulated);
      writeCostLog("openai", llm.model, inputTokens, outputTokens, startMs, input);
    }
    return;
  }

  if (llm.vendor === "google") {
    const gemini = getGeminiClient();
    const combined = system ? `${system}\n\n${prompt}` : prompt;
    const stream = await gemini.models.generateContentStream({
      model: llm.model,
      contents: [{ role: "user", parts: [{ text: combined }] }],
      config: {
        maxOutputTokens: maxTokens,
        ...(sampling?.temperature !== undefined ? { temperature: sampling.temperature } : {}),
        ...(sampling?.topP !== undefined ? { topP: sampling.topP } : {}),
      },
    });
    try {
      for await (const chunk of stream) {
        const content = chunk.text;
        if (content) {
          accumulated += content;
          yield content;
        }
        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens;
          outputTokens = chunk.usageMetadata.candidatesTokenCount ?? approxTokens(accumulated);
        }
      }
    } finally {
      if (outputTokens === 0) outputTokens = approxTokens(accumulated);
      writeCostLog("gemini", llm.model, inputTokens, outputTokens, startMs, input);
    }
    return;
  }

  if (llm.vendor === "deepseek") {
    const client = await getDeepSeekClient();
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const stream = await client.chat.completions.create({
      model: llm.model,
      stream: true,
      max_tokens: maxTokens,
      ...(sampling?.temperature !== undefined ? { temperature: sampling.temperature } : {}),
      ...(sampling?.topP !== undefined ? { top_p: sampling.topP } : {}),
      messages,
    });
    try {
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          accumulated += content;
          yield content;
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
          outputTokens = chunk.usage.completion_tokens ?? approxTokens(accumulated);
        }
      }
    } finally {
      if (outputTokens === 0) outputTokens = approxTokens(accumulated);
      writeCostLog("deepseek", llm.model, inputTokens, outputTokens, startMs, input);
    }
    return;
  }

  if (llm.vendor === "mistral") {
    const client = getMistralClient();
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const stream = await client.chat.stream({
      model: llm.model,
      maxTokens: maxTokens,
      ...(sampling?.temperature !== undefined ? { temperature: sampling.temperature } : {}),
      ...(sampling?.topP !== undefined ? { topP: sampling.topP } : {}),
      messages,
    });
    try {
      for await (const event of stream) {
        const choice = event.data?.choices?.[0];
        const rawContent = choice?.delta?.content;
        const content = typeof rawContent === "string" ? rawContent : undefined;
        if (content) {
          accumulated += content;
          yield content;
        }
        if (event.data?.usage) {
          inputTokens = event.data.usage.promptTokens ?? inputTokens;
          outputTokens = event.data.usage.completionTokens ?? approxTokens(accumulated);
        }
      }
    } finally {
      if (outputTokens === 0) outputTokens = approxTokens(accumulated);
      writeCostLog("mistral", llm.model, inputTokens, outputTokens, startMs, input);
    }
    return;
  }

  throw new Error(`Unsupported LLM vendor: ${llm.vendor}`);
}
