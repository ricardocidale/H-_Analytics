import { getOpenAIClient, getAnthropicClient, getGeminiClient } from "./clients";
import { fetchWithTimeout } from "../lib/fetch-with-timeout";
import { log } from "../logger";
import type { AiModelEntry, LlmVendor } from "@shared/schema";

export type ModelStatus = "available" | "deprecated" | "error" | "no_key";

export interface ProbedModel {
  vendor: LlmVendor;
  modelId: string;
  label: string;
  status: ModelStatus;
  latencyMs: number | null;
  capabilities: string[];
  errorMessage?: string;
  probedAt: string;
}

export interface ProbeResult {
  models: ProbedModel[];
  vendorStatuses: VendorProbeStatus[];
  probedAt: string;
  durationMs: number;
}

export interface VendorProbeStatus {
  vendor: LlmVendor;
  available: boolean;
  modelCount: number;
  avgLatencyMs: number | null;
  error?: string;
}

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
    openai: "OpenAI", anthropic: "Anthropic", google: "Google",
    xai: "xAI", deepseek: "DeepSeek", meta: "Meta",
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

function inferCapabilities(id: string, _vendor: string): string[] {
  const caps: string[] = ["chat"];

  if (/opus|sonnet-4|gpt-5|gpt-4\.1|o\d|2\.5-pro|2\.5-flash/i.test(id)) caps.push("reasoning");
  if (/opus|sonnet-4|gpt-5|gpt-4\.1|2\.5-pro/i.test(id)) caps.push("deep-research");
  if (/flash|haiku|mini|gpt-4\.1-mini|gpt-4\.1-nano/i.test(id)) caps.push("fast");
  if (/opus|sonnet|gpt-5|gpt-4\.1$|2\.5-pro/i.test(id)) caps.push("synthesis");

  return caps;
}

const OPENAI_KNOWN_MODELS = [
  "gpt-5", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini",
  "o3", "o3-mini", "o4-mini",
];
const ANTHROPIC_KNOWN_MODELS = [
  "claude-sonnet-4-6", "claude-sonnet-4-5", "claude-opus-4", "claude-haiku-3-5",
];
const GEMINI_KNOWN_MODELS = [
  "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash",
];

function makeKnownModels(vendor: LlmVendor, ids: string[], latency: number): ProbedModel[] {
  return ids.map(id => ({
    vendor,
    modelId: id,
    label: formatLabel(id, vendor === "google" ? "google" : vendor),
    status: "available" as ModelStatus,
    latencyMs: latency,
    capabilities: inferCapabilities(id, vendor),
    probedAt: new Date().toISOString(),
  }));
}

async function probeOpenAI(): Promise<ProbedModel[]> {
  try {
    const client = getOpenAIClient();
    const start = Date.now();
    try {
      const list = await client.models.list();
      const baseLatency = Date.now() - start;
      const models: ProbedModel[] = [];
      for await (const m of list) {
        if (shouldInclude(m.id, "openai")) {
          models.push({
            vendor: "openai",
            modelId: m.id,
            label: formatLabel(m.id, "openai"),
            status: "available",
            latencyMs: baseLatency,
            capabilities: inferCapabilities(m.id, "openai"),
            probedAt: new Date().toISOString(),
          });
        }
      }
      if (models.length > 0) return models;
    } catch (listErr: unknown) {
      const msg = listErr instanceof Error ? listErr.message : String(listErr);
      if (msg.includes("405") || msg.includes("Method Not Allowed")) {
        log("OpenAI models.list not supported (proxy), using known models", "llm-probe");
      } else {
        throw listErr;
      }
    }
    const latency = Date.now() - start;
    return makeKnownModels("openai", OPENAI_KNOWN_MODELS, latency);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("API key")) return [{ vendor: "openai", modelId: "_vendor_", label: "OpenAI", status: "no_key", latencyMs: null, capabilities: [], errorMessage: msg, probedAt: new Date().toISOString() }];
    log(`OpenAI probe failed: ${msg}`, "llm-probe", "warn");
    return [];
  }
}

async function probeAnthropic(): Promise<ProbedModel[]> {
  try {
    const client = getAnthropicClient();
    const start = Date.now();
    try {
      const resp = await client.models.list({ limit: 100 });
      const baseLatency = Date.now() - start;
      const models: ProbedModel[] = [];
      for (const m of resp.data) {
        if (shouldInclude(m.id, "anthropic")) {
          models.push({
            vendor: "anthropic",
            modelId: m.id,
            label: formatLabel(m.id, "anthropic"),
            status: "available",
            latencyMs: baseLatency,
            capabilities: inferCapabilities(m.id, "anthropic"),
            probedAt: new Date().toISOString(),
          });
        }
      }
      if (models.length > 0) return models;
    } catch (listErr: unknown) {
      const msg = listErr instanceof Error ? listErr.message : String(listErr);
      if (msg.includes("405") || msg.includes("Method Not Allowed")) {
        log("Anthropic models.list not supported (proxy), using known models", "llm-probe");
      } else {
        throw listErr;
      }
    }
    const latency = Date.now() - start;
    return makeKnownModels("anthropic", ANTHROPIC_KNOWN_MODELS, latency);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("API key")) return [{ vendor: "anthropic", modelId: "_vendor_", label: "Anthropic", status: "no_key", latencyMs: null, capabilities: [], errorMessage: msg, probedAt: new Date().toISOString() }];
    log(`Anthropic probe failed: ${msg}`, "llm-probe", "warn");
    return [];
  }
}

async function probeGemini(): Promise<ProbedModel[]> {
  try {
    const client = getGeminiClient();
    const start = Date.now();
    try {
      const pager = await client.models.list();
      const baseLatency = Date.now() - start;
      const models: ProbedModel[] = [];
      for await (const m of pager) {
        const id = ((m as { name?: string }).name ?? "").replace("models/", "");
        if (shouldInclude(id, "google")) {
          models.push({
            vendor: "google",
            modelId: id,
            label: formatLabel(id, "google"),
            status: "available",
            latencyMs: baseLatency,
            capabilities: inferCapabilities(id, "google"),
            probedAt: new Date().toISOString(),
          });
        }
      }
      if (models.length > 0) return models;
    } catch (listErr: unknown) {
      const msg = listErr instanceof Error ? listErr.message : String(listErr);
      if (msg.includes("405") || msg.includes("Method Not Allowed")) {
        log("Gemini models.list not supported (proxy), using known models", "llm-probe");
      } else {
        throw listErr;
      }
    }
    const latency = Date.now() - start;
    return makeKnownModels("google", GEMINI_KNOWN_MODELS, latency);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("API key")) return [{ vendor: "google", modelId: "_vendor_", label: "Google", status: "no_key", latencyMs: null, capabilities: [], errorMessage: msg, probedAt: new Date().toISOString() }];
    log(`Gemini probe failed: ${msg}`, "llm-probe", "warn");
    return [];
  }
}

async function probeXai(): Promise<ProbedModel[]> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return [{ vendor: "xai", modelId: "_vendor_", label: "xAI", status: "no_key", latencyMs: null, capabilities: [], probedAt: new Date().toISOString() }];
  try {
    const start = Date.now();
    const res = await fetchWithTimeout("https://api.x.ai/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } }, 10_000);
    const latency = Date.now() - start;
    if (!res.ok) throw new Error(`xAI returned ${res.status}`);
    const body = await res.json() as { data: { id: string }[] };
    return body.data
      .filter(m => shouldInclude(m.id, "xai"))
      .map(m => ({
        vendor: "xai" as LlmVendor,
        modelId: m.id,
        label: formatLabel(m.id, "xai"),
        status: "available" as ModelStatus,
        latencyMs: latency,
        capabilities: inferCapabilities(m.id, "xai"),
        probedAt: new Date().toISOString(),
      }));
  } catch (e: unknown) {
    log(`xAI probe failed: ${e instanceof Error ? e.message : String(e)}`, "llm-probe", "warn");
    return [];
  }
}

async function probeDeepSeek(): Promise<ProbedModel[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return [{ vendor: "deepseek", modelId: "_vendor_", label: "DeepSeek", status: "no_key", latencyMs: null, capabilities: [], probedAt: new Date().toISOString() }];
  try {
    const start = Date.now();
    const res = await fetchWithTimeout("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${apiKey}` } }, 10_000);
    const latency = Date.now() - start;
    if (!res.ok) throw new Error(`DeepSeek returned ${res.status}`);
    const body = await res.json() as { data: { id: string }[] };
    return body.data
      .filter(m => shouldInclude(m.id, "deepseek"))
      .map(m => ({
        vendor: "deepseek" as LlmVendor,
        modelId: m.id,
        label: formatLabel(m.id, "deepseek"),
        status: "available" as ModelStatus,
        latencyMs: latency,
        capabilities: inferCapabilities(m.id, "deepseek"),
        probedAt: new Date().toISOString(),
      }));
  } catch (e: unknown) {
    log(`DeepSeek probe failed: ${e instanceof Error ? e.message : String(e)}`, "llm-probe", "warn");
    return [];
  }
}

export async function probeAllVendors(): Promise<ProbeResult> {
  const start = Date.now();

  const [openai, anthropic, gemini, xai, deepseek] = await Promise.all([
    probeOpenAI(),
    probeAnthropic(),
    probeGemini(),
    probeXai(),
    probeDeepSeek(),
  ]);

  const allModels = [...openai, ...anthropic, ...gemini, ...xai, ...deepseek]
    .filter(m => m.modelId !== "_vendor_");

  const vendorEntries: [LlmVendor, ProbedModel[]][] = [
    ["openai", openai],
    ["anthropic", anthropic],
    ["google", gemini],
    ["xai", xai],
    ["deepseek", deepseek],
  ];

  const vendorStatuses: VendorProbeStatus[] = vendorEntries.map(([vendor, models]) => {
    const realModels = models.filter(m => m.modelId !== "_vendor_");
    const noKey = models.some(m => m.status === "no_key");
    const available = realModels.length > 0;
    const latencies = realModels.map(m => m.latencyMs).filter((l): l is number => l !== null);
    return {
      vendor,
      available: available && !noKey,
      modelCount: realModels.length,
      avgLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
      error: noKey ? "API key not configured" : undefined,
    };
  });

  const durationMs = Date.now() - start;

  log(`Probe complete: ${allModels.length} models across ${vendorStatuses.filter(v => v.available).length} vendors (${durationMs}ms)`, "llm-probe");

  return {
    models: allModels,
    vendorStatuses,
    probedAt: new Date().toISOString(),
    durationMs,
  };
}

export function probedModelsToAiModelEntries(probed: ProbedModel[]): AiModelEntry[] {
  return probed
    .filter(m => m.status === "available")
    .map(m => ({
      id: m.modelId,
      label: m.label,
      provider: m.vendor,
    }));
}
