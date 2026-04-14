import type { ResearchConfig, ContextLlmConfig, LlmVendor } from "@shared/schema";
import { normalizeModelId, getGeminiClient, getAnthropicClient, getOpenAIClient } from "./clients";

export type LlmDomain =
  | "companyLlm"
  | "propertyLlm"
  | "marketLlm"
  | "reportLlm"
  | "chatbotLlm"
  | "premiumExportLlm"
  | "aiUtilityLlm"
  | "graphicsLlm";

export { DEFAULT_ANTHROPIC_MODEL } from "@shared/constants";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_OPENAI_MODEL = "gpt-4.1";
export const DEFAULT_RESEARCH_MODEL = "claude-sonnet-4-6";

const DOMAIN_DEFAULTS: Record<LlmDomain, { vendor: LlmVendor; model: string }> = {
  companyLlm:        { vendor: "google",    model: DEFAULT_GEMINI_MODEL },
  propertyLlm:       { vendor: "google",    model: DEFAULT_GEMINI_MODEL },
  marketLlm:         { vendor: "google",    model: DEFAULT_GEMINI_MODEL },
  reportLlm:         { vendor: "google",    model: DEFAULT_GEMINI_MODEL },
  chatbotLlm:        { vendor: "google",    model: DEFAULT_GEMINI_MODEL },
  premiumExportLlm:  { vendor: "google",    model: DEFAULT_GEMINI_MODEL },
  aiUtilityLlm:      { vendor: "google",    model: DEFAULT_GEMINI_MODEL },
  graphicsLlm:       { vendor: "openai",    model: "gpt-image-1" },
};

const DOMAIN_TAB: Record<LlmDomain, string> = {
  companyLlm:       "research",
  propertyLlm:      "research",
  marketLlm:        "research",
  reportLlm:        "research",
  chatbotLlm:       "assistants",
  premiumExportLlm: "exports",
  aiUtilityLlm:     "operations",
  graphicsLlm:      "operations",
};

export interface ResolvedLlm {
  vendor: LlmVendor;
  model: string;
  secondaryVendor?: LlmVendor;
  secondaryModel?: string;
  isDual: boolean;
}

export function resolveLlm(
  researchConfig: ResearchConfig | undefined | null,
  domain: LlmDomain
): ResolvedLlm {
  const cfg = researchConfig?.[domain] as ContextLlmConfig | undefined;
  const tabKey = DOMAIN_TAB[domain];
  const tabDef = researchConfig?.tabDefaults?.[tabKey];
  const defaults = DOMAIN_DEFAULTS[domain];

  const vendor: LlmVendor = cfg?.llmVendor || (tabDef?.llmVendor as LlmVendor | undefined) || defaults.vendor;
  const model = normalizeModelId(cfg?.primaryLlm || tabDef?.primaryLlm || defaults.model);
  const isDual = cfg?.llmMode === "dual" && !!cfg.secondaryLlm;
  const secondaryVendor = isDual ? (cfg!.secondaryLlmVendor || vendor) : undefined;
  const secondaryModel = isDual ? normalizeModelId(cfg!.secondaryLlm!) : undefined;

  return { vendor, model, secondaryVendor, secondaryModel, isDual };
}

export function getVendorService(vendor: LlmVendor): "gemini" | "anthropic" | "openai" {
  if (vendor === "google") return "gemini";
  if (vendor === "anthropic") return "anthropic";
  return "openai";
}

export interface LlmVendorStatus {
  vendor: string;
  available: boolean;
  reason?: string;
}

export function checkVendorAvailability(): LlmVendorStatus[] {
  const results: LlmVendorStatus[] = [];

  try {
    getGeminiClient();
    results.push({ vendor: "google", available: true });
  } catch (err: unknown) {
    results.push({ vendor: "google", available: false, reason: err instanceof Error ? err.message : "Unknown error" });
  }

  try {
    getAnthropicClient();
    results.push({ vendor: "anthropic", available: true });
  } catch (err: unknown) {
    results.push({ vendor: "anthropic", available: false, reason: err instanceof Error ? err.message : "Unknown error" });
  }

  try {
    getOpenAIClient();
    results.push({ vendor: "openai", available: true });
  } catch (err: unknown) {
    results.push({ vendor: "openai", available: false, reason: err instanceof Error ? err.message : "Unknown error" });
  }

  return results;
}

export function getRecommendedDefaults(): { vendor: LlmVendor; model: string } {
  const vendors = checkVendorAvailability();
  const gemini = vendors.find(v => v.vendor === "google");
  const anthropic = vendors.find(v => v.vendor === "anthropic");
  const openai = vendors.find(v => v.vendor === "openai");

  if (gemini?.available) return { vendor: "google", model: DEFAULT_GEMINI_MODEL };
  if (anthropic?.available) return { vendor: "anthropic", model: DEFAULT_RESEARCH_MODEL };
  if (openai?.available) return { vendor: "openai", model: DEFAULT_OPENAI_MODEL };

  return DOMAIN_DEFAULTS.propertyLlm;
}
