import { BaseIntegrationService, type IntegrationHealth } from "./base";
import { logger } from "../logger";
import fs from "node:fs";
import path from "node:path";

export interface ReplicateModelConfig {
  model: string;
  promptPrefix: string;
  promptSuffix: string;
  params: Record<string, unknown>;
  isImg2Img?: boolean;
  requiresSourceImage?: boolean;
  promptOptional?: boolean;
  denoisingStrength?: {
    min: number;
    max: number;
    default: number;
  };
}

export type ReplicateStyleKey =
  | "architectural-exterior"
  | "interior-design"
  | "renovation-concept"
  | "photo-upscale"
  | "virtual-staging"
  | "background-remove"
  | "photo-to-render";

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string;
  urls?: {
    get: string;
    cancel: string;
  };
}

let modelConfigCache: Record<string, ReplicateModelConfig> | null = null;

function loadModelConfig(): Record<string, ReplicateModelConfig> {
  if (modelConfigCache) return modelConfigCache;
  const configPath = path.join(process.cwd(), "server/replicate-models.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  modelConfigCache = JSON.parse(raw);
  return modelConfigCache!;
}

export function getAvailableStyles(): Array<{ key: string; label: string }> {
  const config = loadModelConfig();
  return Object.keys(config).map((key) => ({
    key,
    label: key
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
  }));
}

export async function getAvailableStylesFromDb(): Promise<Array<{ key: string; label: string; enabled: boolean }>> {
  try {
    const { storage } = await import("../storage");
    const dbSettings = await storage.getAllRenderSettings();
    if (dbSettings.length > 0) {
      return dbSettings.map((s) => ({ key: s.styleKey, label: s.label, enabled: s.isEnabled }));
    }
  } catch {
    // fall through
  }
  return getAvailableStyles().map((s) => ({ ...s, enabled: true }));
}

export function getModelConfig(style: string): ReplicateModelConfig | undefined {
  const config = loadModelConfig();
  return config[style];
}

export async function getModelConfigFromDb(style: string): Promise<ReplicateModelConfig | undefined> {
  try {
    const { storage } = await import("../storage");
    const dbSetting = await storage.getRenderSetting(style);
    if (dbSetting) {
      return {
        model: dbSetting.model,
        promptPrefix: dbSetting.promptPrefix,
        promptSuffix: dbSetting.promptSuffix,
        params: dbSetting.params,
        isImg2Img: dbSetting.isImg2Img,
        requiresSourceImage: dbSetting.requiresSourceImage,
        promptOptional: dbSetting.promptOptional,
      };
    }
  } catch {
    // fall through to JSON
  }
  return getModelConfig(style);
}

export async function isStyleEnabled(style: string): Promise<boolean> {
  try {
    const { storage } = await import("../storage");
    const dbSetting = await storage.getRenderSetting(style);
    if (dbSetting) return dbSetting.isEnabled;
  } catch {
    // fall through
  }
  return true;
}

export async function getAdminRateLimit(): Promise<number> {
  try {
    const { storage } = await import("../storage");
    const settings = await storage.getAllRenderSettings();
    if (settings.length > 0) {
      const limits = settings.map(s => s.rateLimitPerMinute);
      return Math.min(...limits);
    }
  } catch {
    // fall through
  }
  return 5;
}

export async function isAutoEnhanceEnabled(): Promise<boolean> {
  try {
    const { storage } = await import("../storage");
    const settings = await storage.getAllRenderSettings();
    if (settings.length > 0) {
      return settings.every(s => s.autoEnhanceEnabled);
    }
  } catch {
    // fall through
  }
  return true;
}

export async function getDefaultImageSize(): Promise<string> {
  try {
    const { storage } = await import("../storage");
    const settings = await storage.getAllRenderSettings();
    if (settings.length > 0 && settings[0].defaultImageSize) {
      return settings[0].defaultImageSize;
    }
  } catch {
    // fall through
  }
  return "1024x1024";
}

export async function getDefaultQuality(): Promise<number> {
  try {
    const { storage } = await import("../storage");
    const settings = await storage.getAllRenderSettings();
    if (settings.length > 0 && settings[0].defaultQuality) {
      return settings[0].defaultQuality;
    }
  } catch {
    // fall through
  }
  return 90;
}

const POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 120_000;

export class ReplicateService extends BaseIntegrationService {
  readonly serviceName = "replicate";

  private get apiToken(): string {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) throw new Error("REPLICATE_API_TOKEN not configured");
    return token;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    };
  }

  async healthCheck(): Promise<IntegrationHealth> {
    const start = Date.now();
    try {
      const res = await fetch("https://api.replicate.com/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiToken}` },
      });
      return {
        name: this.serviceName,
        healthy: res.ok,
        latencyMs: Date.now() - start,
        circuitState: this.getCircuitState(),
      };
    } catch (error: unknown) {
      return {
        name: this.serviceName,
        healthy: false,
        latencyMs: Date.now() - start,
        lastError: error instanceof Error ? error.message : String(error),
        circuitState: this.getCircuitState(),
      };
    }
  }

  async createPrediction(
    modelVersion: string,
    input: Record<string, unknown>
  ): Promise<ReplicatePrediction> {
    return this.execute("createPrediction", async () => {
      const [owner_model, version] = modelVersion.split(":");
      const body: Record<string, unknown> = { input };

      if (version) {
        body.version = version;
      }

      const endpoint = version
        ? "https://api.replicate.com/v1/predictions"
        : `https://api.replicate.com/v1/models/${owner_model}/predictions`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Replicate prediction failed (${res.status}): ${errBody}`);
      }

      return (await res.json()) as ReplicatePrediction;
    });
  }

  async getPrediction(id: string): Promise<ReplicatePrediction> {
    return this.execute("getPrediction", async () => {
      const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiToken}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to get prediction ${id}: ${res.status}`);
      }

      return (await res.json()) as ReplicatePrediction;
    });
  }

  async waitForPrediction(
    id: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    onStatus?: (status: string) => void
  ): Promise<ReplicatePrediction> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const prediction = await this.getPrediction(id);

      if (onStatus) {
        onStatus(prediction.status);
      }

      if (prediction.status === "succeeded") {
        return prediction;
      }

      if (prediction.status === "failed" || prediction.status === "canceled") {
        throw new Error(
          `Prediction ${id} ${prediction.status}: ${prediction.error || "Unknown error"}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error(`Prediction ${id} timed out after ${timeoutMs}ms`);
  }

  async generateImage(
    style: ReplicateStyleKey,
    userPrompt: string,
    sourceImageUrl?: string
  ): Promise<Buffer> {
    const modelConfig = await getModelConfigFromDb(style) ?? getModelConfig(style);
    if (!modelConfig) {
      throw new Error(`Unknown Replicate style: ${style}`);
    }

    if (modelConfig.requiresSourceImage && !sourceImageUrl) {
      throw new Error(`Style "${style}" requires a source image`);
    }

    const promptParts = [modelConfig.promptPrefix, userPrompt, modelConfig.promptSuffix].filter(Boolean);
    const fullPrompt = promptParts.join(", ");

    const input: Record<string, unknown> = { ...modelConfig.params };

    if (fullPrompt) {
      input.prompt = fullPrompt;
    }

    if (modelConfig.isImg2Img && sourceImageUrl) {
      input.image = sourceImageUrl;
      if (modelConfig.denoisingStrength) {
        input.prompt_strength = modelConfig.denoisingStrength.default;
      }
    }

    logger.info(`Replicate: creating prediction for style=${style} model=${modelConfig.model.split(":")[0]}`, "integration");

    const prediction = await this.createPrediction(modelConfig.model, input);

    logger.info(`Replicate: prediction ${prediction.id} created, polling...`, "integration");

    const result = await this.waitForPrediction(prediction.id);

    const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
    if (!outputUrl) {
      throw new Error("No output URL in Replicate prediction result");
    }

    const imageBuffer = await this.execute("downloadOutput", async () => {
      const imageRes = await fetch(outputUrl);
      if (!imageRes.ok) {
        throw new Error(`Failed to download Replicate output image: ${imageRes.status}`);
      }
      return Buffer.from(await imageRes.arrayBuffer());
    });

    return imageBuffer;
  }
}

export const replicateService = new ReplicateService();
