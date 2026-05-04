/**
 * DB-driven LLM configuration resolver.
 *
 * Reads `admin_resources` at runtime so admins can change which model serves
 * each usage slot without a code deploy. The directive: no LLM hardcoded in
 * the codebase — every call site must go through this resolver or the
 * specialist-llm-resolver (for specialist-context calls).
 *
 * Resolution:
 *   1. `admin_resources` row where kind="llm_slot" and slug=<slot>
 *      → config.modelSlug
 *   2. `admin_resources` row where kind="model" and slug=config.modelSlug
 *      → config.vendor, config.modelId
 *
 * No hardcoded fallback — if a slot row or model row is missing, this throws.
 * The seed migration (admin-resources-005) guarantees all slots are populated
 * before the server accepts requests.
 */
import { storage } from "../storage";

export interface ResolvedLlm {
  vendor: string;
  modelId: string;
  modelSlug: string;
}

export async function resolveLlmFor(slot: string): Promise<ResolvedLlm> {
  const slotRow = await storage.getAdminResourceBySlug?.("llm_slot", slot);
  if (!slotRow) {
    throw new Error(`LLM slot not configured in admin_resources: "${slot}"`);
  }

  const modelSlug = slotRow.config?.modelSlug as string | undefined;
  if (!modelSlug) {
    throw new Error(`LLM slot "${slot}" is missing config.modelSlug`);
  }

  const modelRow = await storage.getAdminResourceBySlug?.("model", modelSlug);
  if (!modelRow) {
    throw new Error(`LLM model row not found in admin_resources: "${modelSlug}" (referenced by slot "${slot}")`);
  }

  const vendor = modelRow.config?.vendor as string | undefined;
  const modelId = modelRow.config?.modelId as string | undefined;
  if (!vendor || !modelId) {
    throw new Error(`Model row "${modelSlug}" is missing config.vendor or config.modelId`);
  }

  return { vendor, modelId, modelSlug };
}
