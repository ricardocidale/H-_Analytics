/**
 * GET /api/llm-providers
 *
 * Returns the list of LLM providers and their available models, sourced from
 * admin_resources rows of kind='model'. The response drives the provider +
 * model dropdowns in the Rebecca configuration panel.
 *
 * Vendor → provider-id mapping (DB vendor field is the SDK vendor name; the
 * provider-id is the identifier used by the Rebecca chat route dispatcher):
 *   google    → gemini
 *   anthropic → anthropic
 *   openai    → openai
 *
 * Only rows with a recognised vendor in config.vendor are included. Unknown
 * vendor rows are silently skipped so the registry can hold non-chat models
 * (image gen, embedding, etc.) without polluting the Rebecca dropdown.
 */
import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { logAndSendError } from "./helpers";

const VENDOR_MAP: Record<string, { id: string; label: string }> = {
  anthropic: { id: "anthropic", label: "Anthropic" },
  openai:    { id: "openai",    label: "OpenAI" },
  google:    { id: "gemini",    label: "Gemini" },
};

export interface LlmProviderModel {
  value: string;
  label: string;
}

export interface LlmProvider {
  id: string;
  label: string;
  models: LlmProviderModel[];
}

export interface ChatSearchProvider {
  slug: string;
  label: string;
}

export function register(app: Express): void {
  /**
   * GET /api/llm-providers
   * LLM providers (kind='model') grouped by vendor, for the Rebecca
   * provider + model dropdowns.
   */
  app.get("/api/llm-providers", requireAuth, async (_req, res) => {
    try {
      const modelRows = await storage.listAdminResources("model");

      const byProvider = new Map<string, { label: string; models: LlmProviderModel[] }>();

      for (const row of modelRows) {
        const vendor = (row.config as Record<string, unknown>).vendor as string | undefined;
        const modelId = (row.config as Record<string, unknown>).modelId as string | undefined;
        if (!vendor || !modelId) continue;

        const mapping = VENDOR_MAP[vendor];
        if (!mapping) continue;

        if (!byProvider.has(mapping.id)) {
          byProvider.set(mapping.id, { label: mapping.label, models: [] });
        }
        byProvider.get(mapping.id)!.models.push({
          value: modelId,
          label: row.displayName,
        });
      }

      const providers: LlmProvider[] = Array.from(byProvider.entries()).map(
        ([id, { label, models }]) => ({ id, label, models }),
      );

      res.json({ providers });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch LLM providers", error, "LLMP-001");
    }
  });

  /**
   * GET /api/chat-search-providers
   * API resources marked config.rebeccaSearchProvider=true — these are the
   * selectable web-search backends for Rebecca's grounded research. Currently
   * only Perplexity is seeded; additional rows can be added via admin_resources
   * without a code deploy.
   */
  app.get("/api/chat-search-providers", requireAuth, async (_req, res) => {
    try {
      const apiRows = await storage.listAdminResources("api");
      const searchProviders: ChatSearchProvider[] = apiRows
        .filter(r => (r.config as Record<string, unknown>).rebeccaSearchProvider === true)
        .map(r => ({ slug: r.slug, label: r.displayName }));
      res.json({ providers: searchProviders });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch chat search providers", error, "LLMP-002");
    }
  });
}
