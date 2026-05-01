import type { ProbedModel, ProbeResult } from "./llm-health-probe";
import type { ResearchConfig, ContextLlmConfig, LlmVendor, InsertGlobalAssumptions } from "@shared/schema";
import type { LlmDomain } from "./resolve-llm";
import { storage } from "../storage";
import { log } from "../logger";

export type LlmFunction =
  | "research-deep"
  | "research-fast"
  | "chat"
  | "exports"
  | "operations";

export interface ModelRecommendation {
  function: LlmFunction;
  vendor: LlmVendor;
  modelId: string;
  label: string;
  score: number;
  reasoning: string;
}

interface ModelScore {
  model: ProbedModel;
  score: number;
  reasoning: string;
}

const FUNCTION_TO_DOMAINS: Record<LlmFunction, LlmDomain[]> = {
  "research-deep": ["companyLlm", "propertyLlm", "marketLlm"],
  "research-fast": ["reportLlm"],
  "chat": ["chatbotLlm"],
  "exports": ["premiumExportLlm"],
  "operations": ["aiUtilityLlm"],
};

const FUNCTION_REQUIRED_CAPS: Record<LlmFunction, string[]> = {
  "research-deep": ["reasoning", "synthesis"],
  "research-fast": ["fast", "chat"],
  "chat": ["chat"],
  "exports": ["reasoning", "chat"],
  "operations": ["chat"],
};

const VENDOR_COST_TIER: Record<string, number> = {
  google: 1,
  deepseek: 2,
  openai: 3,
  xai: 3,
  anthropic: 4,
};

function scoreModel(model: ProbedModel, fn: LlmFunction): ModelScore {
  if (model.status !== "available") {
    return { model, score: 0, reasoning: `Model ${model.modelId} is ${model.status}` };
  }

  let score = 0;
  const reasons: string[] = [];

  score += 40;
  reasons.push("available (+40)");

  const requiredCaps = FUNCTION_REQUIRED_CAPS[fn];
  const matchedCaps = requiredCaps.filter(c => model.capabilities.includes(c));
  const capScore = (matchedCaps.length / Math.max(requiredCaps.length, 1)) * 30;
  score += capScore;
  if (matchedCaps.length > 0) reasons.push(`capabilities ${matchedCaps.join(",")} (+${capScore.toFixed(0)})`);

  if (model.latencyMs !== null) {
    const latencyScore = Math.max(0, 15 - (model.latencyMs / 500) * 15);
    score += latencyScore;
    if (latencyScore > 0) reasons.push(`latency ${model.latencyMs}ms (+${latencyScore.toFixed(0)})`);
  }

  const costTier = VENDOR_COST_TIER[model.vendor] ?? 3;
  const costScore = Math.max(0, 15 - (costTier - 1) * 5);
  score += costScore;
  reasons.push(`cost tier ${costTier} (+${costScore.toFixed(0)})`);

  return { model, score, reasoning: reasons.join("; ") };
}

export function computeRecommendations(probeResult: ProbeResult): ModelRecommendation[] {
  const available = probeResult.models.filter(m => m.status === "available");
  if (available.length === 0) return [];

  const functions: LlmFunction[] = ["research-deep", "research-fast", "chat", "exports", "operations"];
  const recommendations: ModelRecommendation[] = [];

  for (const fn of functions) {
    const scored = available
      .map(m => scoreModel(m, fn))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best && best.score > 0) {
      recommendations.push({
        function: fn,
        vendor: best.model.vendor,
        modelId: best.model.modelId,
        label: best.model.label,
        score: best.score,
        reasoning: best.reasoning,
      });
    }
  }

  return recommendations;
}

function hasAdminOverride(config: ResearchConfig, domain: LlmDomain): boolean {
  const ctx = (config as Record<string, unknown>)[domain] as ContextLlmConfig | undefined;
  return !!(ctx?.llmVendor && ctx?.primaryLlm);
}

export interface AdminOverrideIssue {
  domain: LlmDomain;
  currentVendor: LlmVendor;
  currentModel: string;
  issue: "model_unavailable" | "vendor_down";
  recommendation: ModelRecommendation | null;
  message: string;
}

export function detectAdminOverrideIssues(
  config: ResearchConfig,
  probeResult: ProbeResult,
  recommendations: ModelRecommendation[]
): AdminOverrideIssue[] {
  const issues: AdminOverrideIssue[] = [];
  const allDomains: LlmDomain[] = [
    "companyLlm", "propertyLlm", "marketLlm", "reportLlm",
    "chatbotLlm", "premiumExportLlm", "aiUtilityLlm",
  ];

  for (const domain of allDomains) {
    if (!hasAdminOverride(config, domain)) continue;

    const ctx = (config as Record<string, unknown>)[domain] as ContextLlmConfig;
    const vendor = ctx.llmVendor!;
    const model = ctx.primaryLlm!;

    const vendorStatus = probeResult.vendorStatuses.find(v => v.vendor === vendor);
    if (vendorStatus && !vendorStatus.available) {
      const fn = domainToFunction(domain);
      const rec = fn ? recommendations.find(r => r.function === fn) ?? null : null;
      issues.push({
        domain,
        currentVendor: vendor,
        currentModel: model,
        issue: "vendor_down",
        recommendation: rec,
        message: `${formatVendorName(vendor)} is currently unavailable (${vendorStatus.error || "connection failed"}). The ${formatDomainName(domain)} is configured to use ${model} which cannot be reached.`,
      });
      continue;
    }

    const modelFound = probeResult.models.some(
      m => m.vendor === vendor && m.modelId === model && m.status === "available"
    );
    if (!modelFound) {
      const fn = domainToFunction(domain);
      const rec = fn ? recommendations.find(r => r.function === fn) ?? null : null;
      issues.push({
        domain,
        currentVendor: vendor,
        currentModel: model,
        issue: "model_unavailable",
        recommendation: rec,
        message: `Model "${model}" from ${formatVendorName(vendor)} is no longer available for ${formatDomainName(domain)}. It may have been deprecated or renamed.`,
      });
    }
  }

  return issues;
}

function domainToFunction(domain: LlmDomain): LlmFunction | null {
  for (const [fn, domains] of Object.entries(FUNCTION_TO_DOMAINS)) {
    if (domains.includes(domain)) return fn as LlmFunction;
  }
  return null;
}

function formatVendorName(vendor: string): string {
  const names: Record<string, string> = {
    openai: "OpenAI", anthropic: "Anthropic", google: "Google Gemini",
    xai: "xAI", deepseek: "DeepSeek",
  };
  return names[vendor] ?? vendor;
}

function formatDomainName(domain: LlmDomain): string {
  const names: Record<LlmDomain, string> = {
    companyLlm: "Management Company Research",
    propertyLlm: "Property Research",
    marketLlm: "Market & Industry Research",
    reportLlm: "Report Generation",
    chatbotLlm: "Rebecca Chat",
    premiumExportLlm: "Premium Exports",
    aiUtilityLlm: "AI Utility Tasks",
    graphicsLlm: "Graphics Generation",
  };
  return names[domain] ?? domain;
}

export async function applyRecommendations(
  recommendations: ModelRecommendation[],
  probeResult: ProbeResult
): Promise<{ applied: string[]; skipped: string[] }> {
  const ga = await storage.getGlobalAssumptions();
  if (!ga) return { applied: [], skipped: ["No global assumptions found"] };

  const config: ResearchConfig = (ga.researchConfig as ResearchConfig) ?? {};
  const applied: string[] = [];
  const skipped: string[] = [];

  const cachedModels = probeResult.models
    .filter(m => m.status === "available")
    .map(m => ({ id: m.modelId, label: m.label, provider: m.vendor }));

  const updatedConfig: ResearchConfig = {
    ...config,
    cachedModels,
    cachedModelsAt: new Date().toISOString(),
  };

  const appliedTabs = new Set<string>();

  for (const rec of recommendations) {
    const domains = FUNCTION_TO_DOMAINS[rec.function];
    for (const domain of domains) {
      if (hasAdminOverride(config, domain)) {
        skipped.push(`${domain}: admin override preserved (${(config as Record<string, ContextLlmConfig>)[domain]?.primaryLlm})`);
        continue;
      }

      const tabKey = getTabKey(domain);
      if (!tabKey) continue;

      if (config.tabDefaults?.[tabKey]?.primaryLlm) {
        skipped.push(`tabDefault[${tabKey}]: admin override preserved`);
        continue;
      }

      if (appliedTabs.has(tabKey)) {
        skipped.push(`tabDefault[${tabKey}]: already set by higher-priority function`);
        continue;
      }

      if (!updatedConfig.tabDefaults) updatedConfig.tabDefaults = {};
      updatedConfig.tabDefaults[tabKey] = {
        llmVendor: rec.vendor,
        primaryLlm: rec.modelId,
      };
      appliedTabs.add(tabKey);
      applied.push(`tabDefault[${tabKey}] → ${rec.vendor}/${rec.modelId} (auto-recommended)`);
    }
  }

  await storage.upsertGlobalAssumptions({
    researchConfig: updatedConfig,
  } as InsertGlobalAssumptions);

  if (applied.length > 0) {
    log(`Applied ${applied.length} LLM recommendations: ${applied.join("; ")}`, "llm-recommender");
  }
  if (skipped.length > 0) {
    log(`Skipped ${skipped.length} domains (admin overrides): ${skipped.slice(0, 3).join("; ")}`, "llm-recommender");
  }

  return { applied, skipped };
}

function getTabKey(domain: LlmDomain): string | null {
  const map: Record<LlmDomain, string> = {
    companyLlm: "research",
    propertyLlm: "research",
    marketLlm: "research",
    reportLlm: "research",
    chatbotLlm: "assistants",
    premiumExportLlm: "exports",
    aiUtilityLlm: "operations",
    graphicsLlm: "operations",
  };
  return map[domain] ?? null;
}

export interface LlmRegistryState {
  models: ProbedModel[];
  recommendations: ModelRecommendation[];
  adminIssues: AdminOverrideIssue[];
  vendorStatuses: ProbeResult["vendorStatuses"];
  probedAt: string;
  durationMs: number;
}

let _lastState: LlmRegistryState | null = null;

export function getLastRegistryState(): LlmRegistryState | null {
  return _lastState;
}

export function setLastRegistryState(state: LlmRegistryState): void {
  _lastState = state;
}
