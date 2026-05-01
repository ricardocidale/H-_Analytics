/**
 * server/ai/icp/orchestrator.ts — Phase 3: full ICP generation pipeline.
 *
 * Combines portfolio analysis, deterministic config building, and the
 * (optional) LLM call that fleshes out the qualitative descriptive sections.
 * If the LLM call is omitted or fails, falls back to the deterministic
 * descriptive builder so callers always get a complete result.
 */

import type { GlobalAssumptions, Property } from "@shared/schema";
import type {
  GeneratedIcpDescriptive,
  IcpGenerateOptions,
  IcpGenerationResult,
} from "@shared/icp-types";
import { logger } from "../../logger";
import { analyzePortfolio } from "./portfolio-analysis";
import { buildIcpConfigFromPortfolio } from "./config-builder";
import { buildIcpGenerationPrompt } from "./prompt";
import { buildFallbackDescriptive } from "./fallback-descriptive";

/**
 * Generate the complete ICP from portfolio + global assumptions + optional AI.
 * This is the main entry point.
 */
export async function generateIcp(
  properties: Property[],
  ga: GlobalAssumptions | null,
  options: IcpGenerateOptions = {},
): Promise<IcpGenerationResult> {
  const startTime = Date.now();

  // Phase 1: Portfolio analysis (deterministic)
  const analysis = analyzePortfolio(properties);
  logger.info(`ICP: Portfolio analysis complete — ${analysis.propertyCount} properties`, "icp");

  // Phase 2: Build numeric config from portfolio
  const { config, fieldsFromPortfolio, fieldsFromDefaults } = buildIcpConfigFromPortfolio(analysis, ga);
  logger.info(`ICP: Config built — ${fieldsFromPortfolio} from portfolio, ${fieldsFromDefaults} from defaults`, "icp");

  // Phase 3: AI-generated qualitative sections (optional)
  let descriptive: GeneratedIcpDescriptive;
  let fieldsFromAi = 0;
  let source: "portfolio" | "portfolio+ai" = "portfolio";

  if (options.llmCallback && analysis.propertyCount > 0) {
    try {
      const prompt = buildIcpGenerationPrompt(analysis, ga, config);
      const rawResponse = await options.llmCallback(prompt);

      // Extract JSON from response
      const jsonMatch = rawResponse.match(/```json\s*([\s\S]*?)```/) || rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]) as Record<string, unknown>;
        const fallback = buildFallbackDescriptive(analysis, ga);
        descriptive = {
          propertyTypes: (parsed.propertyTypes as string) || fallback.propertyTypes,
          fbLevel: (parsed.fbLevel as string) || fallback.fbLevel,
          locationCharacteristics: (parsed.locationCharacteristics as string) || fallback.locationCharacteristics,
          locationDetails: (parsed.locationDetails as string) || fallback.locationDetails,
          conditionNotes: (parsed.conditionNotes as string) || "Good to excellent structural condition. Cosmetic renovation acceptable.",
          groundsTopography: (parsed.groundsTopography as string) || "Gentle terrain, mature landscaping, privacy from public roads.",
          vendorServices: (parsed.vendorServices as string) || "IT, housekeeping, grounds, professional services, F&B purveyors.",
          regulatoryNotes: (parsed.regulatoryNotes as string) || "Must have clear zoning path for hospitality/commercial use.",
          exclusions: (parsed.exclusions as string) || "Urban high-rises, chain hotels, properties above 50 rooms.",
          additionalContext: "",
        };
        // Store the essay separately — it goes into icpConfig._definition
        if (parsed.icpEssay) {
          (descriptive as unknown as Record<string, unknown>)._icpEssay = parsed.icpEssay;
        }
        fieldsFromAi = Object.keys(parsed).length;
        source = "portfolio+ai";
        logger.info(`ICP: AI enhancement complete — ${fieldsFromAi} sections generated`, "icp");
      } else {
        throw new Error("No JSON found in LLM response");
      }
    } catch (err: unknown) {
      logger.warn(`ICP: AI enhancement failed, using portfolio-only fallbacks — ${err instanceof Error ? err.message : err}`, "icp");
      descriptive = buildFallbackDescriptive(analysis, ga);
    }
  } else {
    descriptive = buildFallbackDescriptive(analysis, ga);
  }

  const elapsed = Date.now() - startTime;
  logger.info(`ICP: Generation complete in ${elapsed}ms (source: ${source})`, "icp");

  return {
    config,
    descriptive,
    portfolioAnalysis: analysis,
    generatedAt: new Date().toISOString(),
    source,
    fieldsFromPortfolio,
    fieldsFromDefaults,
    fieldsFromAi,
  };
}
