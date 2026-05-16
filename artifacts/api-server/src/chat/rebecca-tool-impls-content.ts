import { storage } from "../storage";
import { requireNumericArg } from "./rebecca-tool-types";
import type { DataChangedEntry, ToolContext } from "./rebecca-tool-types";
import { MAX_REWRITE_DESCRIPTION_CHARS, REWRITE_DESCRIPTION_MAX_TOKENS } from "@shared/constants";
import {
  generatePropertyExecutiveSummary,
  formatPropertySummaryAsText,
} from "../ai/executive-summary";
import { invalidatePropertySummaryCache } from "../routes/executive-summary";
import { resolveLlm } from "../ai/resolve-llm";
import { generateText } from "../ai/dispatch";

export async function toolGenerateExecutiveSummary(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "propertyId");
  if (!idResult.ok) return idResult.result;
  const propertyId = idResult.value;

  const property = await storage.getProperty(propertyId);
  if (!property || property.userId !== ctx.userId) {
    return { result: { error: "Property not found" } };
  }

  invalidatePropertySummaryCache(propertyId);

  let guidanceRecords: unknown[] = [];
  try {
    guidanceRecords = await storage.getAssumptionGuidance(null, "property", propertyId);
  } catch {
    // No guidance available — proceed without it
  }

  const summary = await generatePropertyExecutiveSummary(
    property,
    guidanceRecords as Parameters<typeof generatePropertyExecutiveSummary>[1],
    { includeLLM: true },
  );

  return {
    result: {
      summary,
      text: formatPropertySummaryAsText(summary),
    },
  };
}

export async function toolRewritePropertyDescription(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const idResult = requireNumericArg(args, "propertyId");
  if (!idResult.ok) return idResult.result;
  const propertyId = idResult.value;

  const text = args.text as string | undefined;
  if (!text?.trim()) return { result: { error: "text is required" } };
  if (text.length > MAX_REWRITE_DESCRIPTION_CHARS) return { result: { error: `text must be ${MAX_REWRITE_DESCRIPTION_CHARS} characters or fewer` } };

  const property = await storage.getProperty(propertyId);
  if (!property || property.userId !== ctx.userId) {
    return { result: { error: "Property not found" } };
  }

  const context = [
    property.name && `Property: ${property.name}`,
    property.location && `Location: ${property.location}`,
    property.roomCount && `Rooms: ${property.roomCount}`,
  ].filter(Boolean).join(". ");

  const prompt = `You are a professional hospitality real estate copywriter. Rewrite the following property description to be polished, compelling, and professional. Keep the same factual content but improve clarity, flow, and appeal. Write in third person. Keep it concise — two to three short paragraphs maximum. Do not add fictional details — only enhance what is provided.

${context ? `Context: ${context}\n\n` : ""}Original description:
${text}

Rewritten description:`;

  const ga = await storage.getGlobalAssumptions(ctx.userId);
  const rc = (ga?.researchConfig as Record<string, unknown>) ?? {};
  const resolved = resolveLlm(rc, "aiUtilityLlm");

  const { text: raw } = await generateText({ llm: resolved, prompt, maxTokens: REWRITE_DESCRIPTION_MAX_TOKENS });
  const rewritten = raw.trim();

  if (!rewritten) return { result: { error: "No response from AI" } };

  return { result: { rewritten } };
}
