import {
  getAnthropicClient,
  getOpenAIClient,
  getGeminiClient,
  normalizeModelId,
} from "../../ai/clients";
import {
  createResearchClient,
  resolveVendorFromModel,
  type ResearchClient,
} from "../../ai/research-client";
import { DEFAULT_RESEARCH_MODEL } from "../../ai/resolve-llm";
import {
  DEFAULT_RESEARCH_EVENT_CONFIG,
} from "../../../shared/constants";
import type {
  GlobalAssumptions,
  ResearchConfig,
  ResearchEventConfig,
  LlmVendor,
  ContextLlmConfig,
} from "@shared/schema";

export interface ResolvedLlmConfig {
  model: string;
  secondaryModel: string | undefined;
  vendorKey: "openai" | "anthropic" | "google";
  researchClient: ResearchClient;
  eventConfig: ResearchEventConfig;
}

/**
 * Resolves the per-research-type LLM model + vendor + research client and
 * merges the admin-configured event config (sources, custom sources) on top
 * of the defaults. No I/O — pure computation.
 */
export function resolveLlmConfig(
  ga: GlobalAssumptions | undefined,
  type: "property" | "company" | "global",
): ResolvedLlmConfig {
  const researchConfig = (ga?.researchConfig as ResearchConfig) ?? {};
  const contextKey =
    type === "property"
      ? "propertyLlm"
      : type === "global"
        ? "marketLlm"
        : "companyLlm";
  const contextLlm = researchConfig[contextKey as keyof ResearchConfig] as
    | ContextLlmConfig
    | undefined;
  const model = normalizeModelId(
    contextLlm?.primaryLlm ||
      researchConfig.preferredLlm ||
      ga?.preferredLlm ||
      DEFAULT_RESEARCH_MODEL,
  );
  const secondaryModel =
    contextLlm?.llmMode === "dual" && contextLlm.secondaryLlm
      ? normalizeModelId(contextLlm.secondaryLlm)
      : undefined;

  const configuredVendor = (contextLlm?.llmVendor || "anthropic") as LlmVendor;
  const vendorKey = (
    ["openai", "anthropic", "google"].includes(configuredVendor)
      ? configuredVendor
      : resolveVendorFromModel(model)
  ) as "openai" | "anthropic" | "google";

  const researchClient = createResearchClient(vendorKey, {
    anthropic: vendorKey === "anthropic" ? getAnthropicClient() : undefined,
    openai: vendorKey === "openai" ? getOpenAIClient() : undefined,
    gemini: vendorKey === "google" ? getGeminiClient() : undefined,
  });

  const rawEventConfig =
    researchConfig[type as "property" | "company" | "global"];
  const eventConfig: ResearchEventConfig = {
    ...DEFAULT_RESEARCH_EVENT_CONFIG,
    ...(rawEventConfig ?? {}),
  };

  const sourceEntries = eventConfig.sources ?? [];
  if (type === "company") {
    const companySrc = researchConfig.companySources ?? [];
    sourceEntries.push(...companySrc);
  }
  if (sourceEntries.length > 0) {
    eventConfig.customSources = sourceEntries.map((s) => ({
      name: s.label,
      url: s.url,
      category: s.category || "General",
    }));
  }

  return { model, secondaryModel, vendorKey, researchClient, eventConfig };
}
