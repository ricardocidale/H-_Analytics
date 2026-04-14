import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import type { GoogleGenAI } from "@google/genai";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ResearchResponse {
  textBlocks: string[];
  toolCalls: ToolCall[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  rawAssistantContent: unknown;
}

export interface ResearchClient {
  createMessage(params: {
    model: string;
    maxTokens: number;
    system: string;
    messages: unknown[];
    tools?: Anthropic.Tool[];
    toolChoice?: "auto" | "none";
  }): Promise<ResearchResponse>;

  buildToolResultMessage(
    rawAssistant: unknown,
    toolCalls: ToolCall[],
    results: string[],
  ): unknown[];

  convertTools(tools: Anthropic.Tool[]): unknown[];
}

const ADAPTIVE_THINKING_MODELS = new Set(["claude-sonnet-4-6", "claude-opus-4-6"]);

export class AnthropicResearchClient implements ResearchClient {
  constructor(private client: Anthropic) {}

  async createMessage(params: {
    model: string;
    maxTokens: number;
    system: string;
    messages: unknown[];
    tools?: Anthropic.Tool[];
    toolChoice?: "auto" | "none";
  }): Promise<ResearchResponse> {
    const useThinking = ADAPTIVE_THINKING_MODELS.has(params.model);
    const response = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
      messages: params.messages as Anthropic.MessageParam[],
      tools: params.tools,
      tool_choice: params.tools ? { type: params.toolChoice ?? "auto" } : undefined,
      ...(useThinking && { thinking: { type: "adaptive" } }),
    });

    const textBlocks = response.content
      .filter((b): b is Anthropic.ContentBlock & { type: "text" } => b.type === "text")
      .map((b) => b.text)
      .filter(Boolean);

    const toolCalls = response.content
      .filter((b): b is Anthropic.ContentBlock & { type: "tool_use" } => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, any> }));

    const stopReason = toolCalls.length > 0 && response.stop_reason !== "end_turn" ? "tool_use" : "end_turn";

    return { textBlocks, toolCalls, stopReason, rawAssistantContent: response.content };
  }

  buildToolResultMessage(
    rawAssistant: unknown,
    toolCalls: ToolCall[],
    results: string[],
  ): unknown[] {
    const toolResults: Anthropic.ToolResultBlockParam[] = toolCalls.map((tc, i) => ({
      type: "tool_result" as const,
      tool_use_id: tc.id,
      content: results[i],
    }));
    return [
      { role: "assistant", content: rawAssistant },
      { role: "user", content: toolResults },
    ];
  }

  convertTools(tools: Anthropic.Tool[]): Anthropic.Tool[] {
    return tools;
  }
}

export class OpenAIResearchClient implements ResearchClient {
  constructor(private client: OpenAI) {}

  async createMessage(params: {
    model: string;
    maxTokens: number;
    system: string;
    messages: unknown[];
    tools?: Anthropic.Tool[];
    toolChoice?: "auto" | "none";
  }): Promise<ResearchResponse> {
    const oaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: params.system },
      ...(params.messages as OpenAI.ChatCompletionMessageParam[]),
    ];

    const oaiTools = params.tools ? this.convertTools(params.tools) : undefined;

    const response = await this.client.chat.completions.create({
      model: params.model,
      max_tokens: params.maxTokens,
      messages: oaiMessages,
      tools: oaiTools as OpenAI.ChatCompletionTool[] | undefined,
      tool_choice: oaiTools ? (params.toolChoice ?? "auto") : undefined,
    });

    const choice = response.choices[0];
    const message = choice.message;

    const textBlocks = message.content ? [message.content] : [];
    const rawToolCalls = message.tool_calls ?? [];
    const toolCalls: ToolCall[] = rawToolCalls.map((tc: any) => {
      let input: Record<string, any> = {};
      try {
        input = JSON.parse(tc.function.arguments);
      } catch {
        // Model returned malformed JSON for tool arguments — pass empty object
        input = { _parseError: true, rawArguments: String(tc.function.arguments).slice(0, 500) };
      }
      return { id: tc.id, name: tc.function.name, input };
    });

    const stopReason = choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn";

    return { textBlocks, toolCalls, stopReason, rawAssistantContent: message };
  }

  buildToolResultMessage(
    rawAssistant: unknown,
    toolCalls: ToolCall[],
    results: string[],
  ): unknown[] {
    const msg = rawAssistant as OpenAI.ChatCompletionMessage;
    const out: OpenAI.ChatCompletionMessageParam[] = [
      { role: "assistant", content: msg.content, tool_calls: msg.tool_calls },
    ];
    for (let i = 0; i < toolCalls.length; i++) {
      out.push({ role: "tool", tool_call_id: toolCalls[i].id, content: results[i] });
    }
    return out;
  }

  convertTools(tools: Anthropic.Tool[]): unknown[] {
    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }
}

export class GeminiResearchClient implements ResearchClient {
  constructor(private client: GoogleGenAI) {}

  async createMessage(params: {
    model: string;
    maxTokens: number;
    system: string;
    messages: unknown[];
    tools?: Anthropic.Tool[];
    toolChoice?: "auto" | "none";
  }): Promise<ResearchResponse> {
    const geminiTools = params.tools ? this.convertTools(params.tools) : undefined;

    const contents = (params.messages as GeminiContent[]).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: Array.isArray(m.parts) ? m.parts : [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
    }));

    const response = await this.client.models.generateContent({
      model: params.model,
      contents,
      config: {
        maxOutputTokens: params.maxTokens,
        systemInstruction: params.system,
        tools: geminiTools as any,
      },
    });

    const candidates = response.candidates ?? [];
    const parts = candidates[0]?.content?.parts ?? [];

    const textBlocks = parts
      .filter((p: any) => p.text)
      .map((p: any) => p.text as string);

    const toolCalls: ToolCall[] = parts
      .filter((p: any) => p.functionCall)
      .map((p: any, i: number) => ({
        id: `gemini-tool-${i}-${Date.now()}`,
        name: p.functionCall.name,
        input: p.functionCall.args ?? {},
      }));

    const stopReason = toolCalls.length > 0 ? "tool_use" : "end_turn";

    return { textBlocks, toolCalls, stopReason, rawAssistantContent: candidates[0]?.content };
  }

  buildToolResultMessage(
    rawAssistant: unknown,
    toolCalls: ToolCall[],
    results: string[],
  ): unknown[] {
    const assistantContent = rawAssistant as GeminiContent;
    const functionResponses = toolCalls.map((tc, i) => ({
      text: undefined,
      functionCall: undefined,
      functionResponse: {
        name: tc.name,
        response: { result: results[i] },
      },
    }));

    return [
      { role: "assistant", parts: assistantContent?.parts ?? [] },
      { role: "user", parts: functionResponses },
    ];
  }

  convertTools(tools: Anthropic.Tool[]): unknown[] {
    const declarations = tools.map((t) => {
      const params = { ...t.input_schema };
      delete (params as any).additionalProperties;
      return {
        name: t.name,
        description: t.description,
        parameters: params,
      };
    });
    return [{ functionDeclarations: declarations }];
  }
}

interface GeminiContent {
  role: string;
  parts?: any[];
  content?: string;
}

export type LlmVendorKey = "anthropic" | "openai" | "google";

export function createResearchClient(
  vendor: LlmVendorKey,
  clients: {
    anthropic?: Anthropic;
    openai?: OpenAI;
    gemini?: GoogleGenAI;
  },
): ResearchClient {
  switch (vendor) {
    case "anthropic": {
      if (!clients.anthropic) throw new Error("Anthropic client not available");
      return new AnthropicResearchClient(clients.anthropic);
    }
    case "openai": {
      if (!clients.openai) throw new Error("OpenAI client not available");
      return new OpenAIResearchClient(clients.openai);
    }
    case "google": {
      if (!clients.gemini) throw new Error("Gemini client not available");
      return new GeminiResearchClient(clients.gemini);
    }
    default:
      throw new Error(`Unsupported research vendor: ${vendor}`);
  }
}

export function resolveVendorFromModel(model: string): LlmVendorKey {
  if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3") || model.startsWith("o4")) return "openai";
  if (model.startsWith("gemini")) return "google";
  return "anthropic";
}
