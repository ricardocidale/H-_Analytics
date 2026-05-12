/**
 * Shared LLM dispatch helper.
 *
 * Centralizes the vendor branching (anthropic / openai / google-gemini)
 * that every "single-prompt LLM call" route used to repeat inline. Two
 * surfaces:
 *
 *   - `generateText({ llm, prompt, system?, maxTokens })`
 *       Single-shot completion. Returns the raw text, vendor-reported
 *       token counts (with length/4 fallbacks when usage is missing),
 *       and the cost-logger service tag.
 *
 *   - `streamText({ llm, prompt, system?, maxTokens })`
 *       Async iterable of text deltas. Use for SSE-style routes that
 *       forward chunks to the client.
 *
 * Both accept the `{ vendor, model }` shape produced by either
 * `resolveLlm` (research-config) or `resolveLlmFor` (admin-resources
 * `llm_slot` rows). Vendor strings: "anthropic" | "openai" | "google".
 * The helper does not trim — callers preserve their existing trim/slice
 * behavior so refactoring is byte-equivalent.
 */
import { getAnthropicClient, getGeminiClient, getOpenAIClient } from "./clients";

export type DispatchService = "anthropic" | "openai" | "gemini";

export interface DispatchLlm {
  /** "anthropic" | "openai" | "google" — anything else routes to OpenAI. */
  vendor: string;
  model: string;
}

export interface DispatchInput {
  llm: DispatchLlm;
  prompt: string;
  system?: string;
  maxTokens: number;
}

export interface GenerateTextResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  service: DispatchService;
}

export function dispatchService(vendor: string): DispatchService {
  if (vendor === "anthropic") return "anthropic";
  if (vendor === "google") return "gemini";
  return "openai";
}

function approxTokens(s: string): number {
  return Math.round(s.length / 4);
}

export async function generateText(input: DispatchInput): Promise<GenerateTextResult> {
  const { llm, prompt, system, maxTokens } = input;
  const service = dispatchService(llm.vendor);

  if (service === "anthropic") {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: llm.model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    return {
      text,
      inputTokens: response.usage?.input_tokens ?? approxTokens(prompt),
      outputTokens: response.usage?.output_tokens ?? approxTokens(text),
      service,
    };
  }

  if (service === "openai") {
    const client = getOpenAIClient();
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const completion = await client.chat.completions.create({
      model: llm.model,
      max_tokens: maxTokens,
      messages,
    });
    const text = completion.choices[0]?.message?.content ?? "";
    return {
      text,
      inputTokens: completion.usage?.prompt_tokens ?? approxTokens(prompt),
      outputTokens: completion.usage?.completion_tokens ?? approxTokens(text),
      service,
    };
  }

  // gemini — no native system role; prepend it to the user content so
  // every caller gets the same behavior whether or not a system prompt
  // is provided.
  const gemini = getGeminiClient();
  const combined = system ? `${system}\n\n${prompt}` : prompt;
  const response = await gemini.models.generateContent({
    model: llm.model,
    contents: [{ role: "user", parts: [{ text: combined }] }],
    config: { maxOutputTokens: maxTokens },
  });
  const text = response.text ?? "";
  return {
    text,
    inputTokens: response.usageMetadata?.promptTokenCount ?? approxTokens(prompt),
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? approxTokens(text),
    service,
  };
}

/**
 * Yields text deltas as they arrive from the vendor stream. Callers are
 * responsible for SSE framing, accumulation, and cost logging — the
 * helper only emits the raw text fragments.
 */
export async function* streamText(input: DispatchInput): AsyncIterable<string> {
  const { llm, prompt, system, maxTokens } = input;
  const service = dispatchService(llm.vendor);

  if (service === "anthropic") {
    const client = getAnthropicClient();
    const stream = client.messages.stream({
      model: llm.model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
    return;
  }

  if (service === "openai") {
    const client = getOpenAIClient();
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const stream = await client.chat.completions.create({
      model: llm.model,
      stream: true,
      max_tokens: maxTokens,
      messages,
    });
    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) yield content;
    }
    return;
  }

  const gemini = getGeminiClient();
  const combined = system ? `${system}\n\n${prompt}` : prompt;
  const stream = await gemini.models.generateContentStream({
    model: llm.model,
    contents: [{ role: "user", parts: [{ text: combined }] }],
    config: { maxOutputTokens: maxTokens },
  });
  for await (const chunk of stream) {
    const content = chunk.text;
    if (content) yield content;
  }
}
