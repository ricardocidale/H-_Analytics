export interface ToolParam {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens";

export interface LlmResult {
  text: string;
  toolCalls?: ToolCall[];
  stopReason?: StopReason;
}
