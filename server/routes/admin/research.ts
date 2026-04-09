import { type Express } from "express";
import { z } from "zod";
import { getOpenAIClient, getAnthropicClient, getGeminiClient as getGeminiSingleton } from "../../ai/clients";
import { storage } from "../../storage";
import { requireAdmin, isApiRateLimited , getAuthUser } from "../../auth";
import { type InsertGlobalAssumptions, type ResearchConfig, type ContextLlmConfig, type AiModelEntry } from "@shared/schema";
import { logAndSendError, logActivity } from "../helpers";
import { logger } from "../../logger";

const researchSourceEntrySchema = z.object({
  id: z.string(),
  url: z.string(),
  label: z.string(),
  category: z.string().optional(),
  addedAt: z.string(),
});

const researchEventConfigSchema = z.object({
  enabled: z.boolean().optional(),
  focusAreas: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
  timeHorizon: z.string().optional(),
  customInstructions: z.string().optional(),
  customQuestions: z.string().optional(),
  enabledTools: z.array(z.string()).optional(),
  refreshIntervalDays: z.number().min(3).max(180).optional(),
  sources: z.array(researchSourceEntrySchema).optional(),
}).strict();

const customSourceSchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  category: z.string(),
});

const aiModelEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  provider: z.enum(["openai", "anthropic", "google", "xai", "tesla", "microsoft", "meta", "deepseek"]),
});

const llmVendorEnum = z.enum(["openai", "anthropic", "google", "xai", "tesla", "microsoft", "meta", "deepseek"]);

const contextLlmConfigSchema = z.object({
  llmVendor: llmVendorEnum.optional(),
  llmMode: z.enum(["dual", "primary-only"]).optional(),
  primaryLlm: z.string().optional(),
  secondaryLlmVendor: llmVendorEnum.optional(),
  secondaryLlm: z.string().optional(),
}).strict();

const researchConfigSchema = z.object({
  property: researchEventConfigSchema.optional(),
  company: researchEventConfigSchema.optional(),
  global: researchEventConfigSchema.optional(),
  marketing: researchEventConfigSchema.optional(),
  preferredLlm: z.string().optional(),
  llmMode: z.enum(["dual", "primary-only"]).optional(),
  llmVendor: llmVendorEnum.optional(),
  primaryLlm: z.string().optional(),
  secondaryLlm: z.string().optional(),
  customSources: z.array(customSourceSchema).optional(),
  cachedModels: z.array(aiModelEntrySchema).optional(),
  cachedModelsAt: z.string().optional(),
  companyLlm: contextLlmConfigSchema.optional(),
  propertyLlm: contextLlmConfigSchema.optional(),
  marketLlm: contextLlmConfigSchema.optional(),
  reportLlm: contextLlmConfigSchema.optional(),
  chatbotLlm: contextLlmConfigSchema.optional(),
  premiumExportLlm: contextLlmConfigSchema.optional(),
  aiUtilityLlm: contextLlmConfigSchema.optional(),
  graphicsLlm: contextLlmConfigSchema.optional(),
  tabDefaults: z.record(z.string(), z.object({
    llmVendor: llmVendorEnum.optional(),
    primaryLlm: z.string().optional(),
  }).strict()).optional(),
  companySources: z.array(researchSourceEntrySchema).optional(),
  propertySources: z.array(researchSourceEntrySchema).optional(),
  marketSources: z.array(researchSourceEntrySchema).optional(),
  sourceFiles: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["url", "file"]),
    url: z.string().optional(),
    filePath: z.string().optional(),
    fileSize: z.number().optional(),
    origin: z.literal("local").optional(),
    category: z.enum(["management-company", "properties", "general-marketing"]),
    addedAt: z.string(),
  })).optional(),
}).strict();

const CHAT_MODEL_PATTERNS: Record<string, RegExp[]> = {
  openai: [/^gpt-5/, /^gpt-4/, /^o\d/],
  anthropic: [/^claude-/],
  google: [/^gemini-/],
  xai: [/^grok-/],
  deepseek: [/^deepseek-/],
  meta: [/^llama-/, /^Llama-/],
};

const EXCLUDE_PATTERNS = [
  /embed/i, /tts/i, /whisper/i, /dall-e/i, /image/i, /moderation/i,
  /realtime/i, /audio/i, /computer-use/i, /search/i, /chatgpt/i,
  /instruct/i, /codex/i, /-\d{8}$/,
];

function shouldInclude(id: string, provider: string): boolean {
  const patterns = CHAT_MODEL_PATTERNS[provider] ?? [];
  if (!patterns.some(p => p.test(id))) return false;
  if (EXCLUDE_PATTERNS.some(p => p.test(id))) return false;
  return true;
}

function formatLabel(id: string, provider: string): string {
  const prefixMap: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google",
    xai: "xAI",
    deepseek: "DeepSeek",
    meta: "Meta",
    tesla: "Tesla",
    microsoft: "Microsoft",
  };
  const prefix = prefixMap[provider] ?? provider;
  const name = id
    .replace(/-/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/Gpt/g, "GPT")
    .replace(/^O(\d)/, "o$1")
    .replace(/Deepseek/g, "DeepSeek")
    .replace(/Llama/gi, "Llama");
  return `${prefix} ${name}`;
}

async function fetchOpenAIModels(): Promise<AiModelEntry[]> {
  try {
    const client = getOpenAIClient();
    const list = await client.models.list();
    const models: AiModelEntry[] = [];
    for await (const m of list) {
      if (shouldInclude(m.id, "openai")) {
        models.push({ id: m.id, label: formatLabel(m.id, "openai"), provider: "openai" });
      }
    }
    return models.sort((a, b) => a.id.localeCompare(b.id));
  } catch (e) {
    logger.error(`Failed to fetch OpenAI models: ${(e instanceof Error ? e.message : String(e))}`, "research");
    return [];
  }
}

async function fetchAnthropicModels(): Promise<AiModelEntry[]> {
  try {
    const client = getAnthropicClient();
    const resp = await client.models.list({ limit: 100 });
    const models: AiModelEntry[] = [];
    for (const m of resp.data) {
      if (shouldInclude(m.id, "anthropic")) {
        models.push({ id: m.id, label: formatLabel(m.id, "anthropic"), provider: "anthropic" });
      }
    }
    return models.sort((a, b) => a.id.localeCompare(b.id));
  } catch (e) {
    logger.error(`Failed to fetch Anthropic models: ${(e instanceof Error ? e.message : String(e))}`, "research");
    return [];
  }
}

async function fetchGeminiModels(): Promise<AiModelEntry[]> {
  try {
    const client = getGeminiSingleton();
    const pager = await client.models.list();
    const models: AiModelEntry[] = [];
    for await (const m of pager) {
      const id = ((m as any).name ?? "").replace("models/", "");
      if (shouldInclude(id, "google")) {
        models.push({ id, label: formatLabel(id, "google"), provider: "google" });
      }
    }
    return models.sort((a, b) => a.id.localeCompare(b.id));
  } catch (e) {
    logger.error(`Failed to fetch Gemini models: ${(e instanceof Error ? e.message : String(e))}`, "research");
    return [];
  }
}

async function fetchXaiModels(): Promise<AiModelEntry[]> {
  try {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return [];
    const res = await fetch("https://api.x.ai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`xAI API returned ${res.status}`);
    const body = await res.json() as { data: { id: string }[] };
    const models: AiModelEntry[] = [];
    for (const m of body.data) {
      if (shouldInclude(m.id, "xai")) {
        models.push({ id: m.id, label: formatLabel(m.id, "xai"), provider: "xai" });
      }
    }
    return models.sort((a, b) => a.id.localeCompare(b.id));
  } catch (e) {
    logger.error(`Failed to fetch xAI models: ${(e instanceof Error ? e.message : String(e))}`, "research");
    return [];
  }
}

async function fetchDeepSeekModels(): Promise<AiModelEntry[]> {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return [];
    const res = await fetch("https://api.deepseek.com/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`DeepSeek API returned ${res.status}`);
    const body = await res.json() as { data: { id: string }[] };
    const models: AiModelEntry[] = [];
    for (const m of body.data) {
      if (shouldInclude(m.id, "deepseek")) {
        models.push({ id: m.id, label: formatLabel(m.id, "deepseek"), provider: "deepseek" });
      }
    }
    return models.sort((a, b) => a.id.localeCompare(b.id));
  } catch (e) {
    logger.error(`Failed to fetch DeepSeek models: ${(e instanceof Error ? e.message : String(e))}`, "research");
    return [];
  }
}

async function fetchMetaModels(): Promise<AiModelEntry[]> {
  try {
    const apiKey = process.env.META_API_KEY;
    if (!apiKey) return [];
    const res = await fetch("https://api.llama.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Meta API returned ${res.status}`);
    const body = await res.json() as { data: { id: string }[] };
    const models: AiModelEntry[] = [];
    for (const m of body.data) {
      if (shouldInclude(m.id, "meta")) {
        models.push({ id: m.id, label: formatLabel(m.id, "meta"), provider: "meta" });
      }
    }
    return models.sort((a, b) => a.id.localeCompare(b.id));
  } catch (e) {
    logger.error(`Failed to fetch Meta models: ${(e instanceof Error ? e.message : String(e))}`, "research");
    return [];
  }
}

function normalizeServerResearchConfig(cfg: ResearchConfig): ResearchConfig {
  const out = { ...cfg };
  const globalCtx: ContextLlmConfig = {
    llmVendor: cfg.llmVendor,
    llmMode: cfg.llmMode,
    primaryLlm: cfg.primaryLlm || cfg.preferredLlm,
    secondaryLlm: cfg.secondaryLlm,
  };
  if (!out.companyLlm?.primaryLlm && globalCtx.primaryLlm) {
    out.companyLlm = { ...globalCtx, ...out.companyLlm };
  }
  if (!out.propertyLlm?.primaryLlm && globalCtx.primaryLlm) {
    out.propertyLlm = { ...globalCtx, ...out.propertyLlm };
  }
  if (!out.marketLlm?.primaryLlm && globalCtx.primaryLlm) {
    out.marketLlm = { ...globalCtx, ...out.marketLlm };
  }
  return out;
}

export function registerResearchConfigRoutes(app: Express) {
  app.get("/api/admin/research-config", requireAdmin, async (_req, res) => {
    try {
      const ga = await storage.getGlobalAssumptions();
      if (!ga) return res.status(404).json({ error: "No global assumptions found" });
      const raw = (ga.researchConfig as ResearchConfig) ?? {};
      const normalized = normalizeServerResearchConfig(raw);
      res.json(normalized);
    } catch (error) {
      logAndSendError(res, "Failed to fetch research config", error);
    }
  });

  app.post("/api/admin/ai-models/refresh", requireAdmin, async (req, res) => {
    try {
      if (isApiRateLimited(getAuthUser(req).id, "ai-models-refresh", 1)) {
        return res.status(429).json({ error: "Model refresh rate-limited to 1 per minute" });
      }
      const [openai, anthropic, google, xai, deepseek, meta] = await Promise.all([
        fetchOpenAIModels(),
        fetchAnthropicModels(),
        fetchGeminiModels(),
        fetchXaiModels(),
        fetchDeepSeekModels(),
        fetchMetaModels(),
      ]);
      const models = [...anthropic, ...openai, ...google, ...xai, ...deepseek, ...meta];

      const ga = await storage.getGlobalAssumptions();
      if (ga && models.length > 0) {
        const current: ResearchConfig = (ga.researchConfig as ResearchConfig) ?? {};
        const merged: ResearchConfig = {
          ...current,
          cachedModels: models,
          cachedModelsAt: new Date().toISOString(),
        };
        await storage.upsertGlobalAssumptions({ researchConfig: merged } as InsertGlobalAssumptions);
      }

      const existing = models.length === 0
        ? ((ga?.researchConfig as ResearchConfig)?.cachedModels ?? [])
        : models;

      res.json({
        models: existing,
        fetchedAt: new Date().toISOString(),
        liveCount: models.length,
        fromCache: models.length === 0,
      });
    } catch (error) {
      logAndSendError(res, "Failed to refresh AI models", error);
    }
  });

  app.put("/api/admin/research-config", requireAdmin, async (req, res) => {
    try {
      const parsed = researchConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid research config", details: parsed.error.flatten() });
      }

      const ga = await storage.getGlobalAssumptions();
      if (!ga) return res.status(404).json({ error: "No global assumptions found" });

      const incoming = parsed.data;
      const current: ResearchConfig = (ga.researchConfig as ResearchConfig) ?? {};

      const merged: ResearchConfig = {
        property: incoming.property !== undefined ? { ...current.property, ...incoming.property } : current.property,
        company:  incoming.company  !== undefined ? { ...current.company,  ...incoming.company  } : current.company,
        global:   incoming.global   !== undefined ? { ...current.global,   ...incoming.global   } : current.global,
        preferredLlm: incoming.preferredLlm ?? current.preferredLlm,
        llmMode: incoming.llmMode ?? current.llmMode,
        llmVendor: incoming.llmVendor ?? current.llmVendor,
        primaryLlm: incoming.primaryLlm ?? current.primaryLlm,
        secondaryLlm: incoming.secondaryLlm ?? current.secondaryLlm,
        customSources: incoming.customSources ?? current.customSources,
        cachedModels: incoming.cachedModels ?? current.cachedModels,
        cachedModelsAt: incoming.cachedModelsAt ?? current.cachedModelsAt,
        companyLlm: incoming.companyLlm ? { ...current.companyLlm, ...incoming.companyLlm } : current.companyLlm,
        propertyLlm: incoming.propertyLlm ? { ...current.propertyLlm, ...incoming.propertyLlm } : current.propertyLlm,
        marketLlm: incoming.marketLlm ? { ...current.marketLlm, ...incoming.marketLlm } : current.marketLlm,
        reportLlm: incoming.reportLlm ? { ...current.reportLlm, ...incoming.reportLlm } : current.reportLlm,
        chatbotLlm: incoming.chatbotLlm ? { ...current.chatbotLlm, ...incoming.chatbotLlm } : current.chatbotLlm,
        premiumExportLlm: incoming.premiumExportLlm ? { ...current.premiumExportLlm, ...incoming.premiumExportLlm } : current.premiumExportLlm,
        aiUtilityLlm: incoming.aiUtilityLlm ? { ...current.aiUtilityLlm, ...incoming.aiUtilityLlm } : current.aiUtilityLlm,
        graphicsLlm: incoming.graphicsLlm ? { ...current.graphicsLlm, ...incoming.graphicsLlm } : current.graphicsLlm,
        tabDefaults: incoming.tabDefaults ? { ...current.tabDefaults, ...incoming.tabDefaults } : current.tabDefaults,
        companySources: incoming.companySources ?? current.companySources,
        propertySources: incoming.propertySources ?? current.propertySources,
        marketSources: incoming.marketSources ?? current.marketSources,
        sourceFiles: incoming.sourceFiles ?? current.sourceFiles,
      };

      await storage.upsertGlobalAssumptions({ researchConfig: merged } as InsertGlobalAssumptions);
      logActivity(req, "update-research-config", "research", null, null, { events: Object.keys(incoming).filter(k => k !== "cachedModels" && k !== "cachedModelsAt") });
      res.json(merged);
    } catch (error) {
      logAndSendError(res, "Failed to update research config", error);
    }
  });
}
