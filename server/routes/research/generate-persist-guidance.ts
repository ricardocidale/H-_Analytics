import type { Request } from "express";
import { storage } from "../../storage";
import { getAuthUser } from "../../auth";
import { extractGuidance } from "../../ai/guidance/extractor";
import { indexAssumptionGuidance } from "../../ai/vector-store-service";
import { logger } from "../../logger";
import type { GlobalAssumptions } from "@shared/schema";
import type { ResearchParams } from "../../ai/research-prompt-builders";

export interface PropertyGuidanceInput {
  req: Request;
  propertyId: number;
  parsed: Record<string, unknown>;
  fullContent: string;
  params: ResearchParams;
  model: string;
  secondaryModel: string | undefined;
  startTime: number;
  earlyRunId: number | undefined;
}

export interface PropertyGuidanceResult {
  earlyRunFinalized: boolean;
}

/**
 * Extract property guidance records from the parsed research output, write
 * them to the assumption store, fan-out into the vector index, and either
 * finalize the existing early `research_runs` row or create a fresh one.
 */
export async function persistPropertyGuidance(
  input: PropertyGuidanceInput,
): Promise<PropertyGuidanceResult> {
  const {
    req,
    propertyId,
    parsed,
    fullContent,
    params,
    model,
    secondaryModel,
    startTime,
    earlyRunId,
  } = input;

  let earlyRunFinalized = false;
  try {
    const guidanceResult = extractGuidance(parsed, 1, "property");
    if (guidanceResult.records.length > 0) {
      const property = await storage.getProperty(propertyId);
      if (property) {
        let runId: number;
        if (earlyRunId) {
          await storage.updateResearchRun(earlyRunId, {
            status: "completed",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            tokensUsed: Math.round(
              (JSON.stringify(params).length + fullContent.length) / 4,
            ),
            metadata: {
              guidanceRecords: guidanceResult.records.length,
              errors: guidanceResult.errors,
            },
          });
          runId = earlyRunId;
          earlyRunFinalized = true;
        } else {
          const runRecord = await storage.createResearchRun({
            userId: getAuthUser(req).id,
            entityType: "property",
            entityId: propertyId,
            scenarioId: null,
            tier: 1,
            status: "completed",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            modelPrimary: model,
            modelSecondary: secondaryModel ?? null,
            tokensUsed: Math.round(
              (JSON.stringify(params).length + fullContent.length) / 4,
            ),
            estimatedCost: null,
            error: null,
            metadata: {
              guidanceRecords: guidanceResult.records.length,
              errors: guidanceResult.errors,
            },
          });
          runId = runRecord.id;
        }

        const propLocation = property.location ?? "";
        const propType = property.hospitalityType ?? "boutique hotel";
        const propBusinessModel = property.businessModel ?? "hotel";
        for (const rec of guidanceResult.records) {
          await storage.upsertAssumptionGuidance({
            researchRunId: runId,
            entityType: "property",
            entityId: propertyId,
            scenarioId: null,
            assumptionKey: rec.assumptionKey,
            valueLow: rec.valueLow ?? null,
            valueMid: rec.valueMid ?? null,
            valueHigh: rec.valueHigh ?? null,
            confidence: rec.confidence,
            sourceName: rec.sourceName ?? null,
            sourceDate: rec.sourceDate ?? null,
            reasoning: rec.reasoning ?? null,
            comparableSet:
              (rec.comparableSet as Record<string, unknown>) ?? null,
          });

          // Index to Vector store for cross-property retrieval (fire-and-forget)
          indexAssumptionGuidance({
            entityType: "property",
            entityId: propertyId,
            scenarioId: null,
            location: propLocation,
            propertyType: propType,
            businessModel: propBusinessModel,
            assumptionKey: rec.assumptionKey,
            valueLow: rec.valueLow ?? null,
            valueMid: rec.valueMid ?? null,
            valueHigh: rec.valueHigh ?? null,
            confidence:
              rec.confidence === "high"
                ? 0.9
                : rec.confidence === "medium"
                  ? 0.7
                  : 0.4,
            reasoning: rec.reasoning ?? null,
          }).catch((err) =>
            logger.warn(
              `Failed to index guidance to Vector store: ${err}`,
              "research",
            ),
          );
        }

        logger.info(
          `RI v2: wrote ${guidanceResult.records.length} guidance records for property ${propertyId} (run ${runId})`,
          "research",
        );
      }
    }
    if (guidanceResult.errors.length > 0) {
      logger.warn(
        `RI v2 extraction errors: ${guidanceResult.errors.join("; ")}`,
        "research",
      );
    }
  } catch (err: unknown) {
    logger.warn(
      `RI v2 guidance extraction failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      "research",
    );
  }

  return { earlyRunFinalized };
}

export interface CompanyGuidanceInput {
  req: Request;
  ga: GlobalAssumptions;
  parsed: Record<string, unknown>;
  fullContent: string;
  params: ResearchParams;
  model: string;
  secondaryModel: string | undefined;
  startTime: number;
}

/**
 * Extract company guidance records from the parsed research output, write
 * them to the assumption store, fan-out into the vector index, and create a
 * `research_runs` row keyed to the owning user.
 */
export async function persistCompanyGuidance(
  input: CompanyGuidanceInput,
): Promise<void> {
  const {
    req,
    ga,
    parsed,
    fullContent,
    params,
    model,
    secondaryModel,
    startTime,
  } = input;

  try {
    const guidanceResult = extractGuidance(parsed, 1, "company");
    if (guidanceResult.records.length > 0) {
      const ownerUserId = getAuthUser(req).id;
      const runRecord = await storage.createResearchRun({
        userId: getAuthUser(req).id,
        entityType: "company",
        entityId: ownerUserId,
        scenarioId: null,
        tier: 1,
        status: "completed",
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        modelPrimary: model,
        modelSecondary: secondaryModel ?? null,
        tokensUsed: Math.round(
          (JSON.stringify(params).length + fullContent.length) / 4,
        ),
        estimatedCost: null,
        error: null,
        metadata: {
          guidanceRecords: guidanceResult.records.length,
          errors: guidanceResult.errors,
        },
      });

      for (const rec of guidanceResult.records) {
        await storage.upsertAssumptionGuidance({
          researchRunId: runRecord.id,
          entityType: "company",
          entityId: ownerUserId,
          scenarioId: null,
          assumptionKey: rec.assumptionKey,
          valueLow: rec.valueLow ?? null,
          valueMid: rec.valueMid ?? null,
          valueHigh: rec.valueHigh ?? null,
          confidence: rec.confidence,
          sourceName: rec.sourceName ?? null,
          sourceDate: rec.sourceDate ?? null,
          reasoning: rec.reasoning ?? null,
          comparableSet:
            (rec.comparableSet as Record<string, unknown>) ?? null,
        });

        // Index to Vector store for cross-entity retrieval (fire-and-forget)
        indexAssumptionGuidance({
          entityType: "company",
          entityId: ownerUserId,
          scenarioId: null,
          location: ga?.companyName ?? "Management Company",
          propertyType: "management company",
          assumptionKey: rec.assumptionKey,
          valueLow: rec.valueLow ?? null,
          valueMid: rec.valueMid ?? null,
          valueHigh: rec.valueHigh ?? null,
          confidence:
            rec.confidence === "high"
              ? 0.9
              : rec.confidence === "medium"
                ? 0.7
                : 0.4,
          reasoning: rec.reasoning ?? null,
        }).catch((err) =>
          logger.warn(
            `Failed to index company guidance to Vector store: ${err}`,
            "research",
          ),
        );
      }

      logger.info(
        `RI v2: wrote ${guidanceResult.records.length} guidance records for company entity (user ${ownerUserId}, run ${runRecord.id})`,
        "research",
      );
    }
    if (guidanceResult.errors.length > 0) {
      logger.warn(
        `RI v2 company extraction errors: ${guidanceResult.errors.join("; ")}`,
        "research",
      );
    }
  } catch (err: unknown) {
    logger.warn(
      `RI v2 company guidance extraction failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      "research",
    );
  }
}
