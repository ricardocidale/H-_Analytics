/**
 * factory-v2-llm-resolver.ts — Async LLM model resolver for Factory v2 pipelines.
 *
 * Wraps resolveLlmFor() from the shared LLM config resolver so slide-pipeline
 * consumers don't import it directly. The slot rows are seeded at boot by the
 * admin-resources-011 migration guard.
 */
import { resolveLlmFor } from "../ai/llm-config-resolver";
import { FACTORY_V2_LORENZO_VISION_LLM_SLOT } from "./factory-v2-constants";

/**
 * Returns the current modelId for the Lorenzo / Lucca vision pipeline by
 * reading the factory-v2-lorenzo-vision llm_slot row from admin_resources.
 *
 * Throws if the slot row or its referenced model row is missing — fail-closed
 * is the correct behavior; the boot-time seed guarantees the row exists.
 */
export async function resolveLorenzoVisionModelId(): Promise<string> {
  const { modelId } = await resolveLlmFor(FACTORY_V2_LORENZO_VISION_LLM_SLOT);
  return modelId;
}
