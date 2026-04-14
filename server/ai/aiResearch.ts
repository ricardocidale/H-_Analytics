// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type Anthropic from "@anthropic-ai/sdk";
import { loadSkill, loadToolDefinitions, validateSkillFolders } from "./research-resources.js";
import { buildUserPrompt } from "./research-prompt-builders.js";
import { handleToolCall } from "./research-tool-prompts.js";
import type { ResearchClient } from "./research-client.js";

export type { ResearchParams } from "./research-prompt-builders.js";

validateSkillFolders();

export async function* generateResearchWithToolsStream(
  params: Parameters<typeof buildUserPrompt>[0],
  client: ResearchClient,
  model: string,
  secondaryModel?: string,
  v2Prompt?: string,
): AsyncGenerator<{ type: "content" | "done" | "error"; data: string }> {
  const systemPrompt = loadSkill(params.type);
  const allTools = loadToolDefinitions();
  const enabledTools = params.eventConfig?.enabledTools ?? [];
  const filteredTools = enabledTools.length > 0
    ? allTools.filter((t) => enabledTools.includes(t.name))
    : allTools;
  const tools = filteredTools.length > 0 ? filteredTools : allTools;
  const userPrompt = v2Prompt ?? await buildUserPrompt(params);

  let messages: unknown[] = [
    { role: "user", content: userPrompt }
  ];

  const maxIterations = 10;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    const activeModel = iteration === 1 ? model : (secondaryModel || model);

    const response = await client.createMessage({
      model: activeModel,
      maxTokens: 16000,
      system: systemPrompt,
      messages,
      tools: params.type === "property" ? tools : undefined,
      toolChoice: params.type === "property" ? "auto" : undefined,
    });

    for (const text of response.textBlocks) {
      yield { type: "content", data: text };
    }

    if (response.toolCalls.length === 0 || response.stopReason === "end_turn") {
      break;
    }

    const results = await Promise.all(
      response.toolCalls.map((tc) => handleToolCall(tc.name, tc.input))
    );

    const newMessages = client.buildToolResultMessage(
      response.rawAssistantContent,
      response.toolCalls,
      results,
    );
    messages.push(...newMessages);
  }

  yield { type: "done", data: "" };
}

export async function generateResearchWithTools(
  params: Parameters<typeof buildUserPrompt>[0],
  client: ResearchClient,
  model: string,
  secondaryModel?: string,
  v2Prompt?: string,
): Promise<Record<string, any>> {
  let fullText = "";

  for await (const chunk of generateResearchWithToolsStream(params, client, model, secondaryModel, v2Prompt)) {
    if (chunk.type === "content") {
      fullText += chunk.data;
    }
  }

  return parseResearchJSON(fullText);
}

export function parseResearchJSON(fullText: string): Record<string, any> {
  try {
    const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/) ||
                      fullText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonStr);
    }
    return { rawResponse: fullText };
  } catch {
    return { rawResponse: fullText };
  }
}

export { loadSkill, loadToolDefinitions, buildUserPrompt, handleToolCall };
export { extractResearchValues } from "./research-value-extractor.js";
